# Supabase Auth · 토스 인앱 브라우저(WebView) 인증 수정 계획서

> **목적**: 토스 미니앱 심사 환경에서 최초 로그인 실패 등을 유발한 3가지 문제를 해결하기 위한 아키텍처·구현 가이드입니다.  
> **사용 방법**: 보급형 AI(빌더)에게 **Step 1 ~ Step 3** 프롬프트를 순서대로 전달하거나, 본 문서의 핵심 코드를 참고해 직접 적용합니다.  
> **배포**: 수정 후 **반드시 AIT를 다시 빌드**하세요. `redirectTo` 등은 번들에 반영됩니다.

---

## 배경 요약

| # | 문제 | 원인 요약 |
|---|------|-----------|
| 1 | Redirect URL이 토스 도메인이 아닌 `pages.dev` 등으로 나감 | `buildRedirectUrl`이 `VITE_SITE_URL`을 `window.location.origin`보다 우선함 |
| 2 | 신규 유저만 로그인 완료 상태로 안 넘어감 | `useAuth`의 `onAuthStateChange`에서 `INITIAL_SESSION`을 무시함 |
| 3 | WebView에서 조용히 실패 | Supabase 클라이언트가 `localStorage` + PKCE에만 의존 |

**관련 파일**

- [utils/authHelpers.ts](../utils/authHelpers.ts) — `buildRedirectUrl`
- [services/supabase.ts](../services/supabase.ts) — `createClient`, `clearAuthStorage`
- [hooks/useAuth.ts](../hooks/useAuth.ts) — `checkUser`, `onAuthStateChange`

---

## 1. 핵심 해결 로직 (TypeScript 스니펫)

### 1-1. Redirect URL: 현재 실행 origin 최우선

**수정 파일**: `utils/authHelpers.ts`

**원칙**

- 브라우저에서는 `window.location.origin`을 최우선 사용합니다.
- `VITE_SITE_URL`은 **fallback**으로만 사용합니다.
- `null`, 빈 문자열, `http`/`https`가 아닌 값은 무효 처리합니다.

```ts
const HTTP_PROTOCOL_RE = /^https?:\/\//i;

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function getRuntimeOrigin(): string {
  if (typeof window !== 'undefined') {
    const runtimeOrigin = window.location.origin?.trim();
    if (
      runtimeOrigin &&
      runtimeOrigin !== 'null' &&
      HTTP_PROTOCOL_RE.test(runtimeOrigin)
    ) {
      return normalizeBaseUrl(runtimeOrigin);
    }
  }

  const envOrigin = import.meta.env.VITE_SITE_URL?.trim();
  if (envOrigin && HTTP_PROTOCOL_RE.test(envOrigin)) {
    return normalizeBaseUrl(envOrigin);
  }

  throw new Error('Auth redirect base URL could not be resolved.');
}

export function buildRedirectUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getRuntimeOrigin()}/`).toString();
}
```

---

### 1-2. Custom Storage Adapter (localStorage 실패 시 fallback)

**신규 파일**: `utils/supabaseAuthStorage.ts`  
**수정 파일**: `services/supabase.ts`

**원칙**

- 우선순위: `localStorage` → `sessionStorage` → `cookie`(best effort) → `memory`
- PKCE는 리디렉션 왕복이 있으므로 **memory만으로는 불충분**합니다. `sessionStorage`가 핵심 fallback입니다.
- Cookie는 크기 제한이 있어 보조용입니다.

`utils/supabaseAuthStorage.ts` 전체 구현은 아래 **Step 2 프롬프트** 블록을 참고하거나, 동일 로직을 파일로 추가합니다.

**`services/supabase.ts` 주입 예시**

```ts
import { createClient } from '@supabase/supabase-js';
import {
  createSupabaseAuthStorage,
  clearSupabaseAuthStorage,
} from '../utils/supabaseAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const authStorage = createSupabaseAuthStorage();

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: authStorage,
    storageKey: 'sb-auth-token',
  },
  global: {
    headers: {
      'X-Client-Info': 'btd-alarm-web',
    },
  },
});

export const clearAuthStorage = (): void => {
  clearSupabaseAuthStorage();
};
```

기존 `clearAuthStorage` 내부의 `localStorage` 순회 제거는 `clearSupabaseAuthStorage()`에 위임합니다.

---

### 1-3. `INITIAL_SESSION` 처리 및 세션 dedupe

**수정 파일**: `hooks/useAuth.ts`

**원칙**

- `INITIAL_SESSION`에서 즉시 `return`하지 않고, 세션을 앱 상태에 반영합니다.
- `checkUser()`와 `INITIAL_SESSION`이 같은 세션을 두 번 처리하지 않도록 **fingerprint dedupe**를 둡니다.
- `clearAuthState`, `isSessionRecoverableError`, `justLoggedInRef` 등 기존 복구·수동 로그인 흐름은 유지합니다.

**타입·헬퍼**

```ts
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

function getSessionFingerprint(session: Session | null): string | null {
  if (!session?.user) return null;
  return session.access_token
    ? `${session.user.id}:${session.access_token}`
    : session.user.id;
}
```

훅 내부:

```ts
const lastHandledSessionFingerprintRef = useRef<string | null>(null);
```

`applySession`, `checkUser`, `onAuthStateChange` 전체 교체 로직은 **Step 3 프롬프트**에 수록된 블록을 사용합니다. (문서 길이상 여기서는 Step 3과 동일 내용을 빌더에게 그대로 붙여넣기 하시면 됩니다.)

---

## 2. 보급형 AI용 단계별 작업 지시 프롬프트

아래 블록을 채팅에 **그대로 복사**해 순서대로 전달하세요.

### Step 1 — `buildRedirectUrl` / `getRuntimeOrigin`

> 복사용 프롬프트는 **바깥을 4개 백틱**으로 감싸 안쪽 ` ```ts ` 블록과 충돌하지 않게 했습니다.

````text
다음 작업만 정확히 수행하세요. 불필요한 리팩터링은 하지 말고, 지정한 파일만 수정하세요.

목표:
- Supabase Auth redirect URL이 빌드 시점의 VITE_SITE_URL이 아니라, 현재 실행 중인 브라우저의 window.location.origin을 최우선으로 사용하도록 수정하세요.
- Toss 인앱 브라우저/WebView에서도 현재 열려 있는 도메인으로 callback URL이 생성되어야 합니다.

수정 파일:
- utils/authHelpers.ts

수정 지침:
1. 기존 buildRedirectUrl 구현을 교체하세요.
2. 아래의 normalizeBaseUrl, getRuntimeOrigin 헬퍼를 같은 파일에 추가하세요.
3. window.location.origin이 존재하면 그것을 최우선으로 사용하고, VITE_SITE_URL은 fallback으로만 남기세요.
4. 유효하지 않은 origin('null', 빈 문자열, http/https 아님)은 무효 처리하세요.
5. 기존 호출부(components/AuthModals.tsx)는 수정하지 마세요.

삽입할 코드:
```ts
const HTTP_PROTOCOL_RE = /^https?:\/\//i;

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function getRuntimeOrigin(): string {
  if (typeof window !== 'undefined') {
    const runtimeOrigin = window.location.origin?.trim();
    if (
      runtimeOrigin &&
      runtimeOrigin !== 'null' &&
      HTTP_PROTOCOL_RE.test(runtimeOrigin)
    ) {
      return normalizeBaseUrl(runtimeOrigin);
    }
  }

  const envOrigin = import.meta.env.VITE_SITE_URL?.trim();
  if (envOrigin && HTTP_PROTOCOL_RE.test(envOrigin)) {
    return normalizeBaseUrl(envOrigin);
  }

  throw new Error('Auth redirect base URL could not be resolved.');
}

export function buildRedirectUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getRuntimeOrigin()}/`).toString();
}
```

완료 기준:
- buildRedirectUrl('/auth/callback')가 Toss WebView에서는 반드시 현재 실행 origin 기반 URL을 반환해야 합니다.
- VITE_SITE_URL은 런타임 origin이 없을 때만 사용되어야 합니다.
- 다른 파일은 건드리지 마세요.
````

---

### Step 2 — Custom Storage + `services/supabase.ts`

````text
다음 작업만 정확히 수행하세요. 인증 저장소 안정화가 목적이므로, Supabase auth storage 관련 파일만 수정하세요.

목표:
- localStorage가 막히는 Toss WebView에서도 Supabase Auth가 조용히 실패하지 않도록 Custom Storage Adapter를 추가하세요.
- 저장소 우선순위는 localStorage -> sessionStorage -> cookie(best effort) -> memory 로 구성하세요.
- services/supabase.ts에서 이 adapter를 주입하세요.
- clearAuthStorage도 새 adapter 체인에 맞게 정리하도록 수정하세요.

수정 파일:
- 새 파일 생성: utils/supabaseAuthStorage.ts
- 기존 파일 수정: services/supabase.ts

1. 먼저 새 파일 utils/supabaseAuthStorage.ts 를 만들고, 아래 전체 코드를 넣으세요.

(※ 전체 코드는 저장소 내 docs/SUPABASE_AUTH_TOSS_WEBVIEW_FIX.md 의 "부록 A" 또는 이전 아키텍트 답변의 Step 2 블록과 동일합니다. 빌더에게는 한 파일로 긴 스니펫을 붙여넣기 하시면 됩니다.)

2. services/supabase.ts 를 다음 방향으로 수정하세요.
- createSupabaseAuthStorage, clearSupabaseAuthStorage 를 import 하세요.
- auth.storage에 createSupabaseAuthStorage() 결과를 주입하세요.
- 기존 clearAuthStorage 로직은 clearSupabaseAuthStorage() 호출로 교체하세요.
- flowType: 'pkce', detectSessionInUrl: true 는 유지하세요.

교체할 핵심 코드:
```ts
import { createClient } from '@supabase/supabase-js';
import {
  createSupabaseAuthStorage,
  clearSupabaseAuthStorage,
} from '../utils/supabaseAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const authStorage = createSupabaseAuthStorage();

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: authStorage,
    storageKey: 'sb-auth-token',
  },
  global: {
    headers: {
      'X-Client-Info': 'btd-alarm-web',
    },
  },
});

export const clearAuthStorage = (): void => {
  clearSupabaseAuthStorage();
};
```

완료 기준:
- localStorage가 막혀도 sessionStorage/cookie/memory 순으로 fallback 해야 합니다.
- services/supabase.ts 에서 직접 window.localStorage를 넘기지 않아야 합니다.
````

**참고**: `utils/supabaseAuthStorage.ts` 전문은 본 문서 **부록 A**에 두었습니다.

---

### Step 3 — `hooks/useAuth.ts` (`INITIAL_SESSION` + `applySession`)

```text
다음 작업만 정확히 수행하세요. useAuth 훅의 INITIAL_SESSION 누락 버그를 수정하는 것이 목적입니다.

목표:
- onAuthStateChange 에서 INITIAL_SESSION 이벤트를 무시하지 말고, 실제 세션 하이드레이션 대상으로 처리하세요.
- checkUser()와 INITIAL_SESSION이 같은 세션을 두 번 처리할 수 있으므로 fingerprint dedupe를 추가하세요.
- 기존 에러 복구 흐름(clearAuthState, isSessionRecoverableError)은 유지하세요.
- 기존 justLoggedInRef 흐름은 완전히 제거하지 말고, 수동 로그인 중복 fetch 방지 용도로만 최소한 유지하세요.

수정 파일:
- hooks/useAuth.ts

수정 지침:
1. import에 추가: import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
2. getSessionFingerprint 헬퍼 추가 (문서 본문 1-3절 참고).
3. lastHandledSessionFingerprintRef useRef 추가.
4. useEffect 내부 인증 로직을 applySession 기반으로 교체하고, INITIAL_SESSION 분기에서 즉시 return 하던 코드를 제거하세요.

전체 교체 블록은 docs/SUPABASE_AUTH_TOSS_WEBVIEW_FIX.md 의 "부록 B" 또는 아키텍트가 제공한 Step 3 전체 코드를 그대로 사용하세요.

완료 기준:
- 신규 유저가 OAuth callback 또는 최초 세션 복구 직후에도 앱 전역 user state가 정상 반영되어야 합니다.
- 기존 로그인 유저의 세션 복구도 중복 처리 없이 유지되어야 합니다.
```

**참고**: `useAuth`용 전체 `useEffect` 블록은 본 문서 **부록 B**에 두었습니다.

---

## 3. 적용 순서 권장

1. **Step 1** — 잘못된 redirect 도메인 제거  
2. **Step 2** — WebView 저장소 fallback  
3. **Step 3** — `INITIAL_SESSION` 누락 수정  

이후 `npm run build` / `ait build` 등 **프로젝트 표준 빌드**로 AIT를 재생성하세요.

---

## 4. 검증 시나리오 (요약)

- 토스 WebView에서 **시크릿/데이터 삭제 후** 최초 로그인(토스 로그인 + 필요 시 OAuth).  
- `buildRedirectUrl` 결과가 **현재 URL origin**과 일치하는지 콘솔 또는 일시 로그로 확인.  
- `localStorage` 비활성/차단 시뮬레이션(가능한 환경)에서도 세션 유지·재진입.  
- 기존 refresh token 보유 기기에서도 로그아웃·재로그인 정상.

---

## 5. 트러블슈팅 (빌드 후 `Missing Signature…` / 로그인 전면 실패)

화면에 `Missing Signature` / `Missing Signature query parameter or cookie value` 비슷한 문구가 나오면, **PKCE·세션 JSON이 저장소에 일치하지 않을 때** Supabase 쪽 검증이 실패하는 경우가 많습니다.

**원인(Step 2 저장소 체인)**: `getItem`이 **localStorage를 먼저** 읽으면, `setItem`은 **localStorage 쓰기 실패(용량 등)** 후 **sessionStorage에만** 최신 값이 있는데도 **옛날 localStorage 값**을 쓰는 레이스가 날 수 있습니다.

**코드 대응(저장소 모듈에 반영됨)**

- 읽기 순서: **sessionStorage → localStorage → cookie → memory**
- `setItem`이 특정 드라이버에서 실패하면 해당 드라이버에서 **같은 키 `removeItem`** 으로 남은 깨진 값 제거
- 빈 문자열(`''`)은 유효한 세션 값이 아니므로 `getItem`에서 건너뜀

**사용자 측 1회 조치**: 토스 WebView / 사파리에서 **미니앱 사이트 데이터(쿠키·로컬 저장소) 삭제** 후 다시 로그인해 보세요. 이미 꼬인 `sb-*` 키가 있으면 위 오류가 반복될 수 있습니다.

> 부록 A의 긴 스니펫은 초기 버전입니다. **실제 구현은 항상 `utils/supabaseAuthStorage.ts` 파일**을 기준으로 하세요.

---

## 부록 A — `utils/supabaseAuthStorage.ts` 전문

```ts
export interface SupabaseStorageLike {
  getItem(key: string): string | Promise<string | null> | null;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

type StorageDriverName = 'localStorage' | 'sessionStorage' | 'cookie' | 'memory';

interface StorageDriver {
  readonly name: StorageDriverName;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PROBE_KEY = '__btd_auth_storage_probe__';
const COOKIE_MAX_BYTES = 3500;
const memoryStore = new Map<string, string>();

function getWebStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    const storage = window[kind];
    storage.setItem(STORAGE_PROBE_KEY, '1');
    storage.removeItem(STORAGE_PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

function createWebStorageDriver(
  kind: 'localStorage' | 'sessionStorage',
): StorageDriver | null {
  const storage = getWebStorage(kind);
  if (!storage) return null;

  return {
    name: kind,
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      storage.setItem(key, value);
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  };
}

function readCookie(key: string): string | null {
  if (typeof document === 'undefined') return null;

  const encodedKey = encodeURIComponent(key);
  const row = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${encodedKey}=`));

  if (!row) return null;
  return decodeURIComponent(row.slice(encodedKey.length + 1));
}

function createCookieDriver(): StorageDriver | null {
  if (typeof document === 'undefined') return null;

  return {
    name: 'cookie',
    getItem(key) {
      return readCookie(key);
    },
    setItem(key, value) {
      const encodedValue = encodeURIComponent(value);
      if (encodedValue.length > COOKIE_MAX_BYTES) {
        throw new Error('Cookie storage limit exceeded.');
      }

      document.cookie = [
        `${encodeURIComponent(key)}=${encodedValue}`,
        'Path=/',
        'SameSite=Lax',
        'Secure',
      ].join('; ');
    },
    removeItem(key) {
      document.cookie = [
        `${encodeURIComponent(key)}=`,
        'Path=/',
        'Max-Age=0',
        'SameSite=Lax',
        'Secure',
      ].join('; ');
    },
  };
}

function createMemoryDriver(): StorageDriver {
  return {
    name: 'memory',
    getItem(key) {
      return memoryStore.get(key) ?? null;
    },
    setItem(key, value) {
      memoryStore.set(key, value);
    },
    removeItem(key) {
      memoryStore.delete(key);
    },
  };
}

const persistentDrivers: StorageDriver[] = [
  createWebStorageDriver('localStorage'),
  createWebStorageDriver('sessionStorage'),
  createCookieDriver(),
].filter((driver): driver is StorageDriver => driver !== null);

const memoryDriver = createMemoryDriver();

function getAllDrivers(): StorageDriver[] {
  return [...persistentDrivers, memoryDriver];
}

export function createSupabaseAuthStorage(): SupabaseStorageLike {
  return {
    getItem(key) {
      for (const driver of getAllDrivers()) {
        try {
          const value = driver.getItem(key);
          if (value !== null) {
            memoryDriver.setItem(key, value);
            return value;
          }
        } catch {
          // 다음 드라이버로 진행
        }
      }

      return null;
    },

    setItem(key, value) {
      memoryDriver.setItem(key, value);

      for (const driver of persistentDrivers) {
        try {
          driver.setItem(key, value);
        } catch {
          // 일부 저장소가 막혀 있어도 다른 저장소로 계속 진행
        }
      }
    },

    removeItem(key) {
      for (const driver of getAllDrivers()) {
        try {
          driver.removeItem(key);
        } catch {
          // 정리 단계에서는 조용히 무시
        }
      }
    },
  };
}

function clearMatchingKeysFromStorage(storage: Storage): void {
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;

    if (key.startsWith('sb-') || key.includes('supabase')) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // noop
    }
  });
}

function clearMatchingAuthCookies(): void {
  if (typeof document === 'undefined') return;

  const cookieKeys = document.cookie
    .split('; ')
    .map((row) => row.split('=')[0])
    .filter((key) => key.startsWith('sb-') || key.includes('supabase'));

  cookieKeys.forEach((key) => {
    try {
      document.cookie = [
        `${key}=`,
        'Path=/',
        'Max-Age=0',
        'SameSite=Lax',
        'Secure',
      ].join('; ');
    } catch {
      // noop
    }
  });
}

export function clearSupabaseAuthStorage(): void {
  const localStorageRef = getWebStorage('localStorage');
  const sessionStorageRef = getWebStorage('sessionStorage');

  if (localStorageRef) clearMatchingKeysFromStorage(localStorageRef);
  if (sessionStorageRef) clearMatchingKeysFromStorage(sessionStorageRef);

  clearMatchingAuthCookies();
  memoryStore.clear();
}
```

---

## 부록 B — `hooks/useAuth.ts` 인증 `useEffect` 교체 블록

아래는 **해당 `useEffect` 하나**를 통째로 교체할 때 사용합니다. 파일 상단에 다음이 있어야 합니다.

- `import type { AuthChangeEvent, Session } from '@supabase/supabase-js';`
- `getSessionFingerprint` 함수 (문서 1-3절)
- `const lastHandledSessionFingerprintRef = useRef<string | null>(null);`

```ts
useEffect(() => {
  let isMounted = true;

  const fetchUserData = async (sessionUser: { id: string; email?: string | null }) => {
    if (!sessionUser?.id || !isMounted) return;

    try {
      const currentUser = { id: sessionUser.id, email: sessionUser.email || '' };
      if (!isMounted) return;

      setUser(currentUser);
      setUserProfile({
        subscription_tier: 'free',
        max_portfolios: 2,
        max_alarms: 2,
        preferred_language: 'ko',
        timezone: getDeviceTimeZone(),
      });

      fetchUserProfile(currentUser.id);
      fetchPortfoliosRef.current?.(currentUser.id);
    } catch (err) {
      console.error('[fetchUserData] catch 에러:', err);
    }
  };

  const clearAuthState = async (showAlert: boolean = true) => {
    if (!isMounted) return;

    clearAuthStorage();

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[Auth] signOut during clearAuthState failed (expected):', e);
    }

    lastHandledSessionFingerprintRef.current = null;
    setUser(null);
    setUserProfile(null);
    setPortfolios([]);

    if (showAlert) {
      alert(lang === 'ko' ? '세션이 만료되었습니다. 다시 로그인해 주세요.' : 'Session expired. Please log in again.');
    }
  };

  const applySession = async (
    session: Session | null,
    event: AuthChangeEvent | 'CHECK_USER',
  ): Promise<void> => {
    if (!isMounted) return;

    if (!session?.user) {
      lastHandledSessionFingerprintRef.current = null;
      setUser(null);
      setUserProfile(null);
      setPortfolios([]);
      return;
    }

    const fingerprint = getSessionFingerprint(session);
    if (fingerprint && lastHandledSessionFingerprintRef.current === fingerprint) {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthModal('reset-password');
      }
      return;
    }

    lastHandledSessionFingerprintRef.current = fingerprint;
    await fetchUserData(session.user);

    if (session.user.id) {
      saveFCMToken(session.user.id).catch((err) =>
        console.debug('[FCM] token save on auth sync:', err),
      );
    }

    if (event === 'PASSWORD_RECOVERY') {
      setAuthModal('reset-password');
    }

    if (event === 'USER_UPDATED' && authModalRef.current === 'reset-password') {
      setAuthModal(null);
      alert(lang === 'ko' ? '비밀번호가 성공적으로 변경되었습니다.' : 'Password updated successfully.');
    }
  };

  const checkUser = async () => {
    if (!isMounted) return;

    try {
      setIsLoading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (sessionError && sessionError.name !== 'AbortError') {
        console.error('[checkUser] Session error:', sessionError);
        if (isSessionRecoverableError(sessionError)) {
          await clearAuthState(false);
          return;
        }
      }

      await applySession(session, 'CHECK_USER');
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name !== 'AbortError' &&
        isMounted &&
        isSessionRecoverableError(err)
      ) {
        await clearAuthState(false);
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
  };

  void checkUser();

  let initialSessionResolved = false;

  const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!isMounted) return;

    try {
      if (event === 'TOKEN_REFRESHED') return;

      if (event === 'INITIAL_SESSION') {
        initialSessionResolved = true;
        await applySession(session, event);
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      if (!initialSessionResolved) {
        initialSessionResolved = true;
      }

      if (event === 'SIGNED_OUT') {
        await applySession(null, event);
        return;
      }

      if (
        event === 'SIGNED_IN' &&
        justLoggedInRef.current &&
        session?.user?.id === userIdRef.current
      ) {
        justLoggedInRef.current = false;
        lastHandledSessionFingerprintRef.current = getSessionFingerprint(session);
        return;
      }

      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState(null, '', cleanUrl);
      }

      await applySession(session, event);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name !== 'AbortError' &&
        isMounted &&
        isSessionRecoverableError(err)
      ) {
        await clearAuthState(true);
      }
    }
  });

  const handleAuthError = async (event: PromiseRejectionEvent) => {
    if (!isMounted) return;
    if (isSessionRecoverableError(event.reason)) {
      event.preventDefault();
      await clearAuthState(true);
    }
  };

  unhandledRejectionHandlerRef.current = handleAuthError;

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', handleAuthError);
  }

  return () => {
    isMounted = false;
    listener.subscription.unsubscribe();

    if (typeof window !== 'undefined' && unhandledRejectionHandlerRef.current) {
      window.removeEventListener('unhandledrejection', unhandledRejectionHandlerRef.current);
      unhandledRejectionHandlerRef.current = null;
    }
  };
}, [lang, saveFCMToken, fetchUserProfile, setPortfolios]);
```

**주의**: 위 블록은 기존 `useAuth` 파일에서 **동일한 의존성을 가진 기존 인증 `useEffect`와 교체**할 때만 사용하세요. 그 외 `useEffect`(예: `authModalRef` 동기화)는 그대로 두세요.

---

## 문서 이력

- 최초 작성: 토스 WebView Supabase Auth 3건 수정 계획 (redirect / storage / INITIAL_SESSION)
