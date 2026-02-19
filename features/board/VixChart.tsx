/**
 * 뉴욕주식시장 변동성지수(VIX) 6개월 추이 (Recharts)
 * INDEXCBOE: VIX. 이미지 추정치 기반 근사 데이터.
 * VIX 지수 게시글(id 33) 전용.
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// 6개월 구간 근사 데이터 (시각적 추정·주요 변곡점 반영). 2025-08 말 ~ 2026-02-18
const vixData = [
  { date: '2025-08-31', label: '2025년 8월', vix: 15.5 },
  { date: '2025-09-07', label: '2025년 9월', vix: 17.2 },
  { date: '2025-09-15', label: '2025년 9월', vix: 17.0 },
  { date: '2025-10-01', label: '2025년 10월', vix: 16.2 },
  { date: '2025-10-24', label: '2025년 10월', vix: 16.37 },
  { date: '2025-10-28', label: '2025년 10월', vix: 25.5 },
  { date: '2025-10-31', label: '2025년 10월', vix: 25.8 },
  { date: '2025-11-15', label: '2025년 11월', vix: 20.0 },
  { date: '2025-11-30', label: '2025년 11월', vix: 16.0 },
  { date: '2025-12-15', label: '2025년 12월', vix: 14.0 },
  { date: '2025-12-20', label: '2025년 12월', vix: 14.2 },
  { date: '2025-12-31', label: '2025년 12월', vix: 18.0 },
  { date: '2026-01-15', label: '2026년 1월', vix: 21.8 },
  { date: '2026-01-20', label: '2026년 1월', vix: 22.0 },
  { date: '2026-01-31', label: '2026년 1월', vix: 19.0 },
  { date: '2026-02-10', label: '2026년 2월', vix: 18.5 },
  { date: '2026-02-18', label: '2026년 2월', vix: 19.62 },
];

const formatY = (v: number) => (v == null ? '' : String(v));
const formatTooltipLabel = (label: string) => {
  const d = label && label.slice(0, 10);
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일`;
};

export const VixChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            뉴욕주식시장 변동성지수 (New York Stock Market Volatility Index)
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">INDEXCBOE: VIX</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 mb-4">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">19.62</span>
          <span className="text-sm text-rose-600 dark:text-rose-400 font-medium">+4.63 (30.89%) ↑</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">지난 6개월</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={vixData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="date"
              tickFormatter={(val: string) => {
                if (!val || val.length < 7) return val;
                const [y, m] = val.split('-');
                return y && m ? `${y}년 ${Number(m)}월` : val;
              }}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={3}
            />
            <YAxis
              domain={[10, 30]}
              ticks={[10, 15, 20, 25, 30]}
              tickFormatter={formatY}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={28}
            />
            <Tooltip
              formatter={(value: number) => [value, 'VIX']}
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Line
              type="monotone"
              dataKey="vix"
              stroke="#dc2626"
              strokeWidth={2}
              dot={{ r: 2, fill: '#dc2626' }}
              activeDot={{ r: 4, fill: '#dc2626' }}
              name="VIX"
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400">
          <div><span className="text-slate-500 dark:text-slate-500">시가</span> 19.78</div>
          <div><span className="text-slate-500 dark:text-slate-500">최고</span> 20.34</div>
          <div><span className="text-slate-500 dark:text-slate-500">최저</span> 18.48</div>
          <div><span className="text-slate-500 dark:text-slate-500">전일 종가</span> 20.29</div>
          <div><span className="text-slate-500 dark:text-slate-500">52주 최고</span> 60.13</div>
          <div><span className="text-slate-500 dark:text-slate-500">52주 최저</span> 13.38</div>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
          데이터 기준: 2월 18일 PM 3:15 GMT-6. 위 차트는 6개월 구간 추이를 근사한 것입니다.
        </p>
      </div>
    </div>
  );
};

export default VixChart;
