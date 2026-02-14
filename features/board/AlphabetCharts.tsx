/**
 * 알파벳(GOOGL) 사업부문별 매출 추이 & Google Services 매출/영업이익
 * '알파벳(GOOGL), 검색·유튜브·클라우드가 2026년 실적에 미치는 영향' 게시글 전용.
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
} from 'recharts';

// LTM Revenue (Billions). Stack order: Search(bottom), Cloud, Subscriptions, YouTube, Network(top)
const ltmData = [
  { period: "Sep '20", search: 99, cloud: 20, subs: 18, yt: 22, network: 12 },
  { period: "Dec '20", search: 104, cloud: 22, subs: 20, yt: 23, network: 13 },
  { period: "Mar '21", search: 111, cloud: 14, subs: 24, yt: 25, network: 22 },
  { period: "Jun '21", search: 126, cloud: 16, subs: 25, yt: 25, network: 28 },
  { period: "Sep '21", search: 138, cloud: 17, subs: 27, yt: 28, network: 28 },
  { period: "Dec '21", search: 149, cloud: 19, subs: 28, yt: 29, network: 32 },
  { period: "Mar '22", search: 157, cloud: 21, subs: 28, yt: 29, network: 33 },
  { period: "Jun '22", search: 162, cloud: 23, subs: 28, yt: 30, network: 34 },
  { period: "Sep '22", search: 163, cloud: 25, subs: 28, yt: 30, network: 34 },
  { period: "Dec '22", search: 162, cloud: 26, subs: 29, yt: 30, network: 33 },
  { period: "Mar '23", search: 163, cloud: 28, subs: 29, yt: 29, network: 32 },
  { period: "Jun '23", search: 165, cloud: 30, subs: 31, yt: 29, network: 32 },
  { period: "Sep '23", search: 170, cloud: 31, subs: 33, yt: 30, network: 31 },
  { period: "Dec '23", search: 175, cloud: 33, subs: 35, yt: 32, network: 31 },
  { period: "Mar '24", search: 181, cloud: 35, subs: 36, yt: 33, network: 31 },
  { period: "Jun '24", search: 187, cloud: 38, subs: 37, yt: 34, network: 30 },
  { period: "Sep '24", search: 192, cloud: 40, subs: 40, yt: 35, network: 31 },
  { period: "Dec '24", search: 198, cloud: 43, subs: 42, yt: 36, network: 30 },
  { period: "Mar '25", search: 203, cloud: 46, subs: 44, yt: 37, network: 28 },
  { period: "Jun '25", search: 208, cloud: 49, subs: 46, yt: 38, network: 29 },
  { period: "Sep '25", search: 215, cloud: 53, subs: 49, yt: 39, network: 28 },
];

const ltmTotals = ltmData.map((d) => d.search + d.cloud + d.subs + d.yt + d.network);

// Google Services Revenues (Q3'24, Q3'25) in $MM. Stack: Search, Subscriptions, Network, YouTube
const servicesRevenueData = [
  { quarter: "Q3'24", search: 49385, subs: 8921, network: 7548, yt: 10656 },
  { quarter: "Q3'25", search: 56567, subs: 10261, network: 7354, yt: 12870 },
];

const servicesRevenueTotals = [76510, 87052];

// Operating Income ($MM)
const opIncomeData = [
  { quarter: "Q3'24", value: 30856 },
  { quarter: "Q3'25", value: 33527 },
];

const LEGEND_LTM = [
  { key: 'search', name: 'Google Search and Other', change: '116.92%', cagr: '16.7%', fill: '#2563eb' },
  { key: 'cloud', name: 'Google Cloud', change: '347.53%', cagr: '34.9%', fill: '#ea580c' },
  { key: 'subs', name: 'Subscriptions, Platforms & Devices', change: '127.01%', cagr: '17.8%', fill: '#7c3aed' },
  { key: 'yt', name: 'YouTube Ads', change: '124.14%', cagr: '17.5%', fill: '#dc2626' },
  { key: 'network', name: 'Google Network', change: '37.80%', cagr: '6.6%', fill: '#16a34a' },
];

export const AlphabetCharts: React.FC = () => {
  return (
    <div className="mt-10 space-y-10">
      {/* Chart 1: Alphabet 사업부문별 매출 추이 (LTM) */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
          &lt;그림 4&gt; Alphabet 사업부문별 매출 추이
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Alphabet Inc. (GOOGL) · LTM Revenue (Billions)</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={ltmData} margin={{ top: 28, right: 16, left: 8, bottom: 8 }} barCategoryGap="4%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis dataKey="period" tick={{ fontSize: 9, fill: 'currentColor' }} className="text-slate-500 dark:text-slate-400" />
            <YAxis domain={[0, 500]} ticks={[0, 100, 200, 300, 400, 500]} tick={{ fontSize: 10, fill: 'currentColor' }} width={32} />
            <Tooltip
              formatter={(value: number, name: string) => [`$${value}B`, LEGEND_LTM.find((l) => l.key === name)?.name ?? name]}
              labelFormatter={(label, payload) => {
                const idx = ltmData.findIndex((d) => d.period === label);
                const total = idx >= 0 ? ltmTotals[idx] : 0;
                return `${label} · Total: $${total}B`;
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value) => {
                const L = LEGEND_LTM.find((l) => l.key === value);
                return L ? `${L.name} (${L.change}, CAGR ${L.cagr})` : value;
              }}
            />
            <Bar dataKey="search" stackId="ltm" fill="#2563eb" name="search" />
            <Bar dataKey="cloud" stackId="ltm" fill="#ea580c" name="cloud" />
            <Bar dataKey="subs" stackId="ltm" fill="#7c3aed" name="subs" />
            <Bar dataKey="yt" stackId="ltm" fill="#dc2626" name="yt" />
            <Bar dataKey="network" stackId="ltm" fill="#16a34a" name="network">
              <LabelList
                dataKey="network"
                position="top"
                formatter={(_: number, __: string, props: { payload: (typeof ltmData)[0] }) => {
                  const p = props.payload;
                  const t = (p?.search ?? 0) + (p?.cloud ?? 0) + (p?.subs ?? 0) + (p?.yt ?? 0) + (p?.network ?? 0);
                  return t ? `${t}` : '';
                }}
                className="fill-slate-700 dark:fill-slate-300 text-[10px]"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">자료: Alphabet, Fiscal.ai</p>
      </div>

      {/* Chart 2: Google Services Revenues & Operating Income */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 md:p-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
          &lt;그림 1&gt; Alphabet 서비스 부문 매출/영업이익
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">in Millions, except Percentages; unaudited</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Google Services Revenues</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Revenues ($MM)</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={servicesRevenueData} margin={{ top: 20, right: 8, left: 8, bottom: 8 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: 'currentColor' }} />
                <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [`$${value.toLocaleString()} MM`, name === 'search' ? 'Google Search & Other' : name === 'yt' ? 'YouTube Ads' : name === 'network' ? 'Google Network' : 'Subscriptions, Platforms & Devices']}
                  labelFormatter={(label) => label}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => ({ search: 'Google Search & Other', yt: 'YouTube Ads', network: 'Google Network', subs: 'Subscriptions, Platforms & Devices' }[v as string] ?? v)} />
                <Bar dataKey="search" stackId="svc" fill="#dc2626" name="search" />
                <Bar dataKey="subs" stackId="svc" fill="#94a3b8" name="subs" />
                <Bar dataKey="network" stackId="svc" fill="#f472b6" name="network" />
                <Bar dataKey="yt" stackId="svc" fill="#475569" name="yt" />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Q3&apos;24 Y/Y +13% · Q3&apos;25 Y/Y +14%</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Y/Y: Search +15%, Subscriptions +15%, Network -3%, YouTube +21%</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Operating Income</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Operating Income ($MM)</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={opIncomeData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: 'currentColor' }} />
                <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()} MM`, '']} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Bar dataKey="value" fill="#dc2626" radius={[2, 2, 0, 0]} barSize={48}>
                  <LabelList dataKey="value" position="top" formatter={(v: number) => v.toLocaleString()} className="fill-slate-700 dark:fill-slate-300 text-xs" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Q3&apos;24 Operating Margin 40.3% · Q3&apos;25 38.5%</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">* Q3&apos;25 includes EC fine $3.5B (three months ended Sep 30, 2025)</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4">자료: Alphabet</p>
      </div>
    </div>
  );
};

export default AlphabetCharts;
