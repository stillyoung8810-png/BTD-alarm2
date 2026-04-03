import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface UseMutexActionResult<Args extends unknown[]> {
  run: (...args: Args) => Promise<void>;
  isExecuting: boolean;
}

export function useMutexAction<Args extends unknown[]>(
  action: (...args: Args) => void | Promise<void>,
): UseMutexActionResult<Args> {
  const isExecutingRef = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const actionRef = useRef(action);

  // 렌더 페이즈 ref 변이를 피하고, 커밋 직전에 최신 액션만 동기 반영합니다.
  useLayoutEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(async (...args: Args) => {
    if (isExecutingRef.current) {
      return;
    }

    try {
      isExecutingRef.current = true;
      setIsExecuting(true);
      await Promise.resolve(actionRef.current(...args));
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
    }
  }, []);

  return useMemo(
    () => ({
      run,
      isExecuting,
    }),
    [isExecuting, run],
  );
}
