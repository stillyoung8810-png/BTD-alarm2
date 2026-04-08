import { supabase } from './supabase';
import {
  createServiceError,
  failResult,
  normalizeErrorMessage,
  okResult,
  type ServiceResult,
} from './serviceUtils';
import {
  getNotificationPermission,
  requestForToken,
} from './firebase';

export interface UserDeviceInfoPayload {
  deviceName: string;
  userAgent: string;
  deviceType: string;
}

/**
 * FCM 토큰 획득 후 `user_devices`에 upsert합니다.
 * 권한 거부·토큰 없음은 제품 정책상 조용히 성공(no-op)으로 간주합니다.
 */
export async function saveUserFcmTokenSafe(
  userId: string,
  deviceInfo: UserDeviceInfoPayload,
): Promise<ServiceResult<null>> {
  const trimmedUserId = userId.trim();
  if (trimmedUserId.length === 0) {
    return failResult(
      null,
      createServiceError('INVALID_INPUT', 'fcm_user_id_required', {
        context: { userId: trimmedUserId },
      }),
      { userId: trimmedUserId },
    );
  }

  if (typeof window === 'undefined') {
    return failResult(
      null,
      createServiceError('UNSUPPORTED_ENV', 'fcm_browser_only', {
        context: { userId: trimmedUserId },
      }),
      { userId: trimmedUserId },
    );
  }

  const permission = getNotificationPermission();
  if (permission === 'denied') {
    return okResult(null, { userId: trimmedUserId, skipped: 'permission_denied' });
  }

  const token = await requestForToken();
  if (token == null || token.trim().length === 0) {
    return okResult(null, { userId: trimmedUserId, skipped: 'no_token' });
  }

  try {
    const { error } = await supabase.from('user_devices').upsert(
      {
        user_id: trimmedUserId,
        fcm_token: token,
        device_type: deviceInfo.deviceType,
        device_name: deviceInfo.deviceName,
        user_agent: deviceInfo.userAgent,
        is_active: true,
      },
      {
        onConflict: 'user_id,fcm_token',
        ignoreDuplicates: false,
      },
    );

    if (error != null) {
      return failResult(
        null,
        createServiceError('SDK_ERROR', normalizeErrorMessage(error, 'fcm_upsert_failed'), {
          cause: error,
          context: { userId: trimmedUserId },
        }),
        { userId: trimmedUserId },
      );
    }

    return okResult(null, { userId: trimmedUserId });
  } catch (error: unknown) {
    return failResult(
      null,
      createServiceError(
        'NETWORK',
        normalizeErrorMessage(error, 'fcm_upsert_exception'),
        {
          retryable: true,
          cause: error,
          context: { userId: trimmedUserId },
        },
      ),
      { userId: trimmedUserId },
    );
  }
}
