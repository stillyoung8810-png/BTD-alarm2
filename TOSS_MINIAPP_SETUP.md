# 토스 미니앱 통합 가이드

## 1단계: esbuild 설치 문제 해결

`@apps-in-toss/web-framework` 설치 전에 esbuild 문제를 해결해야 합니다.

### 해결 방법

```powershell
# 1. node_modules 완전 삭제
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# 2. npm 캐시 정리
npm cache clean --force

# 3. esbuild를 먼저 명시적으로 설치
npm install esbuild --save-dev

# 4. 그 다음 토스 프레임워크 설치
npm install @apps-in-toss/web-framework
```

## 2단계: 토스 앱 초기화

```powershell
# 토스 앱 설정 초기화
npx ait init
```

설정 시 입력할 정보:
- **앱 프레임워크**: `web-framework` 선택
- **앱 이름**: 토스 앱 콘솔에서 설정한 앱 이름과 동일하게 입력
- **개발 모드 명령어**: `vite`
- **빌드 명령어**: `vite build`
- **개발 서버 포트**: `3000` (또는 현재 사용 중인 포트)

## 3단계: 코드 통합

`App.tsx`에 토스 앱 브릿지 초기화 코드가 추가됩니다.

## 4단계: 빌드 및 배포 ; 사업자 등록 후 진행 #########################

```powershell
# 빌드
npm run build

# 토스 앱 배포 (ait CLI 사용)
npx ait deploy
```

## 참고사항

- 토스 앱 콘솔에서 앱을 먼저 생성해야 합니다
- `metadata.json` 파일이 자동으로 업데이트됩니다
- 토스 앱 내에서만 동작하는 기능들이 있습니다 (예: 사용자 인증, 결제 등)
