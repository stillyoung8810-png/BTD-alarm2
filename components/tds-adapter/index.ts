/**
 * TDS 어댑터 공개 API (Phase 0).
 * Phase 1+ 화면에서는 이 경로에서 import 하거나 개별 파일을 직접 import 합니다.
 */
export { ConfirmDialogSample } from './ConfirmDialogSample';
export {
  createClosedAlertDialogState,
  type AlertDialogState,
} from './dialogState';
export { TdsAlertDialog, type TdsAlertDialogProps } from './TdsAlertDialog';
export { TdsConfirmDialog, type TdsConfirmDialogProps } from './TdsConfirmDialog';
export { TdsDialogShell, type TdsDialogShellProps } from './TdsDialogShell';
export {
  registerTdsErrorToastHandler,
  showErrorToast,
  type TdsErrorToastHandler,
} from './showErrorToast';
export {
  useAsyncTdsConfirm,
  type AsyncTdsConfirmDialogProps,
  type AsyncTdsConfirmOpenParams,
  type UseAsyncTdsConfirmResult,
} from './useAsyncTdsConfirm';
