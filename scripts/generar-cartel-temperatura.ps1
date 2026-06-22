# Genera cartel QR + PDF para auditores de temperatura
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $env:USERPROFILE 'Desktop\Temperatura-Imprimir-DC'
$gen = Join-Path $dir '_gen'
New-Item -ItemType Directory -Force -Path $gen | Out-Null

$auditorUrl = 'https://jhansel2000-design.github.io/Almacen-Central-DC/temperatura-auditor.html'

Invoke-WebRequest -Uri ("https://quickchart.io/qr?size=800&margin=2&text=" + [uri]::EscapeDataString($auditorUrl)) -OutFile (Join-Path $gen 'temperatura-qr-auditor.png') -UseBasicParsing
Copy-Item (Join-Path $gen 'temperatura-qr-auditor.png') (Join-Path $root 'assets\img\temperatura-qr-auditor.png') -Force

$repoGen = Join-Path $root 'scripts\carteles-temperatura'
if (Test-Path $repoGen) {
  Copy-Item (Join-Path $repoGen '*.html') $gen -Force
}

$edge = @(
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { throw 'Instale Microsoft Edge o Chrome para generar PDF.' }

$htmlPath = Join-Path $gen '1-qr-auditor.html'
if (-not (Test-Path $htmlPath)) { throw 'Falta plantilla 1-qr-auditor.html' }
$pdfPath = Join-Path $dir 'CARTEL-QR-AUDITOR-TEMPERATURA.pdf'
if (Test-Path $pdfPath) { Remove-Item $pdfPath -Force }
$uri = [Uri]::new((Resolve-Path $htmlPath).Path).AbsoluteUri
& $edge --headless --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw --virtual-time-budget=8000 --print-to-pdf="$pdfPath" "$uri" | Out-Null
Start-Sleep -Seconds 2
if (-not (Test-Path $pdfPath)) { throw 'No se creó el PDF del cartel.' }

Remove-Item $gen -Recurse -Force
Write-Host "OK $pdfPath"
Write-Host "QR URL: $auditorUrl"
Write-Host "Listo: $dir"
