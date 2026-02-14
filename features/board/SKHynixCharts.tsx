/**
 * SK하이닉스 손익 요약 표 + 수익성 지표 차트 (Recharts)
 * 'SK하이닉스, HBM 점유율과 2026년 실적 가시성 점검' 게시글 전용.
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
} from 'recharts';

// 단위: 억원 (100 million KRW)
const incomeRows = [
  { label: '매출액', q25q4: '32,827', q25q3: '24,449', q24q4: '19,767', qoq: '+34%', yoy: '+66%' },
  { label: '매출총이익', q25q4: '22,576', q25q3: '14,029', q24q4: '10,366', qoq: '+61%', yoy: '+118%' },
  { label: '영업이익', q25q4: '19,170', q25q3: '11,383', q24q4: '8,083', qoq: '+68%', yoy: '+137%' },
  { label: 'EBITDA', q25q4: '22,732', q25q3: '14,949', q24q4: '11,249', qoq: '+52%', yoy: '+102%' },
  { label: '순이익', q25q4: '15,246', q25q3: '12,598', q24q4: '8,006', qoq: '+21%', yoy: '+90%' },
  { label: '주당순이익(기본, 원)', q25q4: '21,852', q25q3: '18,242', q24q4: '11,611', qoq: '-', yoy: '-' },
  { label: '주당순이익(희석, 원)', q25q4: '21,522', q25q3: '17,850', q24q4: '11,571', qoq: '-', yoy: '-' },
  { label: '유통주식수(기본, 백만)', q25q4: '696', q25q3: '690', q24q4: '689', qoq: '-', yoy: '-' },
  { label: '유통주식수(희석, 백만)', q25q4: '712', q25q3: '712', q24q4: '690', qoq: '-', yoy: '-' },
];

// 수익성 지표 (%): 5분기
const marginData = [
  { quarter: "'24 Q4", gross: 52, operating: 41, ebitda: 57, net: 41 },
  { quarter: "'25 Q1", gross: 57, operating: 42, ebitda: 61, net: 46 },
  { quarter: "'25 Q2", gross: 54, operating: 41, ebitda: 57, net: 31 },
  { quarter: "'25 Q3", gross: 57, operating: 47, ebitda: 61, net: 52 },
  { quarter: "'25 Q4", gross: 69, operating: 58, ebitda: 69, net: 46 },
];

const marginChartConfig = [
  { key: 'gross', title: '매출총이익률', change: '+11%p', color: '#3b82f6' },
  { key: 'operating', title: '영업이익률', change: '+11%p', color: '#10b981' },
  { key: 'ebitda', title: 'EBITDA 마진', change: '+8%p', color: '#8b5cf6' },
  { key: 'net', title: '순이익률', change: '-6%p', color: '#f59e0b' },
];

const formatPct = (v: number) => `${v}%`;

export const SKHynixCharts: React.FC = () => {
  return (
    <div className="mt-10 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 손익 요약 테이블 */}
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 overflow-x-auto">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
            손익 요약
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">단위: 억원</p>
          <table className="w-full min-w-[320px] text-sm border-collapse text-slate-700 dark:text-slate-300">
            <thead>
              <tr>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-left font-medium">항목</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">'25 Q4</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">'25 Q3</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">'24 Q4</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">Q/Q</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">Y/Y</th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.map((row) => (
                <tr key={row.label}>
                  <td className="border border-slate-200 dark:border-white/10 p-2">{row.label}</td>
                  <td className="border border-slate-200 dark:border-white/10 p-2 text-right">{row.q25q4}</td>
                  <td className="border border-slate-200 dark:border-white/10 p-2 text-right">{row.q25q3}</td>
                  <td className="border border-slate-200 dark:border-white/10 p-2 text-right">{row.q24q4}</td>
                  <td className={`border border-slate-200 dark:border-white/10 p-2 text-right ${row.qoq !== '-' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{row.qoq}</td>
                  <td className={`border border-slate-200 dark:border-white/10 p-2 text-right ${row.yoy !== '-' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{row.yoy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 수익성 지표 차트 4개 */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            수익성 지표
          </h3>
          {marginChartConfig.map(({ key, title, change, color }) => (
            <div key={key} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</span>
                <span className={`text-xs font-medium ${change.startsWith('-') ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {'25 Q3→Q4 '}{change}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={marginData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                  <XAxis
                    dataKey="quarter"
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    className="text-slate-500 dark:text-slate-400"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={formatPct}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    width={28}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPct(value), title]}
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        자료: SK하이닉스
      </p>
    </div>
  );
};

export default SKHynixCharts;
