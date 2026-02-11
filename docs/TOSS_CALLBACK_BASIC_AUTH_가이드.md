# 토스 콜백 URL & Basic Auth 설정 가이드 (비개발자용)

미니앱에서 **회원 탈퇴** 요청 시, 토스가 우리 서버로 알려주기 위한 **콜백 URL**과 **Basic Auth 헤더 값**을 설정하는 방법을 단계별로 안내합니다.

---

## 1. 콜백 URL이 뭔가요?

- **콜백 URL** = “회원이 미니앱에서 탈퇴를 요청했을 때, 토스가 **우리 서버로 요청을 보낼 주소**”입니다.
- 우리 서버(Railway BFF)에 이미 아래 주소로 받을 준비가 되어 있습니다.

**사용할 콜백 URL (Railway 배포 주소 기준):**

```
https://[여기에_Railway에서_만든_서비스_도메인]/webhook/toss-member-withdrawal
```

예시: Railway에서 만든 URL이 `https://btd-alarm-bff.railway.app` 이라면

- **콜백 URL** = `https://btd-alarm-bff.railway.app/webhook/toss-member-withdrawal`

---

## 2. Basic Auth 헤더 값이 뭔가요?

- 토스가 우리 서버를 호출할 때 **“우리 서버가 정한 비밀값”**을 헤더에 넣어 보냅니다.
- 우리는 그 값이 맞는지 확인해서, **토스에서 온 요청인지** 구분합니다.
- 토스 콘솔에는 **“Basic Auth 헤더 값”** 한 칸에 **아래 3단계에서 만든 “최종 문자열”**을 넣으면 됩니다.

---

## 3. Basic Auth “헤더 값” 만드는 방법 (3단계)

### 3-1. 아이디와 비밀번호 정하기

- **아이디**: 영문+숫자 등 (예: `btd_toss_webhook`)
- **비밀번호**: 꼭 **20자 이상**, 영문·숫자·특수문자 섞어서 **본인만 아는 값**으로 정하세요.

예시 (실제로는 본인이 다른 값으로 설정):

- 아이디: `btd_toss_webhook`
- 비밀번호: `Abc123!@#SecureWebhook456`

---

### 3-2. “아이디:비밀번호” 한 줄로 붙이기

- **콜론(:)** 하나 사이에 아이디와 비밀번호를 붙입니다.
- **공백 넣지 마세요.**

예시:

```
btd_toss_webhook:Abc123!@#SecureWebhook456
```

---

### 3-3. Base64로 인코딩하기 (최종 “헤더 값”)

이 한 줄을 **Base64**로 변환한 결과가, 토스에 입력할 **Basic Auth 헤더 값**입니다.

**방법 A – 브라우저에서 (가장 쉬움)**

1. 브라우저에서 **F12** 눌러 개발자 도구를 엽니다.
2. **Console** 탭을 클릭합니다.
3. 아래 한 줄을 **한 번에** 붙여넣고, **아이디·비밀번호만 본인 값으로 바꾼 뒤** Enter 치세요.

```javascript
btoa("btd_toss_webhook:Abc123!@#SecureWebhook456")
```

4. 따옴표 안을 **3-2에서 만든 `아이디:비밀번호`** 로 바꾸면 됩니다.  
   예: `btoa("btd_toss_webhook:본인비밀번호")`
5. Enter를 누르면 **따옴표로 감싸진 긴 문자열**이 나옵니다.  
   예: `"YnRkX3Rvc3Nfd2ViaG9vazpBYmMxMjMhQCNTZWN1cmVXZWJob29rNDU2"`
6. **따옴표를 제외한 안쪽 문자열 전체**가 “Basic Auth 헤더 값”입니다.  
   → 이걸 복사해서 토스 콘솔과 Railway에 사용합니다.

**방법 B – 인터넷 Base64 사이트**

1. 검색창에 **“base64 encode”** 로 검색해 인코딩 사이트 하나를 엽니다.
2. 입력 칸에 **아이디:비밀번호** 한 줄(예: `btd_toss_webhook:Abc123!@#SecureWebhook456`)을 붙여넣습니다.
3. **Encode** 버튼을 누르면 나오는 결과 문자열이 **Basic Auth 헤더 값**입니다.  
   (공백/줄바꿈 없이 한 줄로 나오는 값만 복사하세요.)

---

## 4. Railway에 넣을 값

- 콜백을 받는 서버(Railway)에서 **Basic Auth 검증**에 쓸 값입니다.
- **아이디·비밀번호를 그대로** 넣어야 하므로, **Base64가 아니라** 3-1에서 정한 **아이디**와 **비밀번호**를 각각 넣습니다.

1. **Railway** 대시보드 → 해당 프로젝트 → **Variables** 탭으로 갑니다.
2. 아래 두 개를 **추가**합니다.

| 변수 이름 | 값 |
|-----------|-----|
| `TOSS_WEBHOOK_USER` | 3-1에서 정한 **아이디** (예: `btd_toss_webhook`) |
| `TOSS_WEBHOOK_PASSWORD` | 3-1에서 정한 **비밀번호** (예: `Abc123!@#SecureWebhook456`) |

3. 저장 후, 서버가 다시 배포되면 적용됩니다.

---

## 5. 토스 콘솔에 입력할 값

1. **앱인토스(토스 미니앱) 개발자 콘솔**에 로그인합니다.
2. 회원 탈퇴/콜백 설정이 있는 메뉴를 찾습니다.  
   (이름은 “회원 탈퇴 콜백”, “미니앱 콜백 URL”, “웹훅 URL” 등일 수 있습니다.)
3. 아래 두 가지를 입력합니다.

| 입력 항목 | 넣을 값 |
|-----------|--------|
| **콜백 URL** | `https://[Railway_서비스_도메인]/webhook/toss-member-withdrawal`  
  (1번에서 확인한 Railway 주소로 채우기) |
| **Basic Auth 헤더 값** (또는 “Authorization: Basic” 뒤에 들어갈 값) | 3-3에서 만든 **Base64 문자열** (따옴표 제외, 한 줄 전체) |

- 토스에서 “Authorization: Basic”을 이미 붙여 주는 경우 → **Base64 문자열만** 넣으면 됩니다.
- “Basic Auth 헤더 값” 한 칸만 있는 경우 → 역시 **Base64 문자열만** 넣으면 됩니다.

---

## 6. 한 번에 정리

| 구분 | 어디에 | 뭘 넣나요 |
|------|--------|-----------|
| **콜백 URL** | 토스 콘솔 | `https://[Railway도메인]/webhook/toss-member-withdrawal` |
| **Basic Auth 헤더 값** | 토스 콘솔 | `아이디:비밀번호` 를 Base64로 인코딩한 **문자열** (따옴표 제외) |
| **TOSS_WEBHOOK_USER** | Railway Variables | 위에서 쓴 **아이디** (Base64 아님) |
| **TOSS_WEBHOOK_PASSWORD** | Railway Variables | 위에서 쓴 **비밀번호** (Base64 아님) |

---

## 7. 참고 – 토스가 보내는 데이터

- 회원 탈퇴 시 토스는 우리 서버에 **POST** 요청을 보내며,  
  body에 **우리 서비스의 사용자 ID(Supabase user UUID)** 를 넣어줘야 계정 삭제가 됩니다.
- 토스 문서에 “회원 탈퇴 콜백 요청 스펙”이 있다면, **body에 `user_id`(Supabase 사용자 UUID)를 포함**해 달라고 요청하면 됩니다.  
  우리 서버는 `{ "user_id": "uuid-문자열" }` 형식을 받도록 되어 있습니다.

이렇게 설정하면, 토스에 입력할 **콜백 URL**과 **Basic Auth 헤더 값**을 올바르게 쓰실 수 있습니다.
