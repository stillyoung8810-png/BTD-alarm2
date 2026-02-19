/**
 * VIX 지수 칼럼 포스트를 posts.json에 추가 (2026-02-17).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const htmlPath = path.join(__dirname, '../public/data/post_vix_content.html');

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const content = fs.readFileSync(htmlPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n\s*/g, '')
  .trim();

const newPost = {
  id: 33,
  category: "시장전망",
  title: "VIX 지수와 2026년 주가 변동성: 옵션 시장이 말해주는 리스크 프리미엄",
  date: "2026-02-17",
  summary: "VIX(공포 지수)가 측정하는 것과 2026년 금리·실적·지정학이 겹치는 환경에서 주가 변동성을 어떻게 읽을지 정리하고, 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.",
  content,
  imageUrl: "https://source.unsplash.com/featured/?chart,volatility,finance",
  imageAlt: "VIX 지수와 주가 변동성, 옵션 시장의 기대 변동성을 설명하는 개념 이미지"
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added VIX post (id 33, date 2026-02-17) to posts.json.');
