#requires -Version 5
<#
.SYNOPSIS
Create a git worktree that is actually ready to work in.

.DESCRIPTION
A worktree inherits none of this machine's per-worktree setup, and one of the
gaps does not fail loudly: without COMPOSE_PROJECT_NAME, docker-compose derives
its project name from the worktree directory and prefixes the volume with it,
so the tree mounts a brand-new EMPTY database on the same port. The app then
creates a schema and seeds a fresh admin, and the whole thing reads as data
loss. Every other step here fails in a way you would notice; that one does not,
which is the reason this script exists rather than a checklist.

It also gives the worktree its OWN database. Both trees share one PostgreSQL,
and what collides is migrations: an `alembic upgrade` run in one tree leaves
the other tree's models disagreeing with the schema - a broken app rather than
a merge conflict, and it says nothing about why.

See CLAUDE.md, "Git Worktrees", for when a worktree is worth its cost at all.
A plain `git checkout` is the default.

.EXAMPLE
.\worktree.ps1 -Topic quote-cards
Creates ..\anime_site_quote_cards on branch feat/quote-cards.

.EXAMPLE
.\worktree.ps1 -Topic legacy-notes -Type fix -From main
#>
[CmdletBinding()]
param(
    # Short kebab-case topic. Becomes the branch suffix and the directory name.
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+(-[a-z0-9]+)*$')]
    [string]$Topic,

    # Conventional-commit prefix, matching the branch naming rule in CLAUDE.md.
    [ValidateSet('feat', 'fix', 'docs', 'refactor', 'test', 'chore')]
    [string]$Type = 'feat',

    # What to branch FROM. dev is the integration branch; see CLAUDE.md.
    [string]$From = 'dev',

    # Skip creating and migrating the worktree's database. Use when the tree
    # only needs to run lint, unit tests or a frontend build.
    [switch]$SkipDatabase
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dbContainer = 'anime_site_postgres_db'

$slug = $Topic -replace '-', '_'
$branch = "$Type/$Topic"
$target = Join-Path (Split-Path $root -Parent) "anime_site_$slug"
$workDb = "anime_site_$slug"

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Note($text) { Write-Host "    $text" -ForegroundColor DarkGray }

# Windows PowerShell 5.1 turns a native command's stderr into an ErrorRecord,
# and $ErrorActionPreference = 'Stop' then makes it terminating - so `git
# worktree add` writing its ordinary "Preparing worktree" progress line kills
# the script on success. Every native call goes through here instead: stderr
# stays informational and the EXIT CODE decides, which is the only thing that
# actually says whether the command worked.
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [Parameter(Mandatory = $true)][string]$What,
        [switch]$IgnoreExitCode
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # git, pip and alembic all write ordinary progress to stderr. Merging
        # it into the success stream and flattening the ErrorRecords keeps a
        # successful run from printing a wall of red that reads as failure.
        # $? is unreliable after this - the exit code below is what decides.
        & $Command 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) {
                Write-Host "    $($_.ToString())" -ForegroundColor DarkGray
            }
            else { Write-Host "    $_" -ForegroundColor DarkGray }
        }
    }
    finally { $ErrorActionPreference = $previous }
    if (-not $IgnoreExitCode -and $LASTEXITCODE -ne 0) {
        throw "$What failed (exit $LASTEXITCODE)."
    }
}

if (Test-Path $target) {
    throw "$target already exists. Remove it first: git worktree remove $target"
}

# --- The worktree itself -----------------------------------------------------
# Branch from $From explicitly. Without it git branches from whatever the main
# directory has checked out, which is usually mid-task and not what you meant.
Step "Creating worktree $target on $branch (from $From)"
Invoke-Native { git -C $root fetch origin $From --quiet } 'git fetch'
Invoke-Native { git -C $root worktree add $target -b $branch "origin/$From" } 'git worktree add' 

# --- Secrets, which travel nowhere ------------------------------------------
Step 'Copying .env and credentials.json'
foreach ($file in @('.env', 'credentials.json')) {
    $src = Join-Path $root $file
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $target $file)
        Note "copied $file"
    }
    else {
        Write-Host "    MISSING: $file is not in the main tree." -ForegroundColor Yellow
        Write-Host '    The worktree will not start without it.' -ForegroundColor Yellow
    }
}

# --- The two settings that make the worktree safe ---------------------------
# COMPOSE_PROJECT_NAME is the one whose absence looks like data loss.
# POSTGRES_DB is what keeps this tree's migrations off the other tree's schema.
$envPath = Join-Path $target '.env'
if (Test-Path $envPath) {
    Step 'Pinning COMPOSE_PROJECT_NAME and giving this tree its own database'
    $lines = @(Get-Content $envPath)

    $settings = @{
        'COMPOSE_PROJECT_NAME' = 'anime_site'
        'POSTGRES_DB'          = $workDb
    }
    foreach ($key in $settings.Keys) {
        $value = $settings[$key]
        $found = $false
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^\s*$key\s*=") {
                $lines[$i] = "$key=$value"
                $found = $true
            }
        }
        if (-not $found) { $lines += "$key=$value" }
        Note "$key=$value"
    }
    Set-Content -Path $envPath -Value $lines -Encoding utf8
}

# --- Python -----------------------------------------------------------------
# There is no system `python` on PATH on either machine, so the existing venv
# bootstraps the new one. requirements-dev.txt starts with `-r requirements.txt`,
# so this one install covers both files.
Step 'Building venv and installing dependencies'
$newPython = Join-Path $target 'venv\Scripts\python.exe'
Invoke-Native { & (Join-Path $root 'venv\Scripts\python.exe') -m venv (Join-Path $target 'venv') } 'venv creation'
Invoke-Native { & $newPython -m pip install --quiet --upgrade pip } 'pip upgrade'
Invoke-Native { & $newPython -m pip install --quiet -r (Join-Path $target 'requirements-dev.txt') } 'pip install' 

# --- Node -------------------------------------------------------------------
Step 'npm install'
Push-Location (Join-Path $target 'frontend')
try {
    Invoke-Native { npm install --silent } 'npm install' 
}
finally { Pop-Location }

# --- Database ---------------------------------------------------------------
if (-not $SkipDatabase) {
    $running = @()
    Invoke-Native { $script:running = @(docker ps --filter "name=$dbContainer" --format '{{.Names}}') } 'docker ps' -IgnoreExitCode
    $running = $script:running
    if ($running -notcontains $dbContainer) {
        Write-Host "    $dbContainer is not running - skipping database setup." -ForegroundColor Yellow
        Write-Host "    Start it with docker-compose up -d, then in the worktree run:" -ForegroundColor Yellow
        Write-Host "      venv\Scripts\python.exe -m alembic upgrade head" -ForegroundColor Yellow
    }
    else {
        Step "Creating database $workDb and building its schema"
        # createdb exits non-zero when the database exists, which is fine.
        Invoke-Native { docker exec $dbContainer createdb -U postgres $workDb } 'createdb' -IgnoreExitCode
        Push-Location $target
        try {
            # The ordinary command. It builds the schema from nothing and is
            # pinned by tests/api/test_migrations_build_the_schema.py to
            # produce exactly what the models declare. It could not do either
            # until the chain was squashed onto a baseline: the old initial
            # revision aborted its transaction on an empty database and the
            # whole run rolled back to zero tables.
            Invoke-Native { & $newPython -m alembic upgrade head } 'alembic upgrade'
        }
        finally { Pop-Location }
        Note "$workDb has the schema and nothing else - Pull All from /system to fill it."
    }
}

# --- Ports ------------------------------------------------------------------
# dev.ps1 hard-codes :8000 and aborts if it is taken, deliberately: a second
# uvicorn would fail to bind and surface only as Vite proxy errors. So a
# worktree that has to RUN needs its own port; one that only tests and builds
# needs nothing here.
$port = 8001
while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }

Write-Host ''
Write-Host "Worktree ready: $target" -ForegroundColor Green
Write-Host "  branch    $branch (from origin/$From)"
Write-Host "  database  $workDb"
Write-Host ''
Write-Host '  Tests (take the lock first - one pytest at a time across every tree):'
Write-Host "    venv\Scripts\python.exe -m pytest -q"
Write-Host ''
Write-Host '  To RUN it - dev.ps1 will not work here, it wants :8000:'
Write-Host "    venv\Scripts\python.exe -m uvicorn app.main:app --reload --port $port"
Write-Host ''
Write-Host '  When the branch has merged:'
Write-Host "    git worktree remove $target"
Write-Host "    docker exec $dbContainer dropdb -U postgres $workDb"
