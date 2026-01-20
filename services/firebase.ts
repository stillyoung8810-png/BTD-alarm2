import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, Messaging, onMessage } from 'firebase/messaging';
import { isSupported } from 'firebase/messaging';

// Firebase 설정 - 환경변수에서 가져오기
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// VAPID 키 - 환경변수에서 가져오기 (없으면 상수로 관리 가능)
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

// Firebase 앱 초기화
let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

// Firebase 앱이 이미 초기화되어 있지 않으면 초기화
if (typeof window !== 'undefined' && getApps().length === 0) {
  try {
    app = initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
} else if (typeof window !== 'undefined' && getApps().length > 0) {
  app = getApps()[0];
}

// Messaging 초기화 (브라우저 환경에서만)
const initializeMessaging = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined') {
    console.warn('Firebase Messaging is only available in browser environment');
    return null;
  }

  // 브라우저가 Service Worker를 지원하는지 확인
  const supported = await isSupported();
  if (!supported) {
    console.warn('This browser does not support Firebase Messaging');
    return null;
  }

  if (!app) {
    console.error('Firebase app is not initialized');
    return null;
  }

  try {
    messaging = getMessaging(app);
    return messaging;
  } catch (error) {
    console.error('Firebase Messaging initialization error:', error);
    return null;
  }
};

/**
 * 브라우저 알림 권한을 요청하고 FCM 토큰을 받아오는 함수
 * @returns FCM 토큰 (성공 시) 또는 null (실패 시)
 */
export const requestForToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') {
    console.warn('requestForToken is only available in browser environment');
    return null;
  }

  // VAPID 키 확인
  if (!VAPID_KEY) {
    console.error('VAPID key is not configured. Please set VITE_FIREBASE_VAPID_KEY in your environment variables.');
    return null;
  }

  try {
    // Messaging 초기화
    const messagingInstance = await initializeMessaging();
    if (!messagingInstance) {
      return null;
    }

    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('Notification permission granted');
      
      // FCM 토큰 가져오기
      const currentToken = await getToken(messagingInstance, {
        vapidKey: VAPID_KEY,
      });

      if (currentToken) {
        console.log('FCM token retrieved successfully:', currentToken);
        return currentToken;
      } else {
        console.warn('No registration token available. Request permission to generate one.');
        return null;
      }
    } else if (permission === 'denied') {
      console.warn('Notification permission denied by user');
      return null;
    } else {
      console.warn('Notification permission default (not granted or denied)');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
    return null;
  }
};

/**
 * 포그라운드에서 메시지를 받았을 때 처리하는 함수
 * @param callback 메시지를 받았을 때 실행할 콜백 함수
 */
export const onMessageListener = (callback: (payload: any) => void): (() => void) | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!messaging) {
    initializeMessaging().then((messagingInstance) => {
      if (messagingInstance) {
        const unsubscribe = onMessage(messagingInstance, callback);
        return unsubscribe;
      }
    });
    return null;
  }

  try {
    const unsubscribe = onMessage(messaging, callback);
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up message listener:', error);
    return null;
  }
};

/**
 * 현재 알림 권한 상태를 확인하는 함수
 * @returns 'granted' | 'denied' | 'default'
 */
export const getNotificationPermission = (): NotificationPermission | null => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }
  return Notification.permission;
};

/**
 * 알림 권한이 이미 허용되어 있는지 확인하는 함수
 * @returns boolean
 */
export const isNotificationPermissionGranted = (): boolean => {
  const permission = getNotificationPermission();
  return permission === 'granted';
};

// Messaging 인스턴스 export (필요한 경우)
export { messaging };

// Firebase 앱 인스턴스 export (필요한 경우)
export { app as firebaseApp };
