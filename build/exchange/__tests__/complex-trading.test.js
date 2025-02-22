"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exchange_1 = require("../exchange");
const wallet_1 = require("../../core/wallet");
const main_1 = require("../../types/main");
const price_1 = require("../../core/price");
const test_utils_1 = require("./test-utils");
jest.mock('../../core/price');
describe('复杂交易场景测试', () => {
    let wallet;
    let exchange;
    const INITIAL_BALANCE = 10000;
    beforeEach(() => {
        wallet = new wallet_1.Wallet(INITIAL_BALANCE);
        exchange = new exchange_1.Exchange(wallet, test_utils_1.FEE_RATE);
        price_1.getPrice.mockImplementation(() => 40000);
    });
    test('现货交易 + 价格波动场景', () => {
        // 1. 现货买入 0.1 BTC @ 40000
        exchange.spotBuy(main_1.Symbol.BTC_USDT, 0.1);
        // 计算资产价值
        // - 法币余额：10000 - (40000 * 0.1) - (40000 * 0.1 * 0.001) = 5996
        // - 持仓价值：0.1 * 40000 = 4000
        // 总资产：9996
        expect(exchange.getTotalAssetValue()).toBeCloseTo(9996, 1);
        // 2. 价格上涨到 42000
        price_1.getPrice.mockImplementation(() => 42000);
        // 计算资产价值
        // - 法币余额：5996
        // - 持仓价值：0.1 * 42000 = 4200
        // 总资产：10196
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10196, 1);
        // 3. 卖出 0.05 BTC @ 42000
        exchange.spotSell(main_1.Symbol.BTC_USDT, 0.05);
        // 计算资产价值
        // - 卖出收入：(42000 * 0.05) * (1 - 0.001) = 2097.9
        // - 法币余额：5996 + 2097.9 = 8093.9
        // - 剩余持仓：0.05 * 42000 = 2100
        // 总资产：10193.9
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10193.9, 1);
    });
    test('挂单 + 价格波动场景', () => {
        // 1. 挂买单 0.1 BTC @ 39000
        const orderId = exchange.placeBuyOrder(main_1.Symbol.BTC_USDT, 0.1, 39000);
        // 计算资产价值
        // - 冻结资金：(39000 * 0.1) * (1 + 0.002) = 3907.8
        // - 可用余额：10000 - 3907.8 = 6092.2
        // 总资产：10000
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10000, 1);
        // 2. 价格下跌到 39000，触发买单
        price_1.getPrice.mockImplementation(() => 39000);
        exchange.onPriceUpdate(main_1.Symbol.BTC_USDT, 39000);
        // 计算资产价值
        // - 法币余额：6092.2
        // - 持仓价值：0.1 * 39000 = 3900
        // 总资产：9992.2
        expect(exchange.getTotalAssetValue()).toBeCloseTo(9992.2, 1);
    });
    test('空单 + 价格波动场景', () => {
        // 1. 开空仓 0.1 BTC @ 40000，10 倍杠杆
        exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 10);
        // 计算资产价值
        // - 保证金：(40000 * 0.1) / 10 = 400
        // - 开仓手续费：40000 * 0.1 * 0.001 = 4
        // - 可用余额：10000 - 400 - 4 = 9596
        // 总资产：9996
        expect(exchange.getTotalAssetValue()).toBeCloseTo(9996, 1);
        // 2. 价格下跌到 38000
        price_1.getPrice.mockImplementation(() => 38000);
        exchange.onPriceUpdate(main_1.Symbol.BTC_USDT, 38000);
        // 计算资产价值
        // - 可用余额：9596
        // - 未实现盈亏：(40000 - 38000) * 0.1 = 200
        // - 保证金：400
        // 总资产：10196
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10196, 1);
        // 3. 平仓 @ 38000
        exchange.closeShort(main_1.Symbol.BTC_USDT);
        // 计算资产价值
        // - 平仓手续费：38000 * 0.1 * 0.001 = 3.8
        // - 最终余额：9596 + 400 + 200 - 3.8 = 10192.2
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10192.2, 1);
    });
    test('混合交易场景', () => {
        // 1. 现货买入 0.1 BTC @ 40000
        exchange.spotBuy(main_1.Symbol.BTC_USDT, 0.1);
        // 2. 同时开空仓 0.05 BTC @ 40000，10 倍杠杆
        exchange.openShort(main_1.Symbol.BTC_USDT, 0.05, 10);
        // 计算资产价值
        // - 现货买入成本：40000 * 0.1 * (1 + 0.001) = 4004
        // - 空仓保证金：(40000 * 0.05) / 10 = 200
        // - 空仓手续费：40000 * 0.05 * 0.001 = 2
        // - 可用余额：10000 - 4004 - 200 - 2 = 5794
        // - 持仓价值：0.1 * 40000 = 4000
        // 总资产：9994
        expect(exchange.getTotalAssetValue()).toBeCloseTo(9994, 1);
        // 3. 价格波动到 41000
        price_1.getPrice.mockImplementation(() => 41000);
        exchange.onPriceUpdate(main_1.Symbol.BTC_USDT, 41000);
        // 计算资产价值
        // - 可用余额：5794
        // - 现货持仓价值：0.1 * 41000 = 4100
        // - 空仓未实现盈亏：(40000 - 41000) * 0.05 = -50
        // - 空仓保证金：200
        // 总资产：10044
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10044, 1);
        // 4. 挂卖单 0.05 BTC @ 42000
        exchange.placeSellOrder(main_1.Symbol.BTC_USDT, 42000, 0.05);
        // 计算资产价值
        // - 可用余额：5794
        // - 现货持仓价值：0.05 * 41000 = 2050
        // - 挂单价值：0.05 * 41000 = 2050
        // - 空仓未实现盈亏：-50
        // - 空仓保证金：200
        // 总资产：10044
        expect(exchange.getTotalAssetValue()).toBeCloseTo(10044, 1);
    });
});
