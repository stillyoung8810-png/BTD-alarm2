# 알람용 데이터가 서버에 업데이트되는 시점

Supabase에 알람 관련 데이터가 **언제** 쓰이는지 정리합니다.

---

## 1. `daily_execution_summaries` (알람 메시지 본문 요약)

**테이블**: `daily_execution_summaries`  
**역할**: 알람 시 텔레그램/푸시에 들어갈 "📋 DAILY EXECUTION" 블록 텍스트

| 시점 | 트리거 | 설명 |
|------|--------|------|
| **로그인 직후** | `user?.id`, `portfolios` 변경 | 포트폴리오 로드 후 useEffect 실행 → 요약 생성 후 upsert |
| **포트폴리오 변경** | `portfolios` 변경 | 거래 추가/삭제, 전략 수정, 알람 설정 변경 등으로 portfolios 바뀌면 useEffect 재실행 → 요약 다시 upsert |
| **언어 변경** | `lang` 변경 | ko ↔ en 전환 시 요약을 새 언어로 다시 만들어 upsert |
| **대시보드에서 상세 블록 전달** | `dailyExecutionSummaryFromDashboard` 변경 | 사용자가 대시보드 탭을 열면 각 카드가 LOC/MOC 등 상세 블록을 만들고, 합쳐진 요약이 이 상태로 들어옴 → useEffect 실행 → **상세 요약**으로 upsert |

- **저장 조건**: `user?.id` 있고, `portfolios` 길이 > 0이고, 만들어진 요약 텍스트가 비어 있지 않을 때만 upsert
- **의존 배열**: `[user?.id, portfolios, lang, dailyExecutionSummaryFromDashboard]`

---

## 2. `portfolios.alarm_config` (알람 ON/OFF, 알람 시간)

**테이블**: `portfolios`  
**컬럼**: `alarm_config` (enabled, selectedHours 등)

| 시점 | 트리거 | 설명 |
|------|--------|------|
| **알람 모달에서 저장** | AlarmModal "저장" 클릭 | `onSave(config)` → `handleUpdatePortfolio({ ...portfolio, alarmconfig: config })` → 해당 포트폴리오의 `alarm_config` 업데이트 |

- 알람 켜기/끄기, 알람 시간(selectedHours) 변경 시에만 이 경로로 서버에 반영됨

---

## 3. `portfolios.is_quarter_mode` (쿼터 손절 모드 플래그)

**테이블**: `portfolios`  
**컬럼**: `is_quarter_mode`

| 시점 | 트리거 | 설명 |
|------|--------|------|
| **쿼터 모드 진입** | 대시보드에서 T > a-1 감지 | PortfolioCard의 useEffect가 `onUpdatePortfolio({ ...portfolio, isQuarterMode: true })` 호출 → `handleUpdatePortfolio` → `is_quarter_mode: true` 로 업데이트 |
| **쿼터 모드 해제** | 매도로 보유 수량 감소 | `handleAddTrade`에서 매도 추가 후, 보유 수량이 24% 이상 감소 또는 99% 이상(수량 0) 감소하면 → 같은 포트폴리오에 대해 `is_quarter_mode: false` 로 추가 update |

- `handleUpdatePortfolio`를 통할 때는 `alarm_config`와 함께 `is_quarter_mode`도 항상 포함되어 저장됨

---

## 4. `portfolios` 기타 (이름, 전략, 거래 등)

알람 **트리거**에는 `alarm_config`만 쓰이지만, **요약 계산**에는 포트폴리오 전체가 쓰이므로 함께 정리합니다.

| 시점 | 트리거 | 설명 |
|------|--------|------|
| **포트폴리오 수정** | 이름/전략/1회 매수금 등 변경 후 저장 | `handleUpdatePortfolio(updated)` → name, strategy, trades, alarm_config, is_quarter_mode 등 반영 |
| **거래 추가** | QuickInput / TradeExecution 모달에서 저장 | `handleAddTrade(portfolioId, trade)` → `trades` 업데이트 (+ 쿼터 해제 시 `is_quarter_mode` 업데이트) |
| **거래 삭제** | 거래 삭제 시 | `handleDeleteTrade` → 해당 포트폴리오의 `trades` 업데이트 |
| **전략 종료** | Settlement 모달에서 종료 확정 | `handleClosePortfolio` → is_closed, closed_at, final_sell_amount, trades 등 업데이트 |

---

## 요약

- **알람 메시지 내용(요약)**  
  → `daily_execution_summaries`는 **로그인 직후, 포트폴리오/언어/대시보드 요약이 바뀔 때마다** App의 useEffect에서 upsert됨.

- **알람 설정(ON/OFF, 시간)**  
  → `portfolios.alarm_config`는 **알람 모달에서 저장할 때만** `handleUpdatePortfolio`로 업데이트됨.

- **쿼터 모드 플래그**  
  → `portfolios.is_quarter_mode`는 **T > a-1 진입 시**(대시보드에서 한 번)와 **매도로 복귀/리셋 시**(handleAddTrade 안에서) 업데이트됨.

- **그 외 포트폴리오 데이터**  
  → 포트폴리오 수정/거래 추가·삭제·종료 시 `handleUpdatePortfolio`, `handleAddTrade`, `handleDeleteTrade`, `handleClosePortfolio` 등에서 `portfolios` 테이블에 반영됨.
