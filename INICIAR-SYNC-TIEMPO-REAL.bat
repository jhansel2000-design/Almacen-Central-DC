@echo off
title Sync tiempo real - Almacen Central DC
cd /d "%~dp0"
color 0A
echo.
echo ============================================================
echo   SINCRONIZACION EN TIEMPO REAL — TODOS LOS CELULARES
echo ============================================================
echo.
echo  OPCION A (recomendada, funciona 24/7 sin PC encendido):
echo    1. Doble clic en SETUP-AVERIAS-CLOUD.bat
echo    2. Pegue Master Key de https://jsonbin.io (cuenta gratis)
echo    3. Espere 2 min y recargue averias.html en los celulares
echo.
echo  OPCION B (PC servidor siempre encendido):
echo    1. Esta ventana inicia el servidor LAN
echo    2. Se abrira otra ventana con tunel publico (Cloudflare)
echo.
set /p ELEGIR=Pulse A para JSONBin, B para tunel, Enter para solo LAN: 
if /i "%ELEGIR%"=="A" (
  call "%~dp0SETUP-AVERIAS-CLOUD.bat"
  exit /b 0
)
echo.
echo Iniciando servidor...
start "Almacen DC - Servidor" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-dashboard.ps1" -AutoCloud
if /i "%ELEGIR%"=="B" (
  timeout /t 6 /nobreak >nul
  start "Almacen DC - Tunel" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-public-tunnel.ps1"
  echo Tunel iniciado. Revise la otra ventana para la URL publica.
)
echo.
echo Listo. En WiFi use: http://IP-DEL-PC:8080/averias.html
pause
