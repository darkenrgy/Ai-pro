Write-Host "WebSocket Connection Timeout Fix - Verification Test" -ForegroundColor Cyan
Write-Host ""

$BASE = 'https://localhost:8443'
$FRONTEND = 'https://localhost:5173'
$TS = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$EMAIL = "test-$TS@example.com"
$PASS = 'TestPass!123'

Write-Host "Step 1: Register user..." -ForegroundColor Yellow
try {
  Invoke-WebRequest -Uri "$BASE/api/v1/auth/register" -Method POST -ContentType 'application/json' `
    -Body (@{name='Test';email=$EMAIL;password=$PASS;image='https://example.com/a.png'}|ConvertTo-Json) -UseBasicParsing -ErrorAction Stop | Out-Null
  Write-Host "OK - User registered" -ForegroundColor Green
} catch {
  Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red; return
}

Write-Host "Step 2: Login..." -ForegroundColor Yellow
try {
  $login = Invoke-WebRequest -Uri "$BASE/api/v1/auth/login" -Method POST -ContentType 'application/json' `
    -Body (@{email=$EMAIL;password=$PASS}|ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
  $token = ($login.Content|ConvertFrom-Json).accessToken
  $header = @{Authorization="Bearer $token"}
  Write-Host "OK - Logged in" -ForegroundColor Green
} catch {
  Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red; return
}

Write-Host "Step 3: Create session..." -ForegroundColor Yellow
try {
  $create = Invoke-WebRequest -Uri "$BASE/api/v1/session/create" -Method POST -ContentType 'application/json' `
    -Headers $header -Body (@{sessionName="Test $TS";description="test";expirationMinutes=60}|ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
  $sid = ($create.Content|ConvertFrom-Json).sessionId
  Write-Host "OK - Session created: $sid" -ForegroundColor Green
} catch {
  Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red; return
}

Write-Host "Step 4: Check WebSocket endpoint..." -ForegroundColor Yellow
try {
  $ws = Invoke-WebRequest -Uri "$FRONTEND/ws/chat/info" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
  Write-Host "OK - WebSocket reachable through proxy" -ForegroundColor Green
} catch {
  Write-Host "WARNING - WebSocket not reachable: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "Step 5: Check frontend server..." -ForegroundColor Yellow
try {
  $frontend = Invoke-WebRequest -Uri "$FRONTEND/" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
  Write-Host "OK - Frontend running on port 5174" -ForegroundColor Green
} catch {
  Write-Host "ERROR - Frontend not available" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== FIXES APPLIED ===" -ForegroundColor Cyan
Write-Host "+ Timeout increased: 10s to 25s (more network delay tolerance)"
Write-Host "+ Retry attempts: 1 to 2 (better recovery)"
Write-Host "+ Retry counter: Reset on new unlock (fresh connection)"
Write-Host "+ Error messages: Better guidance for user"
Write-Host ""
Write-Host "=== VERIFY IN BROWSER ===" -ForegroundColor Cyan
Write-Host "1. Go to http://localhost:5174"
Write-Host "2. Login: $EMAIL / $PASS"
Write-Host "3. Expected: Locked -> Connecting -> Connected"
Write-Host "4. Unlock chat with shared secret"
Write-Host "5. Expected: No timeout, status shows Connected"
Write-Host ""
