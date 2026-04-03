# 출시 전 코드 최적화 마스터 플랜

> **서비스 개요:** 주식 매매 유틸리티(백테스트, VR 밴드·주문, 포트폴리오·알람 등)  
> **런타임:** 토스 미니앱([`@apps-in-toss/web-framework`](https://developers-apps-in-toss.toss.im/)) 및 일반 웹 브라우저(일부 기능 차등)

이 문서는 출시 전 **코드 최적화·리팩토링·정리** 작업을 팀(또는 개인)이 동일한 기준으로 나누고, 머지 전 검증까지 일관되게 수행하기 위한 **실무 가이드**입니다. GitHub Wiki·Notion 등에 그대로 옮겨 사용할 수 있도록 표와 체크리스트 중심으로 구성했습니다.

---

## 1. 문서의 목적 및 기본 원칙

### 1.1 목적

- 출시 직전 기간에 **방대한 코드베이스를 한 번에** 손대다가 기능이 꼬이는 것을 방지합니다.
- **작업 단위(수리 범위)** 와 **검증 단위(QA 범위)** 를 명확히 분리해, PR 단위로 안전하게 진행합니다.
- 토스 미니앱 환경(브릿지, 세션, 인앱결제, 라이트 테마 가이드 등)에서만 드러나는 회귀를 체크리스트로 누락하지 않습니다.

### 1.2 기본 원칙: 하이브리드 접근

| 축 | 원칙 | 이유 |
|----|------|------|
| **수리(리팩토링·정리)** | **레이어(폴더)별**로 묶는다 | `utils` / `hooks` / `services` / `components` / `server` / `supabase`처럼 **같은 종류의 변경**을 연속으로 하면 패턴이 반복되어 속도와 일관성이 좋아집니다. |
| **검증(QA)** | **탭·사용자 플로우별**로 진행한다 | 한 파일이 여러 화면을 동시에 묶고 있으므로(특히 `App.tsx`, 공통 훅), **“어느 화면까지 손댔는지”** 를 탭·시나리오로 확인해야 회귀를 놓치지 않습니다. |

**한 줄 요약:** *수리는 레이어(폴더)별로, 검증은 탭/플로우별로 진행한다.*

### 1.3 도메인 특성(토스 미니앱)

- **`isTossApp()` 분기:** 테마(예: 라이트 고정), 다크 모드 토글 비노출, `restorePendingIapOrders`, 뒤로가기·종료 시 TDS 확인 다이얼로그, `closeView` 브릿지 등이 웹과 다릅니다.
- **결제:** 인앱 결제·서버 이행·웹훅·Supabase 함수가 얽혀 있어 D단계 변경은 검증 비용이 큽니다.
- **라우팅:** 메인 앱은 `react-router-dom`에서 `App`이 대부분의 경로를 담당하고, **탭 상태(`activeTab`)** 와 **`/markets`**, **`#privacy` / `#terms`** 가 함께 쓰입니다. (`index.tsx` 참고)

### 1.4 시뮬레이션 정합·최종 승인·현장 기준 (BTD-alarm2)

- **최종 승인:** `docs2/PHASE_A_TYPES_TOOLS_SIMULATION.md`의 타입·빌드·Vitest 스니펫 방향과, 본 문서 **「A2/A4 교차」** 항목(루트 `tsconfig`·`parseViteBooleanEnvFlag`·서버 TS/Vitest·`vite-env` Augmentation)에 **팀 합의로 확정**한다. 구현 PR은 해당 시뮬 §와 본 절을 함께 인용해 검증한다.
- **Vitest `typecheck` (이 저장소 버전 기준):** 루트 `package.json`의 **`vitest` ^4.0.x**, `server/package.json`의 **`vitest` ^3.2.x**. 양쪽 모두 `test.typecheck`에 **`enabled: true`**, **`tsconfig: './tsconfig.json'`**(각 패키지 **Vitest `root` 기준** 상대 경로 — `server/vitest.config.ts` 실행 시 `server/`가 루트이므로 `server/tsconfig.json`을 가리킴)를 둔다. **`checker: 'tsc'`** 는 기본값과 동일하나, 설정 가독성을 위해 **명시해도 되고 생략해도 된다.** **`ignoreSourceErrors`는 `false`(기본) 유지** — Vitest는 내부적으로 `tsc --noEmit -p <tsconfig>`로 **해당 tsconfig 프로그램 전체**를 검사하며, `typecheck.include` 기본 glob(`*.test-d.*` 등)에 잡히지 않는 파일의 오류도 **소스 오류로 실패**시켜, 테스트 전용 파일만 타입에서 빠지는 **Silent Pass** 와 정면으로 맞선다. 메이저 업그레이드 후 옵션 스키마가 바뀌면 **`node_modules/vitest`의 `TypecheckConfig` 타입**과 [Vitest 공식 문서](https://vitest.dev)를 기준으로 조정한다.
- **`vite-env.d.ts` import 경로 (이 저장소 레이아웃):** 현재 `vite-env.d.ts`는 **저장소 루트**에 있다. Phase A에서 `types/viteEnvContract.ts`를 **루트 `types/`** 에 추가하는 전제라면, `import type { … } from './types/viteEnvContract'` 가 정답이다. 향후 `src/` 이하로 선언 파일을 옮기면 **그 위치에 맞춰 상대 경로만** 바꾼다(전역 Augmentation 패턴은 동일).

---

## 2. 4단계 작업 페이즈 (Phase A ~ D)

각 페이즈는 **별도 PR(또는 PR 시리즈)** 로 나누는 것을 권장합니다. 한 PR에 A+B를 섞으면 리뷰·롤백이 어려워집니다.

### Phase A — 데드 코드 및 타입 정리 (저위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | 미사용 export·파일, 주석 처리된 옛 코드, `any` 축소·타입 좁히기, import·상수 정리, ESLint/TS 규칙 정리 |
| **위험도** | **낮음 ~ 중간** — 타입만 손대도 동작 동일해야 하나, 동적 import·문자열 기반 라우트·리플렉션에만 쓰이는 심볼 삭제 시 런타임 오류 가능 |
| **중점 확인** | 삭제 전 **전역 검색(`grep`)**, `npm run build`, 변경 파일이 **어느 탭에서 참조되는지** 한 줄 메모 |
| **QA 힌트** | 해당 폴더를 직접 쓰는 **대표 탭 1개**만 스모크 테스트해도 됨(전수는 불필요) |

**세부 분류(러프):** A1 데드 코드 / A2 `any`·타입 / A3 상수·i18n 딕셔너리 정리 / A4 린트·포맷 일괄

**확정(비가역) — A2 `StrategySliceKey` (전략 데이터 슬라이스 키)**

1. **의미:** `StrategySliceKey`는 **앱 UI 탭 ID가 아니라**, `Strategy` 데이터 모델에서 **전략 데이터 조각(Slice)을 식별하는 고유 키**다. (QuickInput의 `activeSection: 1 | 2 | 3` 등 **UI·입력 축**과 동일 개념이 아니다.)
2. **리네이밍:** 레거시 명칭 **`StrategySection`** 및 해당 **TS `enum`** 은 **폐기**하고, 심볼·문서·시뮬레이션 전반을 **`StrategySliceKey`** 로 통일한다.
3. **구현 형태:** TS `enum` 금지. **`STRATEGY_SLICE_KEY_VALUES`** (`as const` 배열) + **`export type StrategySliceKey = (typeof STRATEGY_SLICE_KEY_VALUES)[number]`** — 트리 쉐이킹·역방향 매핑 오버헤드 회피.
4. **동기화:** `types.ts`와 `supabase/functions/_shared/types.ts`(및 동일 타입을 복제한 경로)에 **동일 SSOT**를 적용해 드리프트를 막는다.
5. **시뮬·스니펫 SSOT:** `docs2/PHASE_A_TYPES_TOOLS_SIMULATION.md` §0.2·§3.2.1·§3.3.1·§3.5.
6. **리네이밍 실행 규칙 (연쇄 참조 누락 금지·TS 무에러):**
   - **금지:** `StrategySection` 등 식별자를 **프로젝트 전역 텍스트 치환(find-replace)만**으로 바꾸는 방식. 주석·문자열·다른 심볼 오인·일부 파일 누락으로 **타입 참조와 실제 심볼이 어긋날 위험**이 크다.
   - **필수:** Cursor / VS Code 등에서 **Rename Symbol**(예: 심볼에 커서 후 **F2**, 또는 우클릭 **Rename Symbol**)을 사용해, **TypeScript 언어 서비스가 추적하는 참조(import·타입 위치·별칭 등)** 가 **호출부(Callers) 전부에 연쇄 반영**되도록 한다. (동일 워크스페이스·`tsconfig`에 포함된 파일이 대상.)
   - **`enum` → `as const` + `type` 전환 시 권장 순서:** (1) 먼저 **타입으로서 쓰이는 심볼**에 대해 IDE **Rename Symbol**로 `StrategySliceKey` 등 **목표 이름으로 연쇄 갱신**을 끝낸다. (2) 이후 `enum` 본문을 `STRATEGY_SLICE_KEY_VALUES` + `export type StrategySliceKey` 형태로 **구조 교체**한다. (3) **`StrategySection.MA1` 같이 값(런타임 enum member)으로만 쓰이던 참조**는 Rename만으로 소비되지 않을 수 있으므로, **별도 `grep`으로 잔존을 소진**하고 동등한 리터럴·상수로 마이그레이션한다.
   - **복제 타입 정의:** `supabase/functions/_shared/types.ts` 등 **동일 이름의 복제본**이 있으면, SSOT 파일에서 Rename 후 **다른 루트의 동일 심볼도 IDE/TS가 잡는 범위 안에서** 갱신되거나, **한 번에 열린 워크스페이스·멀티 루트**에서 동일 작업을 반복해 **이름 불일치가 남지 않게** 한다.
   - **완료 기준 (보고 필수):** PR 또는 작업 요약에 **Rename Symbol 사용**을 명시하고, **TypeScript 진단 0건**(IDE Problems) 및 **`tsc --noEmit`(루트 앱·`server` 등 제품이 정한 typecheck 스크립트)** 로 **컴파일 에러 0건**임을 확인·보고한다. 마지막에 **`rg StrategySection`**(또는 동등 검색)으로 **의도하지 않은 잔존 식별자**가 없는지 확인한다(문서·시뮬의 “레거시” 설명 문구는 예외로 구분 가능).

**A2/A4 교차 — 루트 앱 `tsconfig`·Vite boolean env (시뮬 정합·Rule 6·7)**

1. **루트(브라우저) 앱 `tsconfig`:** `compilerOptions.types`에 **`node`를 포함하지 않는다** — Node 전역 타입이 DOM 앱 프로그램에 주입되면 **`setTimeout` 반환형이 `NodeJS.Timeout`으로 붙는 등** 이전에 겪었던 **브라우저 `number`와의 추론 충돌**이 재발할 수 있다. `vite.config.ts` 등 빌드 전용 파일은 **`tsconfig.node.json`**(또는 `types: ["node"]`만 쓰는 **별도 tsconfig**)으로 분리하는 것이 정석이다. 스니펫·주의: `docs2/PHASE_A_TYPES_TOOLS_SIMULATION.md` §3.5.
2. **`parseViteBooleanEnvFlag`:** 선언은 `BooleanEnvFlag`로 좁혀도 런타임에는 `''`·비정상 값이 들어올 수 있으므로, 파서는 **`raw: unknown`** 과 **단일 평가식** SSOT로 둔다(과거 시뮬 스니펫의 `BooleanEnvFlag | undefined` + `raw === ''` 조합은 strict 에서 **불가능 분기·DRY 위반**이었음 — 교정됨). 스니펫: 같은 문서 §3.3.1.
3. **서버 TS·Vitest (테스트 타입 사각지대 방지):** `server/tsconfig.json`은 IDE·`tsc --noEmit`·Vitest가 공유하는 **베이스**로 두고(`noEmit: true`, **`*.test.ts`를 exclude하지 않음**), `dist` 산출은 **`server/tsconfig.build.json`** 으로만 분리한다. **`server/package.json`** 의 `build`는 **`tsc -p tsconfig.build.json`** 으로 맞춘다. **`server/vitest.config.ts`** 에 **`test.typecheck.enabled: true`** 와 **`tsconfig: './tsconfig.json'`**(베이스)를 넣어, 테스트만 타입 검사에서 빠지는 **Silent Pass** 를 막는다. **Vitest 버전·`tsc` 동작·`ignoreSourceErrors` 유지 이유**는 **§1.4** 참고. 스니펫: 같은 문서 §3.6·§3.6.1·§3.8.
4. **`vite-env.d.ts` (전역 네임스페이스 오염 방지):** `.d.ts` 최상단에 `type ...` 를 두면 **전역으로 새어** 서드파티·향후 심볼과 충돌할 수 있다. **`types/viteEnvContract.ts`** 를 필수 SSOT로 두고, `vite-env.d.ts`에서는 **`import type`** 으로 모듈 스코프를 취한 뒤 **`declare global` 로 `ImportMetaEnv`만 Augmentation** 한다. **루트 `vite-env.d.ts` + 루트 `types/` 전제에서의 import 경로**는 **§1.4** 참고. 스니펫: 같은 문서 §3.3.

**진입점·탭 라우팅(`App.tsx` / `TabContent` 등) Phase A 시 추가 준수(워크스페이스 규칙 정렬):**

| 주제 | 기대 |
|------|------|
| **Union `switch` + WSOD 방지** | `activeTab` 등 문자열 유니온을 `switch`로 분기할 때 `default: return null`만 두지 말 것. `never` 기반 **exhaustive check**로 누락 케이스를 컴파일 타임에 잡고, 런타임 비정상 값에는 **폴백 UI**(예: 범용 로딩/안내 문구)를 반환해 하얀 화면을 방지할 것. |
| **무분별 `useMemo` vs 참조 안정화** | 단순 JSX(예: `Suspense`용 작은 `fallback` div)는 **`useMemo`로 캐시하지 말 것**. 탭 라우팅에서는 **실행 분기와 무관하게** 상단에서 fallback 엘리먼트를 여러 개 만들거나 동일 팩토리를 매 렌더 여러 번 호출하지 말고, **`React.memo` 소형 컴포넌트(`SuspenseFallback`)** 를 두고 **해당 `switch` 분기의 `Suspense` 안에서만** `<SuspenseFallback message={...} />` 로 선언할 것(`docs2/PHASE_A_ENTRY_SIMULATION.md` §0.4·§3.3). 반대로 **`React.memo` 자식에 넘기는 배열**(`activePortfolios`, `portfolios`, `closedPortfolios` 등)은 부모에서 `.filter()` 등으로 매 렌더 새 배열이 나오면 메모가 무력화되므로, **의도적으로 `useMemo`로 참조 동일성을 유지**할 것(같은 문서 §3.3 파일 B). **`roundMoney` 등 원시값(primitive)에 대한 O(1) 연산**은 참조 동일성 이슈가 없으므로 **`useMemo`로 감싸지 말 것**(오버헤드만 유발 — `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.6). |
| **`React.memo` + props** | 메모된 자식에 객체·배열 props를 줄 때는 부모에서 참조가 흔들리지 않게 설계할 것. `useCallback` 의존 배열에는 가능하면 **원시값**(`user?.id` 등)을 사용해 콜백 재생성을 줄일 것. **팀 규칙(명시적 deps·향후 훅 래핑 대비)** 에 따라 `setState` setter·`setActiveTab` 등 **본문에서 참조하는 심볼은 배열에 명시**할 것(같은 문서 §0.4). |
| **`react-hooks/exhaustive-deps`** | Core Principles의 lazy/band-aid 금지에 따라 **`eslint-disable`로 훅 린트 우회 금지**; 린트가 요구하면 **`replaceHashIfMatched` 등 순수 함수까지 예외 없이 의존 배열에 명시**할 것(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.3 파일 B 인용 블록). |
| **`useEffect`·nullable 문자열** | `string \| null` 등으로 올 수 있는 값에 대해 **`.trim()`·`.length` 전에 falsy·optional 방어** (`!value \|\| value.trim().length === 0` 등). 일일 요약 저장 effect는 `docs2/PHASE_A_ENTRY_SIMULATION.md` §3.5·§0.4 참고. |
| **비동기 실패·Silent failure** | Supabase 등 사용자 데이터에 영향 있는 실패는 `console.warn`만으로 끝내지 말고 **`showErrorToast` 등 전역 피드백**을 트리거할 것(문구는 `appShellMessages` 등 SSOT). |
| **Mutation mutex·브릿지 (Rule 11)** | 금융·포트폴리오 등 **비동기 Mutation**은 `disabled`만으로 부족할 수 있음. 진입점(`App.tsx` 등)에서 `TabContent`로 내려보내는 **모든 비동기 상태 변이**(업데이트·**파괴적 삭제/비우기** 포함)에 **1-tick 중복 제출 방지**를 적용할 것. Mutex 구현은 **`hooks/useMutexAction`** 으로 DRY·SRP 유지하고, 훅 내부는 **`await Promise.resolve(action(...args))`** 로 동기·비동기 혼합 호출을 수렴한다. **후속 확정:** 훅은 **`{ run, isExecuting }`** 를 반환하도록 확장해 **ref 뮤텍스**와 **UI 로딩/비활성**을 한곳에서 맞춘다. 구현 시 **`actionRef`** 로 최신 액션을 참조하되, **Rule 2(렌더 페이즈 ref 변이 금지)** 에 따라 **`actionRef.current` 갱신은 `useLayoutEffect`에서만** 수행하고 **`run` 참조는 고정**해 Stale closure를 피하며, 반환 객체는 **`useMemo`** 로 감싸 불필요한 참조 흔들림을 줄인다(`docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5.1). 기존 `const fn = useMutexAction(...)` 패턴은 **`const { run: fn } = useMutexAction(...)`** 로 일괄 정렬한다. 업데이트 액션 본문에서는 기존처럼 **`await Promise.resolve(handleUpdatePortfolio(...))`** 등을 유지할 수 있다. 실패 피드백은 **`showErrorToast` + `appShellMessages` SSOT** — *「다른 Mutation에도 동일 패턴을 검토」* 같은 **미완 계획 문구로 치명 경로를 남기지 말 것**(lazy/band-aid 금지). 상세: `docs2/PHASE_A_ENTRY_SIMULATION.md` §0.5·§0.7·§3.3.2·§3.3 파일 B·§3.6, `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5.1. |
| **디바운스·비동기 클로저 (Rule 7)** | `useEffect` + `window.setTimeout` 콜백 등 **비동기 클로저** 안에서 `user.id` 같이 **객체 필드**를 쓰면 TS가 **TS2531** 을 낼 수 있다. **`user?.id` 를 effect 본문에서 원시값(`currentUserId`)으로 캡처**한 뒤 콜백에는 그 값만 넘긴다(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.5·§0.7). |
| **브라우저 타이머 API (Rule 7)** | `useRef`에 디바운스·타이머 ID를 둘 때는 **`window.setTimeout` / `window.clearTimeout`** 으로 호출해 반환 타입을 브라우저 `number`에 맞출 것. 네이키드 `setTimeout`만 쓰면 `@types/node` 혼재 시 **`NodeJS.Timeout` vs `number` 추론 충돌**이 날 수 있음(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.5·§3.4 `NavIcon` 정렬). |
| **진입점 `import.meta`** | Node·CJS·일부 테스트 런타임에서 **`import.meta` 자체가 없으면 ReferenceError**가 날 수 있으므로, env 접근 전에 **`typeof import.meta !== 'undefined'`** 로 가드하거나 **`utils/viteImportMetaEnv.ts`의 `getViteImportMetaEnv()`** 로 일원화한다. 반환된 env에 대해서만 **`?.DEV`**, **`?.VITE_*`** 등을 쓴다. **`import.meta?.env` 는 금지** — `import.meta`는 메타 속성이라 **그 자체에 `?.` 를 붙이면 TS1303 등 파싱 오류**가 날 수 있다(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.1·§0.6). |
| **`lang`·앱 셸 딕셔너리 (확정)** | 현재 아키텍처에서 `lang` 은 **`'ko' \| 'en'` 으로만 통제**되며, 런타임에 제3의 문자열이 주입될 여지가 없다. 따라서 **정식 언어 추가 전까지** `APP_SHELL_MESSAGES[lang] ?? APP_SHELL_MESSAGES.ko` 처럼 **도달 불가능한 nullish 폴백(Dead Code)** 을 두지 않는다 — **`const copy = APP_SHELL_MESSAGES[lang]`** 만 사용한다(Core Principles·Dead Code 금지와 정합). 새 언어를 제품에 추가할 때는 **유니온 타입·딕셔너리 키·필요 시 폴백**을 그 시점에 일괄 설계한다(`docs2/PHASE_A_ENTRY_SIMULATION.md` §0.6·§3.2·§3.3·§3.6). |
| **매직 넘버·인라인 스타일** | 셸 UI(헤더 아이콘 크기, `marginTop: 2` 등)는 **파일 상단 상수** 또는 **Tailwind 유틸 클래스**로 의미를 드러낼 것. `style={{ ... }}` 객체는 메모 컴포넌트와 결합 시 리렌더 유발 가능성이 있으므로 가능하면 클래스로 대체할 것. |
| **VR 주기별 입·출금(`deltaCash`) 입력 (Rule 1·A3)** | UI에는 **0 이상의 양수(또는 0)** 만 허용한다. **음수**는 검증 실패로 에러를 표시하고 저장하지 않는다. 과도한 금액 방지를 위해 **`MAX_WITHDRAWAL_AMOUNT_USD`(예: 1_000_000)** 를 `constants`(예: `constants/vrConstants.ts`)에 두고 동일 상한으로 검증한다. 저장 시 인출 모드 부호는 `getVrDeltaCashForNextV` 등 기존 금융 규칙으로 정규화한다. 시뮬레이션: `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.3·§3.4. |
| **폼 검증 vs 저장 페이로드·핸들러 네이밍 (Rule 6·8·A3)** | **요약:** UI에서 정제·평면 DTO 검증 후에만 훅으로 전달; 훅 내부 폼 검증 제거(SRP). **`handle` 접두사**·§3.6 시뮬 참조. **상세 계약은 아래 「확정 — A3 포트폴리오 폼…」** 과 `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §0·§2.1·§3.3·§3.6. |

**확정(비가역) — A3 포트폴리오 설정 폼 검증 파이프라인 (Option B·Rule 1·6·SRP)**

팀이 **Option B** 와 **에러 반환 방식**을 최종 확정했다. 구현·리뷰·QA는 아래를 위반하지 않는다.

1. **데이터 구조 (Option B)**  
   - **`StrategyCreator`**, 향후 **`PortfolioEditModal`** 등 **UI 컴포넌트**에서 선제 정제만 수행한다: `trim()`, `roundMoney()`(또는 제품이 채택한 동일 금융 반올림 SSOT), `Number.isFinite`·경계 정렬 등.  
   - 정제된 값으로 **평면 DTO**(시뮬의 `validatePortfolioSetupInput` 입력 형태와 동일한 계약)를 만든 뒤, **`validatePortfolioSetupInput(dto, copy)`** 를 호출한다.  
   - 검증이 **`null`(통과)** 일 때만, 그 **DTO 필드를 1비트도 변형하지 않고** 그대로 사용해 최종 **`Portfolio`** 객체를 조립한다.  
   - 조립된 `Portfolio`만 **`usePortfolios`의 `handleAddPortfolio` / `handleUpdatePortfolio`** 등 백엔드 연동 훅으로 넘긴다.  
   - **`hooks/usePortfolios.ts`에 남아 있는 이름·일매수·수수료 등 폼 성격의 인라인 검증**(`!name.trim()`, 길이·상한 분기 등)은 **제거**한다. 훅의 책임은 **세션·한도·Supabase I/O·정규화된 페이로드 수신 후 통신**으로 한정한다(SRP).

2. **에러 반환 방식 (폼 검증 표준)**  
   - **`validatePortfolioSetupInput`** 은 UI 폼 검증 전용이다. **머신 코드를 `throw`하지 않는다.**  
   - 컴포넌트가 주입하는 다국어 사전 **`copy`**(`CommonMessageSet` 등)만으로 사용자 노출 문구를 고르고, 반환 타입은 **`string | null`** 만 사용한다(`null` === 통과).  
   - **네트워크·DB·권한** 실패 등은 기존처럼 **`createPortfolioMutationError` + `getPortfolioMutationNotice`** 등 **통신·뮤테이션 경로**에서 처리하며, 폼 순수 검증기와 **역할을 섞지 않는다.**

3. **Rule 1 & Rule 6 (페이로드 무결 일치)**  
   - 검증기에 넣은 **`trimmedName`**, **`normalizedFeeRate`** 등 **정제 완료 값**은, DB에 쓰이는 문자열·숫자와 **100% 동일**해야 한다. 검증 후 **재-trim·재-round·암묵적 보정**으로 저장 값이 달라지는 경로를 **금지**한다.  
   - 생성·수정·모달 등 **데이터가 들어오는 모든 입구**는 동일 파이프라인을 따른다.

**확정(비가역) — 탭 라우팅 `default` / TS 빌드와 런타임 UX 분리**

- **빌드(TS) 단계:** exhaustive 누락·`never` 좁히기 실패 등 **엣지 케이스는 ESLint·리팩터·타입 보강**으로 해결한다. 컴파일만을 위해 사용자 화면을 희생하지 않는다.
- **런타임(사용자 화면):** 어떤 경우에도 앱이 멈추거나 **하얀 화면(WSOD)** 이 나와서는 안 된다. `TabContent` 등 진입 탭 라우팅의 `default` 분기에서는 **반드시 범용 폴백 UI**를 렌더링한다(스니펫 기준: **`<SuspenseFallback message={copy.loadingGeneric} />`** 등과 동등). `throw`·`return null`만으로 빈 메인을 두지 않는다.
- **`lang` / `APP_SHELL_MESSAGES` (팀 확정):** 위 표 **`lang`·앱 셸 딕셔너리** 행과 동일 — **`?? APP_SHELL_MESSAGES.ko` 폴백 없이 `APP_SHELL_MESSAGES[lang]` 최종본**을 따른다.

> 상세 스니펫·드라이런: `docs2/PHASE_A_ENTRY_SIMULATION.md` 참고.

---

### Phase B — 공통 로직 정비 (고위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | 금융·포트폴리오·VR 관련 **`utils/`**, 데이터·세션·구독과 연결된 **`hooks/`**, Supabase·결제·토스·주식·Gemini 등 **`services/`** |
| **위험도** | **높음** — 한 함수 변경이 대시보드·백테스트·정산·알람 등 여러 화면에 동시에 파급 |
| **중점 확인** | 기존 **`vitest`**·`test:server`가 있으면 그 경로부터; `useEffect` 의존성·에러 삼키기 여부; 금액·수량 **0·NaN·divide-by-zero** |
| **QA 힌트** | 이 페이즈 PR에는 **도메인별 최소 시나리오(섹션 4)** 를 반드시 첨부 |

**진행 원칙(핀포인트):** Phase B는 기존 시스템의 **기능·로직에 직접 파급**될 수 있으므로, **한 번에 레이어 전체를 묶지 않고** 아래 **Step B1 → B4** 순으로 **작은 PR 단위**로 세분화해 진행한다. (위험도가 낮은 **순수 계산·경계**부터, **동시성·뮤텍스**는 마지막에 집중한다.)

#### Step B1 — 순수 도메인 수학 및 유틸리티 (위험도: 하)

| 축 | 내용 |
|----|------|
| **타겟** | `utils/` (예: 수익률 계산, VR 밴드 계산식, 날짜 포맷팅) |
| **목표** | 외부 통신이나 화면(UI)과 전혀 상관없는 **순수 함수**만 먼저 수술대에 올린다. |
| **핵심 적용 룰** | **Rule 1 (금융 수학 강제):** 0으로 나누기 방지, `Number.EPSILON`을 활용한 부동소수점 오차 방어, 절대값·부호 강제 변환 로직만 **핀포인트로** 교정한다. |

#### Step B2 — 외부 I/O 및 서비스 경계 (위험도: 중)

| 축 | 내용 |
|----|------|
| **타겟** | `services/` (예: 주식 시세 가져오기, 토스/Gemini API 통신 모듈) |
| **목표** | 앱과 외부 세상(서버, API)이 만나는 **국경 검문소**를 강화한다. |
| **핵심 적용 룰** | **Rule 6 (에러 복원력)** 및 **Rule 7 (Strict TS):** 외부에서 들어오는 데이터의 `any` 타입을 차단하고, 네트워크 오류 시 앱이 중단되지 않도록 **안전한 Fallback(대체값)** 을 반환하도록 정리한다. |

#### Step B3 — React 상태 및 커스텀 훅 (위험도: 상)

| 축 | 내용 |
|----|------|
| **타겟** | `hooks/` (예: `usePortfolios`, `useAuth` 등 데이터를 화면에 연결하는 훅) |
| **목표** | 계산 로직(B1)과 통신 로직(B2)이 안정된 뒤, 이를 조립해 화면에 공급하는 **파이프라인**을 정리한다. |
| **핵심 적용 룰** | **Rule 2** 및 **Rule 10 (React 안티패턴):** 무의미한 `useMemo` / `useCallback`을 제거하고, 의존성 배열(Dependency Array)의 누락을 메워 메모리 누수·무한 렌더링을 차단한다. **SRP(단일 책임 원칙)** 에 따라 UI 로직과 데이터 로직을 분리한다. |

#### Step B4 — 동시성 통제 및 뮤텍스 (위험도: 최상)

| 축 | 내용 |
|----|------|
| **타겟** | `hooks/` 내 **모든 데이터 변경(Mutation) 함수** (예: 포트폴리오 생성, 주식 주문, 결제 승인) |
| **목표** | 사용자의 연속 입력·네트워크 지연으로 인한 **중복 처리**를 물리적으로 차단한다. |
| **핵심 적용 룰** | **Rule 11 (One-click Lock):** 버튼 `disabled`만으로는 부족할 수 있으므로, **1-tick 단위**의 중복 네트워크 요청을 막는 **동기식 `useRef` 뮤텍스**를 모든 쓰기 작업에 이식한다. (구현·네이밍은 Phase A 표의 **`hooks/useMutexAction`** 및 관련 시뮬 문서와 정합시킨다.) |

**세부 분류(요약):** B1 `utils`(순수 계산·포맷) → B2 `services`(외부 I/O·타입 경계) → B3 `hooks`(상태·효과·파이프라인) → B4 `hooks` 내 Mutation(뮤텍스·중복 제출 방지)

---

### Phase C — UI 및 화면 도메인 정리 (중~고위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | `components/` 내 **화면별·기능별** 모듈(대시보드, VR, 히스토리, 백테스트, 랜딩, 멤버십, 인증, TDS 어댑터, 광고 UI 등) |
| **위험도** | **중간 ~ 높음** — 인증·결제 진입 UI는 Phase D와 경계가 겹침; TDS 공통은 전 화면 확인 다이얼로그에 영향 |
| **중점 확인** | 워크스페이스 규칙: 하드코딩 문구·A11y·중첩 삼항 등; 토스에서만 타는 분기 재확인 |
| **QA 힌트** | **해당 도메인 체크리스트 전부** + 토스 스모크 1회 |

**세부 분류(러프):** C1 인증·프로필 / C2 대시보드·포트폴리오·모달군 / C3 VR·전략 폼 / C4 히스토리·정산 / C5 백테스트 / C6 랜딩·멤버십 / C7 광고·프리로드 / C8 TDS·토스트 공통

---

### Phase D — 백엔드 및 Edge 함수 (최고위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | `server/src`(Fastify: 토스 인증·결제·웹훅·스마트메시지 등), `supabase/functions/*` |
| **위험도** | **매우 높음** — 결제 이행 실패, 중복 청구, 알람 미발송, 계정 삭제 오류 등 **금전·알림·개인정보** 직결 |
| **중점 확인** | 멱등성, 웹훅 서명·재시도, 로그(`correlationId`), 롤백·배포 순서 문서화 |
| **QA 힌트** | **스테이징·샌드박스**에서 결제·구독·웹훅 시나리오 필수; 운영 배포는 변경 범위별 체크리스트 서명 권장 |

**세부 분류(러프):** D1 `server` 라우트·서비스 / D2 Supabase Edge / D3 배포·시크릿·모니터링

---

## 3. 도메인 ↔ 폴더 매핑 표 (Mapping Matrix)

아래는 **`App.tsx`의 `activeTab`·`index.tsx` 라우트** 를 기준으로 한 **1차 매핑**입니다. 실제 import는 컴포넌트 내부에서 더 깊게 연결되므로, 작업 시 **추가 grep** 으로 보완합니다.

### 3.1 진입점 요약

| 진입 | 설명 |
|------|------|
| 탭 `dashboard` | 로그인 시 `Dashboard`, 비로그인 시 `Landing` |
| 탭 `markets` | `Markets` (`/markets` 경로로 진입 시 동일) |
| 탭 `history` | `History` (종료 포트폴리오) |
| 탭 `backtest` | `Backtest` — **현재 하단 네비 UI는 비활성(준비 중 안내)** 이지만 코드상 탭·Lazy 로드 존재 |
| 탭 `pricing` | `Pricing` + (조건부) `CheckoutModal` |
| 탭 `privacy` / `terms` | `Privacy` / `Terms`, 해시 `#privacy` / `#terms` |
| 경로 `/posts`, `/posts/:id` | 게시판 — **웹 전용**, 토스 미니앱에서는 일반적으로 미노출 (`App.tsx` 기준) |
| 전역 | `AuthModalCoordinator`, 광고(`AdPreloadProvider`), TDS 다이얼로그, 세션 만료 게이트, 푸터 등 |

### 3.2 매핑 매트릭스

| 도메인 / 화면 | 진입 (탭·경로·해시) | 주요 `components/` | 주요 `hooks/` | 주요 `services/`·기타 프론트 | `server/src` | `supabase/functions` (관련 시) |
|---------------|---------------------|--------------------|---------------|------------------------------|--------------|----------------------------------|
| 랜딩·온보딩 | `dashboard` + 비로그인 | `Landing.tsx`, `LandingHero.tsx` | `useAuth` | `supabase.ts` | — | — |
| 대시보드·포트폴리오·VR·알람·거래 입력 | `dashboard` + 로그인 | `Dashboard.tsx`, `StrategyCreator.tsx`, `portfolio/*`, `strategies/*`, `VrOrderModal.tsx`, `VrPortfolioSummary.tsx`, `AlarmModal.tsx`, `QuickInputModal.tsx`, `TradeExecutionModal.tsx`, `AIImageInputModal.tsx`, `SettlementModals.tsx` | `usePortfolios`, `useAuth`, `useTierDisplay`, `useVrOrders`, `useFCMToken` | `supabase.ts`, `stockService`, `geminiService`, `utils/*` | — | `send-alarm`, `check-and-trigger-alarms`, `push-notification`, `refresh-vr-snapshots`, `generate-daily-execution-summaries`, `gemini` |
| 시장 | `markets`, `/markets` | `Markets.tsx` | (공유 훅) | `stockService`, `subscriptionUtils` | — | `update-stock-prices` |
| 히스토리·종료 상세 | `history` | `History.tsx`, `HistoryHeaderActions.tsx`, `PortfolioDetailsModal.tsx` | `usePortfolios` | `supabase.ts` | — | — |
| 백테스트 | `backtest` (네비 비활성) | `Backtest.tsx` | — | `utils/*`(계산), `geminiService`(해당 시) | — | — |
| 멤버십·결제 UI | `pricing` | `Pricing.tsx`, `CheckoutModal.tsx` | `useAuth` | `payment/*`, `tossIapService.ts` | `routes/payment.ts` | `verify-payment`, `payment-webhook`, `reconcile-subscriptions`, `cancel-subscription` |
| 인증·프로필·세션 | 헤더 프로필 버튼, `/auth/reset-password` | `auth/*`, `AuthModals.tsx`, `TossLoginView.tsx`, `SessionExpiredAlertGate.tsx` | `useAuth` | `supabase.ts`, `toss/*`, `tossAppBridge.ts`, `utils/authHelpers.ts`, `utils/supabaseAuthStorage.ts` | `routes/tossAuthRoute.ts`, `routes/tossDisconnectCallbackRoute.ts`, `toss/*` | `delete-account` |
| 법무·정책 | `privacy`, `terms`, `#privacy`, `#terms` | `Privacy.tsx`, `Terms.tsx`, `Footer.tsx` | — | — | — | — |
| 광고·토스 쉘 | 전역 | `services/ads/*` (예: `AdPreloadProvider`, `globalAdManager`) — `App.tsx`에서 조합 | `useAdPreload`(Provider 내부) | `tossIntegratedFullScreenAdApi.ts`, `tossAppBridge.ts` | — | — |
| 공통 다이얼로그·토스트 | 전역 | `tds-adapter/*`, `tds/TDSModal.tsx` | `useAsyncTdsConfirm` | `constants/tdsDialogMessages.ts` | — | — |
| 게시판(웹) | `/posts` | `features/board/*` | — | — | — | — |
| 앱 껍데기·오케스트레이션 | `*` → `App` | `App.tsx`, `contexts/TossAppContext.tsx` | 위 훅 다수 조합 | 위 서비스 다수 조합 | — | 클라이언트에서 직접 호출하는 테이블 RPC 등 |

> **참고:** `App.tsx`는 `daily_execution_summaries` 등 **Supabase 클라이언트 직접 호출**을 포함합니다. Phase B/C에서 `App.tsx`를 건드릴 때는 **대시보드 + 로그인 상태** QA를 필수로 넣습니다.

---

## 4. 도메인별 QA 체크리스트 (토스 미니앱 필수 고려)

머지 전 **해당 PR이 건드린 도메인** 행만 전부 체크합니다. (전부 해당 시 전체 실행)

### 4.1 공통 — 토스 미니앱 환경

- [ ] 토스 샌드박스(또는 실기기 미니앱)에서 앱 **최초 진입** 후 화면이 정상 로드된다.
- [ ] **백그라운드 → 포그라운드** 전환 후에도 로그인 상태·포트폴리오 목록이 비정상 초기화되지 않는다.
- [ ] 미니앱에서 **뒤로가기/종료** 시(TDS 확인이 있는 플로우) 다이얼로그가 뜨고, 취소·확인 동작이 기대와 같다.
- [ ] 라이트 테마 고정 등 **토스 UI 가이드**와 충돌하는 회귀가 없다(다크 토글은 웹만 해당).
- [ ] (결제 PR인 경우) **인앱 결제·복원** 플로우: 상품 선택 → 결제/취소 → 프로필 티어·혜택 반영. **미완료 주문 복원**(`restorePendingIapOrders`) 관련 회귀 확인.

### 4.2 공통 — 웹(선택·회귀 방지)

- [ ] 일반 브라우저에서 동일 시나리오 스모크(특히 다크 모드·`/posts`·게시판 링크).

---

### 4.3 도메인별 최소 시나리오

#### 랜딩·온보딩

- [ ] 비로그인 상태에서 대시보드 탭에 랜딩이 보인다.
- [ ] 로그인·회원가입 모달 진입·닫기가 정상이다.

#### 대시보드·포트폴리오·VR·알람·거래

- [ ] 포트폴리오 목록 로드·생성·수정·삭제(권한 내)가 된다. *(A3 PR인 경우: **Option B** 파이프라인 — UI 정제·`validatePortfolioSetupInput`·페이로드 일치·훅은 통신만 — 이 깨지지 않았는지 확인.)*
- [ ] 상세 모달·퀵 입력·체결·AI 입력(해당 티어) 중 PR에서 수정한 경로만큼 실행한다.
- [ ] VR 관련 화면/저장이 된다.
- [ ] 알람 저장이 되고(제한 정책 포함), 필요 시 서버/Edge와 연동되는 부분이 오류 없다.
- [ ] 종료·정산 플로우에서 금액·수익률 표시가 비정상이 아니다.

#### 시장

- [ ] 시세 탭(및 `/markets` 진입)에서 데이터·유료 시세 게이트가 기대와 같다.

#### 히스토리

- [ ] 종료 포트폴리오 목록·상세·삭제/비우기 중 PR 범위 내 동작이 정상이다.

#### 백테스트

- [ ] (백테스트 코드/계산 utils를 수정한 경우) 입력·결과·티어 게이트가 정상이다. *(UI 네비가 비활성인 경우에도 직접 진입·테스트 경로가 있으면 동일)*

#### 멤버십·결제

- [ ] 요금제 화면 진입, 로그인 요구 분기, 업그레이드 → 체크아웃 모달까지 이어진다.
- [ ] **토스:** 결제 성공/실패/취소 후 프로필·혜택(`fetchUserProfile` 등)이 일관된다.
- [ ] **서버/웹훅/Edge를 수정한 경우:** 스테이징에서 웹훅·구독 검증·재조정 함수를 별도 시나리오로 검증한다.

#### 인증·프로필·세션

- [ ] 로그인·로그아웃·프로필 열기·비밀번호 재설정 경로(`#/auth/reset-password` 유입 포함).
- [ ] 세션 만료 게이트가 의도대로 동작한다.
- [ ] (토스 연동 수정 시) 토스 로그인·연동 해제·콜백 관련 회귀.

#### 법무·정책

- [ ] 푸터 또는 링크로 이용약관·개인정보 처리방침 진입, 뒤로가기(토스 확인 포함) 후 탭 상태가 꼬이지 않는다.

#### 광고

- [ ] 전면 광고 노출·실패 시 앱이 멈추지 않는다(배치 키 변경 시 해당 배치 위치에서 재확인).

#### 공통 다이얼로그·토스트

- [ ] 확인/알림/에러 토스트가 PR에서 건드린 플로우에서 정상이다.

#### 게시판(웹)

- [ ] `/posts` 목록·상세가 PR 범위에서 깨지지 않는다.

---

## 5. 운영 팁 (선택)

- **PR 설명 템플릿:** `Phase: [A|B|C|D]`, `Folders touched: …`, `QA: 섹션 4 중 [체크한 도메인]`.
- **작은 PR:** 같은 페이즈라도 폴더 단위로 쪼개면 리뷰·롤백이 쉽습니다.
- **금융 로직:** Phase B에서 `utils`를 수정하면 백테스트·대시보드·정산을 한 묶음으로 QA에 적습니다.

---

## 6. 문서 메타

| 항목 | 내용 |
|------|------|
| 기준 코드 위치 | 루트 `App.tsx`, `index.tsx`, `components/`, `hooks/`, `services/`, `server/src/`, `supabase/functions/` |
| 갱신 시점 | 탭·라우팅 구조 또는 폴더 대규모 이동 시 이 표(§3)를 반드시 업데이트 |

---

*이 문서는 사내 출시 전 코드 품질 계획용이며, 법적·회계적 조언이 아닙니다.*
