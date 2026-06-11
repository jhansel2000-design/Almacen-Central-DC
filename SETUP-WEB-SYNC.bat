@echo off
title Activar sync WEB completa - Almacen Central DC
cd /d "%~dp0"
echo.
echo ============================================================
echo   SYNC WEB — LO QUE VES TU, LO VEN TODOS
echo ============================================================
echo.
echo  La cuenta JSONBin anterior esta AGOTADA.
echo  Necesita una Master Key NUEVA (cuenta gratis):
echo.
echo  1. Abra https://jsonbin.io
echo  2. Cree cuenta gratis (o entre con otra cuenta)
echo  3. API Keys - copie la MASTER KEY
echo.
set /p MASTER_KEY=Pegue su Master Key NUEVA aqui: 
if "%MASTER_KEY%"=="" (
  echo Error: Master Key vacia.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-web-sync.ps1" -MasterKey "%MASTER_KEY%"
echo.
pause
