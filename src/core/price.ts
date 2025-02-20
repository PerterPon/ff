
/*
 * price.ts
 * Author: perterpon.wang<perterpon.wang@bytedance.com>
 * Create: Tue Feb 18 2025 20:26:52 GMT+0800 (China Standard Time)
 */

import { Symbol } from '../types/main';

const prices: Map<Symbol, number> = new Map();

export function getPrice(symbol: Symbol) {
  const price = prices.get(symbol);
  if (!price) {
    throw new Error(`Price not found: ${symbol}`);
  }
  return price;
}

export function setPrice(symbol: Symbol, price: number) {
  prices.set(symbol, price);
}
