import { Strategy, Symbol, Kline } from '../types/main';
import { Exchange } from '../exchange/exchange';
import { getPrice } from '../core/price';

interface GridConfig {
    gridUpperLimit: number;     // 网格上限价格
    gridLowerLimit: number;     // 网格下限价格
    gridCount: number;          // 网格数量
    totalInvestment: number;    // 总投资额
    takeProfitPrice?: number;   // 止盈价格
    stopLossPrice?: number;     // 止损价格
}

interface GridOrder {
    price: number;
    isBuy: boolean;
    orderId?: string;
    amount: number;
}

export class DynamicHedgeGridStrategy implements Strategy {
    private exchange!: Exchange;
    private config: GridConfig;
    private gridOrders: GridOrder[] = [];
    private gridSpacing: number = 0;
    private isGridInitialized: boolean = false;

    constructor(config: Partial<GridConfig> = {}) {
        this.config = {
            gridUpperLimit: 0,
            gridLowerLimit: 0,
            gridCount: 10,
            totalInvestment: 1000,  // 默认投资额
            ...config
        };
    }

    async execute(exchange: Exchange, kline: Kline): Promise<void> {
        this.exchange = exchange;
        
        try {
            await this.checkAndCreateGrid(kline);

            // TODO: 处理网格交易逻辑
        } catch (error) {
            console.error('Grid strategy execution error:', error);
        }
    }

    private async checkAndCreateGrid(kline: Kline): Promise<void> {
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
     * 创建网格
     * @param symbol 交易对
     * @param currentPrice 当前价格
     */
    private async createGrid(symbol: Symbol, currentPrice: number): Promise<void> {
        // 1. 计算网格间距
        const totalRange = this.config.gridUpperLimit - this.config.gridLowerLimit;
        this.gridSpacing = totalRange / this.config.gridCount;

        // 2. 生成所有网格价格点
        const gridPrices: number[] = [];
        for (let i = 0; i <= this.config.gridCount; i++) {
            const price = this.config.gridLowerLimit + (i * this.gridSpacing);
            gridPrices.push(price);
        }

        console.log('网格所有价格点:', gridPrices);
        console.log('当前价格:', currentPrice);

        // 3. 计算每个网格的投资额和数量
        const sellGridPrices = gridPrices.filter(price => 
            price > currentPrice && Math.abs(price - currentPrice) >= this.gridSpacing * 0.1
        );
        const buyGridPrices = gridPrices.filter(price => 
            price < currentPrice && Math.abs(price - currentPrice) >= this.gridSpacing * 0.1
        );

        // 一半资金用于买入开仓
        const initialInvestment = this.config.totalInvestment / 2;
        // 使用 toFixed(8) 来控制 BTC 数量的精度
        const initialBtcAmount = Number((initialInvestment / currentPrice).toFixed(8));
        
        // 每个卖单的 BTC 数量，同样控制精度
        const btcPerSellGrid = Number((initialBtcAmount / sellGridPrices.length).toFixed(8));
        
        // 一半资金用于买单
        const remainingInvestment = this.config.totalInvestment / 2;
        const investmentPerBuyGrid = remainingInvestment / buyGridPrices.length;

        // 4. 买入初始仓位
        try {
            if (initialBtcAmount > 0) {
                await this.exchange.spotBuy(symbol, initialBtcAmount);
                console.log('买入后的实际 BTC 余额：', this.exchange.wallet.getBalance(symbol));
            }
        } catch (error) {
            console.error('Failed to buy initial position:', error);
            return;
        }

        
        // 5. 创建网格订单
        this.gridOrders = [];
        for (const price of gridPrices) {
            // 跳过当前价格附近的网格线
            if (Math.abs(price - currentPrice) < this.gridSpacing * 0.1) continue;

            const isBuy = price < currentPrice;
            // 买单和卖单分别处理精度
            const amount = isBuy 
                ? Number((investmentPerBuyGrid / price).toFixed(8))
                : btcPerSellGrid;
            
            const order: GridOrder = {
                price,
                isBuy,
                amount
            };

            try {
                if (isBuy) {
                    order.orderId = this.exchange.placeBuyOrder(
                        symbol,
                        amount,
                        price
                    );
                } else {
                    order.orderId = this.exchange.placeSellOrder(
                        symbol,
                        price,
                        amount
                    );
                }
                this.gridOrders.push(order);
            } catch (error) {
                console.error(`Failed to place ${isBuy ? 'buy' : 'sell'} order at ${price}:`, error);
            }
        }

        console.log(`Grid created with ${this.gridOrders.length} orders`);
    }

    /**
     * 检查是否需要触发止盈止损
     */
    private shouldClosePositions(currentPrice: number): boolean {
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
    private async closeAllPositions(symbol: Symbol): Promise<void> {
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
        } catch (error) {
            console.error('Failed to close positions:', error);
            throw error;
        }
    }
}
