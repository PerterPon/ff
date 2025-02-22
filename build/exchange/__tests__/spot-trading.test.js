"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exchange_1 = require("../exchange");
const wallet_1 = require("../../core/wallet");
const main_1 = require("../../types/main");
const test_utils_1 = require("./test-utils");
jest.mock('../../core/price');
describe('Exchange - 现货交易测试', () => {
    let exchange;
    let wallet;
    const INITIAL_BALANCE = 10000;
    beforeEach(() => {
        wallet = new wallet_1.Wallet(INITIAL_BALANCE);
        exchange = new exchange_1.Exchange(wallet);
        jest.clearAllMocks();
        (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, 40000);
    });
    describe('单次买入卖出场景', () => {
        test('买入后价格上涨再卖出', () => {
            // 1. 初始买入 0.1 BTC
            const amount = 0.1;
            exchange.spotBuy(main_1.Symbol.BTC_USDT, amount);
            const buyFee = (0, test_utils_1.calculateFee)(amount, 40000, test_utils_1.FEE_RATE.spotBuy);
            // 验证买入后的总资产
            expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - buyFee, 1);
            // 2. 价格上涨到 45000
            (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, 45000);
            const expectedAfterRise = INITIAL_BALANCE - buyFee + amount * 5000; // 5000 是价差
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterRise, 1);
            // 3. 全部卖出
            exchange.spotSell(main_1.Symbol.BTC_USDT, amount);
            const sellFee = (0, test_utils_1.calculateFee)(amount, 45000, test_utils_1.FEE_RATE.spotSell);
            // 验证最终总资产（应该增加了价差收益，减去了两次手续费）
            const finalExpected = INITIAL_BALANCE + amount * 5000 - buyFee - sellFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });
        test('买入后价格下跌再卖出', () => {
            // 1. 初始买入 0.1 BTC
            const amount = 0.1;
            exchange.spotBuy(main_1.Symbol.BTC_USDT, amount);
            const buyFee = (0, test_utils_1.calculateFee)(amount, 40000, test_utils_1.FEE_RATE.spotBuy);
            // 2. 价格下跌到 35000
            (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, 35000);
            const expectedAfterDrop = INITIAL_BALANCE - buyFee - amount * 5000; // 5000 是价差
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterDrop, 1);
            // 3. 全部卖出
            exchange.spotSell(main_1.Symbol.BTC_USDT, amount);
            const sellFee = (0, test_utils_1.calculateFee)(amount, 35000, test_utils_1.FEE_RATE.spotSell);
            // 验证最终总资产（应该减去了价差损失和两次手续费）
            const finalExpected = INITIAL_BALANCE - amount * 5000 - buyFee - sellFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });
    });
    describe('多次买入卖出场景', () => {
        test('分批买入后统一卖出', () => {
            let expectedBalance = INITIAL_BALANCE;
            // 1. 第一次买入 0.1 BTC
            const amount1 = 0.1;
            exchange.spotBuy(main_1.Symbol.BTC_USDT, amount1);
            const buyFee1 = (0, test_utils_1.calculateFee)(amount1, 40000, test_utils_1.FEE_RATE.spotBuy);
            expectedBalance -= buyFee1;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedBalance, 1);
            // 2. 价格上涨到 42000 后第二次买入
            (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, 42000);
            const amount2 = 0.1;
            exchange.spotBuy(main_1.Symbol.BTC_USDT, amount2);
            const buyFee2 = (0, test_utils_1.calculateFee)(amount2, 42000, test_utils_1.FEE_RATE.spotBuy);
            expectedBalance = expectedBalance + amount1 * 2000 - buyFee2; // 加上第一笔买入的浮动盈亏
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedBalance, 1);
            // 3. 价格到 43000 后全部卖出
            (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, 43000);
            const totalAmount = amount1 + amount2;
            exchange.spotSell(main_1.Symbol.BTC_USDT, totalAmount);
            const sellFee = (0, test_utils_1.calculateFee)(totalAmount, 43000, test_utils_1.FEE_RATE.spotSell);
            // 计算最终总资产
            const profit1 = amount1 * (43000 - 40000); // 第一笔买入的利润
            const profit2 = amount2 * (43000 - 42000); // 第二笔买入的利润
            const finalExpected = INITIAL_BALANCE + profit1 + profit2 - buyFee1 - buyFee2 - sellFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });
        test('分批卖出', () => {
            // 1. 先买入 0.2 BTC @ 40000
            const totalAmount = 0.2;
            const buyPrice = 40000;
            exchange.spotBuy(main_1.Symbol.BTC_USDT, totalAmount);
            const buyFee = (0, test_utils_1.calculateFee)(totalAmount, buyPrice, test_utils_1.FEE_RATE.spotBuy);
            // 2. 价格上涨到 45000，卖出一半 (0.1 BTC)
            const sellPrice1 = 45000;
            (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, sellPrice1);
            const sellAmount1 = 0.1;
            exchange.spotSell(main_1.Symbol.BTC_USDT, sellAmount1);
            const sellFee1 = (0, test_utils_1.calculateFee)(sellAmount1, sellPrice1, test_utils_1.FEE_RATE.spotSell);
            // 计算第一次卖出后的总资产
            const initialCost = totalAmount * buyPrice; // 8000 USDT
            const sellValue1 = sellAmount1 * sellPrice1; // 4500 USDT
            const remainingAmount = totalAmount - sellAmount1; // 0.1 BTC
            const remainingValue = remainingAmount * sellPrice1; // 4500 USDT
            // 当前总资产 = 初始资金 - 总购买成本 - 买入手续费 + 第一次卖出收入 - 卖出手续费 + 剩余持仓市值
            const expectedBalance = INITIAL_BALANCE - initialCost - buyFee + sellValue1 - sellFee1 + remainingValue;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedBalance, 1);
            // 3. 价格下跌到 42000，卖出剩余部分
            const sellPrice2 = 42000;
            (0, test_utils_1.setMockPrice)(main_1.Symbol.BTC_USDT, sellPrice2);
            exchange.spotSell(main_1.Symbol.BTC_USDT, sellAmount1);
            const sellFee2 = (0, test_utils_1.calculateFee)(sellAmount1, sellPrice2, test_utils_1.FEE_RATE.spotSell);
            // 计算最终总资产
            const sellValue2 = sellAmount1 * sellPrice2; // 4200 USDT
            const finalExpected = INITIAL_BALANCE - initialCost - buyFee + sellValue1 + sellValue2 - sellFee1 - sellFee2;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });
    });
});
