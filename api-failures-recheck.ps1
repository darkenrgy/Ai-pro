$ErrorActionPreference='Stop'
$base='https://localhost:8443/api/v1'
$email='recheck-' + (Get-Random) + '@example.com'
$pwd='Recheck!123'

Invoke-WebRequest -Uri "$base/auth/register" -Method POST -ContentType 'application/json' -Body (@{name='Recheck';email=$email;password=$pwd;image='https://example.com/a.png'}|ConvertTo-Json) -UseBasicParsing | Out-Null
$login=Invoke-WebRequest -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{email=$email;password=$pwd}|ConvertTo-Json) -UseBasicParsing
$d=$login.Content|ConvertFrom-Json
$h=@{Authorization="Bearer $($d.accessToken)"}

$session=(Invoke-WebRequest -Uri "$base/session/create" -Method POST -ContentType 'application/json' -Headers $h -Body (@{sessionName='Recheck Session';description='recheck';expirationMinutes=60}|ConvertTo-Json) -UseBasicParsing).Content|ConvertFrom-Json
$sessionId=$session.sessionId

$joinHostStatus=''
try {
  Invoke-WebRequest -Uri "$base/session/join" -Method POST -ContentType 'application/json' -Headers $h -Body (@{sessionId=$sessionId;parentNodeId=$sessionId}|ConvertTo-Json) -UseBasicParsing -ErrorAction Stop | Out-Null
  $joinHostStatus='200-unexpected'
} catch {
  $joinHostStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'ERR' }
}

$sessionImageStatus=''
try {
  $r = Invoke-WebRequest -Uri "$base/session/generate-image" -Method POST -Headers $h -ContentType 'application/json' -Body (@{sessionId=$sessionId;parentId=$sessionId;expiryTime=(Get-Date).ToUniversalTime().AddMinutes(15).ToString('o');width=420;height=320}|ConvertTo-Json) -UseBasicParsing
  $sessionImageStatus=$r.StatusCode
} catch {
  $sessionImageStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'ERR' }
}

$secureImageStatus=''
try {
  $r = Invoke-WebRequest -Uri "$base/secure-image/generate" -Method POST -Headers $h -ContentType 'application/json' -Body (@{sessionId=$sessionId;parentId=$sessionId;expiryTime=(Get-Date).ToUniversalTime().AddMinutes(15).ToString('o');width=420;height=320}|ConvertTo-Json) -UseBasicParsing
  $secureImageStatus=$r.StatusCode
} catch {
  $secureImageStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'ERR' }
}

$temp = Join-Path $env:TEMP ('recheck-' + [guid]::NewGuid().ToString() + '.txt')
'Smoke' | Set-Content -Path $temp -Encoding utf8
Add-Type -AssemblyName System.Net.Http
$client=[System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization=[System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$d.accessToken)
$content=[System.Net.Http.MultipartFormDataContent]::new()
$bytes=[System.IO.File]::ReadAllBytes($temp)
$fileContent=[System.Net.Http.ByteArrayContent]::new($bytes)
$fileContent.Headers.ContentType=[System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('text/plain')
$content.Add($fileContent,'file','recheck.txt')
$content.Add([System.Net.Http.StringContent]::new($sessionId),'sessionId')
$uploadResp=$client.PostAsync("$base/file/upload",$content).Result
$uploadJson=$uploadResp.Content.ReadAsStringAsync().Result|ConvertFrom-Json
$fileId=$uploadJson.fileId
$downloadResp = Invoke-WebRequest -Uri "$base/file/$fileId" -Method GET -Headers $h -UseBasicParsing

Write-Output "joinAsHostStatus=$joinHostStatus"
Write-Output "sessionGenerateImageStatus=$sessionImageStatus"
Write-Output "secureImageGenerateStatus=$secureImageStatus"
Write-Output "fileUploadStatus=$([int]$uploadResp.StatusCode)"
Write-Output "fileDownloadStatus=$($downloadResp.StatusCode)"
