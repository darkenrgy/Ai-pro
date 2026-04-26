$ErrorActionPreference = 'Stop'

param(
    [string]$DatasetPath = 'dataset.csv',
    [string]$ModelOutputPath = 'ai_moderation_model.pkl',
    [string]$Host = '127.0.0.1',
    [int]$Port = 8001,
    [string]$PythonExe = '',
    [switch]$KeepApiRunning
)

function Resolve-ProjectRoot {
    if ($PSScriptRoot -and (Test-Path $PSScriptRoot)) {
        return $PSScriptRoot
    }
    return (Get-Location).Path
}

function Resolve-PythonExecutable {
    param(
        [string]$ProjectRoot,
        [string]$ProvidedPath
    )

    if ($ProvidedPath -and (Test-Path $ProvidedPath)) {
        return (Resolve-Path $ProvidedPath).Path
    }

    $venvPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    if (Test-Path $venvPython) {
        return $venvPython
    }

    return 'python'
}

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path $Path)) {
        throw "$Description not found: $Path"
    }
}

function Invoke-Training {
    param(
        [string]$ProjectRoot,
        [string]$PythonPath,
        [string]$Dataset,
        [string]$ModelOutput
    )

    Write-Host "[1/4] Training moderation model..." -ForegroundColor Cyan
    $args = @(
        '-m', 'moderation_service.app.ml_model',
        '--dataset', $Dataset,
        '--output', $ModelOutput
    )

    Push-Location $ProjectRoot
    try {
        & $PythonPath @args
        if ($LASTEXITCODE -ne 0) {
            throw "Training failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Start-ModerationApi {
    param(
        [string]$ProjectRoot,
        [string]$PythonPath,
        [string]$ApiHost,
        [int]$ApiPort
    )

    Write-Host "[2/4] Starting moderation API..." -ForegroundColor Cyan
    $tmpDir = Join-Path $ProjectRoot '.tmp'
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $logPath = Join-Path $tmpDir "moderation-api-$stamp.log"

    $args = @(
        '-m', 'uvicorn', 'moderation_service.app.main:app',
        '--host', $ApiHost,
        '--port', $ApiPort.ToString(),
        '--no-access-log'
    )

    $process = Start-Process \
        -FilePath $PythonPath \
        -ArgumentList $args \
        -WorkingDirectory $ProjectRoot \
        -RedirectStandardOutput $logPath \
        -RedirectStandardError $logPath \
        -PassThru

    return [pscustomobject]@{
        Process = $process
        LogPath = $logPath
        BaseUrl = "http://$ApiHost:$ApiPort"
    }
}

function Wait-ForApiHealth {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$HealthUrl,
        [string]$LogPath
    )

    $maxAttempts = 50
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        if ($Process.HasExited) {
            $tail = if (Test-Path $LogPath) { (Get-Content $LogPath -Tail 60 | Out-String) } else { '' }
            throw "Moderation API exited early. Log: $LogPath`n$tail"
        }

        try {
            $response = Invoke-RestMethod -Method Get -Uri $HealthUrl -TimeoutSec 2
            if ($response.status -eq 'ok') {
                return
            }
        }
        catch {
            # Continue polling until API is healthy.
        }

        [System.Threading.Tasks.Task]::Delay(200).Wait()
    }

    $tail = if (Test-Path $LogPath) { (Get-Content $LogPath -Tail 60 | Out-String) } else { '' }
    throw "Moderation API did not become healthy at $HealthUrl. Log: $LogPath`n$tail"
}

function Invoke-AnalyzeCase {
    param(
        [string]$BaseUrl,
        [hashtable]$Payload
    )

    $uri = "$BaseUrl/analyze"
    $body = $Payload | ConvertTo-Json -Depth 10
    return Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $body -TimeoutSec 6
}

function Run-SampleChecks {
    param([string]$BaseUrl)

    Write-Host "[3/4] Running sample moderation checks..." -ForegroundColor Cyan

    $results = New-Object System.Collections.Generic.List[object]
    $sessionId = 'demo-session-001'
    $userId = 'demo-user-001'

    $cases = @(
        @{
            Name = 'Safe baseline text'
            Content = 'Hello team, meeting at 10am for project status update.'
            ExpectFlagged = $false
            ExpectBlockSession = $false
        },
        @{
            Name = 'Risky text - pass 1'
            Content = 'I want to buy illegal weapons and ammo no questions asked.'
            ExpectFlagged = $true
            ExpectBlockSession = $false
        },
        @{
            Name = 'Risky text - pass 2'
            Content = 'I want to buy illegal weapons and ammo no questions asked.'
            ExpectFlagged = $true
            ExpectBlockSession = $false
        },
        @{
            Name = 'Risky text - pass 3'
            Content = 'I want to buy illegal weapons and ammo no questions asked.'
            ExpectFlagged = $true
            ExpectBlockSession = $false
        },
        @{
            Name = 'Risky text - pass 4 (session lock)'
            Content = 'I want to buy illegal weapons and ammo no questions asked.'
            ExpectFlagged = $true
            ExpectBlockSession = $true
        }
    )

    foreach ($case in $cases) {
        $payload = @{
            type = 'text'
            content = $case.Content
            session_id = $sessionId
            user_id = $userId
        }

        try {
            $response = Invoke-AnalyzeCase -BaseUrl $BaseUrl -Payload $payload

            $hasRiskScore = $null -ne $response.risk_score -and $response.risk_score -ge 0 -and $response.risk_score -le 100
            $flaggedMatch = [bool]$response.flagged -eq [bool]$case.ExpectFlagged
            $sessionMatch = [bool]$response.block_session -eq [bool]$case.ExpectBlockSession
            $hasAction = -not [string]::IsNullOrWhiteSpace([string]$response.action)
            $hasCategory = -not [string]::IsNullOrWhiteSpace([string]$response.category)

            $pass = $hasRiskScore -and $flaggedMatch -and $sessionMatch -and $hasAction -and $hasCategory
            $detail = "risk=$($response.risk_score), flagged=$($response.flagged), action=$($response.action), block_session=$($response.block_session), category=$($response.category)"

            $results.Add([pscustomobject]@{
                Test = $case.Name
                Status = if ($pass) { 'PASS' } else { 'FAIL' }
                Detail = $detail
            }) | Out-Null
        }
        catch {
            $results.Add([pscustomobject]@{
                Test = $case.Name
                Status = 'FAIL'
                Detail = $_.Exception.Message
            }) | Out-Null
        }
    }

    return $results
}

$projectRoot = Resolve-ProjectRoot
$pythonPath = Resolve-PythonExecutable -ProjectRoot $projectRoot -ProvidedPath $PythonExe

$resolvedDataset = if ([System.IO.Path]::IsPathRooted($DatasetPath)) { $DatasetPath } else { Join-Path $projectRoot $DatasetPath }
$resolvedModelOutput = if ([System.IO.Path]::IsPathRooted($ModelOutputPath)) { $ModelOutputPath } else { Join-Path $projectRoot $ModelOutputPath }

Assert-PathExists -Path $resolvedDataset -Description 'Dataset CSV'

$apiRuntime = $null
$results = $null

try {
    Invoke-Training -ProjectRoot $projectRoot -PythonPath $pythonPath -Dataset $resolvedDataset -ModelOutput $resolvedModelOutput
    Assert-PathExists -Path $resolvedModelOutput -Description 'Trained model artifact'

    $apiRuntime = Start-ModerationApi -ProjectRoot $projectRoot -PythonPath $pythonPath -ApiHost $Host -ApiPort $Port
    Wait-ForApiHealth -Process $apiRuntime.Process -HealthUrl "$($apiRuntime.BaseUrl)/health" -LogPath $apiRuntime.LogPath

    $results = Run-SampleChecks -BaseUrl $apiRuntime.BaseUrl

    Write-Host "[4/4] Summary" -ForegroundColor Cyan
    $results | Format-Table -AutoSize | Out-String -Width 300 | Write-Output

    $passCount = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
    $failCount = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
    Write-Output "SUMMARY: pass=$passCount fail=$failCount"
    Write-Output "MODEL: $resolvedModelOutput"
    Write-Output "API LOG: $($apiRuntime.LogPath)"

    if ($failCount -gt 0) {
        exit 1
    }
}
finally {
    if ($apiRuntime -and $apiRuntime.Process -and -not $KeepApiRunning.IsPresent) {
        if (-not $apiRuntime.Process.HasExited) {
            Stop-Process -Id $apiRuntime.Process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}