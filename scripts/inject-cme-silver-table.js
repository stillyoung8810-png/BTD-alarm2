/**
 * CME 그룹 은창고 내고보고서(Silver Vault Report) 표를 은가격 글(id 32) 본문에 삽입.
 * 상하이 증거금 표 직후, "주식 시장으로의 전달" h2 직전에 삽입.
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

const cmeTableHtml = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[360px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">CME 그룹 은창고 내고보고서 (Silver Vault Report)</caption>
<thead>
<tr>
<th class="${head} text-left">구분</th>
<th class="${head} text-right">수치</th>
<th class="${head} text-right">24h 변동</th>
</tr>
</thead>
<tbody>
<tr><td class="${left}">TOTAL SUPPLY</td><td class="${base}">371,973,490</td><td class="${base}">-4,461,498</td></tr>
<tr><td class="${left}">REGISTERED</td><td class="${base}">92,154,869</td><td class="${base}">-745,098</td></tr>
<tr><td class="${left}">ELIGIBLE</td><td class="${base}">279,818,621</td><td class="${base}">-3,716,401</td></tr>
<tr><td class="${left}">DEMAND</td><td class="${base}">22,975,000</td><td class="${base}">–</td></tr>
</tbody>
</table>
<table class="w-full min-w-[360px] text-sm border-collapse text-slate-700 dark:text-slate-300 mt-4">
<thead>
<tr>
<th class="${head} text-left">Paper vs Physical (HIGH LEVERAGE)</th>
<th class="${head} text-right">수치</th>
<th class="${head} text-right">비고</th>
</tr>
</thead>
<tbody>
<tr><td class="${left}">PAPER CLAIMS</td><td class="${base}">657,615,000</td><td class="${left}">131,523 contracts</td></tr>
<tr><td class="${left}">PHYSICAL METAL</td><td class="${base}">92,154,869</td><td class="${left}">registered oz</td></tr>
</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-2 pb-2 mt-2">물리 1oz당 페이퍼 클레임 약 7.14배. 레버리지가 높아 실물 인도 수급 압박에 취약할 수 있다. (Elevated leverage: 7.1x paper claims per unit of physical. Market is vulnerable to delivery squeezes.)</p>
</div>`.trim();

// 상하이 표 블록이 끝나는 </div> 다음, h2 직전에 CME 표 삽입
const needle = '\n</div><h2>주식 시장으로의 전달: 광산주·태양광·전지</h2>';
const replacement = '\n</div>' + cmeTableHtml + '<h2>주식 시장으로의 전달: 광산주·태양광·전지</h2>';

const post = posts.find((p) => p.id === 32);
if (!post) {
  console.error('Post id 32 (은가격 글) not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content. Check exact string after Shanghai table.');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected CME Silver Vault Report table into post id 32 (국제 은가격 변동).');
