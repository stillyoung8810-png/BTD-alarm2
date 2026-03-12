# 토스 스마트 메시지(기능성 푸시) 개발 계획서

## 1. 리뷰 결과

### Critical

1. **현재 계획서는 `TossProvider.sendMessage()`를 누가, 어디서 호출할지 빠져 있습니다.**  
   지금 알람 오케스트레이션은 `supabase/functions/check-and-trigger-alarms` → `supabase/functions/send-alarm` 경로인데, `TossProvider.ts`는 Node/Fastify BFF에 있습니다.  
   즉, **mTLS가 필요한 토스 푸시는 Supabase Edge에서 직접 끝낼 수 없고, BFF 라우트를 새로 두어 Edge가 내부 호출해야 합니다.**

2. **`sent_alarms.channel` 제약에 `toss_push`가 없습니다.**  
   현재 체크는 `('fcm', 'telegram')`만 허용하므로, 토스 푸시 이력을 남기려는 순간 DB에서 막힙니다.

3. **중복 방지 로직은 현재의 “슬롯당 1회 시도” 정책을 기준으로 이해해야 합니다.**  
   `check-and-trigger-alarms`는 성공/실패와 무관하게 해당 시간 슬롯에 발송 이력이 있으면 다시 보내지 않습니다.  
   이번 토스 푸시 도입도 **재시도 없이 1회 발송으로 종료**하는 현재 정책을 그대로 따릅니다.

### High

4. **채널 선택 규칙이 없습니다.**  
   - 어떤 유저에게 `toss_push` / `telegram` / `fcm`을 언제 보내는지가 명확히 정의돼야 합니다.  
   - 특히 이번 스펙에서는 **`toss_user_key`가 있는 모든 유저(무료/유료 포함)에 토스 푸시를 보내고**, 유료+텔레그램 연결 유저에게는 **토스 푸시와 텔레그램을 모두 발송**해야 합니다.

5. **내부 인증 설계가 빠져 있습니다.**  
   Edge → BFF 내부 호출에는 반드시 shared secret 또는 service auth가 필요합니다. 기존 `INTERNAL_ALARM_SECRET` 패턴을 재사용하는 쪽이 유지보수성이 좋습니다.

### Medium

7. **템플릿/컨텍스트 계약이 문서화되지 않았습니다.**  
   `templateSetCode`, `context` 키(`date`, `time`, `screenName` 등), 그리고 **단일 템플릿 코드 `btdalarm-push_msg`** 사용 규칙이 빠져 있습니다.

8. **테스트 메시지 API는 QA 전용으로 분리되어야 합니다.**  
   운영 경로와 섞으면 유지보수성과 사고 가능성이 나빠집니다. `sendTestMessage`는 별도 helper/route로 두는 것이 안전합니다.

9. **관찰 가능성(로그/메트릭/상태 저장) 범위가 불충분합니다.**  
   최소한 `user_id`, `toss_user_key(masked)`, `templateSetCode`, `resultType`, `sentPushCount`, `reachFailReason`, `correlationId`는 남겨야 장애 분석이 가능합니다.

---

## 2. 토스 가이드라인 확인 내용

### 2.1 스마트 메시지 기본 규격

- Base URL: `https://apps-in-toss-api.toss.im`
- 단건 발송:
  - `POST /api-partner/v1/apps-in-toss/messenger/send-message`
  - 헤더: `x-toss-user-key` 필수
  - Body: `templateSetCode`, `context`
- 응답:
  - HTTP 200이어도 body의 `resultType`으로 성공/실패를 판단해야 함
  - 실패 시 `error.reason`, `error.errorCode` 확인
  - 성공 시에도 `result.fail.sentPush[].reachFailReason` 같은 부분 실패 정보 확인 필요

### 2.2 QA 관점에서 구현에 반드시 반영할 것

- 템플릿 변수 누락 방지
- 제목 13자, 본문 20자 권장
- 발송 결과 카운트/실패 사유 로깅
- 중복 방지 정책을 명확히 유지하고, **실패 시에도 같은 슬롯은 재시도하지 않음**
- 빈도 제한 / 레이트 리밋 대응
- 클릭 시 의도한 URL/딥링크로 진입 가능해야 함

### 2.3 Bulk API

- 공식 bulk 문서 페이지에서 실제 바디 스펙을 확인하지 못했습니다.
- 현재 제품 요구사항은 **알람 슬롯별 단건 발송**만으로 충분하며, 대량/마케팅 발송은 범위 밖입니다.
- 따라서 이번 프로젝트에서는 **bulk API를 사용하지 않고, 단건 발송(`sendMessage`)만 구현·운영**합니다.

---

## 3. 최종 아키텍처 결정

### 3.1 원칙

- **토스 API 호출은 반드시 BFF(Node/Fastify)에서만 수행**
- **스케줄링/알람 후보 계산은 기존 Supabase Edge 유지**
- **알람 채널 분기는 기존 `send-alarm`에서 수행**
- 임시/운영/QA 경로를 섞지 않음

### 3.2 호출 흐름

1. `check-and-trigger-alarms`
   - 시간 슬롯 후보를 계산
   - 기존처럼 `send-alarm` 호출

2. `send-alarm`
   - `get_alarm_payload`로 `profile`, `summary_text`, `fcm_tokens` 조회
   - 사용자 상태에 따라 채널 분기
   - 무료 + 토스 로그인 사용자이면 **BFF 내부 라우트** 호출
   - 무료 + 웹 사용자이면 기존 FCM 발송
   - 유료 사용자는 기존 Telegram 유지

3. `server/src/routes/tossSmartMessageRoute.ts` (신규)
   - 내부 secret 검증
   - `user_id`로 `user_profiles.toss_user_key` 조회
   - `TossProvider.sendMessage()` 호출
   - 결과를 JSON으로 반환

### 3.3 채널 선택 규칙 (최종)

- **`toss_user_key` 있음 (무료/유료 모두)**  
  - 토스 스마트 메시지(토스 푸시 + 인앱 알림) 발송 시도  
  - `sent_alarms.channel = 'toss_push'` 로 이력 기록
- **유료 사용자 + 텔레그램 연결됨**  
  - 위 토스 푸시와 **텔레그램 알림을 모두 발송**  
  - `sent_alarms`에 `toss_push`와 `telegram` 두 줄 이력 기록
- **`toss_user_key` 없음 + 웹 사용자**  
  - 기존 FCM 경로 유지 (`channel = 'fcm'`)

이 규칙은 **티어(무료/유료)와 무관하게 토스 로그인 유저는 모두 토스 푸시를 받는다**는 요구사항을 반영합니다.

---

## 4. 구현 범위

### 4.1 이번에 수정할 파일

- `server/src/toss/TossProvider.ts`
- `server/src/routes/tossSmartMessageRoute.ts` 신규
- `server/src/index.ts`
- `supabase/functions/send-alarm/index.ts`
- `supabase/migrations/*_extend_sent_alarms_for_toss_push.sql` 신규
- `docs/TOSS_SMART_MESSAGE_PLAN.md` (현재 문서)

### 4.2 이번에 수정하지 않을 파일

- `check-and-trigger-alarms`의 스케줄 구조 자체
- 프론트엔드 알림 UI
- Telegram 발송 로직
- FCM 토큰 저장 구조

---

## 5. 데이터/스키마 변경

### 5.1 `sent_alarms.channel` 확장

현재:

```sql
channel text NOT NULL CHECK (channel IN ('fcm', 'telegram'))
```

변경 후:

```sql
channel text NOT NULL CHECK (channel IN ('fcm', 'telegram', 'toss_push'))
```

### 5.2 중복 방지 정책 (유지)

현재 `check-and-trigger-alarms`는 `sent_alarms`를 조회해 **해당 시간 슬롯에 이미 어떤 채널로든 발송 시도한 적이 있는지**를 판단하고, 있으면 재발송을 하지 않습니다.  
이는 의도적으로 **“슬롯 단위로 1회만 발송하고, 성공/실패와 관계없이 재시도하지 않는다”**는 정책입니다.

토스 푸시 도입 이후에도 이 정책을 그대로 유지합니다.

- 중복 방지 조회 로직은 현재 방식 그대로 유지하며, 별도의 성공 상태 필터를 추가하지 않습니다.  
- 장애/해당 시점 네트워크 오류가 있어도, 같은 슬롯에 대해 토스 푸시를 다시 보내지 않습니다.  
- 토스 스마트 메시지의 rate limit 및 API 비용을 고려한 **쿨한 1회 발송 정책**입니다.

---

## 6. 서버 구현 상세

### 6.1 `TossProvider.ts`

이미 추가된 방향은 맞지만, 최종 기준은 아래입니다.

#### 유지할 함수

- `sendMessage(userKey, templateSetCode, context, log)` — **단건 발송 전용**

#### 유지할 구현 원칙

- 헤더는 `x-toss-user-key`
- `resultType !== 'SUCCESS'`이면 실패
- Axios HTTP 에러와 200-body-fail 둘 다 `NormalizedTossError`로 감쌈
- 성공 응답의 `result.fail.sentPush[].reachFailReason`은 로그로 남김

#### 타입 권장안

```ts
export interface SendMessageContext {
  [key: string]: string;
}

export interface SendMessageApiResult {
  msgCount?: number;
  sentPushCount?: number;
  sentInboxCount?: number;
  detail?: { sentPush?: unknown[]; sentInbox?: unknown[] };
  fail?: { sentPush?: Array<{ contentId?: string; reachFailReason?: string }>; sentInbox?: unknown[] };
}

export interface SendMessageSuccess {
  success: true;
  data: SendMessageApiResult;
}

export interface SendMessageFailure {
  success: false;
  error: NormalizedTossError;
}
```

### 6.2 신규 라우트: `server/src/routes/tossSmartMessageRoute.ts`

#### 목적

- Edge Function에서 직접 mTLS를 처리하지 않게 하고
- 내부 호출을 받아 토스 푸시를 발송하는 단일 진입점 제공

#### 엔드포인트

- `POST /internal/toss/messages/send`

#### 요청 바디

```ts
interface InternalTossMessageBody {
  userId: string;
  context: Record<string, string>;
}
```

#### 인증

- 헤더: `x-internal-alarm-secret`
- 서버 env의 `INTERNAL_ALARM_SECRET`와 비교

#### 처리 순서

1. secret 검증
2. body 검증
3. `user_profiles`에서 `toss_user_key` 조회
4. 없으면 400 반환
5. `sendMessage(tossUserKey, 'btdalarm-push_msg', context, request.log)` 호출
6. 성공/실패 JSON 응답

#### 예시 코드

```ts
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../supabaseAdmin';
import { sendMessage } from '../toss/TossProvider';

export async function tossSmartMessageRoutes(fastify: FastifyInstance) {
  fastify.post('/internal/toss/messages/send', async (request, reply) => {
    const secret = request.headers['x-internal-alarm-secret'];
    if (secret !== process.env.INTERNAL_ALARM_SECRET) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const { userId, context } = (request.body ?? {}) as {
      userId?: string;
      context?: Record<string, string>;
    };

    if (!userId || !context || typeof context !== 'object') {
      return reply.code(400).send({ success: false, error: 'Invalid body' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('toss_user_key')
      .eq('id', userId)
      .single();

    if (error || !profile?.toss_user_key) {
      return reply.code(400).send({ success: false, error: 'toss_user_key not found' });
    }

    const out = await sendMessage(
      profile.toss_user_key,
      'btdalarm-push_msg', // 토스 콘솔에 등록된 단일 템플릿 코드 (하이픈+언더바 주의)
      context,
      request.log
    );
    if (!out.success) {
      return reply.code(502).send({ success: false, error: out.error });
    }

    return reply.send({ success: true, data: out.data });
  });
}
```

### 6.3 `server/src/index.ts`

신규 라우트 등록:

```ts
import { tossSmartMessageRoutes } from './routes/tossSmartMessageRoute';
...
await server.register(tossSmartMessageRoutes);
```

---

## 7. `send-alarm` 수정 상세

### 7.1 토스 로그인 사용자 분기 추가

`get_alarm_payload` 결과의 `profile.toss_user_key`, `subscription_tier`, `preferred_language`를 바탕으로:

```ts
const hasTossUserKey = !!profileRow?.toss_user_key;
const shouldSendTossPush = hasTossUserKey;
```

### 7.2 BFF 내부 호출

환경 변수:

- `RAILWAY_BFF_URL`
- `INTERNAL_ALARM_SECRET`

호출 예시:

```ts
const res = await fetch(`${bffBase}/internal/toss/messages/send`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-alarm-secret': internalSecret,
  },
  body: JSON.stringify({
    userId: user_id,
    context: {
      date: alarmTimeLocal ?? alarmTimeKst ?? '',
      screenName: 'markets',
    },
  }),
});
```

### 7.3 이력 기록

토스 푸시 성공/실패 시 `sent_alarms`에 한 줄 추가:

```ts
historyRows.push({
  user_id,
  channel: 'toss_push',
  status: tossPushSent ? 'success' : 'failure',
  error_message: tossPushError ?? null,
  alarm_type: alarmType ?? undefined,
  time_kst: alarmTimeKst ?? undefined,
  time_local: alarmTimeLocal ?? undefined,
  timezone: alarmTimezone ?? undefined,
  local_date: alarmLocalDate ?? undefined,
  payload_snapshot: {
    templateSetCode,
    time_kst: alarmTimeKst,
    time_local: alarmTimeLocal,
    timezone: alarmTimezone,
    local_date: alarmLocalDate,
  },
});
```

### 7.4 반환 정책

- 토스 푸시 성공 시 `success: true`
- 토스 푸시 실패 + 다른 채널도 실패 시 `success: false`
- 내부 호출 실패는 로그에 남기고 `error_message`로 저장

---

## 8. 템플릿/컨텍스트 규약

### 8.1 초기 템플릿 코드

- 단일 템플릿 코드: `btdalarm-push_msg`

### 8.2 context

초기 버전은 최소만 사용:

```json
{
  "date": "2025-01-20 15:30",
  "screenName": "markets"
}
```

원칙:

- `userName`은 보내지 않음
- context 키는 템플릿과 1:1로 맞춤
- 코드에서 하드코딩하지 말고 상수로 관리 가능

---

## 9. 테스트/QA 계획

### 9.1 개발 QA

1. 토스 로그인 사용자로 `toss_user_key` 저장 확인
2. BFF `/internal/toss/messages/send` 단건 호출 확인
3. `resultType = FAIL` 응답 시 502 + 구조화 에러 반환 확인
4. `sent_alarms.channel = 'toss_push'` insert 확인

### 9.2 제품 QA

1. 무료 토스 사용자: 토스 푸시 수신
2. 무료 웹 사용자: 기존 FCM 유지
3. 유료 토스 사용자: 토스 푸시 수신
4. 유료 + 텔레그램 연결 사용자: 토스 푸시와 텔레그램 모두 수신
5. 템플릿 변수 누락 없음
6. 푸시 클릭 시 등록한 이동 URL 정상 진입

---

## 10. 실행 순서

1. `sent_alarms.channel`에 `toss_push` 추가 마이그레이션 작성
2. BFF에 `tossSmartMessageRoute.ts` 추가 및 등록
3. `send-alarm`에 토스 로그인 사용자 분기 + BFF 내부 호출 추가
4. 템플릿 코드 상수(`btdalarm-push_msg`)와 context 정리
5. QA 계정으로 단건 테스트
6. 스케줄러 경로 전체 통합 테스트

---

## 11. 참고 링크

- [스마트 메시지 개발하기](https://developers-apps-in-toss.toss.im/smart-message/develop.html)
- [스마트 메시지 QA](https://developers-apps-in-toss.toss.im/smart-message/qa.html)
- [테스트 메시지 발송](https://developers-apps-in-toss.toss.im/api/sendTestMessage.html)
- [메시지 발송 API](https://developers-apps-in-toss.toss.im/api/sendMessage.html)
- [대량 메시지 API](https://developers-apps-in-toss.toss.im/api/sendBulkMessage.html)
