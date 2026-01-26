import React from 'react';
import { CUSTOM_GRADIENT_LOGOS } from '../constants';

type StockLogoSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
type StockLogoShape = 'circle' | 'squircle' | 'squircle2';

// 로고 파일은 src/assets/logos/ (소문자 파일명)로 관리
// svg/png/jpg/jpeg 지원
const LOGO_URLS = import.meta.glob(
  [
    '../src/assets/logos/*.svg',
    '../src/assets/logos/*.png',
    '../src/assets/logos/*.jpg',
    '../src/assets/logos/*.jpeg',
  ],
  {
  eager: true,
  as: 'url',
  }
) as Record<string, string>;

export const getLogoUrlForTicker = (ticker: string): string | null => {
  const base = ticker.toLowerCase();
  const exts = ['svg', 'png', 'jpg', 'jpeg'] as const;
  for (const ext of exts) {
    const key = `../src/assets/logos/${base}.${ext}`;
    const url = LOGO_URLS[key];
    if (url) return url;
  }
  return null;
};

const sizeClassMap: Record<Exclude<StockLogoSize, 'full'>, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-16 h-16',
};

const imagePadMap: Record<StockLogoSize, string> = {
  sm: 'p-0.5',
  md: 'p-0.5',
  lg: 'p-0.5',
  xl: 'p-0.5',
  full: 'p-0.5',
};

const shapeClassMap: Record<StockLogoShape, string> = {
  circle: 'rounded-full',
  squircle: 'rounded-xl',
  squircle2: 'rounded-2xl',
};

export default function StockLogo({
  ticker,
  size = 'md',
  shape = 'circle',
  className = '',
  paidAccent = false,
  dimmed = false,
  showFallbackText = true,
}: {
  ticker: string;
  size?: StockLogoSize;
  shape?: StockLogoShape;
  className?: string;
  /** 유료 종목(예: MSTX) 등에 은은한 골드 테두리/드롭섀도 */
  paidAccent?: boolean;
  /** 잠금/비활성 등 회색 처리 */
  dimmed?: boolean;
  /** 로고가 없을 때(그라데이션) 내부에 ticker 텍스트를 표시할지 */
  showFallbackText?: boolean;
}) {
  const logoUrl = getLogoUrlForTicker(ticker);
  const gradientInfo = CUSTOM_GRADIENT_LOGOS[ticker] || {
    gradient: 'linear-gradient(135deg, #2563eb, #1e40af)',
    // 신규 종목(=CUSTOM_GRADIENT_LOGOS에 없을 때)은 label을 ticker로 자동 설정
    label: ticker,
  };

  const sizeClass = size === 'full' ? '' : sizeClassMap[size];
  const shapeClass = shapeClassMap[shape];

  const paidAccentClass = paidAccent
    ? 'ring-1 ring-amber-300/30 shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_0_18px_rgba(245,158,11,0.20)]'
    : '';

  const dimClass = dimmed ? 'opacity-60 grayscale' : '';

  return (
    <div
      className={`relative overflow-hidden ${sizeClass} ${shapeClass} ${paidAccentClass} ${dimClass} ${className}`}
      style={{ background: gradientInfo.gradient }}
      aria-label={`${ticker} logo`}
    >
      {/* 이미지 로고가 있으면: 원형(padding)으로 넣어서 기존 원형 아이콘과 크기 이질감 최소화 */}
      {logoUrl ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-full h-full ${imagePadMap[size]} rounded-full`}
          >
            <img
              src={logoUrl}
              alt={`${ticker} logo`}
              className="w-full h-full object-contain scale-125 origin-center"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 bg-black/5" />
          {showFallbackText ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-[10px] font-black leading-none z-10">{ticker}</span>
              <span className="text-[5px] font-bold opacity-80 mt-0.5 uppercase text-center px-0.5 z-10">
                {gradientInfo.label.split(' ')[0]}
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

