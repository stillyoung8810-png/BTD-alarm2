import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // URL에서 세션 토큰 자동 감지 (OAuth 콜백 등)
    flowType: 'pkce', // PKCE 플로우 사용 (보안 강화)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'sb-auth-token', // 일관된 스토리지 키 사용
  },
  global: {
    headers: {
      'X-Client-Info': 'btd-alarm-web',
    },
  },
});

/**
 * 세션 유효성을 확인하고 필요시 갱신하는 헬퍼 함수
 * API 호출 전에 사용하면 Invalid Refresh Token 에러를 사전에 방지할 수 있음
 */
export const ensureValidSession = async (): Promise<boolean> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[Supabase] Session validation error:', error);
      return false;
    }
    
    if (!session) {
      console.log('[Supabase] No active session');
      return false;
    }
    
    // 세션 만료 시간 확인 (5분 이내 만료 예정이면 갱신 시도)
    const expiresAt = session.expires_at;
    if (expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt - now;
      
      if (timeUntilExpiry < 300) { // 5분 이내
        console.log('[Supabase] Session expiring soon, attempting refresh...');
        const { error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.error('[Supabase] Session refresh failed:', refreshError);
          return false;
        }
        
        console.log('[Supabase] Session refreshed successfully');
      }
    }
    
    return true;
  } catch (err) {
    console.error('[Supabase] ensureValidSession error:', err);
    return false;
  }
};

/**
 * 인증 관련 localStorage 키를 정리하는 헬퍼 함수
 * 세션 에러 발생 시 호출하여 깨진 토큰 정리
 */
export const clearAuthStorage = (): void => {
  if (typeof window === 'undefined') return;
  
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('sb-') || 
        key.includes('supabase') ||
        key === 'sb-auth-token'
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('[Supabase] Cleared auth storage keys:', keysToRemove);
  } catch (e) {
    console.warn('[Supabase] Failed to clear auth storage:', e);
  }
};
