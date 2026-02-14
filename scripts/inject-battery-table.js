/**
 * Inject "표 1. 코스닥 상장 2차전지 섹터 Peer Valuation 테이블" into post id 13.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const rows = [
  { name: '에코프로비엠', ticker: '247540.KQ', category: '양극재', cap: '20,440', fnguide: 'O', pe26: '69.6', pe27: '56.4', ev26: '31.1', ev27: '26.9' },
  { name: '에코프로', ticker: '086520.KQ', category: '양극재', cap: '17,678', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '엔켐', ticker: '348370.KQ', category: '전해액', cap: '1,593', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '대주전자재료', ticker: '078600.KQ', category: '음극재', cap: '1,178', fnguide: 'O', pe26: '30.7', pe27: '26.7', ev26: '20.6', ev27: '17.7' },
  { name: '피엔티', ticker: '137400.KQ', category: '2차전지 장비', cap: '1,131', fnguide: 'X', pe26: '6.7', pe27: '9.3', ev26: '-', ev27: '-' },
  { name: '솔브레인홀딩스', ticker: '036830.KQ', category: '전해액', cap: '895', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '씨아이에스', ticker: '222080.KQ', category: '2차전지 장비', cap: '820', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '성일하이텍', ticker: '365340.KQ', category: '광물', cap: '789', fnguide: 'O', pe26: '41.2', pe27: '13.9', ev26: '18.9', ev27: '13.0' },
  { name: '천보', ticker: '278280.KQ', category: '전해액', cap: '657', fnguide: 'O', pe26: '75.4', pe27: '90.1', ev26: '20.3', ev27: '16.3' },
  { name: '한중엔시에스', ticker: '107640.KQ', category: '2차전지 부품', cap: '442', fnguide: 'O', pe26: '24.9', pe27: '21.5', ev26: '15.9', ev27: '10.1' },
  { name: '에코앤드림', ticker: '101360.KQ', category: '전구체', cap: '376', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '필에너지', ticker: '378340.KQ', category: '2차전지 장비', cap: '354', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '신성에스티', ticker: '416180.KQ', category: '2차전지 부품', cap: '322', fnguide: 'O', pe26: '27.2', pe27: '18.4', ev26: '-', ev27: '-' },
  { name: '더블유씨피', ticker: '393890.KQ', category: '분리막', cap: '280', fnguide: 'O', pe26: '16.6', pe27: '21.1', ev26: '12.7', ev27: '8.4' },
  { name: '윤성에프앤씨', ticker: '372170.KQ', category: '2차전지 장비', cap: '275', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '상아프론테크', ticker: '089980.KQ', category: '2차전지 부품', cap: '260', fnguide: 'O', pe26: '27.8', pe27: '16.0', ev26: '12.3', ev27: '9.8' },
  { name: '하나기술', ticker: '299030.KQ', category: '2차전지 장비', cap: '251', fnguide: 'O', pe26: '16.5', pe27: '11.3', ev26: '14.6', ev27: '10.9' },
  { name: '파워로직스', ticker: '047310.KQ', category: '2차전지 부품', cap: '228', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '신흥에스이씨', ticker: '243840.KQ', category: '2차전지 부품', cap: '228', fnguide: 'O', pe26: '14.8', pe27: '11.8', ev26: '6.2', ev27: '6.1' },
  { name: '코윈테크', ticker: '282880.KQ', category: '2차전지 장비', cap: '220', fnguide: 'O', pe26: '7.3', pe27: '6.5', ev26: '3.5', ev27: '6.3' },
  { name: '아이티엠반도체', ticker: '084850.KQ', category: '2차전지 부품', cap: '215', fnguide: 'X', pe26: '15.1', pe27: '40.1', ev26: '6.6', ev27: '5.7' },
  { name: '새빗켐', ticker: '107600.KQ', category: '광물', cap: '208', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '디에스케이', ticker: '109740.KQ', category: '2차전지 장비', cap: '208', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '상신이디피', ticker: '091580.KQ', category: '2차전지 부품', cap: '198', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '원익피앤이', ticker: '217820.KQ', category: '2차전지 장비', cap: '195', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '나인테크', ticker: '267320.KQ', category: '2차전지 장비', cap: '190', fnguide: 'X', pe26: '9.1', pe27: '-', ev26: '7.1', ev27: '-' },
  { name: '탑머티리얼', ticker: '360070.KQ', category: '양극재', cap: '186', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '성우', ticker: '458650.KQ', category: '2차전지 부품', cap: '168', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '원준', ticker: '382840.KQ', category: '2차전지 장비', cap: '152', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '엠플러스', ticker: '259630.KQ', category: '2차전지 장비', cap: '150', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '케이엔에스', ticker: '432470.KQ', category: '2차전지 장비', cap: '139', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '지에프아이', ticker: '493330.KQ', category: '2차전지 부품', cap: '132', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '브이원텍', ticker: '251630.KQ', category: '2차전지 장비', cap: '129', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '티에스아이', ticker: '277880.KQ', category: '2차전지 장비', cap: '119', fnguide: 'X', pe26: '9.4', pe27: '-', ev26: '-', ev27: '-' },
  { name: '엠오티', ticker: '413390.KQ', category: '2차전지 장비', cap: '116', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '삼기에너지솔루션즈', ticker: '419050.KQ', category: '2차전지 부품', cap: '107', fnguide: 'X', pe26: '81.4', pe27: '24.8', ev26: '10.6', ev27: '8.8' },
  { name: '대보마그네틱', ticker: '290670.KQ', category: '2차전지 장비', cap: '107', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '이닉스', ticker: '452400.KQ', category: '2차전지 부품', cap: '101', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '메가터치', ticker: '446540.KQ', category: '2차전지 부품', cap: '92', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
  { name: '에이프로', ticker: '262260.KQ', category: '2차전지 장비', cap: '81', fnguide: 'X', pe26: '-', pe27: '-', ev26: '-', ev27: '-' },
];

const tbody = rows
  .map(
    (r) =>
      `<tr><td class="border border-slate-200 dark:border-white/10 p-2">${r.name}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right">${r.ticker}</td><td class="border border-slate-200 dark:border-white/10 p-2">${r.category}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right">${r.cap}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-center">${r.fnguide}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right">${r.pe26}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right">${r.pe27}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right">${r.ev26}</td><td class="border border-slate-200 dark:border-white/10 p-2 text-right">${r.ev27}</td></tr>`
  )
  .join('\n');

const tableHtml = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[720px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">표 1. 코스닥 상장 2차전지 섹터 Peer Valuation 테이블</caption>
<thead>
<tr>
<th class="border border-slate-200 dark:border-white/10 p-2 text-left">기업명</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">티커</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-left">분류</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">시가총액</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-center">Fnguide 컨센서스 유무</th>
<th colspan="2" class="border border-slate-200 dark:border-white/10 p-2 text-center">P/E</th>
<th colspan="2" class="border border-slate-200 dark:border-white/10 p-2 text-center">EV/EBITDA</th>
</tr>
<tr>
<th class="border border-slate-200 dark:border-white/10 p-1"></th>
<th class="border border-slate-200 dark:border-white/10 p-1"></th>
<th class="border border-slate-200 dark:border-white/10 p-1"></th>
<th class="border border-slate-200 dark:border-white/10 p-1"></th>
<th class="border border-slate-200 dark:border-white/10 p-1"></th>
<th class="border border-slate-200 dark:border-white/10 p-1">26F</th>
<th class="border border-slate-200 dark:border-white/10 p-1">27F</th>
<th class="border border-slate-200 dark:border-white/10 p-1">26F</th>
<th class="border border-slate-200 dark:border-white/10 p-1">27F</th>
</tr>
</thead>
<tbody>
${tbody}
</tbody>
</table>
</div>
<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">단위: 십억 원, 배. 자료: Quantiwise, 미래에셋증권 리서치센터</p>
`.trim();

const needle =
  "실적과 수주 발표를 꾸준히 챙기는 것이 좋다.</p><h2>결론 및 투자 유의사항</h2>";
const replacement =
  "실적과 수주 발표를 꾸준히 챙기는 것이 좋다.</p>" + tableHtml + "<h2>결론 및 투자 유의사항</h2>";

const post = posts.find((p) => p.id === 13);
if (!post) {
  console.error('Post id 13 not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected table into post id 13 (2026년 2차전지 업황).');
