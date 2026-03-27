# build-desktop.ps1
# Kills any running sidecar, builds fresh sidecar, waits until Windows
# releases the file lock, then runs tauri build to produce the installer.

$ErrorActionPreference = "Stop"
$sidecarName    = "backend-server-x86_64-pc-windows-msvc"
$sidecarRunning = "backend-server"
$sidecarExe     = "apps\web\src-tauri\binaries\$sidecarName.exe"

# Step 1: Kill any running sidecar from a previous session
Write-Host ">> Stopping old sidecar (if running)..." -ForegroundColor Cyan
$proc = Get-Process $sidecarRunning -ErrorAction SilentlyContinue
if ($proc) {
    $proc | Stop-Process -Force
    $proc.WaitForExit(5000)
    Write-Host "   Stopped." -ForegroundColor Green
} else {
    Write-Host "   Not running." -ForegroundColor DarkGray
}

# Step 2: Build the sidecar binary
Write-Host ">> Building sidecar..." -ForegroundColor Cyan
bun build --compile --outfile "apps/web/src-tauri/binaries/$sidecarName" apps/backend/src/server.ts

if ($LASTEXITCODE -ne 0) {
    Write-Host "   Sidecar build failed." -ForegroundColor Red
    exit 1
}
Write-Host "   Built OK." -ForegroundColor Green

# Step 3: Wait until Windows/AV releases the file lock
Write-Host ">> Waiting for file lock to be released..." -ForegroundColor Cyan
$timeoutMs  = 30000
$intervalMs = 500
$elapsed    = 0
$ready      = $false

while ($elapsed -lt $timeoutMs) {
    try {
        $stream = [System.IO.File]::Open($sidecarExe, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $stream.Close()
        $ready = $true
        Write-Host "   File is accessible." -ForegroundColor Green
        break
    } catch {
        Start-Sleep -Milliseconds $intervalMs
        $elapsed += $intervalMs
    }
}

if (-not $ready) {
    Write-Host "   Timed out waiting for file lock - continuing anyway." -ForegroundColor Yellow
}

# Step 4: Run tauri build
Write-Host ">> Building Tauri app..." -ForegroundColor Cyan
bun run --filter "@aurelius/web" tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host "   Tauri build failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host ">> Build complete!" -ForegroundColor Green
Write-Host "   Installer: apps\web\src-tauri\target\release\bundle\nsis\Aurelius_0.1.0_x64-setup.exe" -ForegroundColor Green
exit 0
