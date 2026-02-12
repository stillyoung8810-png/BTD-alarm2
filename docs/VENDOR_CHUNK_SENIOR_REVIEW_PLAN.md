# Vendor 청크 1.3MB+ — 시니어 리뷰 기반 방안·계획

> 트리맵 분석 + 코드 검사 결과를 바탕으로, Tree-shaking 가능성·해결책별 리스크·유지보수성 계획을 정리한 문서.

---

## 1. Tree-shaking(미사용 코드 제거) 가능성

### 1.1 현재 상태 요약

| 대상 | 진입 경로 | Tree-shaking 가능성 | 비고 |
|------|-----------|---------------------|------|
| **@toss/tds-mobile** | `require('@toss/tds-mobile')` → `dist/esm/index.js` (barrel) | **거의 없음** | 패키지가 **단일 진입점만** 노출. `package.json`의 `exports`에 서브패스 없음. |
| **@toss/tds-mobile-ait** | `import('@toss/tds-mobile-ait')` (동적) | **있음** | 토스 환경에서만 동적 로드되어, 비토스 사용자 번들에는 미포함. |
| **@supabase/supabase-js** | 정적 import (supabase.ts) | **제한적** | 진입점 하나에서 전체 클라이언트 로드. 내부 모듈(realtime, auth, gotrue 등)이 모두 묶일 수 있음. |
| **recharts** | lazy 컴포넌트에서 import | **제한적** | Backtest 관련에서만 사용. 이미 manualChunks로 분리됨. |
| **lucide-react** | named import (아이콘별) | **있음** | 사용하는 아이콘만 가져오면 트리쉐이킹 됨. 이미 별도 청크로 분리됨. |

### 1.2 TDS가 통째로 번들되는 이유

- **사용처**: `TDSButton`, `TDSModal`, `TDSTextField`는 런타임에 `require('@toss/tds-mobile')`로 **Button/Modal/TextField/Menu**만 사용.
- **번들 결과**: 패키지가 `dist/esm/index.js` 하나만 제공하므로, 번들러는 해당 파일을 하나의 단위로 처리. 내부에서 사용하지 않는 컴포넌트도 **같은 모듈에 포함**되어 있으면 제거되지 않음.
- **결론**: **트리쉐이킹되지 않고, 사용 컴포넌트만 쓰더라도 전체 TDS가 포함될 가능성이 높음.**

---

## 2. 해결책별 방안 및 예상 문제점

### 해결책 A: Manual Chunks로 TDS·Supabase 격리

**내용**

- `@toss/tds-mobile`, `@toss/tds-mobile-ait` → `vendor-tds`
- `@supabase` → 기존 `vendor-api` 유지 (이미 분리됨)

**예상 효과**

- 메인 vendor에서 TDS가 빠져 **vendor 크기 감소**. 초기 로딩 시 TDS는 별도 청크로 로드.

**예상되는 문제·충돌**

| 위험 | 설명 | 대응 |
|------|------|------|
| **순환 청크** | TDS가 React·emotion을 참조하고, 앱 코드가 TDS를 참조. `vendor-tds`만 분리할 경우 보통 `vendor → vendor-tds` 단방향이라 순환 가능성은 낮음. | 빌드 후 `Circular chunk` 에러 나면 해당 조건 제거. |
| **캐시 분리** | TDS 업데이트 시 `vendor-tds`만 갱신되므로 캐시 효율은 좋음. | 별도 대응 불필요. |
| **중복 의존성** | TDS와 메인 앱이 동일 React를 참조. React는 vendor에 있으므로 vendor-tds는 React를 참조만 하고, 중복 번들되지는 않음. | Rollup이 공통 의존성을 한 청크로 묶는 방식에 따름. |

**구현** ✅ 적용됨

- `vite.config.ts`의 `manualChunks`에 `id.includes('@toss/tds-mobile')` → `vendor-tds` 추가 (tds-mobile-ait 포함).  
  Supabase는 이미 `vendor-api`에 포함되어 있으므로 변경 없음.

**적용 후 빌드 결과 (참고)**

- **vendor**: ~385 kB (기존 ~1,313 kB 대비 대폭 감소, 600 kB 이하로 해소)
- **vendor-tds**: ~922 kB (별도 청크로 분리, 토스 앱에서만 필요한 경우 선로딩 전략 검토 가능)
- **vendor-api**: ~244 kB (유지)
- 순환 청크 에러 없음.

---

### 해결책 B: Import 방식 점검 (TDS 개별 경로)

**이상적인 형태**

- Good: `import Button from '@toss/tds-mobile/dist/esm/components/Button'` (가상 예시)

**현재 패키지 구조**

- `@toss/tds-mobile`은 **서브패스 export를 제공하지 않음**.  
  `package.json`의 `exports`는 `"."`만 있으며, `dist/esm/` 아래에는 **index.js 단일 파일**만 존재 (컴포넌트별 파일 없음).

**결론**

- **해당 패키지에서는 “사용 컴포넌트만 직접 경로로 import”하는 방식(B)을 적용할 수 없음.**  
  라이브러리 측에서 컴포넌트별 진입점을 제공해야 하며, 현재는 barrel만 있음.

**대안**

1. **토스 환경에서만 TDS 동적 로드 (이미 부분 적용됨)**  
   - `@toss/tds-mobile-ait`는 이미 `import('@toss/tds-mobile-ait')`로 동적 로드.  
   - `@toss/tds-mobile`(Button, Modal, TextField, Menu)는 현재 `require()`로 정적 의존성으로 들어가 있어, **비토스 사용자도 해당 청크를 내려받게 됨.**  
2. **TDS 사용 컴포넌트를 lazy + 동적 import로 전환**  
   - 예: 토스 앱일 때만 `const TDS = await import('@toss/tds-mobile')` 후 `<TDS.Button />` 사용.  
   - 그러면 비토스 빌드에서는 `vendor-tds`(또는 tds 청크)가 초기 번들에서 제거될 수 있음.  
   - 단, TDSButton/TDSModal 등 래퍼가 여러 곳에서 쓰이므로, **진입점을 한 곳으로 모아서 동적 로드**하는 리팩토링이 필요.

---

### 해결책 C: es-toolkit, decimal.js, recharts

| 항목 | 상태 | 권장 |
|------|------|------|
| **es-toolkit** | 트리맵상 상대적으로 작고, lodash 대체용으로 적절히 사용 중. | 유지. 추가 분리 불필요. |
| **decimal.js-light** | 다른 라이브러리(예: recharts 등)의 의존성으로 포함. | 단독 manualChunk 시 순환·중복 가능성 있음. **우선 적용하지 않고**, recharts 등 상위 청크 분리로 간접 감소에 의존. |
| **recharts** | 이미 **manualChunks로 `recharts` 청크 분리**됨. | 유지. |

---

## 3. 유지보수성·클린 코드 관점 계획

(기존 `VENDOR_CHUNK_OPTIMIZATION_PLAN.md` 4장과 동일 항목을, 실행 우선순위와 함께 정리.)

### 3.1 DRY (Don't Repeat Yourself)

| 항목 | 위치 | 조치 |
|------|------|------|
| **normalizePortfolioData** | App.tsx 내부 | `utils/portfolioNormalize.ts` 등으로 추출, 한 곳에서만 정의 후 재사용. |
| **getCurrentKSTDateString** | App.tsx / Edge 등 | `utils/dateUtils.ts`에 단일 정의, 전역 사용. |
| **세션 에러 분기** | checkUser, onAuthStateChange, handleAuthError | `utils/authHelpers.ts`에 `isSessionRecoverableError(err)` 등 하나로 통합. |

### 3.2 Dead Code & Unused Props

| 항목 | 조치 |
|------|------|
| **미사용 import** (예: App의 Sparkles 등) | 사용처 확인 후 제거. |
| **userProfile 인라인 타입** | `types/userProfile.ts` 등으로 분리. |
| **전역** | ESLint `no-unused-vars` / `@typescript-eslint/no-unused-vars`로 점검 후 제거. |

### 3.3 Cognitive Complexity (인지 복잡도)

| 항목 | 조치 |
|------|------|
| **App.tsx 과다 책임** | 인증 → `useAuth`/`useSession`, 포트폴리오 CRUD → `usePortfolios`, FCM → `useFCMToken` 등 훅으로 분리. |
| **checkUser / onAuthStateChange** | `isSessionRecoverableError` 사용 + early return으로 depth 축소. |
| **parseDeviceInfo** | `utils/deviceInfo.ts`로 이동, `getBrowserName(ua)`, `getOSName(ua)` 등 작은 함수로 분할. |

### 3.4 Anti-patterns

| 항목 | 조치 |
|------|------|
| **as any** | Supabase 타입/제네릭 활용해 단계적으로 제거. |
| **인라인 콜백·객체** | `useCallback` / `useMemo`로 참조 안정화. |
| **거대 단일 컴포넌트** | 라우트·레이아웃·모달별로 분리, lazy와 조합. |

---

## 4. 적용 순서 제안

1. **해결책 A 적용**  
   - `manualChunks`에 `vendor-tds` 추가 (`@toss/tds-mobile`, `@toss/tds-mobile-ait`).  
   - 빌드 후 `Circular chunk` 여부 확인.
2. **번들 크기·트리맵 재확인**  
   - `npm run build:analyze`로 vendor 감소 효과 및 청크 구성 확인.
3. **(선택) 해결책 B 대안**  
   - 토스 전용 화면/레이아웃에서만 `@toss/tds-mobile`을 동적 import하도록 리팩토링 검토. 비토스 사용자 초기 번들에서 TDS 제외 가능.
4. **유지보수성**  
   - DRY(유틸 추출) → Dead Code 정리 → 인지 복잡도(훅 분리)·안티패턴 순으로 단계 적용.

이 문서는 트리맵과 코드베이스 검사 결과를 바탕으로 한 시니어 리뷰 요약이며, `VENDOR_CHUNK_OPTIMIZATION_PLAN.md`의 P0/P1과 함께 참고하여 적용하면 됨.
