#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Trust Layer — One-command launch and demo
.DESCRIPTION
    Starts the Trust Layer proxy and seeds demo data.
    Uses Docker if available, otherwise falls back to Node.js.
#>

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Trust Layer — Launch Kit      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check for Docker
$useDocker = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
$useDocker = $useDocker -and ($null -ne (docker info 2>&1 | Select-String "Server Version"))

if ($useDocker) {
    Write-Host ">> Using Docker..." -ForegroundColor Green
    docker compose up --build -d
    Write-Host ">> Waiting for proxy..." -ForegroundColor Yellow
    do { Start-Sleep -Seconds 2 } while ($null -eq (try { curl.exe -s http://localhost:3000/health 2>$null } catch { $null }))
} else {
    Write-Host ">> Docker not available, using Node.js..." -ForegroundColor Yellow
    Write-Host ">> Building packages..." -ForegroundColor Yellow
    npm install --silent
    npm run build 2>&1 | Out-Null

    # Start proxy in background
    $startInfo = @{
        FilePath = "node"
        ArgumentList = "-e", "const m = require('$ROOT/packages/trust-proxy/dist/start.js'); m.startProxy().catch(e => { console.error('Fatal:', e.message); process.exit(1); })"
        WindowStyle = "Hidden"
        PassThru = $true
    }
    $proc = Start-Process @startInfo
    Write-Host ">> Proxy starting (PID: $($proc.Id))..." -ForegroundColor Yellow

    # Wait for proxy to be ready
    do { Start-Sleep -Seconds 2 } while ($null -eq (try { Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 2 } catch { $null }))
}

Write-Host ">> Proxy is running on http://localhost:3000" -ForegroundColor Green

# Seed demo data
Write-Host ">> Seeding demo data..." -ForegroundColor Yellow
try {
    node "$ROOT/scripts/seed-demo.mjs"
} catch {
    Write-Host ">> Seed failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          Ready for Demo!             ║" -ForegroundColor Green
Write-Host "║                                      ║" -ForegroundColor Green
Write-Host "║  API:      http://localhost:3000     ║" -ForegroundColor Green
Write-Host "║  Dashboard: http://localhost:5173    ║" -ForegroundColor Green
Write-Host "║                                      ║" -ForegroundColor Green
Write-Host "║  Try:  curl localhost:3000/health    ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

if (-not $useDocker) {
    Write-Host ">> Stop with: Stop-Process -Id $($proc.Id)" -ForegroundColor Gray
}
