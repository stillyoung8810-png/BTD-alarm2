import type {
  NotificationAgreementResult,
  RequestNotificationAgreementOptions,
} from '@apps-in-toss/web-framework';
import { isTossApp, loadWebFramework } from './tossAppBridge';
import { normalizeErrorMessage } from './serviceUtils';
import { readTossNotificationAgreementTemplateCode } from '../utils/viteImportMetaEnv';

const TOSS_NOTIFICATION_AGREEMENT_MIN_VERSION = {
  android: '5.255.0',
  ios: '5.255.0',
} as const;

export type TossNotificationAgreementResultType =
  | NotificationAgreementResult
  | 'missingTemplateCode'
  | 'unsupportedEnvironment'
  | 'sdkError';

export type TossNotificationAgreementServiceResult =
  | {
      readonly type: NotificationAgreementResult;
    }
  | {
      readonly type: 'missingTemplateCode' | 'unsupportedEnvironment';
    }
  | {
      readonly type: 'sdkError';
      readonly message: string;
      readonly error: unknown;
    };

type RequestNotificationAgreement =
  NonNullable<
    NonNullable<
      Awaited<ReturnType<typeof loadWebFramework>>
    >['requestNotificationAgreement']
  >;
type IsMinVersionSupported =
  NonNullable<
    Awaited<ReturnType<typeof loadWebFramework>>
  >['isMinVersionSupported'];
type NotificationAgreementEvent =
  Parameters<RequestNotificationAgreementOptions['onEvent']>[0];

export async function requestTossNotificationAgreement(): Promise<TossNotificationAgreementServiceResult> {
  if (!isTossApp()) {
    return { type: 'unsupportedEnvironment' };
  }

  const templateCode = readTossNotificationAgreementTemplateCode();
  if (templateCode.length === 0) {
    return { type: 'missingTemplateCode' };
  }

  const framework = await loadWebFramework();
  if (
    framework?.requestNotificationAgreement == null ||
    !isNotificationAgreementSupported(framework.isMinVersionSupported)
  ) {
    return { type: 'unsupportedEnvironment' };
  }

  return requestAgreementWithBridge(
    framework.requestNotificationAgreement,
    templateCode,
  );
}

function isNotificationAgreementSupported(
  isMinVersionSupported: IsMinVersionSupported,
): boolean {
  if (typeof isMinVersionSupported !== 'function') {
    return false;
  }

  try {
    return isMinVersionSupported(TOSS_NOTIFICATION_AGREEMENT_MIN_VERSION) === true;
  } catch {
    return false;
  }
}

function requestAgreementWithBridge(
  requestNotificationAgreement: RequestNotificationAgreement,
  templateCode: string,
): Promise<TossNotificationAgreementServiceResult> {
  return new Promise<TossNotificationAgreementServiceResult>((resolve) => {
    let cleanup: (() => void) | null = null;
    let hasCleanupRun = false;
    let hasSettled = false;
    let shouldCleanupAfterAssignment = false;

    const runCleanupOnce = (): void => {
      if (hasCleanupRun) {
        return;
      }

      if (cleanup == null) {
        shouldCleanupAfterAssignment = true;
        return;
      }

      hasCleanupRun = true;
      try {
        cleanup();
      } catch (error: unknown) {
        console.warn(
          '[TossNotificationAgreement] cleanup failed:',
          normalizeErrorMessage(error, 'unknown_error'),
        );
      }
    };

    const settle = (result: TossNotificationAgreementServiceResult): void => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      runCleanupOnce();
      resolve(result);
    };

    const assignCleanup = (nextCleanup: () => void): void => {
      cleanup = nextCleanup;
      if (shouldCleanupAfterAssignment) {
        runCleanupOnce();
      }
    };

    try {
      const nextCleanup = requestNotificationAgreement({
        options: { templateCode },
        onEvent: (event) => {
          settle(toAgreementResult(event));
        },
        onError: (error) => {
          settle(toSdkErrorResult(error));
        },
      });

      if (typeof nextCleanup !== 'function') {
        settle(toSdkErrorResult(new Error('cleanup_not_returned')));
        return;
      }

      assignCleanup(nextCleanup);
    } catch (error: unknown) {
      settle(toSdkErrorResult(error));
    }
  });
}

function toAgreementResult(
  event: NotificationAgreementEvent,
): TossNotificationAgreementServiceResult {
  const agreementType = event.type;
  switch (agreementType) {
    case 'newAgreement':
    case 'alreadyAgreed':
    case 'agreementRejected':
      return { type: agreementType };
    default: {
      const exhaustiveCheck: never = agreementType;
      return toSdkErrorResult(new Error(`unknown_agreement_result:${String(exhaustiveCheck)}`));
    }
  }
}

function toSdkErrorResult(error: unknown): TossNotificationAgreementServiceResult {
  return {
    type: 'sdkError',
    message: normalizeErrorMessage(error, 'notification_agreement_failed'),
    error,
  };
}
