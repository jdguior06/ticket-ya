<#
.SYNOPSIS
  Copia los pipelines de ci/workflows/ a los 8 repos que ya existen en GitHub
  (.github/workflows/ci.yml) y los sube a la rama development.

.DESCRIPTION
  separar-repos.ps1 copia el pipeline solo al CREAR cada repo. Si después cambias
  un archivo de ci/workflows/, este script lleva el cambio a cada repo:
    1. clona la rama development del repo (en una carpeta temporal),
    2. reemplaza .github/workflows/ci.yml,
    3. si cambió, hace commit y push a development  ->  se ejecuta el pipeline.
  Los repos que ya tienen la versión actual no se tocan.

.EXAMPLE
  .\scripts\actualizar-pipelines.ps1 -Simular
  .\scripts\actualizar-pipelines.ps1
  .\scripts\actualizar-pipelines.ps1 -Solo checkin,web
#>
param(
  [string]$Owner = 'jdguior06',
  [string]$Prefijo = 'entradasya-',
  [string]$Rama = 'development',
  [string[]]$Solo,
  [switch]$Simular,
  # Solo para pruebas: plantilla de la URL del repo ({0} = owner/repo).
  [string]$Remoto = 'https://github.com/{0}.git'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Trabajo = Join-Path $env:TEMP 'entradasya-pipelines'
$Todos = 'auth', 'events', 'orders', 'payments', 'tickets', 'notifications', 'checkin', 'web'

function Write-Paso([string]$t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Write-Ok([string]$t) { Write-Host "   OK  $t" -ForegroundColor Green }
function Write-Aviso([string]$t) { Write-Host "   !!  $t" -ForegroundColor Yellow }

function Invoke-Cmd {
  param([string]$Exe, [string[]]$Argumentos)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'   # git escribe avisos en stderr; no son errores
  try { & $Exe @Argumentos 2>&1 | ForEach-Object { "   $_" } | Write-Host; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $prev }
  if ($code -ne 0) { throw "Falló: $Exe $($Argumentos -join ' ')" }
}

$nombres = if ($Solo) { @($Solo -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) } else { $Todos }
foreach ($n in $nombres) {
  if ($Todos -notcontains $n) { throw "Componente desconocido: $n. Usa: $($Todos -join ', ')" }
  if (-not (Test-Path (Join-Path $Root "ci/workflows/$n.yml"))) { throw "Falta ci/workflows/$n.yml" }
}
if (Test-Path $Trabajo) { Remove-Item -Recurse -Force $Trabajo }
New-Item -ItemType Directory -Force $Trabajo | Out-Null

$resumen = @()
foreach ($n in $nombres) {
  $completo = "$Owner/$Prefijo$n"
  $url = $Remoto -f $completo
  $dir = Join-Path $Trabajo "$Prefijo$n"
  Write-Paso "$n  ->  $completo ($Rama)"

  Invoke-Cmd git @('clone', '--quiet', '--depth', '1', '--branch', $Rama, $url, $dir)
  $destino = Join-Path $dir '.github/workflows/ci.yml'
  New-Item -ItemType Directory -Force (Split-Path $destino) | Out-Null
  Copy-Item (Join-Path $Root "ci/workflows/$n.yml") $destino -Force

  $cambios = git -C $dir status --porcelain
  if (-not $cambios) {
    Write-Ok 'ya tiene la versión actual del pipeline'
    $resumen += [pscustomobject]@{ Componente = $n; Estado = 'sin cambios' }
    continue
  }
  Invoke-Cmd git @('-C', $dir, 'add', '.github/workflows/ci.yml')
  Invoke-Cmd git @('-C', $dir, 'commit', '-q', '-m', 'CI: actualizar el pipeline')
  if ($Simular) {
    Write-Host "   (simulado) git push origin $Rama" -ForegroundColor DarkGray
    $resumen += [pscustomobject]@{ Componente = $n; Estado = 'cambiaría' }
    continue
  }
  Invoke-Cmd git @('-C', $dir, 'push', '-q', 'origin', "HEAD:refs/heads/$Rama")
  Write-Ok "pipeline actualizado y subido (se ejecuta ahora en $Rama)"
  $resumen += [pscustomobject]@{ Componente = $n; Estado = 'actualizado' }
}

Write-Paso 'Resumen'
foreach ($r in $resumen) { Write-Host ("   {0,-14} {1}" -f $r.Componente, $r.Estado) }
if (-not $Simular) { Write-Host "`nMira los pipelines en la pestaña Actions de cada repo: https://github.com/$Owner/$Prefijo<servicio>/actions" }
