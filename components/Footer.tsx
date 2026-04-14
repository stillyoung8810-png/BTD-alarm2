import React from 'react';
import type { AppLang } from '../types';
import { useTossApp } from '../contexts/TossAppContext';
import { openExternalUrl } from '../services/tossAppBridge';
import { TDSButton } from './tds';
import { LegalDisclaimer } from './common/LegalDisclaimer';

// ---------------------------------------------------------------------------
// 법인 필수 정보
// ---------------------------------------------------------------------------
const COMPANY_INFO = {
  name: '유한회사 두리여유',
  ceo: '여태영',
  bizNo: '344-87-02345',
  address: '경기도 안산시 단원구 고잔로 55, 비102호(고잔동, 중앙오피스텔)',
  email: 'grrrvv@naver.com',
} as const;

const TOSS_CS_URL = 'https://service.toss.im/apps/support';

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
interface FooterProps {
  lang: AppLang;
  showLegalDisclaimer?: boolean;
  /** 토스 앱 내부 접속 여부 (Context에서도 감지하지만 외부 override 가능) */
  isInTossApp?: boolean;
  /** 이용약관 탭으로 이동 */
  onNavigateTerms?: () => void;
  /** 개인정보처리방침 탭으로 이동 */
  onNavigatePrivacy?: () => void;
  /** 환불 및 취소 규정 탭으로 이동 */
  onNavigateRefundPolicy?: () => void;
}

const Footer: React.FC<FooterProps> = ({
  lang,
  showLegalDisclaimer = false,
  isInTossApp: isInTossAppProp,
  onNavigateTerms,
  onNavigatePrivacy,
  onNavigateRefundPolicy,
}) => {
  const { isInTossApp: isInTossAppCtx, safeAreaInsets } = useTossApp();

  const isTossAgent =
    isInTossAppProp ||
    isInTossAppCtx ||
    (typeof navigator !== 'undefined' && /TossApp|TossIt/i.test(navigator.userAgent));

  // 토스 앱 내 Safe Area bottom 여백 (홈 인디케이터 영역)
  const safeBottom = isTossAgent ? safeAreaInsets.bottom : 0;

  return (
    <footer
      className="w-full bg-slate-100 dark:bg-slate-900/80 border-t border-slate-200 dark:border-white/5 mt-auto"
      style={safeBottom > 0 ? { paddingBottom: `${safeBottom}px` } : undefined}
    >
      <div className="px-5 py-6 space-y-4">
        {showLegalDisclaimer ? (
          <LegalDisclaimer
            lang={lang}
            variant="minimal"
            layoutClassName="mt-2 text-center"
          />
        ) : null}

        {/* 이용약관 / 개인정보처리방침 / 환불규정 — 웹·토스 동일하게 글자만(링크 스타일), 버튼 느낌 없음 */}
        <div className="flex items-center gap-3 text-[12px] font-medium flex-wrap">
          <button
            type="button"
            onClick={() => { onNavigateTerms?.(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors underline underline-offset-2"
          >
            이용약관
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            type="button"
            onClick={() => { onNavigatePrivacy?.(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors underline underline-offset-2"
          >
            개인정보처리방침
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            type="button"
            onClick={() => { onNavigateRefundPolicy?.(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors underline underline-offset-2"
          >
            환불규정
          </button>
        </div>

        {/* 법인 정보 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-relaxed text-[#8b95a1] dark:text-slate-500">
          <span>{COMPANY_INFO.name}</span>
          <span>대표 {COMPANY_INFO.ceo}</span>
          <span>사업자등록번호 {COMPANY_INFO.bizNo}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-[#8b95a1] dark:text-slate-500">
          {COMPANY_INFO.address}
        </p>
        <p className="text-[12px] leading-relaxed text-[#8b95a1] dark:text-slate-500">
          이메일{' '}
          <a
            href={`mailto:${COMPANY_INFO.email}`}
            className="underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {COMPANY_INFO.email}
          </a>
        </p>

        {/* Copyright */}
        <p className="text-[11px] text-[#8b95a1]/70 dark:text-slate-600 pt-2">
          Copyright &copy; {COMPANY_INFO.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
