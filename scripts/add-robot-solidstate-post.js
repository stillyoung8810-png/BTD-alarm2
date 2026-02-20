/**
 * 로봇·전고체 배터리 칼럼 포스트를 posts.json에 추가 (2026-02-20).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const htmlPath = path.join(__dirname, '../public/data/post_robot_solidstate_content.html');

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const content = fs.readFileSync(htmlPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n\s*/g, '')
  .trim();

const newPost = {
  id: 36,
  category: "시장전망",
  title: "로봇과 전고체 배터리: 2026년 성장 테마의 수요·실적·밸류에이션",
  date: "2026-02-20",
  summary: "로봇·자동화와 전고체 배터리의 2026년 수요 맥락을 정리하고, 양산 시점·실적 가시성·금리 변수와 두리여유 실시간 알림을 활용한 대응 전략을 제안한다.",
  content,
  imageUrl: "https://source.unsplash.com/featured/?robot,battery,industry",
  imageAlt: "로봇·전고체 배터리와 성장 테마를 설명하는 개념 이미지"
};

posts.push(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
console.log('Added Robot & Solid-state battery post (id 36, date 2026-02-20) to posts.json.');
