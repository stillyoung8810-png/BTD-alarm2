/**
 * 토스 TDS 스타일 헬퍼 함수
 * 토스 앱 환경에서만 TDS 스타일을 적용하기 위한 유틸리티
 */

import { getTypographyStyle, TypographyToken, FontWeight } from './tossTypography';
import { colors, tossColors } from './tossColors';
import type { CSSProperties } from 'react';

/**
 * 토스 앱 환경에서만 Typography 스타일을 적용
 * 일반 웹 환경에서는 null을 반환하여 기존 Tailwind 스타일 유지
 */
export const getConditionalTypographyStyle = (
  isTossApp: boolean,
  token: TypographyToken,
  weight: FontWeight = 'Regular'
): CSSProperties | null => {
  if (!isTossApp) {
    return null; // 일반 웹 환경에서는 기존 Tailwind 스타일 사용
  }
  
  return getTypographyStyle(token, weight);
};

/**
 * 토스 앱 환경에서만 색상을 적용
 * 일반 웹 환경에서는 null을 반환하여 기존 Tailwind 색상 유지
 */
export const getConditionalColor = (
  isTossApp: boolean,
  colorKey: keyof typeof tossColors
): string | null => {
  if (!isTossApp) {
    return null; // 일반 웹 환경에서는 기존 Tailwind 색상 사용
  }
  
  return tossColors[colorKey];
};

/**
 * 토스 앱 환경에서만 직접 색상 값을 적용
 * 일반 웹 환경에서는 null을 반환
 */
export const getConditionalTossColor = (
  isTossApp: boolean,
  colorName: keyof typeof colors
): string | null => {
  if (!isTossApp) {
    return null;
  }
  
  return colors[colorName];
};

/**
 * 인라인 스타일 객체에 조건부로 TDS 스타일 병합
 */
export const mergeTossStyles = (
  isTossApp: boolean,
  baseStyle: CSSProperties | undefined,
  tossStyle: CSSProperties | null
): CSSProperties | undefined => {
  if (!isTossApp || !tossStyle) {
    return baseStyle; // 일반 웹 환경이거나 TDS 스타일이 없으면 기존 스타일 유지
  }
  
  return {
    ...baseStyle,
    ...tossStyle,
  };
};
