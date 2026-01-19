
import React, { useState } from 'react';
import { Portfolio, AlarmConfig } from '../types';
import { X, ToggleRight, ToggleLeft } from 'lucide-react';

interface AlarmModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (config: AlarmConfig) => void;
}

const AlarmModal: React.FC<AlarmModalProps> = ({ lang, portfolio, onClose, onSave }) => {
  const initialConfig = portfolio.alarmconfig || {
    enabled: false,
    selectedHours: [],
    mode: 'once',
    repeatCount: 1
  };

  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [selectedHours, setSelectedHours] = useState<string[]>(initialConfig.selectedHours);
  const [mode, setMode] = useState<'once' | 'repeat'>(initialConfig.mode);
  const [repeatCount, setRepeatCount] = useState(initialConfig.repeatCount);

  const hours = Array.from({ length: 24 }).map((_, i) => `${i.toString().padStart(2, '0')}:00`);

  const toggleHour = (hour: string) => {
    if (selectedHours.includes(hour)) {
      setSelectedHours(selectedHours.filter(h => h !== hour));
    } else {
      if (selectedHours.length < 3) {
        setSelectedHours([...selectedHours, hour].sort());
      } else {
        alert(lang === 'ko' ? "최대 3개의 시간만 선택할 수 있습니다." : "You can select up to 3 times.");
      }
    }
  };

  const handleSave = () => {
    onSave({ enabled, selectedHours, mode, repeatCount });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2rem] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">{lang === 'ko' ? '알람설정' : 'Alarm Settings'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto scrollbar-hide">
          
          {/* Enabled Toggle */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">{lang === 'ko' ? '알람 사용' : 'Use Alarm'}</span>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-black ${enabled ? 'text-blue-500' : 'text-slate-500 dark:text-slate-600'}`}>
                {enabled ? 'ON' : 'OFF'}
              </span>
              <button onClick={() => setEnabled(!enabled)} className="transition-all">
                {enabled ? <ToggleRight size={36} className="text-blue-500" /> : <ToggleLeft size={36} className="text-slate-400 dark:text-slate-700" />}
              </button>
            </div>
          </div>

          {enabled && (
            <>
              {/* Time Grid */}
              <div className="space-y-4">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '알람 시간' : 'Alarm Times'}</span>
                <div className="grid grid-cols-4 gap-2">
                  {hours.map(hour => {
                    const isSelected = selectedHours.includes(hour);
                    return (
                      <button
                        key={hour}
                        onClick={() => toggleHour(hour)}
                        className={`py-3 rounded-xl text-[11px] font-bold transition-all border ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/20' 
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {hour}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-500 font-medium">
                  {lang === 'ko' ? '최대 3개의 시간을 선택할 수 있습니다. (반복 간격: 1시간)' : 'Select up to 3 times. (Repeat interval: 1 hour)'}
                </p>
              </div>

              {/* Mode Selection */}
              <div className="space-y-4">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '알람 모드' : 'Alarm Mode'}</span>
                <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5">
                  <button 
                    onClick={() => setMode('once')}
                    className={`flex-1 py-4 rounded-xl text-xs font-black transition-all ${mode === 'once' ? 'bg-slate-200 dark:bg-slate-800 text-blue-500 shadow-xl' : 'text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
                  >
                    {lang === 'ko' ? '1번만' : 'Once'}
                  </button>
                  <button 
                    onClick={() => setMode('repeat')}
                    className={`flex-1 py-4 rounded-xl text-xs font-black transition-all ${mode === 'repeat' ? 'bg-slate-200 dark:bg-slate-800 text-blue-500 shadow-xl' : 'text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
                  >
                    {lang === 'ko' ? '반복' : 'Repeat'}
                  </button>
                </div>
              </div>

              {/* Repeat Count */}
              {mode === 'repeat' && (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '반복 횟수 (최대 3번)' : 'Repeat Count (Max 3)'}</span>
                  <input 
                    type="number"
                    min="1"
                    max="3"
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(Math.min(3, Math.max(1, Number(e.target.value))))}
                    className="w-full p-5 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                  <p className="text-[9px] text-slate-500 font-medium">
                    {lang === 'ko' ? '각 시간에 대해 최대 3번까지 반복됩니다. (반복 간격: 1시간)' : 'Repeats up to 3 times for each scheduled time.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-white/5">
          <button 
            onClick={handleSave}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl dark:shadow-xl dark:shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all"
          >
            {lang === 'ko' ? '저장' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlarmModal;
