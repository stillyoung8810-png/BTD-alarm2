/**
 * 부활절 제외 주요 미국 휴장일(9개)을 계산하는 함수
 */
export const getUSSelectionHolidays = (year: number): string[] => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const format = (y: number, m: number, d: number) =>
    `${y}-${pad(m)}-${pad(d)}`;

  // N번째 요일 (0=Sun..6=Sat)
  const nthWeekdayOfMonth = (y: number, m: number, weekday: number, nth: number): Date => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const firstDow = first.getUTCDay();
    let day = 1 + ((7 + weekday - firstDow) % 7) + (nth - 1) * 7;
    return new Date(Date.UTC(y, m - 1, day));
  };

  // 마지막 특정 요일
  const lastWeekdayOfMonth = (y: number, m: number, weekday: number): Date => {
    const last = new Date(Date.UTC(y, m, 0)); // 다음달 0일 = 해당 월 마지막날
    const lastDow = last.getUTCDay();
    const diff = (7 + lastDow - weekday) % 7;
    const day = last.getUTCDate() - diff;
    return new Date(Date.UTC(y, m - 1, day));
  };

  const observed = (d: Date): string => {
    const dow = d.getUTCDay(); // 0=Sun,6=Sat
    let obs = new Date(d.getTime());
    if (dow === 6) {
      // 토요일 → 금요일로 조정
      obs = new Date(d.getTime() - 1 * 24 * 60 * 60 * 1000);
    } else if (dow === 0) {
      // 일요일 → 월요일로 조정
      obs = new Date(d.getTime() + 1 * 24 * 60 * 60 * 1000);
    }
    return format(obs.getUTCFullYear(), obs.getUTCMonth() + 1, obs.getUTCDate());
  };

  // 1. 신정 (1/1)
  const newYear = observed(new Date(Date.UTC(year, 0, 1)));

  // 2. 마틴 루터 킹 주니어 데이 (1월 3번째 월요일)
  const mlk = nthWeekdayOfMonth(year, 1, 1, 3); // 1=Mon

  // 3. 대통령의 날 (2월 3번째 월요일)
  const presidents = nthWeekdayOfMonth(year, 2, 1, 3);

  // 4. 메모리얼 데이 (5월 마지막 월요일)
  const memorial = lastWeekdayOfMonth(year, 5, 1);

  // 5. 준틴스 (6/19)
  const juneteenth = observed(new Date(Date.UTC(year, 5, 19)));

  // 6. 독립기념일 (7/4)
  const independence = observed(new Date(Date.UTC(year, 6, 4)));

  // 7. 노동절 (9월 1번째 월요일)
  const labor = nthWeekdayOfMonth(year, 9, 1, 1);

  // 8. 추수감사절 (11월 4번째 목요일)
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4); // 4=Thu

  // 9. 크리스마스 (12/25)
  const christmas = observed(new Date(Date.UTC(year, 11, 25)));

  return [
    newYear,
    format(mlk.getUTCFullYear(), mlk.getUTCMonth() + 1, mlk.getUTCDate()),
    format(presidents.getUTCFullYear(), presidents.getUTCMonth() + 1, presidents.getUTCDate()),
    format(memorial.getUTCFullYear(), memorial.getUTCMonth() + 1, memorial.getUTCDate()),
    juneteenth,
    independence,
    format(labor.getUTCFullYear(), labor.getUTCMonth() + 1, labor.getUTCDate()),
    format(thanksgiving.getUTCFullYear(), thanksgiving.getUTCMonth() + 1, thanksgiving.getUTCDate()),
    christmas,
  ];
};

/**
 * 현재 미국 주식 시장 상태(개장/휴장)를 판단하는 함수
 */
export const getMarketStatus = (lang: 'ko' | 'en' = 'ko'): { isOpen: boolean; message: string } => {
  const nowUtc = new Date();
  const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth() + 1;
  const day = nowKst.getUTCDate();
  const hours = nowKst.getUTCHours();
  const minutes = nowKst.getUTCMinutes();
  
  const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const kstDayOfWeek = nowKst.getUTCDay(); // 0=Sun, 6=Sat
  const minutesOfDay = hours * 60 + minutes;
  const KST_UPDATE_HOUR = 7;
  const KST_UPDATE_MINUTE = 20;
  const isAfterUpdateTime = minutesOfDay >= KST_UPDATE_HOUR * 60 + KST_UPDATE_MINUTE;

  // 오늘 공휴일 확인
  const usHolidays = getUSSelectionHolidays(year);
  const isHolidayToday = usHolidays.includes(todayStr);

  // 주말 확인
  const isWeekend = kstDayOfWeek === 0 || kstDayOfWeek === 6;

  if (isWeekend) {
    return {
      isOpen: false,
      message: lang === 'ko' 
        ? '현재 미국 시장 휴장일 (주말)' 
        : 'US Market Closed (Weekend)'
    };
  }

  if (isHolidayToday) {
    return {
      isOpen: false,
      message: lang === 'ko'
        ? '현재 미국 시장 휴장일 (공휴일)'
        : 'US Market Closed (Holiday)'
    };
  }

  // 화~토요일 07:20 이후면 데이터 업데이트 완료
  if (kstDayOfWeek >= 2 && kstDayOfWeek <= 6 && isAfterUpdateTime) {
    return {
      isOpen: true,
      message: lang === 'ko'
        ? `데이터 업데이트 완료: 오늘 ${KST_UPDATE_HOUR}:${String(KST_UPDATE_MINUTE).padStart(2, '0')}`
        : `Data Updated: Today ${KST_UPDATE_HOUR}:${String(KST_UPDATE_MINUTE).padStart(2, '0')}`
    };
  }

  // 그 외 (일~월 전체, 화~토 07:20 이전)
  return {
    isOpen: false,
    message: lang === 'ko'
      ? '데이터 업데이트 대기 중'
      : 'Waiting for Data Update'
  };
};
