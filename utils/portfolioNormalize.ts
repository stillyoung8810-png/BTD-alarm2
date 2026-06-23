/**
 * Supabase 응답(snake_case) → 앱에서 사용하는 Portfolio(camelCase) 정규화
 * DRY: App.tsx 및 handleAddPortfolio 내 중복 제거
 */
import type {
  AlarmConfig,
  Portfolio,
  PortfolioRow,
  Strategy,
  Trade,
  VrBandStrategyParams,
  VrSnapshot,
} from '../types';
import { isNotificationAgreementSuccessStatus } from '../types';
import { STRATEGY_DEFAULTS } from '../constants/domain/financeRules';
import {
  DEFAULT_FEE_RATE,
  LEGACY_FEE_RATE_PCT,
  RATE_PRECISION_MULTIPLIER,
  TVC_LIMITS,
  VR_ROOT_FEE_DECIMAL_HEAL_MAX,
  VR_ROOT_FEE_DECIMAL_MATCH_EPS,
} from '../constants/vrConstants';
import { sanitizeVrCycleWeeks } from './vrBandStrategy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readVrSnapshotFromRow(item: PortfolioRow): VrSnapshot | undefined {
  const raw = item.vr_snapshot ?? item['vrSnapshot'];
  if (raw == null) return undefined;
  if (!isRecord(raw)) return undefined;
  return raw as unknown as VrSnapshot;
}

function coerceAlarmConfig(raw: unknown): AlarmConfig | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.enabled !== 'boolean') return undefined;
  if (!Array.isArray(raw.selectedHours)) return undefined;
  const selectedHours = raw.selectedHours.filter((h): h is string => typeof h === 'string');
  const config: AlarmConfig = { enabled: raw.enabled, selectedHours };

  if (typeof raw.timezone === 'string') {
    config.timezone = raw.timezone;
  }
  // 동의 메타데이터는 유효한 타입일 때만 복원해 손상된 DB 값으로 상태가 오염되지 않게 한다.
  if (typeof raw.notificationAgreementTemplateCode === 'string') {
    config.notificationAgreementTemplateCode = raw.notificationAgreementTemplateCode;
  }
  if (isNotificationAgreementSuccessStatus(raw.notificationAgreementStatus)) {
    config.notificationAgreementStatus = raw.notificationAgreementStatus;
  }
  if (typeof raw.notificationAgreementAgreedAt === 'string') {
    config.notificationAgreementAgreedAt = raw.notificationAgreementAgreedAt;
  }

  return config;
}

export function normalizePortfolioData(data: unknown[]): Portfolio[] {
  if (!Array.isArray(data)) return [];

  return data.reduce<Portfolio[]>((acc, rawItem) => {
    if (!isRecord(rawItem)) {
      console.warn('[VR_Normalize_Warning] Invalid portfolio row skipped', rawItem);
      return acc;
    }

    const item: PortfolioRow = rawItem;
    const rawFeeRate = item.fee_rate ?? item.feeRate ?? LEGACY_FEE_RATE_PCT;

    let normalizedStrategy: Strategy | undefined = item.strategy ?? undefined;

    if (
      normalizedStrategy &&
      isRecord(normalizedStrategy) &&
      'vrBand' in normalizedStrategy &&
      normalizedStrategy.vrBand != null &&
      isRecord(normalizedStrategy.vrBand)
    ) {
      const vrRecord = normalizedStrategy.vrBand;
      const cycleWeeks = sanitizeVrCycleWeeks(vrRecord.cycleWeeks);

      const rawVrMode = vrRecord.vrMode;
      const validVrMode: VrBandStrategyParams['vrMode'] =
        rawVrMode === 'lump_sum' || rawVrMode === 'withdraw' || rawVrMode === 'accumulate'
          ? rawVrMode
          : 'accumulate';

      const n = (v: unknown) => Number(v ?? 0);
      const baseFields = {
        initialV: n(vrRecord.initialV),
        initialCapital: n(vrRecord.initialCapital),
        bandRateUpper: n(vrRecord.bandRateUpper),
        bandRateLower: n(vrRecord.bandRateLower),
        G: n(vrRecord.G ?? STRATEGY_DEFAULTS.VR_G_VALUE),
        minOrderQty: n(vrRecord.minOrderQty),
        poolUsageRateBuy: n(vrRecord.poolUsageRateBuy),
        feeRate: n(vrRecord.feeRate ?? DEFAULT_FEE_RATE),
        cycleWeeks,
        baseGrowthRatePct: Math.max(
          TVC_LIMITS.BASE_GROWTH_RATE.MIN,
          n(
            vrRecord.baseGrowthRatePct ??
              STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
          ),
        ),
        smartBrakeThresholdPct: Math.max(
          TVC_LIMITS.SMART_BRAKE_THRESHOLD.MIN,
          n(
            vrRecord.smartBrakeThresholdPct ??
              STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
          ),
        ),
      };

      const rawDeltaCash = n(vrRecord.deltaCash);

      const sanitizedVrParams: VrBandStrategyParams =
        validVrMode === 'lump_sum'
          ? { ...baseFields, vrMode: 'lump_sum', deltaCash: 0 }
          : validVrMode === 'withdraw'
            ? {
                ...baseFields,
                vrMode: 'withdraw',
                deltaCash: rawDeltaCash <= 0 ? rawDeltaCash : -Math.abs(rawDeltaCash),
              }
            : { ...baseFields, vrMode: 'accumulate', deltaCash: Math.abs(rawDeltaCash) };

      normalizedStrategy = {
        ...normalizedStrategy,
        vrBand: sanitizedVrParams,
      };
    }

    if (normalizedStrategy === undefined) {
      console.warn('[VR_Normalize_Warning] Row skipped: missing strategy', item.id);
      return acc;
    }

    const rawTrades: unknown = item.trades;
    const trades: Trade[] = Array.isArray(rawTrades) ? (rawTrades as Trade[]) : [];

    const closedRaw = item.closed_at ?? item.closedAt;
    const closedAt = closedRaw == null ? undefined : String(closedRaw);

    const finalRaw = item.final_sell_amount ?? item.finalSellAmount;
    const finalSellAmount = finalRaw == null ? undefined : Number(finalRaw);

    // VR 생성 시 루트 fee_rate에 소수(0.0025)를 넣던 버그 복구: vrBand.feeRate(소수)와 동일하면 퍼센트로 환산.
    let portfolioFeeRate = Number(rawFeeRate);
    const vrBand = normalizedStrategy.vrBand;
    if (
      vrBand != null &&
      portfolioFeeRate > 0 &&
      portfolioFeeRate < VR_ROOT_FEE_DECIMAL_HEAL_MAX &&
      Math.abs(portfolioFeeRate - vrBand.feeRate) < VR_ROOT_FEE_DECIMAL_MATCH_EPS
    ) {
      portfolioFeeRate =
        Math.round((portfolioFeeRate * 100 + Number.EPSILON) * RATE_PRECISION_MULTIPLIER) /
        RATE_PRECISION_MULTIPLIER;
    }

    const portfolio: Portfolio = {
      id: item.id == null ? '' : String(item.id),
      name: item.name == null ? '' : String(item.name),
      dailyBuyAmount: Number(item.daily_buy_amount ?? 0),
      startDate: String(item.start_date ?? item.startDate ?? ''),
      feeRate: portfolioFeeRate,
      strategy: normalizedStrategy,
      isClosed: Boolean(item.is_closed ?? item.isClosed ?? false),
      trades,
      closedAt,
      finalSellAmount,
      alarmconfig: coerceAlarmConfig(item.alarm_config ?? item.alarmconfig),
      vrSnapshot: readVrSnapshotFromRow(item),
    };

    acc.push(portfolio);
    return acc;
  }, []);
}
