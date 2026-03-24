/**
 * Supabase Auth용 저장소 어댑터.
 * 토스 WebView 등에서 localStorage가 막혀도 sessionStorage·cookie·memory로 폴백해 PKCE/세션 저장이 조용히 실패하지 않게 합니다.
 */

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
