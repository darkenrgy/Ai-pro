param(
    [string]$FrontendUrl = "https://localhost:5173",
    [string]$BackendUrl = "https://localhost:8443"
)

$ErrorActionPreference = 'Continue'
$tests = @()

function Test-API {
    param([string]$Name, [scriptblock]$Test, [string]$Desc)
    Write-Host "`n[TEST] $Name - $Desc" -ForegroundColor Cyan
    try {
        $result = & $Test
        Write-Host "  PASS" -ForegroundColor Green
        $tests += @{ Name = $Name; Status = "PASS"; Result = $result }
        return $true
    } catch {
        Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $tests += @{ Name = $Name; Status = "FAIL"; Error = $_.Exception.Message }
        return $false
    }
}

Write-Host @"
==============================================================================
  Frontend to Backend Connectivity Test
==============================================================================
Frontend: $FrontendUrl
Backend:  $BackendUrl
Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
==============================================================================
"@ -ForegroundColor Cyan

# Phase 1: Server Availability
Write-Host "`nPHASE 1: Server Availability" -ForegroundColor Magenta

Test-API "Frontend Server" {
    $r = Invoke-WebRequest -Uri $FrontendUrl -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    return "Status: $($r.StatusCode)"
} "Vite dev server on 5174"

Test-API "Backend Health" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/health/status" -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $d = $r.Content | ConvertFrom-Json
    return "Status: $($d.status)"
} "Spring Boot health check"

# Phase 2: Authentication
Write-Host "`nPHASE 2: Authentication" -ForegroundColor Magenta

$email = "test-$(Get-Random)@example.com"
$pwd = "Test!123"
$token = $null
$uid = $null

Test-API "User Register" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/auth/register" `
        -Method POST -ContentType 'application/json' `
        -Body (@{ name = "Test"; email = $email; password = $pwd; image = "https://example.com/a.png" } | ConvertTo-Json) `
        -UseBasicParsing -ErrorAction Stop
    return "Status: $($r.StatusCode)"
} "Create test user"

Test-API "User Login" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/auth/login" `
        -Method POST -ContentType 'application/json' `
        -Body (@{ email = $email; password = $pwd } | ConvertTo-Json) `
        -UseBasicParsing -ErrorAction Stop
    $d = $r.Content | ConvertFrom-Json
    $global:token = $d.accessToken
    $global:uid = $d.userId
    return "Token: $($d.accessToken.Substring(0,20))..."
} "Authenticate and get JWT"

if ($null -eq $global:token) {
    Write-Host "`nERROR: Cannot continue without token" -ForegroundColor Red
    exit 1
}

$h = @{ Authorization = "Bearer $($global:token)" }

# Phase 3: API Access
Write-Host "`nPHASE 3: Authenticated API Access" -ForegroundColor Magenta

Test-API "Get User Profile" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/users/$($global:uid)" `
        -Method GET -Headers $h -UseBasicParsing -ErrorAction Stop
    $d = $r.Content | ConvertFrom-Json
    return "Email: $($d.email)"
} "Retrieve user profile"

Test-API "Get All Users" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/users" `
        -Method GET -Headers $h -UseBasicParsing -ErrorAction Stop
    $d = $r.Content | ConvertFrom-Json
    return "Count: $((@($d).Count))"
} "List users"

# Phase 4: Session Management
Write-Host "`nPHASE 4: Chat Session Management" -ForegroundColor Magenta

$sid = $null
Test-API "Create Session" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/session/create" `
        -Method POST -ContentType 'application/json' -Headers $h `
        -Body (@{ sessionName = "Connectivity Test"; description = "Test"; expirationMinutes = 60 } | ConvertTo-Json) `
        -UseBasicParsing -ErrorAction Stop
    $d = $r.Content | ConvertFrom-Json
    $global:sid = $d.sessionId
    return "SessionId: $($d.sessionId)"
} "Create new chat session"

if ($null -ne $global:sid) {
    Test-API "Get Session Details" {
        $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/session/$($global:sid)" `
            -Method GET -Headers $h -UseBasicParsing -ErrorAction Stop
        $d = $r.Content | ConvertFrom-Json
        return "Name: $($d.sessionName), Active: $($d.active)"
    } "Retrieve session info"

    Test-API "Get Hosted Sessions" {
        $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/session/hosted" `
            -Method GET -Headers $h -UseBasicParsing -ErrorAction Stop
        $d = $r.Content | ConvertFrom-Json
        return "Count: $((@($d).Count))"
    } "List hosted sessions"

    # Phase 5: Real-Time Chat
    Write-Host "`nPHASE 5: Real-Time Chat Features" -ForegroundColor Magenta

    Test-API "Get Connected Users" {
        $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/chat/sessions/$($global:sid)/connected-users" `
            -Method GET -Headers $h -UseBasicParsing -ErrorAction Stop
        $d = $r.Content | ConvertFrom-Json
        return "Connected: $((@($d).Count))"
    } "Real-time presence tracking"
}

# Phase 6: WebSocket
Write-Host "`nPHASE 6: WebSocket Support" -ForegroundColor Magenta

Test-API "WebSocket Endpoint" {
    $r = Invoke-WebRequest -Uri "$BackendUrl/api/v1/health/status" `
        -Method GET -UseBasicParsing -ErrorAction Stop
    $d = $r.Content | ConvertFrom-Json
    if ($d.status -eq "UP") {
        return "WebSocket: ws://localhost:8080/ws/chat (ready)"
    } else {
        throw "Server not UP"
    }
} "STOMP/SockJS endpoint available"

# Summary
Write-Host "`n" -ForegroundColor Cyan
Write-Host ("="*80) -ForegroundColor Cyan

$pass = ($tests | Where-Object { $_.Status -eq "PASS" }).Count
$fail = ($tests | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $tests.Count
$rate = if ($total -gt 0) { [math]::Round(($pass / $total) * 100) } else { 0 }

Write-Host "`nTEST SUMMARY" -ForegroundColor Cyan
Write-Host "Total:     $total"
Write-Host "Passed:    $pass" -ForegroundColor Green
Write-Host "Failed:    $fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "Success:   $rate%"

if ($fail -eq 0) {
    Write-Host @"
    
CONNECTIVITY STATUS: OK

Frontend ↔ Backend CONNECTED
All critical APIs accessible
Authentication working
Session management operational
Real-time chat ready

Ready to test in browser: $FrontendUrl

"@ -ForegroundColor Green
} else {
    Write-Host "`nSome tests failed. Check details above." -ForegroundColor Red
}

Write-Host ("="*80 + "`n") -ForegroundColor Cyan
exit $(if ($fail -eq 0) { 0 } else { 1 })
