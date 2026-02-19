import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const contentPath = path.join(__dirname, '../public/data/post_tga_content.html');

const content = fs.readFileSync(contentPath, 'utf8').trim();
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

const newPost = {
  id: 31,
  category: '시경제(Macro)와 산업의 연결고리',
  title: 'TGA 잔고와 2026년 시장 유동성: 재무부 계정이 주가에 미치는 경로',
  date: '2026-02-19',
  summary: '미국 재무부 국고일반계정(TGA) 잔고의 증감이 시장 유동성과 금리·주가에 미치는 메커니즘을 2026년 전망과 함께 정리하고, 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.',
  content,
  imageUrl: 'https://source.unsplash.com/featured/?treasury,finance,chart',
  imageAlt: 'TGA·재무부 발행과 시장 유동성, 금리·주가 연계를 설명하는 개념 이미지',
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added TGA post (id 31) to posts.json');
