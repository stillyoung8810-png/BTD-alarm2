# Railway BFF — 에러 수정 요약

## 수정한 내용

### 1. `src/routes/auth.ts` — 구문 오류 (12건 → 0건)

- **원인**: 템플릿 리터럴 백틱이 이스케이프된 형태(`\``)로 들어가 있어, TypeScript가 유효한 문법으로 인식하지 못함. 그 결과 "Invalid character", "Variable declaration expected", "Unterminated template literal", "Cannot find name 'Failed'/'to'/'create'/'signUpError'/'$'" 등이 연쇄 발생.
- **조치**:
  - **58행**: `const dummyPassword = \`TossLogin_${...}\`;` → 백틱을 실제 템플릿 리터럴로 수정하여 `const dummyPassword = \`TossLogin_${process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)}\`;` 형태로 복구.
  - **80행**: `throw new Error(\`Failed to create user: ${signUpError.message}\`);` 에서 이스케이프된 백틱 제거 시 파서가 깨지는 문제를 피하기 위해, 템플릿 리터럴 대신 문자열 연결로 변경: `throw new Error('Failed to create user: ' + signUpError.message);`

### 2. `tsconfig.json` — 모듈 해석 보강

- **추가 옵션**: `moduleResolution: "node"`, `resolveJsonModule: true`
- **목적**: `@fastify/cors`, `dotenv`, `axios` 등 `node_modules` 경로를 TypeScript가 안정적으로 찾을 수 있도록 함.

---

## "Cannot find module" 오류 해결 (index.ts, tossClient.ts)

- **원인**: `server` 디렉터리에서 `npm install`이 실행되지 않아 `node_modules`에 패키지가 없거나, IDE가 해당 디렉터리를 프로젝트 루트로 인식하지 못하는 경우.
- **조치**: **`server` 폴더에서 한 번 의존성 설치를 실행하세요.**

```bash
cd server
npm install
```

- `package.json`에는 이미 다음이 포함되어 있음:
  - `@fastify/cors`, `dotenv`, `axios`, `fastify`, `@supabase/supabase-js`
  - `devDependencies`: `@types/node`, `typescript`, `ts-node`
- 위 패키지들은 타입을 내장하고 있어 별도 `@types/*` 설치는 필요 없음.

---

## 검증 방법

1. `server`에서 `npm install` 실행 후, IDE에서 문제 탭을 새로고침하거나 TypeScript 서버 재시작.
2. 터미널에서 타입 체크:
   ```bash
   cd server
   npx tsc --noEmit
   ```
3. (선택) 로컬 실행:
   ```bash
   npm run dev
   ```

위까지 적용하면 이미지에 나온 16개 TypeScript 오류는 해소되어야 합니다.
