"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exchange_1 = require("./exchange");
const wallet_1 = require("../core/wallet");
const price_1 = require("../core/price");
const main_1 = require("../types/main");
// Mock price.ts
jest.mock('../core/price', () => ({
    getPrice: jest.fn(),
    setPrice: jest.fn()
}));
describe('Exchange 类测试', () => {
    let exchange;
    let wallet;
    const INITIAL_BALANCE = 100000; // 定义初始余额常量
    beforeEach(() => {
        wallet = new wallet_1.Wallet(INITIAL_BALANCE);
        exchange = new exchange_1.Exchange(wallet);
        jest.clearAllMocks();
        price_1.getPrice.mockReturnValue(40000); // 设置默认价格
    });
    // describe('手续费率管理', () => {
    //     test('应该使用默认手续费率', () => {
    //         const rates = exchange.getFeeRates();
    //         expect(rates).toEqual({
    //             spotBuy: 0.001,    // 0.1%
    //             spotSell: 0.001,   // 0.1%
    //             limitBuy: 0.002,   // 0.02%
    //             limitSell: 0.002,  // 0.02%
    //             shortOpen: 0.001,  // 0.1%
    //             shortClose: 0.001, // 0.1%
    //         });
    //     });
    //     test('应该能够设置自定义手续费率', () => {
    //         const customRates = {
    //             spotBuy: 0.002,
    //             limitSell: 0.001,
    //         };
    //         exchange.setFeeRates(customRates);
    //         const rates = exchange.getFeeRates();
    //         expect(rates.spotBuy).toBe(0.002);
    //         expect(rates.limitSell).toBe(0.001);
    //         // 未修改的费率应保持默认值
    //         expect(rates.spotSell).toBe(0.001);
    //         expect(rates.limitBuy).toBe(0.002);
    //     });
    //     test('设置负数手续费率应该抛出错误', () => {
    //         expect(() => exchange.setFeeRates({ spotBuy: -0.001 }))
    //             .toThrow('手续费率不能为负数');
    //     });
    // });
    describe('现货交易', () => {
        describe('现货买入', () => {
            beforeEach(() => {
                wallet = new wallet_1.Wallet(INITIAL_BALANCE);
                exchange = new exchange_1.Exchange(wallet);
            });
            test('成功买入应该更新余额', () => {
                exchange.spotBuy(main_1.Symbol.BTC_USDT, 0.1); // 买入 0.1 BTC
                // 检查法币扣除（包含手续费）
                // 总成本 = 40000 * 0.1 = 4000
                // 手续费 = 4000 * 0.001 = 4
                // 总支出 = 4004
                expect(wallet.getFiatBalance()).toBe(INITIAL_BALANCE - 4004);
                // 检查 BTC 增加
                expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(0.1);
                // 验证总资产价值
                // 法币余额：96000
                // BTC 价值：0.1 * 40000 = 4000
                // 总资产：99996 (扣除手续费 4)
                expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - 4, 1);
            });
            test('余额不足应该抛出错误', () => {
                // 尝试买入超过余额的数量
                expect(() => exchange.spotBuy(main_1.Symbol.BTC_USDT, 3))
                    .toThrow('法币余额不足');
                // 验证总资产价值不变
                expect(exchange.getTotalAssetValue()).toBe(INITIAL_BALANCE);
            });
        });
        describe('现货卖出', () => {
            beforeEach(() => {
                wallet = new wallet_1.Wallet(INITIAL_BALANCE);
                exchange = new exchange_1.Exchange(wallet);
                // 先买入一些资产用于测试
                exchange.spotBuy(main_1.Symbol.BTC_USDT, 0.5);
            });
            test('成功卖出应该更新余额', () => {
                const initialAssets = exchange.getTotalAssetValue();
                exchange.spotSell(main_1.Symbol.BTC_USDT, 0.2);
                // 检查 BTC 减少
                expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(0.3);
                // 检查法币增加（扣除手续费）
                // 卖出收入 = 40000 * 0.2 = 8000
                // 手续费 = 8000 * 0.001 = 8
                // 净收入 = 7992
                const expectedFiatBalance = INITIAL_BALANCE - 20020 + 7992; // 初始 - 买入成本 + 卖出收入
                expect(wallet.getFiatBalance()).toBeCloseTo(expectedFiatBalance, 1);
                // 验证总资产价值（应该只减少手续费）
                expect(exchange.getTotalAssetValue()).toBeCloseTo(initialAssets - 8, 1);
            });
        });
    });
    describe('挂单交易', () => {
        beforeEach(() => {
            price_1.getPrice.mockReturnValue(40000);
        });
        describe('挂买单', () => {
            test('成功挂单应该冻结资金', () => {
                const orderId = exchange.placeBuyOrder(main_1.Symbol.BTC_USDT, 39000, 0.1);
                // 检查冻结资金（包含手续费）
                // 总成本 = 39000 * 0.1 = 3900
                // 手续费 = 3900 * 0.002 = 7.8
                // 总冻结 = 3907.8
                expect(wallet.getFiatBalance()).toBeCloseTo(INITIAL_BALANCE - 3907.8);
                // 检查订单记录
                const orders = exchange.getPendingOrders();
                expect(orders).toHaveLength(1);
                expect(orders[0]).toEqual({
                    id: orderId,
                    symbol: main_1.Symbol.BTC_USDT,
                    isBuy: true,
                    price: 39000,
                    amount: 0.1,
                    timestamp: expect.any(Number)
                });
            });
            test('余额不足应该抛出错误', () => {
                // 尝试挂单买入超过余额的数量
                // 3 BTC = 120000 USDT > 100000 USDT
                expect(() => exchange.placeBuyOrder(main_1.Symbol.BTC_USDT, 40000, 3))
                    .toThrow('法币余额不足');
            });
        });
        describe('挂卖单', () => {
            beforeEach(() => {
                // 先买入足够的资产用于测试
                exchange.spotBuy(main_1.Symbol.BTC_USDT, 1);
            });
            test('成功挂单应该冻结资产', () => {
                const orderId = exchange.placeSellOrder(main_1.Symbol.BTC_USDT, 41000, 0.1);
                // 1 BTC - 0.1 BTC = 0.9 BTC
                expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(0.9);
                // 检查订单记录
                const orders = exchange.getPendingOrders();
                expect(orders).toHaveLength(1);
                expect(orders[0]).toEqual({
                    id: orderId,
                    symbol: main_1.Symbol.BTC_USDT,
                    isBuy: false,
                    price: 41000,
                    amount: 0.1,
                    timestamp: expect.any(Number)
                });
            });
            test('余额不足应该抛出错误', () => {
                // 尝试卖出超过持有量的数量
                // 持有 1 BTC，尝试卖出 1.5 BTC
                expect(() => exchange.placeSellOrder(main_1.Symbol.BTC_USDT, 41000, 1.5))
                    .toThrow('余额不足');
            });
        });
        describe('订单管理', () => {
            let buyOrderId;
            let sellOrderId;
            beforeEach(() => {
                // 确保有足够的资金和资产进行测试
                buyOrderId = exchange.placeBuyOrder(main_1.Symbol.BTC_USDT, 39000, 0.1);
                exchange.spotBuy(main_1.Symbol.BTC_USDT, 0.2);
                sellOrderId = exchange.placeSellOrder(main_1.Symbol.BTC_USDT, 41000, 0.1);
            });
            test('应该能够取消买单', () => {
                const initialBalance = wallet.getFiatBalance();
                exchange.cancelOrder(buyOrderId);
                // 检查资金解冻
                // 总成本 = 39000 * 0.1 = 3900
                // 手续费 = 3900 * 0.002 = 7.8
                // 总解冻 = 3907.8
                expect(wallet.getFiatBalance()).toBe(initialBalance + 3907.8);
                expect(exchange.getPendingOrders()).toHaveLength(1);
            });
            test('应该能够取消卖单', () => {
                const initialBalance = wallet.getBalance(main_1.Symbol.BTC_USDT);
                exchange.cancelOrder(sellOrderId);
                expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(initialBalance + 0.1);
                expect(exchange.getPendingOrders()).toHaveLength(1);
            });
            test('取消不存在的订单应该抛出错误', () => {
                expect(() => exchange.cancelOrder('non_existent_id'))
                    .toThrow('订单不存在');
            });
        });
        describe('价格更新', () => {
            beforeEach(() => {
                // 确保有足够的资金和资产进行测试
                exchange.placeBuyOrder(main_1.Symbol.BTC_USDT, 39000, 0.1);
                exchange.spotBuy(main_1.Symbol.BTC_USDT, 0.2);
                exchange.placeSellOrder(main_1.Symbol.BTC_USDT, 41000, 0.1);
            });
            test('价格低于买单价格时应该成交', () => {
                const initialBtcBalance = wallet.getBalance(main_1.Symbol.BTC_USDT);
                exchange.onPriceUpdate(main_1.Symbol.BTC_USDT, 38000);
                expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(initialBtcBalance + 0.1);
                expect(exchange.getPendingOrders()).toHaveLength(1); // 只剩卖单
                expect(exchange.getTotalAssetValue()).toBeCloseTo(96084.2, 1);
            });
            test('价格高于卖单价格时应该成交', () => {
                const initialBalance = wallet.getFiatBalance();
                exchange.onPriceUpdate(main_1.Symbol.BTC_USDT, 42000);
                // 检查卖单成交收入
                // 总收入 = 41000 * 0.1 = 4100
                // 手续费 = 4100 * 0.002 = 8.2
                // 净收入 = 4091.8
                expect(wallet.getFiatBalance()).toBe(initialBalance + 4091.8);
                expect(exchange.getPendingOrders()).toHaveLength(1); // 只剩买单
            });
            test('价格在买卖单之间时不应该成交', () => {
                exchange.onPriceUpdate(main_1.Symbol.BTC_USDT, 40000);
                expect(exchange.getPendingOrders()).toHaveLength(2);
            });
        });
    });
    describe('空单交易', () => {
        describe('开空仓', () => {
            beforeEach(() => {
                wallet = new wallet_1.Wallet(INITIAL_BALANCE);
                exchange = new exchange_1.Exchange(wallet);
            });
            test('成功开仓应该扣除保证金和手续费', () => {
                exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2);
                // 保证金 = 40000 * 0.1 / 2 = 2000
                // 手续费 = 40000 * 0.1 * 0.001 = 4
                // 总扣除 = 2004
                expect(wallet.getFiatBalance()).toBe(INITIAL_BALANCE - 2004);
                const position = exchange.getShortPosition(main_1.Symbol.BTC_USDT);
                expect(position).toBeDefined();
                expect(position?.amount).toBe(0.1);
                expect(position?.entryPrice).toBe(40000);
                expect(position?.leverage).toBe(2);
                expect(position?.margin).toBe(2000);
                // 验证总资产价值（应该只减少手续费）
                expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - 4, 1);
            });
            test('追加开仓应该正确计算均价和保证金', () => {
                // 第一次开仓
                exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2);
                // 价格上涨到 42000
                price_1.getPrice.mockReturnValue(42000);
                // 追加开仓
                exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2);
                const position = exchange.getShortPosition(main_1.Symbol.BTC_USDT);
                expect(position?.amount).toBe(0.2);
                expect(position?.entryPrice).toBe(41000); // (40000 + 42000) / 2
                expect(position?.margin).toBe(4100); // (2000 + 2100)
                // 验证总资产价值（考虑未实现亏损和手续费）
                // 第一次开仓手续费：40000 * 0.1 * 0.001 = 4
                // 第二次开仓手续费：42000 * 0.1 * 0.001 = 4.2
                // 未实现亏损：(41000 - 42000) * 0.2 = -200
                expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - 8.2 - 200, 1);
            });
        });
        describe('平空仓', () => {
            beforeEach(() => {
                wallet = new wallet_1.Wallet(INITIAL_BALANCE);
                exchange = new exchange_1.Exchange(wallet);
                exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2);
            });
            test('盈利平仓应该正确结算', () => {
                // 价格下跌到 38000
                price_1.getPrice.mockReturnValue(38000);
                // 平仓前的总资产
                const beforeClose = exchange.getTotalAssetValue();
                exchange.closeShort(main_1.Symbol.BTC_USDT);
                // 计算收益
                // 保证金 = 2000
                // 盈利 = (40000 - 38000) * 0.1 = 200
                // 平仓手续费 = 38000 * 0.1 * 0.001 = 3.8
                // 返还金额 = 2000 + 200 - 3.8 = 2196.2
                expect(wallet.getFiatBalance()).toBeCloseTo(INITIAL_BALANCE - 2004 + 2196.2, 1);
                expect(exchange.getShortPosition(main_1.Symbol.BTC_USDT)).toBeUndefined();
                // 验证总资产价值（应该减少平仓手续费）
                expect(exchange.getTotalAssetValue()).toBeCloseTo(beforeClose - 3.8, 1);
            });
            test('亏损平仓应该正确结算', () => {
                // 价格上涨到 42000
                price_1.getPrice.mockReturnValue(42000);
                // 平仓前的总资产
                const beforeClose = exchange.getTotalAssetValue();
                exchange.closeShort(main_1.Symbol.BTC_USDT);
                // 计算亏损
                // 保证金 = 2000
                // 亏损 = (40000 - 42000) * 0.1 = -200
                // 平仓手续费 = 42000 * 0.1 * 0.001 = 4.2
                // 返还金额 = 2000 - 200 - 4.2 = 1795.8
                expect(wallet.getFiatBalance()).toBeCloseTo(INITIAL_BALANCE - 2004 + 1795.8, 1);
                expect(exchange.getShortPosition(main_1.Symbol.BTC_USDT)).toBeUndefined();
                // 验证总资产价值（应该减少平仓手续费）
                expect(exchange.getTotalAssetValue()).toBeCloseTo(beforeClose - 4.2, 1);
            });
        });
        describe('强平机制', () => {
            beforeEach(() => {
                wallet = new wallet_1.Wallet(INITIAL_BALANCE);
                exchange = new exchange_1.Exchange(wallet);
                exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2);
            });
            test('价格上涨超过维持保证金率应该触发强平', () => {
                // 开仓价格 40000，仓位 0.1，保证金 2000
                // 维持保证金率 5%
                // 当前权益 / 仓位价值 < 5% 时强平
                // 价格上涨到 80000（确保一定会触发强平）
                price_1.getPrice.mockReturnValue(80000);
                // 当前权益 = 2000 + (40000 - 80000) * 0.1 = -2000
                // 仓位价值 = 80000 * 0.1 = 8000
                // 维持保证金率 = -2000 / 8000 = -0.25 < 0.05
                expect(() => exchange.checkLiquidation(main_1.Symbol.BTC_USDT))
                    .toThrow('触发强平');
                expect(exchange.getShortPosition(main_1.Symbol.BTC_USDT)).toBeUndefined();
                // 验证总资产价值（应该减少强平损失和手续费）
                // 开仓手续费：4
                // 强平亏损：4000
                // 强平手续费：8
                expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - 4012, 1);
            });
        });
    });
    describe('未实现盈亏计算', () => {
        beforeEach(() => {
            exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2);
        });
        test('价格下跌应该计算正确的未实现盈利', () => {
            price_1.getPrice.mockReturnValue(38000);
            // 盈利 = (40000 - 38000) * 0.1 = 200
            expect(exchange.getUnrealizedPnl(main_1.Symbol.BTC_USDT)).toBe(200);
        });
        test('价格上涨应该计算正确的未实现亏损', () => {
            price_1.getPrice.mockReturnValue(42000);
            // 亏损 = (40000 - 42000) * 0.1 = -200
            expect(exchange.getUnrealizedPnl(main_1.Symbol.BTC_USDT)).toBe(-200);
        });
        test('不存在的仓位应该返回 0', () => {
            expect(exchange.getUnrealizedPnl(main_1.Symbol.ETH_USDT)).toBe(0);
        });
    });
    describe('未实现盈亏总和', () => {
        beforeEach(() => {
            wallet = new wallet_1.Wallet(INITIAL_BALANCE);
            exchange = new exchange_1.Exchange(wallet);
            // 先设置初始价格用于开仓
            price_1.getPrice.mockImplementation((symbol) => {
                if (symbol === main_1.Symbol.BTC_USDT)
                    return 40000;
                if (symbol === main_1.Symbol.ETH_USDT)
                    return 2000;
                throw new Error('未知交易对');
            });
            // 开两个空仓位
            exchange.openShort(main_1.Symbol.BTC_USDT, 0.1, 2); // 40000 价格开仓
            exchange.openShort(main_1.Symbol.ETH_USDT, 1, 2); // 2000 价格开仓
            // 计算开仓后的总资产（扣除手续费）
            // BTC 手续费：40000 * 0.1 * 0.001 = 4
            // ETH 手续费：2000 * 1 * 0.001 = 2
            const expectedInitialAssets = INITIAL_BALANCE - 6;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedInitialAssets, 1);
            // 重置 mock 实现，设置新的价格用于计算盈亏
            price_1.getPrice.mockImplementation((symbol) => {
                if (symbol === main_1.Symbol.BTC_USDT)
                    return 38000; // BTC 下跌，盈利 200
                if (symbol === main_1.Symbol.ETH_USDT)
                    return 2200; // ETH 上涨，亏损 200
                throw new Error('未知交易对');
            });
        });
        test('应该正确计算所有空单的未实现盈亏总和', () => {
            // BTC 盈利 = (40000 - 38000) * 0.1 = 200
            // ETH 亏损 = (2000 - 2200) * 1 = -200
            // 总计 = 0
            const pnl = exchange.getTotalUnrealizedPnl();
            expect(Math.abs(pnl)).toBeLessThan(0.000001); // 使用绝对值判断是否接近 0
            // 验证总资产价值（应该只减少手续费）
            expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - 6, 1);
        });
        test('没有空单时应该返回 0', () => {
            const beforeCloseAssets = exchange.getTotalAssetValue();
            // 清空所有空单
            exchange.closeShort(main_1.Symbol.BTC_USDT);
            exchange.closeShort(main_1.Symbol.ETH_USDT);
            expect(exchange.getTotalUnrealizedPnl()).toBe(0);
            // 验证总资产价值（应该减少平仓手续费）
            // BTC 平仓手续费：38000 * 0.1 * 0.001 = 3.8
            // ETH 平仓手续费：2200 * 1 * 0.001 = 2.2
            expect(exchange.getTotalAssetValue()).toBeCloseTo(beforeCloseAssets - 6, 1);
        });
        test('价格大幅波动时应该正确计算盈亏', () => {
            // 价格剧烈变化
            price_1.getPrice.mockImplementation((symbol) => {
                if (symbol === main_1.Symbol.BTC_USDT)
                    return 36000; // BTC 大跌，盈利 400
                if (symbol === main_1.Symbol.ETH_USDT)
                    return 2400; // ETH 大涨，亏损 400
                throw new Error('未知交易对');
            });
            const pnl = exchange.getTotalUnrealizedPnl();
            expect(Math.abs(pnl)).toBeLessThan(0.000001); // 总盈亏仍然为 0
            // 验证总资产价值（应该只减少手续费）
            expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE - 6, 1);
        });
    });
    describe('复杂交易场景', () => {
        beforeEach(() => {
            wallet = new wallet_1.Wallet(10000); // 初始余额 10000
            exchange = new exchange_1.Exchange(wallet);
            price_1.getPrice.mockReturnValue(100); // BTC 初始价格 100
        });
        test('应该正确处理多个交易操作的组合', () => {
            // 1. 买入 1 BTC
            exchange.spotBuy(main_1.Symbol.BTC_USDT, 1);
            // 成本：100 + 手续费 0.1 = 100.1
            expect(wallet.getFiatBalance()).toBeCloseTo(9899.9, 1);
            expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(1);
            expect(exchange.getTotalAssetValue()).toBeCloseTo(9999.9, 1); // 总资产保持不变（忽略手续费）
            // 2. BTC 价格上涨到 200
            price_1.getPrice.mockReturnValue(200);
            // 总资产：9899.9 + (1 * 200) = 10099.9
            expect(exchange.getTotalAssetValue()).toBeCloseTo(10099.9, 1);
            // 3. 开空单 1 BTC
            exchange.openShort(main_1.Symbol.BTC_USDT, 1, 2); // 2 倍杠杆
            // 保证金：200 * 1 / 2 = 100
            // 手续费：200 * 1 * 0.001 = 0.2
            // 扣除：100 + 0.2 = 100.2
            expect(wallet.getFiatBalance()).toBeCloseTo(9799.7, 1); // 9899.9 - 100.2
            expect(exchange.getTotalAssetValue()).toBeCloseTo(10099.7, 1); // 10099.9 - 0.2（手续费）
            // 4. BTC 价格上涨到 250
            price_1.getPrice.mockReturnValue(250);
            // 现货价值：1 * 250 = 250
            // 空单价值：100（保证金） + (200 - 250) * 1（未实现亏损） = 50
            // 总资产：9799.7 + 250 + 50 = 10099.7
            expect(exchange.getTotalAssetValue()).toBeCloseTo(10099.7, 1);
            // 5. 卖出现货 1 BTC
            exchange.spotSell(main_1.Symbol.BTC_USDT, 1);
            // 收入：250 * 1 = 250
            // 手续费：250 * 0.001 = 0.25
            // 净收入：250 - 0.25 = 249.75
            expect(wallet.getFiatBalance()).toBeCloseTo(10049.45, 2); // 9799.7 + 249.75
            expect(wallet.getBalance(main_1.Symbol.BTC_USDT)).toBe(0);
            expect(exchange.getTotalAssetValue()).toBeCloseTo(10099.45, 2); // 10099.7 - 0.25（手续费）
            // 5.1 价格上涨至 300
            price_1.getPrice.mockReturnValue(300);
            expect(exchange.getTotalAssetValue()).toBeCloseTo(10049.45, 2);
            price_1.getPrice.mockReturnValue(250);
            // 6. 平掉空单
            exchange.closeShort(main_1.Symbol.BTC_USDT);
            // 原始保证金：100
            // 亏损：(200 - 250) * 1 = -50
            // 平仓手续费：250 * 1 * 0.001 = 0.25
            // 返还：100 - 50 - 0.25 = 49.75
            expect(wallet.getFiatBalance()).toBeCloseTo(10099.2, 1); // 10049.45 + 49.75
            expect(exchange.getShortPosition(main_1.Symbol.BTC_USDT)).toBeUndefined();
            expect(exchange.getTotalAssetValue()).toBeCloseTo(10099.2, 1);
            // 最终收益分析：
            // 1. 现货交易收益：249.75 - 100.1 = 149.65（扣除手续费）
            // 2. 空单交易收益：-50.45（亏损 + 手续费）
            // 总收益：99.2
            // 最终资产：10000 + 99.2 = 10099.2
        });
    });
});
