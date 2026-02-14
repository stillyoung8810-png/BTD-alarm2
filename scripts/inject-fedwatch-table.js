/**
 * Inject CME Fed Watch (Aggregated Meeting Probabilities) table into post id 3.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

// 각 행: date, a~e 확률, aBlue/aYellow 등 (최대=파랑, 차순=노랑), change/total
const rows = [
  { date: '2025-12-10', a: '0.00', b: '0.00', c: '0.00', d: '71.00', e: '29.00', dBlue: true, eYellow: true, change: '-0.25%', total: '-1.75%' },
  { date: '2026-01-28', a: '0.00', b: '0.00', c: '2.00', d: '98.00', e: '0.00', cYellow: true, dBlue: true, change: '', total: '' },
  { date: '2026-03-18', a: '0.00', b: '0.00', c: '44.97', d: '55.03', e: '0.00', cYellow: true, dBlue: true, change: '', total: '' },
  { date: '2026-04-29', a: '0.00', b: '0.00', c: '76.00', d: '24.00', e: '0.00', cBlue: true, dYellow: true, change: '-0.25%', total: '-2.0%' },
  { date: '2026-06-17', a: '0.00', b: '41.52', c: '58.48', d: '0.00', e: '0.00', bYellow: true, cBlue: true, change: '', total: '' },
  { date: '2026-07-29', a: '0.00', b: '80.00', c: '20.00', d: '0.00', e: '0.00', bBlue: true, cYellow: true, change: '-0.25%', total: '-2.25%' },
  { date: '2026-09-16', a: '21.64', b: '78.36', c: '0.00', d: '0.00', e: '0.00', aYellow: true, bBlue: true, change: '', total: '' },
  { date: '2026-10-28', a: '46.00', b: '54.00', c: '0.00', d: '0.00', e: '0.00', aYellow: true, bBlue: true, change: '', total: '' },
  { date: '2026-12-09', a: '69.11', b: '30.89', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '-0.25%', total: '-2.5%' },
  { date: '2027-01-27', a: '76.00', b: '24.00', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
  { date: '2027-03-17', a: '82.29', b: '17.71', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
  { date: '2027-04-28', a: '78.00', b: '22.00', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
  { date: '2027-06-09', a: '75.50', b: '24.50', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
  { date: '2027-07-28', a: '60.00', b: '40.00', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
  { date: '2027-09-15', a: '59.19', b: '40.81', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
  { date: '2027-10-27', a: '50.00', b: '50.00', c: '0.00', d: '0.00', e: '0.00', aBlue: true, bYellow: true, change: '', total: '' },
];

const cell = (val, isBlue, isYellow) => {
  let cls = 'border border-slate-200 dark:border-white/10 p-2 text-right';
  if (isBlue) cls += ' bg-sky-100 dark:bg-sky-900/40';
  if (isYellow) cls += ' bg-amber-100 dark:bg-amber-900/30';
  return `<td class="${cls}">${val}</td>`;
};

const tbody = rows
  .map(
    (r) =>
      '<tr>' +
      `<td class="border border-slate-200 dark:border-white/10 p-2">${r.date}</td>` +
      cell(r.a, r.aBlue, r.aYellow) +
      cell(r.b, r.bBlue, r.bYellow) +
      cell(r.c, r.cBlue, r.cYellow) +
      cell(r.d, r.dBlue, r.dYellow) +
      cell(r.e, r.eBlue, r.eYellow) +
      (r.change
        ? `<td class="border border-slate-200 dark:border-white/10 p-2 text-right text-rose-600 dark:text-rose-400 text-xs">${r.change}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right text-rose-600 dark:text-rose-400 text-xs">${r.total}</td>`
        : '<td class="border border-slate-200 dark:border-white/10 p-2 text-right text-slate-400">-</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right text-slate-400">-</td>') +
      '</tr>'
  )
  .join('\n');

const tableHtml = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[640px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">Fed Watch (Source: CME Group)</caption>
<thead>
<tr>
<th class="border border-slate-200 dark:border-white/10 p-2 text-left">MEETING DATE</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">275-300</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">300-325</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">325-350</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">350-375</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">375-400</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right text-xs">변동</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right text-xs">누적</th>
</tr>
</thead>
<tbody>
${tbody}
</tbody>
</table>
</div>
<p class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">CME FEDWATCH TOOL - AGGREGATED MEETING PROBABILITIES (단위: %, 펀드금리 목표구간 bp)</p>
<p class="text-[10px] text-slate-500 dark:text-slate-400 max-w-2xl">The Fedwatch tool's "Aggregated" view compares the rates implied by CME's Fed Funds futures with the current target rate range as set by the Federal Reserve. As such, it provides a view into the cumulative number of hikes or cuts that the market is pricing by a certain point in the future.</p>
`.trim();

const needle =
  "원칙대로 행동하는 데 유리하다.</p><h2>결론 및 투자 유의사항</h2>";
const replacement =
  "원칙대로 행동하는 데 유리하다.</p>" + tableHtml + "<h2>결론 및 투자 유의사항</h2>";

const post = posts.find((p) => p.id === 3);
if (!post) {
  console.error('Post id 3 not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected Fed Watch table into post id 3 (2026년 미국 금리 전망).');
