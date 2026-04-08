export type ServiceErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'SDK_ERROR'
  | 'UNSUPPORTED_ENV'
  | 'MISSING_ENV'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'RATE_LIMIT'
  | 'UNKNOWN';

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  cause?: unknown;
  context?: Record<string, string | number | boolean>;
}

export type ServiceResult<T> =
  | {
      ok: true;
      data: T;
      context?: Record<string, string | number | boolean>;
    }
  | {
      ok: false;
      data: T;
      error: ServiceError;
      context?: Record<string, string | number | boolean>;
    };

export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_FORBIDDEN = 403;
export const HTTP_STATUS_NOT_FOUND = 404;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
export const HTTP_STATUS_SERVER_ERROR_MIN = 500;
export const HTTP_STATUS_SERVER_ERROR_MAX = 599;
export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

export function okResult<T>(
  data: T,
  context?: Record<string, string | number | boolean>,
): ServiceResult<T> {
  return { ok: true, data, context };
}

export function createServiceError(
  code: ServiceErrorCode,
  message: string,
  options?: {
    retryable?: boolean;
    httpStatus?: number;
    cause?: unknown;
    context?: Record<string, string | number | boolean>;
  },
): ServiceError {
  return {
    code,
    message,
    retryable: options?.retryable ?? false,
    httpStatus: options?.httpStatus,
    cause: options?.cause,
    context: options?.context,
  };
}

export function failResult<T>(
  data: T,
  error: ServiceError,
  context?: Record<string, string | number | boolean>,
): ServiceResult<T> {
  return { ok: false, data, error, context };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readFiniteNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = value[key];
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return null;
  }

  return candidate;
}

export function normalizeErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  return fallback;
}

export function mapHttpStatusToErrorCode(
  status: number,
): ServiceErrorCode {
  switch (status) {
    case HTTP_STATUS_UNAUTHORIZED:
      return 'AUTH_REQUIRED';
    case HTTP_STATUS_FORBIDDEN:
      return 'FORBIDDEN';
    case HTTP_STATUS_NOT_FOUND:
      return 'NOT_FOUND';
    case HTTP_STATUS_TOO_MANY_REQUESTS:
      return 'RATE_LIMIT';
    default:
      if (
        status >= HTTP_STATUS_SERVER_ERROR_MIN &&
        status <= HTTP_STATUS_SERVER_ERROR_MAX
      ) {
        return 'SERVER_ERROR';
      }
      return 'HTTP_ERROR';
  }
}

export function isHttpStatusRetryable(status: number): boolean {
  return (
    status === HTTP_STATUS_TOO_MANY_REQUESTS ||
    (status >= HTTP_STATUS_SERVER_ERROR_MIN &&
      status <= HTTP_STATUS_SERVER_ERROR_MAX)
  );
}

export function createHttpResponseError(
  status: number,
  message: string,
  options?: {
    cause?: unknown;
    context?: Record<string, string | number | boolean>;
  },
): ServiceError {
  return createServiceError(
    mapHttpStatusToErrorCode(status),
    message,
    {
      retryable: isHttpStatusRetryable(status),
      httpStatus: status,
      cause: options?.cause,
      context: options?.context,
    },
  );
}

export async function safeReadJsonUnknown(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallback: T,
  options?: {
    timeoutMs?: number;
    context?: Record<string, string | number | boolean>;
  },
): Promise<ServiceResult<unknown | T>> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const timerId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const payload = await safeReadJsonUnknown(response);

    if (!response.ok) {
      return failResult(
        fallback,
        createHttpResponseError(
          response.status,
          `http_${response.status}`,
          {
            cause: payload,
            context: options?.context,
          },
        ),
        options?.context,
      );
    }

    return okResult(payload, options?.context);
  } catch (error: unknown) {
    const isAbortError =
      error instanceof DOMException && error.name === 'AbortError';
    return failResult(
      fallback,
      createServiceError(
        isAbortError ? 'TIMEOUT' : 'NETWORK',
        isAbortError ? 'request_timed_out' : 'network_request_failed',
        {
          retryable: true,
          cause: error,
          context: options?.context,
        },
      ),
      options?.context,
    );
  } finally {
    globalThis.clearTimeout(timerId);
  }
}

export async function wrapBridgeCall<T>(
  action: () => Promise<T> | T,
  fallback: T,
  context: Record<string, string | number | boolean>,
): Promise<ServiceResult<T>> {
  try {
    const data = await Promise.resolve(action());
    return okResult(data, context);
  } catch (error: unknown) {
    return failResult(
      fallback,
      createServiceError('SDK_ERROR', 'bridge_call_failed', {
        retryable: false,
        cause: error,
        context,
      }),
      context,
    );
  }
}
