import { useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { parseDeviceInfo } from '../utils/deviceInfo';
import { isTossApp } from '../services/tossAppBridge';

/**
 * FCM 토큰 저장 로직 훅.
 * user당 중복 호출 방지, 토스 앱 환경에서는 no-op.
 */
export function useFCMToken() {
  const saveFCMTokenInProgressRef = useRef<string | null>(null);

  const saveFCMToken = useCallback(async (userId: string): Promise<void> => {
    if (typeof window === 'undefined') {
      console.warn('[FCM] saveFCMToken called on non-browser environment. Skipping.');
      return;
    }
    if (isTossApp()) {
      saveFCMTokenInProgressRef.current = null;
      return;
    }
    if (saveFCMTokenInProgressRef.current === userId) {
      console.log('[FCM] saveFCMToken already in progress.');
      return;
    }
    saveFCMTokenInProgressRef.current = userId;
    console.log('[FCM] saveFCMToken called.');

    try {
      const { getNotificationPermission, requestForToken } = await import('../services/firebase');
      const permission = getNotificationPermission();
      console.log('[FCM] Current Notification.permission:', permission);

      if (permission === 'denied') {
        console.warn('[FCM] Notification permission was previously denied. Skipping FCM token request.');
        return;
      }

      console.log('[FCM] Requesting FCM token via requestForToken()...');
      const token = await requestForToken();
      console.log('[FCM] requestForToken() resolved. Token exists:', !!token);

      if (!token) {
        console.warn('[FCM] Token is null/undefined. Aborting save.');
        return;
      }

      const deviceInfo = parseDeviceInfo();
      console.log('[FCM] Parsed device info:', deviceInfo);

      console.log('[FCM] Upserting token into user_devices...');
      const { error } = await supabase
        .from('user_devices')
        .upsert(
          {
            user_id: userId,
            fcm_token: token,
            device_type: deviceInfo.deviceType,
            device_name: deviceInfo.deviceName,
            user_agent: deviceInfo.userAgent,
            is_active: true,
          },
          {
            onConflict: 'user_id,fcm_token',
            ignoreDuplicates: false,
          }
        );

      if (error) {
        console.error('[FCM] Failed to save FCM token:', error);
      } else {
        console.log('[FCM] FCM token saved successfully');
      }
    } catch (error) {
      console.error('[FCM] Error saving FCM token:', error);
    } finally {
      saveFCMTokenInProgressRef.current = null;
    }
  }, []);

  return { saveFCMToken };
}
