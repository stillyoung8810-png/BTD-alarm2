import type { AppLang } from '@/types';

export interface AlarmMessageSet {
  title: string;
  slotSystem: (maxAlarms: number) => string;
  statusLabel: string;
  enabledDescription: string;
  configuredTimes: string;
  addTime: string;
  periodLabel: string;
  hourLabel: string;
  minuteLabel: string;
  minuteIntervalHeader: string;
  minuteIntervalNotice: string;
  minuteUnit: string;
  addAction: string;
  saveAction: string;
  onState: string;
  offState: string;
  allSlotsFilledNotice: string;
  premiumFeatureNoticeTitle: string;
  premiumFeatureNoticeBody: string;
  notificationAgreementRejectedToast: string;
  notificationAgreementFailedToast: string;
  notificationAgreementUnsupportedToast: string;
  aria: {
    closeModal: string;
    closeBackdrop: string;
    toggleAlarm: string;
    removeTime: (timeLabel: string) => string;
    selectPeriod: (period: 'AM' | 'PM') => string;
    saveAlarmSettings: string;
    minuteMenuTrigger: string;
  };
  period: {
    am: string;
    pm: string;
  };
}

export const ALARM_MESSAGES: Record<AppLang, AlarmMessageSet> = {
  ko: {
    title: '알람 설정',
    slotSystem: (maxAlarms: number) => `${maxAlarms} 슬롯 시스템`,
    statusLabel: '알람 상태',
    enabledDescription: '실시간 매매 알림 활성화됨',
    configuredTimes: '설정된 시간',
    addTime: '시간 추가',
    periodLabel: '오전/오후',
    hourLabel: '시',
    minuteLabel: '분',
    minuteIntervalHeader: '10분 단위 설정',
    minuteIntervalNotice: '현재 10분 단위로만 선택이 가능합니다.',
    minuteUnit: '분',
    addAction: '추가',
    saveAction: '설정 저장',
    onState: 'ON',
    offState: 'OFF',
    allSlotsFilledNotice: '더 많은 알람 설정은 추후 확장 예정입니다.',
    premiumFeatureNoticeTitle: '프리미엄 전용',
    premiumFeatureNoticeBody: '프리미엄 전용 기능입니다.',
    notificationAgreementRejectedToast:
      '알림 수신 동의가 필요해 알람을 저장하지 않았습니다.',
    notificationAgreementFailedToast:
      '알림 수신 동의 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    notificationAgreementUnsupportedToast:
      '현재 토스 앱 버전에서는 알림 수신 동의를 요청할 수 없습니다. 토스 앱을 업데이트한 뒤 다시 시도해 주세요.',
    aria: {
      closeModal: '알람 설정 모달 닫기',
      closeBackdrop: '알람 설정 모달 배경 닫기',
      toggleAlarm: '알람 켜기 또는 끄기',
      removeTime: (timeLabel: string) => `${timeLabel} 알람 삭제`,
      selectPeriod: (period: 'AM' | 'PM') =>
        period === 'AM' ? '오전 선택' : '오후 선택',
      saveAlarmSettings: '알람 설정 저장',
      minuteMenuTrigger: '알람 분 단위 선택 열기',
    },
    period: {
      am: '오전',
      pm: '오후',
    },
  },
  en: {
    title: 'Alarm Settings',
    slotSystem: (maxAlarms: number) => `${maxAlarms} slot system`,
    statusLabel: 'Alarm status',
    enabledDescription: 'Real-time trading notifications enabled',
    configuredTimes: 'Configured times',
    addTime: 'Add time',
    periodLabel: 'Period',
    hourLabel: 'Hour',
    minuteLabel: 'Minute',
    minuteIntervalHeader: '10-minute interval',
    minuteIntervalNotice: 'Currently, only 10-minute intervals can be selected.',
    minuteUnit: ' min',
    addAction: 'Add',
    saveAction: 'Save settings',
    onState: 'ON',
    offState: 'OFF',
    allSlotsFilledNotice: 'More alarm settings will be available in future updates.',
    premiumFeatureNoticeTitle: 'Premium only',
    premiumFeatureNoticeBody: 'This is a premium feature.',
    notificationAgreementRejectedToast:
      'Alarm settings were not saved because notification consent is required.',
    notificationAgreementFailedToast:
      'Failed to request notification consent. Please try again later.',
    notificationAgreementUnsupportedToast:
      'This Toss app version does not support notification consent. Please update Toss and try again.',
    aria: {
      closeModal: 'Close alarm settings modal',
      closeBackdrop: 'Close alarm settings modal backdrop',
      toggleAlarm: 'Toggle alarm on or off',
      removeTime: (timeLabel: string) => `Remove alarm for ${timeLabel}`,
      selectPeriod: (period: 'AM' | 'PM') =>
        period === 'AM' ? 'Select AM' : 'Select PM',
      saveAlarmSettings: 'Save alarm settings',
      minuteMenuTrigger: 'Open alarm minute selector',
    },
    period: {
      am: 'AM',
      pm: 'PM',
    },
  },
};

const ALARM_MESSAGE_CACHE = new Map<AppLang, AlarmMessageSet>();

export function getAlarmMessages(lang: AppLang): AlarmMessageSet {
  const cached = ALARM_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = ALARM_MESSAGES[lang];
  ALARM_MESSAGE_CACHE.set(lang, messages);
  return messages;
}