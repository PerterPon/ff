import { Exchange } from '../exchange';
import { Wallet } from '../../core/wallet';
import { Symbol } from '../../types/main';
import { getPrice } from '../../core/price';
import { setMockPrice, calculateFee, FEE_RATE } from './test-utils';

jest.mock('../../core/price');

describe('Exchange - 挂单交易测试', () => {
    let exchange: Exchange;
    let wallet: Wallet;
    const INITIAL_BALANCE = 10000;

    beforeEach(() => {
        // 每个测试前重置钱包余额
        wallet = new Wallet(INITIAL_BALANCE);
        exchange = new Exchange(wallet, {
            spotBuy: FEE_RATE.spotBuy,
            spotSell: FEE_RATE.spotSell,
            limitBuy: FEE_RATE.limitBuy,
            limitSell: FEE_RATE.limitSell,
            shortOpen: FEE_RATE.shortOpen,
            shortClose: FEE_RATE.shortClose
        });
        jest.clearAllMocks();
        setMockPrice(Symbol.BTC_USDT, 40000);
    });

    // describe('买单测试', () => {
    //     beforeEach(() => {
    //         // 每个测试前重置钱包余额
    //         wallet = new Wallet(INITIAL_BALANCE);
    //         exchange = new Exchange(wallet, {
    //             spotBuy: FEE_RATE.spotBuy,
    //             spotSell: FEE_RATE.spotSell,
    //             limitBuy: FEE_RATE.limitBuy,
    //             limitSell: FEE_RATE.limitSell,
    //             shortOpen: FEE_RATE.shortOpen,
    //             shortClose: FEE_RATE.shortClose
    //         });
    //         jest.clearAllMocks();
    //         setMockPrice(Symbol.BTC_USDT, 40000);
    //     });
    //     test('挂买单并等待成交', () => {
    //         // 1. 挂买单 @ 39000
    //         const buyPrice = 39000;
    //         const amount = 0.1;
    //         const orderId = exchange.placeBuyOrder(Symbol.BTC_USDT, amount, buyPrice);
            
    //         // 挂单时总资产不变
    //         // 总资产 = 可用余额 (6100) + 冻结资金 (3900 + 7.8) = 10000
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE, 1);

    //         // 2. 价格下跌到 39000 触发成交
    //         setMockPrice(Symbol.BTC_USDT, 39000);
    //         exchange.onPriceUpdate(Symbol.BTC_USDT, 39000);
            
    //         // 成交后总资产
    //         // 总资产 = 可用余额 (6092.2) + BTC 价值 (0.1 * 39000) = 10000 - 7.8
    //         const fee = calculateFee(amount, buyPrice, FEE_RATE.limitBuy);
    //         const expectedAfterFill = INITIAL_BALANCE - fee;
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterFill, 1);

    //         // 3. 价格继续下跌到 38000
    //         setMockPrice(Symbol.BTC_USDT, 38000);
    //         exchange.onPriceUpdate(Symbol.BTC_USDT, 38000);
            
    //         // 价格下跌后总资产
    //         // 总资产 = 可用余额 (6092.2) + BTC 价值 (0.1 * 38000) = 9892.2
    //         const finalExpected = INITIAL_BALANCE - fee - amount * (39000 - 38000);
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
    //     });

    //     test('挂买单后取消订单', () => {
    //         // 1. 挂买单 @ 39000
    //         const buyPrice = 39000;
    //         const amount = 0.1;
    //         const orderId = exchange.placeBuyOrder(Symbol.BTC_USDT, amount, buyPrice);
            
    //         // 2. 取消订单
    //         exchange.cancelOrder(orderId);
            
    //         // 取消订单后总资产恢复原值
    //         // 总资产 = 可用余额 (10000) = 10000
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(INITIAL_BALANCE, 1);
    //     });
    // });

    // describe('卖单测试', () => {
    //     beforeEach(() => {
    //         // 每个测试前重置钱包余额
    //         wallet = new Wallet(INITIAL_BALANCE);
    //         exchange = new Exchange(wallet, {
    //             spotBuy: FEE_RATE.spotBuy,
    //             spotSell: FEE_RATE.spotSell,
    //             limitBuy: FEE_RATE.limitBuy,
    //             limitSell: FEE_RATE.limitSell,
    //             shortOpen: FEE_RATE.shortOpen,
    //             shortClose: FEE_RATE.shortClose
    //         });
    //         jest.clearAllMocks();
    //         setMockPrice(Symbol.BTC_USDT, 40000);
    //     });
    //     test('持仓后挂卖单等待成交', async () => {
    //         // 1. 先买入持仓
    //         const amount = 0.1;
    //         const spotPrice = 40000;
            
    //         setMockPrice(Symbol.BTC_USDT, spotPrice);
    //         exchange.spotBuy(Symbol.BTC_USDT, amount);
    //         exchange.onPriceUpdate(Symbol.BTC_USDT, spotPrice);
            
    //         // 买入后总资产
    //         // 总资产 = 可用余额 (5996) + BTC 价值 (0.1 * 40000) = 9996
    //         const spotBuyFee = calculateFee(amount, spotPrice, FEE_RATE.spotBuy);
    //         const expectedAfterBuy = INITIAL_BALANCE - spotBuyFee;
    //         console.log(`expectedAfterBuy: ${expectedAfterBuy}`);
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterBuy, 1);
            
    //         // 2. 挂卖单 @ 42000
    //         const sellPrice = 42000;
    //         const orderId = exchange.placeSellOrder(Symbol.BTC_USDT, sellPrice, amount);
            
    //         // 挂卖单后总资产
    //         // 总资产 = 可用余额 (5996) + 冻结 BTC 价值 (0.1 * 40000) = 9996
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterBuy, 1);

    //         // 3. 价格上涨到 42000 触发成交
    //         setMockPrice(Symbol.BTC_USDT, 42000);
    //         exchange.onPriceUpdate(Symbol.BTC_USDT, 42000);
            
    //         // 卖出成交后总资产
    //         // 总资产 = 可用余额 (5996 + 4200 - 8.4) = 10187.6
    //         const sellFee = calculateFee(amount, sellPrice, FEE_RATE.limitSell);
    //         const profit = amount * (sellPrice - spotPrice);
    //         const finalExpected = INITIAL_BALANCE - spotBuyFee - sellFee + profit;
    //         expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);
    //     });
    // });

    describe('复杂挂单场景', () => {
        beforeEach(() => {
            // 每个测试前重置钱包余额
            wallet = new Wallet(INITIAL_BALANCE);
            exchange = new Exchange(wallet, {
                spotBuy: FEE_RATE.spotBuy,
                spotSell: FEE_RATE.spotSell,
                limitBuy: FEE_RATE.limitBuy,
                limitSell: FEE_RATE.limitSell,
                shortOpen: FEE_RATE.shortOpen,
                shortClose: FEE_RATE.shortClose
            });
            jest.clearAllMocks();
            setMockPrice(Symbol.BTC_USDT, 40000);
        });
        test('同时存在多个买卖单', () => {
            // 1. 先买入持仓
            const initialAmount = 0.1;
            const spotPrice = 40000;
            
            setMockPrice(Symbol.BTC_USDT, spotPrice);
            exchange.spotBuy(Symbol.BTC_USDT, initialAmount);
            exchange.onPriceUpdate(Symbol.BTC_USDT, spotPrice);
            
            // 买入后总资产
            // 总资产 = 可用余额 (5996) + BTC 价值 (0.1 * 40000) = 9996
            const spotBuyFee = calculateFee(initialAmount, spotPrice, FEE_RATE.spotBuy);
            const expectedAfterBuy = INITIAL_BALANCE - spotBuyFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterBuy, 1);
            
            // 2. 挂买卖单
            const buyPrice = 38000;
            const sellPrice = 42000;
            const orderAmount = 0.05;
            
            // 先挂卖单
            const sellOrderId = exchange.placeSellOrder(Symbol.BTC_USDT, sellPrice, orderAmount);
            
            // 再挂买单
            const buyOrderId = exchange.placeBuyOrder(Symbol.BTC_USDT, orderAmount, buyPrice);
            
            // 挂单后总资产
            // 总资产 = 可用余额 (4093.8) + 
            //          剩余 BTC 价值 (0.05 * 40000) + 
            //          冻结 BTC 价值 (0.05 * 40000) +
            //          冻结买单资金 (0.05 * 38000 + 3.8) = 9996
            const buyFee = calculateFee(orderAmount, buyPrice, FEE_RATE.limitBuy);
            const frozenBuyAmount = orderAmount * buyPrice + buyFee;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(expectedAfterBuy, 1);

            // 3. 价格上涨到 42000 触发卖单成交
            setMockPrice(Symbol.BTC_USDT, 42000);
            exchange.onPriceUpdate(Symbol.BTC_USDT, 42000);
            
            // 卖单成交后总资产
            // 4092.2（之前可用余额）+ 2095.8（卖单收入）= 8091.8 USDT
            // 总资产 = 可用余额 (8091.8) + 
            //          剩余 BTC 价值 (0.05 * 42000) +
            //          冻结买单资金 (1903.8) = 12095.6
            const sellFee = calculateFee(orderAmount, sellPrice, FEE_RATE.limitSell);
            const profit = orderAmount * (sellPrice - spotPrice);
            const finalExpected = expectedAfterBuy + profit - sellFee + orderAmount * 2000; // 加上剩余 BTC 的价值上涨
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalExpected, 1);

            // 4. 价格下跌到 38000 触发买单成交
            setMockPrice(Symbol.BTC_USDT, 38000);
            exchange.onPriceUpdate(Symbol.BTC_USDT, 38000);
            
            // 买单成交后总资产
            // 总资产 = 可用余额 (6188) + 
            //          BTC 价值 (0.1 * 38000) = 9988
            const finalFinalExpected = 6188 + initialAmount * 38000;
            expect(exchange.getTotalAssetValue()).toBeCloseTo(finalFinalExpected, 1);
        });
    });
}); 