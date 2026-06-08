@echo off
title Subir WMS a GitHub
cd /d "%~dp0"

echo.
echo ========================================
echo   SUBIR TODO A GITHUB
echo   Cuenta: jhansel2000-design
echo   Repo:   mi-web-DC
echo ========================================
echo.
echo Tu PC esta usando OTRA cuenta (luisjoserodriguezcorripio-creator).
echo Debes borrarla primero (ver instrucciones si falla).
echo.

git remote set-url origin https://github.com/jhansel2000-design/mi-web-DC.git

echo Subiendo archivos...
git push -u origin main --force

if errorlevel 1 (
    echo.
    echo ========================================
    echo   NO SE PUDO SUBIR - HAZ ESTO:
    echo ========================================
    echo.
    echo 1. Windows - Busca: Administrador de credenciales
    echo 2. Credenciales de Windows
    echo 3. Borra entradas de "github.com"
    echo 4. Vuelve a ejecutar este archivo
    echo 5. Inicia sesion con jhansel2000-design
    echo.
    echo O crea un token en:
    echo https://github.com/settings/tokens
    echo y usalo como contraseña cuando pida login.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   LISTO - Todo subido a GitHub
echo ========================================
echo.
echo Abre: https://github.com/jhansel2000-design/mi-web-DC
echo.
pause
