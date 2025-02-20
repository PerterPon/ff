import { Symbol, PendingOrder, ShortPosition } from '../types/main';
import { Wallet } from '../core/wallet';
import { getPrice } from '../core/price';

/**
 * 手续费率配置
 */
interface FeeRates {
    /** 现货买入手续费率 */
    spotBuy: number;
    /** 现货卖出手续费率 */
    spotSell: number;
    /** 挂单买入手续费率 */
    limitBuy: number;
    /** 挂单卖出手续费率 */
    limitSell: number;
    /** 空单开仓手续费率 */
    shortOpen: number;
    /** 空单平仓手续费率 */
    shortClose: number;
}

/**
 * 交易所类，支持现货交易、挂单功能和空单交易
 */
export class Exchange {
    private wallet: Wallet;
    private feeRates: FeeRates;
    private pendingOrders: Map<string, PendingOrder>;
    private shortPositions: Map<Symbol, ShortPosition>;
    private orderIdCounter: number;
    private maintenanceMarginRate = 0.05; // 维持保证金率 5%

    /**
     * @param wallet 钱包实例
     * @param feeRates 手续费率配置，例如 0.001 表示 0.1%
     */
    constructor(wallet: Wallet, feeRates: Partial<FeeRates> = {}) {
        this.wallet = wallet;
        this.feeRates = {
            spotBuy: 0.001,    // 默认 0.1%
            spotSell: 0.001,   // 默认 0.1%
            limitBuy: 0.002,  // 默认 0.02%
            limitSell: 0.002, // 默认 0.02%
            shortOpen: 0.001,  // 0.1%
            shortClose: 0.001, // 0.1%
            ...feeRates        // 允许覆盖默认值
        };
        this.pendingOrders = new Map();
        this.shortPositions = new Map();
        this.orderIdCounter = 0;
    }

    /**
     * 生成订单 ID
     */
    private generateOrderId(): string {
        return `order_${++this.orderIdCounter}`;
    }

    /**
     * 现货买入
     * @param symbol 交易对
     * @param amount 数量
     */
    spotBuy(symbol: Symbol, amount: number): void {
        if (amount <= 0) {
            throw new Error('买入数量必须大于 0');
        }

        const price = getPrice(symbol);
        const totalCost = price * amount;
        const fee = totalCost * this.feeRates.spotBuy;
        const totalCostWithFee = totalCost + fee;

        // 检查法币余额是否足够
        const fiatBalance = this.wallet.getFiatBalance();
        if (fiatBalance < totalCostWithFee) {
            throw new Error(
                `法币余额不足：当前余额：${fiatBalance}，` +
                `需要：${totalCostWithFee}（交易金额：${totalCost}，手续费：${fee}）`
            );
        }

        // 执行交易
        this.wallet.subtractFiatBalance(totalCostWithFee);
        this.wallet.addBalance(symbol, amount);
    }

    /**
     * 现货卖出
     * @param symbol 交易对
     * @param amount 数量
     */
    spotSell(symbol: Symbol, amount: number): void {
        if (amount <= 0) {
            throw new Error('卖出数量必须大于 0');
        }

        // 检查交易对余额是否足够
        const symbolBalance = this.wallet.getBalance(symbol);
        if (symbolBalance < amount) {
            throw new Error(
                `${symbol}余额不足：当前余额：${symbolBalance}，需要：${amount}`
            );
        }

        const price = getPrice(symbol);
        const totalRevenue = price * amount;
        const fee = totalRevenue * this.feeRates.spotSell;
        const totalRevenueAfterFee = totalRevenue - fee;

        // 执行交易
        this.wallet.subtractBalance(symbol, amount);
        this.wallet.addFiatBalance(totalRevenueAfterFee);
    }

    /**
     * 挂买单
     * @param symbol 交易对
     * @param price 期望买入价格
     * @param amount 数量
     * @returns 订单ID
     */
    placeBuyOrder(symbol: Symbol, price: number, amount: number): string {
        if (amount <= 0 || price <= 0) {
            throw new Error('价格和数量必须大于 0');
        }

        // 预先检查余额是否足够
        const totalCost = price * amount;
        const fee = totalCost * this.feeRates.limitBuy;
        const totalCostWithFee = totalCost + fee;

        const fiatBalance = this.wallet.getFiatBalance();
        if (fiatBalance < totalCostWithFee) {
            throw new Error(
                `法币余额不足：当前余额：${fiatBalance}，` +
                `需要：${totalCostWithFee}（交易金额：${totalCost}，手续费：${fee}）`
            );
        }

        // 冻结资金
        this.wallet.subtractFiatBalance(totalCostWithFee);

        const orderId = this.generateOrderId();
        this.pendingOrders.set(orderId, {
            id: orderId,
            symbol,
            isBuy: true,
            price,
            amount,
            timestamp: Date.now()
        });

        return orderId;
    }

    /**
     * 挂卖单
     * @param symbol 交易对
     * @param price 期望卖出价格
     * @param amount 数量
     * @returns 订单ID
     */
    placeSellOrder(symbol: Symbol, price: number, amount: number): string {
        if (amount <= 0 || price <= 0) {
            throw new Error('价格和数量必须大于 0');
        }

        // 预先检查余额是否足够
        const symbolBalance = this.wallet.getBalance(symbol);
        if (symbolBalance < amount) {
            throw new Error(
                `${symbol}余额不足：当前余额：${symbolBalance}，需要：${amount}`
            );
        }

        // 冻结资产
        this.wallet.subtractBalance(symbol, amount);

        const orderId = this.generateOrderId();
        this.pendingOrders.set(orderId, {
            id: orderId,
            symbol,
            isBuy: false,
            price,
            amount,
            timestamp: Date.now()
        });

        return orderId;
    }

    /**
     * 取消订单
     * @param orderId 订单ID
     */
    cancelOrder(orderId: string): void {
        const order = this.pendingOrders.get(orderId);
        if (!order) {
            throw new Error(`订单不存在：${orderId}`);
        }

        // 解冻资产
        if (order.isBuy) {
            const totalCost = order.price * order.amount;
            const fee = totalCost * this.feeRates.limitBuy;
            this.wallet.addFiatBalance(totalCost + fee);
        } else {
            this.wallet.addBalance(order.symbol, order.amount);
        }

        this.pendingOrders.delete(orderId);
    }

    /**
     * 开空仓
     * @param symbol 交易对
     * @param amount 数量
     * @param leverage 杠杆倍数
     */
    openShort(symbol: Symbol, amount: number, leverage: number = 1): void {
        if (amount <= 0) {
            throw new Error('开仓数量必须大于 0');
        }
        if (leverage < 1) {
            throw new Error('杠杆倍数必须大于等于 1');
        }

        const price = getPrice(symbol);
        const positionValue = price * amount;
        const requiredMargin = positionValue / leverage;
        const fee = positionValue * this.feeRates.shortOpen;
        const totalRequired = requiredMargin + fee;

        // 检查余额
        if (this.wallet.getFiatBalance() < totalRequired) {
            throw new Error(
                `保证金不足：当前余额：${this.wallet.getFiatBalance()}，` +
                `需要：${totalRequired}（保证金：${requiredMargin}，手续费：${fee}）`
            );
        }

        // 冻结保证金和扣除手续费
        this.wallet.subtractFiatBalance(totalRequired);

        // 获取现有仓位
        const existingPosition = this.shortPositions.get(symbol);
        
        if (existingPosition) {
            // 如果已有仓位，计算新的均价和更新保证金
            const totalAmount = existingPosition.amount + amount;
            const totalValue = existingPosition.entryPrice * existingPosition.amount + price * amount;
            const newEntryPrice = totalValue / totalAmount;
            
            // 更新仓位信息
            this.shortPositions.set(symbol, {
                ...existingPosition,
                amount: totalAmount,
                entryPrice: newEntryPrice,
                margin: existingPosition.margin + requiredMargin,
                leverage: existingPosition.leverage, // 保持原有杠杆率不变（假设追加仓位使用相同杠杆）
                timestamp: existingPosition.timestamp // 保持原有开仓时间
            });
        } else {
            // 创建新仓位
            this.shortPositions.set(symbol, {
                symbol,
                amount,
                entryPrice: price,
                leverage,
                margin: requiredMargin,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 平空仓
     * @param symbol 交易对
     */
    closeShort(symbol: Symbol): void {
        const position = this.shortPositions.get(symbol);
        if (!position) {
            throw new Error('空单不存在');
        }

        const currentPrice = getPrice(symbol);
        const positionValue = currentPrice * position.amount;
        const fee = positionValue * this.feeRates.shortClose;
        const pnl = (position.entryPrice - currentPrice) * position.amount;

        // 解冻保证金并结算盈亏
        this.wallet.addFiatBalance(position.margin + pnl - fee);
        this.shortPositions.delete(symbol);
    }

    /**
     * 获取空单仓位信息
     * @param symbol 交易对
     */
    getShortPosition(symbol: Symbol): ShortPosition | undefined {
        return this.shortPositions.get(symbol);
    }

    /**
     * 获取所有空单仓位
     */
    getAllShortPositions(): ShortPosition[] {
        return Array.from(this.shortPositions.values());
    }

    /**
     * 计算未实现盈亏
     * @param symbol 交易对
     */
    getUnrealizedPnl(symbol: Symbol): number {
        const position = this.shortPositions.get(symbol);
        if (!position) return 0;

        const currentPrice = getPrice(symbol);
        return (position.entryPrice - currentPrice) * position.amount;
    }

    /**
     * 检查是否需要强平
     * @param symbol 交易对
     */
    checkLiquidation(symbol: Symbol): void {
        const position = this.shortPositions.get(symbol);
        if (!position) return;

        const currentPrice = getPrice(symbol);
        const unrealizedPnl = this.getUnrealizedPnl(symbol);
        const currentEquity = position.margin + unrealizedPnl;
        const positionValue = currentPrice * position.amount;

        if (currentEquity / positionValue < this.maintenanceMarginRate) {
            this.closeShort(symbol);
            throw new Error(
                `触发强平：当前权益：${currentEquity}，` +
                `仓位价值：${positionValue}，` +
                `维持保证金率：${this.maintenanceMarginRate}`
            );
        }
    }

    /**
     * 处理价格更新，检查是否有订单可以成交
     * @param symbol 交易对
     * @param newPrice 新价格
     */
    onPriceUpdate(symbol: Symbol, newPrice: number): void {
        // 检查是否需要强平
        this.checkLiquidation(symbol);

        for (const [orderId, order] of this.pendingOrders) {
            if (order.symbol !== symbol) continue;

            const shouldExecute = order.isBuy 
                ? newPrice <= order.price  // 买单：当前价格低于或等于挂单价格
                : newPrice >= order.price; // 卖单：当前价格高于或等于挂单价格

            if (shouldExecute) {
                // 执行订单
                if (order.isBuy) {
                    this.wallet.addBalance(symbol, order.amount);
                } else {
                    const totalRevenue = order.price * order.amount;
                    const fee = totalRevenue * this.feeRates.limitSell;
                    this.wallet.addFiatBalance(totalRevenue - fee);
                }
                
                this.pendingOrders.delete(orderId);
            }
        }
    }

    /**
     * 获取所有待成交订单
     */
    getPendingOrders(): PendingOrder[] {
        return Array.from(this.pendingOrders.values());
    }

    /**
     * 获取所有手续费率
     */
    getFeeRates(): FeeRates {
        return { ...this.feeRates };
    }

    /**
     * 设置手续费率
     * @param feeRates 新的手续费率配置
     */
    setFeeRates(feeRates: Partial<FeeRates>): void {
        Object.entries(feeRates).forEach(([key, rate]) => {
            if (rate < 0) {
                throw new Error(`手续费率不能为负数：${key} = ${rate}`);
            }
        });
        
        this.feeRates = {
            ...this.feeRates,
            ...feeRates
        };
    }

    /**
     * 获取所有空单的未实现盈亏总和
     */
    getTotalUnrealizedPnl(): number {
        return Array.from(this.shortPositions.values()).reduce(
            (total, position) => total + this.getUnrealizedPnl(position.symbol),
            0
        );
    }

    /**
     * 获取当前总资产价值
     * @returns 总资产价值（以法币计价）
     */
    getTotalAssetValue(): number {
        // 1. 获取钱包余额
        const fiatBalance = this.wallet.getFiatBalance();

        // 2. 计算现货资产价值
        const spotValue = Array.from(this.wallet.getAllBalances().entries()).reduce((total, [symbol, amount]) => {
            try {
                const price = getPrice(symbol);
                return total + price * amount;
            } catch {
                // 如果获取价格失败，忽略该资产
                return total;
            }
        }, 0);

        // 3. 计算空单价值（保证金 + 未实现盈亏）
        const shortValue = Array.from(this.shortPositions.values()).reduce((total, position) => {
            // 计算未实现盈亏
            const unrealizedPnl = this.getUnrealizedPnl(position.symbol);
            // 返回保证金 + 未实现盈亏
            return total + position.margin + unrealizedPnl;
        }, 0);

        // 返回总价值
        return fiatBalance + spotValue + shortValue;
    }
}
