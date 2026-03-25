# VR / 라오어 출처 UI 구현 계획서

> **상태:** 설계 전용 (코드 미적용)  
> **목적:** `StrategyCreator` 및 관련 폼에 Premium 배지·Credit Hero 배너를 넣기 전, 삽입 위치·레이아웃·충돌을 사전 검증한다.

---

## 1. 범위 요약

| 항목 | 내용 |
|------|------|
| 대상 전략 ID | `'multi_split'`, `'no_stop_multi_split'`, `'vr_band'` |
| 배지 | 전략 선택 카드(Step 0)에서 기존 `FREE` 등 **티어 배지 오른쪽(맨 끝)** |
| 배너 | 각 전략의 **Step 1(세부 설정)** 폼에서, 입력 블록 **직후**·모달 **Footer(이전/다음 버튼) 바로 위** |
| 제거 | `multi_split` Step 1 하단 **유튜브 텍스트 링크** (`https://www.youtube.com/@laofus`) |
| 참고 | `no_stop_multi_split` Step 1·`VrBandStrategyForm`에는 현재 동일 링크 **없음** — 배너만 추가 |

---

## 2. 수정·참조 타겟 파일

| 파일 | 역할 |
|------|------|
| `components/StrategyCreator.tsx` | 전략 카드(배지), `renderMultiSplitStep1` / `renderNoStopMultiSplitStep1`, import 정리 |
| `components/strategies/VrBandStrategyForm.tsx` | `vr_band` Step 1 본문 **맨 아래**에 동일 배너 삽입 |
| (권장, 선택) `components/strategies/LaoerCreditHeroBanner.tsx` | 배너 JSX·링크·a11y를 한 곳으로 모아 3곳에서 재사용 (DRY) |

---

## 3. Lucide 아이콘 import (최종 목표 형태)

**`StrategyCreator.tsx`** — 기존 `lucide-react` 한 줄에 다음을 **추가** (중복 import 방지):

```tsx
import {
  X,
  ChevronRight,
  ChevronLeft,
  Info,
  Sparkles,
  Target,
  Zap,
  Settings2,
  Calendar,
  Wallet,
  Percent,
  AlertTriangle,
  ChevronDown,
  Lock,
  TrendingUp,
  Layers,
  BarChart2,
  Orbit,
  Youtube,
  Users,
  BookOpen,
} from 'lucide-react';
```

**`VrBandStrategyForm.tsx`** — 배너를 이 파일에 둘 경우:

```tsx
import { Orbit, Wallet, Target, Percent, Info, Youtube, Users, BookOpen } from 'lucide-react';
```

(배너를 별도 컴포넌트 파일로 분리하면 해당 파일에서만 위 아이콘을 import.)

---

## 4. 요구사항 1 — Premium Strategy Badge (전략 카드)

### 4.1 기존 구조 (Before)

`renderStrategySelection` 내부, 카드 제목 행은 `flex items-center gap-3`이며 **티어 배지**만 존재한다.

```tsx
<div className="flex items-center gap-3">
  <h4 className="text-base font-black text-slate-900 dark:text-white">
    {strategy.title}
  </h4>
  <span
    className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
      tierColors[strategy.tier]
    }`}
  >
    {strategy.tier}
  </span>
  {strategy.comingSoon && (
    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
      ({lang === 'ko' ? '준비중' : 'Coming Soon'})
    </span>
  )}
</div>
```

### 4.2 삽입 후 (After) — 조건부 배지

- 조건: `strategy.id === 'multi_split' || strategy.id === 'no_stop_multi_split' || strategy.id === 'vr_band'`
- 배치: **티어 `<span>` 직후**(요구사항: FREE 배지 **우측**). `comingSoon`이 있으면 현재 정의상 해당 3개 전략에는 없으므로 동일 순서 유지 가능.
- 좁은 화면에서 줄바꿈 대비: 행에 `flex-wrap` + 제목에 `min-w-0` 권장.

```tsx
<div className="flex flex-wrap items-center gap-3">
  <h4 className="text-base font-black text-slate-900 dark:text-white min-w-0">
    {strategy.title}
  </h4>
  <span
    className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
      tierColors[strategy.tier]
    }`}
  >
    {strategy.tier}
  </span>
  {(strategy.id === 'multi_split' ||
    strategy.id === 'no_stop_multi_split' ||
    strategy.id === 'vr_band') && (
    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30 shadow-sm align-middle ml-1.5">
      <Sparkles size={10} className="text-amber-500 animate-pulse" />
      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap tracking-tight">
        라오어 Original
      </span>
    </div>
  )}
  {strategy.comingSoon && (
    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
      ({lang === 'ko' ? '준비중' : 'Coming Soon'})
    </span>
  )}
</div>
```

### 4.3 레이아웃·에러 검증 포인트

- **시각적 겹침:** `whitespace-nowrap`로 배지 한 줄 유지; `flex-wrap`으로 카드 폭이 좁을 때 제목·FREE·배지가 **세로로 자연스럽게 내려가게** 할 수 있음.
- **접근성:** 배지는 장식용이면 추가 `aria` 없이도 무방하나, 스크린리더에 “라오어 Original”이 읽히므로 과도한 `animate-pulse`가 거슬리면 `motion-reduce` 대응을 이후 단계에서 검토 가능.

---

## 5. 요구사항 2 — Credit Hero Banner (Step 1 하단, Footer 직전)

### 5.1 모달 DOM 구조 (레이아웃 협의의 기준)

```tsx
{/* 스크롤 영역 — padding이 여기 있음 */}
<div className="flex-1 overflow-y-auto ... p-6 md:p-8 ...">
  {step === 1 && selectedStrategy === 'multi_split' && renderMultiSplitStep1()}
  {step === 1 && selectedStrategy === 'no_stop_multi_split' && renderNoStopMultiSplitStep1()}
  {step === 1 && selectedStrategy === 'vr_band' && <VrBandStrategyForm ... />}
</div>

{/* Footer — border-t로 구분 */}
<div className="p-6 md:p-8 border-t ... flex gap-4 ...">
  {/* 이전 / 다음 */}
</div>
```

배너는 **스크롤 영역 안**, 각 Step 1 콘텐츠의 **마지막 형제**로 두면 “입력 끝 → 배너 → (스크롤 끝) → Footer” 순서가 된다.

### 5.2 Edge-to-Edge (패딩 무시) 전략

- 스크롤 컨테이너: `p-6` → 좌우 `1.5rem`, `md:p-8` → `2rem`.
- 배너 루트에 **`w-full`** + **` -mx-6 md:-mx-8`** 를 주면, 블록 박스가 좌우 패딩만큼 시각적으로 “밖으로” 확장되어 **스크롤 영역의 안쪽 가장자리에 맞닿는** 풀폭이 된다.
- 스크롤 영역 **하단 패딩**(`p-6`/`p-8`에 포함) 때문에 배너 아래에 빈 여백이 생기면, 배너에 **`mb-0`** 유지 + **` -mb-6 md:-mb-8`** 로 하단 패딩을 상쇄해 **Footer `border-t` 바로 위**에 밀착시킨다.
- 가로 스크롤 방지: 일반적으로 `overflow-x-hidden`은 스크롤 루트에 두지 않는 것이 좋으나, `-mx`로 인한 1px 오버플로우가 보이면 스크롤 컨테이너에 `overflow-x-hidden`을 **검증 후** 선택 적용.

### 5.3 기존 유튜브 링크 제거 (Before) — `renderMultiSplitStep1`만 해당

```tsx
<div className="mt-3 pt-3 border-t border-slate-700/30 dark:border-slate-600/30">
  <p className="text-[9px] text-slate-400 dark:text-slate-500">
    {lang === 'ko' ? '출처 : ' : 'Source : '}
    <a
      href="https://www.youtube.com/@laofus"
      target="_blank"
      rel="noopener noreferrer"
      className="text-emerald-400 hover:text-emerald-300 underline"
    >
      https://www.youtube.com/@laofus
    </a>
  </p>
</div>
```

### 5.4 삽입 후 (After) — 전략 로직 블록은 유지, 하단 출처만 제거 + 배너는 폼 최하단

- 위 `border-t` 블록 **전체 삭제**.
- `renderMultiSplitStep1`의 **최상위** `space-y-8` 래퍼 **직전 닫기 직전**(즉, 카드·설명 블록 모두 다음)에 배너 배치.
- `renderNoStopMultiSplitStep1`: **같은 위치**(바깥 `space-y-8`의 마지막)에 동일 배너 추가.
- `VrBandStrategyForm`: 루트 `div.space-y-8`의 **마지막 자식**으로 동일 배너 추가(또는 공통 컴포넌트 1줄).

### 5.5 배너 JSX (href는 마크다운 아닌 순수 URL)

사용자 제공 스니펫을 기준으로 하되, 링크는 아래와 같이 **문자열만** 사용한다.

- 유튜브: `https://www.youtube.com/@laofus`
- 네이버 카페: `http://cafe.naver.com/infinitebuying`
- 블로그: `http://m.blog.naver.com/edgar0418`

```tsx
<div
  className="w-full bg-gradient-to-br from-indigo-700 via-blue-600 to-indigo-800 p-4 relative overflow-hidden rounded-t-2xl sm:rounded-t-3xl mt-6 -mx-6 md:-mx-8 -mb-6 md:-mb-8"
  role="region"
  aria-label={lang === 'ko' ? '전략 출처 및 공식 채널' : 'Strategy credit and official channels'}
>
  <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
  <div className="absolute bottom-0 left-0 -mb-6 -ml-6 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl" />

  <div className="relative z-10 flex items-start gap-3">
    <div className="mt-0.5 p-1.5 bg-white/15 rounded-lg backdrop-blur-md border border-white/10 flex-shrink-0">
      <Info size={16} className="text-white" aria-hidden />
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <h4 className="text-xs font-black text-white tracking-widest uppercase opacity-90">
          Official Strategy Credit
        </h4>
        <div className="h-px flex-1 bg-white/20 min-w-[2rem]" />
      </div>

      <p className="text-[11px] leading-relaxed text-blue-50/90 font-medium mb-2.5">
        본 전략은 작가{' '}
        <span className="text-white font-bold underline underline-offset-2">&apos;라오어&apos;</span>
        님의 독창적인 투자 철학을 바탕으로 설계되었습니다. 전략의 깊은 이해를 위해 원작자의 철학을 꼭 확인해 보세요.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <a
          href="https://www.youtube.com/@laofus"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 hover:bg-white/30 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all backdrop-blur-sm border border-white/10"
        >
          <Youtube size={12} className="opacity-80 shrink-0" aria-hidden />
          유튜브
        </a>
        <a
          href="http://cafe.naver.com/infinitebuying"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 hover:bg-white/30 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all backdrop-blur-sm border border-white/10"
        >
          <Users size={12} className="opacity-80 shrink-0" aria-hidden />
          네이버 카페
        </a>
        <a
          href="http://m.blog.naver.com/edgar0418"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 hover:bg-white/30 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all backdrop-blur-sm border border-white/10"
        >
          <BookOpen size={12} className="opacity-80 shrink-0" aria-hidden />
          블로그
        </a>
      </div>
    </div>
  </div>
</div>
```

**계획서에서 조정한 점 (충돌 완화):**

- `-mx-0` 대신 **실제 패딩에 맞춘** `-mx-6 md:-mx-8`.
- 하단 밀착을 위해 **`-mb-6 md:-mb-8`** 추가.
- `flex-1` 옆 구분선에 **`min-w-[2rem]`** 으로 flex 수축 시 0폭 방지.
- 인용부호는 JSX에서 `&apos;` 사용.
- 링크에 **`shrink-0` 아이콘** + 선택적 **`role="region"` / `aria-label`** (워크스페이스 a11y 규칙과 정합).

### 5.6 i18n (워크스페이스 규칙과의 정합)

현재 배너·배지에 한글/영문 혼합 하드코딩이 포함된다. 구현 단계에서는:

- 문자열을 `constants/vrMessages.ts`(또는 전용 `laoerCreditMessages.ts`)로 이전하고,
- `lang === 'ko' | 'en'` 분기로 **영문 모드 문구**를 준비하는 것을 권장한다.

본 문서는 요구된 시각 스펙 우선이므로, 구현 시 PR에서 i18n 이관을 명시하면 된다.

---

## 6. 구현 순서 (코드 적용 시 권장)

1. 공통 배너 컴포넌트 추출(선택) 및 import 정리  
2. `renderStrategySelection` 배지 조건 추가  
3. `renderMultiSplitStep1`: 유튜브 블록 삭제 → 배너 추가  
4. `renderNoStopMultiSplitStep1`: 배너만 추가  
5. `VrBandStrategyForm`: 배너 추가  
6. 모바일·다크모드·짧은 뷰포트에서 스크롤·Footer 사이 간격 확인  
7. `yarn build` / 린트로 미사용 import 제거

---

## 7. 검증 체크리스트

- [ ] Step 0에서 `rsi_ma_interval` 카드에는 **라오어 배지 없음**  
- [ ] 세 전략 카드에만 배지 표시, FREE 오른쪽 정렬  
- [ ] Step 1 세 화면 모두에서 배너가 **입력 아래**, **Footer 위**  
- [ ] 배너 좌우가 스크롤 영역 내부에서 **풀폭**(패딩 상쇄)  
- [ ] `multi_split` Step 1에서 기존 유튜브 **텍스트 링크 제거**됨  
- [ ] 외부 링크 `rel="noopener noreferrer"` 유지  

---

**다음 단계:** 검토 후 **「진행해」**라고 주시면 위 계획에 따라 실제 파일 수정을 진행하겠습니다.
