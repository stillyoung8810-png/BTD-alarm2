---
name: TVC 최적화 수평 전개 감사
overview: TVC에서 발견·수정한 bulk 조회, chunking, parity test, UI 렌더 안정성 이슈가 MA·Multi-split·No-stop 등 다른 전략에도 반영되어 있는지 점검한 감사 리포트입니다.
stage: pre-launch-audit
status: draft
---

# TVC 최적화 수평 전개 감사

## 통과 여부

**부분 통과입니다.**

- TVC에서 적용한 `refresh-vr-snapshots`의 **대상 DB 필터링 + update chunking**은 TVC 배치에는 적용되어 있습니다.
- 알림 트리거의 `sent_alarms` N+1 조회도 **1회 bulk 조회 + Set 판정**으로 개선되어 있습니다.
- MA, Multi-split, No-stop은 이미 **캐시, inflight dedupe, chunk/concurrency 제한**을 일부 갖고 있습니다.
- 다만 주가 히스토리 조회는 아직 전략별 런타임에서 **심볼 단위 개별 조회 경로**가 남아 있어, TVC 수준의 “한 번 모아서 한 번에 가져오기”까지는 완전히 수평 전개되지 않았습니다.

## 감사 범위

- 백엔드/서비스 통신 경로
  - `supabase/functions/refresh-vr-snapshots/index.ts`
  - `supabase/functions/_shared/vrSnapshotRefresh.ts`
  - `supabase/functions/check-and-trigger-alarms/index.ts`
  - `supabase/functions/generate-daily-execution-summaries/index.ts`
  - `supabase/functions/update-stock-prices/index.ts`
  - `services/stockService.ts`
- 전략 parity/cross-validation 테스트
  - `utils/vrBandStrategyParity.test.ts`
  - `utils/maStrategyCrossValidation.test.ts`
  - `utils/multiSplitCrossValidation.test.ts`
  - `utils/noStopMultiSplitCrossValidation.test.ts`
- 전략 생성 UI
  - `components/strategyCreator/StrategyCreator.tsx`
  - `components/strategyCreator/useStrategyCreatorController.tsx`
  - `components/strategyCreator/steps/MaWizardStepViews.tsx`
  - `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`
  - `components/strategyCreator/steps/StrategySelectionStepView.tsx`
  - `components/strategies/VrBandStrategyForm.tsx`

## 발견된 문제점

### 1. [Medium] Edge 일일 요약의 주가 히스토리 조회는 캐시가 있지만 “다종목 bulk”는 아닙니다

관련 파일:

- `supabase/functions/generate-daily-execution-summaries/index.ts`

현재 상태:

- `fetchPortfoliosForUsers`는 `user_id` 200개 단위 `.in()` 조회를 사용합니다.
- 유저 요약 생성은 `SUMMARY_BUILD_CONCURRENCY = 5`로 chunk 처리합니다.
- `getStockHistory`와 `getStockSnapshot`은 `historyCache`, `historyInflightCache`, `snapshotCache`, `snapshotInflightCache`를 사용합니다.
- 하지만 `stock_prices` 자체는 `eq("symbol", key)`로 심볼별 조회합니다. 같은 실행 안에서는 캐시가 중복을 막지만, 처음 필요한 심볼이 여러 개면 DB 요청은 심볼 수만큼 늘어날 수 있습니다.

회장님용 쉬운 설명:

- 지금은 같은 책을 여러 부서가 반복해서 빌리지는 않도록 “대여 기록표”는 있습니다.
- 하지만 처음 빌릴 때는 책마다 도서관을 따로 왕복합니다.
- 종목이 20개면 도서관 왕복이 20번이 될 수 있고, 이것이 DB 비용과 실행 시간을 늘립니다.

서비스에서 보이는 예시:

- 장 시작 전 일별 요약 생성 시간이 길어집니다.
- 텔레그램/푸시 요약이 늦게 갱신되거나 Edge Function 타임아웃에 가까워질 수 있습니다.
- 특정 날에 여러 전략이 같은 종목군을 동시에 쓰면 `stock_prices` 조회가 몰릴 수 있습니다.

권장 방향:

- 요약 생성 전에 필요한 `(symbol, requiredHistoryCount)`를 모으고, 최대 필요 일수 기준으로 한 번에 bulk 조회합니다.
- 기존 cache/inflight 구조는 유지하되, 첫 fetch 자체를 `bulkStockHistoryLoader`로 묶습니다.

### 2. [Low~Medium] 클라이언트 초기 주가 로딩은 종목별 개별 조회 + 무제한 `Promise.all` 경로가 남아 있습니다

관련 파일:

- `services/stockService.ts`

현재 상태:

- `fetchStockPrices`는 DB miss 심볼에 대해 `.in("symbol", dbMissSymbols)` bulk 조회를 사용합니다.
- `fetchIndicatorAwareSnapshot`은 memory/IndexedDB cache + inflight dedupe를 사용합니다.
- 하지만 `loadStockDataForSymbols`의 전체 240일 로딩 경로는 종목별 `supabase.from("stock_prices").eq("symbol", symbol)`을 `Promise.all`로 실행합니다.

회장님용 쉬운 설명:

- 앱을 처음 여는 고객이 많으면, 브라우저들이 동시에 창고에 전화를 여러 통 거는 구조입니다.
- 평소에는 문제 없지만, 출시 직후나 캐시가 비어 있는 고객이 많으면 Supabase가 짧은 시간에 바빠질 수 있습니다.

서비스에서 보이는 예시:

- 첫 실행 시 차트나 대시보드 숫자가 늦게 뜹니다.
- 일부 사용자는 네트워크가 느릴 때 “계산 중” 화면을 더 오래 보게 됩니다.
- Supabase egress와 query count가 불필요하게 증가할 수 있습니다.

권장 방향:

- `mapWithConcurrency` 공통 유틸로 동시 요청 상한을 둡니다.
- 더 나아가 `stock_prices`의 다종목 히스토리를 bulk로 가져오는 서비스 함수를 만들고, 클라이언트와 Edge의 정책을 맞춥니다.

### 3. [Low] Parity 테스트는 존재하지만 전략별 이름과 구조가 일관되지 않습니다

관련 파일:

- `utils/vrBandStrategyParity.test.ts`
- `utils/maStrategyCrossValidation.test.ts`
- `utils/multiSplitCrossValidation.test.ts`
- `utils/noStopMultiSplitCrossValidation.test.ts`

현재 상태:

- TVC는 클라이언트 `utils/vrBandStrategy.ts`와 Edge `_shared/vrBandStrategy.ts`가 이중 구현이라 `vrBandStrategyParity.test.ts`가 직접 비교합니다.
- MA는 `maStrategyCrossValidation.test.ts`가 프론트 경로와 `_shared/maSummaryShared.ts`의 구간·문구·RSI·중간익절 정합을 검증합니다.
- Multi-split과 No-stop은 핵심 엔진이 `_shared`를 재사용하거나 hook 결과와 shared engine 결과를 비교합니다.

회장님용 쉬운 설명:

- TVC는 “두 장부가 같은 숫자를 내는지” 직접 대조표가 있습니다.
- 다른 전략도 대조표는 있지만 파일 이름과 형태가 달라, 새 개발자가 “다른 전략은 검사를 안 하나?”라고 오해하기 쉽습니다.

서비스에서 보이는 예시:

- 테스트가 실제로는 있는데 놓치면, 다음 리팩토링에서 중복 테스트를 또 만들거나 중요한 테스트를 삭제할 수 있습니다.
- 앱 화면과 알림 문구가 서로 다르게 나오는 split-brain 사고를 예방하는 테스트의 소유권이 흐려질 수 있습니다.

권장 방향:

- 전략별 테스트 상단에 “이 파일이 parity 역할을 한다”는 주석 또는 문서 표를 둡니다.
- 공용 fixture helper를 만들고, 신규 전략은 `*Parity.test.ts` 또는 `*CrossValidation.test.ts` 중 하나의 명명 규칙을 따르게 합니다.

### 4. [Low] 전략 생성 UI에서 인라인 객체·핸들러와 중복 토글 컴포넌트가 남아 있습니다

관련 파일:

- `components/strategyCreator/StrategyCreator.tsx`
- `components/strategyCreator/steps/MaWizardStepViews.tsx`
- `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`
- `components/strategyCreator/steps/StrategySelectionStepView.tsx`
- `components/strategies/VrBandStrategyForm.tsx`

현재 상태:

- 전략 폼에서 `key={index}` 문제는 주요 전략 생성 Step에는 발견되지 않았습니다.
- `VrBandStrategyForm`의 주차 옵션은 `useMemo`로 안정화되어 있고, mode key도 안정적입니다.
- Multi-split/No-stop의 preset 옵션은 `useMemo`로 생성됩니다.
- 다만 `StrategyCreator.tsx`의 `dropdownInfoModalLabels={{ ... }}` 객체는 여러 Step에서 매 렌더 새로 만들어집니다.
- `ToggleField`와 `ToggleCard`가 유사한 UI·동작을 중복 구현합니다.
- `MaSectionsStepView`는 MA 1/2/3 섹션을 거의 같은 형태로 수동 전개합니다.

회장님용 쉬운 설명:

- 같은 안내문 봉투를 매번 새 봉투에 다시 담아 전달하는 구조입니다.
- 겉보기에는 문제가 없어도, 화면이 커질수록 React가 “새 물건이 왔다”고 착각해 필요 없는 일을 더 할 수 있습니다.

서비스에서 보이는 예시:

- 전략 생성 화면에서 입력할 때 드롭다운이나 칩 버튼들이 불필요하게 다시 그려질 수 있습니다.
- 모바일 저사양 기기에서 입력 반응이 미세하게 느려질 수 있습니다.
- 토글 UI가 두 군데에 나뉘어 있어 접근성 수정이 한쪽에만 반영될 수 있습니다.

권장 방향:

- `dropdownInfoModalLabels`를 `useMemo`로 한 번만 만들거나 controller에서 내려줍니다.
- MA 1/2/3 섹션은 config array + map으로 렌더링합니다.
- `ToggleField`와 `ToggleCard`는 공통 `StrategyToggleRow`로 합칩니다.
- 인라인 핸들러는 메모화된 무거운 자식에 전달되는 경우부터 우선 정리합니다. 단순 DOM 버튼은 성급한 리팩토링 대상이 아닙니다.

## 구조적 개선 우선순위

1. **공통 bulk stock history loader**
   - Edge 일일 요약과 클라이언트 주가 로딩이 같은 정책을 쓰게 하는 것이 가장 큰 비용 절감 후보입니다.

2. **공통 concurrency utility**
   - `VR_REFRESH_UPDATE_CHUNK_SIZE`, `PORTFOLIO_USER_CHUNK`, `SUMMARY_BUILD_CONCURRENCY`, `BATCH_SIZE` 등은 이미 흩어져 있습니다.
   - “DB 쓰기”, “DB 읽기”, “외부 API 호출” 목적별로 공통 처리 함수를 두면 재발을 막을 수 있습니다.

3. **전략 parity fixture 정리**
   - 수학 결과를 바꾸지 않고 테스트 코드만 정리하는 낮은 리스크 작업입니다.

4. **전략 생성 UI 공통 컴포넌트 정리**
   - 큰 버그는 아니지만 출시 후 전략이 늘어날수록 유지보수 비용이 커집니다.

## 최종 판정

- **백엔드 배치 최적화:** 부분 통과
- **Parity 테스트:** 통과에 가깝지만 명명·fixture DRY 개선 필요
- **UI 안티패턴:** 치명적 key 문제는 통과, 참조 안정성·DRY 개선 여지 있음
- **즉시 코드 수정 필요성:** P0는 없음
- **출시 전 선택 개선:** bulk stock history loader와 공통 concurrency utility는 비용 절감 관점에서 우선 검토 가치가 높습니다.

