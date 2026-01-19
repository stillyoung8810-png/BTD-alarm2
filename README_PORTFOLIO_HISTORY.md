# Portfolio History Table 설정 가이드

## 개요
종료된 포트폴리오의 이력 정보를 저장하는 `portfolio_history` 테이블을 생성합니다.

## 테이블 구조

### 주요 컬럼
- `id`: UUID 기본키
- `portfolio_id`: 원본 포트폴리오 ID (text 타입, 외래키 제약 없음)
- `user_id`: 사용자 ID (RLS를 위해 필요)
- `portfolio_name`: 포트폴리오 이름 스냅샷
- `total_invested`: 총 투자금 (Σ(매수금 + 수수료))
- `total_return`: 총 회수금 (Σ(매도금 - 수수료))
- `total_profit`: 총 수익금 (회수금 - 투자금)
- `yield_rate`: 수익률 ((수익금 / 투자금) * 100)
- `start_date`: 전략 시작일
- `end_date`: 전략 종료일
- `strategy_detail`: 전략 설정 JSON (MA, RSI 기준 등)
- `notes`: 사용자 메모 (선택사항)

### 추가 컬럼
- `created_at`: 레코드 생성 시간
- `updated_at`: 레코드 업데이트 시간 (자동 업데이트)

## 설치 방법

1. Supabase 대시보드에서 SQL Editor 열기
2. `supabase_portfolio_history_setup.sql` 파일의 내용을 복사하여 실행
3. 테이블 생성 확인

## 사용 방법

포트폴리오가 종료되면 자동으로 `portfolio_history` 테이블에 이력이 저장됩니다.

### 수동으로 이력 조회

```typescript
const { data, error } = await supabase
  .from('portfolio_history')
  .select('*')
  .eq('user_id', userId)
  .order('end_date', { ascending: false });
```

## 보안

- RLS (Row Level Security) 활성화
- 사용자는 자신의 이력만 조회/수정/삭제 가능
- 원본 포트폴리오가 삭제되어도 이력은 유지됨

## 주의사항

- `portfolio_id`는 참조용이며, 외래키 제약이 없습니다
- 원본 포트폴리오가 삭제되어도 이력 데이터는 보존됩니다
- `strategy_detail`은 JSONB 형식으로 전략 설정을 저장합니다
