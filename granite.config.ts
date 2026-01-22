import { defineConfig } from '@apps-in-toss/web-framework/config';
import { colors } from '@toss/tds-colors';

export default defineConfig({
  appName: 'btd-alarm-2',
  brand: {
    displayName: '바이더딥 알람',
    primaryColor: colors.blue500, // 토스 색상 시스템 사용: #3182F6
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
});
