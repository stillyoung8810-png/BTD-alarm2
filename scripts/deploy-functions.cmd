@echo off
REM Edge Functions 일괄 배포 (실행 정책 우회)
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-functions.ps1" %*
exit /b %ERRORLEVEL%
