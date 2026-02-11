/**
 * 토스 미니앱 전용 로그인 뷰.
 * 기존 이메일/소셜 로그인과 분리하여 단일 책임을 유지합니다.
 */

import React, { useState, useCallback } from 'react';
import { loginWithToss } from '../services/toss/tossAuth';

export interface TossLoginViewProps {
  lang: 'ko' | 'en';
  onSuccess: (user: { id: string; email: string }) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

const TossLoginView: React.FC<TossLoginViewProps> = ({ lang, onSuccess, onError, onClose }) => {
  const [loading, setLoading] = useState(false);

  const handleTossLogin = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const result = await loginWithToss();
      if (result.success && result.user) {
        onSuccess(result.user);
        onClose();
        return;
      }
      onError(result.error ?? (lang === 'ko' ? '토스 로그인에 실패했습니다.' : 'Toss login failed.'));
    } catch (err) {
      const message = err instanceof Error ? err.message : (lang === 'ko' ? '로그인 중 오류가 발생했습니다.' : 'An error occurred during login.');
      onError(message);
    } finally {
      setLoading(false);
    }
  }, [lang, onSuccess, onError, onClose]);

  const label = lang === 'ko' ? 'Toss로 계속하기' : 'Continue with Toss';
  const loadingLabel = lang === 'ko' ? '처리 중...' : 'Loading...';

  return (
    <div className="space-y-6">
      <p className="text-sm font-bold text-slate-600 dark:text-slate-400 text-center">
        {lang === 'ko' ? '토스 앱에서만 사용 가능한 로그인입니다.' : 'This login is only available in the Toss app.'}
      </p>
      <button
        type="button"
        onClick={handleTossLogin}
        disabled={loading}
        className="w-full py-5 bg-[#3182F6] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
      >
        {loading ? loadingLabel : label}
      </button>
    </div>
  );
};

export default TossLoginView;
