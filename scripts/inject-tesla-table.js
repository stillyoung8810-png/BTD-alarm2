/**
 * Inject Tesla '25 Q4 Vehicle Production/Delivery + Solar & Charging tables into post id 8.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const table1 = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[520px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">표. Tesla 의 '25년 4분기 차량 생산/인도 내역</caption>
<colgroup><col class="w-auto"><col><col><col><col><col><col></colgroup>
<thead>
<tr>
<th class="border border-slate-200 dark:border-white/10 p-2 text-left">항목</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">4Q24</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">3Q25</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">4Q25</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right bg-emerald-100 dark:bg-emerald-900/30">Consensus</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">QoQ</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">YoY</th>
</tr>
</thead>
<tbody>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 font-semibold">총 생산대수</td><td class="border p-2 text-right">459,445</td><td class="border p-2 text-right">447,450</td><td class="border p-2 text-right">434,358</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">452,460</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-2.9%</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-5.5%</td></tr>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 pl-6">기타 모델</td><td class="border p-2 text-right">19,727</td><td class="border p-2 text-right">11,624</td><td class="border p-2 text-right">11,706</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">13,740</td><td class="border p-2 text-right text-emerald-600 dark:text-emerald-400">0.7%</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-40.7%</td></tr>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 pl-6">모델 3/Y</td><td class="border p-2 text-right">439,718</td><td class="border p-2 text-right">435,826</td><td class="border p-2 text-right">422,652</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">437,816</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-3.0%</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-3.9%</td></tr>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 font-semibold">총 인도대수</td><td class="border p-2 text-right">495,570</td><td class="border p-2 text-right">497,099</td><td class="border p-2 text-right">418,227</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">427,988</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-15.9%</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-15.6%</td></tr>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 pl-6">기타 모델</td><td class="border p-2 text-right">23,640</td><td class="border p-2 text-right">15,933</td><td class="border p-2 text-right">11,642</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">15,495</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-26.9%</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-50.8%</td></tr>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 pl-6">모델 3/Y</td><td class="border p-2 text-right">471,930</td><td class="border p-2 text-right">481,166</td><td class="border p-2 text-right">406,585</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">414,211</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-15.5%</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400">-13.8%</td></tr>
</tbody>
</table>
</div>
<p class="text-[11px] text-slate-500 dark:text-slate-400 -mt-1 mb-4">단위: 대. 자료: Tesla, Bloomberg (기타 모델: S/X 및 사이버트럭 등)</p>
`.trim();

const table2 = `
<div class="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/30">
<table class="w-full min-w-[520px] text-sm border-collapse text-slate-700 dark:text-slate-300">
<caption class="text-left font-bold py-2 px-2">표. Tesla 의 '25년 4분기 태양광 및 충전 사업 부문</caption>
<thead>
<tr>
<th class="border border-slate-200 dark:border-white/10 p-2 text-left">항목</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">4Q24</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">3Q25</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">4Q25</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right bg-emerald-100 dark:bg-emerald-900/30">Consensus</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">QoQ</th>
<th class="border border-slate-200 dark:border-white/10 p-2 text-right">YoY</th>
</tr>
</thead>
<tbody>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 font-semibold">저장장치 설치(GWh)</td><td class="border p-2 text-right">11.0</td><td class="border p-2 text-right">12.5</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400 font-medium">14.2</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">13.9</td><td class="border p-2 text-right text-emerald-600 dark:text-emerald-400">13.6%</td><td class="border p-2 text-right text-emerald-600 dark:text-emerald-400">29.1%</td></tr>
<tr><td class="border border-slate-200 dark:border-white/10 p-2 font-semibold">슈퍼차저 충전소</td><td class="border p-2 text-right">6,975</td><td class="border p-2 text-right">7,753</td><td class="border p-2 text-right text-rose-600 dark:text-rose-400 font-medium">8,182</td><td class="border p-2 text-right bg-emerald-50 dark:bg-emerald-900/20">8,370</td><td class="border p-2 text-right text-emerald-600 dark:text-emerald-400">5.5%</td><td class="border p-2 text-right text-emerald-600 dark:text-emerald-400">17.3%</td></tr>
</tbody>
</table>
</div>
<p class="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">단위: GWh, 대. 자료: Tesla, Bloomberg</p>
`.trim();

const needle =
  "리밸런싱 여부를 판단하는 방식을 추천한다.</p><h2>결론 및 투자 유의사항</h2>";
const replacement =
  "리밸런싱 여부를 판단하는 방식을 추천한다.</p>" + table1 + table2 + "<h2>결론 및 투자 유의사항</h2>";

const post = posts.find((p) => p.id === 8);
if (!post) {
  console.error('Post id 8 not found');
  process.exit(1);
}
if (!post.content.includes(needle)) {
  console.error('Needle not found in content');
  process.exit(1);
}

post.content = post.content.replace(needle, replacement);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Injected Tesla tables into post id 8 (테슬라 TSLA 2026년).');
