@echo off
title Activar nube - Reportes Almacen Central DC
cd /d "%~dp0"
echo.
echo ============================================
echo   ACTIVAR SINCRONIZACION CLOUD (JSONBin)
echo ============================================
echo.
echo 1. Abra https://jsonbin.io y cree cuenta gratis
echo 2. Vaya a API Keys y copie la MASTER KEY
echo.
set /p MASTER_KEY=Pegue su Master Key aqui: 
if "%MASTER_KEY%"=="" (
  echo Error: Master Key vacia.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-averias-cloud.ps1" -MasterKey "%MASTER_KEY%"
echo.
echo Listo. Espere 2 minutos y recargue averias.html en los celulares.
pause
