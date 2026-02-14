/**
 * 2020년 국가별 탄소 배출량 (가로 막대 차트)
 * '탄소국경조정(CBAM)과 수출 기업' 게시글 전용.
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
  Cell,
  LabelList,
} from 'recharts';

const data = [
  { country: 'China', value: 2912, fill: '#dc2626' },
  { country: 'US', value: 1286, fill: '#2563eb' },
  { country: 'India', value: 666, fill: '#2563eb' },
  { country: 'Russia', value: 430, fill: '#2563eb' },
  { country: 'Japan', value: 281, fill: '#2563eb' },
  { country: 'Iran', value: 203, fill: '#2563eb' },
  { country: 'Germany', value: 176, fill: '#2563eb' },
  { country: 'Saudi Arabia', value: 171, fill: '#16a34a' },
  { country: 'S Korea', value: 163, fill: '#2563eb' },
  { country: 'Indonesia', value: 161, fill: '#2563eb' },
];

const total = data.reduce((s, d) => s + d.value, 0);

export const CarbonEmissionsChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          National carbon emissions (million tonnes of carbon per year)
        </h3>
        <div className="relative">
          <ResponsiveContainer width="100%" height={380}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 56, left: 72, bottom: 8 }}
              barCategoryGap="14%"
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 3200]}
                ticks={[0, 1000, 2000, 3000]}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-slate-500 dark:text-slate-400"
                tickFormatter={(v) => v.toLocaleString()}
              />
              <YAxis
                type="category"
                dataKey="country"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-slate-500 dark:text-slate-400"
                width={70}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString()} million tonnes`, '']}
                labelFormatter={(label) => label}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <Bar dataKey="value" name="Emissions" radius={[0, 4, 4, 0]} barSize={22} minPointSize={8}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number) => v.toLocaleString()}
                  className="fill-slate-700 dark:fill-slate-300 text-xs font-medium"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="absolute top-2 right-2 text-right pointer-events-none">
            <p className="text-2xl font-bold text-slate-300 dark:text-slate-600">2020</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Total: {total.toLocaleString()}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          China(red), Saudi Arabia(green), others(blue). Source: national carbon emissions data.
        </p>
      </div>
    </div>
  );
};

export default CarbonEmissionsChart;
