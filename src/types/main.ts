import { Exchange } from '../exchange/exchange';

/**
 * K 线数据接口
 */
export interface Kline {
    symbol: Symbol;
    timestamp: number;    // 时间戳
    open: number;        // 开盘价
    high: number;        // 最高价
    low: number;         // 最低价
    close: number;       // 收盘价
    volume: number;      // 成交量
}

/**
 * 策略接口
 */
export interface Strategy {
    execute(exchange: Exchange, kline: Kline): void;
}

/**
 * 回测结果接口
 */
export interface BacktestResult {
    timestamps: number[];        // 时间戳数组
    assetValues: number[];      // 对应的资产价值数组
    totalTrades: number;        // 总交易次数
    totalFees: number;          // 总手续费
    initialBalance: number;     // 初始资金
    finalBalance: number;       // 最终资金
    maxDrawdown: number;        // 最大回撤
    returns: number;            // 总收益率
}

export enum Symbol {
    BTC_USDT = 'BTC/USDT',
    ETH_USDT = 'ETH/USDT',
    SOLUSDT = "SOLUSDT",
    XRPUSDT = "XRPUSDT",
    ADAUSDT = "ADAUSDT",
}

export interface Order {
    symbol: Symbol;
    side: "buy" | "sell";
    amount: number;
    price: number;
}

export interface Orderbook {
    symbol: Symbol;
    asks: Order[];
    bids: Order[];
}

/**
 * 待成交订单接口
 */
export interface PendingOrder {
    /** 订单 ID */
    id: string;
    /** 交易对 */
    symbol: Symbol;
    /** 是否为买单 */
    isBuy: boolean;
    /** 期望成交价格 */
    price: number;
    /** 数量 */
    amount: number;
    /** 下单时间戳 */
    timestamp: number;
    totalCostWithFee?: number;  // 添加这个字段，记录包含手续费的总成本
}

/**
 * 空单仓位信息
 */
export interface ShortPosition {
    /** 交易对 */
    symbol: Symbol;
    /** 开仓数量 */
    amount: number;
    /** 开仓价格 */
    entryPrice: number;
    /** 杠杆倍数 */
    leverage: number;
    /** 保证金 */
    margin: number;
    /** 开仓时间 */
    timestamp: number;
}
