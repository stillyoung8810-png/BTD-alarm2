import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'btd-alarm-2',
  brand: {
    displayName: '바이더딥 알람',
    primaryColor: '#3182F6', // 토스 blue500 색상
    // 로컬 개발: 로컬 경로 사용. 출시 시 콘솔에서 업로드한 이미지 URL로 교체 필요
    // 예: 'https://static.toss.im/appsintoss/xxxx/btdlogo.png'
    icon: './public/logo/btdlogo.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  // 비게임 미니앱 내비게이션바 설정
  // SDK가 상단 내비게이션바를 자동 제공 (앱 로고+이름, 더보기, X 버튼)
  // 더보기 버튼으로 공유하기/신고하기 기능도 자동 포함
  webViewProps: {
    type: 'partner',
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
  },
  permissions: [],
  outdir: 'dist',
});
