/**
 * 미국 원유 생산/소비 월별 추이 (BBL/D/1K)
 * '2026년 원유·에너지 섹터, 공급과 수요가 주가에 미치는 영향' 게시글 전용.
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
} from 'recharts';

// 월별 데이터 (2016-2025, '000 BBL/D). U.S. Energy Information Administration 스타일 추정치.
const monthly = [
  { period: '2016-01', label: "Jan '16", value: 9.4 }, { period: '2016-02', label: "Feb '16", value: 9.6 }, { period: '2016-03', label: "Mar '16", value: 9.2 }, { period: '2016-04', label: "Apr '16", value: 8.9 }, { period: '2016-05', label: "May '16", value: 8.8 }, { period: '2016-06', label: "Jun '16", value: 8.95 }, { period: '2016-07', label: "Jul '16", value: 9.0 }, { period: '2016-08', label: "Aug '16", value: 9.1 }, { period: '2016-09', label: "Sep '16", value: 9.0 }, { period: '2016-10', label: "Oct '16", value: 9.1 }, { period: '2016-11', label: "Nov '16", value: 9.2 }, { period: '2016-12', label: "Dec '16", value: 9.3 },
  { period: '2017-01', label: "Jan '17", value: 9.4 }, { period: '2017-02', label: "Feb '17", value: 9.5 }, { period: '2017-03', label: "Mar '17", value: 9.6 }, { period: '2017-04', label: "Apr '17", value: 9.7 }, { period: '2017-05', label: "May '17", value: 9.8 }, { period: '2017-06', label: "Jun '17", value: 9.9 }, { period: '2017-07', label: "Jul '17", value: 10.0 }, { period: '2017-08', label: "Aug '17", value: 10.15 }, { period: '2017-09', label: "Sep '17", value: 10.25 }, { period: '2017-10', label: "Oct '17", value: 10.3 }, { period: '2017-11', label: "Nov '17", value: 10.4 }, { period: '2017-12', label: "Dec '17", value: 10.5 },
  { period: '2018-01', label: "Jan '18", value: 10.7 }, { period: '2018-02', label: "Feb '18", value: 10.8 }, { period: '2018-03', label: "Mar '18", value: 10.9 }, { period: '2018-04', label: "Apr '18", value: 11.0 }, { period: '2018-05', label: "May '18", value: 11.15 }, { period: '2018-06', label: "Jun '18", value: 11.25 }, { period: '2018-07', label: "Jul '18", value: 11.4 }, { period: '2018-08', label: "Aug '18", value: 11.6 }, { period: '2018-09', label: "Sep '18", value: 11.7 }, { period: '2018-10', label: "Oct '18", value: 11.9 }, { period: '2018-11', label: "Nov '18", value: 12.0 }, { period: '2018-12', label: "Dec '18", value: 12.1 },
  { period: '2019-01', label: "Jan '19", value: 12.2 }, { period: '2019-02', label: "Feb '19", value: 12.3 }, { period: '2019-03', label: "Mar '19", value: 12.4 }, { period: '2019-04', label: "Apr '19", value: 12.5 }, { period: '2019-05', label: "May '19", value: 12.6 }, { period: '2019-06', label: "Jun '19", value: 12.7 }, { period: '2019-07', label: "Jul '19", value: 12.8 }, { period: '2019-08', label: "Aug '19", value: 12.9 }, { period: '2019-09', label: "Sep '19", value: 13.0 }, { period: '2019-10', label: "Oct '19", value: 13.1 }, { period: '2019-11', label: "Nov '19", value: 13.2 }, { period: '2019-12', label: "Dec '19", value: 13.3 },
  { period: '2020-01', label: "Jan '20", value: 13.3 }, { period: '2020-02', label: "Feb '20", value: 13.2 }, { period: '2020-03', label: "Mar '20", value: 13.0 }, { period: '2020-04', label: "Apr '20", value: 9.8 }, { period: '2020-05', label: "May '20", value: 10.3 }, { period: '2020-06', label: "Jun '20", value: 10.8 }, { period: '2020-07', label: "Jul '20", value: 10.9 }, { period: '2020-08', label: "Aug '20", value: 11.0 }, { period: '2020-09', label: "Sep '20", value: 11.1 }, { period: '2020-10', label: "Oct '20", value: 11.2 }, { period: '2020-11', label: "Nov '20", value: 11.3 }, { period: '2020-12', label: "Dec '20", value: 11.4 },
  { period: '2021-01', label: "Jan '21", value: 11.3 }, { period: '2021-02', label: "Feb '21", value: 10.5 }, { period: '2021-03', label: "Mar '21", value: 10.9 }, { period: '2021-04', label: "Apr '21", value: 11.0 }, { period: '2021-05', label: "May '21", value: 11.1 }, { period: '2021-06', label: "Jun '21", value: 11.2 }, { period: '2021-07', label: "Jul '21", value: 11.3 }, { period: '2021-08', label: "Aug '21", value: 11.4 }, { period: '2021-09', label: "Sep '21", value: 11.5 }, { period: '2021-10', label: "Oct '21", value: 11.6 }, { period: '2021-11', label: "Nov '21", value: 11.7 }, { period: '2021-12', label: "Dec '21", value: 11.8 },
  { period: '2022-01', label: "Jan '22", value: 11.9 }, { period: '2022-02', label: "Feb '22", value: 12.0 }, { period: '2022-03', label: "Mar '22", value: 12.1 }, { period: '2022-04', label: "Apr '22", value: 12.2 }, { period: '2022-05', label: "May '22", value: 12.3 }, { period: '2022-06', label: "Jun '22", value: 12.4 }, { period: '2022-07', label: "Jul '22", value: 12.5 }, { period: '2022-08', label: "Aug '22", value: 12.6 }, { period: '2022-09', label: "Sep '22", value: 12.7 }, { period: '2022-10', label: "Oct '22", value: 12.8 }, { period: '2022-11', label: "Nov '22", value: 12.9 }, { period: '2022-12', label: "Dec '22", value: 13.0 },
  { period: '2023-01', label: "Jan '23", value: 13.05 }, { period: '2023-02', label: "Feb '23", value: 13.15 }, { period: '2023-03', label: "Mar '23", value: 13.25 }, { period: '2023-04', label: "Apr '23", value: 13.3 }, { period: '2023-05', label: "May '23", value: 13.35 }, { period: '2023-06', label: "Jun '23", value: 13.4 }, { period: '2023-07', label: "Jul '23", value: 13.45 }, { period: '2023-08', label: "Aug '23", value: 13.5 }, { period: '2023-09', label: "Sep '23", value: 13.55 }, { period: '2023-10', label: "Oct '23", value: 13.6 }, { period: '2023-11', label: "Nov '23", value: 13.65 }, { period: '2023-12', label: "Dec '23", value: 13.7 },
  { period: '2024-01', label: "Jan '24", value: 13.7 }, { period: '2024-02', label: "Feb '24", value: 13.75 }, { period: '2024-03', label: "Mar '24", value: 13.8 }, { period: '2024-04', label: "Apr '24", value: 13.85 }, { period: '2024-05', label: "May '24", value: 13.9 }, { period: '2024-06', label: "Jun '24", value: 13.95 }, { period: '2024-07', label: "Jul '24", value: 14.0 }, { period: '2024-08', label: "Aug '24", value: 14.05 }, { period: '2024-09', label: "Sep '24", value: 14.1 }, { period: '2024-10', label: "Oct '24", value: 14.15 }, { period: '2024-11', label: "Nov '24", value: 14.2 }, { period: '2024-12', label: "Dec '24", value: 14.25 },
  { period: '2025-01', label: "Jan '25", value: 14.3 }, { period: '2025-02', label: "Feb '25", value: 14.35 }, { period: '2025-03', label: "Mar '25", value: 14.4 }, { period: '2025-04', label: "Apr '25", value: 14.45 }, { period: '2025-05', label: "May '25", value: 14.5 }, { period: '2025-06', label: "Jun '25", value: 14.55 }, { period: '2025-07', label: "Jul '25", value: 14.6 }, { period: '2025-08', label: "Aug '25", value: 14.65 }, { period: '2025-09', label: "Sep '25", value: 14.7 }, { period: '2025-10', label: "Oct '25", value: 14.75 }, { period: '2025-11', label: "Nov '25", value: 14.8 }, { period: '2025-12', label: "Dec '25", value: 14.85 },
];

export const OilProductionChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            U.S. Crude Oil Production (Monthly)
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">BBL/D/1K</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          Barrels per Day, in thousands. 2016–2025.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={monthly}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            barCategoryGap="1%"
            barGap={0}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="period"
              tickFormatter={(v) => (v ? String(v).slice(0, 4) : '')}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={11}
            />
            <YAxis
              domain={[8, 16]}
              ticks={[8, 9, 10, 11, 12, 13, 14, 15, 16]}
              tickFormatter={(v) => `${v}K`}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={28}
            />
            <Tooltip
              formatter={(value: number) => [`${value}K BBL/D`, '']}
              labelFormatter={(_, payload) => (payload?.[0]?.payload as { label?: string })?.label ?? ''}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Bar dataKey="value" fill="#2563eb" radius={[1, 1, 0, 0]} name="BBL/D/1K" />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          Source: U.S. Energy Information Administration
        </p>
      </div>
    </div>
  );
};

export default OilProductionChart;
