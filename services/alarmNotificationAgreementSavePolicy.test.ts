import { describe, expect, it, vi } from 'vitest';
import type { AlarmConfig } from '../types';
import {
  resolveAlarmNotificationAgreementForSave,
} from './alarmNotificationAgreementSavePolicy';
import type {
  TossNotificationAgreementServiceResult,
} from './tossNotificationAgreementService';

const AGREED_AT_ISO = '2026-06-19T10:30:00.000Z';
const TEMPLATE_CODE = 'alarm-template-code';

function createEnabledAlarmConfig(): AlarmConfig {
  return {
    enabled: true,
    selectedHours: ['09:00'],
    timezone: 'Asia/Seoul',
  };
}

function createRequestAgreementMock(
  result: TossNotificationAgreementServiceResult,
): () => Promise<TossNotificationAgreementServiceResult> {
  return vi.fn<() => Promise<TossNotificationAgreementServiceResult>>()
    .mockResolvedValue(result);
}

describe('resolveAlarmNotificationAgreementForSave', () => {
  it('env templateCode가 없으면 기존처럼 저장합니다', async () => {
    const nextConfig = createEnabledAlarmConfig();
    const requestAgreement = createRequestAgreementMock({ type: 'newAgreement' });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig,
      isInTossApp: true,
      templateCode: '',
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({ type: 'save', config: nextConfig });
    expect(requestAgreement).not.toHaveBeenCalled();
  });

  it('Toss 앱이 아니면 기존처럼 저장합니다', async () => {
    const nextConfig = createEnabledAlarmConfig();
    const requestAgreement = createRequestAgreementMock({ type: 'newAgreement' });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig,
      isInTossApp: false,
      templateCode: TEMPLATE_CODE,
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({ type: 'save', config: nextConfig });
    expect(requestAgreement).not.toHaveBeenCalled();
  });

  it('알람 OFF 저장이면 SDK를 호출하지 않고 저장합니다', async () => {
    const nextConfig: AlarmConfig = {
      enabled: false,
      selectedHours: [],
      timezone: 'Asia/Seoul',
    };
    const requestAgreement = createRequestAgreementMock({ type: 'newAgreement' });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig,
      isInTossApp: true,
      templateCode: TEMPLATE_CODE,
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({ type: 'save', config: nextConfig });
    expect(requestAgreement).not.toHaveBeenCalled();
  });

  it('Toss 앱에서 동의 성공 시 동의 메타데이터를 포함해 저장합니다', async () => {
    const nextConfig = createEnabledAlarmConfig();
    const requestAgreement = createRequestAgreementMock({ type: 'newAgreement' });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig,
      isInTossApp: true,
      templateCode: ` ${TEMPLATE_CODE} `,
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({
      type: 'save',
      config: {
        ...nextConfig,
        notificationAgreementTemplateCode: TEMPLATE_CODE,
        notificationAgreementStatus: 'newAgreement',
        notificationAgreementAgreedAt: AGREED_AT_ISO,
      },
    });
    expect(requestAgreement).toHaveBeenCalledTimes(1);
  });

  it('같은 templateCode로 이미 동의 완료된 경우 SDK를 재호출하지 않고 저장합니다', async () => {
    const nextConfig = createEnabledAlarmConfig();
    const currentConfig: AlarmConfig = {
      ...nextConfig,
      notificationAgreementTemplateCode: TEMPLATE_CODE,
      notificationAgreementStatus: 'alreadyAgreed',
      notificationAgreementAgreedAt: AGREED_AT_ISO,
    };
    const requestAgreement = createRequestAgreementMock({ type: 'newAgreement' });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig,
      nextConfig,
      isInTossApp: true,
      templateCode: TEMPLATE_CODE,
      requestAgreement,
      nowIso: () => '2026-06-20T00:00:00.000Z',
    });

    expect(decision).toEqual({
      type: 'save',
      config: {
        ...nextConfig,
        notificationAgreementTemplateCode: TEMPLATE_CODE,
        notificationAgreementStatus: 'alreadyAgreed',
        notificationAgreementAgreedAt: AGREED_AT_ISO,
      },
    });
    expect(requestAgreement).not.toHaveBeenCalled();
  });

  it('Toss 앱에서 동의 거절 시 저장하지 않습니다', async () => {
    const requestAgreement = createRequestAgreementMock({
      type: 'agreementRejected',
    });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig: createEnabledAlarmConfig(),
      isInTossApp: true,
      templateCode: TEMPLATE_CODE,
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({ type: 'block', reason: 'agreementRejected' });
  });

  it('Toss 앱에서 SDK 에러 시 저장하지 않습니다', async () => {
    const requestAgreement = createRequestAgreementMock({
      type: 'sdkError',
      message: 'bridge failed',
      error: new Error('bridge failed'),
    });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig: createEnabledAlarmConfig(),
      isInTossApp: true,
      templateCode: TEMPLATE_CODE,
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({ type: 'block', reason: 'sdkError' });
  });

  it('Toss 앱에서 SDK 미지원 시 저장하지 않습니다', async () => {
    const requestAgreement = createRequestAgreementMock({
      type: 'unsupportedEnvironment',
    });

    const decision = await resolveAlarmNotificationAgreementForSave({
      currentConfig: null,
      nextConfig: createEnabledAlarmConfig(),
      isInTossApp: true,
      templateCode: TEMPLATE_CODE,
      requestAgreement,
      nowIso: () => AGREED_AT_ISO,
    });

    expect(decision).toEqual({ type: 'block', reason: 'unsupportedEnvironment' });
  });
});
