/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SITE_URL?: string
  /** AI 매매 인식: 무료 티어용 Gemini API 키 (구글 AI 스튜디오 등에서 발급) */
  readonly VITE_GEMINI_API_KEY_FREE?: string
  /** AI 매매 인식: 유료 회원용 Gemini API 키 */
  readonly VITE_GEMINI_API_KEY_PAID?: string
  /** AI 공통 키 (무료/유료 미구분 시 둘 다 이 키 사용) */
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
