# stock_prices RLS 조정 — 실행 계획 (코드 변경 없음)

## 1. 원인 정리: RLS가 맞는지

**결론: 맞습니다. 범인은 RLS 설정입니다.**

- 클라이언트는 **anon 키**로 접근합니다 (로그인 여부와 무관).
- RLS가 `stock_prices`에 대해 anon의 **SELECT를 허용하는 정책이 없거나**, 기존 정책이 “인증된 사용자만” 등으로 제한되어 있으면:
  - Supabase/PostgREST는 **에러를 반환하지 않고** 빈 배열 `[]`만 반환합니다.
  - 보안상 “이 테이블이 있는지/몇 행인지”를 노출하지 않기 위한 동작입니다.
- 사용자 콘솔 로그와 일치합니다:
  - `hasError: false`, `errorMessage: null` → 요청 자체는 성공
  - `dataLength: 0`, `dataIsNull: false` → 응답은 정상이지만 행 0개
  - 로그인 후 성공 → 인증된 사용자용 정책만 있었을 가능성이 큼.

따라서 **anon으로 SELECT를 허용하는 정책을 추가**하면 비로그인 사용자도 주가 데이터를 볼 수 있습니다.

---

## 2. 사용자 제안 정책 검토

제안하신 SQL:

```sql
CREATE POLICY "누구나 주식 가격을 조회할 수 있음" 
ON public.stock_prices
FOR SELECT 
TO anon   
USING (true);
```

- **FOR SELECT** → 읽기 전용만 허용 (INSERT/UPDATE/DELETE는 그대로 차단). 적절합니다.
- **TO anon** → 비로그인 사용자 포함. 목적에 맞습니다.
- **USING (true)** → 조건 없이 모든 행 허용. `stock_prices`가 공개용 주가 데이터라면 합리적입니다.

**정리:** 이 정책이면 비로그인 사용자에게 주가 데이터를 보여주는 목표는 달성됩니다. “더 안전한 방법”은 아래 3에서 정리합니다.

---

## 3. 더 안전하게 하려면 (선택)

현재 제안만으로도 **읽기 전용 + anon만** 이라 위험도는 낮습니다. 다만 다음을 고려할 수 있습니다.

| 항목 | 내용 |
|------|------|
| **정책 이름/문서화** | 정책 이름을 `"anon_select_stock_prices_public"` 등으로 구체화하고, SQL 주석으로 “공개 주가, 읽기 전용” 목적을 적어 두면 나중에 유지보수에 도움됩니다. |
| **다른 역할은 그대로** | `TO anon`만 추가하고, `authenticated`/`service_role`용 정책은 기존대로 두면 됩니다. 기존에 “로그인 사용자만 SELECT” 정책이 있었다면, anon 정책 추가 후에도 로그인 사용자는 계속 읽을 수 있습니다. |
| **쓰기 정책 확인** | `stock_prices`에 anon의 INSERT/UPDATE/DELETE 정책이 있으면 제거하는 것이 안전합니다. 보통 주가는 백엔드/스케줄러만 쓰므로 anon 쓰기는 없어야 합니다. |
| **RLS 자체는 켜두기** | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 는 유지한 채, “필요한 정책만 추가”하는 방식이 좋습니다. RLS를 끄면 anon이 모든 작업을 할 수 있어 위험합니다. |
| **추가 제한이 필요하면** | 나중에 “특정 symbol만 공개” 등으로 바꾸고 싶다면 `USING (symbol = ANY(...))` 같은 조건을 넣을 수 있습니다. 당장은 `USING (true)`로 충분합니다. |

**더 안전한 방법 요약:**  
- anon은 **SELECT만** 허용 (지금 제안대로 유지).  
- anon에 대한 INSERT/UPDATE/DELETE 정책은 없어야 함.  
- RLS는 켜 둔 상태에서 정책만 추가·조정.

---

## 4. 실행 계획 (순서)

코드는 건드리지 않고, Supabase 대시보드/마이그레이션에서만 진행합니다.

1. **현재 정책 확인**
   - Supabase Dashboard → **Table Editor** → `public.stock_prices` 선택  
     또는 **SQL Editor**에서:
     ```sql
     SELECT * FROM pg_policies WHERE tablename = 'stock_prices';
     ```
   - `stock_prices`에 어떤 정책이 있는지, anon에 SELECT가 있는지 확인.

2. **anon SELECT 정책 추가**
   - **SQL Editor**에서 아래 실행 (이미 같은 이름 정책이 있으면 `CREATE POLICY` 대신 `DROP POLICY ... ; CREATE POLICY ...` 로 교체).
   ```sql
   CREATE POLICY "anon_select_stock_prices_public"
   ON public.stock_prices
   FOR SELECT
   TO anon
   USING (true);
   ```

3. **anon 쓰기 정책 제거(있다면)**
   - `pg_policies` 결과에서 anon에 대한 INSERT/UPDATE/DELETE 정책이 있으면 제거.
   - 예: `DROP POLICY "policy_name" ON public.stock_prices;`

4. **동작 확인**
   - 브라우저 시크릿 창(또는 로그아웃 상태)에서 앱 접속 → 주가/차트 로드 확인.
   - 로그인 계정으로도 기존처럼 데이터 로드되는지 확인.

5. **(선택) 마이그레이션으로 관리**
   - 로컬 `supabase/migrations` 에 위 정책 생성/삭제 SQL을 마이그레이션 파일로 남기면, 배포/복구 시 동일 정책을 유지할 수 있습니다.

---

## 5. 콘솔 로그 해석 (참고)

사용자가 공유한 로그:

- `[Supabase] loadInitialStockData 실패: symbol=QQQ`
- `hasError: false`, `dataLength: 0`, `urlHint: 'https://vbscfgjlckbjrdqzpire.supabase.co'`

→ **요청은 성공했고, RLS 때문에 반환된 행이 0개**인 상황과 정확히 일치합니다.  
정책 추가 후에는 동일 요청에서 `dataLength > 0` 이 나와야 합니다.

---

**요약:**  
- 원인은 RLS(anon SELECT 미허용).  
- 제안하신 “SELECT만 anon 허용, USING (true)” 정책으로 비로그인 사용자에게 주가 노출 가능.  
- 더 안전하게 하려면 anon은 SELECT만 두고, 쓰기 정책은 제거·비허용, RLS는 켜 둔 채로 두면 됨.  
- 위 순서대로 대시보드/SQL만 실행하고, 코드는 변경하지 않음.
