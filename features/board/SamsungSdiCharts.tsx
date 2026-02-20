/**
 * 삼성SDI 전사 실적 추이·전망 + 12개월 선행 P/B 밴드 (Recharts)
 * '로봇과 전고체 배터리' 게시글(id 36) 전용.
 */

import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';

// 그림 1. 삼성SDI 전사 실적 추이 및 전망 (단위: 십억원, %)
const performanceData = [
  { quarter: '1Q22', 소형전지: 2000, 중대형전지: 2800, 전자재료: 800, margin: 8 },
  { quarter: '1Q23', 소형전지: 2000, 중대형전지: 3200, 전자재료: 800, margin: 6 },
  { quarter: '1Q24', 소형전지: 1900, 중대형전지: 3000, 전자재료: 700, margin: 5 },
  { quarter: '1Q25', 소형전지: 1500, 중대형전지: 1600, 전자재료: 300, margin: -15 },
  { quarter: '1Q26F', 소형전지: 1200, 중대형전지: 2000, 전자재료: 500, margin: 8 },
  { quarter: '1Q27F', 소형전지: 1500, 중대형전지: 2800, 전자재료: 700, margin: 8 },
];

// 그림 2. 삼성SDI 12개월 선행 P/B 밴드 (원). period = 년.월 (20.1 = 2020년 1월)
const pbBandData = [
  { period: '20.1', price: 200000, b36: 720000, b28: 560000, b21: 420000, b13: 260000, b05: 100000 },
  { period: '20.5', price: 350000, b36: 900000, b28: 700000, b21: 525000, b13: 325000, b05: 125000 },
  { period: '21.1', price: 500000, b36: 1050000, b28: 820000, b21: 615000, b13: 380000, b05: 145000 },
  { period: '21.5', price: 600000, b36: 1080000, b28: 840000, b21: 630000, b13: 390000, b05: 150000 },
  { period: '22.1', price: 750000, b36: 1150000, b28: 895000, b21: 670000, b13: 415000, b05: 160000 },
  { period: '22.3', price: 800000, b36: 1180000, b28: 920000, b21: 690000, b13: 428000, b05: 165000 },
  { period: '22.7', price: 650000, b36: 1100000, b28: 855000, b21: 640000, b13: 396000, b05: 152000 },
  { period: '23.1', price: 750000, b36: 1120000, b28: 870000, b21: 652000, b13: 403000, b05: 155000 },
  { period: '23.5', price: 650000, b36: 1050000, b28: 815000, b21: 611000, b13: 378000, b05: 145000 },
  { period: '24.1', price: 500000, b36: 950000, b28: 738000, b21: 553000, b13: 342000, b05: 132000 },
  { period: '24.5', price: 400000, b36: 850000, b28: 660000, b21: 495000, b13: 306000, b05: 118000 },
  { period: '25.1', price: 200000, b36: 650000, b28: 505000, b21: 379000, b13: 234000, b05: 90000 },
  { period: '25.3', price: 150000, b36: 580000, b28: 450000, b21: 338000, b13: 209000, b05: 80000 },
  { period: '25.7', price: 250000, b36: 680000, b28: 528000, b21: 396000, b13: 245000, b05: 94000 },
  { period: '26.1', price: 380000, b36: 780000, b28: 606000, b21: 454000, b13: 281000, b05: 108000 },
];

const formatPct = (v: number) => `${v}%`;

export const SamsungSdiCharts: React.FC = () => {
  return (
    <div className="mt-10 space-y-8">
      {/* 그림 1. 삼성SDI 전사 실적 추이 및 전망 */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          그림 1. 삼성SDI 전사 실적 추이 및 전망 (Samsung SDI Company-wide Performance Trend and Forecast)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={performanceData} margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              domain={[0, 8000]}
              ticks={[0, 2000, 4000, 6000, 8000]}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={40}
              label={{ value: '(십억원)', angle: -90, position: 'insideLeft', fontSize: 10 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[-20, 10]}
              ticks={[-20, -10, 0, 10]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={36}
              label={{ value: '(%)', angle: 90, position: 'insideRight', fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === '영업이익률 (R)') return [formatPct(value), name];
                return [value.toLocaleString() + ' 십억원', name];
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine yAxisId="right" y={0} stroke="#94a3b8" strokeDasharray="2 2" />
            <Bar yAxisId="left" dataKey="소형전지" stackId="rev" fill="#475569" name="소형전지" barSize={32} />
            <Bar yAxisId="left" dataKey="중대형전지" stackId="rev" fill="#64748b" name="중대형전지" barSize={32} />
            <Bar yAxisId="left" dataKey="전자재료" stackId="rev" fill="#94a3b8" name="전자재료" barSize={32} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="margin"
              stroke="#ea580c"
              strokeWidth={2}
              dot={{ r: 3, fill: '#ea580c' }}
              name="영업이익률 (R)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 그림 2. 삼성SDI 12개월 선행 P/B 밴드 */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          그림 2. 삼성SDI 12개월 선행 P/B 밴드 (Samsung SDI 12-month Forward P/B Band)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={pbBandData} margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={0}
            />
            <YAxis
              domain={[0, 1200000]}
              ticks={[0, 200000, 400000, 600000, 800000, 1000000, 1200000]}
              tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v))}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={44}
              label={{ value: '(원)', angle: -90, position: 'insideLeft', fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [value.toLocaleString() + ' 원', name]}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="b36" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} name="3.6x" />
            <Line type="monotone" dataKey="b28" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} name="2.8x" />
            <Line type="monotone" dataKey="b21" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} name="2.1x" />
            <Line type="monotone" dataKey="b13" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} name="1.3x" />
            <Line type="monotone" dataKey="b05" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} name="0.5x" />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#ea580c"
              strokeWidth={2.5}
              dot={{ r: 2, fill: '#ea580c' }}
              activeDot={{ r: 4, fill: '#ea580c' }}
              name="삼성SDI"
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
          위 차트는 삼성SDI 실적·P/B 밴드 추이를 근사한 것입니다.
        </p>
      </div>
    </div>
  );
};

export default SamsungSdiCharts;
