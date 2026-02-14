/**
 * 세계·한국 생산연령인구·고령인구 구성비 추이 차트 (Recharts)
 * '고령화와 헬스케어·연금 자산' 게시글 전용.
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
} from 'recharts';

// 생산연령인구(15~64세) 구성비 추이 — 이미지 명시값 + 10년 단위 보간
const productiveAgeData = [
  { year: 1970, world: 57.0, korea: 54.4 },
  { year: 1980, world: 58.5, korea: 58.0 },
  { year: 1990, world: 60.8, korea: 66.0 },
  { year: 2000, world: 63.2, korea: 71.0 },
  { year: 2010, world: 65.2, korea: 72.8 },
  { year: 2012, world: 65.1, korea: 73.4 },
  { year: 2020, world: 65.1, korea: 71.2 },
  { year: 2024, world: 64.6, korea: 70.2 },
  { year: 2030, world: 64.0, korea: 65.0 },
  { year: 2040, world: 63.6, korea: 57.0 },
  { year: 2050, world: 63.3, korea: 51.9 },
  { year: 2060, world: 62.4, korea: 48.2 },
  { year: 2070, world: 61.5, korea: 45.8 },
];

// 고령인구(65세 이상) 구성비 추이
const elderlyData = [
  { year: 1970, world: 5.3, korea: 3.1 },
  { year: 1980, world: 5.9, korea: 3.8 },
  { year: 1990, world: 6.9, korea: 5.1 },
  { year: 2000, world: 8.2, korea: 7.2 },
  { year: 2010, world: 9.2, korea: 11.0 },
  { year: 2020, world: 10.2, korea: 15.7 },
  { year: 2024, world: 10.8, korea: 19.2 },
  { year: 2030, world: 12.5, korea: 24.3 },
  { year: 2040, world: 14.5, korea: 32.5 },
  { year: 2050, world: 16.3, korea: 40.1 },
  { year: 2060, world: 18.4, korea: 44.2 },
  { year: 2070, world: 20.3, korea: 47.7 },
];

const formatYear = (v: number) => `${v}년`;
const formatPct = (v: number) => `${v}%`;

export const AgingPopulationCharts: React.FC = () => {
  return (
    <div className="mt-10 space-y-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          세계와 한국의 생산연령인구 구성비 추이
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={productiveAgeData}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="year"
              tickFormatter={formatYear}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              domain={[40, 90]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={32}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatPct(value), name === 'world' ? '세계' : '한국']}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(label) => (label === 'world' ? '세계' : '한국')}
            />
            <Line
              type="monotone"
              dataKey="world"
              name="world"
              stroke="#eab308"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="korea"
              name="korea"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          세계와 한국의 고령인구 구성비 추이
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={elderlyData}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="year"
              tickFormatter={formatYear}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              domain={[0, 60]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={32}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatPct(value), name === 'world' ? '세계' : '한국']}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(label) => (label === 'world' ? '세계' : '한국')}
            />
            <Line
              type="monotone"
              dataKey="world"
              name="world"
              stroke="#eab308"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="korea"
              name="korea"
              stroke="#a855f7"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AgingPopulationCharts;
