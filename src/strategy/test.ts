import { Exchange } from '../exchange/exchange';
import { Symbol, Strategy, Kline } from '../types/main';

/**
 * 测试策略：简单的买入持有策略
 * - 如果没有持仓就买入 1 个 BTC
 * - 买入后就一直持有
 */
export class TestStrategy implements Strategy {
    private hasBought: boolean = false;

    execute(exchange: Exchange, kline: Kline): void {
        // 如果已经买入就不做任何操作
        if (this.hasBought) {
            return;
        }

        try {
            // 尝试买入 1 个 BTC
            exchange.spotBuy(Symbol.BTC_USDT, 1);
            this.hasBought = true;
            console.log(`买入 1 BTC，价格：${kline.close}，时间：${new Date(kline.timestamp).toLocaleString()}`);
        } catch (error) {
            console.warn(`买入失败：${error.message}`);
        }
    }
}
