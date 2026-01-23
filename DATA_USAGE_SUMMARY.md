# 데이터 사용 함수 정리

## 1. 일별 종가 데이터 (Supabase에서 가져오는 데이터)

### 📥 데이터 가져오기 함수

#### `fetchStockPrices(symbols: string[])`
- **위치**: `services/stockService.ts:8`
- **기능**: Supabase에서 최신 종가 데이터를 가져옴
- **반환**: `Record<string, StockData>` (price, change, changePercent, rsi, ma20, ma60, ma120 포함)
- **사용처**:
  - `components/Markets.tsx:164` - 차트 탭 초기 주가 데이터 로드
  - `components/PortfolioDetailsModal.tsx:81` - 포트폴리오 상세 모달에서 보유 종목 가격 조회
  - `utils/portfolioCalculations.ts:81` - `calculateCurrentValuation()` - 포트폴리오 평가액 계산
  - `utils/portfolioCalculations.ts:120` - `determineActiveSection()` - 활성 구간 판별

#### `fetchStockPriceHistory(symbol: string, days: number = 90)`
- **위치**: `services/stockService.ts:247`
- **기능**: 특정 종목의 최근 N일간 가격 이력을 가져옴 (차트용)
- **반환**: `Array<{ date: string; price: number; ma20: number; ma60: number }>`
- **사용처**:
  - `components/Markets.tsx:180` - 차트 데이터 로드

#### `fetchStockPricesWithPrev(symbols: string[])`
- **위치**: `services/stockService.ts:104`
- **기능**: 현재가와 전일 종가를 함께 가져옴 (변동률 계산용)
- **반환**: `Record<string, { current: number; previous: number }>`
- **사용처**:
  - `services/stockService.ts:76` - `fetchStockPrices()` 내부에서 changePercent 계산 시 사용

#### `fetchStockPrice(symbol: string)`
- **위치**: `services/stockService.ts:161`
- **기능**: 단일 종목의 주가 데이터를 가져옴
- **반환**: `StockData | null`
- **사용처**: 현재 코드에서 직접 호출되는 곳은 없음 (유틸리티 함수)

---

## 2. 이동평균선 계산값

### 🔢 계산 함수

#### `calculateMA(prices: number[], period: number)`
- **위치**: `services/stockService.ts:169`
- **기능**: 이동평균선(MA) 계산
- **파라미터**: 
  - `prices`: 가격 배열
  - `period`: 이동평균 기간 (예: 20, 60, 120)
- **반환**: `number` (이동평균값)
- **사용처**:
  - `services/stockService.ts:231` - `calculateTechnicalIndicators()` 내부에서 MA 계산
  - `services/stockService.ts:299, 311` - `fetchStockPriceHistory()` 내부에서 MA20, MA60 계산

#### `calculateTechnicalIndicators(symbol: string, maPeriods: number[] = [20, 60, 120])`
- **위치**: `services/stockService.ts:200`
- **기능**: 특정 종목의 기술 지표(MA, RSI) 계산
- **Supabase 조회**: 최근 200일 데이터 (`limit(200)`)
- **반환**: `{ ma: Record<number, number>; rsi: number } | null`
- **사용처**:
  - `services/stockService.ts:67` - `fetchStockPrices()` 내부에서 각 종목의 MA, RSI 계산

### 📊 이동평균선 사용 함수

#### `determineActiveSection(portfolio: Portfolio)`
- **위치**: `utils/portfolioCalculations.ts:108`
- **기능**: 포트폴리오의 현재 활성 구간(1, 2, 3) 판별
- **로직**:
  - 구간 0 종목의 현재가를 각 구간의 이동평균선과 비교
  - 구간 1: ma0Price < ma1Price (MA20)
  - 구간 2: ma2Price1 ≤ ma0Price ≤ ma2Price2 (MA20 ~ MA60)
  - 구간 3: ma0Price < ma3Price (MA60)
- **사용처**:
  - `components/Dashboard.tsx:110` - 포트폴리오 카드에서 QuickInput 모달 열 때 활성 구간 결정

#### `fetchStockPriceHistory()` 내부 MA 계산
- **위치**: `services/stockService.ts:293-316`
- **기능**: 차트용 각 날짜별 MA20, MA60 rolling window 계산
- **특징**: 각 데이터 포인트마다 과거 N일간의 평균을 계산

---

## 3. RSI 계산값

### 🔢 계산 함수

#### `calculateRSI(prices: number[], period: number = 14)`
- **위치**: `services/stockService.ts:178`
- **기능**: RSI(Relative Strength Index) 계산
- **파라미터**: 
  - `prices`: 가격 배열
  - `period`: RSI 기간 (기본값: 14일)
- **반환**: `number` (0-100 사이의 RSI 값)
- **사용처**:
  - `services/stockService.ts:234` - `calculateTechnicalIndicators()` 내부에서 RSI 계산

#### `calculateTechnicalIndicators()` (RSI 포함)
- **위치**: `services/stockService.ts:200`
- **기능**: RSI와 MA를 함께 계산
- **사용처**:
  - `services/stockService.ts:67` - `fetchStockPrices()` 내부에서 RSI 계산

### 📊 RSI 사용 함수

#### `fetchStockPrices()` 내부 RSI 할당
- **위치**: `services/stockService.ts:69`
- **기능**: 계산된 RSI 값을 StockData에 할당
- **사용처**:
  - `components/Markets.tsx:431` - 차트 탭 종목 정보 카드에 RSI 표시
  - 포트폴리오 전략에서 RSI 임계값 비교 (코드상 명시적 사용은 보이지 않지만, 전략 설정에 RSI threshold가 있음)

---

## 데이터 흐름 요약

### 포트폴리오 매매 구간 및 신호 결정

```
1. determineActiveSection(portfolio)
   └─> fetchStockPrices([ma0Stock, ma1Stock, ma2Stock, ma3Stock])
       └─> calculateTechnicalIndicators(symbol) [각 종목별]
           └─> Supabase에서 최근 200일 데이터 조회
           └─> calculateMA(prices, period) - MA20, MA60, MA120 계산
           └─> calculateRSI(prices) - RSI 계산
       └─> StockData에 ma20, ma60, ma120, rsi 할당
   └─> ma0Price와 각 구간의 MA 비교하여 활성 구간 결정
```

### 차트 탭 데이터 로드

```
1. fetchStockPriceHistory(symbol, 90)
   └─> Supabase에서 최근 90일 데이터 조회
   └─> 각 날짜별로 rolling window 방식으로 MA20, MA60 계산
       └─> calculateMA(pricesForMa20, 20)
       └─> calculateMA(pricesForMa60, 60)
   └─> { date, price, ma20, ma60 } 배열 반환
```

### 차트 탭 종목 정보 RSI 표시

```
1. fetchStockPrices(AVAILABLE_STOCKS)
   └─> 각 종목별로 calculateTechnicalIndicators() 호출
       └─> Supabase에서 최근 200일 데이터 조회
       └─> calculateRSI(prices) - RSI 계산
   └─> StockData.rsi에 할당
   └─> Markets.tsx에서 stockData[ticker].rsi로 표시
```

---

## 주요 문제점 및 개선 필요 사항

### 1. 데이터 기간 부족 문제
- **포트폴리오용**: `calculateTechnicalIndicators()`에서 200일만 가져옴
  - MA120 이상 설정 시 데이터 부족 가능
  - 포트폴리오 시작일이 오래 전이면 과거 데이터 부족
  
- **차트용**: `fetchStockPriceHistory()`에서 90일만 가져옴
  - MA60을 그리려면 최소 60일 이전 데이터 필요
  - 초기 30일 정도는 MA60 값이 부정확할 수 있음

### 2. 이동평균선 기간 하드코딩
- `determineActiveSection()`에서 `ma20`, `ma60`을 하드코딩하여 사용
- 실제로는 `portfolio.strategy.ma1.period`, `ma2.period1`, `ma2.period2`, `ma3.period`를 사용해야 함

---

# 로컬 캐싱 정리

## 1. 포트폴리오 데이터 캐싱

### 📦 캐시 키
- **키**: `my_portfolios_{userId}`
- **위치**: `App.tsx:62` (`PORTFOLIOS_CACHE_KEY`)
- **저장소**: `localStorage`

### 🔄 캐싱 로직

#### `loadPortfoliosFromCache(userId: string)`
- **위치**: `App.tsx:579`
- **기능**: localStorage에서 포트폴리오 데이터를 동기적으로 로드
- **반환**: `boolean` (캐시 데이터 존재 여부)
- **특징**:
  - 동기적 실행 (즉시 반환)
  - 파싱 실패 시 빈 배열 반환
  - `normalizePortfolioData()`로 데이터 정규화

#### `fetchPortfoliosFromSupabase(userId: string)`
- **위치**: `App.tsx:601`
- **기능**: Supabase에서 최신 포트폴리오 데이터를 가져와서 localStorage에 저장
- **특징**:
  - 비동기 실행 (백그라운드)
  - 중복 요청 방지 (`fetchingPortfoliosRef`)
  - AbortController로 타임아웃 처리 (10초)
  - 성공 시 localStorage에 저장 후 상태 업데이트
  - 에러 발생 시에도 로컬 데이터는 유지

#### `fetchPortfolios(userId: string)`
- **위치**: `App.tsx:698`
- **기능**: 로컬 우선, 백그라운드 업데이트 전략
- **흐름**:
  1. `loadPortfoliosFromCache()` - 로컬 데이터 즉시 로드 (동기)
  2. `fetchPortfoliosFromSupabase()` - 백그라운드에서 최신 데이터 가져오기 (비동기)

### 📊 캐시 데이터 구조
```typescript
// localStorage에 저장되는 형식 (Supabase 원본 데이터)
{
  id: string;
  created_at: string;
  name: string;
  daily_buy_amount: number;
  start_date: string;
  fee_rate: number;
  is_closed: boolean;
  closed_at?: string;
  final_sell_amount?: number;
  trades: Trade[];
  strategy: Strategy;
  alarm_config?: AlarmConfig;
  user_id: string;
}[]
```

### ⚠️ 주의사항
- 캐시는 사용자별로 분리됨 (`userId` 포함)
- Supabase 쿼리 실패 시에도 로컬 데이터로 화면 표시
- 타임아웃(10초) 초과 시 요청 취소, 로컬 데이터 유지

---

## 2. 주가 데이터 캐싱

### 📦 캐시 키
- **키**: `STOCK_PRICE_CACHE_V1`
- **위치**: `App.tsx:61` (`STOCK_PRICE_CACHE_KEY`)
- **저장소**: `localStorage`

### 🔄 캐싱 로직

#### 캐시 확인 및 저장 위치
- **위치**: `App.tsx:728-846` (`useEffect` 내부)
- **함수**: `calcValuation()` (전체 포트폴리오 평가액 계산)

#### 캐시 구조
```typescript
{
  date: string;              // 오늘 날짜 (YYYY-MM-DD, KST 기준)
  lastUpdatedKst: string;     // 마지막 업데이트 시간 (ISO string, KST)
  prices: Record<string, {   // 종목별 가격 정보
    current: number;         // 현재가
    previous: number;        // 전일 종가
  }>;
}
```

#### 캐시 사용 조건

**캐시를 사용하는 경우** (서버 요청 안 함):
- 캐시가 존재하고 오늘 날짜와 일치하는 경우
- 다음 조건 중 하나라도 해당:
  - 일요일 또는 월요일 (미국 시장 휴장)
  - 화~토요일이지만 KST 07:20 이전
  - 전날이 미국 공휴일인 경우

**서버에서 가져오는 경우**:
- 캐시가 없는 경우
- 캐시가 있지만 오늘 날짜와 다른 경우
- 화~토요일 07:20 이후이고 전날이 공휴일이 아닌 경우 (새로운 종가 가능)

#### 캐시 업데이트 시간
- **KST 07:20** 이후에만 새로운 데이터가 있을 가능성이 높다고 판단
- 미국 시장 종료 후 한국 시간 새벽에 데이터 업데이트 완료 가정

### 📊 캐시 데이터 사용 흐름

```
1. calcValuation() 실행
   └─> localStorage에서 STOCK_PRICE_CACHE_V1 조회
   └─> 캐시 날짜가 오늘과 일치하는지 확인
   └─> 조건에 따라:
       ├─ 캐시 사용 (휴장일/07:20 이전)
       └─ 서버 요청 (07:20 이후/캐시 없음)
          └─> fetchStockPricesWithPrev(symbols)
          └─> localStorage에 저장
```

### ⚠️ 주의사항
- **날짜 기반 캐시**: 오늘 날짜와 일치하는 캐시만 사용
- **시간 기반 판단**: KST 07:20 이후에만 서버 요청
- **공휴일 처리**: 미국 공휴일 체크 (`getUSSelectionHolidays()`)
- **평가액 계산용**: 전체 포트폴리오 평가액 계산에만 사용
- **개별 종목 조회**: `fetchStockPrices()`, `fetchStockPriceHistory()`는 캐싱 없음

---

## 3. 이동평균선 및 RSI 데이터 캐싱

### ❌ 캐싱 없음
- **이동평균선(MA)**: 매번 `calculateTechnicalIndicators()`에서 계산
- **RSI**: 매번 `calculateRSI()`에서 계산
- **차트 데이터**: `fetchStockPriceHistory()`는 캐싱 없음

### 💡 개선 가능성
- MA, RSI 계산 결과를 캐싱하면 성능 향상 가능
- 하지만 종가 데이터가 매일 업데이트되므로 캐시 무효화 전략 필요
- 날짜 기반 캐시 키 사용 가능 (예: `MA_RSI_{symbol}_{date}`)

---

## 4. 캐싱 전략 요약

### 포트폴리오 데이터
- ✅ **로컬 우선, 백그라운드 업데이트**
- ✅ 사용자별 분리 (`userId` 포함)
- ✅ Supabase 실패 시에도 로컬 데이터로 표시
- ✅ 타임아웃 처리 (10초)

### 주가 데이터 (평가액 계산용)
- ✅ **날짜 기반 캐시**
- ✅ 시간 기반 서버 요청 판단 (KST 07:20)
- ✅ 공휴일 처리
- ❌ 개별 종목 조회는 캐싱 없음

### 기술 지표 (MA, RSI)
- ❌ **캐싱 없음**
- 매번 Supabase에서 데이터 가져와서 계산

---

## 5. 캐시 무효화 전략

### 포트폴리오
- Supabase에서 최신 데이터 가져올 때 자동 업데이트
- 사용자별로 분리되어 있어 다른 사용자 영향 없음

### 주가 데이터
- 날짜 기반: 오늘 날짜와 일치하는 캐시만 사용
- 시간 기반: KST 07:20 이후에만 서버 요청
- 수동 무효화: localStorage에서 키 삭제

### 기술 지표
- 캐싱이 없으므로 무효화 불필요
- 매번 최신 데이터로 계산
