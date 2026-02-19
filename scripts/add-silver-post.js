import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const contentPath = path.join(__dirname, '../public/data/post_silver_content.html');

const content = fs.readFileSync(contentPath, 'utf8').trim();
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const newPost = {
  id: 32,
  category: '시경제(Macro)와 산업의 연결고리',
  title: '국제 은가격 변동과 2026년 주가: 실질 금리·산업 수요가 만나는 지점',
  date: '2026-02-18',
  summary: '은의 이중 성격(귀금속·산업용)과 2026년 실질 금리·태양광·전기차 수요가 은가와 주가에 미치는 경로를 정리하고, 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.',
  content,
  imageUrl: 'https://source.unsplash.com/featured/?silver,commodity,chart',
  imageAlt: '국제 은가격·금·은 비율과 산업 수요, 주가 연계를 설명하는 개념 이미지',
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added silver price post (id 32, date 2026-02-18) to posts.json');
