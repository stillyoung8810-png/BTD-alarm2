import React, { useState } from 'react';
import { ChevronDown, Clock, Info, Plus, Trash2, X } from 'lucide-react';
import type { AppLang } from '@/types';
import { useTossApp } from '@/contexts/TossAppContext';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { useTDSMenu } from '@/components/tds';
import Toggle from '@/components/Toggle';
import CustomDropdown from '@/components/CustomDropdown';
import InfoModal from '@/components/InfoModal';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import type { UseAlarmModalControllerResult } from './useAlarmModalController';

interface AlarmModalViewProps {
  lang: AppLang;
  maxAlarms: number;
  onClose: () => void;
  controller: UseAlarmModalControllerResult;
}

function getSelectableButtonClassName(isActive: boolean): string {
  const baseClassName =
    'py-3 rounded-xl text-xs font-black transition-all border';
  if (isActive) {
    return `${baseClassName} bg-gradient-to-r from-blue-600 to-blue-500 text-white border-transparent shadow-lg shadow-blue-500/30`;
  }

  return `${baseClassName} bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-white/5`;
}

function formatAlarmTime(
  time24: string,
  lang: AppLang,
  copy: UseAlarmModalControllerResult['copy'],
): string {
  const [hourString, minuteString = '00'] = time24.split(':');
  const hour24 = Number.parseInt(hourString, 10);
  if (!Number.isFinite(hour24)) {
    return time24;
  }

  const isPostMeridiem = hour24 >= 12;
  const hour12 = hour24 % 12;
  const displayHour = hour12 === 0 ? 12 : hour12;
  if (lang === 'ko') {
    const periodLabel = isPostMeridiem ? copy.period.pm : copy.period.am;
    const normalizedHour =
      hour24 === 0 ? '00' : displayHour.toString().padStart(2, '0');
    return `${periodLabel} ${normalizedHour}:${minuteString}`;
  }

  const periodLabel = isPostMeridiem ? copy.period.pm : copy.period.am;
  return `${displayHour}:${minuteString} ${periodLabel}`;
}

export function AlarmModalView({
  lang,
  maxAlarms,
  onClose,
  controller,
}: AlarmModalViewProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const { Menu: TDSMenu } = useTDSMenu();
  const commonCopy = getCommonMessages(lang);
  const [isMinuteMenuOpen, setIsMinuteMenuOpen] = useState(false);

  const selectedMinuteLabel = `${controller.selectedMinute}${controller.copy.minuteUnit}`;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          role="button"
          tabIndex={0}
          aria-label={controller.copy.aria.closeBackdrop}
          onClick={onClose}
          onKeyDown={(event) => {
            handlePressEnterOrSpace(event, onClose);
          }}
          className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-sm"
        />
        <div
          className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/5 dark:bg-[#080B15] dark:shadow-2xl"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-[#080B15]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-500/20">
                <Clock className="text-white" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  {controller.copy.title}
                </h2>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                  {controller.copy.slotSystem(maxAlarms)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={controller.copy.aria.closeModal}
            >
              <X size={20} />
            </button>
          </div>

          <div className="scrollbar-hide flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 backdrop-blur-sm dark:border-white/5 dark:bg-white/5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                  {controller.copy.statusLabel}
                </span>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-black ${
                      controller.isEnabled
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {controller.isEnabled
                      ? controller.copy.onState
                      : controller.copy.offState}
                  </span>
                  <Toggle
                    checked={controller.isEnabled}
                    onChange={controller.handleSetEnabled}
                    aria-label={controller.copy.aria.toggleAlarm}
                  />
                </div>
              </div>
              {controller.isEnabled ? (
                <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-300">
                  {controller.copy.enabledDescription}
                </p>
              ) : null}
            </div>

            {controller.isEnabled ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      {controller.copy.configuredTimes}
                    </span>
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                      ({controller.selectedTimes.length}/{maxAlarms})
                    </span>
                  </div>

                  {controller.selectedTimes.length > 0 ? (
                    <div className="space-y-2">
                      {controller.selectedTimes.map((time) => {
                        const timeLabel = formatAlarmTime(
                          time,
                          lang,
                          controller.copy,
                        );
                        return (
                          <div
                            key={time}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5"
                          >
                            <span className="text-sm font-black text-slate-900 dark:text-white">
                              {timeLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => controller.handleRemoveTime(time)}
                              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                              aria-label={controller.copy.aria.removeTime(
                                timeLabel,
                              )}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {!controller.isAllSlotsFilled ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 backdrop-blur-sm dark:border-white/5 dark:bg-white/5">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      {controller.copy.addTime}
                    </span>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                        {controller.copy.periodLabel}
                      </label>
                      <div className="flex gap-2">
                        {(['AM', 'PM'] as const).map((periodValue) => (
                          <button
                            key={periodValue}
                            type="button"
                            onClick={() =>
                              controller.handleSetPeriod(periodValue)
                            }
                            className={`flex-1 ${getSelectableButtonClassName(
                              controller.period === periodValue,
                            )}`}
                            aria-label={controller.copy.aria.selectPeriod(
                              periodValue,
                            )}
                          >
                            {periodValue === 'AM'
                              ? controller.copy.period.am
                              : controller.copy.period.pm}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                        {controller.copy.hourLabel}
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        {controller.hourOptions.map((hour) => (
                          <button
                            key={hour}
                            type="button"
                            onClick={() =>
                              controller.handleSetSelectedHour(hour)
                            }
                            className={`text-[11px] ${getSelectableButtonClassName(
                              controller.selectedHour === hour,
                            )}`}
                          >
                            {hour}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                        {controller.copy.minuteLabel}
                      </label>
                      {isInTossApp && TDSMenu != null ? (
                        <TDSMenu
                          open={isMinuteMenuOpen}
                          onOpen={() => setIsMinuteMenuOpen(true)}
                          onClose={() => setIsMinuteMenuOpen(false)}
                          placement="bottom"
                        >
                          <TDSMenu.Trigger>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-900 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/50 dark:border-white/5 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                              aria-label={controller.copy.aria.minuteMenuTrigger}
                            >
                              <span>{selectedMinuteLabel}</span>
                              <ChevronDown
                                size={16}
                                className="text-slate-400"
                              />
                            </button>
                          </TDSMenu.Trigger>
                          <TDSMenu.Dropdown>
                            <TDSMenu.Header>
                              {controller.copy.minuteIntervalHeader}
                            </TDSMenu.Header>
                            {controller.minuteOptions.map((option) => (
                              <TDSMenu.DropdownCheckItem
                                key={option.value}
                                checked={
                                  controller.selectedMinute === option.value
                                }
                                onCheckedChange={(checked) => {
                                  if (!checked) {
                                    return;
                                  }
                                  controller.handleSetSelectedMinute(
                                    option.value,
                                  );
                                  setIsMinuteMenuOpen(false);
                                }}
                              >
                                {option.label}
                              </TDSMenu.DropdownCheckItem>
                            ))}
                          </TDSMenu.Dropdown>
                        </TDSMenu>
                      ) : (
                        <CustomDropdown
                          value={controller.selectedMinute}
                          options={controller.minuteOptions}
                          onChange={controller.handleSetSelectedMinute}
                          header={controller.copy.minuteIntervalHeader}
                          className="w-full"
                          infoModalBadgeLabel={commonCopy.notice}
                          infoModalCloseAriaLabel={commonCopy.closeDialog}
                          infoModalConfirmLabel={commonCopy.acknowledge}
                        />
                      )}
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-600/10">
                      <Info
                        size={14}
                        className="mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                      />
                      <p className="text-[10px] font-medium text-slate-700 dark:text-slate-200">
                        {controller.copy.minuteIntervalNotice}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={controller.handleAddTime}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] hover:bg-blue-500 active:scale-95"
                    >
                      <Plus size={14} />
                      {controller.copy.addAction}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:border-blue-500/30 dark:from-blue-600/20 dark:to-purple-600/20">
                    <Info
                      className="flex-shrink-0 text-blue-600 dark:text-blue-400"
                      size={18}
                    />
                    <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                      {controller.copy.allSlotsFilledNotice}
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-[#080B15]">
            <button
              type="button"
              onClick={() => {
                void controller.handleSave();
              }}
              disabled={controller.isSaving}
              aria-busy={controller.isSaving}
              aria-label={controller.copy.aria.saveAlarmSettings}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-blue-500/30 transition-all hover:scale-[1.02] hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Clock size={16} />
              {controller.isSaving
                ? commonCopy.processing
                : controller.copy.saveAction}
            </button>
          </div>
        </div>
      </div>

      <InfoModal
        open={controller.isInfoOpen}
        badgeLabel={commonCopy.notice}
        title={controller.copy.premiumFeatureNoticeTitle}
        message={controller.copy.premiumFeatureNoticeBody}
        closeAriaLabel={commonCopy.closeDialog}
        confirmLabel={commonCopy.acknowledge}
        onClose={controller.handleCloseInfo}
      />
    </>
  );
}

export default AlarmModalView;