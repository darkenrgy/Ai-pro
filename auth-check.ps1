$ErrorActionPreference = 'Stop'
$base='https://localhost:8443/api/v1'
$stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email="auth-check+$stamp@example.com"
$pass='AuthPass!123'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$name,[bool]$ok,[string]$detail)
  $results.Add([pscustomobject]@{ Test=$name; Status=if($ok){'PASS'}else{'FAIL'}; Detail=$detail }) | Out-Null
}

try {
  $regBody=@{name='Auth Check User';email=$email;password=$pass;image='https://example.com/avatar.png'}|ConvertTo-Json
  $reg=Invoke-WebRequest -Uri "$base/auth/register" -Method POST -ContentType 'application/json' -Body $regBody -UseBasicParsing
  Add-Result 'Register user' ($reg.StatusCode -eq 201) "status=$($reg.StatusCode)"
} catch { Add-Result 'Register user' $false $_.Exception.Message }

$token=$null
$userId=$null
try {
  $loginBody=@{email=$email;password=$pass}|ConvertTo-Json
  $login=Invoke-WebRequest -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body $loginBody -UseBasicParsing
  $data=$login.Content|ConvertFrom-Json
  $token=$data.accessToken
  $userId=$data.userId
  $ok=($login.StatusCode -eq 200) -and (-not [string]::IsNullOrWhiteSpace($token))
  Add-Result 'Login returns JWT' $ok "status=$($login.StatusCode); tokenLen=$($token.Length)"
} catch { Add-Result 'Login returns JWT' $false $_.Exception.Message }

try {
  $badLoginBody=@{email=$email;password='WrongPass!1'}|ConvertTo-Json
  Invoke-WebRequest -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body $badLoginBody -UseBasicParsing -ErrorAction Stop | Out-Null
  Add-Result 'Reject invalid credentials' $false 'unexpected success'
} catch {
  $code=0; if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode}
  Add-Result 'Reject invalid credentials' ($code -eq 401 -or $code -eq 400) "status=$code"
}

if($token){
  try {
    $me=Invoke-WebRequest -Uri "$base/users/$userId" -Method GET -Headers @{Authorization="Bearer $token"} -UseBasicParsing
    Add-Result 'Allow protected endpoint with valid JWT' ($me.StatusCode -eq 200) "status=$($me.StatusCode)"
  } catch { Add-Result 'Allow protected endpoint with valid JWT' $false $_.Exception.Message }
}

try {
  Invoke-WebRequest -Uri "$base/users" -Method GET -UseBasicParsing -ErrorAction Stop | Out-Null
  Add-Result 'Reject missing JWT on protected endpoint' $false 'unexpected success'
} catch {
  $code=0; if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode}
  Add-Result 'Reject missing JWT on protected endpoint' ($code -eq 401 -or $code -eq 403) "status=$code"
}

try {
  Invoke-WebRequest -Uri "$base/users" -Method GET -Headers @{Authorization='Bearer invalid.token.value'} -UseBasicParsing -ErrorAction Stop | Out-Null
  Add-Result 'Reject malformed JWT' $false 'unexpected success'
} catch {
  $code=0; if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode}
  Add-Result 'Reject malformed JWT' ($code -eq 401 -or $code -eq 403) "status=$code"
}

$results | Format-Table -AutoSize | Out-String -Width 300
$passCount=($results|Where-Object Status -eq 'PASS').Count
$failCount=($results|Where-Object Status -eq 'FAIL').Count
Write-Output "SUMMARY: pass=$passCount fail=$failCount"
if($failCount -gt 0){ exit 1 }
