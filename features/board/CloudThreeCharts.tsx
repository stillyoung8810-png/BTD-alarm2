/**
 * 클라우드 3사 실적 차트: 메타 분기별 매출/비용 + 마이크로소프트 FY26 Q3 가이던스
 * '2026년 AI 인프라 투자와 클라우드 3사 실적, 무엇을 봐야 하나' 게시글 전용.
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
} from 'recharts';

// ----- 메타: Revenue by User Geography (백만 달러) -----
const metaRevenueData = [
  { quarter: "Q4'23", restOfWorld: 4573, asiaPacific: 7512, europe: 9441, usCanada: 18585 },
  { quarter: "Q1'24", restOfWorld: 4667, asiaPacific: 7481, europe: 8483, usCanada: 15824 },
  { quarter: "Q2'24", restOfWorld: 5036, asiaPacific: 7888, europe: 9300, usCanada: 16847 },
  { quarter: "Q3'24", restOfWorld: 5268, asiaPacific: 8220, europe: 9492, usCanada: 17609 },
  { quarter: "Q4'24", restOfWorld: 5854, asiaPacific: 9245, europe: 11503, usCanada: 21783 },
  { quarter: "Q1'25", restOfWorld: 5590, asiaPacific: 8439, europe: 9680, usCanada: 18605 },
  { quarter: "Q2'25", restOfWorld: 6247, asiaPacific: 9366, europe: 11532, usCanada: 20371 },
  { quarter: "Q3'25", restOfWorld: 6951, asiaPacific: 10272, europe: 12268, usCanada: 21751 },
  { quarter: "Q4'25", restOfWorld: 7759, asiaPacific: 11182, europe: 14480, usCanada: 26472 },
];

const metaRevenueTotal = [40111, 36455, 39071, 40589, 48385, 42314, 47516, 51242, 59893];

// ----- 메타: Expenses as % of Revenue -----
const metaExpenseData = [
  { quarter: "Q4'23", costOfRevenue: 19, rnd: 26, marketing: 8, ga: 6 },
  { quarter: "Q1'24", costOfRevenue: 18, rnd: 27, marketing: 7, ga: 9 },
  { quarter: "Q2'24", costOfRevenue: 19, rnd: 27, marketing: 7, ga: 9 },
  { quarter: "Q3'24", costOfRevenue: 18, rnd: 28, marketing: 7, ga: 5 },
  { quarter: "Q4'24", costOfRevenue: 18, rnd: 25, marketing: 7, ga: 2 },
  { quarter: "Q1'25", costOfRevenue: 18, rnd: 29, marketing: 7, ga: 5 },
  { quarter: "Q2'25", costOfRevenue: 18, rnd: 27, marketing: 6, ga: 6 },
  { quarter: "Q3'25", costOfRevenue: 18, rnd: 30, marketing: 6, ga: 7 },
  { quarter: "Q4'25", costOfRevenue: 18, rnd: 29, marketing: 6, ga: 6 },
];

// ----- 마이크로소프트 FY26 Q3 가이던스 (십억 달러) -----
const msftTableRows = [
  { label: '매출액', fy3q25: '70.1', fy3q26: '81.2', consensus: '81.4', yoy: '15.9%', highlightGuidance: true, highlightConsensus: false },
  { label: '생산성&비즈니스프로세스', fy3q25: '29.9', fy3q26: '34.4', consensus: '34.0', yoy: '14.9%', highlightGuidance: false, highlightConsensus: true },
  { label: '인텔리전트클라우드', fy3q25: '26.8', fy3q26: '34.3', consensus: '33.8', yoy: '28.0%', highlightGuidance: false, highlightConsensus: true },
  { label: '퍼스널컴퓨팅', fy3q25: '13.4', fy3q26: '12.6', consensus: '13.6', yoy: '-6.1%', highlightGuidance: true, highlightConsensus: true },
  { label: '매출원가', fy3q25: '21.9', fy3q26: '26.8', consensus: '26.5', yoy: '22.0%', highlightGuidance: false, highlightConsensus: false },
  { label: '영업비용', fy3q25: '16.1', fy3q26: '17.9', consensus: '17.9', yoy: '10.5%', highlightGuidance: true, highlightConsensus: false },
  { label: '영업이익', fy3q25: '32.0', fy3q26: '36.6', consensus: '37.0', yoy: '14.4%', highlightGuidance: true, highlightConsensus: false },
];

// 비교 차트용 (주요 지표만)
const msftCompareData = [
  { name: '매출액', FY3Q25: 70.1, FY3Q26가이던스: 81.2, Consensus: 81.4 },
  { name: '인텔리전트클라우드', FY3Q25: 26.8, FY3Q26가이던스: 34.3, Consensus: 33.8 },
  { name: '영업이익', FY3Q25: 32.0, FY3Q26가이던스: 36.6, Consensus: 37.0 },
];

const formatPct = (v: number) => `${v}%`;

export const CloudThreeCharts: React.FC = () => {
  return (
    <div className="mt-10 space-y-10">
      {/* 그룹 1: 메타 분기별 매출 및 비용 추이 */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          &lt;그림 1&gt; 메타 분기별 매출 및 비용 추이
        </h3>

        <div className="mb-6">
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Revenue by User Geography</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">In Millions</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={metaRevenueData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
              <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => `${v / 1000}B`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}M`, '']}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
                labelFormatter={(label, payload) => {
                  const idx = metaRevenueData.findIndex((d) => d.quarter === label);
                  const total = idx >= 0 ? metaRevenueTotal[idx] : 0;
                  return `${label} · 총 매출: $${total.toLocaleString()}M`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(label) => {
                const map: Record<string, string> = { restOfWorld: 'Rest of World', asiaPacific: 'Asia-Pacific', europe: 'Europe', usCanada: 'US & Canada' };
                return map[label] ?? label;
              }} />
              <Bar dataKey="restOfWorld" stackId="rev" fill="#94a3b8" name="restOfWorld" />
              <Bar dataKey="asiaPacific" stackId="rev" fill="#64748b" name="asiaPacific" />
              <Bar dataKey="europe" stackId="rev" fill="#475569" name="europe" />
              <Bar dataKey="usCanada" stackId="rev" fill="#334155" name="usCanada" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 justify-center mt-2 text-[10px] text-slate-500 dark:text-slate-400">
            {metaRevenueData.map((d, i) => (
              <span key={d.quarter}>{d.quarter}: ${(metaRevenueTotal[i] || 0).toLocaleString()}M</span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Expenses as a Percentage of Revenue</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={metaExpenseData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
              <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28} tickFormatter={formatPct} />
              <Tooltip formatter={(value: number) => [formatPct(value), '']} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(label) => {
                const map: Record<string, string> = { costOfRevenue: 'Cost of Revenue', rnd: 'Research & Development', marketing: 'Marketing & Sales', ga: 'General & Administrative' };
                return map[label] ?? label;
              }} />
              <Bar dataKey="costOfRevenue" stackId="exp" fill="#334155" name="costOfRevenue" />
              <Bar dataKey="rnd" stackId="exp" fill="#475569" name="rnd" />
              <Bar dataKey="marketing" stackId="exp" fill="#64748b" name="marketing" />
              <Bar dataKey="ga" stackId="exp" fill="#94a3b8" name="ga" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 그룹 2: 마이크로소프트 FY26 Q3 가이던스 */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
          표. Microsoft FY26 3분기(&apos;26.1~3월) 가이던스 요약
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">단위: 십억 달러</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm border-collapse text-slate-700 dark:text-slate-300">
            <thead>
              <tr>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-left font-medium">항목</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">FY3Q25</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right bg-sky-100 dark:bg-sky-900/40">FY3Q26 가이던스(중간값)</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">Consensus</th>
                <th className="border border-slate-200 dark:border-white/10 p-2 text-right">YoY</th>
              </tr>
            </thead>
            <tbody>
              {msftTableRows.map((row) => (
                <tr key={row.label}>
                  <td className="border border-slate-200 dark:border-white/10 p-2">{row.label}</td>
                  <td className="border border-slate-200 dark:border-white/10 p-2 text-right">{row.fy3q25}</td>
                  <td className={`border border-slate-200 dark:border-white/10 p-2 text-right bg-sky-50 dark:bg-sky-900/20 ${row.highlightGuidance ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}`}>{row.fy3q26}</td>
                  <td className={`border border-slate-200 dark:border-white/10 p-2 text-right ${row.highlightConsensus ? 'bg-amber-100 dark:bg-amber-900/30' : ''}`}>{row.consensus}</td>
                  <td className="border border-slate-200 dark:border-white/10 p-2 text-right">{row.yoy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">자료: Microsoft, Bloomberg (비고: YoY는 중간값 기준). 주황색은 실적 이후 변경된 컨센서스.</p>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">주요 지표 비교 (십억 달러)</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={msftCompareData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}B`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(value: number) => [`$${value}B`, '']} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FY3Q25" fill="#94a3b8" name="FY3Q25" radius={[0, 2, 2, 0]} />
              <Bar dataKey="FY3Q26가이던스" fill="#3b82f6" name="FY3Q26 가이던스" radius={[0, 2, 2, 0]} />
              <Bar dataKey="Consensus" fill="#f59e0b" name="Consensus" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default CloudThreeCharts;
