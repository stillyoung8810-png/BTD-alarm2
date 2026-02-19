/**
 * Secured Overnight Financing Rate (SOFR) & Volume 차트 (Recharts)
 * Jan 11, 2026 ~ Feb 16, 2026. 레버리지 ETF 게시글(id 34) 전용.
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
  Legend,
} from 'recharts';

const sofrData = [
  { date: '2026-01-11', SOFR: 3.64, Volume: 3310 },
  { date: '2026-01-12', SOFR: 3.65, Volume: 3310 },
  { date: '2026-01-13', SOFR: 3.63, Volume: 3310 },
  { date: '2026-01-14', SOFR: 3.62, Volume: 3310 },
  { date: '2026-01-15', SOFR: 3.61, Volume: 3310 },
  { date: '2026-01-16', SOFR: 3.63, Volume: 3310 },
  { date: '2026-01-17', SOFR: 3.64, Volume: 3310 },
  { date: '2026-01-18', SOFR: 3.65, Volume: 3310 },
  { date: '2026-01-19', SOFR: 3.63, Volume: 3310 },
  { date: '2026-01-20', SOFR: 3.61, Volume: 3310 },
  { date: '2026-01-21', SOFR: 3.63, Volume: 3310 },
  { date: '2026-01-22', SOFR: 3.66, Volume: 3310 },
  { date: '2026-01-23', SOFR: 3.66, Volume: 3310 },
  { date: '2026-01-24', SOFR: 3.65, Volume: 3310 },
  { date: '2026-01-25', SOFR: 3.63, Volume: 3310 },
  { date: '2026-01-26', SOFR: 3.62, Volume: 3310 },
  { date: '2026-01-27', SOFR: 3.61, Volume: 3310 },
  { date: '2026-01-28', SOFR: 3.6, Volume: 3310 },
  { date: '2026-01-29', SOFR: 3.62, Volume: 3310 },
  { date: '2026-01-30', SOFR: 3.65, Volume: 3310 },
  { date: '2026-01-31', SOFR: 3.66, Volume: 3310 },
  { date: '2026-02-01', SOFR: 3.67, Volume: 3310 },
  { date: '2026-02-02', SOFR: 3.66, Volume: 3310 },
  { date: '2026-02-03', SOFR: 3.65, Volume: 3310 },
  { date: '2026-02-04', SOFR: 3.63, Volume: 3310 },
  { date: '2026-02-05', SOFR: 3.6, Volume: 3310 },
  { date: '2026-02-06', SOFR: 3.59, Volume: 3310 },
  { date: '2026-02-07', SOFR: 3.58, Volume: 3310 },
  { date: '2026-02-08', SOFR: 3.57, Volume: 3310 },
  { date: '2026-02-09', SOFR: 3.57, Volume: 3310 },
  { date: '2026-02-10', SOFR: 3.59, Volume: 3310 },
  { date: '2026-02-11', SOFR: 3.61, Volume: 3310 },
  { date: '2026-02-12', SOFR: 3.63, Volume: 3310 },
  { date: '2026-02-13', SOFR: 3.65, Volume: 3310 },
  { date: '2026-02-14', SOFR: 3.68, Volume: 3310 },
  { date: '2026-02-15', SOFR: 3.7, Volume: 3310 },
  { date: '2026-02-16', SOFR: 3.71, Volume: 3310 },
];

const formatXTick = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.getDate();
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${day}. ${mon}`;
};

const formatSofr = (v: number) => (v != null ? v.toFixed(2) : '');
const formatVolume = (v: number) => (v != null ? v.toLocaleString() : '');
const formatTooltipLabel = (label: string) => {
  if (!label || label.length < 10) return label;
  const d = new Date(label);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = weekdays[d.getDay()];
  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${day}, ${formatted}`;
};

export const SofrChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Secured Overnight Financing Rate Chart
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Jan 11, 2026 – Feb 16, 2026 (1m)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={sofrData} margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXTick}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={4}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              domain={[3.54, 3.72]}
              ticks={[3.54, 3.6, 3.66, 3.72]}
              tickFormatter={formatSofr}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={36}
              label={{ value: 'Percent', angle: -90, position: 'insideLeft', fontSize: 10 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 4000]}
              ticks={[0, 1000, 2000, 3000]}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={32}
              label={{ value: '$Billions', angle: 90, position: 'insideRight', fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                name === 'SOFR' ? formatSofr(value) : formatVolume(value),
                name,
              ]}
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="SOFR"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 1.5, fill: '#2563eb' }}
              activeDot={{ r: 3, fill: '#2563eb' }}
              name="SOFR"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Volume"
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#0f172a' }}
              name="Volume"
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
          SOFR: Secured Overnight Financing Rate (%). Volume: $Billions. 위 차트는 2026년 1월 11일–2월 16일 구간 추이를 근사한 것입니다.
        </p>
      </div>
    </div>
  );
};

export default SofrChart;
