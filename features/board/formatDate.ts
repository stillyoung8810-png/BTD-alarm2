/**
 * 게시판 공통 날짜 포맷 — ko-KR long (년 월 일).
 * DRY: 목록/상세 페이지에서 단일 소스 사용.
 */

export function formatPostDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
