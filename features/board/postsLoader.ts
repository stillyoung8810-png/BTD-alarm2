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

  return (data as RawPost[]).map((p) => ({
    id: String(p.id),
    category: p.category,
    title: p.title,
    date: p.date,
    summary: p.summary,
    content: p.content,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
  }));
}

export function loadPostById(posts: BoardPost[], id: string): BoardPost | undefined {
  return posts.find((p) => p.id === id);
}
