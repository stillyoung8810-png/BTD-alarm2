/**
 * 디바이스 타임존 (IANA), 실패 시 Asia/Seoul
 */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

/**
 * KST(Asia/Seoul) 기준 날짜 유틸
 * 서버·Edge 함수와 동일한 방식으로 YYYY-MM-DD 생성
 */
export function getCurrentKSTDateString(): string {
  const nowUtc = new Date();
  const kstTime = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const year = kstTime.getUTCFullYear();
  const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 날짜에 N일을 더한 Date 반환 (말일·윤년 자동 처리)
 */
export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** KST 기준 오늘의 년·월·일 */
function getKSTTodayParts(): { year: number; month: number; day: number } {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth(),
    day: kst.getUTCDate(),
  };
}

/**
 * (년,월,일)에 N일을 더한 날짜 (말일·윤년 자동 처리)
 */
function addCalendarDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * 이용 기간 표시용 문자열 (결제 확인 모달). 시작일 = 오늘(KST), 종료일 = 시작 + totalDays.
 * @param totalDays 총 이용 일수 (예: 30 * quantity)
 * @param lang 표시 언어
 * @returns "YYYY.MM.DD ~ YYYY.MM.DD" (ko) / "MM/DD/YYYY - MM/DD/YYYY" (en)
 */
export function getServicePeriodDisplay(totalDays: number, lang: 'ko' | 'en'): string {
  const start = getKSTTodayParts();
  const end = addCalendarDays(start.year, start.month, start.day, totalDays);
  const fmt = (y: number, m: number, d: number) => ({
    ymd: `${y}.${String(m + 1).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    mdy: `${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`,
  });
  const s = fmt(start.year, start.month, start.day);
  const e = fmt(end.year, end.month, end.day);
  return lang === 'ko' ? `${s.ymd} ~ ${e.ymd}` : `${s.mdy} - ${e.mdy}`;
}
