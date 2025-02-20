"use strict";
/*
 * price.ts
 * Author: perterpon.wang<perterpon.wang@bytedance.com>
 * Create: Tue Feb 18 2025 20:26:52 GMT+0800 (China Standard Time)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrice = getPrice;
exports.setPrice = setPrice;
const prices = new Map();
function getPrice(symbol) {
    const price = prices.get(symbol);
    if (!price) {
        throw new Error(`Price not found: ${symbol}`);
    }
    return price;
}
function setPrice(symbol, price) {
    prices.set(symbol, price);
}
