import { Exchange } from '../exchange/exchange';
import { Wallet } from '../core/wallet';
import { Symbol, Kline, Strategy, BacktestResult } from '../types/main';
import { setPrice } from '../core/price';
import * as fs from 'fs';
import * as moment from 'moment';

/**
 * 回测类
 */
export class Backtest {
    private exchange: Exchange;
    private strategy: Strategy;
    private initialBalance: number;

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
    async run(dataFile: string, symbol: Symbol): Promise<BacktestResult> {
        // 读取数据文件
        const data = await this.loadData(dataFile);
        
        // 记录每个时间点的资产价值
        const timestamps: number[] = [];
        const assetValues: number[] = [];
        let maxBalance = this.initialBalance;
        let minDrawdown = this.initialBalance;

        // 遍历每个 K 线数据
        for (const kline of data) {
            kline.symbol = symbol;
            // 设置当前价格
            setPrice(Symbol.BTC_USDT, kline.close);
            console.log(`当前价格：${kline.close}`);

            // 执行策略
            this.strategy.execute(this.exchange, kline);

            this.exchange.onPriceUpdate(kline.symbol, kline.close);

            // 记录当前资产总值
            const currentValue = this.exchange.getTotalAssetValue();

            // 更新最大值和最小值（用于计算最大回撤）
            maxBalance = Math.max(maxBalance, currentValue);
            minDrawdown = Math.min(minDrawdown, currentValue / maxBalance - 1);

            // 记录时间点和资产价值
            timestamps.push(kline.openTime);
            assetValues.push(currentValue);
            console.log(`[${moment(new Date(kline.openTime)).format('YYYY-MM-DD HH:mm:ss')}] 当前资产总值：${currentValue}`);
        }

        // 计算最终结果
        const finalBalance = assetValues[assetValues.length - 1];
        const returns = (finalBalance - this.initialBalance) / this.initialBalance;

        return {
            timestamps,
            assetValues,
            totalTrades: this.exchange.getTotalTrades(),
            totalFees: this.exchange.getTotalFees(),
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
