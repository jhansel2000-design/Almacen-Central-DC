@echo off
title Publicar reglas Firebase - Almacen Central DC
cd /d "%~dp0"
echo.
echo ============================================================
echo   OBLIGATORIO: PUBLICAR REGLAS EN FIREBASE
echo ============================================================
echo.
echo  Sin esto los celulares NO pueden guardar reportes.
echo  (Error: Permission denied)
echo.
echo  PASOS:
echo    1. Abra: https://console.firebase.google.com
echo    2. Proyecto: janselcastro-cd748
echo    3. Realtime Database - Reglas
echo    4. Copie TODO el archivo firebase-database.rules.json
echo    5. Pegue en el editor y pulse PUBLICAR
echo.
echo  Debe incluir averias/snapshot Y averias/live con .write: true
echo.
echo  Abriendo archivo de reglas...
start "" notepad "%~dp0firebase-database.rules.json"
echo.
echo  Abriendo Firebase Console...
start "" "https://console.firebase.google.com/project/janselcastro-cd748/database/janselcastro-cd748-default-rtdb/rules"
echo.
pause
