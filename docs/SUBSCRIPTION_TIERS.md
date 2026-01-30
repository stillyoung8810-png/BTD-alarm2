# 회원 티어별 서비스 이용 차별점

코드 기준으로 정리한 Free / Pro / Premium 티어 차이입니다. `user_profiles.subscription_tier` 및 `max_portfolios`, `max_alarms` 등으로 제어됩니다.

---

## 요약 표

| 항목 | Free | Pro | Premium |
|------|------|-----|---------|
| **최대 포트폴리오 수** | 2개 | 4개 | 4개 |
| **최대 알람 수** | 2개 | 4개 | 4개 |
| **사용 가능 종목** | 기본 종목만 (SPY, QQQ, TQQQ 등 13종) | 기본 + PRO 전용 종목 (TSLA, NVDA, MSTR 등 13종 추가) | Pro와 동일 |
| **텔레그램 연결·알림** | 불가 (UI 비노출) | 가능 (연결 + 알림 발송) | Pro와 동일 |
| **텔레그램 알람 수신** | 발송 안 함 | 발송함 (연결 시) | Pro와 동일 |
| **광고 노출** | 노출 (유료 아님) | 유료 활성·미만료 시 비노출 | Pro와 동일 |

※ Pro와 Premium은 **기능·한도가 동일**하게 적용됩니다. UI에서 티어명·스타일(뱃지, 색상)만 다르게 보입니다.

---

## 1. 포트폴리오·알람 한도

- **Free**  
  - `max_portfolios`: 기본 **2**  
  - `max_alarms`: 기본 **2**  
  - 새 가입 시 `user_profiles`에 2, 2로 설정됨.

- **Pro / Premium**  
  - `getMaxPortfolios` / `getMaxAlarms`에서 기본 **4**  
  - DB에 `max_portfolios`, `max_alarms`가 있으면 그 값을 사용.

- **제한 적용**  
  - 포트폴리오: **진행 중(`is_closed = false`)인 개수**만 카운트.  
  - 최대 개수 초과 시 새 포트폴리오 생성 시도 시 알림으로 막음 (`App.tsx`).

---

## 2. 사용 가능 종목 (시세·전략·매매)

- **Free**  
  - **AVAILABLE_STOCKS**만 사용 가능:  
    `SPY`, `SSO`, `UPRO`, `QQQ`, `QLD`, `TQQQ`, `SOXX`, `USD`, `SOXL`, `STRC`, `BIL`, `ICSH`, `SGOV`

- **Pro / Premium**  
  - 위 기본 종목 + **PAID_STOCKS** 사용 가능:  
    `TSLA`, `TSLL`, `NVDA`, `NVDL`, `GOOGL`, `GGLL`, `PLTR`, `PTIR`, `COIN`, `CONL`, `MSTR`, `MSTX`, `BMNR`

- **구현 위치**  
  - `constants.tsx`: `PAID_STOCKS`, `ALL_STOCKS`  
  - `Markets.tsx`, `StrategyCreator.tsx`, `QuickInputModal.tsx` 등에서 `canAccessPaidStocks`(Pro/Premium 여부)로 PRO 전용 종목 선택·시세 조회 허용/잠금.

---

## 3. 텔레그램 연결·알림

- **Free**  
  - 프로필 모달에 **텔레그램 블록 자체가 안 보임** (`currentTier === 'pro' || currentTier === 'premium'` 일 때만 표시).  
  - `send-alarm` Edge Function에서도 **Pro/Premium이 아니면 텔레그램 발송 안 함** (`shouldSendTelegram` → `subscription_tier`가 `pro` 또는 `premium`일 때만 발송).

- **Pro / Premium**  
  - 프로필에서 텔레그램 연결하기 버튼·연결 상태·알림 사용 토글 표시.  
  - 연결 후 `telegram_enabled = true` 이고 `telegram_chat_id`가 있으면, 알람 시간에 **텔레그램으로 알림 발송**.

---

## 4. 광고 노출

- **shouldShowAds** (`subscriptionUtils.ts`):  
  - 로그아웃 → 광고 노출.  
  - 유료 티어(pro, premium, enterprise)이고 **구독 활성 + 미만료**이면 광고 비노출.  
  - 그 외(Free, 만료/취소 유료) → 노출.

---

## 5. 티어 판별·데이터 소스

- **프론트**  
  - `userProfile.subscription_tier` (소문자 정규화: `free` / `pro` / `premium`).  
  - `App.tsx`에서 프로필 조회 시 `subscription_tier`, `max_portfolios`, `max_alarms`, `telegram_enabled` 등 사용.

- **백엔드 (send-alarm)**  
  - `user_profiles`의 `subscription_tier`로 텔레그램 발송 여부 결정 (`shouldSendTelegram`).

- **유료 티어 목록**  
  - `subscriptionUtils.ts`: `PAID_TIERS = ['pro', 'premium', 'enterprise']`.  
  - 기능상 Pro와 Premium은 동일, enterprise도 동일 로직으로 취급됩니다.

---

## 6. 참고 코드 위치

| 내용 | 파일 |
|------|------|
| 한도 기본값 (2/4) | `utils/subscriptionUtils.ts` (`getMaxPortfolios`, `getMaxAlarms`) |
| Free 기본값 설정 | `App.tsx` (신규 프로필: `max_portfolios: 2`, `max_alarms: 2`) |
| 포트폴리오 개수 제한 | `App.tsx` (새 포트폴리오 생성 시 `maxPortfolios` 체크) |
| PRO 전용 종목 | `constants.tsx` (`PAID_STOCKS`), `Markets.tsx`, `StrategyCreator.tsx` 등 |
| 텔레그램 UI 노출 | `components/AuthModals.tsx` (`currentTier === 'pro' \|\| currentTier === 'premium'`) |
| 텔레그램 발송 여부 | `supabase/functions/send-alarm/index.ts` (`shouldSendTelegram`) |
| 광고 노출 여부 | `utils/subscriptionUtils.ts` (`shouldShowAds`) |
