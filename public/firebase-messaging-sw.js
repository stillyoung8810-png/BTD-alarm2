// public/firebase-messaging-sw.js
// Firebase Messaging 서비스 워커 (compat 버전)

// 1. Firebase compat SDK 로드 (서비스 워커에서는 importScripts 사용)
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// 2. Firebase 초기화 설정
//    아래 값들은 Firebase 콘솔에서 발급 받은 실제 설정값으로 교체해야 합니다.
//    (현재 값들은 사용자가 이전에 입력한 예시 값을 그대로 사용합니다.)
const firebaseConfig = {
  apiKey: "AIzaSyB1yEo80AY3pynC0OHXyPjwhKCHq5oKid8",
  authDomain: "btd-alarm2-b92b2.firebaseapp.com",
  projectId: "btd-alarm2-b92b2",
  storageBucket: "btd-alarm2-b92b2.appspot.com",
  messagingSenderId: "623911879497",
  appId: "1:623911879497:web:46f6e386ddfc300d819098",
};

firebase.initializeApp(firebaseConfig);

// 3. Messaging 인스턴스 생성
const messaging = firebase.messaging();

// 4. 백그라운드 메시지 처리
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);

  const notificationTitle = payload.notification?.title || 'BTD 알림';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/favicon.ico',
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

