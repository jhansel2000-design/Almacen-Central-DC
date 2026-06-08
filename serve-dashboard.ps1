# Servidor WMS — Red local (LAN) + archivos estáticos
# Varios dispositivos en el mismo WiFi acceden por http://IP:PUERTO
param(
    [int]$Port = 8080
)

Set-Location -LiteralPath $PSScriptRoot
$lanServer = Join-Path $PSScriptRoot 'server\lan-server.js'

if (-not (Test-Path -LiteralPath $lanServer)) {
    Write-Error "No se encontró server\lan-server.js"
    exit 1
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host ''
    Write-Host 'Iniciando servidor LAN (0.0.0.0)...' -ForegroundColor Cyan
    Write-Host "Puerto: $Port"
    Write-Host 'Detener: Ctrl+C'
    Write-Host ''
    Write-Host 'Tip: si otros equipos no conectan, ejecuta como Admin:' -ForegroundColor Yellow
    Write-Host '  .\scripts\open-firewall.ps1 -Port' $Port
    Write-Host ''
    node $lanServer --port $Port
    exit $LASTEXITCODE
}

Write-Error 'Instala Node.js (https://nodejs.org) para el servidor LAN.'
exit 1
