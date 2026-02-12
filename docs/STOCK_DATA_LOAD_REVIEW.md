# 주가 데이터 로딩 — 시니어 코드 리뷰 (로컬 실패 원인)

## 현상

- **로컬**: `loadInitialStockData` / `fetchStockPriceHistory` 시 주가 데이터 없음. 로그: `데이터 없음 null`, `Error fetching price history for chart: QQQ null`.
- **웹(배포)**: 동일 코드·동일 Supabase인데 정상 동작.

---

## 1. 무자비 리뷰 — 발견된 문제

### 1.1 실패 시 로깅으로는 원인 추적 불가 (치명적)

- **위치**: `stockService.ts` 전역 — Supabase `stock_prices` 호출 실패 시.
- **문제**: `console.warn(..., error)` / `console.error(..., error)` 만 사용. `error`가 `null`이면 “데이터 없음 null”만 보이고, **실제로는 `data`가 비어 있는지 null인지, 요청이 어디(URL)로 나갔는지 전혀 알 수 없음.**
- **영향**: 로컬 전용 이슈일 때 원인 좁히기 불가.
- **조치**: `logSupabaseStockFailure(context, symbol, data, error)` 도입 — 실패 시 `dataIsNull`, `dataLength`, `urlHint`, `errorMessage` 로그. (반영 완료)

### 1.2 경쟁 조건 — 차트가 초기 로딩보다 먼저 Supabase를 탐

- **위치**: `App.tsx` 초기 로딩 vs `Markets.tsx` 차트 로딩.
- **흐름**:
  - `App` 마운트 → `loadInitialStockData()` **fire-and-forget** (await 없음).
  - `Markets` 마운트 → `loadChartData()` → `fetchStockPriceHistory(selectedStock, 90)`.
  - `fetchStockPriceHistory`는 IDB 먼저 조회 → 비어 있으면 Supabase 직행.
- **문제**: `loadInitialStockData`가 IDB에 쓰기 전에 차트가 Supabase를 호출하면, **로컬에서는 Supabase가 빈 결과를 줄 때** (환경/RLS/타이밍 등) 차트는 계속 실패. 배포에서는 이미 IDB에 캐시가 쌓여 있어서 Supabase를 안 타고 통과하는 경우가 많음.
- **조치**: Supabase에서 빈 결과가 온 경우, 짧은 대기(1.5s) 후 IDB를 **한 번 더** 조회해 보는 재시도 로직 추가. (반영 완료)

### 1.3 초기 로딩 완료를 자식이 알 수 없음

- **위치**: `App.tsx` — `loadInitialStockData()` 결과를 상태/컨텍스트로 노출하지 않음.
- **문제**: Markets(또는 다른 자식)이 “초기 로딩 완료 후에만 차트 요청”을 할 수 없어, 위 경쟁이 구조적으로 남음.
- **권장**: 필요 시 `initialLoadPromise` 또는 `isInitialStockDataReady` 같은 단일 진입점을 두고, 차트/다른 주가 의존 UI는 이 완료 후에 요청하도록 설계 검토.

### 1.4 환경 변수 검증 없음

- **위치**: `services/supabase.ts` — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 없을 때 `createClient('', '')` 로 진행.
- **문제**: URL이 비어 있으면 요청이 실제 Supabase가 아닌 현재 origin 등으로 갈 수 있고, 응답이 빈 배열/null로 올 수 있음. 로컬에서만 “데이터 없음”이 나오는 원인 후보.
- **권장**: dev 모드에서 URL/키 부재 시 콘솔에 명시적 경고(이미 있음). 추가로 stock 쪽 첫 Supabase 실패 시 `logSupabaseStockFailure`의 `urlHint`로 실제로 쓰인 URL 앞부분 확인 가능 (반영됨).

### 1.5 에러 메시지에 symbol 불일치

- **위치**: `stockService.ts` — `calculateTechnicalIndicators` 실패 로그에 `symbol` 사용, 쿼리는 `trimmedSymbol` 사용.
- **문제**: 전달 인자에 공백이 있으면 로그와 실제 쿼리 심볼이 달라 디버깅 시 혼란.
- **조치**: 실패 로그는 모두 `trimmedSymbol`(실제 쿼리와 동일) 사용하도록 통일. (logSupabaseStockFailure에 symbol로 전달 시 호출부에서 trimmedSymbol 넘기면 됨 — 현재 이미 trimmedSymbol 사용 중.)

### 1.6 db.ts — 항상 로그 노이즈

- **위치**: `services/db.ts` — `saveStockPrices`에서 `console.log('[IndexedDB] ${records.length}개 주가 데이터 저장 완료')` 무조건 실행.
- **문제**: 배포 환경에서도 매 저장마다 로그가 쌓임. 디버그 플래그 없음.
- **권장**: `DEBUG_DB_LOG` 같은 플래그로 감싸거나, 최소한 레벨을 `debug`/조건부로 변경.

---

## 2. 로컬에서만 실패할 수 있는 원인 정리

| 원인 | 설명 | 확인 방법 |
|------|------|-----------|
| **환경 변수 미적용** | `.env` 수정 후 dev 서버 재시작 안 함. Vite는 빌드/서버 시작 시점에만 `VITE_*` 로드. | 재시작 후 콘솔 `[Supabase] 로컬 연결: ...` 확인. 실패 로그의 `urlHint` 확인. |
| **URL/키 빈 값** | `VITE_SUPABASE_URL` 또는 `VITE_SUPABASE_ANON_KEY`가 빈 문자열. | `urlHint`가 `(env missing)` 또는 빈 문자열인지 확인. |
| **다른 프로젝트** | 로컬 `.env`가 배포와 다른 Supabase 프로젝트를 가리킴. 해당 프로젝트에 `stock_prices` 비어 있음. | `urlHint`가 배포 환경과 동일한지 비교. Supabase 대시보드에서 해당 프로젝트 `stock_prices` 행 존재 여부 확인. |
| **경쟁 조건** | 차트가 IDB 쓰기 전에 Supabase를 호출하고, 로컬에서는 그 Supabase 호출이 빈 결과를 반환. | 1.5s 재시도 로직으로 상당 부분 완화. 재시도 후에도 실패하면 아래 네트워크/RLS 확인. |
| **네트워크/CORS** | 로컬 origin에서만 Supabase 요청이 막히거나 실패. | 브라우저 Network 탭에서 `stock_prices` 요청의 URL, 상태 코드, 응답 본문 확인. |
| **RLS** | `stock_prices` RLS 정책이 anon에 0 rows만 허용하는 조건이 있음 (origin 등). | Supabase 대시보드 → Table → RLS 정책 확인. anon으로 로컬에서 직접 쿼리 테스트. |

---

## 3. 다음에 로컬에서 다시 실패할 때 할 일

1. **콘솔에서 새 로그 확인**  
   `[Supabase] fetchStockPriceHistory(chart) 실패: symbol=QQQ` 다음 객체에서:
   - `dataLength`: 0이면 “정상 응답인데 데이터 없음” (RLS 또는 잘못된 프로젝트 가능).
   - `urlHint`: 배포와 같은 URL 앞부분인지, `(env missing)`인지 확인.
   - `errorMessage`: 있으면 Supabase/네트워크 에러 메시지로 원인 추적.

2. **Network 탭**  
   Supabase 도메인으로 요청 필터 → `stock_prices` 요청의 Request URL, Status, Response body 확인.

3. **재시도 동작**  
   Supabase 실패 후 1.5s 뒤 IDB 재조회가 들어가므로, 그 사이에 `loadInitialStockData`가 끝났다면 차트가 그때는 IDB로 채워질 수 있음. 그래도 안 되면 위 1–2로 환경/RLS/프로젝트를 집중 점검.

---

## 4. 반영된 수정 요약

- **stockService.ts**
  - Supabase `stock_prices` 실패 시 `logSupabaseStockFailure`로 상세 로그 (data 길이, error, urlHint).
  - `fetchStockPriceHistory`: Supabase가 빈 결과를 주면 1.5s 후 IDB 재조회 1회 수행해 경쟁 조건 완화.

이 문서는 “로컬에서만 주가 데이터가 안 나온다”는 문제에 대한 원인 분석과, 같은 현상이 재발할 때의 확인 절차를 정리한 것이다.
