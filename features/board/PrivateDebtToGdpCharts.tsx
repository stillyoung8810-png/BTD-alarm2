/**
 * 일본/미국 GDP 대비 민간 부채 비율 (Recharts BarChart)
 * '엔저의 종말과 엔 캐리 트레이드 해소' 게시글 전용.
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

// Japan Private Debt to GDP (%)
const japanData = [
  { year: 2013, value: 155 },
  { year: 2014, value: 156 },
  { year: 2015, value: 141 },
  { year: 2016, value: 142 },
  { year: 2017, value: 144 },
  { year: 2018, value: 157 },
  { year: 2019, value: 159 },
  { year: 2020, value: 166 },
  { year: 2021, value: 171 },
  { year: 2022, value: 174 },
  { year: 2023, value: 168 },
  { year: 2024, value: 169.9 },
];

// United States Private Debt to GDP (%)
const usData = [
  { year: 2013, value: 138 },
  { year: 2014, value: 140 },
  { year: 2015, value: 144 },
  { year: 2016, value: 147 },
  { year: 2017, value: 143 },
  { year: 2018, value: 146 },
  { year: 2019, value: 152 },
  { year: 2020, value: 157 },
  { year: 2021, value: 149 },
  { year: 2022, value: 154 },
  { year: 2023, value: 147 },
  { year: 2024, value: 142 },
];

const formatPct = (v: number) => `${v}%`;

type DebtDatum = (typeof japanData)[number];

function isDebtDatum(value: unknown): value is DebtDatum {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.year === 'number' &&
    typeof candidate.value === 'number'
  );
}

function toChartNumber(value: number | string | undefined): number {
  return typeof value === 'number' ? value : 0;
}

function renderDebtTopLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  width?: number | string;
  payload?: unknown;
}): React.ReactElement | null {
  const { x, y, value, width, payload } = props;

  if (!isDebtDatum(payload) || payload.year !== 2024 || typeof value !== 'number') {
    return null;
  }

  return (
    <text
      x={toChartNumber(x) + toChartNumber(width) / 2}
      y={toChartNumber(y) - 6}
      textAnchor="middle"
      className="fill-rose-600 dark:fill-rose-400 text-xs font-medium"
    >
      {formatPct(value)}
    </text>
  );
}

function renderDebtCalloutLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  width?: number | string;
  payload?: unknown;
}): React.ReactElement | null {
  const { x, y, value, width, payload } = props;

  if (!isDebtDatum(payload) || payload.year !== 2024 || typeof value !== 'number') {
    return null;
  }

  const centerX = toChartNumber(x) + toChartNumber(width) / 2;
  const topY = toChartNumber(y);

  return (
    <g>
      <rect
        x={centerX - 28}
        y={topY - 32}
        width={56}
        height={28}
        fill="white"
        stroke="currentColor"
        strokeWidth={1}
        className="stroke-slate-300 dark:stroke-slate-600"
        rx={4}
      />
      <text
        x={centerX}
        y={topY - 24}
        textAnchor="middle"
        className="text-slate-700 dark:text-slate-300 text-[10px]"
      >
        2024
      </text>
      <text
        x={centerX}
        y={topY - 12}
        textAnchor="middle"
        className="text-slate-900 dark:text-slate-100 text-xs font-medium"
      >
        {formatPct(value)}
      </text>
    </g>
  );
}

export const PrivateDebtToGdpCharts: React.FC = () => {
  return (
    <div className="mt-10 space-y-8">
      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
        &lt;참고&gt; 일본/미국의 GDP 대비 민간 부채 비율
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          Japan Private Debt to GDP
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={japanData}
            margin={{ top: 24, right: 16, left: 8, bottom: 8 }}
            barCategoryGap="12%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              domain={[154, 174]}
              ticks={[154, 159, 164, 169, 174]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={36}
            />
            <Tooltip
              formatter={(value: number) => [formatPct(value), '']}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Bar dataKey="value" fill="#2563eb" radius={[2, 2, 0, 0]} barSize={20}>
              <LabelList
                position="top"
                content={renderDebtTopLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          United States Private Debt to GDP
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={usData}
            margin={{ top: 24, right: 16, left: 8, bottom: 8 }}
            barCategoryGap="12%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              domain={[137, 157]}
              ticks={[137, 142, 147, 152, 157]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={36}
            />
            <Tooltip
              formatter={(value: number) => [formatPct(value), '']}
              labelFormatter={(label) => `${label}년`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Bar dataKey="value" fill="#2563eb" radius={[2, 2, 0, 0]} barSize={20}>
              <LabelList
                position="top"
                content={renderDebtCalloutLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Source: OECD
      </p>
    </div>
  );
};

export default PrivateDebtToGdpCharts;
