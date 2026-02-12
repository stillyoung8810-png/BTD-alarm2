# 번들 분석 및 크기 회귀 검증

Vite 프로덕션 빌드의 청크 구성을 시각화하고, **크기 회귀 없음** 기준으로 검증하기 위한 절차입니다.

## 전제 조건

- 일반 빌드(`npx vite build` 또는 `npm run build`)가 성공하는 환경에서 실행하세요.
- `postcss.config.js` 를 사용하는 경우 `@tailwindcss/postcss`, `autoprefixer` 등 필요한 devDependency 가 설치되어 있어야 합니다.

## 실행 방법

```bash
npm run build:analyze
```

- `vite build --mode analyze` 를 실행하며, 일반 빌드와 동일한 `manualChunks`·`chunkSizeWarningLimit` 설정이 적용됩니다.
- 빌드 완료 후 **`dist/stats.html`** 이 생성됩니다.
- 브라우저에서 `dist/stats.html` 을 열어 트리맵으로 청크별 크기·구성을 확인합니다.

## 크기 회귀 검증 기준

변경(PR/배포 전) 시 아래를 확인합니다.

1. **빌드 로그**
   - `npx vite build` 또는 `npm run build:analyze` 실행 시 **경고 0건** (dynamic/static import 혼합, 950kB 초과 청크 등).
2. **stats.html**
   - **vendor-core**, **vendor-charts**, **vendor-db**, **vendor-icons**, **firebase** 등 기대한 청크가 분리되어 있는지.
   - 새로 추가한 의존성이나 페이지가 **초기 로드 필수 청크(index)** 에 불필요하게 포함되지 않았는지.
3. **수치 비교 (선택)**
   - 이전 배포 또는 main 브랜치 기준으로 `dist/stats.html` 또는 빌드 로그의 청크 크기를 저장해 두고, 변경 후 동일 조건으로 빌드해 비교.
   - 특히 **index-*.js** 합계, **vendor-*** 합계가 비약적으로 증가하지 않았는지** 확인.

## 참고

- [CODE_SPLITTING_STRATEGY.md](./CODE_SPLITTING_STRATEGY.md) — lazy 경계·manualChunks 정책.
- [VENDOR_CHUNK_OPTIMIZATION_PLAN.md](./VENDOR_CHUNK_OPTIMIZATION_PLAN.md) — 청크 최적화 계획.
