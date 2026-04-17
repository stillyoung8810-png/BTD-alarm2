import type { Trade } from '../types';
import { calculateHoldingsFromTrades } from './portfolioCalculations';
import { validateFinancialArgs } from './vrBandStrategy';

const HOLDINGS_QTY_EPSILON = 1e-10;

type SellValidationTrade = Pick<Trade, 'type' | 'stock' | 'quantity'>;

export interface SellQuantityLimitViolation {
  stock: string;
  availableQuantity: number;
  requestedQuantity: number;
  tradeIndex?: number;
}

function normalizeTradeStock(stock: string): string {
  return stock.trim().toUpperCase();
}

function normalizeTradeQuantity(quantity: number): number {
  const normalizedQuantity = Math.abs(Number(quantity));
  validateFinancialArgs(
    { quantity: normalizedQuantity },
    { quantity: { strictPositive: true } },
    'normalizeTradeQuantity',
  );
  return normalizedQuantity;
}

function buildHoldingQuantityMap(trades: readonly Trade[]): Map<string, number> {
  return new Map(
    calculateHoldingsFromTrades([...trades]).map((holding) => [
      normalizeTradeStock(holding.stock),
      holding.quantity,
    ]),
  );
}

export function getHoldingQuantityForStock(
  trades: readonly Trade[],
  stock: string,
): number {
  const normalizedStock = normalizeTradeStock(stock);
  if (normalizedStock.length === 0) {
    return 0;
  }

  return buildHoldingQuantityMap(trades).get(normalizedStock) ?? 0;
}

export function getSellQuantityLimitViolation(args: {
  stock: string;
  availableQuantity: number;
  requestedQuantity: number;
}): SellQuantityLimitViolation | null {
  const normalizedStock = normalizeTradeStock(args.stock);
  const availableQuantity = Math.max(0, args.availableQuantity);
  const requestedQuantity = normalizeTradeQuantity(args.requestedQuantity);

  validateFinancialArgs(
    { availableQuantity },
    { availableQuantity: { min: 0 } },
    'getSellQuantityLimitViolation',
  );

  if (normalizedStock.length === 0) {
    return null;
  }

  if (requestedQuantity <= availableQuantity + HOLDINGS_QTY_EPSILON) {
    return null;
  }

  return {
    stock: normalizedStock,
    availableQuantity,
    requestedQuantity,
  };
}

export function validateSelectedTradesAgainstHoldings(
  existingTrades: readonly Trade[],
  selectedTrades: readonly SellValidationTrade[],
): SellQuantityLimitViolation | null {
  const holdingQuantityMap = buildHoldingQuantityMap(existingTrades);

  for (let index = 0; index < selectedTrades.length; index += 1) {
    const trade = selectedTrades[index];
    const normalizedStock = normalizeTradeStock(trade.stock);
    const normalizedQuantity = normalizeTradeQuantity(trade.quantity);
    const currentQuantity = holdingQuantityMap.get(normalizedStock) ?? 0;

    if (trade.type === 'buy') {
      holdingQuantityMap.set(
        normalizedStock,
        currentQuantity + normalizedQuantity,
      );
      continue;
    }

    const violation = getSellQuantityLimitViolation({
      stock: normalizedStock,
      availableQuantity: currentQuantity,
      requestedQuantity: normalizedQuantity,
    });

    if (violation != null) {
      return {
        ...violation,
        tradeIndex: index,
      };
    }

    holdingQuantityMap.set(
      normalizedStock,
      currentQuantity - normalizedQuantity,
    );
  }

  return null;
}
