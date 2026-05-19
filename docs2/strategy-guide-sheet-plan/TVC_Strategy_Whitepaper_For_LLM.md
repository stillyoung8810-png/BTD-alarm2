# TVC Strategy Whitepaper for LLM

## 1. TVC 전략의 핵심 철학

TVC(Target Value Channel)는 투자자가 매 순간의 주가 변동에 직접 반응하지 않고, 미리 정한 "목표 가치"를 중심으로 매수와 매도를 질서 있게 수행하도록 설계된 전략입니다. 핵심 질문은 "지금 주가가 싸거나 비싼가?"가 아니라 "현재 보유 상태가 다음 사이클의 목표 가치 채널보다 아래에 있는가, 위에 있는가?"입니다.

TVC는 포트폴리오를 두 개의 장부로 나누어 생각합니다.

| 변수 | 의미 |
|---|---|
| `V_current` | 현재 사이클의 목표 가치입니다. 전략이 따라가려는 기준선입니다. |
| `V_next` | 다음 사이클에서 사용할 새 목표 가치입니다. |
| `Pool_current` | 사이클 전환 직전의 현금 보관함입니다. |
| `Pool_next` | 적립 또는 인출을 반영한 다음 사이클의 현금 보관함입니다. |
| `Shares` | 현재 보유 주식 수입니다. |
| `Adjustment` | 사이클 전환 시 외부에서 들어오거나 나가는 현금입니다. 적립은 양수, 인출은 음수, 거치식은 0입니다. |
| `CR` | 현금 비율입니다. `CR = Pool_current / V_current`입니다. |

목표 가치(`V`)는 전략의 항로이고, 현금 보관함(`Pool`)은 그 항로를 따라가기 위한 완충 장치입니다. 목표 가치가 올라가면 밴드도 함께 올라가고, 밴드 아래에서는 매수 후보가, 밴드 위에서는 매도 후보가 만들어집니다.

TVC가 적립식과 거치식을 모두 지원하는 이유는 투자자의 현금 흐름이 다르기 때문입니다.

- 적립식은 매 사이클 새 현금이 들어오는 투자자에게 맞습니다. 새 적립금은 목표 가치 증가분에도 반영되고, 다음 사이클 주문표의 사용 가능한 현금에도 반영됩니다.
- 거치식은 추가 현금 없이 이미 투입한 자본 안에서만 운용하는 투자자에게 맞습니다. `Adjustment = 0`이므로 목표 가치는 기존 현금 보관함과 성장 규칙만으로 전진합니다.
- 인출식은 엔진 관점에서 음수 `Adjustment`로 표현할 수 있습니다. 다만 비즈니스 노출 여부와 별개로, 수학적으로는 현금 보관함을 줄이고 목표 가치에도 인출을 반영하는 동일한 구조입니다.

## 2. 사이클 전환 로직 (가장 중요)

사이클 전환의 핵심은 두 개의 현금 개념을 섞지 않는 것입니다. `Pool_current`는 "이번 사이클을 마감하기 직전의 상태 판정용 현금"이고, `Pool_next`는 "다음 사이클 주문표를 만들 실행용 현금"입니다.

### 기본 변수

아래 변수는 모두 한 사이클 전환에서 사용됩니다.

```text
V_current = 현재 목표 가치
Pool_current = 적립/인출 전 현금 보관함
Adjustment = 이번 사이클 전환 시 반영할 외부 현금
Pool_next = Pool_current + Adjustment
CR = Pool_current / V_current
g = baseGrowthRatePct / 100
theta = smartBrakeThresholdPct / 100
```

`Adjustment`의 부호는 모드가 결정합니다.

```text
적립식: Adjustment = +abs(입력 금액)
인출식: Adjustment = -abs(입력 금액)
거치식: Adjustment = 0
```

### 올바른 선후 관계

```text
1. 이전 장부를 읽는다.
   V_current, Pool_current, Shares

2. Adjustment의 부호를 확정한다.
   적립은 양수, 인출은 음수, 거치식은 0

3. Pool_next를 먼저 계산해 현금 부족 여부를 확인한다.
   Pool_next = Pool_current + Adjustment
   Pool_next < 0이면 다음 장부와 주문표를 만들 수 없다.

4. 성장률 판정용 CR은 반드시 Pool_current로 계산한다.
   CR = Pool_current / V_current

5. CR과 Smart Brake 임계값으로 성장 공식을 선택한다.
   CR > theta이면 일반 모드
   CR <= theta이면 안전 모드

6. V_next를 계산한다.

7. V_next를 기준으로 Band Low와 Band High를 계산한다.

8. Pool_next와 Shares를 기준으로 다음 사이클 주문표를 만든다.
```

이 순서가 중요한 이유는 `Adjustment`가 "이번 사이클의 성과"가 아니라 "다음 사이클부터 사용할 외부 현금 이동"이기 때문입니다. 새로 적립한 돈을 `CR` 계산에 먼저 넣으면, 아직 운용 성과나 완충력으로 검증되지 않은 현금이 성장률 판정에 영향을 줍니다.

### 왜 `Pool_current`로 CR을 판정하는가

`CR`은 목표 가치 대비 현금 보관함의 두께를 나타냅니다.

```text
CR = Pool_current / V_current
```

이 값은 "이전 사이클을 마감한 포트폴리오가 얼마나 많은 현금 완충력을 갖고 있었는가"를 측정합니다. 따라서 적립 또는 인출이 반영된 `Pool_next`가 아니라, 전환 직전의 `Pool_current`로 계산해야 합니다.

만약 `Pool_next`로 `CR`을 계산하면 다음 문제가 생깁니다.

- 적립금이 들어온 순간 안전 모드가 일반 모드로 잘못 바뀔 수 있습니다.
- `Adjustment`가 `CR` 판정에 한 번, `V_next`의 마지막 합산 항에 또 한 번 반영되어 경제적 의미가 중복됩니다.
- 인출이 있는 경우에는 실제 이전 사이클의 현금 완충력보다 더 낮은 상태로 판정되어 목표 가치가 과도하게 눌릴 수 있습니다.

예시는 다음과 같습니다.

```text
V_current = 1000
Pool_current = 200
Adjustment = 100
g = 10% = 0.10
theta = 25% = 0.25
```

올바른 계산은 다음과 같습니다.

```text
CR = 200 / 1000 = 0.20
CR <= 0.25이므로 안전 모드
V_next = 1000 * (1 + 0.10 * 0.20^2) + 100
       = 1104
Pool_next = 200 + 100 = 300
```

잘못된 계산은 다음과 같습니다.

```text
CR = 300 / 1000 = 0.30
CR > 0.25이므로 일반 모드로 오판
V_next = 1000 + 300 * 0.10 + 100
       = 1130
```

두 결과의 차이는 단순 반올림 차이가 아니라, 이번에 적립한 현금을 성장률 판정에 선반영했기 때문에 생긴 구조적 오류입니다.

### 일반 성장 공식

일반 모드는 현금 보관함이 목표 가치 대비 충분하다고 판단되는 구간입니다.

```text
조건: CR > theta

Growth = Pool_current * g
V_next = V_current + Growth + Adjustment
```

동일한 식을 `CR`로 표현하면 다음과 같습니다.

```text
Growth = V_current * g * CR
V_next = V_current * (1 + g * CR) + Adjustment
```

두 식은 `CR = Pool_current / V_current`이므로 같은 의미입니다. 일반 모드에서는 현금 보관함이 두꺼울수록 목표 가치가 더 빠르게 전진합니다.

### 안전 모드(Smart Brake) 공식

안전 모드는 현금 보관함이 목표 가치 대비 얇다고 판단되는 구간입니다.

```text
조건: CR <= theta

Growth = V_current * g * CR^2
V_next = V_current * (1 + g * CR^2) + Adjustment
```

`CR^2`를 쓰는 이유는 현금이 부족할수록 목표 가치의 전진 속도를 비선형으로 줄이기 위해서입니다. 예를 들어 `CR = 0.20`이면 일반 모드의 성장 입력은 `0.20`이지만, 안전 모드의 성장 입력은 `0.20^2 = 0.04`입니다. 현금 완충력이 약한 상태에서는 무리하게 목표 가치를 끌어올리지 않고, 다음 매수 여력을 보존합니다.

Smart Brake는 "투자를 멈추는 장치"가 아니라 "현금이 얇을 때 목표 가치의 가속도를 줄이는 장치"입니다. 그래서 안전 모드에서도 `Adjustment`는 그대로 반영됩니다. 적립식 투자자가 새 현금을 넣었다면 그 금액은 목표 가치와 현금 보관함 양쪽에 반영되지만, 안전 모드 여부를 판정하는 `CR`에는 아직 반영하지 않습니다.

## 3. VR 밴드 시스템

TVC의 주문 기준은 단일 가격이 아니라 목표 가치 주변의 채널입니다. 다음 사이클의 목표 가치 `V_next`가 정해지면, 그 값을 중심으로 하단 밴드와 상단 밴드를 만듭니다.

```text
Band Low = V_next * (1 - bandRateLower)
Band High = V_next * (1 + bandRateUpper)
```

밴드는 반드시 `V_current`가 아니라 `V_next`를 기준으로 계산해야 합니다. 사이클이 전환되면 전략의 기준선도 다음 목표 가치로 전진했기 때문입니다.

밴드의 경제적 의미는 다음과 같습니다.

- `Band Low`는 매수 기준선입니다. 현재 보유 주식 수와 추가 매수 후 주식 수를 고려했을 때, 포트폴리오가 이 하단 목표에 맞도록 분할 매수 가격을 역산합니다.
- `Band High`는 매도 기준선입니다. 보유 주식 수가 줄어드는 각 단계에서, 포트폴리오가 이 상단 목표에 맞도록 분할 매도 가격을 역산합니다.

즉 밴드는 "주가가 몇 달러면 싸다/비싸다"를 직접 말하는 것이 아니라, "현재 보유 수량 구조에서 목표 가치 채널을 맞추려면 어느 가격에 몇 주를 사거나 팔아야 하는가"를 계산하는 기준입니다.

## 4. 주문 생성 규칙 (Order Generation)

주문표는 다음 사이클에서 실제로 사용할 수 있는 현금과 현재 보유 주식 수를 기준으로 생성됩니다. 따라서 주문 생성에는 `Pool_current`가 아니라 `Pool_next`가 들어가야 합니다.

```text
주문표용 현금 = Pool_next
밴드 기준 = V_next에서 계산한 Band Low / Band High
보유 수량 기준 = 현재 Shares
```

### 매수 주문 생성

매수 주문은 하단 밴드(`Band Low`)를 기준으로 만들어집니다. 기본 아이디어는 "한 단계씩 더 샀을 때의 보유 수량으로 나누면, 하단 밴드에 맞는 목표 매수가가 나온다"입니다.

각 매수 단계 `k`에서의 개념 공식은 다음과 같습니다.

```text
effectiveShares_k =
  Shares가 0이면 k * minOrderQty
  Shares가 0보다 크면 Shares + (k - 1) * minOrderQty

BuyPrice_k = Band Low / effectiveShares_k
OrderCost_k = BuyPrice_k * minOrderQty * (1 + feeRate)
```

`Shares = 0`인 최초 진입 구간에서는 분모가 0이 되지 않도록 `k * minOrderQty`를 사용합니다. 이는 첫 매수 주문도 자연스럽게 생성하기 위한 금융 수학상의 필수 분기입니다.

매수 주문에는 현금 사용 한도가 있습니다.

```text
MaxBuyBudget = Pool_next * poolUsageRateBuy
```

누적 매수 비용이 `MaxBuyBudget` 안에 있으면 실행 가능 주문으로 보고, 한도를 넘은 뒤에는 제한된 수의 버퍼 주문만 추가합니다. 버퍼 주문은 가격이 더 내려갈 때 사용자가 참고할 수 있는 예비 주문표 역할을 합니다.

매수 주문의 현금 변화는 다음과 같습니다.

```text
Pool_after_k = Pool_next - cumulativeCost_k
Shares_after_k = Shares + k * minOrderQty
```

### 매도 주문 생성

매도 주문은 상단 밴드(`Band High`)를 기준으로 만들어집니다. 기본 아이디어는 "한 단계씩 팔기 전의 보유 수량으로 나누면, 상단 밴드에 맞는 목표 매도가가 나온다"입니다.

각 매도 단계 `k`에서의 개념 공식은 다음과 같습니다.

```text
sharesBefore_k = Shares - (k - 1) * minOrderQty
SellPrice_k = Band High / sharesBefore_k
Proceeds_k = SellPrice_k * minOrderQty * (1 - feeRate)
```

보유 주식이 없으면 매도 주문은 생성되지 않습니다. 매도는 현금을 소모하지 않고 현금을 늘리는 행위이므로, `Pool_next = 0`이어도 보유 주식이 있다면 매도 주문표는 만들 수 있습니다.

매도 주문의 현금 변화는 다음과 같습니다.

```text
Pool_after_k = Pool_next + cumulativeProceeds_k
Shares_after_k = Shares - k * minOrderQty
```

매수와 매도의 공통 원칙은 다음과 같습니다.

- 주문 가격은 항상 0보다 커야 합니다.
- 주문 수량은 최소 주문 수량 이상이어야 합니다.
- 수수료를 반영한 비용 또는 수령액이 0 이하가 되면 유효한 주문으로 보지 않습니다.
- 주문표는 무한히 만들지 않고 제한된 단계까지만 생성합니다.

## 5. 예외 처리 (Edge Cases)

### 현금 잔고 부족(Insufficient Pool)

인출 또는 기타 현금 감소가 있는 경우, 다음 현금 보관함이 음수가 될 수 있습니다.

```text
Pool_next = Pool_current + Adjustment
```

아래 조건이면 사이클 전환은 차단되어야 합니다.

```text
Pool_next < 0
```

이 상태에서 목표 가치, 밴드, 주문표를 계속 계산하면 음수 현금 장부가 생기고 매수/매도 주문표의 의미도 깨집니다. 따라서 현금 부족은 수학 계산 후반부의 보정 문제가 아니라, 다음 장부를 만들기 전에 실패해야 하는 조건입니다.

`Pool_next = 0`은 허용됩니다. 이때 매수 주문은 만들 수 없지만, 보유 주식이 있다면 매도 주문은 만들 수 있습니다.

### 거치식(현금 변동 0)

거치식의 핵심은 외부 현금 흐름이 없다는 점입니다.

```text
Adjustment = 0
Pool_next = Pool_current
```

따라서 거치식에서는 다음 목표 가치가 오직 기존 현금 보관함의 두께와 성장 규칙에 의해 결정됩니다.

```text
CR = Pool_current / V_current
```

일반 모드라면:

```text
V_next = V_current + Pool_current * g
```

안전 모드라면:

```text
V_next = V_current * (1 + g * CR^2)
```

거치식은 적립식보다 단순하지만, 같은 밴드와 주문 생성 원리를 사용합니다. 차이는 새 현금이 들어오지 않기 때문에 `Pool_next`가 그대로 유지되고, 다음 주문표도 기존 현금 보관함의 범위 안에서만 만들어진다는 점입니다.

### 적립식과 거치식의 공통 불변식

TVC의 모든 모드는 아래 불변식을 공유합니다.

```text
V_current > 0
Pool_current >= 0
Pool_next >= 0
Shares >= 0
Band Low > 0
Band High > 0
Order Price > 0
```

이 불변식은 전략의 설명 문구를 만들 때도 중요합니다. TVC는 "무조건 매수하는 적립식"도 아니고 "현금이 떨어져도 계속 목표 가치를 밀어 올리는 공격형 전략"도 아닙니다. 목표 가치, 현금 보관함, 밴드, 주문표가 한 장부 안에서 일관되게 움직이도록 설계된 가치 경로 추종 전략입니다.
