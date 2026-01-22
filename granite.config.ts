import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'btd-alarm-2',
  brand: {
    displayName: '바이더딥 알람',
    primaryColor: '#3182F6', // 토스 blue500 색상
    icon: null,
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
