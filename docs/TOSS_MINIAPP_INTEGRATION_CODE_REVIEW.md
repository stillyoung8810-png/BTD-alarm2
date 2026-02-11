# 토스 미니앱 통합 계획 — 시니어 코드 리뷰 (비판·개선안)

> 목표: 유지보수성, 클린 코드, 효율성 관점에서 계획 및 구현 전략을 검토하고 개선점을 제안한다.

---

## 1. 발견된 문제점 리스트 (중요도 순)

### 🔴 Critical — 진행 전 반드시 해소 필요

#### 1.1 토스 API는 전부 mTLS 서버 간 통신 필수

**문제**  
[토스 가이드라인](https://developers-apps-in-toss.toss.im/development/integration-process.html)에 따르면 **토스 로그인, 토스페이, 기능성 푸시(스마트 메시지)** 는 모두 **mTLS 기반 서버-서버 통신**이 필수다.  
계획에서는 “클라이언트에서 토스 로그인 → Edge Function에서 code 교환”으로 되어 있는데, code 교환 및 세션 발급은 **우리 서버가 mTLS 인증서로 토스 API를 직접 호출**해야 한다.

**영향**  
- Supabase Edge Function(Deno)에서 클라이언트 mTLS(인증서+키 파일) 설정이 제한적일 수 있음.  
- 인증서/키를 Edge Function에 넣는 것도 보안·운영 리스크.  
- **결론**: 토스 로그인/결제/푸시 연동은 “Edge Function만으로 끝”이 아니라, **mTLS 가능한 백엔드(Node/Python 등) 또는 별도 BFF** 설계가 필요하다. 계획에 “백엔드 스펙 미정, mock”이라고만 두면 실제 연동 시 전면 수정이 발생한다.

#### 1.2 토스페이 결제 검증 경로 부재

**문제**  
`paymentService.ts`에서 `isTossApp()`일 때 `tossAppBridge.requestPayment()`만 호출하도록 하면, **결제 성공 후 검증**이 빠진다.  
현재 `verifyPaymentOnServer()`는 **포트원 기준**으로만 동작한다. 토스페이로 결제한 건은 포트원 API로 검증할 수 없으므로, **토스페이 전용 검증 API(우리 서버 → 토스 서버 mTLS)** 와 클라이언트에서 호출하는 `verifyTossPaymentOnServer()` 같은 분기가 필요하다.

**영향**  
토스 미니앱에서 결제만 하고 구독이 활성화되지 않거나, 클라이언트만 믿고 구독을 열면 보안/사기 이슈가 생긴다.

#### 1.3 광고 실패/타임아웃 시 저장 정책 미정의

**문제**  
“Reward Ad 표시 → 완료 대기 → 저장”에서, **광고 로드 실패·타임아웃·사용자 스킵** 시 “저장을 할지 말지”가 정책으로 없음.  
그대로 두면: 실패 시 저장을 막으면 UX 저하, 저장을 허용하면 수익 정책과 충돌할 수 있다.

**영향**  
구현 단계에서 임의로 “실패 시 그냥 저장” 등으로 넣기 쉽고, 나중에 정책이 바뀌면 여러 컴포넌트를 다시 손대야 한다.

---

### 🟠 High — 설계/구조 개선 권장

#### 2.1 단일 파일에 Auth + Payment + Ads 집중 (SRP 위반)

**문제**  
`tossAppBridge.ts`에 `requestTossAuth()`, `requestTossPayment()`, `showAd()`를 모두 넣는 계획은 **단일 책임 원칙 위반**이다.  
인증·결제·광고는 변경 주기와 실패 모델이 다르고, 테스트/목업 전략도 다르다. 한 파일이 커질수록 수정 시 부작용이 커진다.

**권장**  
- `tossAuth.ts` — 토스 로그인(브릿지 호출 + code 전달)  
- `tossPayment.ts` 또는 payment 서비스 내 토스 전용 함수 — 결제 요청  
- `adService.ts` — 광고만 (이미 계획에 있음)  
브릿지가 필요한 부분만 각 모듈에서 `loadWebFramework()` 또는 공용 브릿지 래퍼를 호출하도록 분리.

#### 2.2 AuthModals에 토스 분기 직접 삽입 시 컴포넌트 비대화

**문제**  
`AuthModals.tsx`는 이미 600줄 이상으로, 로그인/회원가입/프로필/비밀번호 변경/텔레그램/환불/탈퇴가 한 컴포넌트에 있다.  
여기에 `isTossApp()` 분기로 “이메일 폼 숨김 + 소셜 버튼 숨김 + 토스 버튼만 표시”를 넣으면 **조건부 UI가 한곳에 더 몰려** 가독성과 수정 비용이 나빠진다.

**권장**  
토스 전용 로그인 플로우를 **별도 컴포넌트**(예: `TossLoginView.tsx`)로 분리하고, `AuthModals`에서는 `isTossApp() ? <TossLoginView onSuccess={...} /> : <기존 폼 및 소셜>` 로만 선택하도록 한다.  
토스 로그인 실패/재시도/에러 메시지는 `TossLoginView` 안에서만 처리해 단일 책임을 유지한다.

#### 2.3 광고 트리거 로직의 3곳 중복

**문제**  
StrategyCreator / TradeExecutionModal / AlarmModal 각각에 “Reward Ad 표시 → 완료 후 저장”을 넣으면 **동일 패턴이 3곳에 복붙**된다.  
- 광고 실패 정책 변경 시 3곳 수정  
- Placement ID/이벤트명 변경 시 3곳 수정  
- 테스트 시 3곳 모두 목업 필요  

**권장**  
“저장 직전 리워드 광고”를 **한 레이어**에서 처리한다.  
- **옵션 A**: `adService.showRewardBeforeSave(placement).then(() => proceedSave())` 같은 공용 함수를 두고, 각 모달은 “저장할 데이터”만 넘기고 실제 저장은 부모(App)의 하나의 핸들러에서 수행.  
- **옵션 B**: 부모에서 “저장 요청”을 받을 때마다 `adService.showReward(placement)`를 먼저 호출하고, 완료 후 기존 `handleAddPortfolio` / `handleAddTrade` 등 호출.  
그러면 “광고 표시 + 완료 후 다음 단계” 규칙이 한 곳에만 있어 유지보수가 쉬워진다.

#### 2.4 정산 상세보기(History) 인터스티셜 트리거 위치

**문제**  
“정산 상세보기 클릭 시 Interstitial 표시”를 **History.tsx** 안에서 처리하면, History가 `adService`에 직접 의존하고, “상세 열기”가 `onOpenDetails(id)` 한 번의 콜백으로만 부모에 알려지는 현재 구조와 맞지 않을 수 있다.  
인터스티셜은 “보기 완료/닫힘” 시점에 콜백이 오므로, **클릭 → 광고 표시 → (닫힘) → onOpenDetails(id)** 순서를 어디서 보장할지가 명확해야 한다.

**권장**  
- **방안 1**: History는 “상세보기 클릭” 시 `onRequestDetails(id)` 같은 새 콜백을 호출. App에서 `onRequestDetails`가 호출되면 `adService.showInterstitial(Placement.SETTLEMENT_DETAIL).then(() => setDetailsTargetId(id))`로 처리. 그러면 광고 로직은 App(또는 전용 훅)에만 있고, History는 “요청”만 한다.  
- **방안 2**: History에 `adService`를 주입하고, History 내부에서 “클릭 → showInterstitial → 완료 시 onOpenDetails(id)”로 처리. 이 경우 History가 광고에 의존하는 대신, 상세 열기/광고 순서가 한 컴포넌트에 모인다.  
일관성을 위해 “광고 트리거는 App/훅에서만” 또는 “트리거는 해당 화면 컴포넌트에서만” 중 하나로 팀 규칙을 정하는 것이 좋다.

#### 2.5 푸시: 토스 미니앱 내 채널 분기 부재

**문제**  
계획에는 “requestNotificationPermission이 토스와 호환되는지 또는 tossAppBridge.requestPermission() 추가” 수준만 있다.  
토스 미니앱 내에서는 **FCM이 아닌 토스 스마트 메시지(기능성 푸시)** 를 쓸 가능성이 높고, 디바이스/앱 식별자도 토스 측 API로 등록할 수 있다.  
그래서 **웹(FCM 토큰 저장) vs 토스 미니앱(토스 푸시 등록)** 으로 분기해야 하는데, 그 분기와 “어디에 토큰/식별자를 저장할지”가 설계에 없다.

**권장**  
- `isTossApp()`이면 `tossAppBridge.requestPushPermission()`(또는 토스 문서의 해당 API) 호출 후, 토스에서 받은 식별자를 우리 백엔드에 저장하는 경로를 둔다.  
- 토스 푸시도 서버(mTLS) 연동이 필요할 수 있으므로, “푸시 등록/해제” API를 백엔드에 두고, 클라이언트는 “권한 요청 + 식별자 전달”만 하도록 한다.  
- App.tsx의 `saveFCMToken` 부근에서 `if (isTossApp()) { ... toss push path } else { ... requestForToken() ... }` 형태로 분기하고, 공통 인터페이스(예: `requestNotificationPermission(): Promise<boolean>`, `getPushIdentifier(): Promise<string | null>`)로 감싸 두면 테스트와 교체가 쉽다.

---

### 🟡 Medium — 구현 시 개선 권장

#### 3.1 테스트/검증 시 브릿지 전체 stub 부재

**문제**  
“isTossApp()을 true로 mock”하면, `requestTossAuth()` / `requestTossPayment()` 호출 시 실제 `window.TossApp` 등이 없어 **런타임 에러**가 난다.  
수동 검증 시에도 “토스 앱이 아닌 환경”에서는 브릿지 메서드가 없으므로, **브릿지 인터페이스 전체를 주입 가능하게** 두지 않으면 테스트와 개발 시뮬레이션이 불가능하다.

**권장**  
- `ITossBridge` 같은 인터페이스를 두고, `tossAppBridge.ts`는 그 구현체를 export.  
- 개발/테스트 시 `isTossApp()`가 true여도 `requestTossAuth` 등이 “Promise.resolve(mockCode)” 같은 stub 구현체를 쓰도록, 환경변수 또는 초기화 시점에 bridge를 교체할 수 있게 한다.  
- E2E/통합 테스트에서는 이 인터페이스를 mock 구현체로 주입해, 실제 토스 앱 없이 플로우만 검증할 수 있게 한다.

#### 3.2 에러 처리 및 재시도 정책 부재

**문제**  
- `requestTossAuth()` 실패(네트워크/사용자 취소/토스 서버 오류) 시 사용자 메시지, 재시도 버튼, 로깅 정책이 없다.  
- `requestTossPayment()` 실패 시 부분 결제·창 닫힘·타임아웃 등에 대한 처리도 없다.  
- 광고 실패 시 “저장 여부”는 위 1.3에서 언급한 대로 정책 수립이 필요하다.

**권장**  
- Auth: 토스 로그인 실패 시 “다시 시도” 버튼과 명확한 에러 메시지, 필요 시 Sentry 등으로 로그 전송.  
- Payment: 토스 결제 실패/취소 시 `PaymentResult`에 `success: false`와 구체적인 `code`/`message`를 넣고, UI에서 “결제가 취소되었습니다” 등으로 표시.  
- Ads: “실패 시 저장 허용 여부”, “타임아웃(예: 5초) 후 진행 여부”를 product 정책으로 정한 뒤 `adService`와 호출부에 일관되게 반영한다.

#### 3.3 타입 안전성

**문제**  
`tossAppBridge.ts`에서 `(window as any).TossApp`를 사용 중이다.  
토스 공식 타입이 없어도, **우리가 사용하는 메서드만이라도** `window` 확장 타입이나 `toss.d.ts`에 선언해 두지 않으면 리팩터 시 런타임 오류 가능성이 커진다.

**권장**  
- `global.d.ts` 또는 `types/toss.d.ts`에  
  `interface TossAppBridge { requestAuth?: () => Promise<{ code: string }>; requestPayment?: (params: unknown) => Promise<unknown>; ... }`  
  등 필요한 시그니처만 정의.  
- `(window as any).TossApp` 대신 `(window as Window & { TossApp?: TossAppBridge }).TossApp` 같이 타입을 좁혀 사용한다.

#### 3.4 paymentService의 import 경로

**문제**  
`paymentService.ts`는 `services/payment/` 아래에 있고 `import { isTossApp } from '../tossAppBridge'`로 사용 중이다.  
`../tossAppBridge`는 `services/tossAppBridge.ts`를 가리키므로 **경로 자체는 올바르다**.  
다만 `tossAppBridge`가 auth/ads까지 포함하게 되면, payment 레이어가 “인증/광고”에 의존하게 되어 책임이 섞인다.  
위 2.1처럼 auth/payment/ads를 파일 단위로 나누면, payment는 “토스 결제 브릿지 호출”만 하는 쪽(예: `tossPayment.ts`)에만 의존하도록 하는 것이 좋다.

---

### 🟢 Low — 개선 시 이득 있음

#### 4.1 Placement 상수/enum 중앙 관리

**문제**  
Placement ID를 “Strategies, Trade Logs, Alarms, History”로만 두고 각 트리거 지점에 문자열을 하드코딩하면, 나중에 플레이스먼트 추가/이름 변경 시 여러 파일을 찾아 수정해야 한다.

**권장**  
`adService.ts` 또는 `constants/ads.ts`에  
`export const AdPlacement = { REWARD_STRATEGY_SAVE: '...', REWARD_TRADE_SAVE: '...', REWARD_ALARM_SAVE: '...', INTERSTITIAL_SETTLEMENT_DETAIL: '...' } as const;`  
같이 상수로 두고, 호출부는 `AdPlacement.REWARD_STRATEGY_SAVE`만 참조하도록 한다.

#### 4.2 Verification plan 자동화

**문제**  
검증이 “수동”만으로 되어 있어, 리그레션 시 매번 사람이 클릭해서 확인해야 한다.

**권장**  
토스 브릿지를 인터페이스로 추상화해 두고, E2E(Playwright 등)에서 “토스 환경 시뮬레이션” 시 mock 브릿지를 주입해 “저장 클릭 → (mock) 광고 완료 → 저장 호출” 순서만 자동 검증할 수 있게 하면, 이후 배포 시 회귀를 줄일 수 있다.

---

## 2. 리팩토링된 개선 코드 제안

### 2.1 브릿지·인증·결제·광고 모듈 분리 (디렉터리 구조)

```
services/
  toss/
    tossBridge.ts      # loadWebFramework, isTossApp (공용)
    tossAuth.ts        # requestTossAuth() → code 반환
    tossPayment.ts     # requestTossPayment(params) → PaymentResult 형태
  ads/
    adService.ts       # showReward(placement), showInterstitial(placement), 실패 정책
    adPlacements.ts    # AdPlacement 상수
  payment/
    paymentService.ts # isTossApp() ? tossPayment.request() : PortOne
```

- `tossAppBridge.ts`는 기존 Safe Area/액세서리 버튼 등 유지하되, auth/payment 호출은 `tossAuth` / `tossPayment`로 위임.  
- `paymentService.ts`는 `tossPayment.requestTossPayment()`를 호출하고, 토스 결제 성공 시 `verifyTossPaymentOnServer()`(별도 구현)를 호출하도록 분기.

### 2.2 토스 전용 로그인 컴포넌트 분리

```tsx
// components/TossLoginView.tsx
interface TossLoginViewProps {
  lang: 'ko' | 'en';
  onSuccess: (user: { id: string; email: string }) => void;
  onError: (message: string) => void;
}

const TossLoginView: React.FC<TossLoginViewProps> = ({ lang, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const handleTossLogin = async () => {
    setLoading(true);
    try {
      const code = await requestTossAuth(); // tossAuth.ts
      if (!code) { onError('...'); return; }
      const session = await exchangeTossCodeForSession(code); // 우리 백엔드 호출
      if (session?.user) onSuccess({ id: session.user.id, email: session.user.email ?? '' });
      else onError('...');
    } catch (e) {
      onError(e instanceof Error ? e.message : '토스 로그인 실패');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <button onClick={handleTossLogin} disabled={loading}>Toss로 계속하기</button>
    </div>
  );
};
```

`AuthModals`에서는:

```tsx
if (type === 'login' || type === 'signup') {
  if (isTossApp()) {
    return (
      <TossLoginView
        lang={lang}
        onSuccess={(user) => { onLogin(user); onClose(); }}
        onError={setError}
      />
    );
  }
}
// 기존 이메일/소셜 폼
```

이렇게 하면 토스 전용 로직과 기존 로직이 한 컴포넌트 안에서 뒤섞이지 않는다.

### 2.3 광고 후 저장 — 부모(App)에서 일원화

저장 직전 리워드 광고를 **한 곳**에서 처리하는 예시다.  
StrategyCreator는 “저장할 데이터”만 부모에게 넘기고, “광고 표시 후 저장”은 App에서 처리한다.

```ts
// adService.ts
export type AdPlacement = typeof AdPlacement[keyof typeof AdPlacement];
export const AdPlacement = {
  REWARD_STRATEGY_SAVE: 'strategy_save',
  REWARD_TRADE_SAVE: 'trade_save',
  REWARD_ALARM_SAVE: 'alarm_save',
  INTERSTITIAL_SETTLEMENT_DETAIL: 'settlement_detail',
} as const;

export type AdResult = { shown: boolean; error?: string };

export async function showRewardBeforeAction(placement: AdPlacement): Promise<AdResult> {
  if (!isTossApp()) return { shown: false };
  try {
    await showRewardAd(placement); // 내부에서 toss.ads.show 등 호출
    return { shown: true };
  } catch (e) {
    // 정책: 타임아웃/실패 시에도 진행할지 여부는 여기서 결정
    const policy = getAdFailurePolicy(); // e.g. { onFailure: 'proceed' }
    if (policy.onFailure === 'proceed') return { shown: false, error: (e as Error).message };
    throw e;
  }
}
```

App.tsx에서:

```ts
const handleAddPortfolio = async (newP: Omit<Portfolio, 'id'>) => {
  const adResult = await showRewardBeforeAction(AdPlacement.REWARD_STRATEGY_SAVE);
  if (adResult.error) console.warn('[Ad] Reward skipped:', adResult.error);
  // 기존 handleAddPortfolio 로직 (Supabase insert 등)
  ...
};
```

- Trade 실행/알람 저장도 동일하게 `handleAddTrade`, 알람 onSave 쪽에서 `showRewardBeforeAction(AdPlacement.REWARD_TRADE_SAVE)` 등으로 한 번만 호출한다.  
- StrategyCreator / TradeExecutionModal / AlarmModal은 **광고를 모르고** “저장 요청”만 하도록 두면, 광고 정책 변경 시 App과 adService만 수정하면 된다.

### 2.4 정산 상세보기 — 인터스티셜은 App에서

History는 “상세보기 요청”만 하고, “광고 표시 후 열기”는 App에서 처리한다.

```tsx
// App.tsx
const handleRequestSettlementDetail = async (id: string) => {
  if (isTossApp()) {
    const result = await showInterstitial(AdPlacement.INTERSTITIAL_SETTLEMENT_DETAIL);
    if (result.error) console.warn('[Ad] Interstitial skipped:', result.error);
  }
  setDetailsTargetId(id);
};

// History에 전달
<History
  ...
  onOpenDetails={handleRequestSettlementDetail}
/>
```

History.tsx는 기존처럼 `onOpenDetails(p.id)`만 호출하고, 그 콜백이 위 `handleRequestSettlementDetail`이면 App에서 인터스티셜 후 `setDetailsTargetId`가 실행된다.

### 2.5 토스 결제 분기 및 검증

```ts
// paymentService.ts - requestPayment 내부
if (isTossApp()) {
  const result = await requestTossPayment({ orderName: req.orderName, totalAmount: req.totalAmount, ... });
  if (!result.success) return result;
  // 토스 전용 검증 (서버가 mTLS로 토스 API 호출)
  const verify = await verifyTossPaymentOnServer(result.paymentId, req.planId);
  return verify.success ? { success: true, paymentId: result.paymentId, ... } : { success: false, ... };
}
const PortOne = await loadPortOneSDK();
// 기존 포트원 플로우
```

- `requestTossPayment`는 `tossPayment.ts`에서 브릿지만 호출하고, `verifyTossPaymentOnServer`는 새 Edge Function 또는 mTLS 가능 백엔드에서 토스 결제 검증 API를 호출하도록 구현해야 한다.

### 2.6 푸시 권한 — 환경 분기

```ts
// services/push.ts (또는 firebase.ts 상단 분기)
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTossApp()) {
    return requestTossPushPermission(); // tossBridge 또는 전용 tossPush.ts
  }
  return getNotificationPermission() !== 'denied'; // 기존 FCM 권한 확인
}

export async function getPushIdentifierForSave(): Promise<string | null> {
  if (isTossApp()) {
    return getTossPushIdentifier(); // 토스에서 받은 식별자
  }
  return requestForToken(); // FCM 토큰
}
```

App.tsx의 `saveFCMToken`에서는 `getPushIdentifierForSave()`를 쓰고, 저장 시 “채널: web_fcm | toss_miniapp” 같은 구분을 두면, 나중에 푸시 전송 시 채널별로 분기하기 쉽다.

---

## 3. 요약 체크리스트

| 항목 | 계획 상태 | 리뷰 후 권장 |
|------|-----------|--------------|
| 토스 로그인 | 클라이언트 + Edge Function code 교환 | mTLS 백엔드 필요; Edge Function만으로 불가할 수 있음. 토스 전용 로그인 UI는 별도 컴포넌트로 분리 |
| 토스페이 | 브릿지 requestPayment만 | 서버 검증(verifyTossPaymentOnServer) 필수; paymentService에서 토스 분기 시 검증까지 호출 |
| 광고 | 3개 모달 + History에 각각 트리거 | adService + Placement 상수로 일원화; “광고 후 저장”은 App 또는 한 레이어에서만 수행. 실패 정책 명시 |
| 푸시 | requestPermission 호환 여부만 | 토스 미니앱 시 토스 푸시 경로 분기; 푸시 식별자 저장 채널 구분 |
| 테스트 | isTossApp mock | 브릿지 전체 stub 가능하도록 인터페이스 추상화 |
| 에러/재시도 | 미정의 | Auth/Payment/Ad별 실패 메시지·재시도·정책 정리 |

위 항목을 반영한 뒤 진행하면 유지보수성과 클린 코드, 효율성 측면에서 훨씬 안전하게 토스 미니앱 통합을 할 수 있다.
