/**
 * 레버리지 ETF 칼럼 포스트를 posts.json에 추가 (2026-02-16).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const htmlPath = path.join(__dirname, '../public/data/post_leverage_etf_content.html');

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const content = fs.readFileSync(htmlPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n\s*/g, '')
  .trim();

const newPost = {
  id: 34,
  category: "시장전망",
  title: "레버리지 ETF의 장점과 단점: 2026년 금리·변동성 환경에서 어떻게 쓸 것인가",
  date: "2026-02-16",
  summary: "레버리지 ETF의 구조적 장점과 궤적 이탈·변동성 감쇠 등 단점을 정리하고, 2026년 시장 환경에서의 활용 관점과 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.",
  content,
  imageUrl: "https://source.unsplash.com/featured/?chart,etf,finance",
  imageAlt: "레버리지 ETF와 기초 지수 추이, 변동성 환경을 설명하는 개념 이미지"
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added Leveraged ETF post (id 34, date 2026-02-16) to posts.json.');
