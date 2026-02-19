## 토스 미니앱 출시 체크리스트 (복붙용)

### 1. 앱인토스 콘솔 설정

- **앱 기본 정보**
  - 앱 이름(한글/영문), 아이콘, 간단 소개, 카테고리 입력
- **법적 문서 URL 등록**
  - 이용약관: `https://btd-alarm2.pages.dev/#terms`
  - 개인정보처리방침: `https://btd-alarm2.pages.dev/#privacy`
  - 환불규정: `https://btd-alarm2.pages.dev/#terms` (약관 내 포함)
- **고객센터 / 문의 채널**
  - 이메일, 문의용 링크(노션/폼), 기타 연락 수단 입력
- **권한 / 데이터 사용 목적**
  - 토스 로그인: 사용자 인증 및 식별
  - 결제: 구독 상태 관리 및 유료 기능 제공
  - 기타 사용하는 API가 있으면, 목적을 한 줄씩 정리

---

### 2. 프론트엔드 – `@apps-in-toss/web-framework` + TDS 도입

- **패키지 설치 (프로젝트 루트)**

```bash
npm install @apps-in-toss/web-framework @toss/tds-mobile
```

- **앱인토스 설정 파일 생성**

```bash
npx ait init
```

- 프롬프트 응답
  - `web-framework` 선택
  - `appName`: 앱인토스 콘솔에 만든 앱 이름과 **완전히 동일**
  - dev 명령어: `vite`
  - build 명령어: `vite build`
  - 포트: `5173`

- **`granite.config.ts` 확인/수정**
  - `appName`: 앱인토스 콘솔과 동일
  - `brand.displayName`: 미니앱 한글 이름
  - `brand.primaryColor`: 브랜드 메인 색 (`#3182F6` 등)
  ★★ `brand.icon`: 실제 운영 배포 시에는 콘솔에 업로드된 CDN URL로 이 값만 교체
  ★★ `web.host`: 개발 시 `localhost`, 실기기 테스트 시 내부 IP 로 변경

- **주요 화면을 TDS 컴포넌트로 단계적 치환**
  - 최소 대상:
    - 메인 화면
    - 로그인/온보딩 화면
    - 결제/구독 화면
    - 설정/탈퇴 관련 화면
  - 공통 레이아웃, 버튼, 폼, 모달 등은 `@toss/tds-mobile` 기반으로 통일

---

### 3. BFF(server) – 환경 변수 및 콜백 세팅

- **Railway Variables / 서버용 `.env`**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `TOSS_CLIENT_CERT`
  - `TOSS_CLIENT_KEY`
  ★★- `TOSS_CLIENT_ID`
  - `TOSS_WEBHOOK_USER` (회원 탈퇴 콜백용 Basic Auth 아이디)
  - `TOSS_WEBHOOK_PASSWORD` (회원 탈퇴 콜백용 Basic Auth 비밀번호)

- **회원 탈퇴 콜백 URL**
  - `https://[Railway_서비스_도메인]/webhook/toss-member-withdrawal`

- **Basic Auth 값 생성 절차**
  1. 아이디/비밀번호 정하기
  2. `"아이디:비밀번호"` 문자열 만들기
  3. 브라우저 콘솔에서 실행

```javascript
btoa("아이디:비밀번호")
```

  4. 결과 문자열(따옴표 제외)을 토스 콘솔의 “Basic Auth 헤더 값” 칸에 입력
  5. Railway 에는 **원본 아이디/비밀번호**를 아래 변수에 저장
     - `TOSS_WEBHOOK_USER` = 아이디
     - `TOSS_WEBHOOK_PASSWORD` = 비밀번호

- **회원 탈퇴 콜백 플로우**
  - 토스 → `POST /webhook/toss-member-withdrawal`
    - Header: `Authorization: Basic {Base64값}`
    - Body: `{ "user_id": "Supabase 사용자 UUID" }`
  - BFF:
    - Basic Auth 검증
    - `user_id` 기준 관련 데이터 삭제 (`portfolio_history`, `portfolios` 등)
    - `supabaseAdmin.auth.admin.deleteUser(user_id)` 호출

---

### 4. 프론트–BFF–토스 시나리오 문서화

- **로그인 시나리오**
  - 토스 로그인 → BFF 토큰 교환 → Supabase 세션 설정 → 메인 진입
- **결제 시나리오**
  - 결제 버튼 → 토스 결제 → BFF `/payment/toss/verify` → 구독 상태 변경
  - 실패/취소/중복 결제 케이스 처리 및 에러 메시지/로그 정책 정리
- **탈퇴 시나리오**
  - 미니앱 “회원 탈퇴” 버튼 → 토스 콜백 → BFF 계정/데이터 삭제
  - 탈퇴 후 사용자에게 보여줄 최종 화면/문구 정의
- 위 3가지 플로우를 **시퀀스 다이어그램 + 스크린샷**으로 한 문서에 정리

---

### 5. 테스트 및 심사 준비 체크리스트

- **실행 테스트 (샌드박스앱 / 토스 앱)**
  - 로그인: 성공/실패 케이스
  - 결제: 첫 결제 / 재결제 / 취소 / 실패
  - 탈퇴: 콜백이 BFF까지 도달하는지 로그로 확인

- **화면 캡처 + 설명**
  - 각 주요 화면에 대해:
    - “이 화면에서 무엇을 하는지”
    - “어떤 토스 API를 사용하는지” 한 줄 설명

- **정책 일치 여부 재검토**
  - 실제 기능과 개인정보 처리방침/이용약관 내용이 충돌하는 부분 없는지 확인

- **에러/예외 케이스 메시지 통일**
  - 로그인 실패, 결제 실패, 네트워크 오류, 콜백 실패 등
  - 사용자에게 보여줄 문구를 한 곳에서 관리할 수 있도록 정의

---

### 6. BFF 회원 탈퇴 콜백 – 리팩토링 예시 코드

> 구조 참고용 코드이며, 실제 프로젝트에 맞춰 경로/타입은 조정해서 사용.

```ts
// server/src/config/env.ts
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Env] Missing required environment variable: ${name}`);
  }
  return value;
}

export const TOSS_WEBHOOK_USER = getRequiredEnv("TOSS_WEBHOOK_USER");
export const TOSS_WEBHOOK_PASSWORD = getRequiredEnv("TOSS_WEBHOOK_PASSWORD");
```

```ts
// server/src/utils/basicAuth.ts
import { TOSS_WEBHOOK_USER, TOSS_WEBHOOK_PASSWORD } from "../config/env";

export function validateBasicAuthHeader(authHeader?: string): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;

  const base64 = authHeader.slice("Basic ".length).trim();
  try {
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const [user, password] = decoded.split(":");

    if (!user || !password) return false;
    return user === TOSS_WEBHOOK_USER && password === TOSS_WEBHOOK_PASSWORD;
  } catch {
    return false;
  }
}
```

```ts
// server/src/routes/tossWebhook.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../supabaseClient";
import { validateBasicAuthHeader } from "../utils/basicAuth";

interface TossWithdrawalBody {
  user_id?: string;
}

async function deleteUserData(userId: string, fastify: FastifyInstance) {
  const { error: historyError } = await supabaseAdmin
    .from("portfolio_history")
    .delete()
    .eq("user_id", userId);

  if (historyError) {
    fastify.log.warn(
      { err: historyError, userId },
      "[TossWebhook] Failed to delete portfolio_history (continuing)",
    );
  }

  const { error: portfolioError } = await supabaseAdmin
    .from("portfolios")
    .delete()
    .eq("user_id", userId);

  if (portfolioError) {
    fastify.log.error(
      { err: portfolioError, userId },
      "[TossWebhook] Failed to delete portfolios",
    );
    throw new Error("Failed to delete portfolios");
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteError) {
    fastify.log.error(
      { err: deleteError, userId },
      "[TossWebhook] Failed to delete auth user",
    );
    throw new Error("Failed to delete auth user");
  }
}

export async function tossWebhookRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/webhook/toss-member-withdrawal",
    async (
      request: FastifyRequest<{ Body: TossWithdrawalBody }>,
      reply: FastifyReply,
    ) => {
      if (!validateBasicAuthHeader(request.headers.authorization)) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const userId = request.body?.user_id?.trim();
      if (!userId) {
        return reply.code(400).send({
          error:
            'Missing user_id in request body. Expected { "user_id": "Supabase user UUID" }.',
        });
      }

      try {
        await deleteUserData(userId, fastify);

        fastify.log.info(
          { userId },
          "[TossWebhook] Account deleted successfully via Toss member withdrawal",
        );

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error(
          { err: error, userId },
          "[TossWebhook] Unhandled error while deleting account",
        );
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );
}
```

