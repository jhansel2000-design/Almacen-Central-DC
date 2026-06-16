@echo off
title Configurar Temperatura en Supabase
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo  MONITOREO DE TEMPERATURA - ACTIVAR SUPABASE
echo  ===========================================
echo.
echo  Paso 1: Se abrira el archivo SQL en el Bloc de notas.
echo  Paso 2: Copie TODO el contenido (Ctrl+A, Ctrl+C).
echo  Paso 3: Abra Supabase en el navegador:
echo          https://supabase.com/dashboard/project/pjbzbwckcbhmkeidsqjz/sql/new
echo  Paso 4: Pegue el SQL y pulse RUN (Ejecutar).
echo  Paso 5: Recargue temperatura.html con Ctrl+F5.
echo.

set "SQLFILE=%~dp0supabase\migrations\20250616_temperature_monitoring.sql"
if not exist "%SQLFILE%" (
  echo ERROR: No se encontro el archivo SQL:
  echo %SQLFILE%
  pause
  exit /b 1
)

start "" notepad "%SQLFILE%"
start "" "https://supabase.com/dashboard/project/pjbzbwckcbhmkeidsqjz/sql/new"

echo Listo. Siga los pasos en pantalla.
echo.
pause
