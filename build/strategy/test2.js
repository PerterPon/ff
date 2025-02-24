"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicHedgeGridStrategy = void 0;
const price_1 = require("../core/price");
/**
 * 动态对冲网格策略
 */
class DynamicHedgeGridStrategy {
    exchange; // 使用 ! 表示会在 execute 中初始化
    config;
    basePrice;
    gridOrders;
    lastRebalanceTime;
    initialTotalValue;
    dropBasePrice;
    dropBuyAmount;
    pumpBasePrice;
    pauseSpotBuying;
    pauseSpotSelling;
    priceHistory;
    tradingPausedUntil;
    trendData;
    trailingStopPrice;
    highFreqConfig;
    highFreqPositions;
    stepTakeProfitOrders;
    stats;
    maxBalance;
    trades;
    constructor(config = {}) {
        this.config = {
            gridCount: 5, // 默认单边 5 个网格
            gridSpacing: 0.05, // 默认网格间距 5%
            spotRatio: 0.7, // 默认现货占比 70%
            contractRatio: 0.3, // 默认合约占比 30%
            safeZoneRange: 0.1, // 默认安全区 ±10%
            warningZoneRange: 0.2, // 默认预警区 ±20%
            dangerZoneRange: 0.3, // 默认危险区 >20%
            warningHedgeRatio: 0.5, // 默认预警区对冲 50%
            dangerHedgeRatio: 1.0, // 默认危险区对冲 100%
            baseHedgeRatio: 0.1, // 默认基础对冲 10%
            ...config
        };
        this.gridOrders = [];
        this.lastRebalanceTime = 0;
        this.dropBasePrice = 0;
        this.dropBuyAmount = 0;
        this.pumpBasePrice = 0;
        this.pauseSpotBuying = false;
        this.pauseSpotSelling = false;
        this.priceHistory = new Map();
        this.tradingPausedUntil = new Map();
        this.trendData = new Map();
        this.trailingStopPrice = 0;
        this.highFreqConfig = {
            enabled: false,
            minSpread: 0.001, // 0.1% 最小价差
            maxHoldTime: 60000, // 1 分钟最大持仓时间
            tradeSize: 100, // 每次交易 100 USDT
            maxOpenPositions: 5, // 最多同时持有 5 个高频仓位
        };
        this.highFreqPositions = new Map();
        this.stepTakeProfitOrders = new Map();
        this.stats = {
            totalTrades: 0,
            profitableTrades: 0,
            totalPnl: 0,
            maxDrawdown: 0,
            hedgeEfficiency: 0,
            averageHoldTime: 0,
            winRate: 0
        };
        this.trades = [];
    }
    /**
     * 执行策略
     * @param exchange 交易所实例
     * @param kline K 线数据
     */
    execute(exchange, kline) {
        // 更新 exchange 实例
        this.exchange = exchange;
        // 初始化 initialTotalValue（如果还未初始化）
        if (!this.initialTotalValue) {
            this.initialTotalValue = exchange.getTotalAssetValue();
            this.maxBalance = this.initialTotalValue;
        }
        // 执行策略逻辑
        this.executeStrategy(kline.symbol, kline.close, kline.openTime);
    }
    /**
     * 初始化策略
     */
    async init(symbol) {
        // 1. 获取当前价格作为基准价
        this.basePrice = (0, price_1.getPrice)(symbol);
        // 2. 计算网格价格
        this.gridOrders = this.calculateGridOrders(symbol);
        // 3. 建立初始对冲仓位
        await this.setupInitialHedge(symbol);
        // 4. 挂单
        await this.placeGridOrders(symbol);
    }
    /**
     * 计算网格订单
     */
    calculateGridOrders(symbol) {
        const orders = [];
        const { gridCount, gridSpacing } = this.config;
        // 计算每个网格的资金量
        const totalValue = this.exchange.getTotalAssetValue();
        const spotValue = totalValue * this.config.spotRatio;
        const perGridValue = spotValue / (gridCount * 2);
        // 生成上部网格
        for (let i = 1; i <= gridCount; i++) {
            const price = this.basePrice * (1 + i * gridSpacing);
            const amount = perGridValue / price;
            orders.push({
                price,
                isBuy: false,
                amount,
                hedgeAmount: 0, // 对冲量在下单时计算
                timestamp: Date.now()
            });
        }
        // 生成下部网格
        for (let i = 1; i <= gridCount; i++) {
            const price = this.basePrice * (1 - i * gridSpacing);
            const amount = perGridValue / price;
            orders.push({
                price,
                isBuy: true,
                amount,
                hedgeAmount: 0,
                timestamp: Date.now()
            });
        }
        return orders;
    }
    /**
     * 建立初始对冲仓位
     */
    async setupInitialHedge(symbol) {
        const totalValue = this.exchange.getTotalAssetValue();
        const baseHedgeValue = totalValue * this.config.contractRatio * this.config.baseHedgeRatio;
        const price = (0, price_1.getPrice)(symbol);
        const amount = baseHedgeValue / price;
        // 开立基础空单
        await this.exchange.openShort(symbol, amount, 1);
    }
    /**
     * 挂单
     */
    async placeGridOrders(symbol) {
        for (const order of this.gridOrders) {
            if (order.isBuy) {
                await this.exchange.placeBuyOrder(symbol, order.amount, order.price);
            }
            else {
                await this.exchange.placeSellOrder(symbol, order.price, order.amount);
            }
        }
    }
    /**
     * 计算当前价格所在区域
     */
    calculatePriceZone(currentPrice) {
        const priceDeviation = Math.abs(currentPrice - this.basePrice) / this.basePrice;
        if (priceDeviation <= this.config.safeZoneRange) {
            return 'safe';
        }
        else if (priceDeviation <= this.config.warningZoneRange) {
            return 'warning';
        }
        else {
            return 'danger';
        }
    }
    /**
     * 获取对冲比例
     */
    getHedgeRatio(zone) {
        switch (zone) {
            case 'safe':
                return this.config.baseHedgeRatio;
            case 'warning':
                return this.config.warningHedgeRatio;
            case 'danger':
                return this.config.dangerHedgeRatio;
            default:
                return 0;
        }
    }
    /**
     * 处理价格更新
     */
    onPriceUpdate(symbol, price) {
        // 1. 检查是否需要重新平衡（每 4 小时）
        const now = Date.now();
        if (now - this.lastRebalanceTime > 4 * 60 * 60 * 1000) {
            this.rebalance(symbol, price);
            this.lastRebalanceTime = now;
        }
        // 2. 更新对冲仓位
        this.updateHedgePosition(symbol, price);
    }
    /**
     * 重新平衡策略
     */
    async rebalance(symbol, currentPrice) {
        // 1. 取消所有挂单
        const pendingOrders = this.exchange.getPendingOrders();
        for (const order of pendingOrders) {
            await this.exchange.cancelOrder(order.id);
        }
        // 2. 更新基准价格（使用当前价格）
        this.basePrice = currentPrice;
        // 3. 重新计算网格
        this.gridOrders = this.calculateGridOrders(symbol);
        // 4. 重新挂单
        await this.placeGridOrders(symbol);
        // 5. 调整对冲仓位
        await this.updateHedgePosition(symbol, currentPrice);
    }
    /**
     * 更新对冲仓位
     */
    async updateHedgePosition(symbol, currentPrice) {
        // 1. 计算价格区域
        const zone = this.calculatePriceZone(currentPrice);
        // 2. 获取目标对冲比例
        const targetHedgeRatio = this.getHedgeRatio(zone);
        // 3. 计算目标对冲仓位
        const totalValue = this.exchange.getTotalAssetValue();
        const targetHedgeValue = totalValue * this.config.contractRatio * targetHedgeRatio;
        const targetHedgeAmount = targetHedgeValue / currentPrice;
        // 4. 获取当前对冲仓位
        const currentPosition = this.exchange.getShortPosition(symbol);
        const currentHedgeAmount = currentPosition?.amount || 0;
        // 5. 调整仓位
        if (currentHedgeAmount < targetHedgeAmount) {
            // 需要增加对冲
            const addAmount = targetHedgeAmount - currentHedgeAmount;
            await this.exchange.openShort(symbol, addAmount, 1);
        }
        else if (currentHedgeAmount > targetHedgeAmount) {
            // 需要减少对冲
            await this.exchange.closeShort(symbol);
            if (targetHedgeAmount > 0) {
                await this.exchange.openShort(symbol, targetHedgeAmount, 1);
            }
        }
    }
    /**
     * 执行策略
     */
    async executeStrategy(symbol, price, timestamp) {
        try {
            // 1. 更新价格历史
            this.updatePriceHistory(symbol, price);
            // 2. 检查是否需要初始化
            if (this.gridOrders.length === 0) {
                await this.init(symbol);
                return;
            }
            // 3. 处理价格更新
            this.onPriceUpdate(symbol, price);
            // 4. 执行风险控制
            await this.checkRiskControl(symbol, price);
            // 5. 执行止盈止损检查
            await this.checkTakeProfit(symbol, price, timestamp);
            await this.checkStopLoss(symbol, price, timestamp);
            // 6. 检查特殊市场情况
            await this.handleSpecialMarketConditions(symbol, price, timestamp);
            // 7. 执行高频交易
            await this.executeHighFreqTrading(symbol, price, timestamp);
            // 8. 动态调整对冲仓位
            await this.adjustHedgePosition(symbol, price, timestamp);
        }
        catch (error) {
            console.error('Strategy execution error:', error);
        }
    }
    /**
     * 动态调整对冲仓位
     */
    async adjustHedgePosition(symbol, price, timestamp) {
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        // 1. 根据波动率调整杠杆
        await this.adjustLeverageByVolatility(symbol, price);
        // 2. 根据趋势调整对冲比例
        await this.adjustHedgeRatioByTrend(symbol, price);
        // 3. 检查对冲效率
        await this.checkHedgeEfficiency(symbol, price);
    }
    /**
     * 根据波动率调整杠杆
     */
    async adjustLeverageByVolatility(symbol, price) {
        const volatility = this.calculateVolatility(this.getPriceHistory(symbol));
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        // 根据波动率设置目标杠杆
        let targetLeverage = 1;
        if (volatility < 0.05) {
            targetLeverage = 3; // 低波动可以用高杠杆
        }
        else if (volatility < 0.1) {
            targetLeverage = 2; // 中等波动用中等杠杆
        }
        // 如果需要调整杠杆
        if (position.leverage !== targetLeverage) {
            await this.exchange.closeShort(symbol);
            await this.exchange.openShort(symbol, position.amount, targetLeverage);
        }
    }
    /**
     * 根据趋势调整对冲比例
     */
    async adjustHedgeRatioByTrend(symbol, price) {
        const trend = this.calculateShortTermTrend(symbol);
        let targetHedgeRatio = this.config.baseHedgeRatio;
        // 根据趋势强度调整对冲比例
        if (trend > 0.01) { // 上升趋势
            targetHedgeRatio *= 1.5;
        }
        else if (trend < -0.01) { // 下降趋势
            targetHedgeRatio *= 0.8;
        }
        // 更新对冲仓位
        await this.updateHedgePosition(symbol, price);
    }
    /**
     * 检查对冲效率
     */
    async checkHedgeEfficiency(symbol, price) {
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        // 计算对冲效率（现货盈亏 vs 合约盈亏）
        const spotPnl = this.calculateSpotPnl(symbol, price);
        const hedgePnl = this.exchange.getUnrealizedPnl(symbol);
        const hedgeEfficiency = Math.abs((spotPnl + hedgePnl) / spotPnl);
        // 如果对冲效率低于阈值，调整对冲比例
        if (hedgeEfficiency < 0.8) { // 对冲效率低于 80%
            const newHedgeRatio = this.config.baseHedgeRatio * (1 + (1 - hedgeEfficiency));
            this.config.baseHedgeRatio = Math.min(newHedgeRatio, 1.5); // 最高增加到 150%
            await this.updateHedgePosition(symbol, price);
        }
    }
    /**
     * 计算现货盈亏
     */
    calculateSpotPnl(symbol, currentPrice) {
        const spotBalance = this.exchange.getBalance(symbol);
        const averagePrice = this.calculateAverageEntryPrice(symbol);
        return (currentPrice - averagePrice) * spotBalance;
    }
    /**
     * 计算平均入场价格
     */
    calculateAverageEntryPrice(symbol) {
        let totalValue = 0;
        let totalAmount = 0;
        for (const order of this.gridOrders) {
            if (order.isBuy) {
                totalValue += order.price * order.amount;
                totalAmount += order.amount;
            }
        }
        return totalAmount > 0 ? totalValue / totalAmount : 0;
    }
    /**
     * 检查止盈条件
     */
    async checkTakeProfit(symbol, price, timestamp) {
        // 1. 网格止盈
        await this.checkGridTakeProfit(symbol, price);
        // 2. 趋势止盈
        await this.checkTrendTakeProfit(symbol, price, timestamp);
        // 3. 对冲止盈
        await this.checkHedgeTakeProfit(symbol, price);
    }
    /**
     * 检查网格止盈
     */
    async checkGridTakeProfit(symbol, currentPrice) {
        const GRID_TAKE_PROFIT_THRESHOLD = 0.07; // 7% 止盈阈值
        const TAKE_PROFIT_RATIO = 0.5; // 止盈 50% 仓位
        for (const order of this.gridOrders) {
            // 计算网格盈利
            const profit = order.isBuy
                ? (currentPrice - order.price) / order.price
                : (order.price - currentPrice) / order.price;
            if (profit >= GRID_TAKE_PROFIT_THRESHOLD) {
                // 执行部分止盈
                const takeAmount = order.amount * TAKE_PROFIT_RATIO;
                if (order.isBuy) {
                    await this.exchange.spotSell(symbol, takeAmount);
                }
                else {
                    await this.exchange.spotBuy(symbol, takeAmount);
                }
                // 更新网格订单
                order.amount -= takeAmount;
            }
        }
    }
    /**
     * 检查趋势止盈
     */
    async checkTrendTakeProfit(symbol, price, timestamp) {
        // 更新趋势数据
        if (!this.trendData.has(symbol)) {
            this.trendData.set(symbol, { highs: [], lows: [] });
        }
        const trend = this.trendData.get(symbol);
        // 使用日内高低点
        const isNewDay = this.isNewTradingDay(timestamp);
        if (isNewDay) {
            trend.highs.push(price);
            trend.lows.push(price);
            if (trend.highs.length > 3) {
                trend.highs.shift();
                trend.lows.shift();
            }
        }
        else {
            trend.highs[trend.highs.length - 1] = Math.max(trend.highs[trend.highs.length - 1], price);
            trend.lows[trend.lows.length - 1] = Math.min(trend.lows[trend.lows.length - 1], price);
        }
        // 检查是否连续创新高/新低
        const isUptrend = this.isConsecutiveHighs(trend.highs);
        const isDowntrend = this.isConsecutiveLows(trend.lows);
        if (isUptrend || isDowntrend) {
            // 调整仓位
            await this.adjustPositionForTrend(symbol, price, isUptrend);
            // 设置追踪止盈
            this.setupTrailingStop(symbol, price, isUptrend);
        }
    }
    /**
     * 检查对冲止盈
     */
    async checkHedgeTakeProfit(symbol, price) {
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        // 计算对冲仓位盈利率
        const pnl = this.exchange.getUnrealizedPnl(symbol);
        const profitRatio = pnl / position.margin;
        if (profitRatio >= 0.5) { // 盈利达到保证金的 50%
            // 平仓 30% 获利
            const closeAmount = position.amount * 0.3;
            await this.exchange.closeShort(symbol);
            // 用一半盈利买入现货
            const profit = pnl * 0.3; // 实现的盈利
            const buyAmount = (profit * 0.5) / price;
            await this.exchange.spotBuy(symbol, buyAmount);
            // 重新开立剩余空单
            const remainingAmount = position.amount * 0.7;
            await this.exchange.openShort(symbol, remainingAmount, position.leverage);
        }
    }
    /**
     * 检查止损条件
     */
    async checkStopLoss(symbol, price, timestamp) {
        await this.checkGridStopLoss(symbol, price);
        await this.checkAccountStopLoss(symbol, price);
        await this.checkTimeStopLoss(symbol, price, timestamp);
    }
    /**
     * 检查网格级止损
     */
    async checkGridStopLoss(symbol, currentPrice) {
        const GRID_STOP_LOSS_THRESHOLD = 0.1; // 10% 止损阈值
        const STOP_LOSS_RATIO = 0.5; // 止损 50% 仓位
        let consecutiveLosses = 0;
        for (const order of this.gridOrders) {
            // 计算网格亏损
            const loss = order.isBuy
                ? (order.price - currentPrice) / order.price
                : (currentPrice - order.price) / order.price;
            if (loss >= GRID_STOP_LOSS_THRESHOLD) {
                // 执行部分止损
                const stopAmount = order.amount * STOP_LOSS_RATIO;
                if (order.isBuy) {
                    await this.exchange.spotSell(symbol, stopAmount);
                    consecutiveLosses++;
                }
                else {
                    await this.exchange.spotBuy(symbol, stopAmount);
                    consecutiveLosses++;
                }
                // 更新网格订单
                order.amount -= stopAmount;
            }
        }
        // 如果连续触发 3 个网格止损，暂停该方向交易 2 小时
        if (consecutiveLosses >= 3) {
            // TODO: 实现交易暂停机制
        }
    }
    /**
     * 检查账户级止损
     */
    async checkAccountStopLoss(symbol, currentPrice) {
        const ACCOUNT_STOP_LOSS_THRESHOLD = 0.15; // 15% 账户回撤止损
        const MARGIN_STOP_LOSS_THRESHOLD = 0.3; // 30% 保证金率止损
        // 计算账户回撤
        const totalValue = this.exchange.getTotalAssetValue();
        const drawdown = (this.initialTotalValue - totalValue) / this.initialTotalValue;
        if (drawdown >= ACCOUNT_STOP_LOSS_THRESHOLD) {
            // 清仓所有现货，保留 50% 对冲合约
            const position = this.exchange.getShortPosition(symbol);
            if (position) {
                const keepAmount = position.amount * 0.5;
                await this.exchange.closeShort(symbol);
                await this.exchange.openShort(symbol, keepAmount, position.leverage);
            }
            // TODO: 清仓现货
        }
        // 检查保证金率
        const position = this.exchange.getShortPosition(symbol);
        if (position) {
            const marginRatio = position.margin / (position.amount * currentPrice);
            if (marginRatio < MARGIN_STOP_LOSS_THRESHOLD) {
                // 强制平仓 20% 现货补充保证金
                // TODO: 实现现货平仓和保证金补充
            }
        }
    }
    /**
     * 检查时间止损
     */
    async checkTimeStopLoss(symbol, price, timestamp) {
        const POSITION_MAX_HOLD_TIME = 7 * 24 * 60 * 60 * 1000; // 7 天
        const HEDGE_MAX_HOLD_TIME = 3 * 24 * 60 * 60 * 1000; // 3 天
        const DAILY_REDUCTION_RATIO = 0.1; // 每日减仓 10%
        // 1. 检查网格订单持仓时间
        for (const order of this.gridOrders) {
            const holdTime = timestamp - order.timestamp;
            if (holdTime > POSITION_MAX_HOLD_TIME) {
                // 计算持仓天数
                const daysHeld = Math.floor(holdTime / (24 * 60 * 60 * 1000));
                // 计算应该减仓的比例
                const reductionRatio = Math.min(daysHeld * DAILY_REDUCTION_RATIO, 1);
                // 执行减仓
                const reduceAmount = order.amount * reductionRatio;
                if (order.isBuy) {
                    await this.exchange.spotSell(symbol, reduceAmount);
                }
                else {
                    await this.exchange.spotBuy(symbol, reduceAmount);
                }
                // 更新订单
                order.amount -= reduceAmount;
            }
        }
        // 2. 检查对冲仓位持仓时间
        const position = this.exchange.getShortPosition(symbol);
        if (position && (timestamp - position.timestamp) > HEDGE_MAX_HOLD_TIME) {
            // 平掉未盈利的对冲仓位
            if (this.exchange.getUnrealizedPnl(symbol) <= 0) {
                await this.exchange.closeShort(symbol);
                // 重置对冲比例
                await this.updateHedgePosition(symbol, price);
            }
        }
    }
    /**
     * 处理特殊市场情况
     */
    async handleSpecialMarketConditions(symbol, price, timestamp) {
        const priceHistory = this.getPriceHistory(symbol);
        // 1. 检查急速下跌（1 小时跌超 15%）
        if (this.isRapidDrop(priceHistory)) {
            await this.handleRapidDrop(symbol, price);
        }
        // 2. 检查暴力拉升（3 小时涨超 20%）
        else if (this.isViolentPump(priceHistory)) {
            await this.handleViolentPump(symbol, price);
        }
        // 3. 检查横盘震荡（波动率<5%）
        else if (this.isSideways(priceHistory)) {
            await this.handleSideways(symbol, price);
        }
    }
    /**
     * 处理急速下跌
     */
    async handleRapidDrop(symbol, price) {
        // 1. 暂停现货买入
        this.pauseSpotBuying = true;
        // 2. 增加对冲合约杠杆
        const position = this.exchange.getShortPosition(symbol);
        if (position) {
            await this.exchange.closeShort(symbol);
            await this.exchange.openShort(symbol, position.amount, 2); // 转为 2 倍杠杆
        }
        // 3. 启动分批买入
        const totalValue = this.exchange.getTotalAssetValue();
        const baseAmount = (totalValue * 0.1) / price; // 每次买入10%资金
        // 记录基准价格，用于分批买入
        this.dropBasePrice = price;
        this.dropBuyAmount = baseAmount;
    }
    /**
     * 处理暴力拉升
     */
    async handleViolentPump(symbol, price) {
        // 1. 暂停现货卖出
        this.pauseSpotSelling = true;
        // 2. 增加对冲合约杠杆
        const position = this.exchange.getShortPosition(symbol);
        if (position) {
            await this.exchange.closeShort(symbol);
            await this.exchange.openShort(symbol, position.amount, 3); // 转为 3 倍杠杆
        }
        // 3. 设置阶梯止盈
        this.pumpBasePrice = price;
        await this.setupStepTakeProfit(symbol, price);
    }
    /**
     * 处理横盘震荡
     */
    async handleSideways(symbol, price) {
        // 1. 收缩网格间距
        this.config.gridSpacing = 0.03; // 改为 3% 间距
        // 2. 降低对冲比例
        this.config.baseHedgeRatio = 0.3;
        await this.updateHedgePosition(symbol, price);
        // 3. 重新计算并设置网格
        await this.rebalance(symbol, price);
    }
    /**
     * 检查是否处于急速下跌
     */
    isRapidDrop(priceHistory) {
        const hourAgoPrice = priceHistory[priceHistory.length - 60]; // 1 小时前价格
        const currentPrice = priceHistory[priceHistory.length - 1];
        return (hourAgoPrice - currentPrice) / hourAgoPrice > 0.15;
    }
    /**
     * 检查是否处于暴力拉升
     */
    isViolentPump(priceHistory) {
        const threeHoursAgoPrice = priceHistory[priceHistory.length - 180]; // 3 小时前价格
        const currentPrice = priceHistory[priceHistory.length - 1];
        return (currentPrice - threeHoursAgoPrice) / threeHoursAgoPrice > 0.2;
    }
    /**
     * 检查是否处于横盘震荡
     */
    isSideways(priceHistory) {
        const prices = priceHistory.slice(-60); // 取最近 1 小时数据
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        return (maxPrice - minPrice) / minPrice < 0.05;
    }
    /**
     * 更新价格历史
     */
    updatePriceHistory(symbol, price) {
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }
        const history = this.priceHistory.get(symbol);
        history.push(price);
        // 保留最近 24 小时的数据（假设 1 分钟一个数据点）
        const MAX_HISTORY = 24 * 60;
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    }
    /**
     * 获取价格历史
     */
    getPriceHistory(symbol) {
        return this.priceHistory.get(symbol) || [];
    }
    /**
     * 检查交易是否被暂停
     */
    isTraidingPaused(symbol, isBuy) {
        const pauseInfo = this.tradingPausedUntil.get(symbol);
        if (!pauseInfo)
            return false;
        const now = Date.now();
        return isBuy ? now < pauseInfo.buy : now < pauseInfo.sell;
    }
    /**
     * 暂停交易
     */
    pauseTrading(symbol, isBuy, duration) {
        const pauseUntil = Date.now() + duration;
        const current = this.tradingPausedUntil.get(symbol) || { buy: 0, sell: 0 };
        if (isBuy) {
            current.buy = pauseUntil;
        }
        else {
            current.sell = pauseUntil;
        }
        this.tradingPausedUntil.set(symbol, current);
    }
    /**
     * 设置阶梯止盈
     */
    async setupStepTakeProfit(symbol, price) {
        const STEP_SIZE = 0.05; // 5% 一个台阶
        const TAKE_PROFIT_RATIO = 0.2; // 每个台阶止盈 20%
        // 记录基准价格
        this.pumpBasePrice = price;
        // 取消之前的阶梯止盈订单
        await this.cancelStepTakeProfitOrders(symbol);
        // 设置止盈价格梯度
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        const orders = [];
        const totalSteps = 4; // 设置 4 个止盈台阶
        for (let i = 1; i <= totalSteps; i++) {
            const targetPrice = price * (1 + i * STEP_SIZE);
            const takeAmount = position.amount * TAKE_PROFIT_RATIO;
            // 挂出限价卖单
            const orderId = await this.exchange.placeSellOrder(symbol, targetPrice, takeAmount);
            orders.push({
                targetPrice,
                amount: takeAmount,
                orderId
            });
        }
        this.stepTakeProfitOrders.set(symbol, orders);
    }
    /**
     * 取消阶梯止盈订单
     */
    async cancelStepTakeProfitOrders(symbol) {
        const orders = this.stepTakeProfitOrders.get(symbol);
        if (!orders)
            return;
        for (const order of orders) {
            if (order.orderId) {
                await this.exchange.cancelOrder(order.orderId);
            }
        }
        this.stepTakeProfitOrders.delete(symbol);
    }
    /**
     * 检查是否连续创新高
     */
    isConsecutiveHighs(highs) {
        if (highs.length < 3)
            return false;
        return highs[2] > highs[1] && highs[1] > highs[0];
    }
    /**
     * 检查是否连续创新低
     */
    isConsecutiveLows(lows) {
        if (lows.length < 3)
            return false;
        return lows[2] < lows[1] && lows[1] < lows[0];
    }
    /**
     * 根据趋势调整仓位
     */
    async adjustPositionForTrend(symbol, price, isUptrend) {
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        if (isUptrend) {
            // 上升趋势：减少现货，增加对冲
            // 1. 减半现货仓位
            const spotBalance = this.exchange.getBalance(symbol);
            const sellAmount = spotBalance * 0.5;
            await this.exchange.spotSell(symbol, sellAmount);
            // 2. 增加对冲比例到 150%
            const newHedgeAmount = position.amount * 1.5;
            await this.exchange.closeShort(symbol);
            await this.exchange.openShort(symbol, newHedgeAmount, position.leverage);
        }
        else {
            // 下降趋势：保持现货，减少对冲
            const newHedgeAmount = position.amount * 0.5;
            await this.exchange.closeShort(symbol);
            await this.exchange.openShort(symbol, newHedgeAmount, position.leverage);
        }
    }
    /**
     * 设置追踪止盈
     */
    setupTrailingStop(symbol, price, isUptrend) {
        const TRAILING_STOP_DISTANCE = 0.03; // 3% 追踪止损距离
        this.trailingStopPrice = isUptrend
            ? price * (1 - TRAILING_STOP_DISTANCE)
            : price * (1 + TRAILING_STOP_DISTANCE);
    }
    /**
     * 检查是否新的交易日
     */
    isNewTradingDay(timestamp) {
        const date = new Date(timestamp);
        const prevDate = new Date(this.lastRebalanceTime);
        return date.getUTCDate() !== prevDate.getUTCDate();
    }
    /**
     * 执行高频交易
     */
    async executeHighFreqTrading(symbol, price, timestamp) {
        if (!this.highFreqConfig.enabled || this.isSideways(this.getPriceHistory(symbol))) {
            return;
        }
        // 1. 清理超时仓位
        await this.cleanupStalePositions(symbol, timestamp);
        // 2. 检查是否可以开新仓位
        if (this.highFreqPositions.size >= this.highFreqConfig.maxOpenPositions) {
            return;
        }
        // 3. 计算买卖价差
        const priceHistory = this.getPriceHistory(symbol).slice(-60); // 取最近 1 分钟数据
        const spread = this.calculateSpread(priceHistory);
        // 4. 如果价差足够大，开仓
        if (spread >= this.highFreqConfig.minSpread) {
            await this.openHighFreqPosition(symbol, price, timestamp);
        }
    }
    /**
     * 清理超时仓位
     */
    async cleanupStalePositions(symbol, timestamp) {
        for (const [id, position] of this.highFreqPositions) {
            const holdTime = timestamp - position.timestamp;
            if (holdTime >= this.highFreqConfig.maxHoldTime) {
                // 平仓
                if (position.isBuy) {
                    await this.exchange.spotSell(symbol, position.amount);
                }
                else {
                    await this.exchange.spotBuy(symbol, position.amount);
                }
                this.highFreqPositions.delete(id);
            }
        }
    }
    /**
     * 计算价差
     */
    calculateSpread(prices) {
        if (prices.length < 2)
            return 0;
        const volatility = Math.abs(prices[prices.length - 1] - prices[0]) / prices[0];
        return volatility;
    }
    /**
     * 开立高频仓位
     */
    async openHighFreqPosition(symbol, price, timestamp) {
        const amount = this.highFreqConfig.tradeSize / price;
        const id = `hf_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
        // 根据短期趋势决定买入还是卖出
        const shortTermTrend = this.calculateShortTermTrend(symbol);
        const isBuy = shortTermTrend < 0; // 短期下跌趋势买入
        if (isBuy) {
            await this.exchange.spotBuy(symbol, amount);
        }
        else {
            await this.exchange.spotSell(symbol, amount);
        }
        this.highFreqPositions.set(id, {
            entryPrice: price,
            amount,
            timestamp,
            isBuy
        });
    }
    /**
     * 计算短期趋势
     */
    calculateShortTermTrend(symbol) {
        const prices = this.getPriceHistory(symbol).slice(-10); // 取最近 10 个价格点
        if (prices.length < 2)
            return 0;
        // 使用简单的线性回归计算趋势
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = prices.length;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += prices[i];
            sumXY += i * prices[i];
            sumX2 += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }
    /**
     * 添加风险控制措施
     */
    async checkRiskControl(symbol, price) {
        // 1. 检查杠杆率
        await this.checkLeverageRisk(symbol, price);
        // 2. 检查集中度风险
        await this.checkConcentrationRisk(symbol);
        // 3. 检查流动性风险
        await this.checkLiquidityRisk(symbol);
        // 4. 检查波动率风险
        await this.checkVolatilityRisk(symbol);
    }
    /**
     * 检查杠杆率风险
     */
    async checkLeverageRisk(symbol, price) {
        const MAX_LEVERAGE = 3;
        const position = this.exchange.getShortPosition(symbol);
        if (position && position.leverage > MAX_LEVERAGE) {
            // 降低杠杆
            await this.exchange.closeShort(symbol);
            await this.exchange.openShort(symbol, position.amount, MAX_LEVERAGE);
        }
    }
    /**
     * 检查集中度风险
     */
    async checkConcentrationRisk(symbol) {
        const MAX_POSITION_RATIO = 0.3; // 单个资产最大占比 30%
        const totalValue = this.exchange.getTotalAssetValue();
        const symbolValue = this.exchange.getBalance(symbol) * (0, price_1.getPrice)(symbol);
        if (symbolValue / totalValue > MAX_POSITION_RATIO) {
            // 减少持仓
            const reduceAmount = this.exchange.getBalance(symbol) * 0.2; // 减少 20%
            await this.exchange.spotSell(symbol, reduceAmount);
        }
    }
    /**
     * 检查流动性风险
     */
    async checkLiquidityRisk(symbol) {
        const metrics = await this.getLiquidityMetrics(symbol);
        const adjustmentNeeded = this.analyzeLiquidityMetrics(metrics);
        if (adjustmentNeeded) {
            await this.adjustForLowLiquidity(symbol, metrics);
        }
    }
    /**
     * 获取流动性指标
     */
    async getLiquidityMetrics(symbol) {
        // TODO: 从交易所获取实际数据
        return {
            orderBookDepth: 1000000, // 示例：100 万美元深度
            volume24h: 10000000, // 示例：1000 万美元成交量
            spreadRatio: 0.001 // 示例：0.1% 价差
        };
    }
    /**
     * 分析流动性指标
     */
    analyzeLiquidityMetrics(metrics) {
        const MIN_ORDER_BOOK_DEPTH = 500000; // 最小订单簿深度：50 万美元
        const MIN_24H_VOLUME = 5000000; // 最小日成交量：500 万美元
        const MAX_SPREAD_RATIO = 0.003; // 最大可接受价差：0.3%
        return metrics.orderBookDepth < MIN_ORDER_BOOK_DEPTH ||
            metrics.volume24h < MIN_24H_VOLUME ||
            metrics.spreadRatio > MAX_SPREAD_RATIO;
    }
    /**
     * 调整低流动性应对策略
     */
    async adjustForLowLiquidity(symbol, metrics) {
        // 1. 减小交易规模
        const sizeAdjustment = Math.min(metrics.orderBookDepth / 1000000, // 基于订单簿深度
        metrics.volume24h / 10000000 // 基于成交量
        );
        this.highFreqConfig.tradeSize *= sizeAdjustment;
        // 2. 增加网格间距，降低交易频率
        this.config.gridSpacing *= (1 + metrics.spreadRatio * 10);
        // 3. 设置更保守的止损
        await this.adjustStopLossForLiquidity(symbol, metrics);
    }
    /**
     * 根据流动性调整止损
     */
    async adjustStopLossForLiquidity(symbol, metrics) {
        // 基于价差调整止损比例
        const stopLossAdjustment = 1 + metrics.spreadRatio * 5;
        // 更新网格止损阈值
        const position = this.exchange.getShortPosition(symbol);
        if (position) {
            const currentPrice = (0, price_1.getPrice)(symbol);
            const newStopPrice = position.entryPrice * (1 + stopLossAdjustment);
            if (currentPrice > newStopPrice) {
                await this.closeShortPosition(symbol);
            }
        }
    }
    /**
     * 动态调整止损
     */
    async adjustDynamicStopLoss(symbol, price) {
        const position = this.exchange.getShortPosition(symbol);
        if (!position)
            return;
        // 计算波动率
        const volatility = this.calculateVolatility(this.getPriceHistory(symbol));
        // 根据波动率调整追踪止损距离
        const baseStopDistance = 0.03; // 基础 3% 止损距离
        const volatilityAdjustment = Math.min(volatility * 2, 0.05); // 最多增加 5%
        const stopDistance = baseStopDistance + volatilityAdjustment;
        // 更新追踪止损价格
        const unrealizedPnl = this.exchange.getUnrealizedPnl(symbol);
        if (unrealizedPnl > 0) {
            // 盈利情况下，设置追踪止损
            const newStopPrice = price * (1 + stopDistance);
            if (!this.trailingStopPrice || newStopPrice < this.trailingStopPrice) {
                this.trailingStopPrice = newStopPrice;
            }
        }
        else {
            // 亏损情况下，设置固定止损
            const maxLossDistance = 0.1; // 最大允许 10% 亏损
            const stopPrice = position.entryPrice * (1 + maxLossDistance);
            if (price > stopPrice) {
                await this.closeShortPosition(symbol);
            }
        }
    }
    /**
     * 平掉空头仓位
     */
    async closeShortPosition(symbol) {
        await this.exchange.closeShort(symbol);
        this.trailingStopPrice = 0;
    }
    /**
     * 检查波动率风险
     */
    async checkVolatilityRisk(symbol) {
        const prices = this.getPriceHistory(symbol);
        const volatility = this.calculateVolatility(prices);
        const HIGH_VOLATILITY_THRESHOLD = 0.1; // 10% 波动率阈值
        if (volatility > HIGH_VOLATILITY_THRESHOLD) {
            // 1. 减少交易规模
            this.highFreqConfig.tradeSize *= 0.8;
            // 2. 增加网格间距
            this.config.gridSpacing *= 1.2;
            // 3. 提高止损水平
            // TODO: 实现动态止损调整
        }
    }
    /**
     * 计算波动率
     */
    calculateVolatility(prices) {
        if (prices.length < 2)
            return 0;
        // 计算对数收益率
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push(Math.log(prices[i] / prices[i - 1]));
        }
        // 计算标准差
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
    }
    /**
     * 更新策略统计
     */
    updateStats(trade) {
        // 更新交易统计
        this.trades.push(trade);
        this.stats.totalTrades++;
        if (trade.pnl > 0) {
            this.stats.profitableTrades++;
        }
        this.stats.totalPnl += trade.pnl;
        // 更新胜率
        this.stats.winRate = this.stats.profitableTrades / this.stats.totalTrades;
        // 更新平均持仓时间
        const totalHoldTime = this.trades.reduce((sum, t) => sum + t.holdTime, 0);
        this.stats.averageHoldTime = totalHoldTime / this.trades.length;
        // 更新最大回撤
        const currentBalance = this.exchange.getTotalAssetValue();
        if (currentBalance > this.maxBalance) {
            this.maxBalance = currentBalance;
        }
        else {
            const drawdown = (this.maxBalance - currentBalance) / this.maxBalance;
            this.stats.maxDrawdown = Math.max(this.stats.maxDrawdown, drawdown);
        }
        // 更新对冲效率
        this.updateHedgeEfficiency();
    }
    /**
     * 更新对冲效率
     */
    updateHedgeEfficiency() {
        const hedgeTrades = this.trades.filter(t => t.isHedge);
        const spotTrades = this.trades.filter(t => !t.isHedge);
        if (hedgeTrades.length === 0 || spotTrades.length === 0) {
            return;
        }
        // 计算现货和对冲的相关性
        const hedgePnls = hedgeTrades.map(t => t.pnl);
        const spotPnls = spotTrades.map(t => t.pnl);
        const correlation = this.calculateCorrelation(hedgePnls, spotPnls);
        // 理想的对冲应该有完全负相关（-1）
        this.stats.hedgeEfficiency = Math.abs(correlation + 1);
    }
    /**
     * 计算相关性
     */
    calculateCorrelation(x, y) {
        const n = Math.min(x.length, y.length);
        if (n < 2)
            return 0;
        const xMean = x.reduce((a, b) => a + b, 0) / n;
        const yMean = y.reduce((a, b) => a + b, 0) / n;
        let numerator = 0;
        let xVariance = 0;
        let yVariance = 0;
        for (let i = 0; i < n; i++) {
            const xDiff = x[i] - xMean;
            const yDiff = y[i] - yMean;
            numerator += xDiff * yDiff;
            xVariance += xDiff * xDiff;
            yVariance += yDiff * yDiff;
        }
        return numerator / Math.sqrt(xVariance * yVariance);
    }
    /**
     * 获取策略统计数据
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * 优化对冲效率
     */
    async optimizeHedgeEfficiency(symbol, price) {
        if (this.stats.hedgeEfficiency < 0.8) {
            // 1. 调整对冲比例
            const currentHedgeRatio = this.config.baseHedgeRatio;
            const newHedgeRatio = currentHedgeRatio * (1 + (1 - this.stats.hedgeEfficiency));
            this.config.baseHedgeRatio = Math.min(newHedgeRatio, 1.5);
            // 2. 调整杠杆
            const position = this.exchange.getShortPosition(symbol);
            if (position) {
                const volatility = this.calculateVolatility(this.getPriceHistory(symbol));
                const optimalLeverage = this.calculateOptimalLeverage(volatility, this.stats.hedgeEfficiency);
                if (position.leverage !== optimalLeverage) {
                    await this.exchange.closeShort(symbol);
                    await this.exchange.openShort(symbol, position.amount, optimalLeverage);
                }
            }
        }
    }
    /**
     * 计算最优杠杆
     */
    calculateOptimalLeverage(volatility, hedgeEfficiency) {
        // 基于波动率和对冲效率计算最优杠杆
        const baseMultiplier = 1 / volatility; // 波动率越高，杠杆越低
        const efficiencyMultiplier = hedgeEfficiency; // 对冲效率越高，可以用更高杠杆
        const optimalLeverage = Math.min(baseMultiplier * efficiencyMultiplier, 3);
        return Math.max(1, Math.round(optimalLeverage));
    }
}
exports.DynamicHedgeGridStrategy = DynamicHedgeGridStrategy;
