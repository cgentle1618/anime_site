#requires -Version 5
# Local dev launcher: Postgres (docker) + uvicorn (--reload) + vite frontend.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dbContainer = 'anime_site_postgres_db'

# --- Guard: a leftover backend on :8000 makes the new uvicorn die with WinError 10048,
# --- which surfaces only as vite "ECONNREFUSED 127.0.0.1:8000" proxy errors.
$stale = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($stale) {
    $owner = Get-Process -Id $stale[0].OwningProcess -ErrorAction SilentlyContinue
    Write-Host "==> Port 8000 is already in use by $($owner.ProcessName) (PID $($stale[0].OwningProcess))." -ForegroundColor Yellow
    Write-Host '    Close that uvicorn window first, or run:' -ForegroundColor Yellow
    Write-Host "      Stop-Process -Id $($stale[0].OwningProcess) -Force" -ForegroundColor Yellow
    throw 'Backend port 8000 is occupied - aborting so the new server does not fail to bind.'
}

# --- Guard: a native PostgreSQL service binds 5432 too and usually wins the race
# --- against the container. Everything below would still report success - the
# --- pg_isready check runs *inside* the container - while uvicorn silently talks
# --- to the native server's separate, usually empty database. That is exactly
# --- what this machine did until 2026-09-08; see docs/switching-environments.md.
$nativeSvc = @(Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue |
               Where-Object { $_.Status -eq 'Running' })
$nativeProc = @(Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue |
                ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
                Where-Object { $_.ProcessName -eq 'postgres' })
if ($nativeSvc -or $nativeProc) {
    Write-Host '==> A native PostgreSQL server is running on this machine.' -ForegroundColor Yellow
    foreach ($s in $nativeSvc) { Write-Host "      service: $($s.Name) ($($s.Status))" -ForegroundColor Yellow }
    foreach ($p in $nativeProc) { Write-Host "      process: $($p.ProcessName) (PID $($p.Id)) listening on 5432" -ForegroundColor Yellow }
    Write-Host '    It will shadow the docker-compose container on port 5432, and the app' -ForegroundColor Yellow
    Write-Host '    would run against the wrong database without saying so. Stop it from an' -ForegroundColor Yellow
    Write-Host '    elevated PowerShell:' -ForegroundColor Yellow
    if ($nativeSvc) {
        $names = ($nativeSvc | ForEach-Object { $_.Name }) -join ', '
        Write-Host "      Stop-Service $names -Force" -ForegroundColor Yellow
        Write-Host "      Set-Service $names -StartupType Manual" -ForegroundColor Yellow
    }
    throw 'A native PostgreSQL server would shadow the container - aborting.'
}

Write-Host '==> Starting PostgreSQL (docker-compose up -d)' -ForegroundColor Cyan
docker-compose --project-directory $root up -d
if ($LASTEXITCODE -ne 0) { throw 'docker-compose failed - is Docker Desktop running?' }

# --- Wait for Postgres to accept connections. app/main.py touches the DB at import
# --- time (create_all) and uvicorn only binds :8000 after that, so starting the
# --- backend against a still-booting container is what delays the port opening.
Write-Host '==> Waiting for PostgreSQL to accept connections' -NoNewline -ForegroundColor Cyan
$dbReady = $false
foreach ($i in 1..60) {
    docker exec $dbContainer pg_isready -q 2>$null
    if ($LASTEXITCODE -eq 0) { $dbReady = $true; break }
    Write-Host '.' -NoNewline
    Start-Sleep -Milliseconds 500
}
Write-Host ''
if (-not $dbReady) { throw "PostgreSQL ($dbContainer) did not become ready within 30s." }

Write-Host '==> Opening dev window: uvicorn | vite' -ForegroundColor Cyan
$uvicorn = "& '$root\venv\Scripts\uvicorn.exe' app.main:app --reload --reload-dir app"

wt.exe new-tab -d "$root" --title uvicorn powershell -NoExit -Command $uvicorn `; split-pane -V -d "$root\frontend" --title frontend powershell -NoExit -Command "npm run dev"

# --- Don't report ready until the backend actually holds :8000, otherwise opening
# --- the site too early produces a page full of failed /api requests.
Write-Host '==> Waiting for backend on http://127.0.0.1:8000' -NoNewline -ForegroundColor Cyan
$apiReady = $false
foreach ($i in 1..120) {
    try {
        Invoke-WebRequest 'http://127.0.0.1:8000/api/announcements/' -UseBasicParsing -TimeoutSec 2 | Out-Null
        $apiReady = $true; break
    } catch {
        if ($_.Exception.Response) { $apiReady = $true; break }  # responding, just non-2xx
    }
    Write-Host '.' -NoNewline
    Start-Sleep -Milliseconds 500
}
Write-Host ''
if ($apiReady) {
    Write-Host '==> Ready: http://localhost:5173/' -ForegroundColor Green
} else {
    Write-Host '==> Backend did not respond within 60s - check the uvicorn pane for errors.' -ForegroundColor Red
}
