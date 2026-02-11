# Python 가상 환경 설정 스크립트 (PowerShell)

Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan

# 가상 환경 생성
python -m venv venv

Write-Host "Activating virtual environment..." -ForegroundColor Cyan

# 가상 환경 활성화
.\venv\Scripts\Activate.ps1

Write-Host "Installing dependencies..." -ForegroundColor Cyan

# 패키지 설치
pip install --upgrade pip
pip install -r requirements.txt

Write-Host "`n✓ Virtual environment setup complete!" -ForegroundColor Green
Write-Host "`nTo activate in the future, run:" -ForegroundColor Yellow
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "`nTo deactivate, run:" -ForegroundColor Yellow
Write-Host "  deactivate" -ForegroundColor White
