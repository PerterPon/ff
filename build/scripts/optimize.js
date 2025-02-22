"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const backtest_1 = require("../backtest/backtest");
const dynamic_hedge_grid_1 = require("../strategy/dynamic-hedge-grid");
const fs = require("fs");
const path = require("path");
const echarts = require("echarts");
const jsdom_1 = require("jsdom");
const canvas_1 = require("canvas");
const INITIAL_BALANCE = 100000; // 初始资金
const MAX_ITERATIONS = 1; // 最大循环次数
const RESULT_BASE_PATH = '/Users/pon/project/ff2';
const GOOD_RESULT_PATH = path.join(RESULT_BASE_PATH, 'good_result');
const BAD_RESULT_PATH = path.join(RESULT_BASE_PATH, 'bad_result');
/**
 * 生成图表
 */
async function generateChart(result, filePath) {
    try {
        // 创建虚拟环境
        const dom = new jsdom_1.JSDOM('<!DOCTYPE html><div id="chart" style="width:1200px;height:600px;"></div>');
        global.window = dom.window;
        global.navigator = dom.window.navigator;
        global.document = dom.window.document;
        // 创建 canvas
        const canvas = (0, canvas_1.createCanvas)(1200, 600);
        const chart = echarts.init(canvas);
        const option = {
            animation: false, // 关闭动画
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
                data: result.timestamps.map(ts => new Date(ts).toLocaleString())
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
    }
    catch (error) {
        console.error('生成图表失败：', error);
        throw error;
    }
}
/**
 * 生成文件名
 */
function generateFileName(iteration, finalBalance) {
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
async function saveResult(result, iteration) {
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
    await fs.promises.writeFile(path.join(basePath, `${fileName}.json`), JSON.stringify(result, null, 2));
}
/**
 * 清理 bad_result 目录
 */
async function cleanBadResults() {
    try {
        await fs.promises.rm(BAD_RESULT_PATH, { recursive: true, force: true });
        await fs.promises.mkdir(BAD_RESULT_PATH, { recursive: true });
    }
    catch (error) {
        console.error('清理 bad_result 目录失败：', error);
    }
}
/**
 * 主函数
 */
async function main() {
    // 清理 bad_result 目录
    await cleanBadResults();
    // 开始优化循环
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        console.log(`开始第 ${i + 1} 次回测...`);
        try {
            // 创建策略实例
            const strategy = new dynamic_hedge_grid_1.DynamicHedgeGridStrategy();
            const backtest = new backtest_1.Backtest(strategy, INITIAL_BALANCE);
            // 运行回测
            const result = await backtest.run('/Users/pon/project/ff2/data/test.json');
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
        }
        catch (error) {
            console.error(`第 ${i + 1} 次回测失败:`, error);
        }
    }
}
// 运行主函数
main().catch(console.error);
