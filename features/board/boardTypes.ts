/**
 * 애드센스 심사용 게시판 — 웹 전용, 서비스 기능과 독립.
 * 제거 시 features/board 폴더 및 라우트만 삭제하면 됨.
 */

export interface BoardPost {
  id: string;
  /** 선택: 시황/종목 등 카테고리 */
  category?: string;
  title: string;
  date: string;
  /** 선택: 목록에서 사용할 요약문 */
  summary?: string;
  /** HTML 본문 (p, h2 등 포함) */
  content: string;
  /** Vite public 기준: /images/xxx.jpg */
  imageUrl?: string;
  /** 이미지 alt 텍스트 (SEO·접근성) */
  imageAlt?: string;
}
