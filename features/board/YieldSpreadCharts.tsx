/**
 * 장단기 금리차 추이 (10Y-2Y, 10Y-3M) — FRED 스타일
 * '미국 재정 적자와 국채 공급: 2026년 장기 금리가 주식에 주는 신호' 게시글 전용.
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';

// 연도별 근사 데이터 (10Y-2Y, 10Y-3M %). 역사적 역전·회복 구간 반영, 2025년 11월 말 0.55 / 0.16
const spreadData = [
  { year: 1985, spread10y2y: 2.2, spread10y3m: 2.5 },
  { year: 1987, spread10y2y: 1.0, spread10y3m: 0.8 },
  { year: 1989, spread10y2y: 0.5, spread10y3m: 0.2 },
  { year: 1990, spread10y2y: -0.2, spread10y3m: -0.5 },
  { year: 1991, spread10y2y: 1.8, spread10y3m: 2.0 },
  { year: 1995, spread10y2y: 0.2, spread10y3m: -0.1 },
  { year: 1998, spread10y2y: 0.5, spread10y3m: 0.3 },
  { year: 2000, spread10y2y: 0.8, spread10y3m: 0.5 },
  { year: 2001, spread10y2y: -0.2, spread10y3m: -0.8 },
  { year: 2003, spread10y2y: 2.5, spread10y3m: 2.8 },
  { year: 2005, spread10y2y: 0.1, spread10y3m: -0.3 },
  { year: 2006, spread10y2y: 0.0, spread10y3m: -0.2 },
  { year: 2007, spread10y2y: -0.5, spread10y3m: -0.9 },
  { year: 2008, spread10y2y: 1.2, spread10y3m: 1.5 },
  { year: 2009, spread10y2y: 2.8, spread10y3m: 3.2 },
  { year: 2010, spread10y2y: 2.6, spread10y3m: 2.9 },
  { year: 2012, spread10y2y: 1.8, spread10y3m: 2.0 },
  { year: 2015, spread10y2y: 1.5, spread10y3m: 1.6 },
  { year: 2018, spread10y2y: 0.3, spread10y3m: 0.2 },
  { year: 2019, spread10y2y: -0.2, spread10y3m: -0.5 },
  { year: 2020, spread10y2y: 0.7, spread10y3m: 0.6 },
  { year: 2022, spread10y2y: -0.8, spread10y3m: -0.5 },
  { year: 2023, spread10y2y: -0.5, spread10y3m: -0.2 },
  { year: 2024, spread10y2y: 0.2, spread10y3m: 0.1 },
  { year: 2025, spread10y2y: 0.55, spread10y3m: 0.16 },
];

// 미국 경기 침체 구간 (연도 기준, ReferenceArea용)
const recessionAreas = [
  { x1: 1990, x2: 1991 },
  { x1: 2001, x2: 2001.5 },
  { x1: 2007.5, x2: 2009.5 },
  { x1: 2020, x2: 2020.35 },
];

const formatPct = (v: number) => `${v}%`;

export const YieldSpreadCharts: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
          &lt;참고&gt; 장단기 금리차
        </p>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          장단기 금리차 추이
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={spreadData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            {recessionAreas.map((area, i) => (
              <ReferenceArea
                key={i}
                x1={area.x1}
                x2={area.x2}
                fill="#94a3b8"
                fillOpacity={0.25}
              />
            ))}
            <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
            <XAxis
              dataKey="year"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              ticks={[1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              domain={[-2, 5]}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              tickFormatter={formatPct}
              label={{ value: 'Percent', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
              width={36}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatPct(value),
                name === 'spread10y2y' ? '10Y-2Y' : '10Y-3M',
              ]}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) =>
                value === 'spread10y2y'
                  ? '10Y 국채 - 2Y 국채 (2025.11 말 0.55%)'
                  : '10Y 국채 - 3M 국채 (2025.11 말 0.16%)'
              }
            />
            <Line
              type="monotone"
              dataKey="spread10y2y"
              name="spread10y2y"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="spread10y3m"
              name="spread10y3m"
              stroke="#16a34a"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
          Source: Federal Reserve Bank of St. Louis via FRED®. Shaded areas indicate U.S. recessions.
        </p>
      </div>
    </div>
  );
};

export default YieldSpreadCharts;
