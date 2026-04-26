$ErrorActionPreference = 'Stop'
$backend = 'https://localhost:8443'
$frontend = 'https://localhost:5173'
$api = '/api/v1'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name,[bool]$Pass,[string]$Detail)
  $results.Add([pscustomobject]@{
    Test = $Name
    Status = if ($Pass) { 'PASS' } else { 'FAIL' }
    Detail = $Detail
  }) | Out-Null
}

function Try-Request {
  param([scriptblock]$Block)
  try { & $Block; return $true } catch { return $false }
}

function Invoke-CurlGet {
  param(
    [string]$Uri,
    [hashtable]$Headers = @{}
  )

  $tempBody = Join-Path $env:TEMP ("ai-pro-curl-" + [Guid]::NewGuid().ToString() + ".tmp")
  try {
    $headerArgs = @()
    foreach ($entry in $Headers.GetEnumerator()) {
      $headerArgs += '-H'
      $headerArgs += ("{0}: {1}" -f $entry.Key, $entry.Value)
    }

    $args = @('-k', '-s', '-o', $tempBody, '-w', '%{http_code}') + $headerArgs + $Uri
    $statusText = & curl.exe @args
    $body = if (Test-Path $tempBody) { Get-Content $tempBody -Raw } else { '' }
    return [pscustomobject]@{
      StatusCode = [int]$statusText
      Body = $body
    }
  } finally {
    Remove-Item $tempBody -ErrorAction SilentlyContinue
  }
}

function Invoke-CurlJsonRequest {
  param(
    [ValidateSet('GET','POST','PUT','DELETE','OPTIONS')]
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  $tempBody = Join-Path $env:TEMP ("ai-pro-curl-" + [Guid]::NewGuid().ToString() + ".tmp")
  $tempRequest = Join-Path $env:TEMP ("ai-pro-curl-req-" + [Guid]::NewGuid().ToString() + ".json")
  try {
    $headerArgs = @('-H', 'Content-Type: application/json')
    foreach ($entry in $Headers.GetEnumerator()) {
      $headerArgs += '-H'
      $headerArgs += ("{0}: {1}" -f $entry.Key, $entry.Value)
    }

    $curlArgs = @('-k', '-s', '-X', $Method, '-o', $tempBody, '-w', '%{http_code}') + $headerArgs
    if ($null -ne $Body) {
      $Body | ConvertTo-Json -Depth 20 | Set-Content -Path $tempRequest -Encoding Ascii
      $curlArgs += '--data-binary'
      $curlArgs += ("@{0}" -f $tempRequest)
    }
    $curlArgs += $Uri

    $statusText = & curl.exe @curlArgs
    $bodyText = if (Test-Path $tempBody) { Get-Content $tempBody -Raw } else { '' }
    return [pscustomobject]@{
      StatusCode = [int]$statusText
      Body = $bodyText
    }
  } finally {
    Remove-Item $tempBody -ErrorAction SilentlyContinue
    Remove-Item $tempRequest -ErrorAction SilentlyContinue
  }
}

function Invoke-HttpsJsonRequest {
  param(
    [ValidateSet('GET','POST','PUT','DELETE','OPTIONS')]
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  Add-Type -AssemblyName System.Net.Http
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.ServerCertificateCustomValidationCallback = { param($message, $certificate, $chain, $errors) return $true }
  $client = [System.Net.Http.HttpClient]::new($handler)

  try {
    foreach ($entry in $Headers.GetEnumerator()) {
      [void]$client.DefaultRequestHeaders.TryAddWithoutValidation($entry.Key, [string]$entry.Value)
    }

    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Uri)
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 20
      $request.Content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
    }

    $response = $client.SendAsync($request).Result
    $content = if ($response.Content) { $response.Content.ReadAsStringAsync().Result } else { '' }
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Body = $content
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

# 1) Direct backend health
try {
  $r = Invoke-CurlGet -Uri "$backend$api/health/status"
  Add-Result 'Backend health direct' ($r.StatusCode -eq 200) "status=$($r.StatusCode)"
} catch { Add-Result 'Backend health direct' $false $_.Exception.Message }

# 2) Frontend server health
try {
  $r = Invoke-CurlGet -Uri "$frontend"
  Add-Result 'Frontend server health' ($r.StatusCode -eq 200) "status=$($r.StatusCode)"
} catch { Add-Result 'Frontend server health' $false $_.Exception.Message }

# 3) Frontend -> Backend through proxy health
try {
  $r = Invoke-CurlGet -Uri "$frontend$api/health/status"
  Add-Result 'Frontend proxy -> Backend health' ($r.StatusCode -eq 200) "status=$($r.StatusCode)"
} catch { Add-Result 'Frontend proxy -> Backend health' $false $_.Exception.Message }

# 4) Auth flow direct backend
$emailDirect = "direct-$stamp@example.com"
$pass = 'ConnPass!123'
$tokenDirect = $null
$userIdDirect = $null
try {
  $reg = Invoke-CurlJsonRequest -Method POST -Uri "$backend$api/auth/register" -Body @{name='Direct User';email=$emailDirect;password=$pass;image='https://example.com/a.png'}
  $login = Invoke-CurlJsonRequest -Method POST -Uri "$backend$api/auth/login" -Body @{email=$emailDirect;password=$pass}
  $data = $login.Body | ConvertFrom-Json
  $tokenDirect = $data.accessToken
  $userIdDirect = $data.userId
  $ok = ($reg.StatusCode -eq 201) -and ($login.StatusCode -eq 200) -and (-not [string]::IsNullOrWhiteSpace($tokenDirect))
  Add-Result 'Direct backend auth transfer' $ok "register=$($reg.StatusCode), login=$($login.StatusCode), tokenLen=$($tokenDirect.Length)"
} catch { Add-Result 'Direct backend auth transfer' $false $_.Exception.Message }

# 5) Protected data transfer direct backend
if ($tokenDirect) {
  try {
    $me = Invoke-CurlGet -Uri "$backend$api/users/$userIdDirect" -Headers @{Authorization="Bearer $tokenDirect"}
    Add-Result 'Direct protected data fetch' ($me.StatusCode -eq 200) "status=$($me.StatusCode)"
  } catch { Add-Result 'Direct protected data fetch' $false $_.Exception.Message }
}

# 6) Auth flow through frontend proxy
$emailProxy = "proxy-$stamp@example.com"
$tokenProxy = $null
$userIdProxy = $null
try {
  $reg = Invoke-WebRequest -Uri "$frontend$api/auth/register" -Method POST -ContentType 'application/json' -Body (@{name='Proxy User';email=$emailProxy;password=$pass;image='https://example.com/a.png'}|ConvertTo-Json) -UseBasicParsing
  $login = Invoke-WebRequest -Uri "$frontend$api/auth/login" -Method POST -ContentType 'application/json' -Body (@{email=$emailProxy;password=$pass}|ConvertTo-Json) -UseBasicParsing
  $data = $login.Content | ConvertFrom-Json
  $tokenProxy = $data.accessToken
  $userIdProxy = $data.userId
  $ok = ($reg.StatusCode -eq 201) -and ($login.StatusCode -eq 200) -and (-not [string]::IsNullOrWhiteSpace($tokenProxy))
  Add-Result 'Frontend proxy auth transfer' $ok "register=$($reg.StatusCode), login=$($login.StatusCode), tokenLen=$($tokenProxy.Length)"
} catch { Add-Result 'Frontend proxy auth transfer' $false $_.Exception.Message }

# 7) Protected data transfer through frontend proxy
if ($tokenProxy) {
  try {
    $me = Invoke-CurlGet -Uri "$frontend$api/users/$userIdProxy" -Headers @{Authorization="Bearer $tokenProxy"}
    Add-Result 'Frontend proxy protected data fetch' ($me.StatusCode -eq 200) "status=$($me.StatusCode)"
  } catch { Add-Result 'Frontend proxy protected data fetch' $false $_.Exception.Message }
}

# 8) CORS preflight (frontend origin -> backend)
try {
  $pre = Invoke-CurlJsonRequest -Method OPTIONS -Uri "$backend$api/health/status" -Headers @{ Origin = $frontend; 'Access-Control-Request-Method'='GET'; 'Access-Control-Request-Headers'='authorization,content-type' }
  Add-Result 'CORS preflight' ($pre.StatusCode -eq 200) "status=$($pre.StatusCode)"
} catch { Add-Result 'CORS preflight' $false $_.Exception.Message }

# 9) WebSocket endpoint reachable
try {
  $ws = Invoke-CurlGet -Uri "$backend/ws/chat/info" -Headers @{ Origin = $frontend }
  Add-Result 'WebSocket SockJS info endpoint' ($ws.StatusCode -eq 200) "status=$($ws.StatusCode)"
} catch { Add-Result 'WebSocket SockJS info endpoint' $false $_.Exception.Message }

$results | Format-Table -AutoSize | Out-String -Width 300
$pass = ($results | Where-Object Status -eq 'PASS').Count
$fail = ($results | Where-Object Status -eq 'FAIL').Count
Write-Output "SUMMARY: pass=$pass fail=$fail"
if ($fail -gt 0) { exit 1 }
