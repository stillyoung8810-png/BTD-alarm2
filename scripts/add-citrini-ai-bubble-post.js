/**
 * 시트리니 보고서와 AI 버블 칼럼 포스트를 posts.json에 추가 (2026-02-25).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const htmlPath = path.join(__dirname, '../public/data/post_citrini_ai_bubble_content.html');

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const content = fs.readFileSync(htmlPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n\s*/g, '')
  .trim();

const newPost = {
  id: 37,
  category: "시장전망",
  title: "시트리니 보고서와 AI 버블?: 2026년 밸류에이션·실적·금리가 주는 시사점",
  date: "2026-02-25",
  summary: "테마 리서치가 AI 밸류에이션과 수익 가시성을 어떻게 다루는지 참고하고, 2026년 금리·실적 시즌에서 '버블' 논의가 주가에 미치는 경로와 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.",
  content,
  imageUrl: "https://source.unsplash.com/featured/?research,chart,finance",
  imageAlt: "시트리니 스타일 리서치와 AI 밸류에이션을 설명하는 개념 이미지"
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added Citrini & AI bubble post (id 37, date 2026-02-25) to posts.json.');
