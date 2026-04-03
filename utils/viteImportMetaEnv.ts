/**
 * Node/CJS 테스트 런타임 등에서 `import.meta` 자체가 없을 때의 ReferenceError를 막습니다.
 * Phase A: `import.meta?.env` 는 금지 — 메타 속성에 `?.` 를 붙이면 TS 파싱 오류(TS1303 등)가 날 수 있음.
 * 상위 메타는 `typeof import.meta !== 'undefined'` 로만 가드하고, env 키는 반환 객체에 대해 `?.` 를 사용합니다.
 */
export function getViteImportMetaEnv(): ImportMetaEnv | undefined {
  if (typeof import.meta === 'undefined') {
    return undefined;
  }

  const env = import.meta.env;
  if (env == null || typeof env !== 'object') {
    return undefined;
  }

  return env;
}
