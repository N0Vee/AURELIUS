param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Escape-SingleQuotedString {
    param([string]$Value)

    return $Value -replace "'", "''"
}

function Assert-CommandAvailable {
    param([string]$CommandName)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command '$CommandName' was not found in PATH."
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$escapedRepoRoot = Escape-SingleQuotedString $repoRoot

Assert-CommandAvailable 'powershell'
Assert-CommandAvailable 'bun'
Assert-CommandAvailable 'uv'

$services = @(
    @{
        Name = 'Backend'
        WindowTitle = 'Aurelius Backend'
        Command = 'bun run dev:backend'
    },
    @{
        Name = 'Audio'
        WindowTitle = 'Aurelius Audio'
        Command = 'bun run dev:audio'
    },
    @{
        Name = 'Frontend'
        WindowTitle = 'Aurelius Frontend'
        Command = 'bun run dev:web'
    }
)

foreach ($service in $services) {
    $escapedTitle = Escape-SingleQuotedString $service.WindowTitle
    $launchCommand = @(
        "Set-Location -LiteralPath '$escapedRepoRoot'"
        "`$Host.UI.RawUI.WindowTitle = '$escapedTitle'"
        "Write-Host '[Aurelius] Starting $($service.Name)...' -ForegroundColor Cyan"
        $service.Command
    ) -join '; '

    $startArguments = @(
        '-NoExit'
        '-ExecutionPolicy'
        'Bypass'
        '-Command'
        $launchCommand
    )

    if ($DryRun) {
        Write-Host "[$($service.Name)] powershell $($startArguments -join ' ')"
        continue
    }

    Start-Process -FilePath 'powershell' -WorkingDirectory $repoRoot -ArgumentList $startArguments | Out-Null
}

if ($DryRun) {
    Write-Host 'Dry run complete. No processes were started.' -ForegroundColor Yellow
    exit 0
}

Write-Host 'Started frontend, backend, and audio in separate PowerShell windows.' -ForegroundColor Green
Write-Host 'Close the individual windows to stop each service.' -ForegroundColor DarkGray