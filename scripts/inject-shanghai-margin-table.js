/**
 * 상하이 선물거래소 증거금 인상 표를 은가격 글(id 32) 본문에 삽입.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const base = 'border border-slate-200 dark:border-white/10 p-2 text-right';
const left = 'border border-slate-200 dark:border-white/10 p-2 text-left';
const head = 'border border-slate-200 dark:border-white/10 p-2 font-semibold bg-slate-100 dark:bg-slate-800/50';

const rows = [
  { date: '2025년 10월 21일', hedge: '15%', invest: '16%' },
  { date: '2025년 12월 12일', hedge: '17%', invest: '17%' },
  { date: '2026년 1월 28일', hedge: '–', invest: '18%' },
  { date: '2026년 2월 3일', hedge: '18%', invest: '19%' },
  { date: '2026년 2월 4일', hedge: '20%', invest: '21%' },
  { date: '2026년 2월 9일', hedge: '21%', invest: '22%' },
];

const tbody = rows
  .map(
    (r) =>
      '<tr>' +
      `<td class="${left}">${r.date}</td>` +
      `<td class="${base}">${r.hedge}</td>` +
      `<td class="${base}">${r.invest}</td>` +
      '</tr>'
  )
  .join('\n');

const tableHtml = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[360px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">상하이 선물거래소 증거금 인상 추이</caption>
<thead>
<tr>
<th class="${head} text-left">날짜</th>
<th class="${head} text-right">헤지 증거금</th>
<th class="${head} text-right">투자 증거금</th>
</tr>
</thead>
<tbody>
${tbody}
</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 pb-2">2025년 10월 21일 이후 상하이 선물거래소는 현재까지 6번 증거금을 인상했다. (단위: %)</p>
</div>`.trim();

const needle =
  '한국 투자자가 국내 상장 원자재·광산주를 볼 때는 환율과 국제 선물 가격의 시차를 염두에 두는 것이 좋다.</p><h2>주식 시장으로의 전달: 광산주·태양광·전지</h2>';
const replacement =
  '한국 투자자가 국내 상장 원자재·광산주를 볼 때는 환율과 국제 선물 가격의 시차를 염두에 두는 것이 좋다.</p>' +
  tableHtml +
  '<h2>주식 시장으로의 전달: 광산주·태양광·전지</h2>';

const post = posts.find((p) => p.id === 32);
if (!post) {
  console.error('Post id 32 (은가격 글) not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected Shanghai Futures Exchange margin table into post id 32 (국제 은가격 변동).');
