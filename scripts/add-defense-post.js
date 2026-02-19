/**
 * 방위산업 근황 칼럼 포스트를 posts.json에 추가 (2026-02-15).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const htmlPath = path.join(__dirname, '../public/data/post_defense_content.html');

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const content = fs.readFileSync(htmlPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n\s*/g, '')
  .trim();

const newPost = {
  id: 35,
  category: "시장전망",
  title: "방위산업 근황과 2026년 투자 포인트: 수주·실적·금리가 주가에 미치는 영향",
  date: "2026-02-15",
  summary: "방위산업의 수요 구조와 2026년 지정학·예산·수출 맥락을 정리하고, 수주·정책·금리가 방위주에 미치는 영향과 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.",
  content,
  imageUrl: "https://source.unsplash.com/featured/?defense,industry,chart",
  imageAlt: "방위산업 수주·실적과 주가 연계를 설명하는 개념 이미지"
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added Defense industry post (id 35, date 2026-02-15) to posts.json.');
