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
    const gridWidth = 0.01;        // 网格宽度 1%
    const gridCount = 10;          // 网格数量
    const pricePosition = 50;      // 价格位置在中间
    
    // 计算网格范围
    const totalWidth = gridCount * gridWidth;  // 总宽度 10%
    const widthAbove = totalWidth * (1 - pricePosition/100);  // 上方宽度 5%
    const widthBelow = totalWidth * (pricePosition/100);      // 下方宽度 5%
    const upperLimit = currentPrice * (1 + widthAbove);  // 31500
    const lowerLimit = currentPrice * (1 - widthBelow);  // 28500
    const gridSize = (upperLimit - lowerLimit) / gridCount;  // 300

    beforeEach(() => {
        // Mock getPrice 函数
        jest.spyOn(priceModule, 'getPrice').mockImplementation(() => currentPrice);

        // 创建一个初始资金为 100000 USDT 的钱包
        wallet = new Wallet(100000);
        exchange = new Exchange(wallet);

        // 创建策略实例，设置网格参数
        strategy = new DynamicHedgeGridStrategy({
            gridWidth,
            gridCount,
            totalInvestment: 1000,
            pricePosition
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
             * 31500   卖    0.00334 BTC
             * 31200   卖    0.00334 BTC
             * 30900   卖    0.00334 BTC
             * 30600   卖    0.00334 BTC
             * 30300   卖    0.00334 BTC
             * 30000   (当前价格)
             * 29700   买    0.0168 BTC (500/5/29700)
             * 29400   买    0.0170 BTC (500/5/29400)
             * 29100   买    0.0172 BTC (500/5/29100)
             * 28800   买    0.0174 BTC (500/5/28800)
             * 28500   买    0.0175 BTC (500/5/28500)
             */

            // 验证卖单
            const sellOrders = orders.filter(order => !order.isBuy)
                .sort((a, b) => a.price - b.price);
            expect(sellOrders.length).toBe(5);

            // 计算预期的卖单数量
            const initialBtcAmount = Number((500 / currentPrice).toFixed(8));
            const expectedSellAmount = Number((initialBtcAmount / sellOrders.length).toFixed(8));
            
            sellOrders.forEach(order => {
                expect(order.amount).toBe(expectedSellAmount);
            });

            // 验证买单
            const buyOrders = orders.filter(order => order.isBuy)
                .sort((a, b) => b.price - a.price);
            expect(buyOrders.length).toBe(5);
            
            // 验证每个买单的数量
            const investmentPerGrid = 500 / 5;
            buyOrders.forEach(order => {
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

            expect(sellPrices).toEqual([30300, 30600, 30900, 31200, 31500]);
            expect(buyPrices).toEqual([28500, 28800, 29100, 29400, 29700]);
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
                    gridWidth,
                    gridCount,
                    totalInvestment: 1000,
                    pricePosition
                });
        
                strategy['exchange'] = exchange;
            });
            /**
             * 测试场景 1：价格在网格中间（pricePosition=50）
             * - 应该创建 5 个买单和 5 个卖单
             * - 买卖单数量应该平均分配
             */
            it('should create balanced grid when price is in middle (50% position)', async () => {
                strategy = new DynamicHedgeGridStrategy({
                    gridWidth,
                    gridCount,
                    totalInvestment: 1000,
                    pricePosition: 50
                });
                strategy['exchange'] = exchange;

                await strategy['createGrid'](Symbol.BTC_USDT, currentPrice);
                const orders = exchange.getPendingOrders();

                // 验证买卖单数量相等
                const sellOrders = orders.filter(o => !o.isBuy);
                const buyOrders = orders.filter(o => o.isBuy);
                expect(sellOrders.length).toBe(5);
                expect(buyOrders.length).toBe(5);

                // 验证价格分布
                const { upperLimit, lowerLimit } = strategy['calculateGridLimits'](currentPrice);
                const gridSize = (upperLimit - lowerLimit) / gridCount;

                // 验证卖单价格
                const sellPrices = sellOrders.map(o => o.price).sort((a, b) => a - b);
                const expectedSellPrices = Array.from({length: 5}, (_, i) => 
                    currentPrice + (i + 1) * gridSize);
                expect(sellPrices).toEqual(expectedSellPrices);

                // 验证买单价格
                const buyPrices = buyOrders.map(o => o.price).sort((a, b) => a - b);
                const expectedBuyPrices = Array.from({length: 5}, (_, i) => 
                    currentPrice - (5 - i) * gridSize);
                expect(buyPrices).toEqual(expectedBuyPrices);
            });

            /**
             * 测试场景 2：价格在网格底部（pricePosition=0）
             * - 应该只创建卖单
             * - 所有资金用于买入初始仓位
             */
            it('should create only sell orders when price is at bottom (0% position)', async () => {
                strategy = new DynamicHedgeGridStrategy({
                    gridWidth,
                    gridCount,
                    totalInvestment: 1000,
                    pricePosition: 0
                });
                strategy['exchange'] = exchange;

                await strategy['createGrid'](Symbol.BTC_USDT, currentPrice);
                const orders = exchange.getPendingOrders();

                // 验证全部是卖单
                expect(orders.every(o => !o.isBuy)).toBe(true);
                expect(orders.length).toBe(gridCount);

                // 验证价格分布
                const { upperLimit } = strategy['calculateGridLimits'](currentPrice);
                const gridSize = (upperLimit - currentPrice) / gridCount;
                const expectedPrices = Array.from({length: gridCount}, (_, i) => 
                    currentPrice + (i + 1) * gridSize);
                
                const actualPrices = orders.map(o => o.price).sort((a, b) => a - b);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证初始仓位
                const totalInvestment = 1000;
                const expectedInitialBtc = Number((totalInvestment / currentPrice).toFixed(8));
                const totalLockedBTC = orders.reduce((sum, order) => sum + order.amount, 0);
                expect(totalLockedBTC).toBeCloseTo(expectedInitialBtc, 5);
            });

            /**
             * 测试场景 3：价格在网格顶部（pricePosition=100）
             * - 应该只创建买单
             * - 不需要买入初始仓位
             */
            it('should create only buy orders when price is at top (100% position)', async () => {
                strategy = new DynamicHedgeGridStrategy({
                    gridWidth,
                    gridCount,
                    totalInvestment: 1000,
                    pricePosition: 100
                });
                strategy['exchange'] = exchange;

                await strategy['createGrid'](Symbol.BTC_USDT, currentPrice);
                const orders = exchange.getPendingOrders();

                // 验证全部是买单
                expect(orders.every(o => o.isBuy)).toBe(true);
                expect(orders.length).toBe(gridCount);

                // 验证价格分布
                const { lowerLimit } = strategy['calculateGridLimits'](currentPrice);
                const gridSize = (currentPrice - lowerLimit) / gridCount;
                const expectedPrices = Array.from({length: gridCount}, (_, i) => 
                    currentPrice - (i + 1) * gridSize);
                
                const actualPrices = orders.map(o => o.price).sort((a, b) => b - a);
                expect(actualPrices).toEqual(expectedPrices);

                // 验证没有初始仓位
                expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
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
            strategy = new DynamicHedgeGridStrategy({
                gridWidth,
                gridCount,
                totalInvestment: 1000,
                pricePosition: 50,  // 默认价格在中间
                takeProfitPrice: currentPrice * 1.15,  // 止盈价格设为当前价格的 115%
                stopLossPrice: currentPrice * 0.85     // 止损价格设为当前价格的 85%
            });

            strategy['exchange'] = exchange;
        });

        it('should close all positions when take profit is triggered', async () => {
            // 1. 先创建初始网格
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice + 100,
                low: currentPrice - 100,
                close: currentPrice,
                openTime: Date.now(),
                volume: 100
            };
            await strategy['checkAndCreateGrid'](initKline);

            // 验证初始网格创建正确
            const initialOrders = exchange.getPendingOrders();
            expect(initialOrders.length).toBe(10); // 5 买 5 卖
            expect(initialOrders.filter(o => !o.isBuy).length).toBe(5); // 5 个卖单
            expect(initialOrders.filter(o => o.isBuy).length).toBe(5);  // 5 个买单

            // 2. 触发止盈
            const tpKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice * 1.16, // 超过止盈价格
                high: currentPrice * 1.17,
                low: currentPrice * 1.15,
                close: currentPrice * 1.16,
                openTime: Date.now(),
                volume: 100
            };
            
            await strategy['checkAndCreateGrid'](tpKline);
            
            // 验证所有订单被取消，仓位被平掉
            expect(exchange.getPendingOrders().length).toBe(0);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            expect(strategy['isGridInitialized']).toBe(false);
        });

        it('should recreate grid after take profit with new price levels', async () => {
            // 1. 先创建初始网格，价格在 30000
            const initKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice,
                high: currentPrice * 1.01,
                low: currentPrice * 0.99,
                close: currentPrice,
                openTime: Date.now(),
                volume: 100
            };
            await strategy['checkAndCreateGrid'](initKline);

            // 验证初始网格创建正确
            let orders = exchange.getPendingOrders();
            expect(orders.length).toBe(10); // 应该有 10 个订单（5 买 5 卖）

            // 2. 价格上涨到 34800 (currentPrice * 1.16)，触发止盈
            const tpKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: currentPrice * 1.16,  // 34800 = 30000 * 1.16
                high: currentPrice * 1.17,
                low: currentPrice * 1.15,
                close: currentPrice * 1.16,
                openTime: Date.now(),
                volume: 100
            };
            await strategy['checkAndCreateGrid'](tpKline);
            
            // 验证所有订单被取消，仓位被平掉
            orders = exchange.getPendingOrders();
            expect(orders.length).toBe(0);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            expect(strategy['isGridInitialized']).toBe(false);
            
            // 3. 价格回落到 33000 (currentPrice * 1.1)，使用这个价格重建网格
            const newPrice = currentPrice * 1.1; // 33000 = 30000 * 1.1
            const rebuildKline: Kline = {
                symbol: Symbol.BTC_USDT,
                open: newPrice,
                high: newPrice * 1.01,
                low: newPrice * 0.99,
                close: newPrice,
                openTime: Date.now(),
                volume: 100
            };
            
            await strategy['checkAndCreateGrid'](rebuildKline);

            // 4. 验证新网格创建正确
            const newOrders = exchange.getPendingOrders();
            expect(newOrders.length).toBe(10); // 应该有 10 个订单（5 买 5 卖）

            // 5. 获取新的网格上下限
            // 因为 pricePosition = 50，所以当前价格在网格中间
            // totalWidth = gridCount * gridWidth = 10 * 0.01 = 0.1 (10%)
            // widthAbove = totalWidth * 0.5 = 0.05 (5%)
            // widthBelow = totalWidth * 0.5 = 0.05 (5%)
            const { upperLimit, lowerLimit } = strategy['calculateGridLimits'](newPrice);
            
            // 6. 计算网格间距
            // upperLimit = newPrice * (1 + 0.05) = 33000 * 1.05 = 34650
            // lowerLimit = newPrice * (1 - 0.05) = 33000 * 0.95 = 31350
            // gridSize = (34650 - 31350) / 10 = 330
            const gridSize = (upperLimit - lowerLimit) / gridCount;

            // 7. 验证卖单价格
            const sellOrders = newOrders.filter(o => !o.isBuy).sort((a, b) => a.price - b.price);
            expect(sellOrders.length).toBe(5); // 应该有 5 个卖单
            sellOrders.forEach((order, index) => {
                const expectedPrice = newPrice + (index + 1) * gridSize;
                expect(order.price).toBeCloseTo(expectedPrice, 0);
            });

            // 8. 验证买单价格
            const buyOrders = newOrders.filter(o => o.isBuy).sort((a, b) => a.price - b.price);
            expect(buyOrders.length).toBe(5); // 应该有 5 个买单
            buyOrders.forEach((order, index) => {
                const expectedPrice = newPrice - (5 - index) * gridSize;
                expect(order.price).toBeCloseTo(expectedPrice, 0);
            });
        });
    });
});