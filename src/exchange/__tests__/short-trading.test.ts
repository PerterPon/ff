import { Exchange } from '../exchange';
import { Wallet } from '../../core/wallet';
import { Symbol } from '../../types/main';
import { setMockPrice } from './test-utils';
import { FEE_RATE } from './test-utils';
import * as priceModule from '../../core/price';

// Mock getPrice 函数
jest.mock('../../core/price', () => ({
    getPrice: jest.fn()
}));

describe('Exchange - 空单交易测试', () => {
    let exchange: Exchange;
    let wallet: Wallet;
    const INITIAL_BALANCE = 10000;

    beforeEach(() => {
        // 每个测试前重置钱包余额和 mock
        wallet = new Wallet(INITIAL_BALANCE);
        exchange = new Exchange(wallet, {
            shortOpen: FEE_RATE.shortOpen,
            shortClose: FEE_RATE.shortClose
        });
        jest.clearAllMocks();
        // 设置初始价格
        (priceModule.getPrice as jest.Mock).mockImplementation((symbol: Symbol) => {
            if (symbol === Symbol.BTC_USDT) return 40000;
            throw new Error('未知交易对');
        });
    });

    describe('基础空单测试', () => {
        test('开空并平仓盈利', () => {
            const amount = 0.1;
            const leverage = 2;
            const openPrice = 40000;

            // 1. 开空仓 @ 40000，2 倍杠杆
            // 仓位价值 = 0.1 * 40000 = 4000
            // 所需保证金 = 4000 / 2 = 2000
            // 开仓手续费 = 4000 * 0.001 = 4
            // 总费用 = 2004
            exchange.openShort(Symbol.BTC_USDT, amount, leverage);

            // 开仓后总资产
            // 总资产 = 可用余额 (7996) + 保证金 (2000) = 9996
            const positionValue = amount * openPrice;
            const margin = positionValue / leverage;
            const openFee = positionValue * FEE_RATE.shortOpen;
            const expectedAfterOpen = INITIAL_BALANCE - openFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterOpen, 1);

            // 2. 价格下跌到 38000
            setMockPrice(Symbol.BTC_USDT, 38000);
            exchange.onPriceUpdate(Symbol.BTC_USDT, 38000);

            // 价格下跌后总资产
            // 未实现盈亏 = (40000 - 38000) * 0.1 = 200
            // 总资产 = 可用余额 (7996) + 保证金 (2000) + 未实现盈亏 (200) = 10196
            const unrealizedPnl = (openPrice - 38000) * amount;
            const expectedAfterDrop = expectedAfterOpen + unrealizedPnl;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterDrop, 1);

            // 3. 平仓 @ 38000
            // 平仓手续费 = 3800 * 0.1 * 0.001 = 3.8
            exchange.closeShort(Symbol.BTC_USDT);

            // 平仓后总资产
            // 总资产 = 可用余额 (7996 + 2000 + 200 - 3.8) = 10192.2
            const closeFee = amount * 38000 * FEE_RATE.shortClose;
            const finalExpected = expectedAfterDrop - closeFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });

        test('开空并平仓亏损', () => {
            const amount = 0.1;
            const leverage = 2;
            const openPrice = 40000;

            // 1. 开空仓 @ 40000，2 倍杠杆
            exchange.openShort(Symbol.BTC_USDT, amount, leverage);

            // 开仓后总资产
            // 总资产 = 可用余额 (7996) + 保证金 (2000) = 9996
            const positionValue = amount * openPrice;
            const margin = positionValue / leverage;
            const openFee = positionValue * FEE_RATE.shortOpen;
            const expectedAfterOpen = INITIAL_BALANCE - openFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterOpen, 1);

            // 2. 价格上涨到 42000
            setMockPrice(Symbol.BTC_USDT, 42000);
            exchange.onPriceUpdate(Symbol.BTC_USDT, 42000);

            // 价格上涨后总资产
            // 未实现亏损 = (40000 - 42000) * 0.1 = -200
            // 总资产 = 可用余额 (7996) + 保证金 (2000) - 未实现亏损 (200) = 9796
            const unrealizedPnl = (openPrice - 42000) * amount;
            const expectedAfterRise = expectedAfterOpen + unrealizedPnl;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterRise, 1);

            // 3. 平仓 @ 42000
            // 平仓手续费 = 4200 * 0.1 * 0.001 = 4.2
            exchange.closeShort(Symbol.BTC_USDT);

            // 平仓后总资产
            // 总资产 = 可用余额 (7996 + 2000 - 200 - 4.2) = 9791.8
            const closeFee = amount * 42000 * FEE_RATE.shortClose;
            const finalExpected = expectedAfterRise - closeFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });

        test('追加空单', () => {
            const amount1 = 0.1;
            const amount2 = 0.05;
            const leverage = 2;
            const openPrice = 40000;

            // 1. 第一次开空 @ 40000
            exchange.openShort(Symbol.BTC_USDT, amount1, leverage);

            // 第一次开仓后总资产
            const positionValue1 = amount1 * openPrice;
            const margin1 = positionValue1 / leverage;
            const openFee1 = positionValue1 * FEE_RATE.shortOpen;
            const expectedAfterOpen1 = INITIAL_BALANCE - openFee1;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterOpen1, 1);

            // 2. 价格下跌到 39000，追加空单
            setMockPrice(Symbol.BTC_USDT, 39000);
            exchange.onPriceUpdate(Symbol.BTC_USDT, 39000);
            exchange.openShort(Symbol.BTC_USDT, amount2, leverage);

            // 追加开仓后总资产
            // 第一笔未实现盈利 = (40000 - 39000) * 0.1 = 100
            // 第二笔保证金 = 39000 * 0.05 / 2 = 975
            // 第二笔手续费 = 39000 * 0.05 * 0.001 = 1.95
            const unrealizedPnl1 = (openPrice - 39000) * amount1;
            const positionValue2 = amount2 * 39000;
            const margin2 = positionValue2 / leverage;
            const openFee2 = positionValue2 * FEE_RATE.shortOpen;
            const expectedAfterOpen2 = expectedAfterOpen1 + unrealizedPnl1 - openFee2;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterOpen2, 1);

            // 3. 价格下跌到 38000
            setMockPrice(Symbol.BTC_USDT, 38000);
            exchange.onPriceUpdate(Symbol.BTC_USDT, 38000);

            // 价格下跌后总资产
            // 第一笔未实现盈利 = (40000 - 38000) * 0.1 = 200
            // 第二笔未实现盈利 = (39000 - 38000) * 0.05 = 50
            const unrealizedPnl = (openPrice - 38000) * amount1 + (39000 - 38000) * amount2;
            const expectedAfterDrop = expectedAfterOpen2 + (unrealizedPnl - unrealizedPnl1);
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterDrop, 1);

            // 4. 平仓 @ 38000
            // 平仓手续费 = 38000 * 0.15 * 0.001 = 5.7
            exchange.closeShort(Symbol.BTC_USDT);

            // 平仓后总资产
            const closeFee = (amount1 + amount2) * 38000 * FEE_RATE.shortClose;
            const finalExpected = expectedAfterDrop - closeFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
        });

        test('强平场景', () => {
            const amount = 0.1;
            const leverage = 10;
            const openPrice = 40000;
            const liquidationPrice = 43900;

            // 1. 开空仓 @ 40000，10 倍杠杆
            exchange.openShort(Symbol.BTC_USDT, amount, leverage);

            // 计算开仓手续费
            const positionValue = amount * openPrice;  // 4000
            const openFee = positionValue * FEE_RATE.shortOpen;  // 4000 * 0.001 = 4

            // 2. 价格上涨触发强平 @ 43900
            setMockPrice(Symbol.BTC_USDT, liquidationPrice);
            exchange.onPriceUpdate(Symbol.BTC_USDT, liquidationPrice);

            // 计算未实现亏损
            const unrealizedPnl = (openPrice - liquidationPrice) * amount;  // (40000 - 43900) * 0.1 = -390

            // 计算平仓手续费（基于强平价格）
            const closingValue = amount * liquidationPrice;  // 0.1 * 43900 = 4390
            const closeFee = closingValue * FEE_RATE.shortClose;  // 4390 * 0.001 = 4.39

            // 验证仓位已被强平
            const position = exchange.getShortPosition(Symbol.BTC_USDT);
            expect(position).toBeUndefined();  // 仓位应该已经被清除

            // 验证最终资产
            // 最终资产 = 初始资金 - 开仓手续费 + 未实现盈亏 - 平仓手续费
            const expectedFinalValue = INITIAL_BALANCE - openFee + unrealizedPnl - closeFee;
            // 10000 - 4 - 390 - 4.39 = 9601.61
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedFinalValue, 1);
        });
    });
}); 