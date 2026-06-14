Add-Type -AssemblyName System.Drawing

function Write-JcLogo {
  param([int]$Size, [string]$OutPath)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(255, 21, 32, 43))
  $margin = [Math]::Max(1, [int]($Size * 0.06))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 197, 165, 114)), 1
  $g.DrawRectangle($pen, $margin, $margin, $Size - 2 * $margin, $Size - 2 * $margin)
  $fontSize = [Math]::Max(8, $Size * 0.34)
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 197, 165, 114))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
  $g.DrawString('JC', $font, $brush, $rect, $sf)
  $dir = Split-Path $OutPath -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $font.Dispose()
  $brush.Dispose()
  $pen.Dispose()
  Write-Host "OK $OutPath"
}

$base = Join-Path $PSScriptRoot '..\assets\img'
Write-JcLogo -Size 64 -OutPath (Join-Path $base 'dc-logo-64.png')
Write-JcLogo -Size 128 -OutPath (Join-Path $base 'dc-logo-128.png')
Write-JcLogo -Size 512 -OutPath (Join-Path $base 'dc-logo.png')
