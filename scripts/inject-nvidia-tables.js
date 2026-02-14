/**
 * Inject Nvidia FY26 3Q 실적 요약 & FY26 4Q 가이던스 tables into post id 2.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const base = 'border border-slate-200 dark:border-white/10 p-2 text-right';
const left = 'border border-slate-200 dark:border-white/10 p-2 text-left';
const blue = ' bg-sky-100 dark:bg-sky-900/40';
const green = ' bg-emerald-100 dark:bg-emerald-900/30';
const red = ' text-rose-600 dark:text-rose-400';

function td(val, isCol4, isCol5, isRed) {
  let cls = base;
  if (isCol4) cls += blue;
  if (isCol5) cls += green;
  if (isRed) cls += red;
  return `<td class="${cls}">${val}</td>`;
}

function th(col4Highlight, col5Highlight) {
  const c4 = col4Highlight ? blue : '';
  const c5 = col5Highlight ? green : '';
  return (
    '<tr>' +
    `<th class="${left}">항목</th>` +
    `<th class="${base}">FY3Q25</th>` +
    `<th class="${base}">FY2Q26</th>` +
    `<th class="${base + c4}">FY3Q26</th>` +
    `<th class="${base + c5}">Consensus</th>` +
    `<th class="${base}">QoQ</th>` +
    `<th class="${base}">YoY</th>` +
    '</tr>'
  );
}

// Table 1: FY26 3Q 실적 요약 (단위: 백만달러, 달러)
const rows1 = [
  { label: '매출액', v1: '35,082', v2: '46,743', v3: '57,006', v4: '55,189', qoq: '22.0%', yoy: '62.5%', red: false },
  { label: '데이터센터', v1: '30,771', v2: '41,096', v3: '51,215', v4: '49,342', qoq: '24.6%', yoy: '66.4%', red: false },
  { label: '연산', v1: '27,644', v2: '33,844', v3: '43,028', v4: '41,609', qoq: '27.1%', yoy: '55.7%', red: false, sub: true },
  { label: '네트워킹', v1: '3,127', v2: '7,252', v3: '8,187', v4: '7,745', qoq: '12.9%', yoy: '161.8%', red: false, sub: true },
  { label: '네트워킹/연산 비중(%)', v1: '11.3%', v2: '21.4%', v3: '19.0%', v4: '18.6%', qoq: '-2.4%p', yoy: '7.7%p', red: false },
  { label: '게이밍', v1: '3,279', v2: '4,287', v3: '4,265', v4: '4,424', qoq: '-0.5%', yoy: '30.1%', red: true },
  { label: '전문시각화', v1: '486', v2: '601', v3: '760', v4: '612', qoq: '26.5%', yoy: '56.4%', red: false },
  { label: '자동차', v1: '449', v2: '586', v3: '592', v4: '620', qoq: '1.0%', yoy: '31.8%', red: true },
  { label: 'OEM & IP', v1: '97', v2: '173', v3: '174', v4: '161', qoq: '0.6%', yoy: '79.4%', red: false },
  { label: '매출총이익', v1: '26,322', v2: '33,960', v3: '41,967', v4: '40,619', qoq: '23.6%', yoy: '59.4%', red: false },
  { label: '매출총이익률', v1: '75.0%', v2: '72.7%', v3: '73.6%', v4: '73.6%', qoq: '1.0%p', yoy: '-1.4%p', red: false },
  { label: '매출총이익률 *H20 제외', v1: '–', v2: '72.3%', v3: '–', v4: '–', qoq: '–', yoy: '–', red: false },
  { label: '영업비용', v1: '3,046', v2: '3,795', v3: '4,215', v4: '4,216', qoq: '11.1%', yoy: '38.4%', red: true },
  { label: 'R&D (GAAP)', v1: '3,390', v2: '3,071', v3: '4,705', v4: '4,662', qoq: '53.2%', yoy: '38.8%', red: true, sub: true },
  { label: 'SG&A (GAAP)', v1: '897', v2: '739', v3: '1,134', v4: '–', qoq: '53.5%', yoy: '26.4%', red: false, sub: true },
  { label: '영업이익', v1: '23,276', v2: '30,165', v3: '37,752', v4: '36,486', qoq: '25.2%', yoy: '62.2%', red: false },
  { label: '영업이익률', v1: '66.3%', v2: '64.5%', v3: '66.2%', v4: '66.1%', qoq: '1.7%p', yoy: '-0.1%p', red: false },
  { label: '순이익', v1: '20,010', v2: '25,783', v3: '31,767', v4: '30,886', qoq: '23.2%', yoy: '58.8%', red: false },
  { label: 'EPS', v1: '0.81', v2: '1.05', v3: '1.30', v4: '1.25', qoq: '23.8%', yoy: '60.5%', red: false },
  { label: 'EPS *H20 제외', v1: '–', v2: '1.04', v3: '–', v4: '–', qoq: '–', yoy: '–', red: false },
];

const tbody1 = rows1
  .map(
    (r) =>
      '<tr>' +
      `<td class="${left}${r.sub ? ' pl-5 text-slate-600 dark:text-slate-400' : ''}">${r.label}</td>` +
      td(r.v1, false, false, false) +
      td(r.v2, false, false, false) +
      td(r.v3, true, false, r.red) +
      td(r.v4, false, true, false) +
      td(r.qoq, false, false, false) +
      td(r.yoy, false, false, false) +
      '</tr>'
  )
  .join('\n');

const table1 = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[720px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">Nvidia 의 FY26 3분기 ('25.08~'25.10) 실적 요약</caption>
<thead>
${th(true, true)}
</thead>
<tbody>
${tbody1}
</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 pb-2">(단위: 백만달러, 달러) 자료: Nvidia, Bloomberg (주: 이익지표는 모두 비 GAAP) (Compute: 연산, Networking: 네트워킹)</p>
</div>`.trim();

// Table 2: FY26 4Q 가이던스 (단위: 십억달러, 달러)
function th2() {
  return (
    '<tr>' +
    `<th class="${left}">항목</th>` +
    `<th class="${base}">FY4Q25</th>` +
    `<th class="${base + green}">FY4Q26 가이던스</th>` +
    `<th class="${base + green}">Consensus</th>` +
    `<th class="${base}">YoY</th>` +
    '</tr>'
  );
}

const rows2 = [
  { label: '매출액', v1: '39', v2: '65.0', v3: '61.99', yoy: '65.3%' },
  { label: '매출총이익률', v1: '73.5%', v2: '75.0%', v3: '74.6%', yoy: '1.5%p' },
  { label: '영업비용', v1: '3.4', v2: '5.0', v3: '4.38', yoy: '48.0%' },
  { label: 'CapEx', v1: '1', v2: '–', v3: '1.59', yoy: '–' },
];

const tbody2 = rows2
  .map(
    (r) =>
      '<tr>' +
      `<td class="${left}">${r.label}</td>` +
      `<td class="${base}">${r.v1}</td>` +
      `<td class="${base + green}">${r.v2}</td>` +
      `<td class="${base + green}">${r.v3}</td>` +
      `<td class="${base}">${r.yoy}</td>` +
      '</tr>'
  )
  .join('\n');

const table2 = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[480px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">Nvidia 의 FY26 4분기 ('25.11~'26.01) 가이던스</caption>
<thead>
${th2()}
</thead>
<tbody>
${tbody2}
</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 pb-2">(단위: 십억달러, 달러) 자료: Nvidia, Bloomberg. YoY 증가율은 중간값 기준, 가이던스 모두 비 GAAP.</p>
</div>`.trim();

const tablesHtml = table1 + '\n\n' + table2;

const needle =
  '알림 서비스로 예상치 못한 급등·급락 시 재검토하는 방식을 추천한다.</p><h2>결론 및 투자 유의사항</h2>';
const replacement =
  '알림 서비스로 예상치 못한 급등·급락 시 재검토하는 방식을 추천한다.</p>' + tablesHtml + '<h2>결론 및 투자 유의사항</h2>';

const post = posts.find((p) => p.id === 2);
if (!post) {
  console.error('Post id 2 not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected Nvidia FY26 3Q/4Q tables into post id 2 (엔비디아 2026년 실적 전망과 밸류에이션).');
