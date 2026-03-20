'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { AppLang, OrderLevel } from '../types';
import { toDisplayNumber, toFixedMoney } from '../utils/vrBandStrategy';
import { VR_MODAL_LABELS, VR_TAB_ICONS } from '../constants/vrMessages';

type TabId = 'sell' | 'buy';

const STEP_CURRENT_STATE = 0;

/** 테마(색상·라벨 키·아이콘)만 보관. 데이터 선택은 컴포넌트 본문에서 수행. */
const TABLE_CONFIG: Record<
  TabId,
  {
    tabLabelKey: 'tabSell' | 'tabBuy';
    tabIcon: string;
    activeTextClass: string;
    activeBorderClass: string;
    inactiveClass: string;
  }
> = {
  sell: {
    tabLabelKey: 'tabSell',
    tabIcon: VR_TAB_ICONS.sell,
    activeTextClass: 'text-red-600 dark:text-red-400',
    activeBorderClass: 'border-red-600 dark:border-red-400',
    inactiveClass: 'text-gray-500 dark:text-gray-400 border-transparent',
  },
  buy: {
    tabLabelKey: 'tabBuy',
    tabIcon: VR_TAB_ICONS.buy,
    activeTextClass: 'text-blue-600 dark:text-blue-400',
    activeBorderClass: 'border-blue-600 dark:border-blue-400',
    inactiveClass: 'text-gray-500 dark:text-gray-400 border-transparent',
  },
};

/** 테이블에 노출하는 컬럼 (타입 엄격화). */
type OrderTableColumnId = 'step' | 'price' | 'qty' | 'sharesAfter' | 'poolAfter';

type LabelsLang = (typeof VR_MODAL_LABELS)[AppLang];

/** 데이터 드리븐 테이블: 컬럼 추가 시 이 배열만 수정하면 됨. */
const TABLE_COLUMNS: Array<{
  id: OrderTableColumnId;
  labelKey: keyof (typeof VR_MODAL_LABELS)['ko'];
  align: 'left' | 'right';
  format?: 'integer' | 'decimal';
  headerClass?: string;
  cellClass?: string;
  hideOnStepZero?: boolean;
  renderCell?: (order: OrderLevel, t: LabelsLang) => React.ReactNode;
}> = [
  {
    id: 'step',
    labelKey: 'step',
    align: 'center',
    headerClass: 'pr-2',
    cellClass: 'pr-2',
    renderCell: (order, t) => {
      if (order.step === STEP_CURRENT_STATE) {
        return (
          <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 whitespace-nowrap">
            {t.currentState}
          </span>
        );
      }
      const stepVal = toDisplayNumber(order.step);
      return (
        <>
          <span className="font-medium">{stepVal === null ? '-' : stepVal}</span>
          {order.isBuffer && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
              {t.guide}
            </span>
          )}
        </>
      );
    },
  },
  {
    id: 'price',
    labelKey: 'price',
    align: 'center',
    format: 'decimal',
    hideOnStepZero: true,
  },
  {
    id: 'qty',
    labelKey: 'qty',
    align: 'center',
    hideOnStepZero: true,
  },
  {
    id: 'sharesAfter',
    labelKey: 'sharesAfter',
    align: 'center',
    headerClass: 'pl-2',
    cellClass: 'pl-2',
  },
  { id: 'poolAfter', labelKey: 'poolAfter', align: 'center', format: 'decimal' },
];

const PriceCell = ({ val }: { val: number }) => (
  <span className="font-mono">{toFixedMoney(val).toLocaleString()}</span>
);

function defaultCellContent(
  order: OrderLevel,
  column: { id: OrderTableColumnId; format?: 'integer' | 'decimal' }
): React.ReactNode {
  const raw = order[column.id];
  const n = toDisplayNumber(raw);
  if (n === null) return '-';
  if (column.format === 'decimal') return <PriceCell val={n} />;
  if (column.format === 'integer') return Math.round(n);
  return n;
}

function renderCellContent(
  order: OrderLevel,
  col: (typeof TABLE_COLUMNS)[number],
  labels: LabelsLang
): React.ReactNode {
  if (col.renderCell) {
    return col.renderCell(order, labels);
  }
  if (col.hideOnStepZero && order.step === STEP_CURRENT_STATE) {
    return '-';
  }
  return defaultCellContent(order, { id: col.id, format: col.format });
}

function VrOrderTable({
  orders,
  labels,
}: {
  orders: OrderLevel[];
  labels: LabelsLang;
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/10">
            {TABLE_COLUMNS.map((col) => (
              <th
                key={col.id}
                className={`py-2 px-2 text-slate-500 dark:text-slate-400 font-semibold text-center align-middle ${col.headerClass ?? ''}`}
              >
                {labels[col.labelKey]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => {
            const safeKey = `${order.step ?? 'invalid'}-${order.price ?? 'invalid'}-${idx}`;
            const rowClass = order.isBuffer
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-slate-800 dark:text-slate-200';
            const isCurrentState = order.step === STEP_CURRENT_STATE;
            return (
              <tr
                key={safeKey}
                className={`border-b border-slate-100 dark:border-white/5 ${rowClass} ${
                  isCurrentState ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
                }`}
              >
                {TABLE_COLUMNS.map((col) => (
                  <td
                    key={col.id}
                    className={`py-2.5 px-2 font-mono text-center align-middle ${col.cellClass ?? ''}`}
                  >
                    {renderCellContent(order, col, labels)}
                  </td>
                ))}
              </tr>
            );
          })}
          {orders.length <= 1 && (
            <tr>
              <td
                colSpan={TABLE_COLUMNS.length}
                className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm font-medium"
              >
                {labels.emptyOrder}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function VrOrderModal({
  isOpen,
  onClose,
  buyOrders,
  sellOrders,
  lang = 'ko',
}: {
  isOpen: boolean;
  onClose: () => void;
  buyOrders: OrderLevel[];
  sellOrders: OrderLevel[];
  lang?: AppLang;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('buy');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const t = VR_MODAL_LABELS[lang];
  const orders = activeTab === 'sell' ? sellOrders : buyOrders;

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md cursor-pointer"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClose();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={lang === 'ko' ? '모달 닫기' : 'Close modal'}
      />
      <div className="relative flex w-full max-w-md max-h-[85vh] flex-col bg-white dark:bg-[#161d2a] rounded-[2rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden my-8">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{t.title}</h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md whitespace-nowrap">
                {lang === 'ko' ? '이번 사이클 고정' : 'Fixed for this cycle'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex mt-4 gap-0 border-b border-slate-200 dark:border-white/10">
            {(['sell', 'buy'] as const).map((tabId) => {
              const tabConfig = TABLE_CONFIG[tabId];
              const isActive = activeTab === tabId;
              const textClass = isActive ? tabConfig.activeTextClass : tabConfig.inactiveClass;
              const borderClass = isActive ? `border-b-2 ${tabConfig.activeBorderClass}` : 'border-b-2 border-transparent';
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveTab(tabId)}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors ${textClass} ${borderClass}`}
                >
                  {t[tabConfig.tabLabelKey]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-6 min-h-[12rem] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full">
          <VrOrderTable orders={orders} labels={t} />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
