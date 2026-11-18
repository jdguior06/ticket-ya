<#
.SYNOPSIS
  Levanta (o detiene) todo EntradasYa en local: Mailpit + los 6 servicios.

.DESCRIPTION
  Antes de arrancar revisa Node, PostgreSQL, las llaves JWT, los .env, que la
  INTERNAL_API_KEY sea la misma en todos y que los puertos estén libres.
  Cada servicio se abre en su propia ventana ("EntradasYa - <servicio>") con
  `npm run start:dev`; luego espera a que respondan los /health y muestra un resumen.

.EXAMPLE
  .\scripts\dev.ps1                  # levanta todo
  .\scripts\dev.ps1 -Setup           # primera vez: .env, npm install, migraciones y seed
  .\scripts\dev.ps1 -Only auth,events,web
  .\scripts\dev.ps1 -NoWeb            # todo menos la web
  .\scripts\dev.ps1 -Status          # solo muestra el estado
  .\scripts\dev.ps1 -Stop            # detiene todo lo que levantó el script
  .\scripts\dev.ps1 -Background      # sin ventanas; logs en .dev\logs\

  Si Windows bloquea el script:  powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
#>
param(
  [string[]]$Only,
  [switch]$Setup,
  [switch]$Stop,
  [switch]$Status,
  [switch]$Background,
  [switch]$NoMailpit,
  [switch]$NoWeb,
  [int]$TimeoutSec = 120
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DevDir = Join-Path $Root '.dev'
$LogDir = Join-Path $DevDir 'logs'
$PidFile = Join-Path $DevDir 'pids.txt'
$OnWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows
if (-not $OnWindows) { $Background = $true }  # fuera de Windows no hay ventanas nuevas

$AllServices = @(
  [pscustomobject]@{ Name = 'auth';          Port = 3001; Db = $true;  Internal = $false }
  [pscustomobject]@{ Name = 'events';        Port = 3002; Db = $true;  Internal = $true }
  [pscustomobject]@{ Name = 'orders';        Port = 3003; Db = $true;  Internal = $true }
  [pscustomobject]@{ Name = 'payments';      Port = 3004; Db = $true;  Internal = $true }
  [pscustomobject]@{ Name = 'tickets';       Port = 3005; Db = $true;  Internal = $true }
  [pscustomobject]@{ Name = 'notifications'; Port = 3006; Db = $false; Internal = $true }
  [pscustomobject]@{ Name = 'checkin';       Port = 3007; Db = $true;  Internal = $true; Optional = $true }
)
# checkin es opcional: se incluye solo cuando su carpeta ya existe.
$AllServices = @($AllServices | Where-Object { -not $_.Optional -or (Test-Path (Join-Path $Root "services/$($_.Name)")) })
$WebDir = Join-Path $Root 'web'
$Services = $AllServices
$IncludeWeb = (-not $NoWeb) -and (Test-Path $WebDir)
if ($Only) {
  $wanted = $Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ }
  $unknown = $wanted | Where-Object { $_ -notin $AllServices.Name -and $_ -ne 'web' }
  if ($unknown) { throw "Servicio desconocido: $($unknown -join ', '). Opciones: $($AllServices.Name -join ', '), web" }
  $Services = @($AllServices | Where-Object { $_.Name -in $wanted })
  $IncludeWeb = $IncludeWeb -and ($wanted -contains 'web')
}

# ---------------------------------------------------------------- utilidades

function Write-Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn2($text){ Write-Host "  [!]  $text" -ForegroundColor Yellow }
function Write-Bad($text)  { Write-Host "  [X]  $text" -ForegroundColor Red }

function Test-Port([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return ($task.Wait(400) -and $client.Connected)
  } catch { return $false } finally { $client.Dispose() }
}

function Get-Health([int]$Port) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 3
    return [pscustomobject]@{ Code = [int]$r.StatusCode; Body = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $body = ''
      try { $body = $_.ErrorDetails.Message } catch {}
      return [pscustomobject]@{ Code = [int]$resp.StatusCode; Body = $body }
    }
    return [pscustomobject]@{ Code = 0; Body = '' }
  }
}

function Get-EnvValue([string]$File, [string]$Key) {
  if (-not (Test-Path $File)) { return $null }
  foreach ($line in Get-Content $File) {
    if ($line -match "^\s*$Key\s*=\s*(.*)\s*$") { return $Matches[1].Trim().Trim('"') }
  }
  return $null
}

function Save-Pid([string]$Name, [int]$ProcessId) {
  New-Item -ItemType Directory -Force -Path $DevDir | Out-Null
  $lines = @()
  # @(...) obliga a que sea lista aunque haya una sola línea (si no, += concatena texto).
  if (Test-Path $PidFile) { $lines = @(Get-Content $PidFile | Where-Object { $_ -notmatch "^$Name=" }) }
  $lines += "$Name=$ProcessId"
  Set-Content -Path $PidFile -Value $lines
}

function Stop-Tree([int]$ProcessId) {
  if ($OnWindows) {
    & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
  } else {
    $children = @()
    try { $children = (& pgrep -P $ProcessId) 2>$null } catch {}
    foreach ($c in $children) { Stop-Tree ([int]$c) }
    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Get-ShellExe {
  if ($PSVersionTable.PSVersion.Major -ge 6) { return (Get-Process -Id $PID).Path }
  return 'powershell.exe'
}

function Start-InWindow([string]$Name, [string]$Dir, [string]$Command) {
  $title = "EntradasYa - $Name"
  $shell = Get-ShellExe
  if ($Background) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $log = Join-Path $LogDir "$Name.log"
    "---- $(Get-Date -Format s) inicio ----" | Add-Content -Path $log
    $cmd = "Set-Location -LiteralPath '$Dir'; $Command *>> '$log'"
    $argList = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd)
    if ($OnWindows) { $p = Start-Process -FilePath $shell -ArgumentList $argList -WindowStyle Hidden -PassThru }
    else { $p = Start-Process -FilePath $shell -ArgumentList $argList -PassThru }
  } else {
    $cmd = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$Dir'; $Command"
    $p = Start-Process -FilePath $shell -ArgumentList @('-NoExit', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) -PassThru
  }
  Save-Pid $Name $p.Id
  return $p
}

function Show-Status {
  $rows = foreach ($s in $Services) {
    $h = Get-Health $s.Port
    $estado = switch ($h.Code) { 200 { 'ARRIBA' } 503 { 'CON FALLAS' } 0 { 'APAGADO' } default { "HTTP $($h.Code)" } }
    $detalle = ''
    if ($h.Body) { try { $j = $h.Body | ConvertFrom-Json; $detalle = ($j.checks.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' ' } catch {} }
    [pscustomobject]@{ Servicio = $s.Name; Puerto = $s.Port; Estado = $estado; Chequeos = $detalle; URL = "http://localhost:$($s.Port)/health" }
  }
  if ($IncludeWeb) {
    $web = 'APAGADO'; if (Test-Port 5173) { $web = 'ARRIBA' }
    $rows += [pscustomobject]@{ Servicio = 'web'; Puerto = 5173; Estado = $web; Chequeos = ''; URL = 'https://localhost:5173' }
  }
  $mail = 'APAGADO'; if ((Test-Port 1025) -or (Test-Port 8025)) { $mail = 'ARRIBA' }
  $rows += [pscustomobject]@{ Servicio = 'mailpit'; Puerto = '1025/8025'; Estado = $mail; Chequeos = ''; URL = 'http://localhost:8025' }
  Write-Host ''
  Write-Host ('  {0,-14} {1,-10} {2,-11} {3}' -f 'SERVICIO', 'PUERTO', 'ESTADO', 'DETALLE')
  foreach ($r in $rows) {
    $color = switch ($r.Estado) { 'ARRIBA' { 'Green' } 'APAGADO' { 'DarkGray' } default { 'Yellow' } }
    $info = $r.Chequeos; if (-not $info) { $info = $r.URL }
    Write-Host ('  {0,-14} {1,-10} {2,-11} {3}' -f $r.Servicio, $r.Puerto, $r.Estado, $info) -ForegroundColor $color
  }
  Write-Host ''
  return $rows
}

# ---------------------------------------------------------------- -Status / -Stop

if ($Status) { Show-Status | Out-Null; exit 0 }

if ($Stop) {
  Write-Step 'Deteniendo EntradasYa'
  $names = @($Services.Name)
  if ($IncludeWeb) { $names += 'web' }
  if (-not $Only) { $names += 'mailpit' }
  $stopped = 0
  if (Test-Path $PidFile) {
    $keep = @()
    foreach ($line in Get-Content $PidFile) {
      $parts = $line -split '=', 2
      if ($parts.Count -ne 2) { continue }
      if ($parts[0] -in $names) { Stop-Tree ([int]$parts[1]); Write-Ok "$($parts[0]) detenido"; $stopped++ }
      else { $keep += $line }
    }
    if ($keep.Count) { Set-Content -Path $PidFile -Value $keep } else { Remove-Item $PidFile -Force }
  }
  # Por si quedó algo escuchando que el script no levantó (p. ej. un "npm run start:dev" manual).
  if ($OnWindows -and (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    $ports = @($Services | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Port = $_.Port } })
    if ($IncludeWeb) { $ports += [pscustomobject]@{ Name = 'web'; Port = 5173 } }
    foreach ($s in $ports) {
      $conns = Get-NetTCPConnection -LocalPort $s.Port -State Listen -ErrorAction SilentlyContinue
      foreach ($c in $conns) { Stop-Tree $c.OwningProcess; Write-Ok "$($s.Name): liberado el puerto $($s.Port)"; $stopped++ }
    }
  }
  if ($stopped -eq 0) { Write-Host '  No había nada corriendo.' }
  exit 0
}

# ---------------------------------------------------------------- revisiones previas

Write-Step 'Revisando requisitos'
$problems = 0

$nodeVersion = $null
try { $nodeVersion = (& node -v) 2>$null } catch {}
if (-not $nodeVersion) { Write-Bad 'Node.js no está instalado o no está en el PATH (se necesita la 22 LTS).'; $problems++ }
elseif ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { Write-Bad "Node.js ${nodeVersion}: se necesita la 22 o superior."; $problems++ }
else { Write-Ok "Node.js $nodeVersion" }

if (Test-Port 5432) { Write-Ok 'PostgreSQL responde en el puerto 5432' }
else {
  Write-Bad 'PostgreSQL no responde en el puerto 5432.'
  Write-Host '       Inícialo: Servicios de Windows -> "postgresql-x64-XX" -> Iniciar (o: Start-Service postgresql*)'
  $problems++
}

$pub = Join-Path $Root 'keys/jwt-public.pem'
$priv = Join-Path $Root 'keys/jwt-private.pem'
if ((Test-Path $pub) -and (Test-Path $priv)) { Write-Ok 'Llaves JWT en keys\' }
else { Write-Bad 'Faltan las llaves JWT. Ejecuta desde la raíz:  node scripts/generate-jwt-keys.mjs'; $problems++ }

foreach ($s in $Services) {
  $dir = Join-Path $Root "services/$($s.Name)"
  if (-not (Test-Path $dir)) { Write-Bad "$($s.Name): no existe la carpeta services\$($s.Name)"; $problems++; continue }
  $envFile = Join-Path $dir '.env'
  if (-not (Test-Path $envFile)) {
    if ($Setup) { Copy-Item (Join-Path $dir '.env.example') $envFile; Write-Ok "$($s.Name): .env creado desde .env.example" }
    else { Write-Bad "$($s.Name): falta .env (usa -Setup o copia .env.example)"; $problems++ }
  }
  if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
    if (-not $Setup) { Write-Bad "$($s.Name): faltan dependencias (usa -Setup o ejecuta npm install)"; $problems++ }
  }
  if ($s.Db -and -not (Test-Path (Join-Path $dir 'prisma/migrations'))) {
    if (-not $Setup) { Write-Warn2 "$($s.Name): no tiene prisma\migrations (usa -Setup o: npx prisma migrate dev --name init)" }
  }
}

if ($IncludeWeb -and -not (Test-Path (Join-Path $WebDir 'node_modules')) -and -not $Setup) {
  Write-Bad 'web: faltan dependencias (usa -Setup o ejecuta npm install en web)'; $problems++
}

# Misma INTERNAL_API_KEY en todos los servicios internos.
$keys = @{}
foreach ($s in ($AllServices | Where-Object Internal)) {
  $v = Get-EnvValue (Join-Path $Root "services/$($s.Name)/.env") 'INTERNAL_API_KEY'
  if ($v) { $keys[$s.Name] = $v }
}
$distinct = @($keys.Values | Sort-Object -Unique)
if ($distinct.Count -gt 1) {
  Write-Bad 'La INTERNAL_API_KEY no es la misma en todos los .env:'
  $keys.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host ("         {0,-14} {1}" -f $_.Name, $_.Value) }
  Write-Host '       Debe ser igual en todos (en local: dev-internal-key-cambiar).'
  $problems++
} elseif ($distinct.Count -eq 1) { Write-Ok "INTERNAL_API_KEY igual en $($keys.Count) servicios" }

if ($problems -gt 0) { Write-Host "`nCorrige lo anterior y vuelve a ejecutar." -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- -Setup

if ($Setup) {
  foreach ($s in $Services) {
    $dir = Join-Path $Root "services/$($s.Name)"
    Write-Step "Preparando $($s.Name)"
    Push-Location $dir
    try {
      & npm install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw "npm install falló en $($s.Name)" }
      if ($s.Db) {
        if (Test-Path 'prisma/migrations') { & npx prisma migrate deploy }
        else {
          & npx prisma migrate dev --name init
          Write-Warn2 "Se creó prisma\migrations en $($s.Name): inclúyela en tu próximo commit."
        }
        if ($LASTEXITCODE -ne 0) { throw "Las migraciones fallaron en $($s.Name)" }
      }
      if ($s.Name -eq 'auth') { & npm run seed; if ($LASTEXITCODE -ne 0) { throw 'El seed de auth falló' } }
    } finally { Pop-Location }
  }
}

if ($Setup -and $IncludeWeb) {
  Write-Step 'Preparando web'
  Push-Location $WebDir
  try { & npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm install falló en web' } } finally { Pop-Location }
}

# ---------------------------------------------------------------- arrancar

Write-Step 'Arrancando'

if (-not $NoMailpit -and -not $Only) {
  if ((Test-Port 1025) -or (Test-Port 8025)) { Write-Ok 'Mailpit ya estaba corriendo' }
  else {
    $mailpit = $env:MAILPIT_PATH
    if (-not $mailpit) { $cmd = Get-Command mailpit -ErrorAction SilentlyContinue; if ($cmd) { $mailpit = $cmd.Source } }
    if ($mailpit) {
      Start-InWindow 'mailpit' $Root "& '$mailpit'" | Out-Null
      Write-Ok "Mailpit iniciado -> http://localhost:8025"
    } else {
      Write-Warn2 'No encontré Mailpit (winget install --id axllent.mailpit, o define MAILPIT_PATH). Las compras funcionan, pero sin correo.'
    }
  }
}

$started = @()
foreach ($s in $Services) {
  if (Test-Port $s.Port) {
    $h = Get-Health $s.Port
    if ($h.Code -eq 200 -or $h.Code -eq 503) { Write-Ok "$($s.Name) ya estaba corriendo en el puerto $($s.Port)"; continue }
    Write-Bad "$($s.Name): el puerto $($s.Port) está ocupado por otro programa. Ciérralo o usa .\scripts\dev.ps1 -Stop"
    exit 1
  }
  $dir = Join-Path $Root "services/$($s.Name)"
  Start-InWindow $s.Name $dir 'npm run start:dev' | Out-Null
  Write-Ok "$($s.Name) arrancando (puerto $($s.Port))"
  $started += $s
}

$webStarted = $false
if ($IncludeWeb) {
  if (Test-Port 5173) { Write-Ok 'web ya estaba corriendo en https://localhost:5173' }
  else { Start-InWindow 'web' $WebDir 'npm run dev' | Out-Null; Write-Ok 'web arrancando (https://localhost:5173)'; $webStarted = $true }
}

# ---------------------------------------------------------------- esperar /health

if ($started.Count -or $webStarted) {
  Write-Step "Esperando a que respondan (hasta $TimeoutSec s; la primera compilación tarda)"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $pending = [System.Collections.ArrayList]@($started)
  $webPending = $webStarted
  while (($pending.Count -gt 0 -or $webPending) -and (Get-Date) -lt $deadline) {
    if ($webPending -and (Test-Port 5173)) { Write-Ok 'web lista'; $webPending = $false }
    foreach ($s in @($pending)) {
      $h = Get-Health $s.Port
      if ($h.Code -eq 200) { Write-Ok "$($s.Name) listo"; $pending.Remove($s) }
      elseif ($h.Code -eq 503 -and $s.Name -eq 'notifications') { Write-Warn2 'notifications arriba, pero sin SMTP (¿Mailpit apagado?)'; $pending.Remove($s) }
    }
    if ($pending.Count -or $webPending) { Start-Sleep -Seconds 2 }
  }
  if ($webPending) { Write-Bad "web no respondió a tiempo. Revisa la ventana 'EntradasYa - web'" }
  foreach ($s in $pending) {
    $where = "la ventana 'EntradasYa - $($s.Name)'"
    if ($Background) { $where = ".dev\logs\$($s.Name).log" }
    Write-Bad "$($s.Name) no respondió a tiempo. Revisa el error en $where"
  }
}

Write-Step 'Estado'
$rows = Show-Status
$down = @($rows | Where-Object { $_.Servicio -ne 'mailpit' -and $_.Estado -ne 'ARRIBA' })
if ($down.Count -eq 0) {
  Write-Host 'Todo arriba. Prueba el flujo completo con:  node scripts/e2e-compra.mjs' -ForegroundColor Green
  if ($IncludeWeb) { Write-Host 'Abre la web en:                              https://localhost:5173  (acepta el aviso del certificado)' -ForegroundColor Green }
  Write-Host 'Para detener todo:                          .\scripts\dev.ps1 -Stop'
  exit 0
}
exit 1
