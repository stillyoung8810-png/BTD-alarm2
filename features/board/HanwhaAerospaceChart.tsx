/**
 * 한화에어로스페이스 6개월 주가 추이 (Recharts)
 * KRX: 012450. 2025년 9월 ~ 2026년 2월 근사 데이터. 방위산업 게시글(id 35) 전용.
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

// 6개월 구간 근사 데이터 (이미지 추세: 9월~10월 상승·고점, 11월~12월 초 하락·저점, 12/15 툴팁 908,000, 12월 말~1월 급등·고점, 2월 조정)
const priceData = [
  { date: '2025-09-01', price: 820000 },
  { date: '2025-09-15', price: 900000 },
  { date: '2025-10-01', price: 980000 },
  { date: '2025-10-15', price: 1050000 },
  { date: '2025-11-01', price: 980000 },
  { date: '2025-11-15', price: 920000 },
  { date: '2025-12-01', price: 880000 },
  { date: '2025-12-15', price: 908000 },
  { date: '2025-12-22', price: 1020000 },
  { date: '2026-01-01', price: 1100000 },
  { date: '2026-01-15', price: 1300000 },
  { date: '2026-01-28', price: 1350000 },
  { date: '2026-02-10', price: 1250000 },
  { date: '2026-02-19', price: 1143000 },
];

const formatX = (dateStr: string) => {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}년 ${m}월`;
};

export const HanwhaAerospaceChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              한화에어로스페이스 (Hanwha Aerospace)
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">KRX: 012450</span>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">1,143,000</span>
          <span className="text-sm text-rose-600 dark:text-rose-400 font-medium">+316,000 (38.21%) ↑</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">6개월</span>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">2월 19일 PM 2:31 GMT+9</p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={priceData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatX}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={0}
            />
            <YAxis
              domain={[800000, 1400000]}
              ticks={[800000, 1000000, 1200000, 1400000]}
              tickFormatter={(v) => `${v / 10000}만`}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={44}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString() + ' 원', '주가']}
              labelFormatter={(label: string) =>
                label ? `${label.slice(0, 4)}년 ${label.slice(5, 7)}월 ${label.slice(8, 10)}일` : ''
              }
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3, fill: '#2563eb' }}
              activeDot={{ r: 5, fill: '#2563eb' }}
              name="주가"
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400">
          <div><span className="text-slate-500 dark:text-slate-500">시가</span> 1,199,000</div>
          <div><span className="text-slate-500 dark:text-slate-500">최고</span> 1,199,000</div>
          <div><span className="text-slate-500 dark:text-slate-500">최저</span> 1,131,000</div>
          <div><span className="text-slate-500 dark:text-slate-500">시가총액</span> 58.94조</div>
          <div><span className="text-slate-500 dark:text-slate-500">주가수익률(PER)</span> 20.63</div>
          <div><span className="text-slate-500 dark:text-slate-500">52주 최고</span> 1,398,000</div>
          <div><span className="text-slate-500 dark:text-slate-500">52주 최저</span> 584,199</div>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
          위 차트는 6개월 구간 추이를 근사한 것입니다. (단위: 원)
        </p>
      </div>
    </div>
  );
};

export default HanwhaAerospaceChart;
