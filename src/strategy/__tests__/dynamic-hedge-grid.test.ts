import { DynamicHedgeGridStrategy } from '../dynamic-hedge-grid';
import { Exchange } from '../../exchange/exchange';
import { Symbol, Kline } from '../../types/main';
import { Wallet } from '../../core/wallet';
import * as priceModule from '../../core/price';

describe('DynamicHedgeGridStrategy', () => {
    let strategy: DynamicHedgeGridStrategy;
    let exchange: Exchange;
    let wallet: Wallet;
    
    // 测试参数设置
    const currentPrice = 30000;    // 当前价格 30000
    const upperLimit = 33000;      // 网格上限
    const lowerLimit = 27000;      // 网格下限
    const gridCount = 10;          // 网格数量
    const gridSize = (upperLimit - lowerLimit) / gridCount;  // 每格大小 = 600
    const buyAmount = 0.1;         // 每格交易数量 0.1 BTC

    beforeEach(() => {
        // Mock getPrice 函数
        jest.spyOn(priceModule, 'getPrice').mockImplementation(() => currentPrice);

        // 创建一个初始资金为 100000 USDT 的钱包
        wallet = new Wallet(100000);
        exchange = new Exchange(wallet);

        // 创建策略实例，设置网格参数
        strategy = new DynamicHedgeGridStrategy({
            gridUpperLimit: upperLimit,
            gridLowerLimit: lowerLimit,
            gridCount: gridCount,
            totalInvestment: 1000
        });

        strategy['exchange'] = exchange;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('createGrid', () => {
        it('should create grid orders with correct prices and amounts', async () => {
            await strategy['createGrid'](Symbol.BTC_USDT, currentPrice);
            const orders = exchange.getPendingOrders();

            /**
             * 预期的网格订单情况：
             * 1. 初始买入：500 USDT / 30000 = 0.0167 BTC
             * 2. 卖单：0.0167 / 5 = 0.00334 BTC 每单
             * 价格    类型   数量
             * 33000   卖    0.00334 BTC
             * 32400   卖    0.00334 BTC
             * 31800   卖    0.00334 BTC
             * 31200   卖    0.00334 BTC
             * 30600   卖    0.00334 BTC
             * 30000   (当前价格)
             * 29400   买    0.0170 BTC (500/5/29400)
             * 28800   买    0.0174 BTC (500/5/28800)
             * 28200   买    0.0177 BTC (500/5/28200)
             * 27600   买    0.0181 BTC (500/5/27600)
             * 27000   买    0.0185 BTC (500/5/27000)
             */

            // 验证卖单
            const sellOrders = orders.filter(order => !order.isBuy)
                .sort((a, b) => a.price - b.price);
            expect(sellOrders.length).toBe(5);

            // 计算预期的卖单数量：初始买入量/卖单数量
            const initialBtcAmount = Number((500 / currentPrice).toFixed(8)); // 500 是总投资的一半
            const expectedSellAmount = Number((initialBtcAmount / sellOrders.length).toFixed(8));
            
            // 验证每个卖单的数量
            sellOrders.forEach(order => {
                expect(order.amount).toBe(expectedSellAmount);
            });

            // 验证买单
            const buyOrders = orders.filter(order => order.isBuy)
                .sort((a, b) => b.price - a.price);
            expect(buyOrders.length).toBe(5);
            
            // 验证每个买单的数量是正确的（投资额/价格）
            const investmentPerGrid = 500 / 5; // 一半投资额平均分配到 5 个买单
            buyOrders.forEach((order, index) => {
                const expectedAmount = Number((investmentPerGrid / order.price).toFixed(8));
                expect(order.amount).toBe(expectedAmount);
            });

            // 验证所有卖单的总量等于初始买入量
            const totalSellAmount = sellOrders.reduce((sum, order) => sum + order.amount, 0);
            expect(totalSellAmount).toBeCloseTo(initialBtcAmount, 3);

            // 验证钱包中的 BTC 已经全部用于创建卖单
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBeCloseTo(0, 3);
        });

        it('should place orders at correct grid prices', async () => {
            await strategy['createGrid'](Symbol.BTC_USDT, currentPrice);
            const orders = exchange.getPendingOrders();

            // 验证买卖单的具体价格
            const sellPrices = orders.filter(o => !o.isBuy).map(o => o.price).sort((a, b) => a - b);
            const buyPrices = orders.filter(o => o.isBuy).map(o => o.price).sort((a, b) => a - b);

            expect(sellPrices).toEqual([30600, 31200, 31800, 32400, 33000]);
            expect(buyPrices).toEqual([27000, 27600, 28200, 28800, 29400]);
        });

        describe('createGrid edge cases', () => {
            beforeEach(() => {
                // Mock getPrice 函数
                jest.spyOn(priceModule, 'getPrice').mockImplementation(() => currentPrice);
        
                // 创建一个初始资金为 100000 USDT 的钱包
                wallet = new Wallet(100000);
                exchange = new Exchange(wallet);
        
                // 创建策略实例，设置网格参数
                strategy = new DynamicHedgeGridStrategy({
                    gridUpperLimit: upperLimit,
                    gridLowerLimit: lowerLimit,
                    gridCount: gridCount,
                    totalInvestment: 1000
                });
        
                strategy['exchange'] = exchange;
            });
            /**
             * 测试场景 1：当价格在下边界 27000 时
             * - 27000 是网格的最低点，所以不会在这个价格创建订单
             * - 应该创建 10 个卖单，价格从 27600 到 33000
             * - 初始仓位应该是总投资额的一半用于买入 BTC
             */
            it('should create sell orders when price is at lower limit', async () => {
                jest.spyOn(priceModule, 'getPrice').mockImplementation(() => lowerLimit);
                await strategy['createGrid'](Symbol.BTC_USDT, lowerLimit);
                const orders = exchange.getPendingOrders();
                
                // 生成预期的价格序列：从 27600 到 33000，每格 600
                const expectedPrices = Array.from({length: gridCount}, (_, i) => 
                    lowerLimit + (i + 1) * gridSize);
                
                // 验证订单数量应该是 10 个（不包含 27000 这个价格点）
                expect(orders.length).toBe(gridCount);

                // 验证全部都是卖单，因为当前价格是最低点
                expect(orders.every(o => !o.isBuy)).toBe(true);
                
                // 验证订单价格完全匹配预期的价格序列
                const actualPrices = orders.map(o => o.price).sort((a, b) => a - b);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证卖单中锁定的 BTC 总量等于预期的初始仓位
                const totalInvestment = 1000; // 使用策略配置的投资额
                const expectedInitialBtc = totalInvestment / lowerLimit; // 1000/27000 ≈ 0.037037
                const totalLockedBTC = orders.reduce((sum, order) => sum + order.amount, 0);
                expect(totalLockedBTC).toBeCloseTo(expectedInitialBtc, 5);
            });

            /**
             * 测试场景 2：当价格低于下边界（26900）时
             * - 所有价格点都应该创建卖单
             * - 初始仓位应该使用全部投资额买入 BTC
             */
            it('should create sell orders when price is below lower limit', async () => {
                const belowLowerLimit = 26900;
                jest.spyOn(priceModule, 'getPrice').mockImplementation(() => belowLowerLimit);
                await strategy['createGrid'](Symbol.BTC_USDT, belowLowerLimit);
                const orders = exchange.getPendingOrders();
                
                // 生成预期的价格序列：从 27000 到 33000，每格 600
                const expectedPrices = Array.from({length: gridCount + 1}, (_, i) => 
                    lowerLimit + i * gridSize);
                
                // 验证订单数量应该是 11 个（包含 27000 这个价格点）
                expect(orders.length).toBe(gridCount + 1);

                // 验证全部都是卖单，因为当前价格低于最低点
                expect(orders.every(o => !o.isBuy)).toBe(true);
                
                // 验证订单价格完全匹配预期的价格序列
                const actualPrices = orders.map(o => o.price).sort((a, b) => a - b);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证卖单中锁定的 BTC 总量
                const totalInvestment = 1000; // 使用全部投资额
                const expectedInitialBtc = Number((totalInvestment / belowLowerLimit).toFixed(8));
                const totalLockedBTC = orders.reduce((sum, order) => sum + order.amount, 0);
                expect(totalLockedBTC).toBeCloseTo(expectedInitialBtc, 8);
            });

            /**
             * 测试场景 3：当价格在上边界 33000 时
             * - 33000 是网格的最高点，所以不会在这个价格创建订单
             * - 应该创建 11 个买单，价格从 27000 到 32400
             * - 不需要买入初始仓位，因为全是买单
             */
            it('should create buy orders when price is at upper limit', async () => {
                jest.spyOn(priceModule, 'getPrice').mockImplementation(() => upperLimit);
                await strategy['createGrid'](Symbol.BTC_USDT, upperLimit);
                const orders = exchange.getPendingOrders();
                
                // 生成预期的价格序列：从 32400 往下到 27000，每格 600
                const expectedPrices = Array.from({length: gridCount}, (_, i) => 
                    upperLimit - (i + 1) * gridSize);
                
                // 验证订单数量应该是 10 个（不包含上边界价格点）
                expect(orders.length).toBe(gridCount);

                // 验证全部都是买单，因为当前价格是最高点
                expect(orders.every(o => o.isBuy)).toBe(true);
                
                // 验证订单价格完全匹配预期的价格序列
                const actualPrices = orders.map(o => o.price).sort((a, b) => b - a);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证不需要初始买入
                const btcBalance = wallet.getBalance(Symbol.BTC_USDT);
                expect(btcBalance).toBe(0);
            });

            /**
             * 测试场景 4：当价格远低于下边界时
             * - 所有价格点都应该创建卖单
             * - 初始仓位应该使用全部投资额买入 BTC
             */
            it('should create sell orders when price is far below lower limit', async () => {
                const farBelowLimit = 25000;
                jest.spyOn(priceModule, 'getPrice').mockImplementation(() => farBelowLimit);
                await strategy['createGrid'](Symbol.BTC_USDT, farBelowLimit);
                const orders = exchange.getPendingOrders();
                
                // 生成预期的价格序列：从 27000 到 33000
                const expectedPrices = Array.from({length: gridCount + 1}, (_, i) => 
                    lowerLimit + i * gridSize);
                
                // 验证订单数量应该是 11 个（包含所有网格点）
                expect(orders.length).toBe(gridCount + 1);

                // 验证全部都是卖单，因为当前价格远低于最低点
                expect(orders.every(o => !o.isBuy)).toBe(true);
                
                // 验证订单价格完全匹配预期的价格序列
                const actualPrices = orders.map(o => o.price).sort((a, b) => a - b);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证没有创建网格范围外的订单
                expect(orders.some(o => o.price < lowerLimit)).toBe(false);
                
                // 验证卖单中锁定的 BTC 总量
                const totalInvestment = 1000; // 使用全部投资额
                const expectedInitialBtc = Number((totalInvestment / farBelowLimit).toFixed(8));
                const totalLockedBTC = orders.reduce((sum, order) => sum + order.amount, 0);
                expect(totalLockedBTC).toBeCloseTo(expectedInitialBtc, 3);
            });

            /**
             * 测试场景 5：当价格远高于上边界（比如 35000）时
             * - 应该创建 11 个买单，价格从 27000 到 33000
             * - 不应该在 35000 创建买单，因为它超出了网格范围
             * - 不需要买入初始仓位，因为全是买单
             */
            it('should create buy orders when price is far above upper limit', async () => {
                const farAboveLimit = 35000;
                jest.spyOn(priceModule, 'getPrice').mockImplementation(() => farAboveLimit);
                await strategy['createGrid'](Symbol.BTC_USDT, farAboveLimit);
                const orders = exchange.getPendingOrders();
                
                // 生成预期的价格序列：从 27000 到 33000
                const expectedPrices = Array.from({length: gridCount + 1}, (_, i) => 
                    lowerLimit + i * gridSize);
                
                // 验证订单数量应该是 11 个（包含所有网格点）
                expect(orders.length).toBe(gridCount + 1);

                // 验证全部都是买单，因为当前价格远高于最高点
                expect(orders.every(o => o.isBuy)).toBe(true);
                
                // 验证订单价格完全匹配预期的价格序列
                const actualPrices = orders.map(o => o.price).sort((a, b) => a - b);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证没有创建网格范围外的订单
                expect(orders.some(o => o.price > upperLimit)).toBe(false);

                // 验证不需要初始买入
                const btcBalance = wallet.getBalance(Symbol.BTC_USDT);
                expect(btcBalance).toBe(0);
            });
        });

        it('should skip grid lines near current price', async () => {
            await strategy['createGrid'](Symbol.BTC_USDT, currentPrice);
            const orders = exchange.getPendingOrders();

            /**
             * 不应该在当前价格附近 60 (gridSize * 0.1) 的范围内有订单
             * 即 29940 - 30060 这个范围内不应该有订单
             */
            const minDistance = gridSize * 0.1; // 60
            orders.forEach(order => {
                const priceDiff = Math.abs(order.price - currentPrice);
                expect(priceDiff).toBeGreaterThan(minDistance);
            });
        });
    });

    describe('Take profit and stop loss', () => {
        beforeEach(() => {
            // 创建策略实例，设置网格参数和止盈止损价格
            strategy = new DynamicHedgeGridStrategy({
                gridUpperLimit: upperLimit,
                gridLowerLimit: lowerLimit,
                gridCount: gridCount,
                totalInvestment: 1000,
                takeProfitPrice: 34000,  // 止盈价格
                stopLossPrice: 26000     // 止损价格
            });

            strategy['exchange'] = exchange;
        });

        /**
         * 测试场景：触发止盈
         * - 当开盘价达到止盈价格时，应该：
         * 1. 取消所有未成交订单
         * 2. 平掉所有持仓
         * 3. 重置网格状态
         */
        it('should close all positions when take profit is triggered', async () => {
            // 1. 先创建初始网格
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice + 100,
                low: currentPrice - 100,
                close: currentPrice,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](initKline);
            expect(exchange.getPendingOrders().length).toBeGreaterThan(0);
            
            // 2. 模拟开盘价超过止盈价格
            const kline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 34200,  // 开盘价高于止盈价格 34000
                high: 34500,
                low: 33900,
                close: 34100,
                volume: 100,
                timestamp: Date.now()
            };
            
            // 3. 执行策略
            await strategy['checkAndCreateGrid'](kline);
            
            // 4. 验证所有订单都被取消
            expect(exchange.getPendingOrders().length).toBe(0);
            
            // 5. 验证所有 BTC 都被卖出
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            
            // 6. 验证网格状态被重置
            expect(strategy['isGridInitialized']).toBe(false);
        });

        /**
         * 测试场景：触发止损
         * - 当开盘价达到止损价格时，应该：
         * 1. 取消所有未成交订单
         * 2. 平掉所有持仓
         * 3. 重置网格状态
         */
        it('should close all positions when stop loss is triggered', async () => {
            // 1. 先创建初始网格
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice + 100,
                low: currentPrice - 100,
                close: currentPrice,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](initKline);
            expect(exchange.getPendingOrders().length).toBeGreaterThan(0);
            
            // 2. 模拟开盘价低于止损价格
            const kline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 25900,  // 开盘价低于止损价格 26000
                high: 26500,
                low: 25800,
                close: 26100,
                volume: 100,
                timestamp: Date.now()
            };
            
            // 3. 执行策略
            await strategy['checkAndCreateGrid'](kline);
            
            // 4. 验证所有订单都被取消
            expect(exchange.getPendingOrders().length).toBe(0);
            
            // 5. 验证所有 BTC 都被卖出
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            
            // 6. 验证网格状态被重置
            expect(strategy['isGridInitialized']).toBe(false);
        });

        /**
         * 测试场景：正常价格范围
         * - 当开盘价在止盈止损范围内时，不应该触发平仓
         */
        it('should not close positions when price is within normal range', async () => {
            // 1. 先创建初始网格
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice + 100,
                low: currentPrice - 100,
                close: currentPrice,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](initKline);
            const initialOrders = exchange.getPendingOrders().length;
            
            // 2. 模拟正常价格范围内的波动
            const kline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 30500,  // 开盘价在正常范围内
                high: 32000,
                low: 28000,
                close: 31000,
                volume: 100,
                timestamp: Date.now()
            };
            
            // 3. 执行策略
            await strategy['checkAndCreateGrid'](kline);
            
            // 4. 验证订单没有被取消
            expect(exchange.getPendingOrders().length).toBe(initialOrders);
            
            // 5. 验证网格状态保持不变
            expect(strategy['isGridInitialized']).toBe(true);
        });

        /**
         * 测试场景：触发止盈后再次创建网格
         * - 当价格回落到正常范围时，应该：
         * 1. 重新创建网格订单
         * 2. 买入初始仓位
         * 3. 重置网格状态为已初始化
         */
        it('should recreate grid after take profit is triggered', async () => {
            // 1. 先创建初始网格
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice + 100,
                low: currentPrice - 100,
                close: currentPrice,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](initKline);
            const initialOrdersCount = exchange.getPendingOrders().length;
            
            // 2. 触发止盈
            const tpKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 34200,  // 高于止盈价格 34000
                high: 34500,
                low: 33900,
                close: 34100,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](tpKline);
            
            // 验证止盈触发后状态
            expect(exchange.getPendingOrders().length).toBe(0);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            expect(strategy['isGridInitialized']).toBe(false);

            // 3. 价格回落，重新创建网格
            const newKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 30000,  // 回到正常价格范围
                high: 30500,
                low: 29500,
                close: 30200,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](newKline);

            // 验证网格重新创建
            expect(exchange.getPendingOrders().length).toBe(initialOrdersCount);
            expect(strategy['isGridInitialized']).toBe(true);

            // 验证买卖单数量正确
            const orders = exchange.getPendingOrders();
            const sellOrders = orders.filter(o => !o.isBuy);
            const buyOrders = orders.filter(o => o.isBuy);
            expect(sellOrders.length).toBe(5);  // 30600-33000 的卖单
            expect(buyOrders.length).toBe(5);   // 27000-29400 的买单
        });

        /**
         * 测试场景：触发止损后再次创建网格
         * - 当价格回升到正常范围时，应该：
         * 1. 重新创建网格订单
         * 2. 买入初始仓位
         * 3. 重置网格状态为已初始化
         */
        it('should recreate grid after stop loss is triggered', async () => {
            // 1. 先创建初始网格
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice + 100,
                low: currentPrice - 100,
                close: currentPrice,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](initKline);
            const initialOrdersCount = exchange.getPendingOrders().length;
            
            // 2. 触发止损
            const slKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 25900,  // 低于止损价格 26000
                high: 26100,
                low: 25800,
                close: 26000,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](slKline);
            
            // 验证止损触发后状态
            expect(exchange.getPendingOrders().length).toBe(0);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            expect(strategy['isGridInitialized']).toBe(false);

            // 3. 价格回升，重新创建网格
            const newKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: 30000,  // 回到正常价格范围
                high: 30500,
                low: 29500,
                close: 30200,
                volume: 100,
                timestamp: Date.now()
            };
            await strategy['checkAndCreateGrid'](newKline);

            // 验证网格重新创建
            expect(exchange.getPendingOrders().length).toBe(initialOrdersCount);
            expect(strategy['isGridInitialized']).toBe(true);

            // 验证买卖单数量正确
            const orders = exchange.getPendingOrders();
            const sellOrders = orders.filter(o => !o.isBuy);
            const buyOrders = orders.filter(o => o.isBuy);
            expect(sellOrders.length).toBe(5);  // 30600-33000 的卖单
            expect(buyOrders.length).toBe(5);   // 27000-29400 的买单
        });
    });
});