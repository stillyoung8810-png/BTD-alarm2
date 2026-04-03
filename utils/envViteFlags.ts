/**
 * Vite boolean-like env 문자열 전용 파서.
 * 선언 타입은 컴파일 타임 보조일 뿐이므로, 런타임에는 unknown을 받아
 * true 계열만 허용하고 나머지는 모두 false로 수렴합니다.
 */
export function parseViteBooleanEnvFlag(raw: unknown): boolean {
  return raw === 'true' || raw === '1';
}
