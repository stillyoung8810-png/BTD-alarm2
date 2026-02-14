/**
 * 미국 인플레이션 예상치 추이 (Recharts)
 * 5년/10년 손익분기 인플레이션율, 5년·5년 선도 인플레이션 기대율
 * '2026년 글로벌 인플레이션과 주식 시장' 게시글 전용.
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

// 연도별 근사 데이터 (%). FRED 스타일 추세 반영: 2008·2020 침체, 2022 초 peak, 2026년 1월 값 반영
const inflationData = [
  { year: 2004, breakeven5y: 2.4, breakeven10y: 2.3, forward5y5y: 2.2 },
  { year: 2006, breakeven5y: 2.5, breakeven10y: 2.4, forward5y5y: 2.3 },
  { year: 2008, breakeven5y: -1.8, breakeven10y: -0.8, forward5y5y: 0.3 },
  { year: 2010, breakeven5y: 1.9, breakeven10y: 1.8, forward5y5y: 1.9 },
  { year: 2012, breakeven5y: 2.2, breakeven10y: 2.15, forward5y5y: 2.05 },
  { year: 2014, breakeven5y: 2.0, breakeven10y: 1.95, forward5y5y: 1.9 },
  { year: 2016, breakeven5y: 1.7, breakeven10y: 1.65, forward5y5y: 1.65 },
  { year: 2018, breakeven5y: 2.0, breakeven10y: 1.95, forward5y5y: 1.9 },
  { year: 2020, breakeven5y: 0.15, breakeven10y: 0.1, forward5y5y: 1.0 },
  { year: 2022, breakeven5y: 3.5, breakeven10y: 3.0, forward5y5y: 2.7 },
  { year: 2024, breakeven5y: 2.35, breakeven10y: 2.3, forward5y5y: 2.22 },
  { year: 2026, breakeven5y: 2.46, breakeven10y: 2.32, forward5y5y: 2.18 },
];

const recessionAreas = [
  { x1: 2007.5, x2: 2009.5 },
  { x1: 2020, x2: 2020.5 },
];

const formatYear = (v: number) => `${v}`;
const formatPct = (v: number) => `${v}%`;

const NAMES = {
  breakeven5y: '5-Year Breakeven Inflation Rate',
  breakeven10y: '10-Year Breakeven Inflation Rate',
  forward5y5y: '5-Year, 5-Year Forward Inflation Expectation Rate',
};

export const InflationExpectationsChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          미국 인플레이션 예상치 추이
        </h3>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={inflationData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
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
            <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1} strokeOpacity={0.8} />
            <XAxis
              dataKey="year"
              tickFormatter={formatYear}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              label={{ value: 'Year', position: 'insideBottom', offset: -4, fontSize: 11 }}
            />
            <YAxis
              domain={[-3, 4]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={36}
              label={{ value: 'Percent', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatPct(value), NAMES[name as keyof typeof NAMES]]}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(label) => NAMES[label as keyof typeof NAMES]}
            />
            <Line
              type="monotone"
              dataKey="breakeven5y"
              name="breakeven5y"
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray=""
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="breakeven10y"
              name="breakeven10y"
              stroke="#16a34a"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="forward5y5y"
              name="forward5y5y"
              stroke="#ea580c"
              strokeWidth={2}
              strokeDasharray="2 2"
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          Source: Federal Reserve Bank of St. Louis via FRED®
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          Shaded areas indicate U.S. recessions.
        </p>
        <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-xs">
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">January 2026, end of period</p>
          <p className="text-blue-600 dark:text-blue-400">5-Year Breakeven Inflation Rate: 2.46</p>
          <p className="text-green-600 dark:text-green-400">10-Year Breakeven Inflation Rate: 2.32</p>
          <p className="text-orange-600 dark:text-orange-400">5-Year, 5-Year Forward Inflation Expectation Rate: 2.18</p>
        </div>
      </div>
    </div>
  );
};

export default InflationExpectationsChart;
