import { Wallet } from './wallet';
import { getPrice, setPrice } from './price';
import { Symbol } from '../types/main';

// Mock price.ts
jest.mock('./price', () => ({
    getPrice: jest.fn(),
    setPrice: jest.fn()
}));

describe('Wallet 类测试', () => {
    let wallet: Wallet;
    
    beforeEach(() => {
        wallet = new Wallet(1000); // 初始法币余额 1000
        jest.clearAllMocks();
    });

    describe('法币相关操作', () => {
        test('初始化时应该设置正确的法币余额', () => {
            expect(wallet.getFiatBalance()).toBe(1000);
        });

        test('设置法币余额应该正常工作', () => {
            wallet.setFiatBalance(2000);
            expect(wallet.getFiatBalance()).toBe(2000);
        });

        test('设置负数法币余额应该抛出错误', () => {
            expect(() => wallet.setFiatBalance(-100)).toThrow('法币余额不能为负数');
        });

        test('增加法币余额应该正常工作', () => {
            wallet.addFiatBalance(500);
            expect(wallet.getFiatBalance()).toBe(1500);
        });

        test('减少法币余额应该正常工作', () => {
            wallet.subtractFiatBalance(300);
            expect(wallet.getFiatBalance()).toBe(700);
        });

        test('减少超过余额的法币应该抛出错误', () => {
            expect(() => wallet.subtractFiatBalance(1500)).toThrow('法币余额不足');
        });
    });

    describe('交易对余额相关操作', () => {
        test('新钱包的交易对余额应该为 0', () => {
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
        });

        test('设置交易对余额应该正常工作', () => {
            wallet.setBalance(Symbol.BTC_USDT, 1.5);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(1.5);
        });

        test('设置负数交易对余额应该抛出错误', () => {
            expect(() => wallet.setBalance(Symbol.BTC_USDT, -1)).toThrow('余额不能为负数');
        });

        test('增加交易对余额应该正常工作', () => {
            wallet.setBalance(Symbol.ETH_USDT, 2);
            wallet.addBalance(Symbol.ETH_USDT, 1);
            expect(wallet.getBalance(Symbol.ETH_USDT)).toBe(3);
        });

        test('减少交易对余额应该正常工作', () => {
            wallet.setBalance(Symbol.BTC_USDT, 2);
            wallet.subtractBalance(Symbol.BTC_USDT, 0.5);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(1.5);
        });

        test('减少超过余额的交易对余额应该抛出错误', () => {
            wallet.setBalance(Symbol.BTC_USDT, 1);
            expect(() => wallet.subtractBalance(Symbol.BTC_USDT, 2)).toThrow('余额不足');
        });

        test('清空特定交易对余额应该正常工作', () => {
            wallet.setBalance(Symbol.BTC_USDT, 1);
            wallet.clearBalance(Symbol.BTC_USDT);
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
        });

        test('清空所有交易对余额应该正常工作', () => {
            wallet.setBalance(Symbol.BTC_USDT, 1);
            wallet.setBalance(Symbol.ETH_USDT, 2);
            wallet.clearAllBalances();
            expect(wallet.getBalance(Symbol.BTC_USDT)).toBe(0);
            expect(wallet.getBalance(Symbol.ETH_USDT)).toBe(0);
        });

        test('获取所有余额应该返回正确的 Map', () => {
            wallet.setBalance(Symbol.BTC_USDT, 1);
            wallet.setBalance(Symbol.ETH_USDT, 2);
            const balances = wallet.getAllBalances();
            expect(balances.get(Symbol.BTC_USDT)).toBe(1);
            expect(balances.get(Symbol.ETH_USDT)).toBe(2);
        });
    });

    describe('总资产计算', () => {
        beforeEach(() => {
            (getPrice as jest.Mock).mockImplementation((symbol: Symbol) => {
                const prices = {
                    [Symbol.BTC_USDT]: 40000,
                    [Symbol.ETH_USDT]: 2000
                };
                return prices[symbol];
            });
        });

        test('应该正确计算总资产（不含未实现盈亏）', () => {
            wallet.setBalance(Symbol.BTC_USDT, 2);     // 2 * 40000 = 80000
            wallet.setBalance(Symbol.ETH_USDT, 10);    // 10 * 2000 = 20000
            // 总资产 = 法币 (1000) + BTC 价值 (80000) + ETH 价值 (20000) = 101000
            expect(wallet.getTotalBalance()).toBe(101000);
        });

        test('应该正确计算总资产（含未实现盈亏）', () => {
            wallet.setBalance(Symbol.BTC_USDT, 2);     // 2 * 40000 = 80000
            wallet.setBalance(Symbol.ETH_USDT, 10);    // 10 * 2000 = 20000
            const unrealizedPnl = 1000;                // 假设有 1000 的未实现盈利
            // 总资产 = 法币 (1000) + BTC 价值 (80000) + ETH 价值 (20000) + 未实现盈亏 (1000) = 102000
            expect(wallet.getTotalBalance(unrealizedPnl)).toBe(102000);
        });

        test('获取价格失败时应该忽略该资产', () => {
            wallet.setBalance(Symbol.BTC_USDT, 2);     // 价格获取失败，忽略
            wallet.setBalance(Symbol.ETH_USDT, 10);    // 10 * 2000 = 20000
            // 总资产 = 法币 (1000) + ETH 价值 (20000) = 21000
            expect(wallet.getTotalBalance()).toBe(21000);
        });
    });
}); 