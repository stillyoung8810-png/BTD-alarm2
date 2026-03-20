/**
 * 로캘에 의존하지 않는 순수 수학적 YYYY-MM-DD 추출.
 * `toLocaleDateString('en-CA')` 같은 로캘 꼼수 대신 사용.
 */
export function getLocalTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
