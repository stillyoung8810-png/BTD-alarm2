/**
 * Inject Samsung Electronics 사업부문별 매출·영업이익 tables into post id 4.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const base = 'border border-slate-200 dark:border-white/10 p-2 text-right';
const left = 'border border-slate-200 dark:border-white/10 p-2 text-left';
const labelBlue = ' bg-sky-100 dark:bg-sky-900/40';

function labelCell(text, indent = 0) {
  const pad = indent === 2 ? ' pl-6' : indent === 1 ? ' pl-4' : '';
  return `<td class="${left}${labelBlue}${pad}">${text}</td>`;
}
function dataCell(v) {
  return `<td class="${base}">${v}</td>`;
}

// ----- 매출 (Revenue) table -----
const revHeader =
  '<tr>' +
  `<th class="${left}${labelBlue}">(단위: 조원)</th>` +
  `<th class="${base}">4Q \'24</th><th class="${base}">3Q \'25</th><th class="${base}">4Q \'25</th>` +
  `<th class="${base}">QoQ</th><th class="${base}">YoY</th>` +
  `<th class="${base}">FY \'24</th><th class="${base}">FY \'25</th><th class="${base}">YoY</th>` +
  '</tr>';

const revRows = [
  { label: '총액', q1: '75.8', q2: '86.1', q3: '93.8', qoq: '9%↑', yoy: '24%↑', fy1: '300.9', fy2: '333.6', fyyoy: '11%↑', indent: 0 },
  { label: 'DX부문', q1: '40.5', q2: '48.4', q3: '44.3', qoq: '8%↓', yoy: '9%↑', fy1: '174.9', fy2: '188.0', fyyoy: '7%↑', indent: 0 },
  { label: 'MX/네트워크', q1: '25.8', q2: '34.1', q3: '29.3', qoq: '14%↓', yoy: '13%↑', fy1: '117.3', fy2: '129.5', fyyoy: '10%↑', indent: 1 },
  { label: 'MX', q1: '25.0', q2: '33.5', q3: '28.3', qoq: '16%↓', yoy: '13%↑', fy1: '114.4', fy2: '126.5', fyyoy: '11%↑', indent: 2 },
  { label: 'VD/DA 등', q1: '14.4', q2: '13.9', q3: '14.8', qoq: '6%↑', yoy: '2%↑', fy1: '56.5', fy2: '57.3', fyyoy: '1%↑', indent: 1 },
  { label: 'VD', q1: '8.6', q2: '7.3', q3: '8.8', qoq: '20%↑', yoy: '2%↑', fy1: '30.9', fy2: '30.9', fyyoy: '0.2%↓', indent: 2 },
  { label: 'DS부문', q1: '30.1', q2: '33.1', q3: '44.0', qoq: '33%↑', yoy: '46%↑', fy1: '111.1', fy2: '130.1', fyyoy: '17%↑', indent: 0 },
  { label: '메모리', q1: '23.0', q2: '26.7', q3: '37.1', qoq: '39%↑', yoy: '62%↑', fy1: '84.5', fy2: '104.1', fyyoy: '23%↑', indent: 1 },
  { label: 'SDC', q1: '8.1', q2: '8.1', q3: '9.5', qoq: '17%↑', yoy: '17%↑', fy1: '29.2', fy2: '29.8', fyyoy: '2%↑', indent: 0 },
  { label: 'Harman', q1: '3.9', q2: '4.0', q3: '4.6', qoq: '16%↑', yoy: '17%↑', fy1: '14.3', fy2: '15.8', fyyoy: '11%↑', indent: 0 },
];

const revTbody = revRows
  .map(
    (r) =>
      '<tr>' +
      labelCell(r.label, r.indent) +
      dataCell(r.q1) + dataCell(r.q2) + dataCell(r.q3) +
      dataCell(r.qoq) + dataCell(r.yoy) +
      dataCell(r.fy1) + dataCell(r.fy2) + dataCell(r.fyyoy) +
      '</tr>'
  )
  .join('\n');

// ----- 영업이익 (Operating Profit) table -----
const opHeader =
  '<tr>' +
  `<th class="${left}${labelBlue}">(단위: 조원)</th>` +
  `<th class="${base}">4Q \'24</th><th class="${base}">3Q \'25</th><th class="${base}">4Q \'25</th>` +
  `<th class="${base}">QoQ</th><th class="${base}">YoY</th>` +
  `<th class="${base}">FY \'24</th><th class="${base}">FY \'25</th><th class="${base}">YoY</th>` +
  '</tr>';

const opRows = [
  { label: '총액', q1: '6.5', q2: '12.2', q3: '20.1', qoq: '7.9↑', yoy: '13.6↑', fy1: '32.7', fy2: '43.6', fyyoy: '10.9↑', indent: 0 },
  { label: 'DX부문', q1: '2.3', q2: '3.5', q3: '1.3', qoq: '2.1↓', yoy: '0.9↓', fy1: '12.4', fy2: '12.9', fyyoy: '0.4↑', indent: 0 },
  { label: 'MX/네트워크', q1: '2.1', q2: '3.6', q3: '1.9', qoq: '1.6↓', yoy: '0.2↓', fy1: '10.6', fy2: '12.9', fyyoy: '2.2↑', indent: 1 },
  { label: 'VD/DA 등', q1: '0.2', q2: '(0.1)', q3: '(0.6)', qoq: '0.5↓', yoy: '0.8↓', fy1: '1.7', fy2: '(0.2)', fyyoy: '1.9↓', indent: 1 },
  { label: 'DS부문', q1: '2.9', q2: '7.0', q3: '16.4', qoq: '9.4↑', yoy: '13.5↑', fy1: '15.1', fy2: '24.9', fyyoy: '9.8↑', indent: 0 },
  { label: 'SDC', q1: '0.9', q2: '1.2', q3: '2.0', qoq: '0.7↑', yoy: '1.1↑', fy1: '3.7', fy2: '4.1', fyyoy: '0.4↑', indent: 0 },
  { label: 'Harman', q1: '0.4', q2: '0.4', q3: '0.3', qoq: '0.1↓', yoy: '0.1↓', fy1: '1.3', fy2: '1.5', fyyoy: '0.2↑', indent: 0 },
];

const opTbody = opRows
  .map(
    (r) =>
      '<tr>' +
      labelCell(r.label, r.indent) +
      dataCell(r.q1) + dataCell(r.q2) + dataCell(r.q3) +
      dataCell(r.qoq) + dataCell(r.yoy) +
      dataCell(r.fy1) + dataCell(r.fy2) + dataCell(r.fyyoy) +
      '</tr>'
  )
  .join('\n');

const footnotes = [
  '각 사업군별 매출 및 영업이익은 2021년 12월 조직개편 기준으로 작성되었으며, 부문별 매출은 부문간 내부 매출을 포함하고 있음',
  'DX 부문은 투자자 혼선 방지 및 이해 제고 차원에서 개편전 기준 사업별 실적정보 제공',
  'DX: Device eXperience, MX: Mobile eXperience, DS: Device Solutions',
  'VD/DA 등의 매출 및 영업이익은 의료기기 사업부 실적을 포함하고 있음',
  'Harman의 매출 및 영업이익은 삼성전자 회계연도를 기준으로 작성되었으며, 인수와 관련된 비용이 반영되어 있음',
];

const table1 = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<p class="text-xs font-bold text-slate-600 dark:text-slate-400 py-2 px-2">&lt;그림 3&gt; 삼성전자 사업부문별 매출 및 영업이익</p>
<p class="text-[11px] text-slate-500 dark:text-slate-400 px-2 -mt-1 mb-1">매출</p>
<table class="w-full min-w-[720px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<thead>${revHeader}</thead>
<tbody>${revTbody}</tbody>
</table>
</div>`.trim();

const table2 = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[720px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<thead>${opHeader}</thead>
<tbody>${opTbody}</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 py-2 space-y-1">
${footnotes.map((f) => f).join('<br />')}
</p>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 pb-2">자료: 삼성전자</p>
</div>`.trim();

// Put caption only on first table; second table is "영업이익" so we could add a small subtitle
const table2WithTitle = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<p class="text-xs font-bold text-slate-600 dark:text-slate-400 py-2 px-2">영업이익</p>
<table class="w-full min-w-[720px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<thead>${opHeader}</thead>
<tbody>${opTbody}</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 py-2 space-y-1">
${footnotes.map((f) => f).join('<br />')}
</p>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 pb-2">자료: 삼성전자</p>
</div>`.trim();

const tablesHtml = table1 + '\n\n' + table2WithTitle;

const needle =
  '리밸런싱 여부를 판단하는 방식을 추천한다.</p><h2>결론 및 투자 유의사항</h2>';
const replacement =
  '리밸런싱 여부를 판단하는 방식을 추천한다.</p>' + tablesHtml + '<h2>결론 및 투자 유의사항</h2>';

const post = posts.find((p) => p.id === 4);
if (!post) {
  console.error('Post id 4 not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected Samsung Electronics 매출/영업이익 tables into post id 4 (삼성전자 HBM·파운드리).');
