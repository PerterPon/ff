"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicHedgeGridStrategy = void 0;
const price_1 = require("../core/price");
class DynamicHedgeGridStrategy {
    exchange;
    config;
    gridOrders = [];
    gridSpacing = 0;
    isGridInitialized = false;
    constructor(config = {}) {
        this.config = {
            gridWidth: 0.01, // 默认网格宽度 1%
            gridCount: 10, // 默认 10 个网格
            totalInvestment: 1000, // 默认投资额
            pricePosition: 50, // 默认价格在网格中间
            ...config
        };
    }
    async execute(exchange, kline) {
        this.exchange = exchange;
        (0, price_1.setPrice)(kline.symbol, kline.open);
        const currentPrice = (0, price_1.getPrice)(kline.symbol);
        console.log('当前价格：', currentPrice);
        try {
            await this.checkAndCreateGrid(kline);
            // TODO: 处理网格交易逻辑
        }
        catch (error) {
            console.error('Grid strategy execution error:', error);
        }
    }
    async checkAndCreateGrid(kline) {
        if (!this.isGridInitialized) {
            this.createGrid(kline.symbol, kline.open);
            this.isGridInitialized = true;
            return;
        }
        // 检查止盈止损条件
        if (this.shouldClosePositions(kline.open)) {
            await this.closeAllPositions(kline.symbol);
            this.isGridInitialized = false; // 重置网格状态
            return;
        }
    }
    /**
     * 根据当前价格和位置计算网格上下限
     */
    calculateGridLimits(currentPrice) {
        // 计算网格总宽度
        const totalWidth = this.config.gridCount * this.config.gridWidth;
        // 根据价格位置计算上下限
        const positionRatio = this.config.pricePosition / 100;
        const widthAbove = totalWidth * (1 - positionRatio);
        const widthBelow = totalWidth * positionRatio;
        // 计算上下限
        const upperLimit = currentPrice * (1 + widthAbove);
        const lowerLimit = currentPrice * (1 - widthBelow);
        return { upperLimit, lowerLimit };
    }
    /**
     * 创建网格
     * @param symbol 交易对
     * @param currentPrice 当前价格
     */
    async createGrid(symbol, currentPrice) {
        // 1. 计算网格上下限
        const { upperLimit, lowerLimit } = this.calculateGridLimits(currentPrice);
        // 2. 计算网格间距
        const totalRange = upperLimit - lowerLimit;
        this.gridSpacing = totalRange / this.config.gridCount;
        // 3. 生成所有网格价格点
        const gridPrices = [];
        for (let i = 0; i <= this.config.gridCount; i++) {
            const price = lowerLimit + (i * this.gridSpacing);
            gridPrices.push(price);
        }
        console.log('网格所有价格点:', gridPrices);
        // 4. 根据当前价格确定买卖单的分布
        const sellGridPrices = gridPrices.filter(price => price > currentPrice);
        const buyGridPrices = gridPrices.filter(price => price < currentPrice);
        console.log('卖单价格点:', sellGridPrices);
        console.log('买单价格点:', buyGridPrices);
        // 计算初始买入金额和每个网格的 BTC 数量
        let initialBtcAmount = 0;
        let btcPerSellGrid = 0;
        let investmentPerBuyGrid = 0;
        const totalGrids = sellGridPrices.length + buyGridPrices.length;
        if (sellGridPrices.length > 0 && totalGrids > 0) {
            // 根据卖单数量占比计算需要买入的资金比例
            const investmentRatio = sellGridPrices.length / totalGrids;
            const initialInvestment = this.config.totalInvestment * investmentRatio;
            // 计算需要买入的 BTC 数量
            initialBtcAmount = Number((initialInvestment / currentPrice).toFixed(8));
            // 每个卖单分配相等的 BTC 数量
            btcPerSellGrid = Number((initialBtcAmount / sellGridPrices.length).toFixed(8));
            // 剩余资金用于买单
            const remainingInvestment = this.config.totalInvestment - initialInvestment;
            investmentPerBuyGrid = buyGridPrices.length > 0
                ? remainingInvestment / buyGridPrices.length
                : 0;
        }
        else if (buyGridPrices.length > 0) {
            // 如果只有买单，全部资金用于买单
            investmentPerBuyGrid = this.config.totalInvestment / buyGridPrices.length;
        }
        // 5. 买入初始仓位
        try {
            if (initialBtcAmount > 0) {
                await this.exchange.spotBuy(symbol, initialBtcAmount);
                console.log('买入后的实际 BTC 余额：', this.exchange.wallet.getBalance(symbol));
            }
        }
        catch (error) {
            console.error('Failed to buy initial position:', error);
            return;
        }
        // 6. 创建网格订单
        this.gridOrders = [];
        for (const price of gridPrices) {
            if (price === currentPrice) {
                continue;
            }
            const isBuy = price < currentPrice;
            const isSell = price > currentPrice;
            // 买单和卖单分别处理精度
            let amount = 0;
            if (isBuy) {
                amount = Number((investmentPerBuyGrid / price).toFixed(8));
            }
            else if (isSell) {
                amount = btcPerSellGrid;
            }
            const order = {
                price,
                isBuy,
                amount
            };
            try {
                if (isBuy) {
                    order.orderId = this.exchange.placeBuyOrder(symbol, amount, price);
                }
                else if (isSell) {
                    order.orderId = this.exchange.placeSellOrder(symbol, price, amount);
                }
                this.gridOrders.push(order);
            }
            catch (error) {
                console.error(`Failed to place ${isBuy ? 'buy' : 'sell'} order at ${price}:`, error);
            }
        }
        console.log(`Grid created with ${this.gridOrders.length} orders`);
    }
    /**
     * 检查是否需要触发止盈止损
     */
    shouldClosePositions(currentPrice) {
        if (this.config.takeProfitPrice && currentPrice >= this.config.takeProfitPrice) {
            console.log(`Take profit triggered at ${currentPrice}`);
            return true;
        }
        if (this.config.stopLossPrice && currentPrice <= this.config.stopLossPrice) {
            console.log(`Stop loss triggered at ${currentPrice}`);
            return true;
        }
        return false;
    }
    /**
     * 平掉所有网格仓位
     */
    async closeAllPositions(symbol) {
        try {
            // 1. 取消所有未成交的订单
            for (const order of this.gridOrders) {
                if (order.orderId) {
                    await this.exchange.cancelOrder(order.orderId);
                }
            }
            // 2. 获取当前持仓数量
            const btcBalance = this.exchange.wallet.getBalance(symbol);
            // 3. 如果有 BTC 余额，市价卖出
            if (btcBalance > 0) {
                await this.exchange.spotSell(symbol, btcBalance);
            }
            // 4. 清空网格订单记录
            this.gridOrders = [];
            console.log(`All positions closed for ${symbol}`);
        }
        catch (error) {
            console.error('Failed to close positions:', error);
            throw error;
        }
    }
}
exports.DynamicHedgeGridStrategy = DynamicHedgeGridStrategy;
