import { describe, expect, it } from 'vitest';
import { normalizePortfolioData } from './portfolioNormalize';

const BASE_STRATEGY = {
  ma0: { stock: 'TQQQ', rsiEnabled: false },
  ma1: { stock: 'TQQQ' },
  ma2: { stock: 'TQQQ', splitCount: 1 },
  ma3: { stock: 'TQQQ' },
} as const;

function createRowWithAlarmConfig(alarmConfig: unknown): Record<string, unknown> {
  return {
    id: 'portfolio-1',
    name: 'alarm normalize',
    daily_buy_amount: 100,
    start_date: '2026-04-13',
    fee_rate: 0.25,
    is_closed: false,
    trades: [],
    strategy: BASE_STRATEGY,
    alarm_config: alarmConfig,
  };
}

describe('normalizePortfolioData coerceAlarmConfig', () => {
  it('유효한 동의 메타데이터는 정규화 후 그대로 유지된다', () => {
    const alarmConfig = {
      enabled: true,
      selectedHours: ['09:00'],
      timezone: 'Asia/Seoul',
      notificationAgreementTemplateCode: 'tmpl-1',
      notificationAgreementStatus: 'alreadyAgreed',
      notificationAgreementAgreedAt: '2026-06-19T10:30:00.000Z',
    };

    const normalized = normalizePortfolioData([
      createRowWithAlarmConfig(alarmConfig),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].alarmconfig).toEqual(alarmConfig);
  });

  it('잘못된 notificationAgreementStatus는 버려지고 나머지 유효 값은 보존된다', () => {
    const alarmConfig = {
      enabled: true,
      selectedHours: ['09:00'],
      notificationAgreementTemplateCode: 'tmpl-1',
      notificationAgreementStatus: 'agreementRejected',
      notificationAgreementAgreedAt: '2026-06-19T10:30:00.000Z',
    };

    const normalized = normalizePortfolioData([
      createRowWithAlarmConfig(alarmConfig),
    ]);

    expect(normalized[0].alarmconfig).toEqual({
      enabled: true,
      selectedHours: ['09:00'],
      notificationAgreementTemplateCode: 'tmpl-1',
      notificationAgreementAgreedAt: '2026-06-19T10:30:00.000Z',
    });
    expect(
      normalized[0].alarmconfig?.notificationAgreementStatus,
    ).toBeUndefined();
  });

  it('문자열이 아닌 templateCode/agreedAt은 버려진다', () => {
    const alarmConfig = {
      enabled: true,
      selectedHours: ['09:00'],
      notificationAgreementTemplateCode: 123,
      notificationAgreementStatus: 'newAgreement',
      notificationAgreementAgreedAt: 1718791800000,
    };

    const normalized = normalizePortfolioData([
      createRowWithAlarmConfig(alarmConfig),
    ]);

    expect(normalized[0].alarmconfig).toEqual({
      enabled: true,
      selectedHours: ['09:00'],
      notificationAgreementStatus: 'newAgreement',
    });
  });

  it('동의 메타데이터가 없는 기존 알람 config는 기존처럼 정규화된다', () => {
    const alarmConfig = {
      enabled: true,
      selectedHours: ['15:00', '16:00'],
      timezone: 'Asia/Seoul',
    };

    const normalized = normalizePortfolioData([
      createRowWithAlarmConfig(alarmConfig),
    ]);

    expect(normalized[0].alarmconfig).toEqual(alarmConfig);
  });
});
