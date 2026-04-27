---
name: TVC 프로덕션 출시 전 성능 감사 계획
overview: TVC(Target Value Channel) 출시 전 React 렌더링, Supabase/API, 배치 작업, 도메인 안전성을 증거 기반으로 점검하고 우선순위별 리팩토링 범위를 고정합니다.
stage: pre-launch-audit
status: draft
---

# TVC 프로덕션 출시 전 성능 감사 계획

## 목적

이 문서는 기존 프롬프트의 광범위한 “전수 스캔” 요구를 실제 출시 전에 적용 가능한 감사 방식으로 좁힌 계획서입니다.

핵심 원칙은 다음과 같습니다.

- 실제 코드에서 확인된 병목만 리포트합니다. 추정만으로 `lodash/debounce` 같은 의존성을 추가하지 않습니다.
- 수학 엔진 결과값은 변경하지 않습니다. 최적화는 실행 순서, 요청 수, 참조 안정성, 테스트 보강에 한정합니다.
- `withdraw`는 UI에서 숨기되 타입과 엔진에서는 유지합니다.
- 운영 로그는 무조건 삭제하지 않고, 사용자 정보·반복 로그·디버그 로그만 단계적으로 정리합니다.

## 개선된 감사 방식

원 프롬프트는 “전체 코드베이스 스캔”과 “즉시 최적화”를 동시에 요구합니다. 더 효율적인 방식은 아래 순서입니다.

1. TVC 진입점을 먼저 고정합니다.
   - UI: `components/strategies/VrBandStrategyForm.tsx`, `components/Dashboard.tsx`, `components/VrPortfolioSummary.tsx`, `components/VrOrderModal.tsx`, `hooks/useVrOrders.ts`
   - 도메인: `utils/vrBandStrategy.ts`, `types.ts`, `constants/vrMessages.ts`
   - Edge/배치: `supabase/functions/_shared/vrSnapshotRefresh.ts`, `supabase/functions/refresh-vr-snapshots/index.ts`, `supabase/functions/generate-daily-execution-summaries/index.ts`
   - 주가/API: `services/stockService.ts`

2. 증상별로 우선순위를 나눕니다.
   - P0: 서버 쓰기 폭주, 중복 네트워크 요청, 수학 결과 불일치 가능성
   - P1: 렌더 참조 안정성, 배치 쿼리 수 절감, 운영 로그 정리
   - P2: 테스트 커버리지, i18n/접근성 같은 출시 위생

3. “성능 최적화”와 “출시 안전성”을 분리합니다.
   - 성능: 쿼리 수, 동시성, 렌더 참조, 캐시
   - 안전성: `withdraw` 보존, 클라이언트/Edge 계산 parity, 초과 인출 실패 경로

## 문제 리포트

### 1. Network & Server Optimization

| 우선순위 | 파일 | 문제 | 실제 악영향 | 리팩토링 방향 |
|---|---|---|---|---|
| P0 | `supabase/functions/_shared/vrSnapshotRefresh.ts` | `processVrRefreshBatch`가 페이지 내 모든 대상에 `Promise.allSettled`로 동시에 update를 날립니다. `PAGE_SIZE=1000`과 결합되면 쓰기 폭주가 발생할 수 있습니다. | 사이클 전환 시간대에 DB 연결·쓰기 부하가 튀고, Edge Function 타임아웃이나 Supabase 과금 증가로 이어질 수 있습니다. | 페이지 내부 update 동시성을 제한합니다. 수학 결과는 그대로 두고 실행량만 chunk/pool로 제어합니다. |
| P1 | `supabase/functions/refresh-vr-snapshots/index.ts` | 열린 포트폴리오를 먼저 모두 가져온 뒤 JS에서 TVC 여부를 거릅니다. | 비-TVC 포트폴리오가 많아질수록 불필요한 네트워크 전송과 JSON 파싱 비용이 증가합니다. | 가능하면 DB 쿼리나 view/RPC 단계에서 `strategy.vrBand` 후보만 가져옵니다. PostgREST JSON 필터는 배포 전 쿼리 테스트가 필요합니다. |
| P1 | `supabase/functions/check-and-trigger-alarms/index.ts` | `(timezone, local_date)` 그룹마다 `sent_alarms`를 조회합니다. | 여러 타임존/날짜 후보가 생기는 크론 실행에서 쿼리 수가 그룹 수만큼 늘어납니다. 알림과 일별 실행 요약이 함께 돌면 서버 리소스가 낭비됩니다. | 후보 키를 먼저 모아 `sent_alarms`를 한 번에 조회하고 메모리 Set으로 중복 여부를 판단합니다. |
| P2 | `components/Dashboard.tsx` | 카드별 `buildPortfolioMetricsSnapshot` 효과가 `[portfolio]` 전체 참조에 의존합니다. | 포트폴리오 객체 참조가 넓게 재생성되는 리팩토링이 들어오면 같은 종목 주가 조회가 카드 수만큼 반복될 수 있습니다. | 단기적으로 의존성 key를 좁히고, 장기적으로 부모에서 심볼 단위 가격 맵을 한 번만 fetch합니다. |

확인 결과, TVC 입력·스크롤·resize 이벤트에 직접 연결된 API 호출은 발견되지 않았습니다. 따라서 무조건적인 debounce/throttle 도입은 현재 기준으로 불필요합니다.

### 2. Memory & Render Optimization

| 우선순위 | 파일 | 문제 | 실제 악영향 | 리팩토링 방향 |
|---|---|---|---|---|
| P1 | `hooks/useVrOrders.ts` | 스냅샷이 있을 때마다 Step 0 객체와 주문 배열을 새로 만듭니다. | 모달이 닫혀 있어도 부모 카드 렌더마다 `VrOrderModal`에 새 배열 props가 전달되어 불필요한 렌더 후보가 됩니다. | `useMemo`로 `vrSnapshot` 단위 참조 안정성을 보장합니다. |
| P1 | `components/Dashboard.tsx` | `PortfolioCardView`는 `React.memo`이지만 부모 카드에서 metrics, summary, handlers를 많이 조합합니다. 대부분은 안정적이나 `portfolio` 전체 의존 effect가 비용 확산 지점입니다. | 포트폴리오 리스트가 커질수록 작은 상태 변경도 카드 단위 계산과 effect를 유발할 가능성이 커집니다. | metrics 계산 기준을 좁히고, 가격 fetch는 부모/서비스 계층에서 dedupe합니다. |
| P2 | `components/VrOrderModal.tsx` | 주문 row key에 `idx`가 포함됩니다. 현재 주문표는 안정적이지만, 재정렬/삽입 요구가 들어오면 React diff가 불안정해질 수 있습니다. | 모달 테이블 행이 불필요하게 재마운트되어 스크롤·포커스 상태가 흔들릴 수 있습니다. | `step`과 탭/버퍼 상태 기반의 안정 key로 교체합니다. |

### 3. Dead Code & Cruft Elimination

| 우선순위 | 파일 | 문제 | 실제 악영향 | 리팩토링 방향 |
|---|---|---|---|---|
| P1 | `services/stockService.ts` | 일부 `console.log`는 `DEBUG_STOCK_LOG`로 보호되지만, `fetchStockPriceHistory`의 Supabase fallback 로그는 운영에서도 출력됩니다. | 차트/데이터 공백 상황이 많으면 운영 로그가 불필요하게 증가합니다. | 디버그 로그는 feature flag로 감싸고, 오류 로그는 유지합니다. |
| P1 | `supabase/functions/check-and-trigger-alarms/index.ts`, `supabase/functions/generate-daily-execution-summaries/index.ts` | 정상 흐름 로그와 오류 로그가 섞여 있습니다. | 크론 실행마다 로그 볼륨이 커져 관측 비용과 노이즈가 증가합니다. | 성공/후보 수 로그는 debug flag로 낮추고 실패 로그는 구조화합니다. |
| P2 | `components/VrPortfolioSummary.tsx`, `components/VrOrderModal.tsx`, `components/strategies/VrBandStrategyForm.tsx` | 일부 UI 문구가 JSX에 직접 남아 있습니다. | 성능 문제는 아니지만 출시 전 i18n 회귀와 정책 위반을 만들 수 있습니다. | `constants/vrMessages.ts`로 문구를 이동합니다. |

### 4. Domain Logic Safety

| 우선순위 | 파일 | 문제 | 실제 악영향 | 리팩토링 방향 |
|---|---|---|---|---|
| P0 | `utils/vrBandStrategy.ts`, `supabase/functions/_shared/vrBandStrategy.ts` | 클라이언트와 Edge에 동일한 TVC 수학 로직이 복제되어 있습니다. 현재는 맞지만 장기적으로 drift 위험이 큽니다. | 프론트 미리보기와 서버 배치 결과가 달라져 주문표·Cash·T가 불일치할 수 있습니다. | 단기적으로 parity 테스트를 추가하고, 장기적으로 shared package 또는 생성/동기화 절차를 둡니다. |
| P1 | `constants/vrMessages.ts`, `components/strategies/VrBandStrategyForm.tsx`, `types.ts` | `withdraw`는 UI에서 숨김 처리되어 있고 타입/엔진에는 보존됩니다. 현재 결정은 지켜지고 있습니다. | 향후 누군가 `VISIBLE_TVC_VR_MODE_KEYS`를 전체 모드 목록으로 오해하면 `withdraw` 경로 테스트나 타입을 삭제할 수 있습니다. | `VR_MODE_KEYS`와 `VISIBLE_TVC_VR_MODE_KEYS`의 역할을 테스트로 고정합니다. |
| P1 | `utils/vrSnapshotRefresh.test.ts` | 초과 인출과 정산 순서는 테스트가 있으나, UI/대시보드 사용자-facing 실패 메시지는 별도 구현 대상입니다. | 배치 실패가 로그로만 남으면 사용자에게 “왜 주문표가 갱신되지 않았는지” 설명하기 어렵습니다. | 운영 UX 범위를 정하면 실패 상태 표시 또는 관리자 알림을 별도 계획으로 분리합니다. |

## 출시 전 권장 순서

1. P0 서버 쓰기 동시성 제한을 먼저 적용합니다.
2. 클라이언트/Edge TVC 계산 parity 테스트를 추가합니다.
3. `useVrOrders` 참조 안정화와 주문 row key를 정리합니다.
4. 운영 로그를 debug flag 기준으로 정리합니다.
5. DB 단계 TVC 후보 필터링과 카드 metrics batch fetch는 트래픽 규모를 보고 P1/P2로 진행합니다.

## 검증 기준

- `utils/vrBandStrategy.test.ts`
- `utils/vrSnapshotRefresh.test.ts`
- `components/Dashboard.test.tsx`
- `hooks/usePortfolioMutations.test.ts`
- Edge 함수는 로컬 Supabase 또는 staging에서 `refresh-vr-snapshots`, `generate-daily-execution-summaries`, `check-and-trigger-alarms`를 각각 1회 이상 실행해 로그·시간·쿼리 수를 비교합니다.

