# 토스 인앱광고·인앱결제 가이드라인 대조 및 코드 리뷰 (시니어)

**제약**: 모든 변동 사항은 **토스 미니앱 환경에서만** 적용. 일반 웹 서비스에는 변경 없어야 함.

**갱신 (2026-03, 코드 기준):** 레거시 `services/ads/adService.ts`는 **삭제**되었습니다. **전면**은 `GlobalAdManager` + 통합 `loadFullScreenAd` / `showFullScreenAd` 브리지(`docs2/ad-preload-architecture.md`)를 따르고, **보상형**은 `services/ads/rewardAdService.ts`에서 `GoogleAdMob.loadAppsInTossAdMob` → `showAppsInTossAdMob`(load 후 show)를 사용합니다. 아래 §1.1 등 일부 표·문단은 **과거 리뷰 시점** 서술이 남아 있을 수 있으니, 판정 재검증은 저장소를 기준으로 하시면 됩니다.

---

## 0. Cursor에게 줄 추가 지시사항 (Action Plan) — 절대 엄수

다음 3가지 규칙을 **반드시** 준수하라.

| 규칙 | 내용 |
|------|------|
| **Zero-Hallucination** | `window.TossApp.ads` 같은 가상 API는 사용하지 않는다. **오직** `@apps-in-toss/web-framework`에서 **GoogleAdMob** 및 **IAP** 객체를 import하여 사용한다. 메서드명은 공식 문서와 동일하게 **loadAppsInTossAdMob**, **showAppsInTossAdMob**, **requestPayment**(IAP) 등만 사용한다. |
| **Lifecycle Enforcement** | 광고 호출 시 **반드시 load 성공을 확인한 뒤** show를 호출하는 비동기 핸들러를 작성한다. load 완료(loaded 이벤트) 없이 show를 호출하는 코드 경로는 허용하지 않는다. |
| **Strict ID Mapping** | **adGroupId**와 **productId**는 별도 `constants.ts`(또는 `adConstants.ts` / `iapConstants.ts`)에서만 관리한다. 공식 문서의 테스트 ID(`ait-ad-test-rewarded-id`, `ait-ad-test-interstitial-id` 등)를 우선 적용하여 **테스트 가능한 코드**를 짠다. |

---

## 1. 토스 가이드라인 대조

### 1.1 인앱광고 (공식 문서 기준)

| 문서 항목 | 공식 요구사항 | 현재 구현 (2026-03 코드 기준) | 판정 |
|-----------|----------------|-----------|------|
| SDK | 1.0.3 이상 | @apps-in-toss/web-framework ^1.9.4 | ✅ |
| **광고 불러오기** | `loadAppsInTossAdMob`로 **미리 로드** 필수 | **전면**: `GlobalAdManager` + 통합 **`loadFullScreenAd`** 프리로드 큐. **보상형**: `rewardAdService.requestRewardAd`가 `loadAppsInTossAdMob` 후 `loaded`까지 대기 | ✅ **경로별 정렬** |
| **광고 보여주기** | `showAppsInTossAdMob` — **load 완료 후** 호출 | **전면**: 통합 **`showFullScreenAd`**(브리지, 매니저가 READY 슬롯에서 호출). **보상형**: load 완료 후 `showAppsInTossAdMob` | ✅ |
| **API 출처** | `GoogleAdMob.*` 및 통합 전면 API | `@apps-in-toss/web-framework` — 전면은 **IntegratedAd** `loadFullScreenAd`/`showFullScreenAd`, 보상은 **GoogleAdMob** load/show | ✅ **`window.TossApp.ads` 미사용** |
| **파라미터** | `options.adGroupId` 등 | 전면: `interstitialPlacementConfig`·`getResolvedInterstitialAdGroupId` 등. 보상: `adPlacements.ts` 등 **adGroupId 상수** | ⚠️ **콘솔 ID·테스트 ID와의 일치는 운영에서 재검증** |
| **순서** | load → (loaded) → show | 전면: 프리로드·슬롯 상태 머신. 보상: `requestRewardAd` 내부 load → show | ✅ |
| **지원 확인** | `isSupported()` 사용 권장 | 전면 브리지·보상 `isRewardAdSupported()` 등에서 확인 | ✅/⚠️ **지면마다 상세 점검 권장** |
| **샌드박스** | 인앱 광고 미지원. QR로 테스트 | (동일 제약 인지 필요) | — |

**요약 (갱신)**: 과거 리뷰 시점의 **`window.TossApp.ads` + show만** 패턴은 **제거**되었다. **전면**은 통합 전면 API + `GlobalAdManager`(`docs2/ad-preload-architecture.md`), **보상형**은 `GoogleAdMob` **load → show** 를 `rewardAdService.ts`에서 수행한다. **남은 과제**는 `shouldShowAds` 연동·텔레메트리·NO_FILL UX 등 본문 P1/P2 항목과 동일하다.

#### 1.1.1 "로딩 없는 광고"가 치명적인 이유 (엔지니어링 관점)

load 단계 부재는 단순 스펙 위반이 아니다.

- **광고는 네트워크 지연시간이 가장 긴 자산 중 하나**이다. load 없이 show만 호출하면, 유저는 광고가 뜰 때까지 **빈 화면**을 보거나 **앱이 멈춘 것**으로 오해한다.
- 이는 **이탈률(Churn Rate)** 로 직결된다. "저장 버튼을 눌렀는데 아무 반응이 없다"는 인상은 재방문을 막는다.

**교정 방향**: 단순히 "load를 추가한다"가 아니라, **광고 상태 머신(Ad State Machine)** 을 도입한다.

```
IDLE → LOADING → READY → SHOWING → COMPLETED / ERROR
```

- **READY**가 아닐 때 유저가 해당 진입점(저장 버튼, 정산 상세 등)에 들어오면:
  - **"광고를 준비 중입니다"** UI를 보여 주거나,
  - 해당 버튼/액션을 **비활성화**하는 **방어적 UX** 로직을 강제한다.
- show 완료 후(COMPLETED) 다음 광고를 load하여, 가이드라인 권장 순서 **load → show → (다음 load)** 를 유지한다.
- **useAdState 훅**: 상태 머신을 노출하는 훅 내부에 **setTimeout을 이용한 5~10초 타임아웃** 로직을 포함한다. LOADING 상태가 해당 시간을 초과하면 ERROR(또는 타임아웃 전이)로 전이하고, "광고를 불러오지 못했습니다" 등 방어적 UX를 보여 준다. **리뷰어 소견**: 10초 타임아웃은 LOADING에 갇힌 좀비 프로세스를 방지하는 **핵심 안전장치**이다.

#### 1.1.2 광고 에러 세분화 (NO_FILL vs ERROR)

"광고 실패"로 일괄 처리하지 않고, **비즈니스적 상황**과 **기술적 오류**를 구분한다.

| 구분 | 코드 | 의미 | 대응 |
|------|------|------|------|
| **NO_FILL** | 물량 없음 | 광고 재고 없음(비즈니스). 엔지니어링 조치 불필요 | 로그 레벨·알림 최소화. **물량 없음으로 인한 에러 로그 폭탄 방지** |
| **ERROR** | 타임아웃, 네트워크, API 오류 등 | 기술적 오류 | 로그·모니터링 강화, 재시도 또는 사용자 안내 |

- **useAdState 구현 시**: **NO_FILL**일 때는 유저에게 보여줄 **토스트(Toast)** 메시지 또는 **대체 UI**(예: "광고가 지금은 없어요. 계속 진행할까요?")를 포함한다. ERROR일 때는 "일시적인 오류입니다. 잠시 후 다시 시도해 주세요" 등 구분된 메시지를 사용한다.

### 1.2 인앱결제 (IAP) (공식 문서 기준)

| 문서 항목 | 공식 요구사항 | 현재 구현 | 판정 |
|-----------|----------------|-----------|------|
| SDK | 1.1.3 이상 (지급 완료 과정 포함) | — | — |
| **상품 목록** | SDK `getProductItemList()` | 사용처 없음 | — |
| **결제 요청** | SDK `createOneTimePurchaseOrder` | 없음. 대신 **토스페이** `requestPayment` + BFF 검증 사용 | ⚠️ **IAP와 별개 플로우** |
| **주문 복원** | `getPendingOrders` → 지급 → `completeProductGrant` | 없음 | — |
| **주문 조회** | API `POST /api-partner/v1/apps-in-toss/order/get-order-status` (x-toss-user-key, orderId) | 없음. BFF는 토스페이먼츠 결제 확인용 | — |

**요약**: 공식 “인앱결제(IAP)” 는 **상품 목록·일회성 구매·미결 주문 복원·주문 상태 조회** 플로우임. 현재 시스템은 **토스페이(일반 결제) + 서버 검증** 구조로, IAP와는 다른 경로임. IAP를 도입할 계획이면 가이드라인대로 getProductItemList / createOneTimePurchaseOrder / getPendingOrders / completeProductGrant / get-order-status API 연동이 필요함. **문서에 없는 client_id 등은 없음.**

#### 1.2.1 "돈 문제는 0.1%의 오차도 허용하지 않는다" — 멱등성·검증

결제 로직의 핵심인 **멱등성(Idempotency)** 과 **검증(Verification)** 이 빠지면 안 된다.

- **비판**: `window.TossApp.iap.requestPayment`(또는 클라이언트 결제 API)가 성공했다고 해서 **DB에 바로 아이템을 지급**하면 안 된다. 네트워크 단절로 **응답만 못 받은 경우**, 유저는 결제했는데 아이템은 안 들어오는 **결제 누락** 사고가 발생한다.
- **교정**:
  1. **결제 요청 전**에 **우리 서버에서 먼저 orderId를 생성**하고, 이를 토스 API에 전달한다.
  2. 결제 완료 후 **클라이언트 응답만 믿지 말고**, **서버 대 서버(Webhook 또는 Verify API)** 로 실제 결제 여부를 **반드시 교차 검증**하도록 설계한다.
  3. 지급은 **검증 완료된 주문**에 대해서만 수행하며, 멱등 키(orderId 등)로 중복 지급을 방지한다.

#### 1.2.2 결제 복구(Recovery) 로직의 구체화

**평가**: 앱 시작 시 미완료 결제 건을 체크하는 로직은 L6(Staff Engineer)급 사고방식이다. 유저는 결제 직후 앱이 꺼져도 다음 진입 시 아이템이 들어오는 **안정감**을 느끼게 된다.

- **구현**: **앱 마운트 시** `useEffect`에서 서버 **GET /orders/pending** API를 호출한다. 결과가 있으면 즉시 토스 **verify** 로직(서버 검증 후 지급)을 트리거한다.
- **UI 가이드라인 (리뷰어 소견)**: 복구 로직 실행 중에는 사용자에게 **최소한의 피드백**을 준다. 예: **"지난 결제를 확인 중입니다..."** 와 같은 인디케이터(스피너 또는 토스트)를 노출하여, 무반응으로 오해하지 않도록 한다.

---

## 2. 현재 광고가 어디에·어떻게 뜨는지 요약

- **토스 미니앱 내부에서만** 동작 (`isTossApp()` 등 분기).
- **전면 광고**: `App.tsx`가 `GlobalAdManager` + `AdPreloadProvider`로 감싼 뒤, 지면 트리거에서 **`useAdPreload().showInstantAd(placementKey)`** 또는 매니저 `showInstant`를 호출하는 구조(`interstitialPlacementConfig`의 logical key). 레거시 **저장 직후 `adService` 전면**·**정산 진입 직전 전면** 호출은 **제거됨** — 트리거는 제품·`docs2/ad-preload-architecture.md` 기준으로 유지보수.
- **리워드 광고**: `services/ads/rewardAdService.ts`의 **`requestRewardAd(adGroupId)`** — `GoogleAdMob` **load → loaded → show**. 예: `AIImageInputModal`에서 AI 해제용 `REWARD_UNLOCK_AI_AD_GROUP_ID` (`adPlacements.ts`). (과거 문서의 “모든 저장 직전 리워드” 패턴은 **현재 코드에 없을 수 있음** — 호출부는 저장소 검색으로 확인.)
- **광고 실패 정책**: 지면별로 상이; 보상·전면 각 모듈에서 진행/스킵 처리.
- **유료 사용자**: `shouldShowAds(profile)` 가 정의되어 있어도 **전면 매니저 티어 동기화·호출부 가드**가 완전히 맞물렸는지는 **재점검 권장**(본문 P1 항목 5).

---

## 2.5 플랫폼 격리(Abstraction) 전략의 미흡

**제약** "일반 웹 서비스에는 변경 없어야 함"을 두었지만, 현재 리팩토링 제안만으로는 코드 곳곳에 **`if (isToss)`** 가 박힐 위험이 크다.

- **비판**: `TossAdLoader` 같은 클래스를 만드는 것만으로는 부족하다. 메타·구글에서는 이를 **Adapter Pattern**으로 해결한다.
- **교정**:
  - **비즈니스 로직**(예: 포트폴리오 저장)은 **`AdProvider.show()`만 호출**한다.
  - 실제 환경에 따라 **TossAdAdapter** 또는 **WebAdAdapter**(광고 없음/더미)가 **주입**되도록 **의존성 주입(Dependency Injection)** 구조를 확립한다.
  - 이렇게 하면 토스 외 다른 플랫폼으로 확장할 때 코드를 전면 수정하지 않고, **Adapter만 추가·교체**하면 된다.

---

## 3. 발견된 문제점 (중요도 순)

### P0 (스펙/가이드라인 위반)

1. **광고 API 스펙 위반 (과거 과제 → 대부분 해소)**  
   공식: load → (loaded) → show, `adGroupId` / 통합 전면 API.  
   **현재**: 전면은 **`loadFullScreenAd` / `showFullScreenAd`** 브리지, 보상은 **`GoogleAdMob` load/show** (`rewardAdService.ts`).  
   → **잔여**: 통합 전면·슬롯별 fill/에러 코드가 가이드와 1:1인지, 실기기에서 **회귀 검증**.

2. **logical key vs adGroupId**  
   가이드라인은 콘솔 **adGroupId** 기준.  
   **현재**: 전면은 **`interstitialPlacementConfig` + `getResolvedInterstitialAdGroupId`**, 보상은 **`adPlacements` 상수**.  
   → **운영 ID·테스트 ID**가 콘솔·문서와 일치하는지 주기적 확인.

### P1 (유지보수성·클린코드)

3. **DRY — 보상 vs 전면 분리 유지**  
   과거 `adService.ts`의 이중 래퍼는 **삭제**됨. **보상**은 `rewardAdService.ts`, **전면**은 `globalAdManager.ts` + 브릿지.  
   → **잔여**: 공통 타임아웃·로깅이 필요하면 **얇은 공유 유틸**만 두고, 파일 책임은 분리 유지.

4. **SRP — 모듈 경계**  
   전면 프리로드·슬롯 상태는 **`GlobalAdManager`**, 보상 1회성 플로우는 **`rewardAdService`**.  
   → 정책(proceed/block)·`shouldShowAds`는 **호출부 또는 매니저 옵션**에 명시적으로 모으기.

5. **Dead Code — shouldShowAds 미사용**  
   `subscriptionUtils.shouldShowAds` 는 정의·문서화만 되어 있고, App.tsx 등에서 **호출되지 않음**.  
   → 토스에서만 광고를 넣을 때도 “유료 사용자 제외”가 요구사항이면, **광고 표시 직전에만** `shouldShowAds(userProfile)` 체크 추가 (토스 분기 내부에서만 사용해 일반 웹에는 영향 없음).

6. **Anti-pattern — 타입 단언 남발**  
   `(mod as { partner?: { showReward?: ... } }).partner?.showReward` 등으로 런타임 객체를 임의로 단언.  
   → `@apps-in-toss/web-framework`(또는 web-bridge)에서 export하는 **GoogleAdMob/광고 타입**이 있으면 그걸 사용하고, 없으면 `toss.d.ts` 에 공식 시그니처를 맞춰 정의.

7. **Error/Edge — load 없이 show만 호출**  
   가이드라인: “로드되지 않은 상태에서 호출하면 오류”.  
   현재는 항상 “미로드 상태에서 show”에 해당해, fill-rate 저하·오류 가능성 있음.  
   → load → (loaded) → show 순서 도입 시, “아직 loaded 아님”일 때 show 호출 방지 및 재시도/메시지 등 에러·엣지 처리.

### P2 (가독성·일관성)

8. **Cognitive Complexity — 호출부 산재**  
   리워드·전면 트리거가 여러 컴포넌트에 생기면 동일 패턴이 반복된다.  
   → `runWithOptionalReward` / `showInstantAd` 래핑 등 **한 레이어**에서 토스 여부·실패 정책을 모을지 팀 규칙으로 정한다.

9. **광고 ID 상수 이원화**  
   테스트용 ID(리워드/전면)는 가이드라인에만 있고 코드에는 없음.  
   → `adPlacements.ts`(또는 토스 전용 설정)에 **플레이스먼트 → adGroupId 매핑** 및 **개발용 테스트 ID**를 명시해, 토스 환경에서만 참조.

10. **일반 웹과의 경계**  
    “토스 미니앱에서만 적용”을 위해 광고 분기는 **`isTossApp()` / 브리지 `isSupported()`** 안쪽에 한정되는지 확인.  
    → **신규** 트리거도 `rewardAdService`·`GlobalAdManager`·Provider 경로에만 두면 일반 웹 동작은 불변에 가깝다.

---

## 4. 리팩토링 개선 코드 제안

### 4.0 플랫폼 격리: Adapter + DI (필수)

- **인터페이스**: `AdProvider = { load(placementId): Promise<void>; show(placementId): Promise<AdResult>; getState(placementId): AdState }`. (또는 load/show만 있고, 상태는 getState로 조회.)
- **구현체**:
  - **TossAdAdapter**: `@apps-in-toss/web-framework`의 **GoogleAdMob.loadAppsInTossAdMob** / **showAppsInTossAdMob**만 사용. 내부에 **Ad State Machine**(IDLE → LOADING → READY → SHOWING → COMPLETED/ERROR) 유지.
  - **WebAdAdapter**: `load`/`show` 호출 시 즉시 resolve, `getState`는 항상 READY 또는 IDLE. (광고 없음/더미)
- **주입**: 앱 진입점(또는 TossAppProvider)에서 `isTossApp()`이면 `TossAdAdapter`, 아니면 `WebAdAdapter`를 생성해 Context 또는 props로 제공. 비즈니스 로직은 **AdProvider**만 참조하므로 **`if (isToss)` 분기가 호출부에 생기지 않도록** 한다.

### 4.1 (P0) 토스 전용: 공식 API + Ad State Machine + load → show

공식 문서대로 **토스 미니앱 전용** Adapter 내부에서만 다음을 적용한다.

1. **API**: `@apps-in-toss/web-framework`에서 **GoogleAdMob**만 import. **loadAppsInTossAdMob**, **showAppsInTossAdMob** 메서드명만 사용. (`window.TossApp.ads` 미사용.)
2. **상태 머신**: `IDLE → LOADING → READY → SHOWING → COMPLETED | ERROR`. load 완료(loaded 이벤트) 시에만 READY로 전이. READY일 때만 show 호출. show 후 COMPLETED이면 다음 load 예약.
3. **ID**: **adGroupId**는 **constants.ts**(또는 `adConstants.ts`)에서만 관리. 공식 테스트 ID(`ait-ad-test-rewarded-id`, `ait-ad-test-interstitial-id`) 우선 적용.

```ts
// services/ads/constants.ts (Strict ID Mapping — Section 0 준수)
export const TOSS_AD_GROUP_IDS = {
  REWARD: 'ait-ad-test-rewarded-id',
  INTERSTITIAL: 'ait-ad-test-interstitial-id',
} as const;

// services/ads/TossAdAdapter.ts (토스 전용, 신규)
// - GoogleAdMob.loadAppsInTossAdMob.isSupported() 체크
// - 상태: IDLE | LOADING | READY | SHOWING | COMPLETED | ERROR
// - loadAppsInTossAdMob({ options: { adGroupId }, onEvent: (e) => e.type === 'loaded' && setState(READY), onError })
// - show는 state === READY일 때만 showAppsInTossAdMob 호출
// - READY가 아닐 때 UI는 "광고를 준비 중입니다" 또는 버튼 비활성화
// - useAdState 훅: 상태 머신 노출. 훅 내부에 setTimeout 기반 5~10초 타임아웃 포함.
//   LOADING이 해당 시간 초과 시 ERROR(또는 타임아웃) 전이, "광고를 불러오지 못했습니다" 등 방어적 UX
```

비즈니스 레이어는 **`requestRewardAd` / `useAdPreload().showInstantAd` / DI된 `GlobalAdManager`** 같은 **명시적 진입점**만 호출하고, Web/no-op은 각 구현 내부에서 처리하는 패턴을 유지한다(또는 향후 `AdProvider` 도입 시 동일 경계).

#### Logger 통합 (광고·결제 상태 변화)

**모든 광고/결제 상태 변화**를 지난번 구축한 **request.log (Correlation ID 포함)** 에 기록한다.

- **BFF**: 결제 검증(IAP Verify, get-order-status 호출)·검증 결과·지급 여부 등 **결제 관련 상태 변화**는 해당 요청의 **request.log**에 남긴다. (Fastify onRequest에서 바인딩한 correlationId가 자동 포함.)
- **광고**: 클라이언트에서 광고 load/show 완료 등 이벤트가 BFF를 거치는 경우(예: 저장 API 호출 시), 해당 요청의 **request.log**에 광고 노출 여부·placementId 등을 기록한다. 클라이언트는 가능하면 **X-Correlation-ID** 헤더로 동일 correlationId를 전달해 한 트레이스로 묶는다.
- **일관된 포맷**: `log.info({ correlationId, event: 'ad_loaded' | 'ad_shown' | 'payment_verify_start' | 'payment_verify_ok' | 'payment_verify_mismatch', ... })` 형태로 상태 변화를 구조화 로그로 남긴다.
- **광고 지표**: State Machine 전이(Load Requested → Load Success → Show)마다 로그를 남겨 **Fill Rate**·**Show Rate** 계산 가능하게 한다. (Section 4.7 참고.)

### 4.2 IAP: 서버 선행 orderId + 서버 간 검증 (1.2.1 교정)

인앱결제(IAP) 도입 시 아래를 **필수**로 한다.

1. **결제 요청 전**: 우리 BFF에서 **orderId**(UUID v7 등)를 생성하고, 클라이언트는 이 orderId를 토스 IAP API(`requestPayment` / `createOneTimePurchaseOrder`)에 전달한다.
2. **결제 완료 후**: 클라이언트 성공 콜백만으로 지급하지 않는다. **서버 대 서버**로 검증한다.
   - **Webhook**: 토스가 우리 BFF로 결제 결과를 보내면, BFF에서 orderId·상태를 검증한 뒤 DB 지급.
   - **또는 Verify API**: 클라이언트가 받은 orderId를 BFF에 전달하면, BFF가 토스 **get-order-status** API(`POST /api-partner/v1/apps-in-toss/order/get-order-status`, x-toss-user-key + orderId)를 호출해 상태를 확인한 뒤, PURCHASED/PAYMENT_COMPLETED 등일 때만 지급.
3. **멱등성**: 동일 orderId에 대한 지급은 **한 번만** 수행한다. DB에 orderId를 키로 기록해 중복 지급을 막는다.
4. **productId**: IAP 상품 ID는 **constants.ts**(또는 `iapConstants.ts`)에서만 관리하고, 공식 테스트 상품이 있으면 우선 적용(Strict ID Mapping).
5. **IAP Verify 시 amount·productId 대조 (Strict Validation)**: 서버에서 토스 결제 검증 API를 호출한 뒤, **응답받은 amount와 productId(또는 sku)를 우리 DB의 설정값(상품별 금액·상품 ID)과 반드시 대조**한다. **토스 amount와 우리 DB의 price가 다를 경우**, 즉시 **'Abnormal Transaction'** 로그를 남기고 **아이템 지급을 차단**한다. 일치하지 않으면 지급하지 않고, request.log에 검증 실패 사유를 남긴다.

6. **결제 복구(Recovery)**: 클라이언트는 앱 마운트 시 **GET /orders/pending** 호출 후, 미완료 건이 있으면 서버 verify 트리거. 복구 중에는 **"지난 결제를 확인 중입니다..."** 인디케이터 표시(UI 가이드라인).

### 4.3 (P1) DRY — show 한 곳으로 모으기

```ts
// 예시: 보상 전용 래퍼 (실제는 rewardAdService.requestRewardAd 사용)
type AdType = 'reward' | 'interstitial';

async function showAd(placementId: string, type: AdType): Promise<AdResult> {
  const timeoutMs = type === 'reward' ? REWARD_TIMEOUT_MS : INTERSTITIAL_TIMEOUT_MS;
  const key = type === 'reward' ? 'showReward' : 'showInterstitial';
  try {
    const mod = await loadWebFramework();
    const bridge = typeof window !== 'undefined' ? window.TossApp : undefined;
    const showFn = bridge?.ads?.[key] ?? (mod as { partner?: { [k: string]: (id: string) => Promise<void> } }).partner?.[key];
    if (!showFn) {
      return { shown: false, error: type === 'reward' ? '리워드 광고 API를 사용할 수 없습니다.' : '전면 광고 API를 사용할 수 없습니다.' };
    }
    await withTimeout(showFn(placementId), timeoutMs);
    return { shown: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : `${type === 'reward' ? '리워드' : '전면'} 광고 실패`;
    return { shown: false, error: msg };
  }
}
```

(실제 전환 시에는 공식 API의 load → show 플로우로 대체하는 것을 우선한다.)

### 4.4 (P1) shouldShowAds 사용 (토스 내부에서만)

```ts
// 예시: 저장 전 리워드 (과거 패턴) — 현재는 지면별로 rewardAdService 등 호출부에서 처리
export async function showRewardBeforeAction(
  placementId: AdPlacementId,
  options?: { userProfile?: UserProfile | SimpleUserProfile | null }
): Promise<AdResult> {
  if (!isTossApp()) return { shown: false };
  if (options?.userProfile != null && !shouldShowAds(options.userProfile)) return { shown: false };
  const result = await showAd(placementId, 'reward');
  // ... 기존 실패 정책
}
```

App.tsx 등에서는 `showRewardBeforeAction(AdPlacement.XXX, { userProfile })` 처럼 **토스에서만** 두 번째 인자 전달. 일반 웹에서는 두 번째 인자 없이 호출해도 되도록 optional로 두면 웹 동작은 불변.

### 4.5 (P2) runWithOptionalReward 래퍼 (반복 제거)

```ts
// App 전용 훅/유틸 또는 rewardAdService 래퍼
export async function runWithOptionalReward<T>(
  placementId: AdPlacementId,
  action: () => Promise<T>,
  options?: { userProfile?: UserProfile | null }
): Promise<T> {
  await showRewardBeforeAction(placementId, options);
  return action();
}
```

App.tsx 예시:

```tsx
onSave={async (newP) => {
  await runWithOptionalReward(AdPlacement.REWARD_STRATEGY_SAVE, () => handleAddPortfolio(newP, () => setIsCreatorOpen(false)), { userProfile });
}}
```

전면은 “진입 전 한 번 호출”이므로 동일 패턴으로 `runWithOptionalInterstitial` 도 고려.

### 4.6 adGroupId 매핑 (플레이스먼트 → 공식 ID)

```ts
// adPlacements.ts (토스 전용 참고용 — 실제 ID는 콘솔/테스트 값으로 교체)
// 전면: interstitialPlacementConfig + getResolvedInterstitialAdGroupId
// 보상: adPlacements.ts 등 adGroupId 상수 + rewardAdService.requestRewardAd
```

실서비스에서는 콘솔에서 발급한 adGroupId로 교체하고, **이 상수들은 토스 광고 모듈에서만 참조**하도록 하면 일반 웹에는 영향 없음.

---

## 4.7 시니어의 마지막 '현장' 조언 (Zero-Defect)

### ① 결제 검증(Verify) API의 보안

- **비판**: 서버 간 검증(S2S) 시, 우리 서버가 토스 API를 호출할 때 사용하는 **인증 정보(API Key 등)** 가 안전한지 다시 확인해야 한다.
- **교정**: 로그인 연동 때와 마찬가지로, **결제 검증 API 호출 시에도 mTLS가 필요한지**, 또는 **별도의 Secret Header**가 필요한지 공식 문서를 확인하여 **TossIAPManager(서버측)** 에 반영한다. 인증서·키는 env에서 로드하고 노출되지 않도록 한다.

### ② 광고 노출 지표(Analytics)

- **비판**: 현재 설계에는 '성공/실패'는 있지만 **'분석'**이 부족하다.
- **교정**: **Ad State Machine의 각 전이(Transition) 단계마다** 로그를 남긴다.
  - **Load Requested → Load Success**: **Fill Rate** 계산 가능.
  - **Load Success → Show**: **Show Rate** 계산 가능.
  - 이 지표가 있어야 "광고가 왜 안 나오냐"는 비즈니스 팀 질문에 **데이터로 답**할 수 있다. (request.log 또는 전용 analytics에 구조화 로그로 기록.)

---

## 5. Cursor에게 줄 최종 구현 명령 (Actionable Instruction)

다음은 **구현 시 반드시 수행**할 액션이다.

| 명령 | 내용 |
|------|------|
| **useAdState 구현** | **NO_FILL** 에러 시 유저에게 보여줄 **토스트(Toast)** 메시지 또는 **대체 UI** 로직을 포함한다. (예: "광고가 지금은 없어요. 계속 진행할까요?") ERROR와 구분된 메시지 처리. |
| **IAP Recovery 구현** | **useEffect**를 사용하여 **앱 마운트 시** 서버의 **GET /orders/pending** API를 호출한다. 결과가 있으면 **즉시 토스 verify 로직**을 트리거한다. 복구 중에는 "지난 결제를 확인 중입니다..." 인디케이터 표시. |
| **Strict Validation** | 결제 검증 서버 로직에서 **토스로부터 받은 amount와 우리 DB의 price가 다를 경우**, 즉시 **'Abnormal Transaction'** 로그를 남기고 **아이템 지급을 차단**한다. |

---

## 6. 체크리스트 요약

| 항목 | 조치 |
|------|------|
| **Section 0 — Cursor 3규칙** | **Zero-Hallucination**: GoogleAdMob·IAP만 `@apps-in-toss/web-framework`에서 import, loadAppsInTossAdMob / showAppsInTossAdMob / requestPayment만 사용. **Lifecycle Enforcement**: load 성공 확인 후에만 show. **Strict ID Mapping**: adGroupId·productId는 constants.ts에서만, 테스트 ID 우선. |
| 인앱광고 — 상태 머신 | **Ad State Machine** (IDLE→LOADING→READY→SHOWING→COMPLETED/ERROR). READY가 아닐 때 "광고를 준비 중입니다" 또는 버튼 비활성화. |
| 인앱광고 — API | load 단계 추가, show는 loaded 이후만, **adGroupId** 사용, 토스 전용 Adapter 내부에서만 변경. |
| 플랫폼 격리 | **Adapter + DI**: 비즈니스 로직은 `AdProvider.show()`만 호출. TossAdAdapter / WebAdAdapter 주입. `if (isToss)` 를 호출부에 두지 않음. |
| 인앱결제(IAP) | **서버 선행 orderId** 생성 → 토스 전달. **서버 간 검증**(Webhook 또는 get-order-status) 후에만 지급. **멱등성** 보장. **Verify 시 amount·productId를 DB 설정값과 반드시 대조** 후 불일치 시 미지급. productId는 constants.ts. |
| useAdState 타임아웃 | 훅 내부 **setTimeout 5~10초** 타임아웃. LOADING 초과 시 ERROR 전이. **NO_FILL** 시 토스트/대체 UI, **ERROR** 시 구분 메시지. |
| 광고 에러 세분화 | **NO_FILL**(물량 없음) vs **ERROR**(기술 오류) 구분. NO_FILL 시 로그 폭탄 방지. |
| 광고 노출 지표 | State Machine 전이마다 로그: Load Requested→Load Success(Fill Rate), Load Success→Show(Show Rate). |
| IAP 복구(Recovery) | 앱 마운트 시 GET /orders/pending → verify 트리거. **"지난 결제를 확인 중입니다..."** 인디케이터 UI. |
| Verify API 보안 | 결제 검증 시 mTLS 또는 Secret Header 필요 여부 확인, TossIAPManager에 반영. |
| Strict Validation | 토스 amount ≠ DB price 시 **'Abnormal Transaction'** 로그 후 지급 차단. |
| Logger 통합 | **모든 광고/결제 상태 변화**를 **request.log (Correlation ID 포함)** 에 기록. BFF 결제 검증·검증 결과·광고 노출 이벤트 등 구조화 로그. |
| DRY/SRP | 보상(`rewardAdService`)·전면(`GlobalAdManager`/브리지) 분리 유지, 공통 타임아웃·로깅만 얇게 공유. |
| Dead Code | shouldShowAds를 토스 광고 호출 직전에만 사용 (선택). |
| 일반 웹 무변경 | Adapter 주입으로 웹은 WebAdAdapter(no-op). 모든 토스 전용 로직은 Adapter·토스 전용 파일 안에만 두기. |
