import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  StockMetadata,
  StockPriceRecord,
} from '../services/db';

const mockedModules = vi.hoisted(() => ({
  initDatabase: vi.fn<() => Promise<void>>(),
  getIndicatorSnapshotCache: vi.fn(),
  getStockMetadata: vi.fn<() => Promise<StockMetadata | null>>(),
  getStockPrices: vi.fn<() => Promise<StockPriceRecord[]>>(),
  saveIndicatorSnapshotCache: vi.fn<() => Promise<void>>(),
  saveStockPrices: vi.fn<() => Promise<void>>(),
  updateLastCheckedMetadata: vi.fn<() => Promise<void>>(),
  updateStockMetadata: vi.fn<() => Promise<void>>(),
  supabaseFrom: vi.fn(),
}));

const {
  initDatabase,
  getIndicatorSnapshotCache,
  getStockMetadata,
  getStockPrices,
  saveIndicatorSnapshotCache,
  saveStockPrices,
  updateLastCheckedMetadata,
  updateStockMetadata,
  supabaseFrom,
} = mockedModules;

vi.mock('../services/db', () => ({
  initDatabase: mockedModules.initDatabase,
  getIndicatorSnapshotCache: mockedModules.getIndicatorSnapshotCache,
  getStockMetadata: mockedModules.getStockMetadata,
  getStockPrices: mockedModules.getStockPrices,
  saveIndicatorSnapshotCache: mockedModules.saveIndicatorSnapshotCache,
  saveStockPrices: mockedModules.saveStockPrices,
  updateLastCheckedMetadata: mockedModules.updateLastCheckedMetadata,
  updateStockMetadata: mockedModules.updateStockMetadata,
}));

vi.mock('../services/supabase', () => ({
  supabase: {
    from: mockedModules.supabaseFrom,
  },
}));

import {
  buildIndicatorRequirementCacheKey,
  fetchIndicatorAwareSnapshot,
  getRecentTradingDaysFromDbSafe,
} from '../services/stockService';

function createPriceRecord(day: number, close: number): StockPriceRecord {
  return {
    symbol: 'TQQQ',
    date: `2026-01-${String(day).padStart(2, '0')}`,
    close,
    updatedAt: day,
  };
}

function createSupabaseRow(day: number, close: number): {
  close: number;
  trade_date: string;
} {
  return {
    close,
    trade_date: `2026-01-${String(day).padStart(2, '0')}`,
  };
}

function mockSupabasePriceQuery(
  rows: Array<{ close: number; trade_date: string }>,
): void {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });

  supabaseFrom.mockReturnValue({ select });
}

describe('stockService requirement-aware cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initDatabase.mockResolvedValue(undefined);
    getStockMetadata.mockResolvedValue({
      symbol: 'TQQQ',
      lastUpdated: '2026-01-20',
      dataCount: 20,
      updatedAt: 1,
    });
    getStockPrices.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        createPriceRecord(index + 1, 100 + index),
      ),
    );
    getIndicatorSnapshotCache.mockResolvedValue(null);
    saveIndicatorSnapshotCache.mockResolvedValue(undefined);
    saveStockPrices.mockResolvedValue(undefined);
    updateLastCheckedMetadata.mockResolvedValue(undefined);
    updateStockMetadata.mockResolvedValue(undefined);
    supabaseFrom.mockImplementation(() => {
      throw new Error('supabase should not be called in this test');
    });
  });

  it('buildIndicatorRequirementCacheKey는 심볼과 period를 정규화한다', () => {
    expect(
      buildIndicatorRequirementCacheKey({
        symbol: ' tqqq ',
        requirements: {
          needsRsi: false,
          maPeriods: [20, 5, 20],
        },
      }),
    ).toBe('TQQQ|rsi:0|ma:5,20');
  });

  it('indicator-aware 요청은 price-only cache를 묵시적으로 재사용하지 않는다', async () => {
    getIndicatorSnapshotCache.mockImplementation(async (cacheKey: string) => {
      if (cacheKey === 'TQQQ|rsi:0|ma:') {
        return {
          cacheKey,
          symbol: 'TQQQ',
          currentPrice: 1,
          needsRsi: false,
          maPeriodsKey: '',
          sourceLastUpdated: '2026-01-20',
          updatedAt: 1,
        };
      }

      return null;
    });

    const result = await fetchIndicatorAwareSnapshot(' tqqq ', {
      needsRsi: true,
      maPeriods: [20],
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.data == null) {
      throw new Error('expected successful indicator-aware snapshot');
    }

    expect(result.data.currentPrice).toBe(119);
    expect(result.data.rsi).toBe(100);
    expect(result.data.maByPeriod?.[20]).toBe(109.5);
    expect(getIndicatorSnapshotCache).toHaveBeenCalledWith(
      'TQQQ|rsi:1|ma:20',
      '2026-01-20',
    );
    expect(saveIndicatorSnapshotCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: 'TQQQ|rsi:1|ma:20',
        symbol: 'TQQQ',
      }),
    );
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('IndexedDB 초기화 실패 시에도 Supabase 스냅샷 계산으로 폴백한다', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      initDatabase.mockRejectedValueOnce(new Error('indexeddb unavailable'));
      mockSupabasePriceQuery(
        Array.from({ length: 20 }, (_, index) =>
          createSupabaseRow(20 - index, 119 - index),
        ),
      );

      const result = await fetchIndicatorAwareSnapshot('TQQQ', {
        needsRsi: true,
        maPeriods: [20],
      });

      expect(result.ok).toBe(true);
      if (!result.ok || result.data == null) {
        throw new Error('expected fallback snapshot after IndexedDB failure');
      }

      expect(result.data.currentPrice).toBe(119);
      expect(result.data.rsi).toBe(100);
      expect(result.data.maByPeriod?.[20]).toBe(109.5);
      expect(getStockMetadata).not.toHaveBeenCalled();
      expect(getStockPrices).not.toHaveBeenCalled();
      expect(saveStockPrices).not.toHaveBeenCalled();
      expect(saveIndicatorSnapshotCache).not.toHaveBeenCalled();
      expect(supabaseFrom).toHaveBeenCalledWith('stock_prices');
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('IndexedDB 초기화가 멈춰도 타임아웃 후 Supabase 스냅샷으로 폴백한다', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    vi.useFakeTimers();

    try {
      initDatabase.mockImplementationOnce(
        () => new Promise<void>(() => undefined),
      );
      mockSupabasePriceQuery(
        Array.from({ length: 20 }, (_, index) =>
          createSupabaseRow(20 - index, 119 - index),
        ),
      );

      const resultPromise = fetchIndicatorAwareSnapshot('TQQQ', {
        needsRsi: true,
        maPeriods: [20],
      });

      await vi.runOnlyPendingTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (!result.ok || result.data == null) {
        throw new Error('expected timeout fallback snapshot');
      }

      expect(result.data.currentPrice).toBe(119);
      expect(result.data.rsi).toBe(100);
      expect(result.data.maByPeriod?.[20]).toBe(109.5);
      expect(supabaseFrom).toHaveBeenCalledWith('stock_prices');
    } finally {
      vi.useRealTimers();
      consoleErrorSpy.mockRestore();
    }
  });

  it('최근 거래일이 DB에 없으면 Supabase 이력으로 폴백한다', async () => {
    getStockPrices.mockResolvedValueOnce([]);
    mockSupabasePriceQuery(
      Array.from({ length: 5 }, (_, index) =>
        createSupabaseRow(5 - index, 105 - index),
      ),
    );

    const result = await getRecentTradingDaysFromDbSafe('TQQQ', 3);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected recent trading day fallback to succeed');
    }

    expect(result.data).toEqual(['2026-01-05', '2026-01-04', '2026-01-03']);
    expect(saveStockPrices).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'TQQQ', date: '2026-01-05' }),
      ]),
    );
    expect(updateStockMetadata).toHaveBeenCalledWith('TQQQ', '2026-01-05', 5);
    expect(supabaseFrom).toHaveBeenCalledWith('stock_prices');
  });
});
