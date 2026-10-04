#Requires -Version 7.2
<#
.SYNOPSIS
  Airwise local operations. Run from any directory.

.EXAMPLE
  ./scripts/ops.ps1 setup            # build and start (http://127.0.0.1:8102)
  ./scripts/ops.ps1 start | stop | status | logs
  ./scripts/ops.ps1 seed             # load the bundled snapshot (idempotent upsert)
  ./scripts/ops.ps1 backup           # consistent SQLite copy into ./backups
  ./scripts/ops.ps1 restore backups/airwise-20261004-120000.db -Yes
  ./scripts/ops.ps1 reset-demo -Yes  # delete stored data, start again from the snapshot
  ./scripts/ops.ps1 outage-on        # demo: point at an unreachable provider
  ./scripts/ops.ps1 outage-off       # back to the real provider
  ./scripts/ops.ps1 test             # ruff, mypy, pytest, web lint/types/unit tests
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0, Mandatory)]
  [ValidateSet('setup', 'start', 'stop', 'status', 'logs', 'seed', 'backup', 'restore', 'reset-demo', 'outage-on', 'outage-off', 'test')]
  [string]$Command,
  [Parameter(Position = 1)]
  [string]$Target,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
$Url = 'http://127.0.0.1:8102'

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Initialize-DotEnv {
  if (-not (Test-Path -LiteralPath (Join-Path $Root '.env'))) {
    Copy-Item -LiteralPath (Join-Path $Root '.env.example') -Destination (Join-Path $Root '.env')
    Write-Host 'Created .env from .env.example (no secrets needed).'
  }
}

function Wait-Healthy([int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try { if ((Invoke-WebRequest -Uri "$Url/readyz" -TimeoutSec 3 -SkipHttpErrorCheck).StatusCode -eq 200) { return } } catch { }
    Start-Sleep -Seconds 2
  }
  throw "Airwise did not become ready within $TimeoutSeconds s. Check: ./scripts/ops.ps1 logs"
}

function Get-BackupDir {
  $dir = Join-Path $Root 'backups'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  (Resolve-Path -LiteralPath $dir).Path
}

# Recreates the app container with extra environment variables (used by the outage drill).
function Restart-With([hashtable]$Environment) {
  foreach ($k in $Environment.Keys) { Set-Item -Path "env:$k" -Value $Environment[$k] }
  try { Invoke-Checked docker @('compose', 'up', '-d', '--wait', '--force-recreate', 'app') }
  finally { foreach ($k in $Environment.Keys) { Remove-Item -Path "env:$k" -ErrorAction SilentlyContinue } }
}

switch ($Command) {
  'setup' {
    Initialize-DotEnv
    Invoke-Checked docker @('compose', 'build')
    Invoke-Checked docker @('compose', 'up', '-d', '--wait')
    Write-Host "Airwise is running at $Url"
  }
  'start' {
    Initialize-DotEnv
    Invoke-Checked docker @('compose', 'up', '-d', '--wait')
    Wait-Healthy
    Write-Host "Airwise is running at $Url"
  }
  'stop' {
    Invoke-Checked docker @('compose', 'down')
    Write-Host 'Stopped. Data volume airwise_data was kept.'
  }
  'status' {
    Invoke-Checked docker @('compose', 'ps', '--format', 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Ports}}')
    $ids = docker compose ps -q
    if ($ids) { Invoke-Checked docker (@('stats', '--no-stream', '--format', 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}') + $ids) }
    $s = Invoke-RestMethod "$Url/api/status"
    Write-Host "Data: $($s.freshness.state) ($($s.freshness.source)), circuit $($s.circuit), provider calls last minute $($s.callsLastMinute)"
  }
  'logs' { Invoke-Checked docker @('compose', 'logs', '--tail', '200', '--timestamps', 'app') }
  'seed' { Invoke-Checked docker @('compose', 'exec', 'app', 'python', '-m', 'airwise.cli', 'load-snapshot') }
  'backup' {
    $name = "airwise-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"
    Invoke-Checked docker @('compose', 'exec', 'app', 'python', '-m', 'airwise.cli', 'backup', "/data/backups/$name")
    Invoke-Checked docker @('compose', 'cp', "app:/data/backups/$name", (Join-Path (Get-BackupDir) $name))
    Invoke-Checked docker @('compose', 'exec', 'app', 'rm', '-f', "/data/backups/$name")
    Write-Host "Backup written: backups/$name"
  }
  'restore' {
    if (-not $Target) { throw 'Usage: ops.ps1 restore <backups/file.db> -Yes' }
    $file = Get-Item -LiteralPath $Target
    if ($file.DirectoryName -ne (Get-BackupDir)) { throw "Restore only reads files from $(Get-BackupDir)" }
    if (-not $Yes) { Write-Warning "Restore REPLACES all stored Airwise data with $($file.Name). Re-run with -Yes."; exit 2 }
    Invoke-Checked docker @('compose', 'stop', 'app')
    Invoke-Checked docker @('compose', 'run', '--rm', '--no-deps', '-v', "$(Get-BackupDir):/restore:ro", 'app',
      'python', '-m', 'airwise.cli', 'restore', "/restore/$($file.Name)", '--yes')
    Invoke-Checked docker @('compose', 'start', 'app')
    Wait-Healthy
    Write-Host "Restored $($file.Name)."
  }
  'reset-demo' {
    if (-not $Yes) { Write-Warning 'reset-demo DELETES the stored observations and refresh history (volume airwise_data). Re-run with -Yes.'; exit 2 }
    Invoke-Checked docker @('compose', 'down', '-v')
    Invoke-Checked docker @('compose', 'up', '-d', '--wait')
    Write-Host 'Fresh start: the first request fetches live data, or loads the snapshot if the provider is unreachable.'
  }
  'outage-on' {
    # .invalid is reserved (RFC 2606) and never resolves: every attempt fails fast with a network error.
    Restart-With @{ AIRWISE_PROVIDER_BASE_URL = 'https://provider.invalid'; AIRWISE_FRESH_TTL_S = '60' }
    Write-Host 'Provider now unreachable; data older than 60 s triggers a refresh that fails. Saved data stays visible.'
  }
  'outage-off' {
    Restart-With @{}
    Write-Host 'Back to the real provider.'
  }
  'test' {
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    $uvPath = if ($uv) { $uv.Source } else { Join-Path (Split-Path $Root) '.tools/uv-venv/Scripts/uv.exe' }
    Invoke-Checked $uvPath @('run', 'ruff', 'format', '--check', '.')
    Invoke-Checked $uvPath @('run', 'ruff', 'check', '.')
    Invoke-Checked $uvPath @('run', 'mypy')
    Invoke-Checked $uvPath @('run', 'pytest')
    Push-Location web
    try {
      Invoke-Checked npm @('run', 'format:check')
      Invoke-Checked npm @('run', 'lint')
      Invoke-Checked npm @('run', 'typecheck')
      Invoke-Checked npm @('test')
    } finally { Pop-Location }
    Write-Host 'All checks passed. E2E: cd web; npm run test:e2e (requires the running stack: ./scripts/ops.ps1 start).'
  }
}
