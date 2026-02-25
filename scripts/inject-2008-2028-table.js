/**
 * 2008 vs 2028 모기지 우려 비교 표를 시트리니·AI 버블 글(id 37) 본문에 삽입.
 * "2026년에 챙길 포인트와 리스크 관리" 섹션 직후, "투자자의 시각에서 본 결론" h2 직전에 삽입.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const cell = 'border border-slate-200 dark:border-white/10 p-3 text-left text-sm text-slate-700 dark:text-slate-300';
const head = 'border border-slate-200 dark:border-white/10 p-3 font-semibold bg-slate-100 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-300';
const label = 'border border-slate-200 dark:border-white/10 p-3 font-medium bg-slate-50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 text-sm w-28';

const tableHtml = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[560px] border-collapse">
<caption class="text-left font-bold py-2 px-3 text-slate-700 dark:text-slate-300">2008 vs. 2028: Mortgage Concerns</caption>
<thead>
<tr>
<th class="${label}">구분</th>
<th class="${head}">2008: Subprime Crisis (Credit Quality)</th>
<th class="${head}">2028: AI Displacement Crisis (Income Stability)</th>
</tr>
</thead>
<tbody>
<tr><td class="${label}">Origination</td><td class="${cell}">Bad loans with no-doc, NINJA, stated income</td><td class="${cell}">Good loans with real income, real docs, real down payments</td></tr>
<tr><td class="${label}">Borrower profile</td><td class="${cell}">Subprime, low FICO, minimal savings</td><td class="${cell}">Prime/super-prime, high FICO, savings buffers</td></tr>
<tr><td class="${label}">Trigger</td><td class="${cell}">Rates reset, payments spike</td><td class="${cell}">Income permanently impaired by AI displacement</td></tr>
<tr><td class="${label}">Detection</td><td class="${cell}">Delinquencies visible almost immediately</td><td class="${cell}">Delinquencies variable and timing masked by HELOC draws, 401k withdrawals, credit card bridging</td></tr>
<tr><td class="${label}">Geography</td><td class="${cell}">Broad, sunbelt sprawl (Phoenix, Las Vegas, inland CA)</td><td class="${cell}">Concentrated in tech/finance hubs (SF, NYC, Seattle, Manhattan, Austin)</td></tr>
<tr><td class="${label}">Resolution path</td><td class="${cell}">Write down bad loans, punish fraud</td><td class="${cell}">Technology keeps improving preventing underwriting, pool of new buyers continues to shrink</td></tr>
</tbody>
</table>
<p class="text-[10px] text-slate-500 dark:text-slate-400 px-3 pb-2 mt-2">출처: Citrini Research. 2008 서브프라임 위기와 2028 AI 대체 위기(소득 안정성) 비교.</p>
</div>`.trim();

const needle = '</p><h2>투자자의 시각에서 본 결론</h2>';
const replacement = '</p>' + tableHtml + '<h2>투자자의 시각에서 본 결론</h2>';

const post = posts.find((p) => p.id === 37);
if (!post) {
  console.error('Post id 37 (시트리니·AI 버블 글) not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content. Check exact string.');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected 2008 vs 2028 Mortgage Concerns table into post id 37 (시트리니 보고서와 AI 버블?).');
