
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 환경 변수 확인 로그
console.log('환경 변수 확인:', {
  VITE_SUPABASE_URL: supabaseUrl ? '존재함' : '없음',
  VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? '존재함' : '없음',
  VITE_SUPABASE_URL_값: supabaseUrl || '(비어있음)',
});

// VITE_SUPABASE_URL이 없으면 createClient 실행하지 않음
if (!supabaseUrl) {
  const errorMsg = 'VITE_SUPABASE_URL이 .env 파일에 설정되지 않았습니다. Supabase 클라이언트를 생성할 수 없습니다.';
  console.error(errorMsg);
  alert(errorMsg);
  throw new Error(errorMsg);
}

if (!supabaseAnonKey) {
  console.error('VITE_SUPABASE_ANON_KEY가 .env 파일에 설정되지 않았습니다.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true
    }
  }
);
