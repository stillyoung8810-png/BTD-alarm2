/**
 * 커스텀 드롭다운 컴포넌트
 * 토스 TDS Menu와 유사한 디자인을 일반 웹 환경에서 제공합니다.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Lock } from 'lucide-react';

interface CustomDropdownProps {
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean; badge?: string; tooltip?: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  header?: string;
  className?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = '선택하세요',
  header,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span>{displayText}</span>
        <ChevronDown 
          size={16} 
          className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-[#080B15] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          {header && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                {header}
              </span>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const isSelected = value === option.value;
              const isDisabled = !!option.disabled;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (isDisabled) return;
                    handleSelect(option.value);
                  }}
                  title={option.tooltip}
                  disabled={isDisabled}
                  className={`w-full px-4 py-3 text-left text-sm font-bold transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : isDisabled
                      ? 'text-slate-400 dark:text-slate-600 bg-transparent cursor-not-allowed opacity-60'
                      : 'text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{option.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {isDisabled && (
                      <Lock size={14} className="text-slate-400 dark:text-slate-600" />
                    )}
                    {option.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-200/60 dark:bg-white/10 text-slate-600 dark:text-slate-400 border border-slate-300/40 dark:border-white/10">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && (
                      <svg
                        className="w-5 h-5 text-blue-600 dark:text-blue-400"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
