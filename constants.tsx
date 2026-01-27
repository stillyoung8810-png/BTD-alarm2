
export const AVAILABLE_STOCKS = [
  'SPY', 'SSO', 'UPRO', 'QQQ', 'QLD', 'TQQQ', 'SOXX', 'USD', 'SOXL', 'STRC', 'BIL', 'ICSH', 'SGOV'
];

// PRO/PREMIUM 전용 추가 종목
export const PAID_STOCKS = [
  'TSLA', 'TSLL', 'NVDA', 'NVDL', 'GOOGL', 'GGLL', 'PLTR', 'PTIR', 'COIN', 'CONL', 'MSTR', 'MSTX', 'BMNR'
];

// UI 리스트/필터링용 전체 종목
// 시세탭 종목 정보 순서를 제어하기 위해, 채권/현금성 ETF(BIL, ICSH, SGOV)를 가장 마지막으로 배치
export const ALL_STOCKS = [
  // 기본 인덱스/레버리지/기타
  'SPY', 'SSO', 'UPRO', 'QQQ', 'QLD', 'TQQQ', 'SOXX', 'USD', 'SOXL', 'STRC',
  // 유료 PRO/PREMIUM 전용 종목
  ...PAID_STOCKS,
  // 채권/현금성 ETF - 시세탭 종목 정보의 맨 마지막에 오도록
  'BIL', 'ICSH', 'SGOV',
];

export const STOCK_COLORS: Record<string, string> = {
  'SPY': '#4285F4', 'SSO': '#EA4335', 'UPRO': '#FBBC04', 'QQQ': '#34A853',
  'QLD': '#FF6D01', 'TQQQ': '#9C27B0', 'SOXX': '#00BCD4', 'USD': '#607D8B',
  'SOXL': '#E91E63', 'STRC': '#795548', 'BIL': '#3F51B5', 'ICSH': '#009688', 'SGOV': '#FF9800',
  // paid tickers (fallback 컬러)
  'TSLA': '#e11d48', 'TSLL': '#fb7185',
  'NVDA': '#22c55e', 'NVDL': '#4ade80',
  'GOOGL': '#3b82f6', 'GGLL': '#60a5fa',
  'PLTR': '#a855f7', 'PTIR': '#c084fc',
  'COIN': '#f59e0b', 'CONL': '#fbbf24',
  'MSTR': '#06b6d4', 'MSTX': '#22d3ee',
  'BMNR': '#64748b'
};

export const CUSTOM_GRADIENT_LOGOS: Record<string, { gradient: string; label: string }> = {
    'QQQ': { gradient: 'linear-gradient(135deg, #4285F4 0%, #9C27B0 100%)', label: 'NASDAQ-100' },
    'QLD': { gradient: 'linear-gradient(135deg, #4285F4 0%, #9C27B0 100%)', label: '2X LEVERAGED' },
    'TQQQ': { gradient: 'linear-gradient(135deg, #4285F4 0%, #9C27B0 100%)', label: '3X LEVERAGED' },
    'USD': { gradient: 'linear-gradient(180deg, #87CEEB 0%, #32CD32 50%, #FFD700 100%)', label: 'ULTRAPRO S&P 500' },
    'SOXL': { gradient: 'linear-gradient(180deg, #9C27B0 0%, #E91E63 100%)', label: '3X LEVERAGED' },
    'SOXX': { gradient: 'linear-gradient(180deg, #32CD32 0%, #00CED1 100%)', label: 'PHLX SEMICONDUCTOR' },
    'SSO': { gradient: 'linear-gradient(180deg, #1976D2 0%, #E53935 100%)', label: '2X LEVERAGED' },
    'UPRO': { gradient: 'linear-gradient(180deg, #1976D2 0%, #E53935 100%)', label: '3X LEVERAGED' },
    'SPY': { gradient: 'linear-gradient(180deg, #1976D2 0%, #E53935 100%)', label: 'S&P 500 INDEX' },
    'STRC': { gradient: 'linear-gradient(180deg, #FF6B35 0%, #FFB347 100%)', label: 'STRATEGIC INCOME' },
    'ICSH': { gradient: 'linear-gradient(180deg, #0057B7 0%, #FFD700 100%)', label: 'SHORT TERM CORP' },
    'SGOV': { gradient: 'linear-gradient(180deg, #2E7D32 0%, #9CCC65 100%)', label: 'SHORT-TERM GOVT' },
    'BIL': { gradient: 'linear-gradient(180deg, #008B8B 0%, #D4AF37 100%)', label: 'SHORT-TERM TREAS' },

    // Paid tickers (간단한 그라데이션 배지, 실제 로고 도입 전까지)
    'TSLA': { gradient: 'linear-gradient(135deg, #ef4444 0%, #7f1d1d 100%)', label: 'TESLA' },
    'TSLL': { gradient: 'linear-gradient(135deg, #fb7185 0%, #be123c 100%)', label: '2X TSLA' },
    'NVDA': { gradient: 'linear-gradient(135deg, #22c55e 0%, #14532d 100%)', label: 'NVIDIA' },
    'NVDL': { gradient: 'linear-gradient(135deg, #4ade80 0%, #166534 100%)', label: '2X NVDA' },
    'GOOGL': { gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', label: 'ALPHABET' },
    'GGLL': { gradient: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)', label: '2X GOOG' },
    'PLTR': { gradient: 'linear-gradient(135deg, #a855f7 0%, #581c87 100%)', label: 'PALANTIR' },
    'PTIR': { gradient: 'linear-gradient(135deg, #c084fc 0%, #6d28d9 100%)', label: '2X PLTR' },
    'COIN': { gradient: 'linear-gradient(135deg, #f59e0b 0%, #92400e 100%)', label: 'COINBASE' },
    'CONL': { gradient: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)', label: '2X COIN' },
    'MSTR': { gradient: 'linear-gradient(135deg, #06b6d4 0%, #164e63 100%)', label: 'MICROSTRAT' },
    'MSTX': { gradient: 'linear-gradient(135deg, #22d3ee 0%, #0e7490 100%)', label: '2X MSTR' },
    'BMNR': { gradient: 'linear-gradient(135deg, #64748b 0%, #0f172a 100%)', label: 'BMNR' }
};

export const MOCK_PRICES: Record<string, number> = {
  SGOV: 100.5, ICSH: 50.2, BIL: 95.8, STRC: 25.3, QQQ: 380.5,
  QLD: 45.2, TQQQ: 35.8, SOXX: 520.3, USD: 1.0, SOXL: 28.5,
  SPY: 450.2, SSO: 65.3, UPRO: 42.8
};

export const I18N = {
  ko: {
    dashboard: "대시보드",
    markets: "시세",
    history: "투자이력",
    portfolioMgmt: "포트폴리오 관리",
    newPortfolio: "새 포트폴리오",
    totalValuation: "총 평가 금액",
    gain24h: "24H 변동",
    activeStrategy: "활성 전략",
    invested: "투자 금액",
    yield: "수익률",
    dailyExecution: "일별 매매 실행",
    terminate: "전략 종료하기",
    aiAdvisor: "AI 어드바이저",
    settlementHistory: "정산 히스토리",
    globalMarkets: "글로벌 마켓",
    searchTicker: "티커 검색...",
    launchStrategy: "전략 시작",
    systematicAccumulation: "일별 종가를 바탕으로 체계적인 중/장기 분할 매수 관리 시스템입니다.",
    pulseTitle: "시스템 상태",
    pulseStatus: "정상",
    quickInput: "빠른 매매 입력",
    tradeExecutionRecord: "상세 매매 실행 기록",
    buy: "매수",
    sell: "매도",
    save: "저장하기",
    cancel: "취소",
    executionPrice: "체결 단가",
    quantity: "수량",
    calculatedQty: "자동 계산 수량",
    calculatedFee: "매매 수수료",
    totalAmount: "최종 정산 금액",
    stock: "종목",
    date: "매수일",
    sellDate: "매도일",
    fee: "수수료",
    secFee: "유관 비용 (0.003%) (추정)",
    totalProfit: "누적 수익",
    successRate: "성공률",
    closedStrategies: "종료된 전략",
    noHistory: "기록된 내역이 없습니다.",
    viewSettlement: "정산 상세보기",
    login: "로그인",
    signup: "회원가입",
    logout: "로그아웃",
    changePassword: "비밀번호 변경",
    email: "이메일 주소",
    password: "비밀번호",
    activeSection: "현재 활성 구간",
    section: "구간"
  },
  en: {
    dashboard: "Dashboard",
    markets: "Markets",
    history: "History",
    portfolioMgmt: "Portfolio Management",
    newPortfolio: "New Portfolio",
    totalValuation: "TOTAL VALUATION",
    gain24h: "24H GAIN",
    activeStrategy: "ACTIVE STRATEGY",
    invested: "INVESTED",
    yield: "YIELD",
    dailyExecution: "DAILY EXECUTION",
    terminate: "TERMINATE STRATEGY",
    aiAdvisor: "AI ADVISOR",
    settlementHistory: "Settlement History",
    globalMarkets: "Markets",
    searchTicker: "Search ticker...",
    launchStrategy: "Launch Strategy",
    systematicAccumulation: "Systematic asset accumulation through quantitative dip-buying strategies.",
    pulseTitle: "System Pulse",
    pulseStatus: "Healthy",
    quickInput: "Quick Input",
    tradeExecutionRecord: "Trade Execution Record",
    buy: "Buy",
    sell: "Sell",
    save: "Save",
    cancel: "Cancel",
    executionPrice: "Execution Price",
    quantity: "Quantity",
    calculatedQty: "Calculated Quantity",
    calculatedFee: "Calculated Fee",
    totalAmount: "Total Amount",
    stock: "Ticker",
    date: "Buy Date",
    sellDate: "Sell Date",
    fee: "Fee",
    secFee: "SEC Fee (0.003%) (Est.)",
    totalProfit: "Total Profit",
    successRate: "Success Rate",
    closedStrategies: "Closed Strategies",
    noHistory: "No history found.",
    viewSettlement: "View Settlement",
    login: "Login",
    signup: "Sign Up",
    logout: "Logout",
    changePassword: "Change Password",
    email: "Email Address",
    password: "Password",
    activeSection: "Active Section",
    section: "Section"
  }
};
