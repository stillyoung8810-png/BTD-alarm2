/**
 * 토스 앱 브릿지 초기화 및 유틸리티
 * 토스 앱 내에서만 동작하는 기능들을 제공합니다.
 */

// 토스 앱 환경인지 확인
export const isTossApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // 토스 앱 내부에서는 특정 객체나 속성이 존재합니다
  return !!(
    (window as any).TossApp ||
    (window as any).__TOSS_APP__ ||
    navigator.userAgent.includes('TossApp')
  );
};

// 토스 앱 브릿지 초기화 (조건부)
export const initializeTossApp = async () => {
  if (!isTossApp()) {
    console.log('[TossApp] 토스 앱 환경이 아닙니다. 일반 웹 환경으로 동작합니다.');
    return null;
  }

  try {
    // @apps-in-toss/web-framework가 설치되면 사용
    // 동적 import로 처리하여 토스 앱이 아닐 때 에러 방지
    const { AppBridge } = await import('@apps-in-toss/web-framework');
    
    const bridge = new AppBridge({
      // 설정은 granite.config.ts에서 관리됩니다
    });

    console.log('[TossApp] 토스 앱 브릿지 초기화 완료');
    return bridge;
  } catch (error) {
    console.warn('[TossApp] 토스 앱 브릿지 초기화 실패:', error);
    return null;
  }
};

// 토스 앱 사용자 정보 가져오기 (토스 앱 내에서만 동작)
export const getTossUser = async () => {
  if (!isTossApp()) return null;

  try {
    // 토스 앱 브릿지를 통해 사용자 정보 가져오기
    // 실제 구현은 @apps-in-toss/web-framework 문서 참조
    return null;
  } catch (error) {
    console.warn('[TossApp] 사용자 정보 가져오기 실패:', error);
    return null;
  }
};
