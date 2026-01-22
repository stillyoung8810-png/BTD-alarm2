/**
 * 토스 TDS 색상 시스템 유틸리티
 * @toss/tds-colors 패키지를 사용하여 일관된 색상을 제공합니다.
 * 
 * 사용 예시:
 * 
 * 1. 직접 colors 객체 사용:
 *    import { colors } from './utils/tossColors';
 *    <div style={{ backgroundColor: colors.blue500 }} />
 * 
 * 2. 편의 함수 사용:
 *    import { tossColors } from './utils/tossColors';
 *    <div style={{ backgroundColor: tossColors.primary }} />
 * 
 * 3. 인라인 스타일:
 *    import { getTossColor } from './utils/tossColors';
 *    <div style={{ backgroundColor: getTossColor('blue500') }} />
 * 
 * 4. Tailwind CSS와 함께 사용:
 *    현재 프로젝트는 Tailwind CSS를 사용하므로, 인라인 스타일이 필요한 경우에만 사용하세요.
 */

import { colors } from '@toss/tds-colors';

// 토스 색상 시스템을 직접 export
export { colors };

// 자주 사용되는 색상에 대한 편의 함수
export const tossColors = {
  // Primary (Blue)
  primary: colors.blue500, // #3182F6
  primaryLight: colors.blue400,
  primaryDark: colors.blue600,
  
  // Background
  background: colors.background, // #FFFFFF
  greyBackground: colors.greyBackground,
  layeredBackground: colors.layeredBackground,
  floatedBackground: colors.floatedBackground,
  
  // Text colors
  textPrimary: colors.grey900, // #191f28
  textSecondary: colors.grey700, // #4e5968
  textTertiary: colors.grey500, // #8b95a1
  
  // Status colors
  success: colors.green500, // #03b26c
  error: colors.red500, // #f04452
  warning: colors.orange500, // #fe9800
  info: colors.blue500, // #3182F6
  
  // Border colors
  border: colors.grey200, // #e5e8eb
  borderDark: colors.grey300, // #d1d6db
};

// Tailwind CSS와 함께 사용하기 위한 헬퍼 함수
// 인라인 스타일에서 사용할 때
export const getTossColor = (colorName: keyof typeof colors): string => {
  return colors[colorName];
};

// React 컴포넌트에서 사용하기 위한 스타일 객체 생성
export const createTossStyle = (colorName: keyof typeof colors) => ({
  backgroundColor: colors[colorName],
});
