"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Backtest = void 0;
const exchange_1 = require("../exchange/exchange");
const wallet_1 = require("../core/wallet");
const main_1 = require("../types/main");
const price_1 = require("../core/price");
const fs = require("fs");
const moment = require("moment");
/**
 * 回测类
 */
class Backtest {
    exchange;
    strategy;
    initialBalance;
    totalTrades = 0;
    totalFees = 0;
    /**
     * @param strategy 交易策略
     * @param initialBalance 初始资金
     */
    constructor(strategy, initialBalance = 10000) {
        this.strategy = strategy;
        this.initialBalance = initialBalance;
        const wallet = new wallet_1.Wallet(initialBalance);
        this.exchange = new exchange_1.Exchange(wallet);
    }
    /**
     * 运行回测
     * @param dataFile 数据文件路径
     * @returns 回测结果
     */
    async run(dataFile, symbol) {
        // 读取数据文件
        const data = await this.loadData(dataFile);
        // 记录每个时间点的资产价值
        const timestamps = [];
        const assetValues = [];
        let maxBalance = this.initialBalance;
        let minDrawdown = this.initialBalance;
        // 遍历每个 K 线数据
        for (const kline of data) {
            kline.symbol = symbol;
            // 设置当前价格
            (0, price_1.setPrice)(main_1.Symbol.BTC_USDT, kline.close);
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
            timestamps.push(kline.openTime);
            assetValues.push(afterTrades);
            console.log(`[${moment(new Date(kline.openTime)).format('YYYY-MM-DD HH:mm:ss')}] 当前资产总值：${afterTrades}`);
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
    async loadData(filePath) {
        try {
            const data = await fs.promises.readFile(filePath, 'utf8');
            return JSON.parse(data);
        }
        catch (error) {
            throw new Error(`读取数据文件失败：${error.message}`);
        }
    }
}
exports.Backtest = Backtest;
