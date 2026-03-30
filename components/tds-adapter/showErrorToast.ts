export type TdsErrorToastHandler = (message: string) => void;

let tdsErrorToastHandler: TdsErrorToastHandler | null = null;

/**
 * Phase 1+에서 App(또는 Toast Provider)이 실제 UI와 연결할 때 한 번 등록합니다.
 * 등록 전에는 개발 환경에서만 `console.warn`으로 노출합니다.
 */
export function registerTdsErrorToastHandler(
  handler: TdsErrorToastHandler | null,
): void {
  tdsErrorToastHandler = handler;
}

/**
 * @param message 반드시 `TDS_DIALOG_MESSAGES[lang].…` 등 사전에서 조회한 값만 허용.
 */
export function showErrorToast(message: string): void {
  const trimmed = message.trim();
  if (trimmed === '') {
    return;
  }
  if (tdsErrorToastHandler != null) {
    tdsErrorToastHandler(trimmed);
    return;
  }
  if (import.meta.env.DEV) {
    console.warn('[TDS] showErrorToast (handler not registered):', trimmed);
  }
}
