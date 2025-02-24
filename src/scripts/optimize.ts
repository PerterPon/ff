import { Backtest } from '../backtest/backtest';
import { TestStrategy } from '../strategy/test';
import { DynamicHedgeGridStrategy } from '../strategy/dynamic-hedge-grid';
import * as fs from 'fs';
import * as path from 'path';
import * as echarts from 'echarts';
import { JSDOM } from 'jsdom';
import { createCanvas } from 'canvas';
import * as moment from 'moment';
import { BacktestResult, Symbol } from '../types/main';

const INITIAL_BALANCE = 100000;  // 初始资金
const MAX_ITERATIONS = 1;      // 最大循环次数
const RESULT_BASE_PATH = '/Users/pon/project/ff2';
const GOOD_RESULT_PATH = path.join(RESULT_BASE_PATH, 'good_result');
const BAD_RESULT_PATH = path.join(RESULT_BASE_PATH, 'bad_result');

/**
 * 生成图表
 */
async function generateChart(result: BacktestResult, filePath: string): Promise<void> {
    try {
        // 创建虚拟环境
        const dom = new JSDOM('<!DOCTYPE html><div id="chart" style="width:1200px;height:600px;"></div>');
        global.window = dom.window as any;
        global.navigator = dom.window.navigator;
        global.document = dom.window.document;

        // 创建 canvas
        const canvas = createCanvas(1200, 600);
        const chart = echarts.init(canvas as any);

        const option = {
            animation: false,  // 关闭动画
            title: {
                text: '策略收益曲线',
                left: 'center'
            },
            grid: {
                left: '5%',
                right: '5%',
                bottom: '10%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: result.timestamps.map(ts => moment(new Date(ts)).format('YYYY-MM-DD'))
            },
            yAxis: {
                type: 'value',
                scale: true
            },
            series: [{
                data: result.assetValues,
                type: 'line',
                smooth: true
            }]
        };

        chart.setOption(option);
        
        // 保存图表
        const buffer = canvas.toBuffer('image/png');
        await fs.promises.writeFile(filePath, buffer);
        
        // 清理资源
        chart.dispose();
        
    } catch (error) {
        console.error('生成图表失败：', error);
        throw error;
    }
}

/**
 * 生成文件名
 */
function generateFileName(iteration: number, finalBalance: number): string {
    const now = new Date();
    const timestamp = now.toISOString()
        .replace(/T/, ' ')
        .replace(/\..+/, '')
        .replace(/:/g, '-');
    return `${iteration}_${timestamp}_${finalBalance.toFixed(2)}`;
}

/**
 * 保存结果
 */
async function saveResult(result: BacktestResult, iteration: number): Promise<void> {
    // 确定保存路径
    const isGoodResult = result.finalBalance > result.initialBalance;
    const basePath = isGoodResult ? GOOD_RESULT_PATH : BAD_RESULT_PATH;
    
    // 生成文件名
    const fileName = generateFileName(iteration, result.finalBalance);
    
    // 确保目录存在
    await fs.promises.mkdir(basePath, { recursive: true });

    // 保存图表
    await generateChart(result, path.join(basePath, `${fileName}.png`));

    // 保存 JSON 结果
    delete result.timestamps;
    delete result.assetValues;
    await fs.promises.writeFile(
        path.join(basePath, `${fileName}.json`),
        JSON.stringify(result, null, 2)
    );
}

/**
 * 清理 bad_result 目录
 */
async function cleanBadResults(): Promise<void> {
    try {
        await fs.promises.rm(BAD_RESULT_PATH, { recursive: true, force: true });
        await fs.promises.mkdir(BAD_RESULT_PATH, { recursive: true });
    } catch (error) {
        console.error('清理 bad_result 目录失败：', error);
    }
}

/**
 * 生成网格策略参数
 * @returns DynamicHedgeGridStrategy 的配置参数
 */
function generateGridConfig() {
    // 随机生成网格宽度（0.5% - 2%）
    const gridWidth = Number((Math.random() * 0.015 + 0.005).toFixed(3));
    
    // 随机生成网格数量（6-20）
    const gridCount = Math.floor(Math.random() * 15) + 6;
    
    // 随机生成投资额（500-5000）
    const totalInvestment = INITIAL_BALANCE;
    
    // 随机生成价格位置（0-100%）
    const pricePosition = Number((Math.random() * 100).toFixed(2));
    
    // 随机生成止盈比例（1.05-1.20，即 5%-20%）
    const takeProfitRatio = Number((Math.random() * 0.15 + 1.05).toFixed(2));
    
    // 随机生成止损比例（0.80-0.95，即 -20%--5%）
    const stopLossRatio = Number((Math.random() * 0.15 + 0.80).toFixed(2));

    return {
        gridWidth,
        gridCount,
        totalInvestment,
        pricePosition,
        takeProfitRatio,
        stopLossRatio
    };
}

/**
 * 运行回测并记录结果
 */
async function runBacktest(config: ReturnType<typeof generateGridConfig>): Promise<BacktestResult> {
    const strategy = new DynamicHedgeGridStrategy({
        gridWidth: config.gridWidth,
        gridCount: config.gridCount,
        totalInvestment: config.totalInvestment,
        pricePosition: config.pricePosition,
        // 止盈止损价格在策略内部根据当前价格动态设置
    });

    const backtest = new Backtest(strategy, INITIAL_BALANCE);
    return await backtest.run('/Users/pon/project/ff2/data/btc_better.json', Symbol.BTC_USDT);
}

/**
 * 主函数
 */
async function main() {
    // 清理 bad_result 目录
    await cleanBadResults();

    // 记录最佳结果
    let bestResult: BacktestResult | null = null;
    let bestConfig: ReturnType<typeof generateGridConfig> | null = null;

    // 开始优化循环
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        console.log(`开始第 ${i + 1} 次回测...`);

        try {
            // 生成新的配置
            const config = generateGridConfig();
            console.log('当前配置:', {
                网格宽度: `${(config.gridWidth * 100).toFixed(2)}%`,
                网格数量: config.gridCount,
                投资额: config.totalInvestment,
                价格位置: `${config.pricePosition}%`,
                止盈比例: `${((config.takeProfitRatio - 1) * 100).toFixed(2)}%`,
                止损比例: `${((config.stopLossRatio - 1) * 100).toFixed(2)}%`
            });

            // 运行回测
            const result = await runBacktest(config);

            // 更新最佳结果
            if (!bestResult || result.returns > bestResult.returns) {
                bestResult = result;
                bestConfig = config;
                console.log('发现新的最佳配置！');
            }

            // 保存结果
            await saveResult(result, i + 1);

            // 输出回测结果
            console.log('回测完成：', {
                循环次数: i + 1,
                初始资金: result.initialBalance,
                最终资金: result.finalBalance.toFixed(2),
                总收益率: `${(result.returns * 100).toFixed(2)}%`,
                最大回撤: `${(result.maxDrawdown * 100).toFixed(2)}%`,
                总交易次数: result.totalTrades,
                总手续费: result.totalFees.toFixed(2)
            });
        } catch (error) {
            console.error(`第 ${i + 1} 次回测失败:`, error);
        }
    }

    // 输出最佳结果
    if (bestResult && bestConfig) {
        console.log('\n最佳配置：', {
            网格宽度: `${(bestConfig.gridWidth * 100).toFixed(2)}%`,
            网格数量: bestConfig.gridCount,
            投资额: bestConfig.totalInvestment,
            价格位置: `${bestConfig.pricePosition}%`,
            止盈比例: `${((bestConfig.takeProfitRatio - 1) * 100).toFixed(2)}%`,
            止损比例: `${((bestConfig.stopLossRatio - 1) * 100).toFixed(2)}%`,
            最终收益率: `${(bestResult.returns * 100).toFixed(2)}%`,
            最大回撤: `${(bestResult.maxDrawdown * 100).toFixed(2)}%`
        });
    }
}

// 运行主函数
main().catch(console.error);
