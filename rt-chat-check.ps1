$ErrorActionPreference='Stop'
$base='https://localhost:8443/api/v1'
$stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function New-TestUser([string]$name) {
  $email = "rt-$name-$stamp@example.com"
  $pwd='RtPass!123'
  $regBody=@{name="RT $name";email=$email;password=$pwd;image='https://example.com/avatar.png'}|ConvertTo-Json
  Invoke-WebRequest -Uri "$base/auth/register" -Method POST -ContentType 'application/json' -Body $regBody -UseBasicParsing | Out-Null
  $loginBody=@{email=$email;password=$pwd}|ConvertTo-Json
  $login=Invoke-WebRequest -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body $loginBody -UseBasicParsing
  $d=$login.Content|ConvertFrom-Json
  return @{ email=$email; token=$d.accessToken; userId=$d.userId }
}

$hostUser = New-TestUser 'host'
$participant = New-TestUser 'participant'
$hHost=@{Authorization="Bearer $($hostUser.token)"}
$hPart=@{Authorization="Bearer $($participant.token)"}

$createBody=@{sessionName="RT Check $stamp";description='Realtime chat check';expirationMinutes=60}|ConvertTo-Json
$sessionResp=Invoke-WebRequest -Uri "$base/session/create" -Method POST -ContentType 'application/json' -Headers $hHost -Body $createBody -UseBasicParsing
$session=$sessionResp.Content|ConvertFrom-Json
$sessionId=$session.sessionId

$hostNodeResp=Invoke-WebRequest -Uri "$base/session/$sessionId/me" -Method GET -Headers $hHost -UseBasicParsing
$hostNode=$hostNodeResp.Content|ConvertFrom-Json
$hostNodeId=$hostNode.nodeId

$joinBody=@{sessionId=$sessionId;parentNodeId=$hostNodeId}|ConvertTo-Json
$join=Invoke-WebRequest -Uri "$base/session/join" -Method POST -ContentType 'application/json' -Headers $hPart -Body $joinBody -UseBasicParsing

$connectedHost=Invoke-WebRequest -Uri "$base/chat/sessions/$sessionId/connected-users" -Method GET -Headers $hHost -UseBasicParsing
$connectedPart=Invoke-WebRequest -Uri "$base/chat/sessions/$sessionId/connected-users" -Method GET -Headers $hPart -UseBasicParsing
$hostUsers=@($connectedHost.Content|ConvertFrom-Json)
$partUsers=@($connectedPart.Content|ConvertFrom-Json)

$sockInfo=Invoke-WebRequest -Uri 'https://localhost:8443/ws/chat/info' -Method GET -UseBasicParsing

Write-Output "sessionId=$sessionId"
Write-Output "hostUserId=$($hostUser.userId)"
Write-Output "hostNodeId=$hostNodeId"
Write-Output "participantUserId=$($participant.userId)"
Write-Output "joinStatus=$($join.StatusCode)"
Write-Output "connectedUsersFromHost=$($hostUsers.Count)"
Write-Output "connectedUsersFromParticipant=$($partUsers.Count)"
Write-Output "hostSeesParticipant=$($hostUsers -contains $participant.userId)"
Write-Output "participantSeesHost=$($partUsers -contains $hostUser.userId)"
Write-Output "sockJsInfoStatus=$($sockInfo.StatusCode)"
