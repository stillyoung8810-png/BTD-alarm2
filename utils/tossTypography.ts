/**
 * 토스 TDS Typography 시스템 유틸리티
 * 
 * Typography 토큰 시스템을 제공하여 일관된 텍스트 스타일을 사용할 수 있도록 합니다.
 * 더 큰 텍스트 모드(접근성)를 지원하며, iOS와 Android의 차이를 고려합니다.
 * 
 * 사용 예시:
 * 
 * 1. 기본 사용 (인라인 스타일):
 *    import { getTypographyStyle } from './utils/tossTypography';
 *    <p style={getTypographyStyle('Typography5', 'Regular')}>일반 본문</p>
 * 
 * 2. 편의 함수 사용:
 *    import { typographyPresets } from './utils/tossTypography';
 *    <p style={typographyPresets.body()}>일반 본문</p>
 *    <h1 style={typographyPresets.h1()}>큰 제목</h1>
 * 
 * 3. Tailwind CSS와 함께 사용:
 *    현재 프로젝트는 Tailwind를 사용하므로, 인라인 스타일이 필요한 경우에만 사용하세요.
 */

import type { CSSProperties } from 'react';

// Typography 토큰 정의 (기본 100% 크기)
export const typographyTokens = {
  Typography1: { fontSize: 30, lineHeight: 40, usage: '매우 큰 제목' },
  subTypography1: { fontSize: 29, lineHeight: 38 },
  subTypography2: { fontSize: 28, lineHeight: 37 },
  subTypography3: { fontSize: 27, lineHeight: 36 },
  Typography2: { fontSize: 26, lineHeight: 35, usage: '큰 제목' },
  subTypography4: { fontSize: 25, lineHeight: 34 },
  subTypography5: { fontSize: 24, lineHeight: 33, usage: '조금 큰 제목' },
  subTypography6: { fontSize: 23, lineHeight: 32 },
  Typography3: { fontSize: 22, lineHeight: 31, usage: '일반 제목' },
  subTypography7: { fontSize: 21, lineHeight: 30 },
  Typography4: { fontSize: 20, lineHeight: 29, usage: '작은 제목' },
  subTypography8: { fontSize: 19, lineHeight: 28 },
  subTypography9: { fontSize: 18, lineHeight: 27, usage: '조금 큰 본문' },
  Typography5: { fontSize: 17, lineHeight: 25.5, usage: '일반 본문' },
  subTypography10: { fontSize: 16, lineHeight: 24 },
  Typography6: { fontSize: 15, lineHeight: 22.5, usage: '작은 본문' },
  subTypography11: { fontSize: 14, lineHeight: 21 },
  Typography7: { fontSize: 13, lineHeight: 19.5, usage: '안 읽어도 됨' },
  subTypography12: { fontSize: 12, lineHeight: 18 },
  subTypography13: { fontSize: 11, lineHeight: 16.5, usage: '아예 안읽어도 됨' },
} as const;

// 폰트 웨이트 타입
export type FontWeight = 'Light' | 'Regular' | 'Medium' | 'Semibold' | 'Bold';

// Typography 토큰 타입
export type TypographyToken = keyof typeof typographyTokens;

// iOS 더 큰 텍스트 비율 (접근성)
export const iosTextScaleRatios = {
  '100%': 1.0,      // Large (기본)
  '110%': 1.1,      // xLarge
  '120%': 1.2,      // xxLarge
  '135%': 1.35,     // xxxLarge
  '160%': 1.6,      // A11y_Medium
  '190%': 1.9,      // A11y_Large
  '235%': 2.35,     // A11y_xLarge
  '275%': 2.75,     // A11y_xxLarge
  '310%': 3.1,      // A11y_xxxLarge
} as const;

// iOS 비율별 최대 폰트 크기 (가이드라인 기준)
const iosMaxFontSizes: Record<TypographyToken, number> = {
  Typography1: 42,
  subTypography1: 42,
  subTypography2: 41,
  subTypography3: 41,
  Typography2: 41,
  subTypography4: 41,
  subTypography5: 40,
  subTypography6: 40,
  Typography3: 40,
  subTypography7: 40,
  Typography4: 40,
  subTypography8: 40,
  subTypography9: 39,
  Typography5: 39,
  subTypography10: 39,
  Typography6: 37,
  subTypography11: 36,
  Typography7: 34,
  subTypography12: 32,
  subTypography13: 31,
};

/**
 * iOS 환경에서 더 큰 텍스트 모드에 따른 폰트 크기 계산
 */
export const calculateIOSFontSize = (
  token: TypographyToken,
  scaleRatio: keyof typeof iosTextScaleRatios = '100%'
): number => {
  const baseSize = typographyTokens[token].fontSize;
  const ratio = iosTextScaleRatios[scaleRatio];
  const calculatedSize = baseSize * ratio;
  const maxSize = iosMaxFontSizes[token];
  
  // 최대 크기를 초과하지 않도록 제한
  return Math.min(calculatedSize, maxSize);
};

/**
 * Android 환경에서 더 큰 텍스트 모드에 따른 폰트 크기 계산
 * Android는 100% 이상의 모든 값을 지원 (공식: fontSize * NN * 0.01)
 */
export const calculateAndroidFontSize = (
  token: TypographyToken,
  scalePercentage: number = 100
): number => {
  const baseSize = typographyTokens[token].fontSize;
  const calculatedSize = baseSize * scalePercentage * 0.01;
  const maxSize = iosMaxFontSizes[token]; // Android도 동일한 최대값 사용
  
  return Math.min(calculatedSize, maxSize);
};

/**
 * 라인 높이 계산 (폰트 크기에 비례)
 */
export const calculateLineHeight = (
  fontSize: number,
  baseLineHeight: number,
  baseFontSize: number
): number => {
  const ratio = baseLineHeight / baseFontSize;
  return fontSize * ratio;
};

/**
 * Typography 스타일 객체 생성
 * @param token Typography 토큰
 * @param weight 폰트 웨이트
 * @param scaleRatio iOS의 경우 비율, Android의 경우 퍼센트 (기본 100%)
 * @param platform 'ios' | 'android' | 'web' (기본 'web')
 */
export const getTypographyStyle = (
  token: TypographyToken,
  weight: FontWeight = 'Regular',
  scaleRatio: number | keyof typeof iosTextScaleRatios = '100%',
  platform: 'ios' | 'android' | 'web' = 'web'
): CSSProperties => {
  const baseToken = typographyTokens[token];
  
  let fontSize: number;
  if (platform === 'ios') {
    fontSize = calculateIOSFontSize(token, scaleRatio as keyof typeof iosTextScaleRatios);
  } else if (platform === 'android') {
    fontSize = calculateAndroidFontSize(token, scaleRatio as number);
  } else {
    // 웹 환경: 기본 크기 사용 (더 큰 텍스트는 CSS나 브라우저 설정으로 처리)
    fontSize = baseToken.fontSize;
  }
  
  const lineHeight = calculateLineHeight(
    fontSize,
    baseToken.lineHeight,
    baseToken.fontSize
  );
  
  // 폰트 웨이트 매핑
  const fontWeightMap: Record<FontWeight, number | string> = {
    Light: 300,
    Regular: 400,
    Medium: 500,
    Semibold: 600,
    Bold: 700,
  };
  
  return {
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`,
    fontWeight: fontWeightMap[weight],
    fontFamily: "'Pretendard', 'Inter', sans-serif", // 프로젝트에서 사용 중인 폰트
  };
};

/**
 * Typography 토큰 이름 생성 (예: "Typography5_Regular")
 */
export const getTypographyTokenName = (
  token: TypographyToken,
  weight: FontWeight = 'Regular'
): string => {
  return `${token}_${weight}`;
};

/**
 * 모든 Typography 토큰 이름 목록 생성
 */
export const getAllTypographyTokenNames = (): string[] => {
  const weights: FontWeight[] = ['Light', 'Regular', 'Medium', 'Semibold', 'Bold'];
  const tokens = Object.keys(typographyTokens) as TypographyToken[];
  
  return tokens.flatMap(token =>
    weights.map(weight => getTypographyTokenName(token, weight))
  );
};

/**
 * 편의 함수: 자주 사용되는 Typography 조합
 */
export const typographyPresets = {
  // 제목
  h1: (weight: FontWeight = 'Bold') => getTypographyStyle('Typography1', weight),
  h2: (weight: FontWeight = 'Bold') => getTypographyStyle('Typography2', weight),
  h3: (weight: FontWeight = 'Semibold') => getTypographyStyle('Typography3', weight),
  h4: (weight: FontWeight = 'Semibold') => getTypographyStyle('Typography4', weight),
  
  // 본문
  body: (weight: FontWeight = 'Regular') => getTypographyStyle('Typography5', weight),
  bodyLarge: (weight: FontWeight = 'Regular') => getTypographyStyle('subTypography9', weight),
  bodySmall: (weight: FontWeight = 'Regular') => getTypographyStyle('Typography6', weight),
  
  // 작은 텍스트
  caption: (weight: FontWeight = 'Regular') => getTypographyStyle('Typography7', weight),
  tiny: (weight: FontWeight = 'Regular') => getTypographyStyle('subTypography12', weight),
} as const;
