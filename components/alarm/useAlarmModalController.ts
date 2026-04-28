import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlarmConfig, Portfolio } from '@/types';
import { getAlarmMessages } from '@/constants/messages/alarmMessages';

const MINUTE_STEP = 10;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
  (index * MINUTE_STEP).toString().padStart(2, '0'),
);
const HOURS = Array.from({ length: 12 }, (_, index) =>
  index.toString().padStart(2, '0'),
);

interface UseAlarmModalControllerParams {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  maxAlarms: number;
  /** Rule 11: 저장이 네트워크를 탈 수 있으므로 Promise 허용 + 아래 Mutex로 연타 차단 */
  onSave: (config: AlarmConfig) => Promise<void> | void;
}

export interface UseAlarmModalControllerResult {
  copy: ReturnType<typeof getAlarmMessages>;
  isEnabled: boolean;
  selectedTimes: string[];
  period: 'AM' | 'PM';
  selectedHour: string;
  selectedMinute: string;
  isAllSlotsFilled: boolean;
  isInfoOpen: boolean;
  isSaving: boolean;
  hourOptions: string[];
  minuteOptions: string[];
  handleSetEnabled: (checked: boolean) => void;
  handleSetPeriod: (period: 'AM' | 'PM') => void;
  handleSetSelectedHour: (hour: string) => void;
  handleSetSelectedMinute: (minute: string) => void;
  handleAddTime: () => void;
  handleRemoveTime: (time: string) => void;
  handleCloseInfo: () => void;
  handleSave: () => Promise<void>;
}

export function useAlarmModalController({
  lang,
  portfolio,
  maxAlarms,
  onSave,
}: UseAlarmModalControllerParams): UseAlarmModalControllerResult {
  const copy = getAlarmMessages(lang);
  const initialConfig = portfolio.alarmconfig ?? {
    enabled: false,
    selectedHours: [],
  };
  const [isEnabled, setIsEnabled] = useState(initialConfig.enabled);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(
    initialConfig.selectedHours?.slice(0, maxAlarms) ?? [],
  );
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const previousSelectedTimesKeyRef = useRef<string | null>(null);

  const isAllSlotsFilled = selectedTimes.length >= maxAlarms;

  // Rule 6: 모듈 최상단에 두고 단 한 곳에서도 안 쓰는 헬퍼(예: getSelectionFromTime) 금지.
  // 첫 선택 시각 → AM/PM·시·분 동기화는 이 effect 안에서만 인라인 파생한다.
  useEffect(() => {
    if (selectedTimes.length === 0) {
      previousSelectedTimesKeyRef.current = null;
      return;
    }

    const nextKey = selectedTimes.join(',');
    if (previousSelectedTimesKeyRef.current === nextKey) {
      return;
    }

    previousSelectedTimesKeyRef.current = nextKey;

    const firstTime = selectedTimes[0];
    const [hourString, minuteString = '00'] = firstTime.split(':');
    const hour24 = Number.parseInt(hourString, 10);

    if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) {
      setPeriod('AM');
      setSelectedHour('09');
      setSelectedMinute(minuteString);
      return;
    }

    if (hour24 >= 12) {
      setPeriod('PM');
      setSelectedHour((hour24 === 12 ? 0 : hour24 - 12).toString().padStart(2, '0'));
    } else {
      setPeriod('AM');
      setSelectedHour(hourString.padStart(2, '0'));
    }
    setSelectedMinute(minuteString);
  }, [selectedTimes]);

  const handleAddTime = useCallback(() => {
    let hour24Num = Number.parseInt(selectedHour, 10);
    if (Number.isNaN(hour24Num)) {
      return;
    }

    // Rule 2 & 6: 12h → 24h는 삼항 중첩 없이 if-return으로 고정 (12 AM → 00, 12 PM → 12, 그 외 PM +12)
    if (period === 'AM') {
      if (hour24Num === 12) {
        hour24Num = 0;
      }
    } else if (hour24Num !== 12) {
      hour24Num += 12;
    }

    const hour24 = hour24Num.toString().padStart(2, '0');
    const nextTime = `${hour24}:${selectedMinute}`;
    if (selectedTimes.includes(nextTime)) {
      setSelectedTimes((previous) => previous.filter((time) => time !== nextTime));
      return;
    }

    if (selectedTimes.length >= maxAlarms) {
      setIsInfoOpen(true);
      return;
    }

    setSelectedTimes((previous) => [...previous, nextTime].sort());
  }, [maxAlarms, period, selectedHour, selectedMinute, selectedTimes]);

  const handleRemoveTime = useCallback((time: string) => {
    setSelectedTimes((previous) => {
      const next = previous.filter((value) => value !== time);
      if (next.length === 0) {
        setIsEnabled(false);
      }
      return next;
    });
  }, []);

  const handleCloseInfo = useCallback(() => {
    setIsInfoOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) {
      return;
    }

    const shouldEnable = isEnabled && selectedTimes.length > 0;
    const nextConfig: AlarmConfig = {
      enabled: shouldEnable,
      selectedHours: shouldEnable ? selectedTimes : [],
    };

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextConfig));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [isEnabled, onSave, selectedTimes]);

  return {
    copy,
    isEnabled,
    selectedTimes,
    period,
    selectedHour,
    selectedMinute,
    isAllSlotsFilled,
    isInfoOpen,
    isSaving,
    hourOptions: HOURS,
    minuteOptions: MINUTES,
    handleSetEnabled: setIsEnabled,
    handleSetPeriod: setPeriod,
    handleSetSelectedHour: setSelectedHour,
    handleSetSelectedMinute: setSelectedMinute,
    handleAddTime,
    handleRemoveTime,
    handleCloseInfo,
    handleSave,
  };
}