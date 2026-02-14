/**
 * 엔비디아 vs AMD 데이터센터 매출 추이 (그룹 막대 차트)
 * 'AMD, 엔비디아 대안으로서의 2026년 AI·데이터센터 전략' 게시글 전용.
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
} from 'recharts';

const data = [
  { quarter: "Q4'22", nvda: 3616, amd: 1655 },
  { quarter: "Q1'23", nvda: 4284, amd: 1255 },
  { quarter: "Q2'23", nvda: 10323, amd: 1558 },
  { quarter: "Q3'23", nvda: 14514, amd: 1568 },
  { quarter: "Q4'23", nvda: 19404, amd: 2237 },
  { quarter: "Q1'24", nvda: 22563, amd: 2337 },
  { quarter: "Q2'24", nvda: 26272, amd: 2834 },
  { quarter: "Q3'24", nvda: 30771, amd: 3540 },
  { quarter: "Q4'24", nvda: 35580, amd: 3670 },
  { quarter: "Q1'25", nvda: 39120, amd: 3963 },
  { quarter: "Q2'25", nvda: 41096, amd: 3602 },
  { quarter: "Q3'25", nvda: 51215, amd: 3441 },
];

export const NvidiaAmdCharts: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
          &lt;참고&gt; 챗 GPT 출시 이후 엔비디아와 AMD의 데이터센터 매출 추이
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Nvidia vs. AMD: Data Center Revenue Surge After ChatGPT Era
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          Quarterly Data Center Revenue (Millions USD)
        </p>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} margin={{ top: 20, right: 16, left: 8, bottom: 8 }} barCategoryGap="12%" barGap={4}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'currentColor' }}
              tickFormatter={(v) => `${v / 1000}B`}
              domain={[0, 60000]}
              ticks={[0, 10000, 20000, 30000, 40000, 50000, 60000]}
              width={36}
            />
            <Tooltip
              formatter={(value: number, name: string) => [`$${value.toLocaleString()}M`, name === 'nvda' ? '엔비디아 (NVDA)' : 'AMD']}
              labelFormatter={(label) => label}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => (value === 'nvda' ? '엔비디아 (NVDA) · CAGR 162.1%' : 'AMD · CAGR 42.0%')}
            />
            <ReferenceLine x="Q1'23" stroke="#94a3b8" strokeDasharray="4 2" strokeWidth={1} />
            <Bar dataKey="nvda" name="nvda" fill="#16a34a" radius={[2, 2, 0, 0]} barSize={24}>
              <LabelList dataKey="nvda" position="top" formatter={(v: number) => v.toLocaleString()} className="fill-slate-600 dark:fill-slate-400" style={{ fontSize: 9 }} />
            </Bar>
            <Bar dataKey="amd" name="amd" fill="#b91c1c" radius={[2, 2, 0, 0]} barSize={24}>
              <LabelList dataKey="amd" position="top" formatter={(v: number) => v.toLocaleString()} className="fill-slate-600 dark:fill-slate-400" style={{ fontSize: 9 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-2">
          <span className="inline-block w-3 h-0.5 bg-slate-400 rounded" /> Q1&apos;23: Chat GPT 출시 시점
        </p>
      </div>
    </div>
  );
};

export default NvidiaAmdCharts;
