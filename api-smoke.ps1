$ErrorActionPreference = 'Stop'
$baseUrl = 'https://localhost:8443/api/v1'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$tempDir = Join-Path $env:TEMP "ai-pro-api-smoke-$stamp"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$results = New-Object System.Collections.Generic.List[object]

function Get-ErrorStatusCode {
    param($ErrorRecord)
    $response = $ErrorRecord.Exception.Response
    if ($null -ne $response -and $null -ne $response.StatusCode) {
        return [int]$response.StatusCode
    }
    return 0
}

function Get-ErrorBody {
    param($ErrorRecord)
    $response = $ErrorRecord.Exception.Response
    if ($null -ne $response -and $null -ne $response.GetResponseStream()) {
        $stream = $response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        return $body
    }
    return $ErrorRecord.Exception.Message
}

function Invoke-CurlGet {
    param(
        [string]$Uri,
        [hashtable]$Headers = @{}
    )

    $tempBody = Join-Path $tempDir ("curl-get-" + [Guid]::NewGuid().ToString() + ".tmp")
    try {
        $headerArgs = @()
        foreach ($entry in $Headers.GetEnumerator()) {
            $headerArgs += '-H'
            $headerArgs += ("{0}: {1}" -f $entry.Key, $entry.Value)
        }

        $args = @('-k', '-s', '-o', $tempBody, '-w', '%{http_code}') + $headerArgs + $Uri
        $statusText = & curl.exe @args
        return [pscustomobject]@{
            StatusCode = [int]$statusText
            Body = if (Test-Path $tempBody) { Get-Content $tempBody -Raw } else { '' }
        }
    } finally {
        Remove-Item $tempBody -ErrorAction SilentlyContinue
    }
}

function Add-Result {
    param(
        [string]$Name,
        [object]$Expected,
        [int]$Actual,
        [string]$Detail,
        [string]$Body = ''
    )

    $expectedText = if ($Expected -is [array]) { ($Expected -join ',') } else { [string]$Expected }
    $passed = if ($Expected -is [array]) { $Expected -contains $Actual } else { $Actual -eq [int]$Expected }
    $status = if ($passed) { 'PASS' } else { 'FAIL' }

    $results.Add([pscustomobject]@{
        Test = $Name
        Expected = $expectedText
        Actual = $Actual
        Status = $status
        Detail = $Detail
        Body = $Body
    }) | Out-Null
}

function Invoke-JsonRequest {
    param(
        [string]$Name,
        [ValidateSet('GET','POST','PUT','DELETE')]
        [string]$Method,
        [string]$Uri,
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [int[]]$ExpectedStatus = @(200)
    )

    try {
        $tempBody = Join-Path $tempDir ("curl-json-" + [Guid]::NewGuid().ToString() + ".tmp")
        $tempRequest = $null
        $headerArgs = @('-H', 'Content-Type: application/json')
        foreach ($entry in $Headers.GetEnumerator()) {
            $headerArgs += '-H'
            $headerArgs += ("{0}: {1}" -f $entry.Key, $entry.Value)
        }

        $curlArgs = @('-k', '-s', '-X', $Method, '-o', $tempBody, '-w', '%{http_code}') + $headerArgs
        if ($null -ne $Body) {
            $tempRequest = Join-Path $tempDir ("curl-json-req-" + [Guid]::NewGuid().ToString() + ".json")
            $Body | ConvertTo-Json -Depth 20 | Set-Content -Path $tempRequest -Encoding Ascii
            $curlArgs += '--data-binary'
            $curlArgs += ("@{0}" -f $tempRequest)
        }
        $curlArgs += $Uri

        $statusText = & curl.exe @curlArgs
        $statusCode = [int]$statusText
        $content = if (Test-Path $tempBody) { Get-Content $tempBody -Raw } else { '' }
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual $statusCode -Detail 'JSON request succeeded' -Body $content
        if ($content) {
            return $content | ConvertFrom-Json
        }
        return $null
    } catch {
        $statusCode = Get-ErrorStatusCode $_
        $body = Get-ErrorBody $_
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual $statusCode -Detail 'JSON request failed' -Body $body
        return $null
    } finally {
        Remove-Item $tempBody -ErrorAction SilentlyContinue
        if ($tempRequest) { Remove-Item $tempRequest -ErrorAction SilentlyContinue }
    }
}

function Invoke-BinaryGet {
    param(
        [string]$Name,
        [string]$Uri,
        [string]$OutFile,
        [hashtable]$Headers = @{},
        [int[]]$ExpectedStatus = @(200)
    )

    try {
        $headerArgs = @()
        foreach ($entry in $Headers.GetEnumerator()) {
            $headerArgs += '-H'
            $headerArgs += ("{0}: {1}" -f $entry.Key, $entry.Value)
        }
        $curlArgs = @('-k', '-s', '-o', $OutFile, '-w', '%{http_code}') + $headerArgs + @($Uri)
        $statusText = & curl.exe @curlArgs
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual ([int]$statusText) -Detail "Saved to $OutFile"
        return $true
    } catch {
        $statusCode = Get-ErrorStatusCode $_
        $body = Get-ErrorBody $_
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual $statusCode -Detail 'Binary request failed' -Body $body
        return $false
    }
}

function Invoke-BinaryPostJson {
    param(
        [string]$Name,
        [string]$Uri,
        [hashtable]$Headers = @{},
        [object]$Body,
        [string]$OutFile,
        [int[]]$ExpectedStatus = @(200)
    )

    try {
        $tempRequest = Join-Path $tempDir ("curl-bin-req-" + [Guid]::NewGuid().ToString() + ".json")
        $Body | ConvertTo-Json -Depth 20 | Set-Content -Path $tempRequest -Encoding Ascii
        $headerArgs = @('-H', 'Content-Type: application/json')
        foreach ($entry in $Headers.GetEnumerator()) {
            $headerArgs += '-H'
            $headerArgs += ("{0}: {1}" -f $entry.Key, $entry.Value)
        }
        $curlArgs = @('-k', '-s', '-X', 'POST', '-o', $OutFile, '-w', '%{http_code}') + $headerArgs + @('--data-binary', ("@{0}" -f $tempRequest), $Uri)
        $statusText = & curl.exe @curlArgs
        $actualStatus = [int]$statusText
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual $actualStatus -Detail 'Binary POST succeeded'
        return $true
    } catch {
        $statusCode = Get-ErrorStatusCode $_
        $body = Get-ErrorBody $_
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual $statusCode -Detail 'Binary POST failed' -Body $body
        return $false
    } finally {
        if ($tempRequest) { Remove-Item $tempRequest -ErrorAction SilentlyContinue }
    }
}

function Invoke-MultipartUpload {
    param(
        [string]$Name,
        [string]$Uri,
        [string]$Token,
        [string]$SessionId,
        [string]$FilePath,
        [string]$FileName,
        [string]$Description,
        [int[]]$ExpectedStatus = @(201)
    )

    try {
        $tempBody = Join-Path $tempDir ("curl-upload-" + [Guid]::NewGuid().ToString() + ".tmp")
        $headerArgs = @('-H', "Authorization: Bearer $Token")
        $formArgs = @('-F', "file=@$FilePath;type=text/plain", '-F', "sessionId=$SessionId")
        if ($Description) {
            $formArgs += @('-F', "description=$Description")
        }
        $curlArgs = @('-k', '-s', '-X', 'POST', '-o', $tempBody, '-w', '%{http_code}') + $headerArgs + $formArgs + @($Uri)
        $statusText = & curl.exe @curlArgs
        $body = if (Test-Path $tempBody) { Get-Content $tempBody -Raw } else { '' }
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual ([int]$statusText) -Detail 'Multipart upload completed' -Body $body
        if ($body) {
            return $body | ConvertFrom-Json
        }
        return $null
    } catch {
        $statusCode = 0
        $body = $_.Exception.Message
        Add-Result -Name $Name -Expected $ExpectedStatus -Actual $statusCode -Detail 'Multipart upload failed' -Body $body
        return $null
    } finally {
        Remove-Item $tempBody -ErrorAction SilentlyContinue
    }
}

function Extract-PngMetadata {
    param(
        [string]$PngPath
    )

    $javaPath = Join-Path $tempDir 'ExtractSecurePng.java'
    @'
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageInputStream;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import java.io.File;
import java.util.Iterator;

public class ExtractSecurePng {
    public static void main(String[] args) throws Exception {
        try (ImageInputStream iis = ImageIO.createImageInputStream(new File(args[0]))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                throw new RuntimeException("No PNG reader found");
            }

            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true);
                IIOMetadata metadata = reader.getImageMetadata(0);
                Node root = metadata.getAsTree("javax_imageio_png_1.0");
                NodeList textEntries = ((IIOMetadataNode) root).getElementsByTagName("tEXtEntry");
                for (int i = 0; i < textEntries.getLength(); i++) {
                    Node node = textEntries.item(i);
                    if (node instanceof IIOMetadataNode entryNode && "SECURE_DATA".equals(entryNode.getAttribute("keyword"))) {
                        System.out.println(entryNode.getAttribute("value"));
                        return;
                    }
                }
                throw new RuntimeException("Secure metadata not found");
            } finally {
                reader.dispose();
            }
        }
    }
}
'@ | Set-Content -Path $javaPath -Encoding Ascii

    $metadata = & java $javaPath $PngPath
    return $metadata.Trim()
}

Write-Host "Running API smoke tests against $baseUrl ..."

$healthStatus = Invoke-CurlGet -Uri "$baseUrl/health/status"
Add-Result -Name 'health/status' -Expected @(200) -Actual $healthStatus.StatusCode -Detail 'Curl health check' -Body $healthStatus.Body
$healthRedis = Invoke-CurlGet -Uri "$baseUrl/health/redis-stats"
Add-Result -Name 'health/redis-stats' -Expected @(200) -Actual $healthRedis.StatusCode -Detail 'Curl health check' -Body $healthRedis.Body

$email = "api-smoke+$stamp@example.com"
$password = 'SmokePass!123'
$name = "Smoke Host $stamp"
$registerBody = @{ name = $name; email = $email; password = $password; image = 'https://example.com/avatar.png' }
$registered = Invoke-JsonRequest -Name 'auth/register' -Method POST -Uri "$baseUrl/auth/register" -Body $registerBody -ExpectedStatus @(201)
$login = Invoke-JsonRequest -Name 'auth/login' -Method POST -Uri "$baseUrl/auth/login" -Body @{ email = $email; password = $password } -ExpectedStatus @(200)
$token = $login.accessToken
$userId = $login.userId

$authHeaders = @{ Authorization = "Bearer $token" }
$allUsers = Invoke-JsonRequest -Name 'users/get all' -Method GET -Uri "$baseUrl/users" -Headers $authHeaders -ExpectedStatus @(200)
$userByEmail = Invoke-JsonRequest -Name 'users/get by email' -Method GET -Uri "$baseUrl/users/email/$([uri]::EscapeDataString($email))" -Headers $authHeaders -ExpectedStatus @(200)
$userById = Invoke-JsonRequest -Name 'users/get by id' -Method GET -Uri "$baseUrl/users/$userId" -Headers $authHeaders -ExpectedStatus @(200)
$updatedUser = Invoke-JsonRequest -Name 'users/update by id' -Method PUT -Uri "$baseUrl/users/$userId" -Headers $authHeaders -Body @{ name = "Smoke Host Updated $stamp"; email = $email; password = $password; enabled = $true } -ExpectedStatus @(200)
$newUserName = if ($updatedUser) { $updatedUser.name } else { $null }

$createdAdmin = Invoke-JsonRequest -Name 'users/create' -Method POST -Uri "$baseUrl/users" -Headers $authHeaders -Body @{ name = "Smoke CRUD $stamp"; email = "api-smoke-crud+$stamp@example.com"; password = 'SmokePass!123'; image = 'https://example.com/profile.png' } -ExpectedStatus @(201)
$crudUserId = if ($createdAdmin) { $createdAdmin.id } else { $null }
if ($crudUserId) {
    Invoke-JsonRequest -Name 'users/delete created user' -Method DELETE -Uri "$baseUrl/users/$crudUserId" -Headers $authHeaders -ExpectedStatus @(204)
}

$session = Invoke-JsonRequest -Name 'session/create' -Method POST -Uri "$baseUrl/session/create" -Headers $authHeaders -Body @{ sessionName = "Smoke Session $stamp"; description = 'API smoke test'; expirationMinutes = 60 } -ExpectedStatus @(201)
$sessionId = if ($session) { $session.sessionId } else { $null }

if ($sessionId) {
    Invoke-JsonRequest -Name 'session/hosted' -Method GET -Uri "$baseUrl/session/hosted" -Headers $authHeaders -ExpectedStatus @(200)
    Invoke-JsonRequest -Name 'session/details' -Method GET -Uri "$baseUrl/session/$sessionId" -Headers $authHeaders -ExpectedStatus @(200)
    Invoke-JsonRequest -Name 'session/me' -Method GET -Uri "$baseUrl/session/$sessionId/me" -Headers $authHeaders -ExpectedStatus @(200)
    Invoke-JsonRequest -Name 'chat/connected-users' -Method GET -Uri "$baseUrl/chat/sessions/$sessionId/connected-users" -Headers $authHeaders -ExpectedStatus @(200)
    Invoke-JsonRequest -Name 'session/join as HOST (expected 400)' -Method POST -Uri "$baseUrl/session/join" -Headers $authHeaders -Body @{ sessionId = $sessionId; parentNodeId = $sessionId } -ExpectedStatus @(400)

    $sessionImagePath = Join-Path $tempDir 'session-image.png'
    Invoke-BinaryPostJson -Name 'session/generate-image' -Uri "$baseUrl/session/generate-image" -Headers $authHeaders -Body @{ sessionId = $sessionId; parentId = $sessionId; expiryTime = (Get-Date).ToUniversalTime().AddMinutes(15).ToString('o'); width = 420; height = 320 } -OutFile $sessionImagePath -ExpectedStatus @(200) | Out-Null

    $secureImagePath = Join-Path $tempDir 'secure-image.png'
    $secureImage = Invoke-BinaryPostJson -Name 'secure-image/generate' -Uri "$baseUrl/secure-image/generate" -Headers $authHeaders -Body @{ sessionId = $sessionId; parentId = $sessionId; expiryTime = (Get-Date).ToUniversalTime().AddMinutes(15).ToString('o'); width = 420; height = 320 } -OutFile $secureImagePath -ExpectedStatus @(200)

    if ($secureImage) {
        $metadata = Extract-PngMetadata -PngPath $secureImagePath
        $encryptedPayload = $null
        $signature = $null
        foreach ($segment in ($metadata -split '\|')) {
            if ($segment.StartsWith('encrypted=')) { $encryptedPayload = $segment.Substring('encrypted='.Length) }
            if ($segment.StartsWith('signature=')) { $signature = $segment.Substring('signature='.Length) }
        }

        if ($encryptedPayload -and $signature) {
            Invoke-JsonRequest -Name 'secure-image/check before consume' -Method GET -Uri "$baseUrl/secure-image/check?encryptedPayload=$([uri]::EscapeDataString($encryptedPayload))&signature=$([uri]::EscapeDataString($signature))&sessionId=$sessionId" -Headers $authHeaders -ExpectedStatus @(200)
            $validateResponse = Invoke-JsonRequest -Name 'secure-image/validate' -Method POST -Uri "$baseUrl/secure-image/validate?encryptedPayload=$([uri]::EscapeDataString($encryptedPayload))&signature=$([uri]::EscapeDataString($signature))" -Headers $authHeaders -ExpectedStatus @(200)
            Invoke-JsonRequest -Name 'secure-image/check after validate (expected 401)' -Method GET -Uri "$baseUrl/secure-image/check?encryptedPayload=$([uri]::EscapeDataString($encryptedPayload))&signature=$([uri]::EscapeDataString($signature))&sessionId=$sessionId" -Headers $authHeaders -ExpectedStatus @(401)
            $payloadToken = if ($validateResponse) { $validateResponse.oneTimeToken } else { $null }
            if ($payloadToken) {
                Invoke-JsonRequest -Name 'secure-image/consume-token' -Method POST -Uri "$baseUrl/secure-image/consume-token?token=$([uri]::EscapeDataString($payloadToken))" -Headers $authHeaders -ExpectedStatus @(200)
            }
        }
    }

    $filePath = Join-Path $tempDir 'smoke-upload.txt'
    Set-Content -Path $filePath -Value "AI-PRO API smoke test $stamp" -Encoding UTF8
    $upload = Invoke-MultipartUpload -Name 'file/upload' -Uri "$baseUrl/file/upload" -Token $token -SessionId $sessionId -FilePath $filePath -FileName 'smoke-upload.txt' -Description 'Smoke upload' -ExpectedStatus @(201)
    $fileId = if ($upload) { $upload.fileId } else { $null }
    Invoke-JsonRequest -Name 'file/list session before/after upload' -Method GET -Uri "$baseUrl/file/session/$sessionId" -Headers $authHeaders -ExpectedStatus @(200)
    if ($fileId) {
        Invoke-JsonRequest -Name 'file/metadata' -Method GET -Uri "$baseUrl/file/$fileId/metadata" -Headers $authHeaders -ExpectedStatus @(200)
        $downloadPath = Join-Path $tempDir 'downloaded-file.bin'
        Invoke-BinaryGet -Name 'file/download' -Uri "$baseUrl/file/$fileId" -Headers $authHeaders -OutFile $downloadPath -ExpectedStatus @(200) | Out-Null
        Invoke-JsonRequest -Name 'file/delete' -Method DELETE -Uri "$baseUrl/file/$fileId" -Headers $authHeaders -ExpectedStatus @(200)
    }
}

Invoke-JsonRequest -Name 'admin/users (expected 403)' -Method GET -Uri 'https://localhost:8443/admin/users' -Headers $authHeaders -ExpectedStatus @(403)
$adminDashboard = Invoke-CurlGet -Uri 'https://localhost:8443/admin/dashboard' -Headers $authHeaders
Add-Result -Name 'admin/dashboard (expected 403)' -Expected @(403) -Actual $adminDashboard.StatusCode -Detail 'Curl admin access check' -Body $adminDashboard.Body

$results | Select-Object Test, Expected, Actual, Status, Detail | Format-Table -AutoSize | Out-String -Width 500

$passCount = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$failCount = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Host "`nSummary: $passCount passed, $failCount failed"
if ($failCount -gt 0) {
    exit 1
}
