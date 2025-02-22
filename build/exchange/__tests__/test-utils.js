"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEE_RATE = void 0;
exports.setMockPrice = setMockPrice;
exports.setMultiMockPrices = setMultiMockPrices;
exports.calculateFee = calculateFee;
const price_1 = require("../../core/price");
// 测试用的手续费率常量
exports.FEE_RATE = {
    spotBuy: 0.001, // 现货买入手续费率 0.1%
    spotSell: 0.001, // 现货卖出手续费率 0.1%
    limitBuy: 0.002, // 挂单买入手续费率 0.2%
    limitSell: 0.002, // 挂单卖出手续费率 0.2%
    shortOpen: 0.001, // 空单开仓手续费率 0.1%
    shortClose: 0.001 // 空单平仓手续费率 0.1%
};
// Mock 价格设置函数
function setMockPrice(symbol, price) {
    price_1.getPrice.mockImplementation((s) => {
        if (s === symbol)
            return price;
        throw new Error('未知交易对');
    });
}
// Mock 多个交易对价格设置函数
function setMultiMockPrices(prices) {
    price_1.getPrice.mockImplementation((symbol) => {
        const price = prices[symbol];
        if (price === undefined)
            throw new Error('未知交易对');
        return price;
    });
}
// 计算手续费的辅助函数
function calculateFee(amount, price, feeRate) {
    return amount * price * feeRate;
}
