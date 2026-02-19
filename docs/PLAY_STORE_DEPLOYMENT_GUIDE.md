# 플레이스토어 배포 가이드 (제작비용 최소·안전·효율)

> 현재 프로젝트는 **React + Vite 웹앱**이며 `https://btd-alarm2.pages.dev`에 배포되어 있습니다.  
> 이 문서는 **추가 제작비용 없이**, **안전하고**, **효율적으로** 플레이스토어에 올리는 방법을 정리합니다.

---

## 권장 방식: TWA (Trusted Web Activity)

### 왜 TWA인가?

| 항목 | 설명 |
|------|------|
| **제작비용** | **0원** — 별도 네이티브 앱 개발 없음. 기존 웹앱을 그대로 사용합니다. |
| **유일한 비용** | Google Play 개발자 등록 **1회 25달러** (약 3.5만 원) — 플레이스토어 출시를 위한 공식 비용입니다. |
| **안전성** | Google이 권장하는 방식. Chrome 기반으로 동작해 보안·업데이트가 Chrome과 동일하게 적용됩니다. |
| **효율성** | **단일 코드베이스** 유지. 웹만 배포하면 앱도 자동으로 최신 상태. 앱 전용 유지보수 불필요. |

TWA는 **기존 웹앱 URL**을 안드로이드 앱처럼 감싸서 플레이스토어에 올리는 방식입니다.  
앱을 열면 실제로는 Chrome(Trusted Web Activity)으로 우리 웹사이트가 열리므로, 웹만 수정해도 앱 사용자에게 바로 반영됩니다.

---

## 사전 요구사항

1. **HTTPS 웹사이트**  
   - ✅ 이미 보유: `https://btd-alarm2.pages.dev`

2. **웹 앱 매니페스트 (PWA 요건)**  
   - TWA가 앱으로 인식하려면 `manifest.json`이 필요합니다.  
   - `name`, `short_name`, `start_url`, `display`(standalone 권장), `icons` 등 포함.  
   - 프로젝트에 매니페스트가 없으면 아래 “1단계”에서 추가합니다.

3. **Google Play 개발자 계정**  
   - [Google Play Console](https://play.google.com/console) 가입 후 **1회 25달러** 결제.

---

## 배포 절차 요약

### 1단계: 웹 앱 매니페스트 추가 (한 번만)

프로젝트 `public/` 폴더에 `manifest.json`을 두고, `index.html`의 `<head>`에 링크합니다.

- **위치**: `public/manifest.json` — **이미 프로젝트에 추가되어 있습니다.**
- **필수 필드**: `name`, `short_name`, `start_url`, `display`, `icons` (최소 192x192, 512x512)
- **start_url**: `https://btd-alarm2.pages.dev/` (실제 배포 URL과 동일하게)

현재 매니페스트는 `favicon.svg`를 아이콘으로 사용합니다. Play Console 또는 Bubblewrap에서 **192x192, 512x512 PNG** 아이콘을 요구하면, 해당 크기의 PNG를 만들어 `public/`에 넣고 `manifest.json`의 `icons` 배열에 추가하면 됩니다.

이렇게 하면 PWA/TWA 요구사항을 만족하고, 나중에 “홈 화면에 추가” 시에도 동일 설정을 사용할 수 있습니다.

### 2단계: Bubblewrap으로 TWA 프로젝트 생성 (무료)

[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)은 Google이 제공하는 CLI로, TWA 기반 안드로이드 앱을 만들어 줍니다.

```bash
# Bubblewrap 설치 (Node.js 필요)
npm install -g @bubblewrap/cli

# TWA 프로젝트 초기화 (대화형으로 URL, 패키지명 등 입력)
bubblewrap init --manifest=https://btd-alarm2.pages.dev/manifest.json
```

- **Application URL**: `https://btd-alarm2.pages.dev`
- **Package name**: 예) `com.yourcompany.buythedip` (고유한 패키지명)
- **매니페스트 URL**: `https://btd-alarm2.pages.dev/manifest.json`  
  → 1단계에서 매니페스트를 배포한 뒤 진행해야 합니다.

생성된 안드로이드 프로젝트에서 서명 설정 후 빌드하면 **AAB(Android App Bundle)** 파일이 나옵니다.

### 3단계: 서명 키 생성 및 AAB 빌드

- **디버그/테스트**: Bubblewrap 기본 설정으로 빌드 가능.
- **스토어 제출용**: keystore를 만들어 서명한 뒤, Play Console에 “앱 서명”용 업로드 키를 등록합니다.

```bash
# Bubblewrap으로 빌드 (서명 설정은 초기화 시 또는 설정 파일에서)
bubblewrap build
```

생성된 `.aab` 파일을 Play Console에서 “앱 번들 업로드”로 제출합니다.

### 4단계: Play Console에서 앱 등록 및 출시

1. Play Console에서 새 앱 생성.
2. 스토어 등록정보(제목, 설명, 스크린샷, 개인정보처리방침 등) 작성.  
   - 이용약관/개인정보처리방침은 이미 `docs/TOSS_MINIAPP_LAUNCH_CHECKLIST.md`에 있는 URL(`https://btd-alarm2.pages.dev/#terms`, `#privacy`)을 그대로 사용 가능.
3. “프로덕션” 또는 “테스트” 트랙에 AAB 업로드 후 검토 요청.

---

## 비용·리스크 정리

| 항목 | 내용 |
|------|------|
| **개발 비용** | 0원 — TWA는 기존 웹을 감싸기만 하므로 별도 앱 개발 없음. |
| **도구 비용** | 0원 — Bubblewrap·Android SDK 등 무료. |
| **플레이스토어** | 1회 25달러 (Google 정책). |
| **호스팅** | 현재와 동일 (예: Cloudflare Pages 무료 플랜 유지 가능). |
| **보안** | TWA는 Chrome 보안 모델 사용. 웹만 안전하면 앱도 동일. |
| **유지보수** | 웹 한 코드베이스만 관리. 앱은 재빌드만 필요 시(패키지명/아이콘 변경 등)에만. |

---

## 대안과 비교

| 방식 | 제작비용 | 안전성 | 효율성 | 비고 |
|------|----------|--------|--------|------|
| **TWA (Bubblewrap)** | 없음 | 높음 (Google 권장) | 높음 | **권장** — 웹 그대로 사용, 단일 코드베이스. |
| **Capacitor** | 없음 | 높음 | 중간 | WebView 래핑. 나중에 네이티브 플러그인 필요 시 검토. |
| **React Native 등 재개발** | 높음 | 높음 | 낮음 | 새 코드베이스·유지보수 부담. 현재 요구사항에는 비효율. |

현재처럼 **이미 웹으로 서비스 중**이면 TWA가 제작비용·안전성·효율 모두에서 가장 적합합니다.

---

## 체크리스트

- [x] `public/manifest.json` 추가 및 `index.html`에 `<link rel="manifest" href="/manifest.json">` 연결 (완료)
- [ ] `https://btd-alarm2.pages.dev/manifest.json` 배포 확인
- [ ] Bubblewrap 설치 및 `bubblewrap init` (매니페스트 URL로 초기화)
- [ ] 서명 키 생성 및 AAB 빌드
- [ ] Google Play 개발자 등록 (1회 25달러)
- [ ] Play Console에서 앱 생성, 스토어 정보·정책 URL 입력, AAB 업로드 후 출시

이 순서대로 진행하면 **제작비용 없이**, **안전하고**, **효율적으로** 플레이스토어에 애플리케이션을 배포할 수 있습니다.
