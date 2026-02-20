/**
 * 게시판 목록 페이지 — /posts
 * 로그인 없이 누구나 열람 가능. SEO용 <a> 사용.
 * 웹 전용 (토스 미니앱 노출 안 함).
 */

import React, { useEffect, useState } from 'react';
import type { BoardPost } from './boardTypes';
import { loadPosts } from './postsLoader';
import { formatPostDate } from './formatDate';
import { FileText } from 'lucide-react';

export const PostsListPage: React.FC = () => {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPosts()
      .then((data) => {
        setPosts(data);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 dark:text-slate-200">
      <header className="sticky top-0 z-40 w-full glass glass-header px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
        <a
          href="/"
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-bold"
        >
          ← 홈
        </a>
        <h1 className="text-lg font-black tracking-tight dark:text-white uppercase flex items-center gap-2">
          <FileText size={22} aria-hidden />
          게시판
        </h1>
        <div className="w-12" aria-hidden />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {loading && (
          <p className="text-center text-slate-500 dark:text-slate-400 font-medium">로딩 중…</p>
        )}
        {error && (
          <p className="text-center text-red-500 dark:text-red-400 font-medium" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && posts.length === 0 && (
          <p className="text-center text-slate-500 dark:text-slate-400">등록된 글이 없습니다.</p>
        )}
        {!loading && !error && posts.length > 0 && (
          <ul className="space-y-2 list-none p-0 m-0">
            {posts.map((post) => (
              <li key={post.id}>
                <a
                  href={`/posts/${post.id}`}
                  className="block rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-4 hover:border-blue-400/50 dark:hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-tight">
                    {post.category ?? '칼럼'}
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400 text-xs">
                    {formatPostDate(post.date)}
                  </span>
                  <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white line-clamp-2">
                    {post.title}
                  </h2>
                  {post.summary && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                      {post.summary}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default PostsListPage;
