import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// [진단 로그] 배포된 사이트 콘솔에서 이 값을 확인하세요.
console.log('--- Supabase 설정 체크 ---');
console.log('URL 존재여부:', !!supabaseUrl);
console.log('Key 존재여부:', !!supabaseAnonKey);
if (supabaseUrl) console.log('URL 시작부분:', supabaseUrl.substring(0, 10));

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = '환경 변수가 없습니다! Cloudflare 설정을 확인하고 다시 배포하세요.';
  console.error(errorMsg);
  // 실행을 강제로 중단시켜 어디가 문제인지 알림
  throw new Error(errorMsg);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true }
});
