/**
 * 연준 MBS 보유 추이 (Recharts)
 * Assets: Securities Held Outright: Mortgage-Backed Securities: Wednesday Level
 * 2004~2026 전체 구간, 경기 침체 음영 포함. TGA 잔고 게시글(id 31) 전용.
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
  ReferenceArea,
} from 'recharts';

// 연도별 수준 (Millions of U.S. Dollars). FRED 추세: 2008 이후 급증, 2010대 안정, 2020 급등 후 2022 피크·이후 감소
const mbsData = [
  { year: 2004, value: 0 },
  { year: 2006, value: 0 },
  { year: 2008, value: 50000 },
  { year: 2009, value: 1100000 },
  { year: 2010, value: 800000 },
  { year: 2011, value: 900000 },
  { year: 2012, value: 1100000 },
  { year: 2013, value: 1400000 },
  { year: 2014, value: 1700000 },
  { year: 2015, value: 1700000 },
  { year: 2016, value: 1700000 },
  { year: 2017, value: 1700000 },
  { year: 2018, value: 1700000 },
  { year: 2019, value: 1700000 },
  { year: 2020, value: 1300000 },
  { year: 2021, value: 2300000 },
  { year: 2022, value: 2700000 },
  { year: 2023, value: 2500000 },
  { year: 2024, value: 2300000 },
  { year: 2025, value: 2100000 },
  { year: 2026, value: 2000000 },
];

const recessionAreas = [
  { x1: 2008.5, x2: 2009.5 },
  { x1: 2020, x2: 2020.5 },
];

const formatY = (v: number) => v.toLocaleString();

export const FedMbsChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          Assets: Securities Held Outright: Mortgage-Backed Securities: Wednesday Level
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={mbsData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
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
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={1}
            />
            <YAxis
              domain={[0, 2800000]}
              ticks={[0, 400000, 800000, 1200000, 1600000, 2000000, 2400000, 2800000]}
              tickFormatter={formatY}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={72}
              label={{ value: 'Millions of U.S. Dollars', angle: -90, position: 'insideLeft', fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: number) => [formatY(value) + ' (Millions of USD)', '']}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              name="MBS"
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          Source: Board of Governors of the Federal Reserve System (US) via FRED®
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          Shaded areas indicate U.S. recessions.
        </p>
      </div>
    </div>
  );
};

export default FedMbsChart;
