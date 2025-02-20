import { Exchange } from '../exchange/exchange';
import { Wallet } from '../core/wallet';
import { Symbol, Kline, Strategy, BacktestResult } from '../types/main';
import { setPrice } from '../core/price';
import * as fs from 'fs';

/**
 * 回测类
 */
export class Backtest {
    private exchange: Exchange;
    private strategy: Strategy;
    private initialBalance: number;
    private totalTrades: number = 0;
    private totalFees: number = 0;

    /**
     * @param strategy 交易策略
     * @param initialBalance 初始资金
     */
    constructor(strategy: Strategy, initialBalance: number = 10000) {
        this.strategy = strategy;
        this.initialBalance = initialBalance;
        const wallet = new Wallet(initialBalance);
        this.exchange = new Exchange(wallet);
    }

    /**
     * 运行回测
     * @param dataFile 数据文件路径
     * @returns 回测结果
     */
    async run(dataFile: string): Promise<BacktestResult> {
        // 读取数据文件
        const data = await this.loadData(dataFile);
        
        // 记录每个时间点的资产价值
        const timestamps: number[] = [];
        const assetValues: number[] = [];
        let maxBalance = this.initialBalance;
        let minDrawdown = this.initialBalance;

        // 遍历每个 K 线数据
        for (const kline of data) {
            // 设置当前价格
            setPrice(Symbol.BTC_USDT, kline.close);
            console.log(`当前价格：${kline.close}`);

            // 记录交易前的资产总值
            const beforeTrades = this.exchange.getTotalAssetValue();

            // 执行策略
            this.strategy.execute(this.exchange, kline);

            // 记录交易后的资产总值
            const afterTrades = this.exchange.getTotalAssetValue();

            // 如果资产总值发生变化，说明有交易发生
            if (beforeTrades !== afterTrades) {
                this.totalTrades++;
                // 假设资产值的减少就是手续费（这是个简化的计算方式）
                this.totalFees += Math.max(0, beforeTrades - afterTrades);
            }

            // 更新最大值和最小值（用于计算最大回撤）
            maxBalance = Math.max(maxBalance, afterTrades);
            minDrawdown = Math.min(minDrawdown, afterTrades / maxBalance - 1);

            // 记录时间点和资产价值
            timestamps.push(kline.timestamp);
            assetValues.push(afterTrades);
            console.log(`当前资产总值：${afterTrades}`);
        }

        // 计算最终结果
        const finalBalance = assetValues[assetValues.length - 1];
        const returns = (finalBalance - this.initialBalance) / this.initialBalance;

        return {
            timestamps,
            assetValues,
            totalTrades: this.totalTrades,
            totalFees: this.totalFees,
            initialBalance: this.initialBalance,
            finalBalance,
            maxDrawdown: minDrawdown,
            returns
        };
    }

    /**
     * 加载数据文件
     * @param filePath 文件路径
     * @returns K 线数据数组
     */
    private async loadData(filePath: string): Promise<Kline[]> {
        try {
            const data = await fs.promises.readFile(filePath, 'utf8');
            return JSON.parse(data) as Kline[];
        } catch (error) {
            throw new Error(`读取数据文件失败：${error.message}`);
        }
    }
}
