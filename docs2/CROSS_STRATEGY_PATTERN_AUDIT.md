# Cross-Strategy Pattern Audit

## 1. Executive Summary

무손절 다분할 최적화에서 사용한 기준을 VR 밴드, 스마트 스플릿, 무손절 다분할, MA 구간매수에 교차 적용해 감사했다. 결론은 다음과 같다.

- **No-Stop Multi-Split:** 최근 정리한 `fetchIndicatorAwareSnapshot` dedupe, hook dependency 안정화, `noStopExecutionMessages.ts` SSOT가 잘 적용되어 있다.
- **Smart Split:** 지표 스냅샷 dedupe는 공유받지만, `hooks/useMultiSplitExecution.ts`에는 무손절 훅에서 제거한 `networkSnapshot` dependency 재진입 패턴이 남아 있다.
- **VR / MA:** 전략 계산 자체보다 `Dashboard`, `utils/dailyExecutionSummary.ts`, `supabase/functions/_shared/maSummaryShared.ts`의 공통 가격 fetch 및 메시지 문자열 중복이 주요 리스크다.
- **Execution Mutex:** 핵심 저장/삭제/거래 입력 흐름은 `useMutexAction` 또는 `useRef` lock으로 대체로 양호하다. 본 감사 범위에서 금융 기록 저장 관련 Critical 누락은 발견하지 못했다.

## 2. Strategy Scorecard

| 전략 | Network Deduplication | Referential Stability | Execution Mutex | I18N Consistency |
| --- | --- | --- | --- | --- |
| VR 밴드 | WARN | WARN | PASS / N-A | WARN |
| Smart Split | PASS | WARN | PASS / N-A | PASS with naming WARN |
| No-Stop Multi-Split | PASS | PASS | N-A | PASS |
| MA 구간매수 | WARN | FAIL | PASS | WARN |

## 3. Findings & Recommendations

### A. Network Deduplication

#### A-1. Indicator snapshot 경로는 PASS

- **위치:** `services/stockService.ts`, `hooks/useMultiSplitExecution.ts`, `hooks/useNoStopMultiSplitExecution.ts`
- **상태:** PASS
- **근거:** `fetchIndicatorAwareSnapshot`은 `indicatorSnapshotInflightRequests`로 동일 `cacheKey`의 동시 요청을 Promise 공유한다. Smart Split과 No-Stop은 이 경로를 사용한다.
- **추가 검증:** `utils/stockService.test.ts`에 동시 indicator snapshot 요청 dedupe 테스트가 있다.

#### A-2. 일반 가격/히스토리 fetch에는 in-flight dedupe가 없음

- **위치:** `services/stockService.ts`
- **대상 함수:** `fetchStockPrices`, `fetchStockPriceHistory`, `fetchStockPricesWithPrev`
- **영향 전략:** VR 밴드, MA 구간매수, 시장/상세 화면, 포트폴리오 평가금액 계산
- **상태:** WARN
- **근거:** indicator snapshot은 dedupe되지만, 가격 목록과 차트/MA용 history는 같은 symbol/day 요청이 동시에 들어와도 완료 전 Promise를 공유하지 않는다.
- **수정 제안:** `fetchStockPriceHistory`에는 `symbol|days` 단위, `fetchStockPrices`에는 정규화된 symbol set + mode 단위 in-flight map을 추가한다. AbortSignal은 무손절 dedupe와 동일하게 호출자별 abort wrapper를 두고 공유 요청 자체를 죽이지 않는다.

### B. Referential Stability

#### B-1. Smart Split 훅의 성공 직후 effect 재진입

- **위치:** `hooks/useMultiSplitExecution.ts`
- **상태:** WARN
- **문제:** fetch effect dependency에 `networkSnapshot`이 포함되어 있어 snapshot 성공 직후 effect가 다시 진입한다. 현재 guard가 있어 기능 오류는 낮지만, 무손절에서 제거한 lifecycle overhead가 남아 있다.
- **수정 제안:** `resolvedSnapshotCacheKeyRef`를 추가하고 `networkSnapshot` dependency를 제거한다. 무손절 훅의 패턴을 Smart Split 훅에 동일하게 적용한다.

#### B-2. Dashboard MA/metrics 경로가 `portfolio` 객체 전체에 민감함

- **위치:** `components/Dashboard.tsx`
- **상태:** FAIL
- **문제:** MA 분석 effect와 metrics effect가 `portfolio` 객체 전체를 dependency로 사용한다. 포트폴리오 이름, 알람 설정, 기타 전략 필드 등 분석에 필요 없는 참조 변화도 price/history fetch와 계산을 재실행할 수 있다.
- **수정 제안:** `portfolio.id`, `portfolio.trades`, `portfolio.strategy.ma0`, `portfolio.strategy.ma1`, `portfolio.strategy.ma2`, `portfolio.strategy.ma3`, `portfolio.strategy.vrBand`, `portfolio.vrSnapshot`, `portfolio.dailyBuyAmount`, `portfolio.feeRate`처럼 실제 사용 필드로 분해한다. 더 안전한 1차 조치는 MA 분석 입력용 ViewModel을 `useMemo`로 만들고 effect는 그 ViewModel만 의존하게 하는 것이다.

#### B-3. 표시/입력 모달 일부는 `portfolio` 전체 의존이 남아 있음

- **위치:** `components/TradeExecutionModal.tsx`, `components/QuickInputModal.tsx`, `components/portfolioDetails/usePortfolioDetailsController.ts`
- **상태:** WARN
- **문제:** `getTradeExecutionBuyStocks`, `getSellableStocks`, 상세 평가 계산 등이 `portfolio` 전체 참조에 묶여 있다.
- **수정 제안:** 현재는 사용자 액션/모달 단위라 우선순위는 낮다. 다만 카드 수가 많은 화면과 동시에 열릴 수 있는 모달은 `portfolio.trades`, `portfolio.strategy`, `portfolio.vrSnapshot` 등으로 의존성을 좁힌다.

### C. Execution Mutex

#### C-1. 핵심 금융 저장/삭제 경로는 PASS

- **위치:** `hooks/usePortfolioMutations.ts`, `hooks/useMutexAction.ts`
- **상태:** PASS
- **근거:** 포트폴리오 생성/수정/종료/삭제, 거래 추가/삭제, 폐쇄 이력 삭제가 `useMutexAction`을 통해 synchronous `isExecutingRef` one-flight를 사용한다.

#### C-2. 주요 모달 저장/확정도 PASS

- **위치:** `components/TradeExecutionModal.tsx`, `components/QuickInputModal.tsx`, `components/strategyCreator/useStrategyCreatorController.tsx`, `components/alarm/useAlarmModalController.ts`, `components/AIImageInputModal.tsx`, `components/tds-adapter/useAsyncTdsConfirm.ts`
- **상태:** PASS
- **근거:** 거래 저장, 빠른 입력 저장, 전략 생성 저장, 알람 저장, AI 인식 결과 저장, TDS confirm 모두 `useRef` mutex를 사용한다.

#### C-3. App-level 부수 액션은 WARN

- **위치:** `App.tsx`, `components/TossLoginView.tsx`, `components/auth/ProfileView.tsx`
- **상태:** WARN
- **근거:** 금융 기록 저장은 아니지만 MiniApp exit, Toss login, Telegram connect 같은 부수 async 액션 일부는 loading state 중심이다. 피해 범위는 낮지만 Rule 11 일관성 관점에서는 `useMutexAction` 또는 local ref로 통일 가능하다.

### D. I18N Consistency

#### D-1. Smart Split / No-Stop 실행 요약은 PASS

- **위치:** `supabase/functions/_shared/multiSplitExecutionMessages.ts`, `supabase/functions/_shared/noStopExecutionMessages.ts`, `components/Dashboard.tsx`, `components/TradeExecutionModal.tsx`
- **상태:** PASS
- **근거:** 두 전략의 실행 요약 라인은 도메인별 message builder를 통해 생성된다.

#### D-2. MA / VR 일별 실행 문구가 중복되어 있음

- **위치:** `utils/dailyExecutionSummary.ts`, `supabase/functions/_shared/maSummaryShared.ts`, `constants/messages/dashboardMessages.ts`, `constants/vrMessages.ts`
- **상태:** WARN
- **문제:** MA 관망/중간익절 문구와 VR 알림 블록 문구가 로컬 `STRINGS`로 중복 정의되어 있다. 특히 `maSummaryShared.ts`의 `formatVrBandBlock`은 VR pending/ready hint를 함수 내부에서 직접 분기한다.
- **수정 제안:** 서버/클라이언트 공용 실행 요약용 `vrExecutionMessages.ts`와 `maExecutionMessages.ts`를 만들고, `dailyExecutionSummary.ts`와 `maSummaryShared.ts`가 같은 builder를 쓰게 한다.

#### D-3. 전략명 naming drift가 남아 있음

- **위치:** `constants.tsx`, `constants/messages/dashboardMessages.ts`, `utils/dailyExecutionSummary.ts`, `supabase/functions/_shared/maSummaryShared.ts`
- **상태:** WARN
- **문제:** `constants.tsx`에는 `strategyMultiSplitTitle: "다분할 매매법"`이 남아 있고, Dashboard/일별 요약은 `"스마트 스플릿"`을 사용한다. 사용자-facing 전략명 drift 가능성이 있다.
- **수정 제안:** 리브랜딩 기준 전략명을 `strategyCreatorMessages.ts` 또는 별도 `strategyNameMessages.ts`로 모아 Dashboard, StrategyCreator, Backtest, daily summary가 같은 source를 사용하게 한다.

## 4. Recommended Action Plan

### Step 1. Smart Split hook parity

- `hooks/useMultiSplitExecution.ts`에 No-Stop과 같은 `resolvedSnapshotCacheKeyRef` guard를 적용한다.
- `networkSnapshot`을 fetch effect dependency에서 제거한다.
- 테스트: `hooks/useMultiSplitExecution.test.ts`, `utils/multiSplitCrossValidation.test.ts`

### Step 2. Price/history in-flight dedupe

- `services/stockService.ts`에 `stockPriceInflightRequests`, `stockHistoryInflightRequests`를 추가한다.
- key는 정규화 symbol set + mode, 또는 `symbol|days`로 만든다.
- AbortSignal은 호출자별 fail result/abort wrapper로 처리한다.
- 테스트: `utils/stockService.test.ts`에 동시 `fetchStockPrices`, 동시 `fetchStockPriceHistory` 테스트 추가

### Step 3. Dashboard MA dependency split

- MA 분석 effect 입력을 `maAnalysisVm`으로 분리한다.
- metrics effect도 `portfolio` 전체 대신 실제 사용하는 valuation input으로 좁힌다.
- 테스트: `components/Dashboard.test.tsx`

### Step 4. MA / VR execution message SSOT

- `supabase/functions/_shared/maExecutionMessages.ts`와 `supabase/functions/_shared/vrExecutionMessages.ts`를 추가한다.
- `utils/dailyExecutionSummary.ts`와 `supabase/functions/_shared/maSummaryShared.ts`의 중복 `STRINGS`를 해당 builder로 교체한다.
- 테스트: `utils/maStrategyCrossValidation.test.ts`, `utils/vrSnapshotRefresh.test.ts`, 관련 summary 테스트

### Step 5. Strategy name consolidation

- 전략명 source를 하나로 만든다.
- `constants.tsx`, `constants/messages/dashboardMessages.ts`, `constants/messages/strategyCreatorMessages.ts`, `constants/messages/backtestMessages.ts`의 전략명을 같은 source에서 가져오도록 정리한다.

## 5. Priority

1. **P0:** `hooks/useMultiSplitExecution.ts`의 `networkSnapshot` dependency 재진입 제거
2. **P1:** `fetchStockPriceHistory` in-flight dedupe
3. **P2:** `fetchStockPrices` in-flight dedupe
4. **P3:** Dashboard MA/metrics dependency split
5. **P4:** MA/VR 실행 요약 메시지 SSOT 통합
6. **P5:** 전략명 rebranding SSOT 통합
