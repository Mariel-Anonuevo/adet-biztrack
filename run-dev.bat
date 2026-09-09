@echo off
echo ====================================================================
echo Starting BizTrack Dev Environment (FastAPI)
echo ====================================================================
echo.
python -m uvicorn main:app --reload
pause
