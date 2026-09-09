# run-dev.ps1
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Starting BizTrack Dev Environment (FastAPI)" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

Write-Host "`nStarting FastAPI server..." -ForegroundColor Yellow
python -m uvicorn main:app --reload
