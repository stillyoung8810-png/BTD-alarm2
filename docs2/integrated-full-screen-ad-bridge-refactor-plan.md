# 통합 전면 광고(Integrated API) 브리지 연결 수정 — 리팩토링 계획서

**상태**: Safe Wrapper는 **`services/ads/tossIntegratedFullScreenAdApi.ts`**에 구현·`App.tsx`는 해당 모듈을 import해 주입.  
**작성 목적**: `App.tsx`에서 `GoogleAdMob`를 `IntegratedAdApi`로 강제 캐스팅해 브리지에 넘기는 **치명적 연결 오류**를 제거하고, 공식 규격대로 `loadFullScreenAd` / `showFullScreenAd` named export를 주입하기 위한 AST·런타임 시뮬레이션용 기준 문서.

**범위**: 전면(통합) 광고 wiring만. **보상형**(`services/ads/rewardAdService.ts`)은 변경하지 않음.

---

## 0. 리뷰 반영 요약

### 0.1 1차 리뷰 (타입 import·명시 대입)

| 지적 | 판단 | 문서 반영 |
|------|------|-----------|
| **`IntegratedAdApi` 타입 import 제거는 Rule 7에 역행** | **동의.** | 브리지 계약 타입 **`IntegratedAdApi` 유지**. |
| **`Object.freeze`만으로 의미가 부족** | **동의.** | 역할이 드러나는 주입 객체명 + **계약 타입으로 주입 완결**. |

### 0.2 2차 리뷰 (선제 어댑터·런타임 가드)

| 지적 | 판단 | 문서 반영 |
|------|------|-----------|
| **「tsc 에러 나면 그때 고친다」는 계획 수준에서 부적절 (Rule 6)** | **동의.** 운에 맡기는 분기 문구는 **폐기**. | §2·§3에서 **Safe Wrapper를 구현 단계의 필수 요건**으로 명시. SDK 시그니처와 `Official*` 불일치는 **래퍼 경계의 `Parameters<typeof loadFullScreenAd>[0]` 캐스팅 + `tsc`로 래퍼 구현 자체를 검증**한다. |
| **심볼 `undefined`·지연 로딩 시 런타임 크래시 (Rule 11)** | **동의(방어적).** 정적 import에서 export가 함수가 아닌 경우는 드물지만, **`typeof === 'function'` 가드 + `isSupported` 안전 호출**로 `TypeError`를 차단한다. | §3.2 스니펫에 **`checkIsSupported` + `createSafeLoadAd` / `createSafeShowAd`** 포함. |

### 0.3 확인 질문 (제품·번들 정책)

1. **래퍼 위치**: **결정됨 — `services/ads/tossIntegratedFullScreenAdApi.ts`**에 Safe Wrapper를 두고, `App.tsx`는 `tossIntegratedFullScreenAdApi`만 import한다 (SRP·테스트 용이).
2. **`isSupported()`가 throw 하는 경우**: 공식 구현이 throw를 내지 않는다고 가정하지만, `checkIsSupported`는 **try/catch로 false 폴백**하여 Rule 11을 보강한다. 공식 SDK가 이를 금지한다면 구현 시 catch 로그 레벨만 조정하면 된다.

---

## 1. 문제 원인 분석

### 1.1 수정 대상 파일·구간

| 파일 | 구간(대략) | 판단 |
|------|------------|------|
| `services/ads/tossIntegratedFullScreenAdApi.ts` | 신규 — Safe Wrapper + `tossIntegratedFullScreenAdApi` export | **구현 기준(SSOT)** |
| `App.tsx` | `tossIntegratedFullScreenAdApi` import, `GoogleAdMob` 제거, `GLOBAL_INTERSTITIAL_AD_MANAGER` 주입 | **연결만** |
| `services/ads/globalAdManager.ts` | `createTossIntegratedFullScreenAdBridge`, **`OfficialLoadFullScreenAd` / `OfficialShowFullScreenAd` (이미 export됨)** | **브리지 로직 변경 불필요** — 타입만 어댑터에서 import |
| `services/ads/rewardAdService.ts` | 전체 | **수정 금지** |

### 1.2 현재 문제 코드

```typescript
// App.tsx (문제 요지)
import {
  createTossIntegratedFullScreenAdBridge,
  GlobalAdManager,
  type AppAudioManager,
  type IntegratedAdApi,
} from './services/ads/globalAdManager';
import { GoogleAdMob } from '@apps-in-toss/web-framework';

const GLOBAL_INTERSTITIAL_AD_MANAGER = new GlobalAdManager(
  createTossIntegratedFullScreenAdBridge(
    GoogleAdMob as unknown as IntegratedAdApi,
  ),
  getInterstitialPlacementDefinitions(),
  { audioManager: SILENT_AD_AUDIO_MANAGER, initialTier: BOOTSTRAP_AD_USER_TIER },
);
```

### 1.3 브리지가 기대하는 계약

`createTossIntegratedFullScreenAdBridge(api)`는 `api.loadFullScreenAd`·`api.showFullScreenAd`가 **호출 가능하며 각각 `isSupported`를 가질 것**을 전제로 `isSupported()`를 평가합니다.

`GoogleAdMob` 객체에는 통합 전면 메서드가 없고, **`loadFullScreenAd` / `showFullScreenAd`는 패키지 최상위 named export**입니다.

### 1.4 멘탈 런타임 시뮬레이션 (기존 버그)

1. 잘못된 객체 주입 → `undefined` 메서드 → `bridge.isSupported()` false 또는 런타임 예외.  
2. `as unknown as IntegratedAdApi` → 컴파일은 통과, **의미는 붕괴**.

---

## 2. 마이그레이션(수정) 전략

1. **`services/ads/tossIntegratedFullScreenAdApi.ts`**에서 `@apps-in-toss/web-framework`의 **`loadFullScreenAd`, `showFullScreenAd` named import** 및 Safe Wrapper 구현 후 **`tossIntegratedFullScreenAdApi`** export.  
2. `App.tsx`에서 **`GoogleAdMob` import 완전 제거** (보상형은 `rewardAdService.ts`만 유지)하고 **`tossIntegratedFullScreenAdApi` 한 줄 import**.  
3. `tossIntegratedFullScreenAdApi.ts`는 `globalAdManager`에서 **`IntegratedAdApi`, `OfficialLoadFullScreenAd`, `OfficialShowFullScreenAd` 타입만 import**한다.  
4. **필수**: **Safe Wrapper 팩토리**로 (a) 런타임에 심볼이 함수가 아닌 경우 noop·false 지원, (b) 브리지가 기대하는 `Official*` 호출 시그니처와 외부 SDK 사이의 **단일 경계**에서만 좁은 형태의 타입 캐스팅을 허용한다. **`as unknown as IntegratedAdApi` 금지.**  
5. `tossIntegratedFullScreenAdApi`는 **래퍼 인스턴스**를 담는다 (원시 export 직접 대입 아님).  
6. `globalAdManager.ts`의 브리지 구현체 자체는 변경하지 않는다 (계획서 범위).  
7. `rewardAdService.ts`는 변경하지 않는다.

**폐기한 문구**: “대입 시 tsc 에러가 나면 그때 어댑터”류의 **사후 대응만 적는 계획** — **본 문서에서 제거함.**

---

## 3. 적용될 구체적인 코드 스니펫

### 3.1 변경 전 (요약)

- `GoogleAdMob` + `as unknown as IntegratedAdApi`

### 3.2 변경 후 (이식용 · Safe Wrapper 필수)

**SSOT**: `services/ads/tossIntegratedFullScreenAdApi.ts`. `App.tsx`에 기존에 있던 **`INTERSTITIAL_PLACEMENT_KEYS`, `AdRouteKey`, `InterstitialPlacementKey`, `UserTier` 등 import는 삭제하지 말고 유지**한다.

`tossIntegratedFullScreenAdApi.ts`:

```typescript
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

import type {
  IntegratedAdApi,
  OfficialLoadFullScreenAd,
  OfficialShowFullScreenAd,
} from './globalAdManager';

function checkIsSupported(fn: unknown): boolean {
  if (typeof fn !== 'function') {
    return false;
  }

  const withSupported = fn as { isSupported?: unknown };
  if (typeof withSupported.isSupported !== 'function') {
    return false;
  }

  try {
    return withSupported.isSupported() === true;
  } catch {
    return false;
  }
}

function createSafeLoadAd(): OfficialLoadFullScreenAd {
  function wrapper(
    params: Parameters<OfficialLoadFullScreenAd>[0],
  ): () => void {
    if (typeof loadFullScreenAd !== 'function') {
      return () => {};
    }
    return loadFullScreenAd(
      params as Parameters<typeof loadFullScreenAd>[0],
    );
  }
  wrapper.isSupported = () => checkIsSupported(loadFullScreenAd);
  return wrapper;
}

function createSafeShowAd(): OfficialShowFullScreenAd {
  function wrapper(
    params: Parameters<OfficialShowFullScreenAd>[0],
  ): () => void {
    if (typeof showFullScreenAd !== 'function') {
      return () => {};
    }
    return showFullScreenAd(
      params as Parameters<typeof showFullScreenAd>[0],
    );
  }
  wrapper.isSupported = () => checkIsSupported(showFullScreenAd);
  return wrapper;
}

export const tossIntegratedFullScreenAdApi: IntegratedAdApi = {
  loadFullScreenAd: createSafeLoadAd(),
  showFullScreenAd: createSafeShowAd(),
};
```

`App.tsx` (통합 전면 전용 연결부만; `GoogleAdMob` 제거):

```typescript
import {
  createTossIntegratedFullScreenAdBridge,
  GlobalAdManager,
  type AppAudioManager,
} from './services/ads/globalAdManager';
import { tossIntegratedFullScreenAdApi } from './services/ads/tossIntegratedFullScreenAdApi';
import { getInterstitialPlacementDefinitions } from './services/ads/interstitialPlacementConfig';
// … UserTier, INTERSTITIAL_PLACEMENT_KEYS 등 기존 import 유지 …

const BOOTSTRAP_AD_USER_TIER: UserTier = 'free';
const SILENT_AD_AUDIO_MANAGER: AppAudioManager = {
  pauseAllSounds: () => {},
  resumeAllSounds: () => {},
};

const GLOBAL_INTERSTITIAL_AD_MANAGER = new GlobalAdManager(
  createTossIntegratedFullScreenAdBridge(tossIntegratedFullScreenAdApi),
  getInterstitialPlacementDefinitions(),
  {
    audioManager: SILENT_AD_AUDIO_MANAGER,
    initialTier: BOOTSTRAP_AD_USER_TIER,
  },
);
```

### 3.3 설계 메모 (캐스팅·경계)

- **`as unknown as IntegratedAdApi`**: 사용하지 않는다.  
- **`params as Parameters<typeof loadFullScreenAd>[0]`**: 브리지·도메인이 사용하는 **`Official*` params**와 패키지가 선언한 params가 1:1이 아닐 때를 대비한 **의도적 단일 경계(seam)** 이다. SDK 업그레이드 시 **이 한 줄(및 대응하는 show)** 에서 컴파일 에러가 나면 계약 불일치를 즉시 인지할 수 있다.  
- **`fn as { isSupported?: unknown }`**: `unknown`에서 프로퍼티 존재를 확인한 뒤의 **최소 단언**이며 `any`가 아니다.  
- **래퍼가 `OfficialLoadFullScreenAd`를 만족하는지**: `createSafeLoadAd` / `createSafeShowAd`의 **반환 타입을 `Official*`로 고정**하고 `function wrapper`의 반환을 `() => void`로 두어 **구현이 계약에서 벗어나면 tsc가 실패**하도록 한다.

### 3.4 변경 후 런타임 시뮬레이션 요약

1. `loadFullScreenAd`가 `undefined`이거나 함수가 아님 → `isSupported` false, 호출 시 noop cleanup → **`TypeError` 없이** 브리지가 unsupported 경로로 수렴 가능.  
2. 공식 심볼이 정상 → 래퍼는 실제 SDK로 위임.  
3. `rewardAdService.ts` 경로와 **심볼·모듈 격리** 유지.

---

## 4. 보상형 광고 격리 증명

- `rewardAdService.ts`만 `GoogleAdMob`를 import하고 `loadAppsInTossAdMob` / `showAppsInTossAdMob`를 사용한다.  
- 전면 Safe Wrapper는 **`tossIntegratedFullScreenAdApi.ts`**에만 두며, `App.tsx`는 주입만 담당한다. **보상 모듈을 import·수정하지 않는다.**

---

## 5. Rule 준수 검증 체크리스트 (Core Principles)

### Rule 6 (Clean Code)

- **사후 “tsc 터지면 수습” 계획 문구 없음** — 선제 래퍼·경계가 계획의 일부.  
- 어댑터 책임이 `App.tsx`에 길어지면 **별도 파일 분리**는 팀 선택으로 허용(§0.3).

### Rule 7 (Strict TypeScript)

- `any` 미사용.  
- `as unknown as IntegratedAdApi` **금지**.  
- `OfficialLoadFullScreenAd` / `OfficialShowFullScreenAd`로 **래퍼 구현이 브리지 계약을 만족하는지** tsc가 검사한다.

### Rule 11 (Async / Bridge·에러 회복)

- 심볼 비존재 시 **noop cleanup**으로 크래시 방지.  
- `isSupported()` 호출을 **try/catch**로 감싸 예외 시 false 처리.  
- 기존 `GlobalAdManager` / `AdPreloadProvider`의 비동기·mutex 정책은 별도로 유지.

---

## 6. 공식 참고 링크

- [인앱광고 이해하기](https://developers-apps-in-toss.toss.im/ads/intro.html)  
- [인앱광고 개발하기](https://developers-apps-in-toss.toss.im/ads/develop.html)  
- [IntegratedAd — loadFullScreenAd / showFullScreenAd](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EA%B4%91%EA%B3%A0/IntegratedAd.html)  
- [showAppsInTossAdMob](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EA%B4%91%EA%B3%A0/showAppsInTossAdMob.html) (보상형 참고, 본 패치 비대상)

---

## 7. 구현 완료 시 확인 사항

- [ ] `GoogleAdMob as unknown as IntegratedAdApi` **0건**.  
- [ ] `loadFullScreenAd` / `showFullScreenAd` named import 존재.  
- [ ] `OfficialLoadFullScreenAd` / `OfficialShowFullScreenAd` import 및 **래퍼가 해당 타입을 만족** (`tsc` 통과).  
- [ ] `checkIsSupported`·래퍼 **noop 경로**에서 전면 파이프라인이 크래시 없이 unsupported 처리되는지(로컬·QR).  
- [ ] `rewardAdService.ts` **변경 없음**.  
- [ ] (선택) 래퍼를 전용 모듈로 분리했는지 여부와 `App.tsx` 라인 수가 팀 기준을 만족하는지.
