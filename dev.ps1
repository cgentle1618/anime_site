#requires -Version 5
# Local dev launcher: Postgres (docker) + uvicorn (--reload) + vite frontend.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host '==> Starting PostgreSQL (docker-compose up -d)' -ForegroundColor Cyan
docker-compose --project-directory $root up -d
if ($LASTEXITCODE -ne 0) { throw 'docker-compose failed - is Docker Desktop running?' }

Write-Host '==> Opening dev window: uvicorn | vite' -ForegroundColor Cyan
$uvicorn = "& '$root\venv\Scripts\uvicorn.exe' app.main:app --reload"

wt.exe new-tab -d "$root" --title uvicorn powershell -NoExit -Command $uvicorn `; split-pane -V -d "$root\frontend" --title frontend powershell -NoExit -Command "npm run dev"
