import type {
  AlarmConfig,
  NotificationAgreementSuccessStatus,
} from '../types';
import { isNotificationAgreementSuccessStatus } from '../types';
import type {
  TossNotificationAgreementServiceResult,
} from './tossNotificationAgreementService';

export type AlarmNotificationAgreementBlockReason =
  | 'agreementRejected'
  | 'sdkError'
  | 'unsupportedEnvironment';

export type AlarmNotificationAgreementSaveDecision =
  | {
      readonly type: 'save';
      readonly config: AlarmConfig;
    }
  | {
      readonly type: 'block';
      readonly reason: AlarmNotificationAgreementBlockReason;
    };

export interface ResolveAlarmNotificationAgreementForSaveParams {
  readonly currentConfig?: AlarmConfig | null;
  readonly nextConfig: AlarmConfig;
  readonly isInTossApp: boolean;
  readonly templateCode: string;
  readonly requestAgreement: () => Promise<TossNotificationAgreementServiceResult>;
  readonly nowIso: () => string;
}

export async function resolveAlarmNotificationAgreementForSave({
  currentConfig,
  nextConfig,
  isInTossApp,
  templateCode,
  requestAgreement,
  nowIso,
}: ResolveAlarmNotificationAgreementForSaveParams): Promise<AlarmNotificationAgreementSaveDecision> {
  const normalizedTemplateCode = templateCode.trim();

  if (
    !nextConfig.enabled ||
    !isInTossApp ||
    normalizedTemplateCode.length === 0
  ) {
    return { type: 'save', config: nextConfig };
  }

  if (hasReusableAgreement(currentConfig, normalizedTemplateCode)) {
    return {
      type: 'save',
      config: {
        ...nextConfig,
        notificationAgreementTemplateCode:
          currentConfig.notificationAgreementTemplateCode,
        notificationAgreementStatus: currentConfig.notificationAgreementStatus,
        notificationAgreementAgreedAt:
          currentConfig.notificationAgreementAgreedAt,
      },
    };
  }

  const agreementResult = await requestAgreement();
  return toSaveDecisionFromAgreementResult({
    nextConfig,
    normalizedTemplateCode,
    agreementResult,
    agreedAt: nowIso(),
  });
}

function hasReusableAgreement(
  currentConfig: AlarmConfig | null | undefined,
  normalizedTemplateCode: string,
): currentConfig is AlarmConfig & {
  notificationAgreementTemplateCode: string;
  notificationAgreementStatus: NotificationAgreementSuccessStatus;
} {
  if (currentConfig == null) {
    return false;
  }

  return (
    currentConfig.notificationAgreementTemplateCode === normalizedTemplateCode &&
    isNotificationAgreementSuccessStatus(currentConfig.notificationAgreementStatus)
  );
}

function toSaveDecisionFromAgreementResult({
  nextConfig,
  normalizedTemplateCode,
  agreementResult,
  agreedAt,
}: {
  readonly nextConfig: AlarmConfig;
  readonly normalizedTemplateCode: string;
  readonly agreementResult: TossNotificationAgreementServiceResult;
  readonly agreedAt: string;
}): AlarmNotificationAgreementSaveDecision {
  switch (agreementResult.type) {
    case 'newAgreement':
    case 'alreadyAgreed':
      return {
        type: 'save',
        config: {
          ...nextConfig,
          notificationAgreementTemplateCode: normalizedTemplateCode,
          notificationAgreementStatus: agreementResult.type,
          notificationAgreementAgreedAt: agreedAt,
        },
      };
    case 'missingTemplateCode':
      return { type: 'save', config: nextConfig };
    case 'agreementRejected':
      return { type: 'block', reason: 'agreementRejected' };
    case 'sdkError':
      return { type: 'block', reason: 'sdkError' };
    case 'unsupportedEnvironment':
      return { type: 'block', reason: 'unsupportedEnvironment' };
    default: {
      const exhaustiveCheck: never = agreementResult;
      return exhaustiveCheck;
    }
  }
}
