# IndexedDB 마이그레이션 가이드

## 개요

프로젝트에 Dexie.js를 사용한 IndexedDB 기반 주가 데이터 저장 시스템을 도입했습니다.

## 주요 변경사항

### 1. 새로운 파일

- **`services/db.ts`**: IndexedDB 스키마 정의 및 데이터베이스 유틸리티 함수
  - `StockPriceRecord`: 주가 데이터 인터페이스 (종가, MA, RSI 포함)
  - `StockMetadata`: 종목별 메타데이터 인터페이스
  - `StockDatabase`: Dexie 데이터베이스 클래스

### 2. 수정된 파일

- **`services/stockService.ts`**: IndexedDB 우선 사용으로 전면 수정
  - `loadInitialStockData()`: 초기 데이터 로딩 (240일치)
  - `updateLatestStockData()`: 부분 업데이트 (최신 1일치)
  - `fetchStockPrices()`: IndexedDB 우선 사용
  - `fetchStockPriceHistory()`: IndexedDB 우선 사용
  - `calculateTechnicalIndicators()`: IndexedDB 우선 사용 및 계산값 저장

- **`App.tsx`**: 초기 데이터 로딩 추가

## 데이터 흐름

### 초기 로딩 (앱 시작 시)

```
1. App.tsx 마운트
   └─> loadInitialStockData() 호출
       └─> 각 종목별로:
           ├─> IndexedDB에 오늘 날짜 데이터 있는지 확인
           ├─> 없으면 Supabase에서 240일치 가져오기
           ├─> MA20, MA60, MA120, RSI 계산
           └─> IndexedDB에 저장 (지표 포함)
```

### 주가 조회

```
1. fetchStockPrices(symbols)
   └─> 각 symbol별로:
       ├─> IndexedDB에서 최신 2일치 조회
       ├─> 있으면 즉시 반환 (계산된 지표 포함)
       └─> 없으면 Supabase에서 가져와서 저장 후 반환
```

### 차트 데이터 조회

```
1. fetchStockPriceHistory(symbol, days)
   └─> IndexedDB에서 N일치 조회
       ├─> 있으면 즉시 반환 (계산된 MA20, MA60 포함)
       └─> 없으면 Supabase에서 가져와서 계산 후 저장
```

### 기술 지표 계산

```
1. calculateTechnicalIndicators(symbol)
   └─> IndexedDB에서 최신 레코드 조회
       ├─> 이미 계산된 지표가 있으면 즉시 반환
       ├─> 데이터는 있지만 지표가 없으면 계산 후 저장
       └─> 데이터가 부족하면 Supabase에서 가져와서 계산 후 저장
```

## IndexedDB 스키마

### stockPrices 테이블
- **복합 키**: `[symbol+date]`
- **인덱스**: `symbol`, `date`, `updatedAt`
- **필드**:
  - `symbol`: 종목 코드
  - `date`: 날짜 (YYYY-MM-DD)
  - `close`: 종가
  - `ma20`: 20일 이동평균 (선택적)
  - `ma60`: 60일 이동평균 (선택적)
  - `ma120`: 120일 이동평균 (선택적)
  - `rsi`: RSI 값 (선택적)
  - `updatedAt`: 업데이트 타임스탬프

### stockMetadata 테이블
- **키**: `symbol`
- **인덱스**: `lastUpdated`, `updatedAt`
- **필드**:
  - `symbol`: 종목 코드
  - `lastUpdated`: 마지막 업데이트 날짜
  - `dataCount`: 저장된 데이터 개수
  - `updatedAt`: 업데이트 타임스탬프

## 성능 최적화

### 1. 초기 로딩
- 앱 시작 시 한 번만 실행
- 모든 종목을 병렬로 처리
- 이미 오늘 날짜 데이터가 있으면 스킵

### 2. 지표 계산 캐싱
- 계산된 MA, RSI 값을 IndexedDB에 저장
- 다음 조회 시 재계산 불필요

### 3. 부분 업데이트
- `updateLatestStockData()` 함수로 최신 1일치만 추가 가능
- 전체 데이터를 다시 가져올 필요 없음

## 사용 방법

### 초기 데이터 로딩 (자동)

앱 시작 시 자동으로 실행됩니다. 수동으로 호출하려면:

```typescript
import { loadInitialStockData } from './services/stockService';

await loadInitialStockData();
```

### 부분 업데이트

최신 1일치 데이터만 추가하려면:

```typescript
import { updateLatestStockData } from './services/stockService';

await updateLatestStockData('QQQ');
```

### 데이터 조회

기존 함수들은 그대로 사용하면 됩니다:

```typescript
import { fetchStockPrices, fetchStockPriceHistory } from './services/stockService';

// 주가 조회 (IndexedDB 우선)
const prices = await fetchStockPrices(['QQQ', 'TQQQ']);

// 차트 데이터 조회 (IndexedDB 우선)
const history = await fetchStockPriceHistory('QQQ', 90);
```

## 주의사항

1. **초기 로딩 시간**: 첫 실행 시 240일치 데이터를 가져오므로 시간이 걸릴 수 있습니다.
2. **브라우저 호환성**: IndexedDB는 모든 모던 브라우저에서 지원됩니다.
3. **데이터 크기**: 종목당 약 240일치 데이터가 저장되므로 용량을 고려해야 합니다.
4. **캐시 무효화**: 날짜 기반으로 캐시를 관리하므로 자동으로 무효화됩니다.

## 문제 해결

### IndexedDB 초기화 실패
- 브라우저 개발자 도구에서 IndexedDB 상태 확인
- `Application` > `IndexedDB` > `StockDatabase` 확인

### 데이터가 업데이트되지 않음
- 브라우저 캐시 삭제
- IndexedDB 데이터 삭제 후 재로딩

### 성능 이슈
- 초기 로딩은 백그라운드에서 실행되므로 UI 블로킹 없음
- 필요시 `loadInitialStockData()` 호출을 지연시킬 수 있음

## 향후 개선 사항

1. **RSI 계산 개선**: Exponential Moving Average 기반 RSI 계산
2. **배치 업데이트**: 여러 종목을 한 번에 업데이트
3. **데이터 압축**: 오래된 데이터 압축 저장
4. **오프라인 지원**: 완전한 오프라인 모드 지원
