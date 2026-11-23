<#
.SYNOPSIS
  Separa EntradasYa en 8 repositorios de GitHub (uno por servicio y la web),
  cada uno con su pipeline de GitHub Actions y las ramas main y development.

.DESCRIPTION
  Para cada componente:
    1. git subtree split: saca la carpeta del monorepo CON su historial de commits.
    2. Agrega el pipeline (ci/workflows/<nombre>.yml -> .github/workflows/ci.yml),
       un .gitignore propio y la insignia del CI en el README.
    3. Crea el repo en GitHub con gh (si no existe) y sube main y development.
       El push a development dispara el primer pipeline.

  No toca el monorepo: solo crea ramas temporales split/* que borra al terminar.
  Si un repo ya existe y tiene contenido, lo salta (no sobrescribe nada).

.EXAMPLE
  .\scripts\separar-repos.ps1 -Simular          # muestra lo que haría, sin crear nada
  .\scripts\separar-repos.ps1                   # crea los 8 repos
  .\scripts\separar-repos.ps1 -Solo auth,web    # solo algunos
#>
param(
  [string]$Owner = 'jdguior06',
  [string]$Prefijo = 'entradasya-',
  [ValidateSet('public', 'private')]
  [string]$Visibilidad = 'public',
  [string[]]$Solo,
  [switch]$Simular
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Trabajo = Join-Path $env:TEMP 'entradasya-repos'

$Componentes = [ordered]@{
  auth          = @{ Ruta = 'services/auth';          Desc = 'EntradasYa - auth: registro, login y JWT RS256 (NestJS)' }
  events        = @{ Ruta = 'services/events';        Desc = 'EntradasYa - events: cartelera, sectores, cupos y fotos (NestJS)' }
  orders        = @{ Ruta = 'services/orders';        Desc = 'EntradasYa - orders: orquestador de la compra (NestJS)' }
  payments      = @{ Ruta = 'services/payments';      Desc = 'EntradasYa - payments: pagos simulados, interno (NestJS)' }
  tickets       = @{ Ruta = 'services/tickets';       Desc = 'EntradasYa - tickets: entradas en PDF con QR (NestJS)' }
  notifications = @{ Ruta = 'services/notifications'; Desc = 'EntradasYa - notifications: correos por SMTP, interno (NestJS)' }
  checkin       = @{ Ruta = 'services/checkin';       Desc = 'EntradasYa - checkin: control de ingreso con QR (NestJS)' }
  web           = @{ Ruta = 'web';                    Desc = 'EntradasYa - web: interfaz en React + Vite + Tailwind' }
}

function Write-Paso([string]$t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Write-Ok([string]$t) { Write-Host "   OK  $t" -ForegroundColor Green }
function Write-Aviso([string]$t) { Write-Host "   !!  $t" -ForegroundColor Yellow }

# Ejecuta un programa externo y corta si falla (PowerShell no lo hace solo).
function Invoke-Cmd {
  param([string]$Exe, [string[]]$Argumentos)
  & $Exe @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "Falló: $Exe $($Argumentos -join ' ')" }
}

# Igual, pero en -Simular solo muestra el comando (para lo que crea o sube cosas).
function Invoke-Remoto {
  param([string]$Exe, [string[]]$Argumentos)
  if ($Simular) { Write-Host "   (simulado) $Exe $($Argumentos -join ' ')" -ForegroundColor DarkGray; return }
  Invoke-Cmd $Exe $Argumentos
}

# ---------------------------------------------------------------- chequeos
Write-Paso 'Revisando herramientas'
foreach ($exe in 'git', 'gh') {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
    if ($exe -eq 'gh') { throw 'Falta GitHub CLI. Instálalo con: winget install GitHub.cli  (y abre otra terminal)' }
    throw "Falta $exe"
  }
}
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'gh no tiene sesión. Ejecuta: gh auth login  (GitHub.com, HTTPS, navegador)' }
Write-Ok 'git y gh listos (sesión iniciada)'
if (-not $Simular) { Invoke-Cmd gh @('auth', 'setup-git') }   # git push usa la sesión de gh

Push-Location $Root
try {
  $sucio = git status --porcelain
  if ($sucio) {
    throw "Hay cambios sin commit en el monorepo. Haz commit primero (git add -A; git commit -m ...).`n$($sucio -join "`n")"
  }
  Write-Ok "monorepo limpio en $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
} finally { Pop-Location }

# Acepta -Solo auth,web y también "auth,web" (desde cmd o pwsh -File).
$nombres = if ($Solo) { @($Solo -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) } else { @($Componentes.Keys) }
foreach ($n in $nombres) {
  if (-not $Componentes.Contains($n)) { throw "Componente desconocido: $n. Usa: $($Componentes.Keys -join ', ')" }
  if (-not (Test-Path (Join-Path $Root "ci/workflows/$n.yml"))) { throw "Falta ci/workflows/$n.yml" }
}
New-Item -ItemType Directory -Force $Trabajo | Out-Null

# ---------------------------------------------------------------- por componente
$resumen = @()
foreach ($n in $nombres) {
  $c = $Componentes[$n]
  $repo = "$Prefijo$n"
  $completo = "$Owner/$repo"
  $rama = "split/$n"
  $dir = Join-Path $Trabajo $repo
  Write-Paso "$n  ->  github.com/$completo"

  # ¿Ya existe con contenido? Entonces no se toca.
  & gh repo view $completo --json name *> $null
  $existe = ($LASTEXITCODE -eq 0)
  if ($existe) {
    $ramas = (& gh api "repos/$completo/branches" --jq 'length') 2>$null
    if ($ramas -and [int]$ramas -gt 0) {
      Write-Aviso "ya existe y tiene contenido: se salta (bórralo en GitHub si quieres recrearlo)"
      $resumen += [pscustomobject]@{ Componente = $n; Repo = $completo; Estado = 'ya existía' }
      continue
    }
  }

  # 1) Carpeta del monorepo -> rama con su propio historial
  Push-Location $Root
  try {
    git show-ref --verify --quiet "refs/heads/$rama"
    if ($LASTEXITCODE -eq 0) { Invoke-Cmd git @('branch', '-D', $rama) | Out-Null }
    Invoke-Cmd git @('subtree', 'split', "--prefix=$($c.Ruta)", '-b', $rama, '-q') | Out-Null
  } finally { Pop-Location }
  $commits = git -C $Root rev-list --count $rama
  Write-Ok "historial separado ($commits commits)"

  # 2) Copia de trabajo con el pipeline, .gitignore e insignia
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  Invoke-Cmd git @('clone', '--quiet', '--branch', $rama, '--single-branch', $Root, $dir)
  New-Item -ItemType Directory -Force (Join-Path $dir '.github/workflows') | Out-Null
  Copy-Item (Join-Path $Root "ci/workflows/$n.yml") (Join-Path $dir '.github/workflows/ci.yml')
  Copy-Item (Join-Path $Root 'ci/repo/gitignore') (Join-Path $dir '.gitignore') -Force

  $readme = Join-Path $dir 'README.md'
  if (Test-Path $readme) {
    $lineas = [System.Collections.Generic.List[string]](Get-Content $readme -Encoding UTF8)
    $insignia = "[![CI](https://github.com/$completo/actions/workflows/ci.yml/badge.svg?branch=development)](https://github.com/$completo/actions/workflows/ci.yml)"
    $lineas.Insert(1, '')
    $lineas.Insert(2, $insignia)
    [System.IO.File]::WriteAllLines($readme, $lineas, (New-Object System.Text.UTF8Encoding($false)))
  }

  Invoke-Cmd git @('-C', $dir, 'add', '-A')
  Invoke-Cmd git @('-C', $dir, 'commit', '-q', '-m', 'CI: pipeline de GitHub Actions (cada push a development genera el artifact)')
  Write-Ok 'pipeline, .gitignore e insignia agregados'

  # 3) Repo en GitHub + ramas main y development
  if (-not $existe) {
    Invoke-Remoto gh @('repo', 'create', $completo, "--$Visibilidad", '--description', $c.Desc)
    Write-Ok "repo creado ($Visibilidad)"
  }
  Invoke-Cmd git @('-C', $dir, 'remote', 'set-url', 'origin', "https://github.com/$completo.git")
  Invoke-Remoto git @('-C', $dir, 'push', '-q', '-u', 'origin', 'HEAD:refs/heads/main')
  Invoke-Remoto git @('-C', $dir, 'push', '-q', 'origin', 'HEAD:refs/heads/development')
  Invoke-Remoto gh @('repo', 'edit', $completo, '--default-branch', 'main')
  Write-Ok 'ramas main y development subidas (el push a development inicia el pipeline)'

  Invoke-Cmd git @('-C', $Root, 'branch', '-D', $rama) | Out-Null
  $resumen += [pscustomobject]@{ Componente = $n; Repo = $completo; Estado = $(if ($Simular) { 'simulado' } else { 'creado' }) }
}

# ---------------------------------------------------------------- resumen
Write-Paso 'Resumen'
foreach ($r in $resumen) { Write-Host ("   {0,-14} {1,-40} {2}" -f $r.Componente, $r.Repo, $r.Estado) }
Write-Host "`nCopias de trabajo en: $Trabajo"
if (-not $Simular) {
  Write-Host "Mira los pipelines en: https://github.com/$Owner?tab=repositories  (pestaña Actions de cada repo)"
}
