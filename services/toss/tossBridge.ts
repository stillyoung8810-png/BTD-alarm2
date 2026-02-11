/**
 * 토스 앱 공용 브릿지 진입점.
 * isTossApp, loadWebFramework는 기존 tossAppBridge에서 re-export하여
 * 단일 소스 유지 및 기존 import 호환을 보장합니다.
 */

export {
  isTossApp,
  loadWebFramework,
  type SafeAreaInsetsValue,
  type AccessoryButtonOption,
} from '../tossAppBridge';
