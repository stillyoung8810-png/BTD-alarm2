---
name: 미니앱 모달 높이 안정화 계획서
overview: 작은 Toss 미니앱 화면에서 커스텀 모달의 하단 액션이 잘리는 문제를 고위험/중위험 대상으로 나누어 수정 전 검증 계획을 정리합니다.
stage: pre-implementation
status: draft
---

# 미니앱 모달 높이 안정화 계획서

## 목표

작은 기기 화면에서 모달이 viewport 밖으로 커져도 저장/취소/결제 같은 핵심 버튼에 항상 접근할 수 있게 합니다. 실제 기능, 금융 계산, 저장 로직, 결제 로직은 변경하지 않고 레이아웃 경계만 보강합니다.

## 현재 시스템 기준

이미 안전한 기준 패턴은 `components/tds-adapter/TdsDialogShell.tsx`, `components/alarm/AlarmModalView.tsx`, `components/portfolioDetails/PortfolioDetailsView.tsx`, `components/AIImageInputModal.tsx`에서 확인했습니다.

공통 안전 조건:

- overlay는 `100dvh` 기준 높이와 safe-area 하단 padding을 갖습니다.
- panel은 `flex-col`, `min-h-0`, `max-h`/`max-h-full`, `overflow-hidden`을 갖습니다.
- 본문은 `min-h-0 flex-1 overflow-y-auto overscroll-contain`으로 자체 스크롤됩니다.
- header/footer는 `shrink-0`으로 본문 스크롤에 밀려 사라지지 않습니다.
- footer는 `env(safe-area-inset-bottom)`을 반영합니다.

## 대상 분류

| 위험도 | 파일 | 문제 | 실제 증상 |
|---|---|---|---|
| High | `components/TradeExecutionModal.tsx` | panel에 viewport 높이 제한이 없습니다. 본문 `overflow-y-auto`가 있어도 부모 높이가 제한되지 않아 스크롤 경계가 생기지 않습니다. | 매수/매도 입력이 길어지면 저장/취소 버튼이 화면 밖으로 밀리고, 작은 화면에서 스크롤해도 하단 액션에 닿지 못할 수 있습니다. |
| High | `components/QuickInputModal.tsx` | `TradeExecutionModal`과 같은 구조입니다. | 빠른 입력 모달에서 금액/수량/경고 영역이 길어질 때 저장 버튼 접근이 막힐 수 있습니다. |
| Medium | `components/InfoModal.tsx` | 짧은 안내 전용이지만 panel/body/footer에 높이 제한과 내부 스크롤 계약이 없습니다. | 문구가 길어지거나 번역이 확장되면 확인 버튼이 화면 밖으로 밀릴 수 있습니다. |
| Medium | `components/CheckoutModal.tsx` | `TDSModal`의 외부 panel은 안전하지만 내부 body가 `100vh` 기준 `max-h`를 별도로 가집니다. 결제 CTA도 독립 footer가 아니라 body 내부에 있습니다. | 모바일 WebView의 `100vh` 오차나 긴 약관/환불 안내로 결제 버튼 접근성이 나빠질 수 있습니다. |
| Medium | `components/SettlementModals.tsx` | panel/body는 대체로 안전하지만 header/footer에 `shrink-0`, footer safe-area padding이 부족합니다. | 정산 결과 내용이 길어질 때 닫기 버튼 영역이 하단 safe-area와 겹칠 수 있습니다. |

## 수정 전략

1. `components/ui/constants.ts`에 작은 class-token 상수 `MINIAPP_MODAL_LAYOUT`을 추가합니다.
2. 고위험 모달 2개는 기존 JSX와 handler를 유지하고, overlay/panel/header/body/footer의 `className`만 부분 교체합니다.
3. 중위험 모달은 변경 폭을 더 줄입니다. `InfoModal`은 고위험과 같은 레이아웃 계약을 적용하되, `CheckoutModal`과 `SettlementModals`는 기존 shell/panel 구조를 유지하며 누락된 token만 보강합니다.
4. `TdsDialogShell` 자체는 이미 기준을 충족하므로 손대지 않습니다.
5. 실제 구현 전에는 `docs2/miniapp_modal_layout_simulation.test.ts`로 스니펫 계약을 먼저 통과시킵니다.
6. 실제 구현 후에는 `components/ui/constants.ts`의 `MINIAPP_MODAL_LAYOUT` 실상수와 변경 파일 class를 검증하는 별도 테스트를 추가해야 합니다. 사전 시뮬레이션만으로 출시 승인하지 않습니다.

## 시뮬레이션 통과 기준

명령어:

```powershell
npx vitest run --config docs2/miniapp_modal_layout_vitest.config.ts
```

통과해야 하는 계약:

- 고위험 모달은 overlay/panel/body/footer의 필수 class-token을 모두 포함해야 합니다.
- 중위험 모달은 각 파일의 문제에 맞는 최소 보강 token만 포함해야 합니다. 특히 `SettlementModals`는 overlay/panel을 교체하지 않습니다.
- `100vh` 기반 body 높이 제한은 새 스니펫에서 제거하고 `100dvh`/부모 flex 경계에 위임해야 합니다.
- 새 공통 컴포넌트 추상화는 만들지 않습니다. 이번 범위에는 class-token 상수만 허용합니다.
- 저장/취소/결제 handler, mutex, validation 로직은 변경 대상이 아닙니다.

## 구현 후 출시 게이트

구현 후에는 사전 시뮬레이션 외에 실제 코드 기반 테스트를 추가합니다.

검증 대상:

| 파일 | 반드시 포함 | 반드시 제거/유지 금지 |
|---|---|---|
| `components/ui/constants.ts` | `MINIAPP_MODAL_LAYOUT`, `min-h-[100dvh]`, `min-h-0 flex-1 overflow-y-auto overscroll-contain`, `env(safe-area-inset-bottom,0px)` | 없음 |
| `components/TradeExecutionModal.tsx` | `MINIAPP_MODAL_LAYOUT`, `isExecutingTradeRef`, `Promise.resolve(onSave(`, `aria-busy={isSaving}` | 없음 |
| `components/QuickInputModal.tsx` | `MINIAPP_MODAL_LAYOUT`, `isExecutingTradeRef`, `Promise.resolve(onSave(`, `aria-busy={isSaving}` | 없음 |
| `components/InfoModal.tsx` | `MINIAPP_MODAL_LAYOUT`, `role="button"`, `tabIndex={0}`, `handlePressEnterOrSpace` | 없음 |
| `components/CheckoutModal.tsx` | `MINIAPP_MODAL_LAYOUT`, `isExecutingRef`, `await Promise.resolve(handleTossIapPay())` | `max-h-[calc(100vh-8rem)]` |
| `components/SettlementModals.tsx` | `max-h-[calc(100dvh-2rem)]`, `min-h-0 flex-1 overflow-y-auto overscroll-contain`, `pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]` | `MINIAPP_MODAL_LAYOUT` |

검증 방식:

- 구현 전: `npx vitest run --config docs2/miniapp_modal_layout_vitest.config.ts`
- 구현 후: 위 파일별 계약을 실제 파일 내용에 대해 검사하는 테스트를 추가하고 통과시킵니다.
- 구현 후 테스트는 문서의 스니펫 문자열이 아니라 실제 런타임 파일을 읽거나 import해야 합니다.

## Core Rules 자체 점검

| 규정 | 점검 |
|---|---|
| 금융 수학 불변 | 가격, 수량, 수수료, 결제 금액 계산을 전혀 변경하지 않습니다. |
| React UI | 중첩 삼항식이나 render 중 side-effect를 추가하지 않습니다. |
| I18N | 새 UI 문구를 추가하지 않습니다. 기존 label/aria 문자열만 유지합니다. |
| A11y | 기존 backdrop button/aria 구조를 유지합니다. `InfoModal`의 interactive div 접근성도 유지합니다. |
| DRY/SRP | 레이아웃 token만 `MINIAPP_MODAL_LAYOUT`으로 분리하고, 모달의 비즈니스 책임은 건드리지 않습니다. |
| Strict TS | 새 타입은 `as const`와 명시 타입만 사용하고 `any`, non-null assertion을 쓰지 않습니다. |
| Magic Numbers | safe-area와 viewport class는 상수로 묶고, 새 숫자 로직을 만들지 않습니다. |
| Async Safety | 결제/저장 handler와 mutex는 변경하지 않습니다. 구현 후 `isExecutingTradeRef`, `isExecutingRef`, `Promise.resolve(onSave(...))` 유지 여부를 확인합니다. |
| Zero Assumption | 현재 확인된 DOM 구조와 class 누락만 대상으로 합니다. 미확인 Toss API나 WebView API는 도입하지 않습니다. |

## 오버코딩 검토

`TdsDialogShell`로 전면 이관하는 방법은 장기적으로 깔끔하지만, 이번 수정 범위에서는 각 모달의 z-index, 폭, 색상, 입력 흐름이 달라 변경 면적이 커집니다. 따라서 이번 단계는 작은 공통 class-token 상수와 최소 class 교체만 제안합니다. 이는 고위험 문제를 해결하면서도 기존 컴포넌트 구조와 테스트 범위를 가장 적게 흔드는 접근입니다.

출시 직전 안정성 기준에서는 “전체 return 교체”도 금지합니다. 실제 구현은 기존 JSX 내부를 보존하고 `className` 문자열만 바꾸는 부분 교체 방식으로 진행합니다.
