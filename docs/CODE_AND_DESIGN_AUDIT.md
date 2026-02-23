# 코드·디자인 점검 결과 (화면 지연 / 전면 재수정 전 점검)

> 점검 일자: 2025-02 기준. 화면이 느리게 뜨는 원인과, 전면 재수정 전 확인한 코딩/에러·디자인 이슈를 정리합니다.

---

## 1. 수정 완료한 버그

### 1.1 TossAppContext 클린업 미실행 (수정됨)

**문제:** `initializeTossBridge()`가 비동기로 완료된 뒤 반환하는 `cleanups`(Safe Area 구독 해제 등)를 `useEffect` 내부 `let cleanups`에만 할당하고, cleanup 함수에서는 그 변수를 참조했습니다.  
비동기 완료 전에 컴포넌트가 언마운트되면 cleanup 시점의 `cleanups`는 여전히 빈 배열이라 **구독 해제가 한 번도 호출되지 않았습니다.**

**조치:**  
- `cleanupsRef`로 cleanups 배열을 보관.  
- `isMountedRef`로 마운트 여부 추적.  
- Promise가 resolve된 뒤 이미 언마운트됐으면 그때 반환된 cleanups를 즉시 실행.  
- effect cleanup에서는 `cleanupsRef.current`를 실행한 뒤 비웁니다.

**파일:** `contexts/TossAppContext.tsx`

---

## 2. 화면이 느리게 뜨는 데 기여할 수 있는 요인

### 2.1 토스 앱(샌드박스) 진입 시

- **TDS 동적 로딩:** `isInTossApp === true`일 때 `@toss/tds-mobile-ait`를 동적 import 합니다.  
  로딩이 끝날 때까지 **MainContent를 렌더하지 않고** "TDS 로딩 중…"만 보여주므로, 이 청크 로딩 시간만큼 첫 화면이 늦게 바뀝니다.
- **대응 방향:**  
  - TDS 청크를 preload(예: 루트에서 `import()`만 해 두고 사용은 기존대로)하거나,  
  - 토스 진입 경로를 별도 번들로 나누어 해당 경로에서만 TDS를 로드하는 방식 검토.

### 2.2 앱 공통 (웹·토스 둘 다)

- **App.tsx 초기 부담**
  - `useState`/`useEffect`가 많고, 마운트 직후 다음이 동시에 돌아갑니다.
    - IndexedDB 초기 데이터 로딩 (`loadInitialStockData()`)
    - 전체 평가액 계산 (`aggregateHoldings` → `fetchStockPricesWithPrev` 등)
    - 세션/포트폴리오 복구
  - 이들이 모두 끝나기 전에도 **첫 페인트는 가능**하지만, 데이터 의존 UI가 많으면 “내용이 채워지는 느낌”이 늦어질 수 있습니다.
- **대응 방향:**  
  - 첫 화면에 꼭 필요한 데이터만 먼저 로드하고, 나머지는 requestIdleCallback/지연 로딩.  
  - 평가액 계산을 워커나 비동기로 밀어서 메인 스레드 블로킹을 줄이기.

- **index.html 외부 리소스**
  - AdSense, 포트원 SDK, Pretendard, Inter 등이 head에서 로드됩니다.  
  - 필수 폰트만 초기 로드하고 나머지는 `font-display: optional` 또는 지연 로드 검토.

---

## 3. 코딩/품질 이슈 (에러·일관성)

### 3.1 Lint / 타입

- **App.tsx, TossAppContext, tossAppBridge:** 현재 린트/타입 에러 없음 (점검 시점 기준).

### 3.2 스타일/색상 중복 (디자인 재수정 시 정리 권장)

- **배경/기본 색이 여러 곳에 하드코딩됨**
  - 라이트: `#F1F5F9`  
    - `index.html` body, `index.css` body, `App.tsx` TDSWrapper 로딩/fallback UI
  - 다크: `#06090F`  
    - `index.html` .dark body, `index.css` .dark body, `--color-slate-950`, TDSWrapper, `SettlementModals.tsx`
  - **재수정 시:** 한 곳(예: CSS 변수 또는 Tailwind theme)에서만 정의하고, 나머지는 그 값을 참조하도록 통일하면 색상 변경이 쉬워집니다.

- **primary/강조색 불일치**
  - `granite.config.ts`: `primaryColor: '#3182F6'`
  - `index.html` theme-color: `#1d4ed8`
  - `utils/tossColors.ts`: blue500 `#3182F6`
  - `components/ui/constants.ts`: `#3182F6`
  - **재수정 시:** 브랜드 primary 한 가지로 통일하고, theme-color / TDS primary / 버튼 색을 같은 토큰으로 맞추는 것을 권장합니다.

### 3.3 HTML/CSS 이중 정의

- **body 배경·폰트:** `index.html`의 `<style>`과 `index.css`에 거의 동일한 `body` / `.dark body` 규칙이 있습니다.  
  - 한쪽으로만 모으면 유지보수와 재수정 시 혼란이 줄어듭니다 (권장: `index.css`만 사용하고 HTML 인라인은 제거).

---

## 4. 전면 재수정 시 권장 방향

1. **디자인 토큰 단일화**  
   - 배경, primary, 텍스트 등은 `index.css`의 `@theme` 또는 별도 `tokens.css`에서만 정의.  
   - 컴포넌트는 `var(--...)` 또는 Tailwind 테마 클래스만 사용.

2. **색상/디자인 문서화**  
   - `TDS_REPLACEMENT_PLAN.md`와 연계해, “라이트/다크 기준 색”, “토스 primary와 앱 primary 관계”를 한 페이지에 정리해 두면 재수정 시 일관되게 적용하기 좋습니다.

3. **첫 화면 속도**  
   - TDS preload 또는 진입 경로 분리.  
   - App 초기 데이터는 “필수만 먼저”, 나머지는 지연/워커로 분리.

4. **Dead Code / Anti-pattern**  
   - `TDS_REPLACEMENT_PLAN.md` 0.2·0.4 절의 정리(미사용 ref, index as key, useEffect 의존성 등)를 재수정 브랜치에서 함께 진행하면 품질과 유지보수성이 좋아집니다.

---

## 5. 요약

| 구분 | 내용 |
|------|------|
| **수정한 버그** | TossAppContext에서 브릿지 cleanups가 언마운트 시 실행되지 않던 문제 → ref + isMounted 처리로 수정 |
| **느린 화면** | 토스: TDS 동적 로딩 구간; 공통: App 초기 데이터/평가액 계산·외부 리소스 |
| **코드 에러** | 점검 구간에서 린트/타입 에러 없음 |
| **디자인 재수정 전** | 배경/primary 등 색상 중복·불일치 정리, body 스타일 한 곳으로 통일 권장 |

전면 재수정 시 위 토큰/색상 통일과 초기 로딩 분리를 함께 적용하면, “느리게 뜨는 문제”와 “색상/디자인 일관성”을 같이 잡기 좋습니다.
