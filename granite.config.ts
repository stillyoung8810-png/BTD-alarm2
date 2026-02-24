import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'btdalarm',
  brand: {
    displayName: '바이더딥알람', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: 'https://static.toss.im/appsintoss/20887/6e38d6ef-8ee2-46ad-b86b-1679b739ba67.png', // 화면에 노출될 앱의 아이콘 이미지 주소로 바꿔주세요.
  },
  web: {
    // 실기기 테스트 시: PC IP로 변경 (ipconfig에서 IPv4 주소 확인 192.168.0.24)
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite', // 실기기 접속 시 --host 필수
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
