import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';

export interface UseMutexActionOptions<Result> {
  getMutationFailureToastMessage?: (error: unknown) => string | null;
  lockedReturnValue?: Result;
}

export interface UseMutexActionResult<Args extends unknown[], Result> {
  run: (...args: Args) => Promise<Result>;
  isExecuting: boolean;
}

export function useMutexAction<Args extends unknown[], Result>(
  action: (...args: Args) => Result | Promise<Result>,
  options?: UseMutexActionOptions<Awaited<Result>>,
): UseMutexActionResult<Args, Awaited<Result>> {
  const isExecutingRef = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const actionRef = useRef(action);
  const optionsRef = useRef(options);
  const isMountedRef = useRef(true);

  // 렌더 페이즈 ref 변이를 피하고, 커밋 직전에 최신 액션만 동기 반영합니다.
  useLayoutEffect(() => {
    actionRef.current = action;
  }, [action]);

  useLayoutEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<Awaited<Result>> => {
      if (isExecutingRef.current) {
        return optionsRef.current?.lockedReturnValue as Awaited<Result>;
      }

      try {
        isExecutingRef.current = true;
        if (isMountedRef.current) {
          setIsExecuting(true);
        }
        return await Promise.resolve(actionRef.current(...args));
      } catch (error: unknown) {
        const toastMessage =
          optionsRef.current?.getMutationFailureToastMessage?.(error);

        if (toastMessage != null && toastMessage.trim().length > 0) {
          try {
            showErrorToast(toastMessage);
          } catch (toastError: unknown) {
            console.error('[useMutexAction] toast failed:', toastError);
          }
        }

        throw error;
      } finally {
        isExecutingRef.current = false;
        if (isMountedRef.current) {
          setIsExecuting(false);
        }
      }
    },
    [],
  );

  return useMemo(
    () => ({
      run,
      isExecuting,
    }),
    [isExecuting, run],
  );
}
