
import React, { useState, useEffect } from 'react';
import { Portfolio, AlarmConfig } from '../types';
import { X, ToggleRight, ToggleLeft, Clock, Plus, Trash2, Info } from 'lucide-react';

interface AlarmModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (config: AlarmConfig) => void;
}

// 유료화 대비 확장 가능한 상수
const MINUTE_STEP = 10; // 무료: 10분 단위, 프리미엄: 1분 단위로 변경 가능
const MAX_SLOTS = 2; // 무료: 2개, 프리미엄: 3개 이상으로 확장 가능

const AlarmModal: React.FC<AlarmModalProps> = ({ lang, portfolio, onClose, onSave }) => {
  const initialConfig = portfolio.alarmconfig || {
    enabled: false,
    selectedHours: [],
  };

  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [selectedHours, setSelectedHours] = useState<string[]>(
    initialConfig.selectedHours?.slice(0, MAX_SLOTS) || []
  );

  // AM/PM 선택 상태
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  
  // 시간 선택 상태 (0-11)
  const [selectedHour, setSelectedHour] = useState<string>('09');
  
  // 분 선택 상태
  const [selectedMinute, setSelectedMinute] = useState<string>('00');

  // Hour 옵션: 0-11
  const hours = Array.from({ length: 12 }).map((_, i) => i.toString().padStart(2, '0'));
  
  // Minute 옵션: 00, 10, 20, 30, 40, 50
  const minutes = Array.from({ length: 6 }).map((_, i) => (i * MINUTE_STEP).toString().padStart(2, '0'));

  // 기존 선택된 시간을 로드할 때 AM/PM과 hour를 추출
  useEffect(() => {
    if (selectedHours.length > 0) {
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
    }
  }, []);

  // AM/PM과 hour(0-11)를 24시간 형식으로 변환
  const convertTo24Hour = (period: 'AM' | 'PM', hour: string): string => {
    const hourNum = parseInt(hour, 10);
    if (period === 'AM') {
      return hour === '00' ? '00' : hour.padStart(2, '0');
    } else {
      // PM: 12-23
      if (hourNum === 0) return '12';
      return (hourNum + 12).toString().padStart(2, '0');
    }
  };

  // 24시간 형식을 AM/PM 형식으로 변환 (표시용)
  const formatToAMPM = (time24: string): string => {
    const [hourStr, minuteStr] = time24.split(':');
    const hour = parseInt(hourStr, 10);
    
    if (hour === 0) {
      return lang === 'ko' ? `오전 00:${minuteStr}` : `12:${minuteStr} AM`;
    } else if (hour < 12) {
      return lang === 'ko' ? `오전 ${hour.toString().padStart(2, '0')}:${minuteStr}` : `${hour}:${minuteStr} AM`;
    } else if (hour === 12) {
      return lang === 'ko' ? `오후 12:${minuteStr}` : `12:${minuteStr} PM`;
    } else {
      const pmHour = hour - 12;
      return lang === 'ko' ? `오후 ${pmHour.toString().padStart(2, '0')}:${minuteStr}` : `${pmHour}:${minuteStr} PM`;
    }
  };

  const addTime = () => {
    const hour24 = convertTo24Hour(period, selectedHour);
    const timeString = `${hour24}:${selectedMinute}`;
    
    if (selectedHours.includes(timeString)) {
      // 이미 선택된 시간이면 제거
      setSelectedHours(selectedHours.filter(h => h !== timeString));
      return;
    }

    if (selectedHours.length >= MAX_SLOTS) {
      // 프리미엄 안내
      alert(lang === 'ko' ? '프리미엄 전용 기능입니다.' : 'This is a premium feature.');
      return;
    }

    setSelectedHours([...selectedHours, timeString].sort());
  };

  const removeTime = (timeString: string) => {
    setSelectedHours(selectedHours.filter(h => h !== timeString));
  };

  const handleSave = () => {
    onSave({ enabled, selectedHours });
  };

  const isAllSlotsFilled = selectedHours.length >= MAX_SLOTS;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white dark:bg-[#080B15] rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-[#080B15]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Clock className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{lang === 'ko' ? '알람 설정' : 'Alarm Settings'}</h2>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest mt-0.5">
                DUAL SLOT SYSTEM
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

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
          
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
                <button onClick={() => setEnabled(!enabled)} className="transition-all active:scale-95">
                  {enabled ? <ToggleRight size={36} className="text-blue-600" /> : <ToggleLeft size={36} className="text-slate-400 dark:text-slate-500" />}
                </button>
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
                    ({selectedHours.length}/{MAX_SLOTS})
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
                          {formatToAMPM(time)}
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
                      <button
                        onClick={() => setPeriod('AM')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${
                          period === 'AM'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'
                        }`}
                      >
                        {lang === 'ko' ? '오전' : 'AM'}
                      </button>
                      <button
                        onClick={() => setPeriod('PM')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${
                          period === 'PM'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'
                        }`}
                      >
                        {lang === 'ko' ? '오후' : 'PM'}
                      </button>
                    </div>
                  </div>

                  {/* Hour Selector (0-11) */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                      {lang === 'ko' ? '시' : 'Hour'}
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {hours.map((hour) => (
                        <button
                          key={hour}
                          onClick={() => setSelectedHour(hour)}
                          className={`py-3 rounded-xl text-[11px] font-black transition-all ${
                            selectedHour === hour
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                              : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'
                          }`}
                        >
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
                    <div className="relative">
                      <select
                        value={selectedMinute}
                        onChange={(e) => setSelectedMinute(e.target.value)}
                        className="w-full p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-slate-900 dark:text-white text-sm font-black appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-colors focus:ring-2 focus:ring-blue-500/50 outline-none"
                      >
                        {minutes.map((minute) => (
                          <option key={minute} value={minute} className="bg-white dark:bg-[#080B15]">
                            {minute}{lang === 'ko' ? '분' : ' min'}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <X size={16} className="text-slate-400 dark:text-slate-400 rotate-45" />
                      </div>
                    </div>
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

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#080B15]">
          <button 
            onClick={handleSave}
            className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
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
