import { Symbol } from '../types/main';
import { getPrice } from './price';

/**
 * 钱包类，用于管理各个交易对的余额
 */
export class Wallet {
    private balances: Map<Symbol, number>;
    private fiatBalance: number;

    constructor(fiatBalance: number) {
        this.fiatBalance = fiatBalance;
        this.balances = new Map<Symbol, number>();
    }

    /**
     * 获取指定交易对的余额
     * @param symbol 交易对
     * @returns 余额，如果不存在返回 0
     */
    getBalance(symbol: Symbol): number {
        return this.balances.get(symbol) || 0;
    }

    /**
     * 设置指定交易对的余额
     * @param symbol 交易对
     * @param amount 金额
     */
    setBalance(symbol: Symbol, amount: number): void {
        if (amount < 0) {
            throw new Error(`余额不能为负数: ${symbol} ${amount}`);
        }
        this.balances.set(symbol, amount);
    }

    /**
     * 增加指定交易对的余额
     * @param symbol 交易对
     * @param amount 增加的金额
     */
    addBalance(symbol: Symbol, amount: number): void {
        const currentBalance = this.getBalance(symbol);
        console.log(`Adding ${amount} to ${symbol}, current balance: ${currentBalance}, new balance: ${currentBalance + amount}`);
        this.setBalance(symbol, currentBalance + amount);
    }

    /**
     * 减少指定交易对的余额
     * @param symbol 交易对
     * @param amount 减少的金额
     */
    subtractBalance(symbol: Symbol, amount: number): void {
        const currentBalance = this.getBalance(symbol);
        if (currentBalance < amount) {
            throw new Error(`余额不足: ${symbol} 当前余额: ${currentBalance}, 需要: ${amount}`);
        }
        console.log(`Subtracting ${amount} from ${symbol}, current balance: ${currentBalance}, new balance: ${currentBalance - amount}`);
        this.setBalance(symbol, currentBalance - amount);
    }

    /**
     * 获取所有余额
     * @returns 所有交易对的余额Map
     */
    getAllBalances(): Map<Symbol, number> {
        return new Map(this.balances);
    }

    /**
     * 清空指定交易对的余额
     * @param symbol 交易对
     */
    clearBalance(symbol: Symbol): void {
        this.balances.delete(symbol);
    }

    /**
     * 清空所有余额
     */
    clearAllBalances(): void {
        this.balances.clear();
    }

    /**
     * 获取法币余额
     * @returns 法币余额
     */
    getFiatBalance(): number {
        return this.fiatBalance;
    }

    /**
     * 设置法币余额
     * @param amount 金额
     */
    setFiatBalance(amount: number): void {
        if (amount < 0) {
            throw new Error(`法币余额不能为负数：${amount}`);
        }
        this.fiatBalance = amount;
    }

    /**
     * 增加法币余额
     * @param amount 增加的金额
     */
    addFiatBalance(amount: number): void {
        this.setFiatBalance(this.fiatBalance + amount);
    }

    /**
     * 减少法币余额
     * @param amount 减少的金额
     */
    subtractFiatBalance(amount: number): void {
        if (this.fiatBalance < amount) {
            throw new Error(`法币余额不足：当前余额：${this.fiatBalance}, 需要：${amount}`);
        }
        this.setFiatBalance(this.fiatBalance - amount);
    }

    /**
     * 获取总资产（法币 + 所有交易对按当前价格计算的价值）
     * @param unrealizedPnl 未实现盈亏（可选）
     * @returns 总资产价值
     */
    getTotalBalance(unrealizedPnl: number = 0): number {
        let totalBalance = this.fiatBalance;
        
        for (const [symbol, amount] of this.balances) {
            try {
                const price = getPrice(symbol);
                totalBalance += amount * price;
            } catch (error) {
                console.warn(`计算总资产时出错：${error.message}`);
            }
        }
        
        return totalBalance + unrealizedPnl;
    }
}
