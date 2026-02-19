/**
 * 한화에어로스페이스 주가·이동평균·거래량 차트 (Recharts)
 * 2025-11-14 ~ 2026-02-06 근사 데이터. 방위산업 게시글(id 35) 전용.
 */

import React from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';

// 일별 종가·거래량 근사 (추세: 11월~12월 초 저점, 12월~1월 상승, 1월 중순 고점 1,398,000, 이후 조정 ~1,140,000)
const rawData = [
  { date: '2025-11-14', close: 820000, volume: 180000 },
  { date: '2025-11-17', close: 835000, volume: 220000 },
  { date: '2025-11-18', close: 828000, volume: 190000 },
  { date: '2025-11-19', close: 842000, volume: 210000 },
  { date: '2025-11-20', close: 855000, volume: 240000 },
  { date: '2025-11-21', close: 848000, volume: 200000 },
  { date: '2025-11-24', close: 865000, volume: 230000 },
  { date: '2025-11-25', close: 878000, volume: 250000 },
  { date: '2025-11-26', close: 892000, volume: 270000 },
  { date: '2025-11-27', close: 905000, volume: 260000 },
  { date: '2025-11-28', close: 918000, volume: 280000 },
  { date: '2025-12-01', close: 935000, volume: 290000 },
  { date: '2025-12-02', close: 952000, volume: 310000 },
  { date: '2025-12-03', close: 968000, volume: 300000 },
  { date: '2025-12-04', close: 985000, volume: 320000 },
  { date: '2025-12-05', close: 1002000, volume: 340000 },
  { date: '2025-12-08', close: 1020000, volume: 350000 },
  { date: '2025-12-09', close: 1040000, volume: 360000 },
  { date: '2025-12-10', close: 1062000, volume: 380000 },
  { date: '2025-12-11', close: 1085000, volume: 400000 },
  { date: '2025-12-12', close: 1108000, volume: 420000 },
  { date: '2025-12-15', close: 1132000, volume: 410000 },
  { date: '2025-12-16', close: 1155000, volume: 430000 },
  { date: '2025-12-17', close: 1180000, volume: 450000 },
  { date: '2025-12-18', close: 1205000, volume: 440000 },
  { date: '2025-12-19', close: 1230000, volume: 460000 },
  { date: '2025-12-22', close: 1258000, volume: 480000 },
  { date: '2025-12-23', close: 1285000, volume: 470000 },
  { date: '2025-12-26', close: 1312000, volume: 490000 },
  { date: '2025-12-29', close: 1340000, volume: 510000 },
  { date: '2025-12-30', close: 1365000, volume: 500000 },
  { date: '2026-01-02', close: 1375000, volume: 520000 },
  { date: '2026-01-03', close: 1385000, volume: 540000 },
  { date: '2026-01-06', close: 1392000, volume: 530000 },
  { date: '2026-01-07', close: 1398000, volume: 550000 },
  { date: '2026-01-08', close: 1390000, volume: 480000 },
  { date: '2026-01-09', close: 1375000, volume: 460000 },
  { date: '2026-01-10', close: 1358000, volume: 440000 },
  { date: '2026-01-13', close: 1335000, volume: 420000 },
  { date: '2026-01-14', close: 1310000, volume: 400000 },
  { date: '2026-01-15', close: 1285000, volume: 380000 },
  { date: '2026-01-16', close: 1262000, volume: 360000 },
  { date: '2026-01-17', close: 1240000, volume: 340000 },
  { date: '2026-01-20', close: 1220000, volume: 320000 },
  { date: '2026-01-21', close: 1202000, volume: 300000 },
  { date: '2026-01-22', close: 1185000, volume: 280000 },
  { date: '2026-01-23', close: 1172000, volume: 260000 },
  { date: '2026-01-24', close: 1160000, volume: 240000 },
  { date: '2026-01-27', close: 1152000, volume: 220000 },
  { date: '2026-01-28', close: 1145000, volume: 200000 },
  { date: '2026-01-29', close: 1142000, volume: 180000 },
  { date: '2026-01-30', close: 1140000, volume: 160000 },
  { date: '2026-01-31', close: 1138000, volume: 155000 },
  { date: '2026-02-03', close: 1142000, volume: 150000 },
  { date: '2026-02-04', close: 1145000, volume: 148000 },
  { date: '2026-02-05', close: 1140000, volume: 149000 },
  { date: '2026-02-06', close: 1140000, volume: 148118 },
];

function movingAverage(arr: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += arr[i - j];
      result.push(Math.round(sum / period));
    }
  }
  return result;
}

const closes = rawData.map((d) => d.close);
const ma5 = movingAverage(closes, 5);
const ma20 = movingAverage(closes, 20);
const ma60 = movingAverage(closes, 60);
const ma120 = movingAverage(closes, 120);

const chartData = rawData.map((d, i) => ({
  ...d,
  ma5: ma5[i],
  ma20: ma20[i],
  ma60: ma60[i],
  ma120: ma120[i],
}));

const formatVolume = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));
const formatX = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (d === 14) return m === 12 ? '12월' : m === 1 ? '01/14' : m === 2 ? '2월' : `${m}/${d}`;
  if (d === 14 && m === 11) return '11/14';
  return `${m}/${d}`;
};

export const HanwhaAerospaceChart: React.FC = () => {
  return (
    <div className="mt-10">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            한화에어로스페이스 (Hanwha Aerospace)
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">한국거래소(KRX)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mb-2 text-xs text-slate-600 dark:text-slate-400">
          <span>시 1,199,000</span>
          <span>고 1,199,000</span>
          <span>저 1,131,000</span>
          <span>종 1,140,000</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-sm">
          <span className="font-semibold text-slate-900 dark:text-white">1,140,000</span>
          <span className="text-emerald-600 dark:text-emerald-400">+35,000 (+3.17%)</span>
          <span className="text-slate-500 dark:text-slate-400">거래량 148,118</span>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">이동평균 5 20 60 120</p>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatX}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={7}
            />
            <YAxis
              yAxisId="price"
              orientation="left"
              domain={[750000, 1450000]}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}`}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={40}
            />
            <YAxis
              yAxisId="vol"
              orientation="right"
              domain={[0, 600000]}
              tickFormatter={formatVolume}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={36}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'volume') return [value.toLocaleString(), '거래량'];
                if (name === 'close') return [value.toLocaleString(), '종가'];
                return [value != null ? value.toLocaleString() : '–', name];
              }}
              labelFormatter={(label: string) => (label ? `${label.slice(0, 4)}년 ${label.slice(5, 7)}월 ${label.slice(8, 10)}일` : '')}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine yAxisId="price" y={1398000} stroke="#94a3b8" strokeDasharray="2 2" />
            <ReferenceLine yAxisId="price" y={791000} stroke="#94a3b8" strokeDasharray="2 2" />
            <Line yAxisId="price" type="monotone" dataKey="close" stroke="#2563eb" strokeWidth={2} dot={false} name="종가" />
            <Line yAxisId="price" type="monotone" dataKey="ma5" stroke="#16a34a" strokeWidth={1.5} dot={false} name="MA5" />
            <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#dc2626" strokeWidth={1.5} dot={false} name="MA20" />
            <Line yAxisId="price" type="monotone" dataKey="ma60" stroke="#ea580c" strokeWidth={1.5} dot={false} name="MA60" />
            <Line yAxisId="price" type="monotone" dataKey="ma120" stroke="#7c3aed" strokeWidth={1.5} dot={false} name="MA120" />
            <Bar yAxisId="vol" dataKey="volume" fill="#94a3b8" fillOpacity={0.6} name="거래량" radius={[2, 2, 0, 0]} barSize={4} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500 dark:text-slate-400">
          <span>최고 1,398,000 (-18.45%)</span>
          <span>최저 791,000 (44.12%)</span>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          위 차트는 2025년 11월~2026년 2월 구간 추이를 근사한 것입니다. (단위: 원, 주)
        </p>
      </div>
    </div>
  );
};

export default HanwhaAerospaceChart;
