import React, { useCallback } from 'react';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { I18N } from '../../constants';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
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

export const PortfolioCardActions: React.FC<PortfolioCardActionsProps> = ({
  lang,
  isAlarmEnabled,
  onOpenAlarm,
  onDeletePortfolio,
}) => {
  const { isInTossApp } = useTossApp();
  const deleteDialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const triggerLabel = TDS_DIALOG_MESSAGES[lang]?.portfolio?.openDeleteConfirm ?? '';
  const t = I18N[lang];

  const alarmIcon = isAlarmEnabled ? (
    <Bell size={16} fill="currentColor" />
  ) : (
    <BellOff size={16} />
  );

  const baseButtonClass = 'w-9 h-9 rounded-lg flex items-center justify-center';
  const activeAlarmClass =
    'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500';

  const alarmTossButtonClass = [baseButtonClass, 'min-w-0 p-0', isAlarmEnabled && activeAlarmClass]
    .filter(Boolean)
    .join(' ');

  const alarmWebButtonClass = [
    baseButtonClass,
    'transition-all duration-300',
    isAlarmEnabled
      ? `${activeAlarmClass} border border-amber-200 dark:border-amber-500/30`
      : 'bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
  ]
    .filter(Boolean)
    .join(' ');

  const handleRequestDelete = useCallback(() => {
    const currentLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
    const portfolioMessages = TDS_DIALOG_MESSAGES[lang]?.portfolio;

    if (currentLabels == null || portfolioMessages == null) {
      const errorMessage = TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
      if (errorMessage != null && errorMessage !== '') {
        showErrorToast(errorMessage);
      }
      return;
    }

    deleteDialog.open({
      title: portfolioMessages.deleteTitle ?? '',
      body: portfolioMessages.deleteBody ?? '',
      confirmLabel: portfolioMessages.deleteConfirm ?? '',
      tone: 'danger',
      action: onDeletePortfolio,
    });
  }, [deleteDialog.open, lang, onDeletePortfolio]);

  return (
    <>
      {isInTossApp ? (
        <>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={onOpenAlarm}
            className={alarmTossButtonClass}
            aria-label={t.alarmSettingsLabel}
          >
            {alarmIcon}
          </TDSButton>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={handleRequestDelete}
            className="w-9 h-9 min-w-0 p-0 rounded-lg flex items-center justify-center text-slate-500"
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
            className={alarmWebButtonClass}
            aria-label={t.alarmSettingsLabel}
          >
            {alarmIcon}
          </button>
          <button
            type="button"
            onClick={handleRequestDelete}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 active:scale-95"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </>
      )}

      {labels != null ? (
        <TdsConfirmDialog {...deleteDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};

export default PortfolioCardActions;
