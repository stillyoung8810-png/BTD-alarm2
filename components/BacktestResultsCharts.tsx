/**
 * 백테스트 결과 차트만 분리 (recharts 의존성 격리로 Vite 500 방지)
 */

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface BacktestResultChartsData {
  equityCurve: { date: string; value: number }[];
  drawdownSeries: { date: string; drawdown: number }[];
}

interface BacktestResultsChartsProps {
  result: BacktestResultChartsData;
  chart: 'equity' | 'drawdown';
  assetGrowthCurveLabel: string;
  drawdownChartLabel: string;
  drawdownHint: string;
}

const BacktestResultsCharts: React.FC<BacktestResultsChartsProps> = ({
  result,
  chart,
  assetGrowthCurveLabel,
  drawdownChartLabel,
  drawdownHint,
}) => {
  if (chart === 'equity') {
    return (
      <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-5 shadow-lg">
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-4">{assetGrowthCurveLabel}</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={result.equityCurve} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-white/10" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(0, 7)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}`} />
              <Tooltip labelFormatter={(v) => v} formatter={(value: number) => [value.toFixed(1), 'STRATEGY']} contentStyle={{ borderRadius: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} name="STRATEGY" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 p-5 shadow-lg">
      <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-4">{drawdownChartLabel}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={result.drawdownSeries} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(0, 7)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip labelFormatter={(v) => v} formatter={(value: number) => [`${value.toFixed(1)}%`, 'Drawdown']} contentStyle={{ borderRadius: 12 }} />
            <Bar dataKey="drawdown" fill="#ef4444" radius={[2, 2, 0, 0]} name="Drawdown" />
            <ReferenceLine y={0} stroke="#94a3b8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2">{drawdownHint}</p>
    </div>
  );
};

export default BacktestResultsCharts;
