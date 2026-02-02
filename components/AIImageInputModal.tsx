
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Portfolio, Trade } from '../types';
import { I18N } from '../constants';
import { X, Camera, Upload, Clipboard, Sparkles, ChevronRight } from 'lucide-react';
import { analyzeTradeScreenshot, RecognizedTradeItem } from '../services/geminiService';

interface AIImageInputModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  geminiApiKey?: string | null;
  onClose: () => void;
  onSave: (trades: Trade[]) => void;
}

type Step = 'upload' | 'scanning' | 'result' | 'error';

const AIImageInputModal: React.FC<AIImageInputModalProps> = ({ lang, portfolio, geminiApiKey, onClose, onSave }) => {
  const t = I18N[lang];
  const [step, setStep] = useState<Step>('upload');
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/png');
  const [recognizedTrades, setRecognizedTrades] = useState<RecognizedTradeItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      setImageData(data);
      setImageMime(file.type || 'image/png');
      setStep('upload');
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
      }
    },
    [handleFile]
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const onStartScan = async () => {
    if (!imageData) return;
    setStep('scanning');
    setErrorMessage(null);
    try {
      const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      const result = await analyzeTradeScreenshot(base64, imageMime, geminiApiKey ? { apiKey: geminiApiKey } : undefined);
      if (result && result.trades.length > 0) {
        setRecognizedTrades(result.trades);
        setStep('result');
      } else {
        setErrorMessage(t.aiScanError);
        setStep('error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'RATE_LIMIT') {
        setErrorMessage(t.aiScanRateLimit);
      } else {
        setErrorMessage(t.aiScanError);
      }
      setStep('error');
    }
  };

  const toTrade = (r: RecognizedTradeItem, index: number): Trade => {
    const feeRate = portfolio.feeRate ?? 0.25;
    const fee =
      r.fee != null && r.fee >= 0
        ? r.fee
        : r.price * r.quantity * (feeRate / 100) + (r.type === 'sell' ? r.price * r.quantity * 0.00003 : 0);
    return {
      id: `ai-${Date.now()}-${index}`,
      type: r.type,
      stock: r.stock,
      date: r.date || new Date().toISOString().split('T')[0],
      price: r.price,
      quantity: r.quantity,
      fee: Number(fee.toFixed(4)),
      isMOC: r.isMOC,
    };
  };

  const handleConfirmSave = () => {
    const trades = recognizedTrades.map((r, i) => toTrade(r, i));
    onSave(trades);
    onClose();
  };

  const resetToUpload = () => {
    setStep('upload');
    setImageData(null);
    setRecognizedTrades([]);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)]"
        style={{ touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-600 dark:bg-indigo-500/90 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Camera size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t.aiScan}</h2>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t.aiScanSub}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 md:p-8 flex-1 overflow-y-auto overscroll-contain space-y-6">
          {step === 'upload' && (
            <>
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-[1.5rem] p-8 md:p-10 flex flex-col items-center justify-center gap-4 min-h-[200px] cursor-pointer hover:border-indigo-500/50 dark:hover:border-indigo-400/30 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = '';
                  }}
                />
                <Upload size={36} className="text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 text-center">
                  {t.dropImageOrClick}
                </p>
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <Clipboard size={14} />
                  <span>{t.pasteShortcut}</span>
                  <span className="opacity-50">|</span>
                  <span>{t.screenshotOnly}</span>
                </div>
                {imageData && (
                  <div className="mt-2 w-full max-h-40 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
                    <img src={imageData} alt="Preview" className="w-full h-full object-contain max-h-36" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <Sparkles size={14} className="text-amber-500 shrink-0" />
                <span>{t.aiScanHint}</span>
              </div>
            </>
          )}

          {step === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-12 gap-6">
              <div className="relative w-48 h-32 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-900">
                {imageData && (
                  <img src={imageData} alt="Scanning" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/30 via-transparent to-indigo-500/30 animate-pulse" />
                <div className="absolute inset-0 flex flex-col justify-between py-2">
                  <div className="w-full h-0.5 bg-indigo-400/80 rounded-full animate-pulse" />
                  <div className="w-full h-0.5 bg-indigo-400/80 rounded-full animate-pulse [animation-delay:0.5s]" />
                  <div className="w-full h-0.5 bg-indigo-400/80 rounded-full animate-pulse [animation-delay:1s]" />
                </div>
              </div>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {lang === 'ko' ? '스크린샷 분석 중…' : 'Analyzing screenshot…'}
              </p>
            </div>
          )}

          {step === 'result' && (
            <>
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                {t.aiRecognizedTrades}
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {recognizedTrades.map((r, i) => (
                  <div
                    key={i}
                    className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/5 p-4 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-xs font-black uppercase ${r.type === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}
                      >
                        {r.type === 'buy' ? t.buy : t.sell}
                      </span>
                      <span className="ml-2 font-black text-slate-800 dark:text-white">{r.stock}</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {r.date} · ${r.price.toFixed(2)} × {r.quantity}
                        {r.fee != null && r.fee > 0 && ` · fee $${r.fee.toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {lang === 'ko' ? '위 내용이 맞다면 아래에서 확인 후 저장해주세요.' : 'If the above is correct, confirm and save below.'}
              </p>
            </>
          )}

          {step === 'error' && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 p-4">
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="p-6 md:p-8 border-t border-slate-200 dark:border-white/5 flex gap-4 bg-slate-50 dark:bg-slate-900/30 shrink-0">
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-4 md:py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                {t.cancel}
              </button>
              <button
                onClick={onStartScan}
                disabled={!imageData}
                className="flex-[2] py-4 md:py-5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs shadow-xl dark:shadow-indigo-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Sparkles size={16} />
                {t.aiScanStart}
              </button>
            </>
          )}
          {step === 'scanning' && (
            <div className="flex-1 py-4 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              {lang === 'ko' ? '잠시만 기다려주세요…' : 'Please wait…'}
            </div>
          )}
          {step === 'result' && (
            <>
              <button
                onClick={resetToUpload}
                className="flex-1 py-4 md:py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleConfirmSave}
                className="flex-[2] py-4 md:py-5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs shadow-xl dark:shadow-indigo-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
              >
                {t.aiConfirmSave}
                <ChevronRight size={16} />
              </button>
            </>
          )}
          {step === 'error' && (
            <>
              <button
                onClick={resetToUpload}
                className="flex-1 py-4 md:py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                {t.cancel}
              </button>
              <button
                onClick={resetToUpload}
                className="flex-[2] py-4 md:py-5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
              >
                {lang === 'ko' ? '다시 시도' : 'Try again'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIImageInputModal;
