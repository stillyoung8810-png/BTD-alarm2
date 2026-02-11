# Supabase Edge Functions 일괄 배포 스크립트
# 프로젝트 루트에서 실행:
#   .\scripts\deploy-functions.cmd   (권장: 실행 정책 무관)
#   .\scripts\deploy-functions.ps1  (실행 정책 오류 시: powershell -ExecutionPolicy Bypass -File .\scripts\deploy-functions.ps1)
# 모든 함수를 올바른 JWT 플래그로 배포합니다 (플래그 누락 방지).

$ErrorActionPreference = "Stop"

# --no-verify-jwt 필요한 함수 (외부/크론/내부 호출, JWT 없음)
$noVerifyJwt = @(
  "payment-webhook",
  "telegram-webhook",
  "gemini",
  "check-and-trigger-alarms",
  "generate-daily-execution-summaries",
  "push-notification",
  "send-alarm",
  "update-stock-prices"
)

# 기본 JWT 검증 사용 함수 (클라이언트 호출, Bearer 토큰 전달)
$withJwt = @(
  "verify-payment",
  "cancel-subscription",
  "delete-account"
)

Write-Host "Deploying functions that require --no-verify-jwt (8)..." -ForegroundColor Cyan
foreach ($name in $noVerifyJwt) {
  Write-Host "  deploy $name --no-verify-jwt"
  npx supabase functions deploy $name --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Deploying functions with default JWT verification (3)..." -ForegroundColor Cyan
foreach ($name in $withJwt) {
  Write-Host "  deploy $name"
  npx supabase functions deploy $name
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "All 11 Edge Functions deployed." -ForegroundColor Green
