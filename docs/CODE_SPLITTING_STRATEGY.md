# 코드 스플릿 전략 (Code Splitting Strategy)

Vite 번들 경고 제거 및 초기 로딩/TTI 개선을 위한 라우트·기능 단위 코드 스플릿 정책입니다.

## 경계 정의

### Lazy 로드 대상 (React.lazy + Suspense)

| 대상 | 진입 조건 | fallback |
|------|-----------|----------|
| **Dashboard** | `activeTab === 'dashboard'` 이고 로그인 상태 | "대시보드 로딩 중…" |
| **Backtest** | `activeTab === 'backtest'` | "백테스트 로딩 중…" |
| **QuickInputModal** | `currentQuickInputPortfolio != null` | 짧은 오버레이 "…" |
| **CheckoutModal** | `checkoutPlan != null` | `null` (모달 자체가 열릴 때만 마운트) |

Backtest 내부에서 **BacktestResultsCharts** 는 이미 `React.lazy(() => import('./BacktestResultsCharts'))` 로 로드되며, 해당 탭 진입 시에만 차트 청크가 내려갑니다.

### 정적 로드 유지 (메인 번들)

- **Landing**, **Markets**, **History**, **Pricing**, **Privacy**, **Terms** — 첫 화면 또는 자주 쓰는 탭.
- **AuthModals**, **Footer**, **AlarmModal**, **StrategyCreator**, **PortfolioDetailsModal**, **TradeExecutionModal**, **AIImageInputModal**, **SettlementModals** — 필요 시 추가 lazy 후보로 검토 가능.

## 규칙

1. **무거운 페이지/탭**  
   새로 추가되는 대형 페이지(차트, 리포트, 설정 등)는 기본적으로 `React.lazy` 로 감싸고, 상위에서 `Suspense` + 적절한 fallback UI를 둡니다.

2. **모달**  
   진입 시점에 필수가 아닌 모달(결제, 퀵입력, 실행 등)은 호출부에서 `React.lazy(() => import('./...'))` 로 로드하고, 렌더 시점에 `Suspense` 로 감쌉니다.

3. **데이터 계층**  
   `services/db` 는 UI/훅에서 직접 import 하지 않고, `services/stockService` 의 공개 API만 사용합니다. IndexedDB/Dexie 사용은 stockService 경계 안에만 둡니다.

4. **빌드 검증**  
   `npx vite build` 실행 시 dynamic/static 혼합 경고가 없고, 950kB 초과 청크 수가 최소화되었는지 확인합니다.

5. **번들 분석 및 회귀 검증**  
   `npm run build:analyze` 실행 후 `dist/stats.html` 을 열어 청크 구성을 확인합니다. PR/배포 전에는 **크기 회귀 없음** 기준으로 검증합니다. 자세한 절차는 [BUILD_ANALYZE.md](./BUILD_ANALYZE.md) 를 참고합니다.

## 수동 청크 (manualChunks)

`vite.config.ts` 의 `build.rollupOptions.output.manualChunks` 로 다음을 분리합니다.

- **vendor-core**: react, react-dom, react-router-dom
- **vendor-charts**: recharts
- **vendor-db**: dexie, @supabase/supabase-js
- **vendor-icons**: lucide-react (필요 시)

앱 코드 변경 시에도 vendor 청크 캐시가 유지되도록 하고, 초기 로딩 시 필요한 vendor만 로드되도록 튜닝합니다.

## 참고

- [BUILD_ANALYZE.md](./BUILD_ANALYZE.md) — 번들 분석 실행법 및 크기 회귀 검증 절차.
- [VENDOR_CHUNK_OPTIMIZATION_PLAN.md](./VENDOR_CHUNK_OPTIMIZATION_PLAN.md) — 청크 분리 상세.
- [vite.config.ts](../vite.config.ts) — `manualChunks`, `chunkSizeWarningLimit` 설정.
