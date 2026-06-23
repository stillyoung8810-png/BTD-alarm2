/// <reference types="vite/client" />

import type {
  BooleanEnvFlag,
  NumericEnvString,
} from './types/viteEnvContract';

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_SITE_URL?: string;

    readonly VITE_GEMINI_API_KEY_FREE?: string;
    readonly VITE_GEMINI_API_KEY_PAID?: string;
    readonly VITE_GEMINI_API_KEY?: string;
    readonly VITE_GEMINI_EDGE_URL?: string;

    readonly VITE_FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
    readonly VITE_FIREBASE_PROJECT_ID?: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
    readonly VITE_FIREBASE_APP_ID?: string;
    readonly VITE_FIREBASE_VAPID_KEY?: string;

    readonly VITE_TELEGRAM_BOT_USERNAME?: string;
    readonly VITE_WORKER_BFF_URL?: string;
    readonly VITE_RAILWAY_BFF_URL?: string;
    readonly VITE_BENEFIT_TAB_ENABLED?: BooleanEnvFlag;
    readonly VITE_TOSS_PROMOTION_APPROVED?: BooleanEnvFlag;
    readonly VITE_BENEFIT_API_READY?: BooleanEnvFlag;
    readonly VITE_BENEFIT_PREVIEW_ENABLED?: BooleanEnvFlag;

    readonly VITE_PLAN_AMOUNT_PRO?: NumericEnvString;
    readonly VITE_PLAN_AMOUNT_PREMIUM?: NumericEnvString;

    readonly VITE_BACKTEST_MULTI_URL?: string;
    readonly VITE_BACKTEST_NO_STOP_MULTI_URL?: string;

    readonly VITE_TOSS_NOTIFICATION_AGREEMENT_TEMPLATE_CODE?: string;
    readonly VITE_TOSS_INTERSTITIAL_USE_TEST?: BooleanEnvFlag;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
