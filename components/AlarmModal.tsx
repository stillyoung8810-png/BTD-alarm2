
import React, { useState, useEffect } from 'react';
import { Portfolio, AlarmConfig } from '../types';
import { X, Clock, Plus, Trash2, Info, ChevronDown } from 'lucide-react';
import Toggle from './Toggle';
import { useTossApp } from '../contexts/TossAppContext';
import CustomDropdown from './CustomDropdown';
import { useTDSMenu } from './tds';

// ---------------------------------------------------------------------------
// 상수 (모듈 레벨 — 렌더마다 재생성 방지)
// ---------------------------------------------------------------------------
const MINUTE_STEP = 10;
/** 시간 옵션: 00-11 */
const HOURS = Array.from({ length: 12 }, (_, i) => i.toString().padStart(2, '0'));
/** 분 옵션: 00, 10, 20, 30, 40, 50 */
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => (i * MINUTE_STEP).toString().padStart(2, '0'));

// ---------------------------------------------------------------------------
// 시간 변환 유틸 (순수 함수 — 컴포넌트 외부)
// ---------------------------------------------------------------------------

/** AM/PM + 0-11시 → 24시간 형식 문자열 */
const convertTo24Hour = (period: 'AM' | 'PM', hour: string): string => {
  const h = parseInt(hour, 10);
  if (period === 'AM') return hour.padStart(2, '0');
  return h === 0 ? '12' : (h + 12).toString().padStart(2, '0');
};

/** 24시간 형식 → AM/PM 표시 문자열 */
const formatToAMPM = (time24: string, lang: 'ko' | 'en'): string => {
  const [hourStr, minuteStr] = time24.split(':');
  const hour = parseInt(hourStr, 10);
  const isPM = hour >= 12;
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const hh = display.toString().padStart(2, '0');
  if (lang === 'ko') return `${isPM ? '오후' : '오전'} ${hour === 0 ? '00' : hh}:${minuteStr}`;
  return `${display}:${minuteStr} ${isPM ? 'PM' : 'AM'}`;
};

// ---------------------------------------------------------------------------
// 공용 선택 버튼 스타일
// ---------------------------------------------------------------------------
const selectableBtnClass = (active: boolean) =>
  `py-3 rounded-xl text-xs font-black transition-all ${
    active
      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
      : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'
  }`;

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------
interface AlarmModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (config: AlarmConfig) => void;
  maxAlarms: number;
}

const AlarmModal: React.FC<AlarmModalProps> = ({ lang, portfolio, onClose, onSave, maxAlarms }) => {
  const { isInTossApp } = useTossApp();
  const { Menu: TDSMenu } = useTDSMenu();
  const initialConfig = portfolio.alarmconfig || {
    enabled: false,
    selectedHours: [],
  };

  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [selectedHours, setSelectedHours] = useState<string[]>(
    initialConfig.selectedHours?.slice(0, maxAlarms) || []
  );

  // AM/PM 선택 상태
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  
  // 시간 선택 상태 (0-11)
  const [selectedHour, setSelectedHour] = useState<string>('09');
  
  // 분 선택 상태
  const [selectedMinute, setSelectedMinute] = useState<string>('00');
  const [minuteMenuOpen, setMinuteMenuOpen] = useState(false);

  // HOURS / MINUTES 는 모듈 레벨 상수 사용 (렌더마다 재생성 방지)

  // 기존 선택된 시간을 로드할 때 AM/PM과 hour를 추출 (동일 값 반복 setState 방지 → 무한루프 방지)
  const prevSelectedHoursKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (selectedHours.length === 0) return;
    const key = selectedHours.join(',');
    if (prevSelectedHoursKeyRef.current === key) return;
    prevSelectedHoursKeyRef.current = key;

    const firstTime = selectedHours[0];
    const [hourStr, minuteStr] = firstTime.split(':');
    const hour = parseInt(hourStr, 10);

    if (hour >= 12) {
      setPeriod('PM');
      const pmHour = hour === 12 ? 0 : hour - 12;
      setSelectedHour(pmHour.toString().padStart(2, '0'));
    } else {
      setPeriod('AM');
      setSelectedHour(hourStr === '00' ? '00' : hourStr.padStart(2, '0'));
    }
    setSelectedMinute(minuteStr || '00');
  }, [selectedHours]);

  // convertTo24Hour / formatToAMPM 는 모듈 레벨 순수 함수 사용

  const addTime = () => {
    const hour24 = convertTo24Hour(period, selectedHour);
    const timeString = `${hour24}:${selectedMinute}`;
    
    if (selectedHours.includes(timeString)) {
      // 이미 선택된 시간이면 제거
      setSelectedHours(selectedHours.filter(h => h !== timeString));
      return;
    }

    if (selectedHours.length >= maxAlarms) {
      // 프리미엄 안내
      alert(lang === 'ko' ? '프리미엄 전용 기능입니다.' : 'This is a premium feature.');
      return;
    }

    setSelectedHours([...selectedHours, timeString].sort());
  };

  const removeTime = (timeString: string) => {
    const next = selectedHours.filter(h => h !== timeString);
    setSelectedHours(next);
    if (next.length === 0) setEnabled(false); // 설정된 시간이 없으면 자동 OFF
  };

  // ON인데 설정된 시간이 없으면 OFF로 저장 (자동 비활성화). 토글 ON은 허용해 시간 설정 UI가 보이게 함.
  const handleSave = () => {
    const effectiveEnabled = enabled && selectedHours.length > 0;
    onSave({ enabled: effectiveEnabled, selectedHours: effectiveEnabled ? selectedHours : [] });
  };

  const isAllSlotsFilled = selectedHours.length >= maxAlarms;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-sm" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-[#080B15] rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100dvh-2rem)]"
        style={{ touchAction: 'pan-y' }}
      >
        
        {/* Header - 고정 */}
        <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-[#080B15] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Clock className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{lang === 'ko' ? '알람 설정' : 'Alarm Settings'}</h2>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest mt-0.5">
                {maxAlarms} SLOT SYSTEM
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - 스크롤 가능 */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
          
          {/* Alarm Status */}
          <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-2xl border border-slate-200 dark:border-white/5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                {lang === 'ko' ? '알람 상태' : 'Alarm Status'}
              </span>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-black ${enabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {enabled ? 'ON' : 'OFF'}
                </span>
                <Toggle
                  checked={enabled}
                  onChange={setEnabled}
                  aria-label={lang === 'ko' ? '알람 켜기/끄기' : 'Toggle alarm on/off'}
                />
              </div>
            </div>
            {enabled && (
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-300 mt-2">
                {lang === 'ko' ? '실시간 매매 알림 활성화됨' : 'Real-time trading notifications enabled'}
              </p>
            )}
          </div>

          {enabled && (
            <>
              {/* Set Time Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                    {lang === 'ko' ? '설정된 시간' : 'Set Time'}
                  </span>
                  <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                    ({selectedHours.length}/{maxAlarms})
                  </span>
                </div>

                {/* Selected Times List */}
                {selectedHours.length > 0 && (
                  <div className="space-y-2">
                    {selectedHours.map((time) => (
                      <div
                        key={time}
                        className="bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/5 flex items-center justify-between"
                      >
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {formatToAMPM(time, lang)}
                        </span>
                        <button
                          onClick={() => removeTime(time)}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Time Section - Only show if not all slots filled */}
              {!isAllSlotsFilled && (
                <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4 backdrop-blur-sm">
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest block">
                    {lang === 'ko' ? '시간 추가' : 'Add Time'}
                  </span>

                  {/* Period Selector (AM/PM) */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                      {lang === 'ko' ? '오전/오후' : 'Period'}
                    </label>
                    <div className="flex gap-2">
                      {(['AM', 'PM'] as const).map((p) => (
                        <button key={p} onClick={() => setPeriod(p)} className={`flex-1 ${selectableBtnClass(period === p)}`}>
                          {lang === 'ko' ? (p === 'AM' ? '오전' : '오후') : p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hour Selector (0-11) */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                      {lang === 'ko' ? '시' : 'Hour'}
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {HOURS.map((hour) => (
                        <button key={hour} onClick={() => setSelectedHour(hour)} className={`text-[11px] ${selectableBtnClass(selectedHour === hour)}`}>
                          {hour}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Minute Selector */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                      {lang === 'ko' ? '분' : 'Minute'}
                    </label>
                    {isInTossApp && TDSMenu ? (
                      <TDSMenu
                        open={minuteMenuOpen}
                        onOpen={() => setMinuteMenuOpen(true)}
                        onClose={() => setMinuteMenuOpen(false)}
                        placement="bottom"
                      >
                        <TDSMenu.Trigger>
                          <button className="w-full p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-slate-900 dark:text-white text-sm font-black cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-colors focus:ring-2 focus:ring-blue-500/50 outline-none flex items-center justify-between">
                            <span>{selectedMinute}{lang === 'ko' ? '분' : ' min'}</span>
                            <ChevronDown size={16} className="text-slate-400" />
                          </button>
                        </TDSMenu.Trigger>
                        <TDSMenu.Dropdown>
                          <TDSMenu.Header>{lang === 'ko' ? '10분 단위 설정' : '10-minute Interval'}</TDSMenu.Header>
                          {MINUTES.map((minute) => (
                            <TDSMenu.DropdownCheckItem
                              key={minute}
                              checked={selectedMinute === minute}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedMinute(minute);
                                  setMinuteMenuOpen(false);
                                }
                              }}
                            >
                              {minute}{lang === 'ko' ? '분' : ' min'}
                            </TDSMenu.DropdownCheckItem>
                          ))}
                        </TDSMenu.Dropdown>
                      </TDSMenu>
                    ) : (
                      <CustomDropdown
                        value={selectedMinute}
                        options={MINUTES.map(m => ({ value: m, label: `${m}${lang === 'ko' ? '분' : ' min'}` }))}
                        onChange={(value) => setSelectedMinute(value)}
                        header={lang === 'ko' ? '10분 단위 설정' : '10-minute Interval'}
                        className="w-full"
                      />
                    )}
                  </div>

                  {/* Info Message */}
                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-600/10 rounded-xl border border-blue-200 dark:border-blue-500/20">
                    <Info size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] font-medium text-slate-700 dark:text-slate-200">
                      {lang === 'ko' 
                        ? '현재 10분 단위로만 선택이 가능합니다.' 
                        : 'Currently, only 10-minute intervals can be selected.'}
                    </p>
                  </div>

                  {/* Add Button */}
                  <button
                    onClick={addTime}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <Plus size={14} />
                    {lang === 'ko' ? '추가' : 'Add'}
                  </button>
                </div>
              )}

              {/* Premium Notice - Show when all slots filled */}
              {isAllSlotsFilled && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-600/20 dark:to-purple-600/20 p-4 rounded-xl border border-blue-200 dark:border-blue-500/30 flex items-center gap-3">
                  <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={18} />
                  <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    {lang === 'ko' 
                      ? '더 많은 알람 설정은 추후 확장 예정입니다.' 
                      : 'More alarm settings will be available in future updates.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer - 하단 고정 */}
        <div className="p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#080B15] shrink-0">
          <button 
            onClick={handleSave}
            className="w-full py-4 md:py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Clock size={16} />
            {lang === 'ko' ? '설정 저장' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlarmModal;
