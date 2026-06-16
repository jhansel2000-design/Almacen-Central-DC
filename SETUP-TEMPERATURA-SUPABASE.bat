@echo off
chcp 65001 >nul
echo.
echo  Monitoreo de Temperatura — Supabase
echo  ===================================
echo.
echo  1. Abra supabase.com ^> su proyecto ^> SQL Editor
echo  2. Pegue y ejecute: supabase/migrations/20250616_temperature_monitoring.sql
echo  3. Verifique Realtime activo en temp_readings, temp_current, temp_alerts
echo  4. Abra temperatura.html y registre una lectura de prueba
echo.
pause
