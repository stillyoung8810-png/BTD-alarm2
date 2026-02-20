/**
 * 게시판 상세 페이지 — /posts/:id
 * 이미지: imageUrl 있으면 상단 노출, alt=imageAlt, max-width:100% height:auto.
 * 웹 전용 (토스 미니앱 노출 안 함).
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { BoardPost } from './boardTypes';
import { loadPosts, loadPostById } from './postsLoader';
import { formatPostDate } from './formatDate';
import { POST_CHART_MAP } from './postChartMap';
import { FileText } from 'lucide-react';

const CANONICAL_BASE = 'https://btd-alarm2.pages.dev';

export const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<BoardPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!id) return;
    const href = `${CANONICAL_BASE}/posts/${id}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const created = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
    return () => {
      if (created && link?.parentNode) link.parentNode.removeChild(link);
    };
  }, [id]);

  useEffect(() => {
    loadPosts()
      .then((data) => {
        const found = id ? loadPostById(data, id) : undefined;
        setPost(found ?? null);
        setError(found ? null : '글이 없습니다.');
        setImageError(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 dark:text-slate-200 flex items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400 font-medium">로딩 중…</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 dark:text-slate-200 flex flex-col items-center justify-center px-6">
        <p className="text-red-500 dark:text-red-400 font-medium mb-4" role="alert">
          {error ?? '글이 없습니다.'}
        </p>
        <a
          href="/posts"
          className="text-blue-600 dark:text-blue-400 hover:underline font-bold"
        >
          목록으로
        </a>
      </div>
    );
  }

  const hasImage =
    !imageError && post.imageUrl && post.imageUrl.trim() !== '';

  const disclaimerText =
    "본 분석은 외부 자료를 바탕으로 '유한회사 두리여유'의 주식 알림 알고리즘을 적용해 재구성한 독자적인 리포트입니다. 무단 전재 및 재배포를 금합니다.";

  const cleanedContent = post.content.replace(disclaimerText, '');
  const ChartComponent = post.id ? POST_CHART_MAP[post.id] : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 dark:text-slate-200">
      <header className="sticky top-0 z-40 w-full glass glass-header px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
        <a
          href="/posts"
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-bold"
        >
          ← 목록
        </a>
        <h1 className="text-lg font-black tracking-tight dark:text-white uppercase flex items-center gap-2">
          <FileText size={22} aria-hidden />
          게시판
        </h1>
        <div className="w-12" aria-hidden />
      </header>

      <article className="max-w-2xl mx-auto px-6 py-10">
        {hasImage && (
          <div className="mb-6 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-900/50">
            <img
              src={post.imageUrl!}
              alt={post.imageAlt ?? post.title}
              className="w-full max-w-full h-auto block"
              style={{ maxWidth: '100%', height: 'auto' }}
              loading="lazy"
              onError={() => setImageError(true)}
            />
          </div>
        )}
        <time
          className="text-slate-500 dark:text-slate-400 text-sm font-medium"
          dateTime={post.date}
        >
          {formatPostDate(post.date)}
        </time>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          {post.title}
        </h2>
        <div
          className="mt-6 prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: cleanedContent }}
        />
        {ChartComponent && <ChartComponent />}
        <p className="mt-8 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 text-center whitespace-pre-line">
          본 분석은 외부 자료를 바탕으로 '유한회사 두리여유'의 주식 알림 알고리즘을 적용해 재구성한 독자적인 리포트입니다.
          {"\n"}
          무단 전재 및 재배포를 금합니다.
        </p>
      </article>
    </div>
  );
};
export default PostDetailPage;
