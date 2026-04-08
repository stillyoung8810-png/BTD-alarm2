import React, { useCallback } from 'react';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { getDashboardMessages } from '../../constants/messages/dashboardMessages';
import { useTossApp } from '../../contexts/TossAppContext';
import { TDSButton } from '../tds';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { showErrorToast } from '../tds-adapter/showErrorToast';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';

interface PortfolioCardActionsProps {
  lang: 'ko' | 'en';
  isAlarmEnabled: boolean;
  onOpenAlarm: () => void;
  onDeletePortfolio: () => Promise<void> | void;
}

function getAlarmButtonClassName(
  isAlarmEnabled: boolean,
  isInTossApp: boolean,
): string {
  const base = 'w-9 h-9 rounded-lg flex items-center justify-center';
  if (isInTossApp) {
    return isAlarmEnabled
      ? `${base} min-w-0 p-0 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500`
      : `${base} min-w-0 p-0`;
  }

  if (isAlarmEnabled) {
    return `${base} transition-all duration-300 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/30`;
  }

  return `${base} transition-all duration-300 bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`;
}

export const PortfolioCardActions: React.FC<PortfolioCardActionsProps> = ({
  lang,
  isAlarmEnabled,
  onOpenAlarm,
  onDeletePortfolio,
}) => {
  const { isInTossApp } = useTossApp();
  const dashboardCopy = getDashboardMessages(lang);
  const labels = TDS_DIALOG_MESSAGES[lang].actions;
  const portfolioCopy = TDS_DIALOG_MESSAGES[lang]?.portfolio;
  const deleteDialog = useAsyncTdsConfirm(lang);
  // Rule 3: 트리거 A11y — openDeleteConfirm SSOT만. 누락 시 '' (§0.6).
  const triggerLabel = portfolioCopy?.openDeleteConfirm ?? '';

  const handleRequestDelete = useCallback(() => {
    const titleText = portfolioCopy?.deleteTitle?.trim() ?? '';
    const bodyText = portfolioCopy?.deleteBody?.trim() ?? '';
    const confirmText = portfolioCopy?.deleteConfirm?.trim() ?? '';

    // Rule 11 & 3: 필드 누락 시 모달 미오픈. 토스트는 auth.authCopyMissingFallback 만 재사용(신규 키·영문 리터럴 금지, §0.6).
    if (titleText === '' || bodyText === '' || confirmText === '') {
      const fallbackMsg =
        TDS_DIALOG_MESSAGES[lang]?.auth?.authCopyMissingFallback?.trim() ?? '';
      if (fallbackMsg !== '') {
        showErrorToast(fallbackMsg);
      }
      return;
    }

    deleteDialog.open({
      title: titleText,
      body: bodyText,
      confirmLabel: confirmText,
      tone: 'danger',
      action: onDeletePortfolio,
    });
  }, [
    deleteDialog,
    lang,
    onDeletePortfolio,
    portfolioCopy?.deleteBody,
    portfolioCopy?.deleteConfirm,
    portfolioCopy?.deleteTitle,
  ]);

  const alarmIcon = isAlarmEnabled ? (
    <Bell size={16} fill="currentColor" />
  ) : (
    <BellOff size={16} />
  );

  const alarmButtonClassName = getAlarmButtonClassName(isAlarmEnabled, isInTossApp);

  return (
    <>
      {isInTossApp ? (
        <>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={onOpenAlarm}
            className={alarmButtonClassName}
            aria-label={dashboardCopy.openAlarmSettingsAria}
          >
            {alarmIcon}
          </TDSButton>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={handleRequestDelete}
            className="flex h-9 w-9 min-w-0 items-center justify-center rounded-lg p-0 text-slate-500"
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </TDSButton>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpenAlarm}
            className={alarmButtonClassName}
            aria-label={dashboardCopy.openAlarmSettingsAria}
          >
            {alarmIcon}
          </button>
          <button
            type="button"
            onClick={handleRequestDelete}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-transparent text-slate-500 transition-all duration-200 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-slate-700 active:scale-95"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </>
      )}

      <TdsConfirmDialog {...deleteDialog.dialogProps} labels={labels} />
    </>
  );
};

export default PortfolioCardActions;