/**
 * 게시판 글 데이터 로더 — public/data/posts.json fetch (정적 렌더링용).
 * 웹 전용, 토스 미니앱 미사용.
 */

import type { BoardPost } from './boardTypes';

const POSTS_URL = '/data/posts.json';

type RawPost = {
  id: number | string;
  category?: string;
  title: string;
  date: string;
  summary?: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
};

export async function loadPosts(): Promise<BoardPost[]> {
  const res = await fetch(POSTS_URL);
  if (!res.ok) throw new Error('Failed to load posts');
  const data = await res.json();

  if (!Array.isArray(data)) return [];

  const mapped = (data as RawPost[]).map((p) => ({
    id: String(p.id),
    category: p.category,
    title: p.title,
    date: p.date,
    summary: p.summary,
    content: p.content,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
  }));

  // 가장 최근 글이 먼저 보이도록 date 기준 내림차순 정렬
  return mapped.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
}

export function loadPostById(posts: BoardPost[], id: string): BoardPost | undefined {
  return posts.find((p) => p.id === id);
}
