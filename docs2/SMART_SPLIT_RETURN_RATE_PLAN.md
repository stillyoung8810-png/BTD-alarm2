---
name: 스마트 스플릿 수익률 파라미터 확장 계획
overview: 스마트 스플릿에 중간 익절 수익률(B)을 추가하고, 일별 매매 실행 표시·입력 클램프 정책까지 정리한 Step 1-2 전용 계획서입니다.
stage: simulation-only
status: draft
---

# 스마트 스플릿 수익률 파라미터 확장 계획

## 문서 목적
- Step 1: 기존 구조 확인 + 변경 계획 수립.
- Step 2: 검증 가능한 스니펫 제공.
- Step 3(프로덕션 적용)는 **Simulation Pass 이후**에만 진행.

## 현재 구조 요약 (확인한 파일)
- `types.ts`, `supabase/functions/_shared/types.ts`: `MultiSplitStrategy`는 `targetReturnRate`만 보유하고, 중간 익절 수익률 B는 아직 없음.
- `src/components/StrategyCreator/utils.ts`: `MultiSplitWizardDraftInput` → `buildMultiSplitStrategy`에서 런타임 전략을 구성.
- `components/strategyCreator/useStrategyCreatorController.tsx`: 기본값/상태 관리, `intermediateTakeProfitRatioPct = 100 - mainTakeProfitRatioPct`.
- `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`: UI 구성 및 렌더 순서.
- `constants/messages/strategyCreatorMessages.ts`: 스마트 스플릿 UI 라벨/문구.
- `supabase/functions/_shared/multiSplitExecutionMessages.ts`: 일별 매매 실행 표시(익절은 수량만 노출).

### 현재 UI 배치(스마트 스플릿)
1. 목표 수익률 `targetReturnRate`
2. 총 분할 횟수
3. 기본 LOC 비율
4. 리스크 컷 비중
5. 메인 익절 비중(슬라이더) + 중간 익절 비중(읽기 전용)

## 변경 목표 요약
1. **수익률 파라미터 확장**
   - 목표 수익률 A(`targetReturnRate`): 10%~100%.
   - 중간 익절 수익률 B(`intermediateReturnRate`): 1%~10%.
   - Draft → Runtime → Supabase 타입까지 완전 관통.
2. **UI/UX 순서/문구 개선**
   - 목표 수익률 A 다음에 **중간 익절 수익률 B** 입력 폼 배치.
   - 라벨 변경: `기본 LOC 비율 (%)` → `평단가 매수 비율 (LOC 주문) (%)`.
   - 리스크 컷 헬퍼 문구 추가: `현금 소진시, 손절할 보유 물량 비율`.
3. **검증 강화**
   - 중앙 밸리데이터(`validateFinancialArgs`) 기반의 범위 검증 헬퍼 추가.
   - 상한(max) 검증은 헬퍼 함수에 집중(인라인 if 분산 금지).
4. **일별 매매 실행 표시 개선**
   - 메인 익절 가격: `avgPrice * (1 + targetReturnRate / 100)`.
   - 중간 익절 가격: `avgPrice * (1 + intermediateReturnRate / 100)`.
   - 보유 수량이 있는 상태에서 계산 수량이 0이어도 Smart Split은 **0수량 그대로 표시**.
   - 보유 수량 자체가 0이면 익절 라인 대신 `보유 수량이 없습니다.` 한 줄만 표시.

## Step 1: 구현 계획 (프로덕션 적용 전, 설계만)

### 1) 타입/데이터 파이프라인
추가 필드: `intermediateReturnRate`

수정 대상:
- `types.ts`, `supabase/functions/_shared/types.ts`
  - `MultiSplitStrategy`에 `intermediateReturnRate` 추가.
- `src/components/StrategyCreator/utils.ts`
  - `MultiSplitWizardDraftInput`에 `intermediateReturnRate` 추가.
  - `buildMultiSplitStrategy()`에 전달/기본값 처리 추가.
- `components/strategyCreator/useStrategyCreatorController.tsx`
  - 기본값, 상태 바인딩, 핸들러(`handleMultiSplitIntermediateReturnRateChange`) 추가.
  - UI에 전달할 `multiSplitIntermediateReturnRate` 값 추가.
- `hooks/useMultiSplitExecution.ts`
  - 런타임 전략 파싱 시 `intermediateReturnRate` 존재/범위 검증을 포함.
- `supabase/functions/_shared/multiSplitShared.ts`
  - `MultiSplitSellGuide`에 익절 가격을 포함하는 display 모델 추가.
  - 익절 가격 계산은 `avgPrice` + 수익률(A/B)로 분리.

### 2) 검증 로직
- 중앙 헬퍼: `validateMultiSplitReturnRates()` (공용 유틸; Step 2 스니펫에 포함).
- 중앙 클램프 헬퍼: `normalizeMultiSplitReturnRates()` (공용 유틸; Step 2 스니펫에 포함).
- 범위 상수(매직 넘버 제거):
  - `MIN_MAIN_RETURN_RATE_PCT = 10`, `MAX_MAIN_RETURN_RATE_PCT = 100`
  - `MIN_INTERMEDIATE_RETURN_RATE_PCT = 1`, `MAX_INTERMEDIATE_RETURN_RATE_PCT = 10`
- 사용 위치:
  - Strategy Creator의 commit 경로에서 **클램프 우선 적용**.
  - 클램프 헬퍼는 문자열을 만들지 않고 **`didClamp`만 반환**합니다.
  - UI 계층이 `didClamp === true`일 때 토스트 `설정 범위를 벗어 났어요.` 를 노출합니다.
  - 저장/실행 직전 shared util에서는 **정규화된 값이 범위 안인지 다시 검증**(방어 로직).
  - 익절 가격 계산 시(평단가/수익률 유효성 체크).

### 2-1) 입력 정책 확정
- 범위 밖 입력은 **에러로 막지 않고 자동 클램프**합니다.
- 상한 초과 시 최대값, 하한 미만 시 최소값으로 자동 조정합니다.
- 클램프 발생 여부는 순수 헬퍼에서 **boolean(`didClamp`)만 반환**합니다.
- 토스트 메시지 선택과 노출은 UI/I18N 계층에서 처리합니다.

### 3) UI/UX 배치 변경
`MultiSplitConfigStepView`의 숫자 입력 그리드를 아래 순서로 재정렬:
1. 목표 수익률 A (`targetReturnRate`)
2. 중간 익절 수익률 B (`intermediateReturnRate`)
3. 총 분할 횟수
4. 평단가 매수 비율 (LOC 주문)
5. 리스크 컷 비중 (+ 헬퍼 문구)

### 4) I18N 문구 변경
`constants/messages/strategyCreatorMessages.ts`
- `multiSplit.baseLocRatio` → 새 문구로 교체.
- `multiSplit.intermediateReturnRate` 새 키 추가.
- `multiSplit.riskCutRatioPctHelper` 새 키 추가(헬퍼용).
- 한국어/영어 모두 추가.

추가로 실행/피드백 메시지에서도 아래 키가 필요합니다.
- 범위 이탈 토스트: `설정 범위를 벗어 났어요.`
- 무보유 안내: `보유 수량이 없습니다.`

### 5) 일별 매매 실행 표시 변경
- `multiSplitExecutionMessages.ts`
  - 메인/중간 익절 라인을 **가격 + 수량**으로 표기(`formatPriceQuantityLine` 재사용).
  - 보유 수량이 있는 상태라면 수량 0이라도 **표시 객체가 있으면 출력**(no-stop과 일관).
  - 보유 수량이 0이면 메인/중간 익절 라인을 만들지 않고 **무보유 안내 한 줄만 출력**.
- `multiSplitShared.ts`
  - `buildDisplayOrder`/`buildDisplayQuantityOnlyOrder`는 **0 수량도 유지**하도록 display 전용 helper로 분리.
  - 실행용(실제 주문)을 분리해야 한다면 `deriveExecutableOrder` 패턴을 재사용.
  - 메인 익절 가격은 `targetReturnRate(A)`, 중간 익절 가격은 `intermediateReturnRate(B)`를 사용합니다.

### 5-1) 백테스트 범위 명시
- `Backtest`는 아직 미출시 항목이므로 **이번 Step 3 범위에서 제외**합니다.
- 즉, B 수익률/클램프/문구 변경은 Strategy Creator + 실행 요약 + shared 계산까지만 반영합니다.

### 6) 테스트/검증 (Step 3에서 수행)
- `docs2/smart-split-return-rate-snippets.ts` 기반 스니펫 테스트(또는 문서 하네스).
- 전략 빌더/런타임 파서가 범위 밖 값에서 정상적으로 **클램프**되는지 확인.
- 클램프 시 `didClamp`가 정확히 올라오고, UI가 해당 플래그로 토스트를 띄우는지 확인.
- 일별 매매 실행 요약에 가격/수량/0수량 표시가 포함되는지 확인.
- 보유 수량이 0이면 `보유 수량이 없습니다.` 한 줄만 표시되는지 확인.

## 오버엔지니어링 방지 체크
- 범위 검증은 단일 헬퍼로만 집중(중복 if/클램핑 금지).
- 기존 LOC/MOC 수량 계산은 변경하지 않고, 익절 가격/표시 모델만 확장합니다.
- UI 필드 추가/배치 변경만 수행하고, 별도 상태 관리 계층은 만들지 않음.
- 미출시 `Backtest`까지 확장하지 않음.

## 확정 정책
1. 중간 익절 수익률 B는 **실행 요약/주문 계산에 바로 사용**합니다.
2. `Backtest`는 **이번 범위에서 제외**합니다.
3. 범위 밖 입력은 **자동 클램프 + 토스트** 정책을 사용합니다.
4. 보유 수량이 0이면 익절 라인 대신 **`보유 수량이 없습니다.`** 한 줄만 표시합니다.

## Step 2 산출물
- `docs2/smart-split-return-rate-snippets.ts`
