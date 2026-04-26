$ErrorActionPreference = 'Stop'
$base='https://localhost:8443/api/v1'
$stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$tempDir = Join-Path $env:TEMP "secure-image-debug-$stamp"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

function Extract-PngMetadata {
    param([string]$PngPath)

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
    return ($metadata | Out-String).Trim()
}

$email = "si-debug+$stamp@example.com"
$pwd = 'DebugPass!123'
Invoke-WebRequest -Uri "$base/auth/register" -Method POST -ContentType 'application/json' -Body (@{name='SI Debug';email=$email;password=$pwd;image='https://example.com/a.png'}|ConvertTo-Json) -UseBasicParsing | Out-Null
$login = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{email=$email;password=$pwd}|ConvertTo-Json) -UseBasicParsing
$data = $login.Content | ConvertFrom-Json
$h=@{Authorization="Bearer $($data.accessToken)"}

$session = (Invoke-WebRequest -Uri "$base/session/create" -Method POST -ContentType 'application/json' -Headers $h -Body (@{sessionName='SI Debug';description='debug';expirationMinutes=60}|ConvertTo-Json) -UseBasicParsing).Content | ConvertFrom-Json
$sessionId = $session.sessionId

$pngPath = Join-Path $tempDir 'secure-image.png'
Invoke-WebRequest -Uri "$base/secure-image/generate" -Method POST -Headers $h -Body ((@{sessionId=$sessionId;parentId=$sessionId;expiryTime=(Get-Date).ToUniversalTime().AddMinutes(15).ToString('o');width=420;height=320}|ConvertTo-Json)) -ContentType 'application/json' -OutFile $pngPath -UseBasicParsing | Out-Null

$metadata = Extract-PngMetadata -PngPath $pngPath
Write-Output "metadataLength=$($metadata.Length)"

$encryptedPayload = $null
$signature = $null
foreach ($segment in ($metadata -split '\|')) {
    if ($segment.StartsWith('encrypted=')) { $encryptedPayload = $segment.Substring('encrypted='.Length) }
    if ($segment.StartsWith('signature=')) { $signature = $segment.Substring('signature='.Length) }
}

Write-Output "encryptedPresent=$([bool]$encryptedPayload)"
Write-Output "signaturePresent=$([bool]$signature)"

if ($encryptedPayload -and $signature) {
    try {
        $check = Invoke-WebRequest -Uri "$base/secure-image/check?encryptedPayload=$([uri]::EscapeDataString($encryptedPayload))&signature=$([uri]::EscapeDataString($signature))&sessionId=$sessionId" -Method GET -Headers $h -UseBasicParsing
        Write-Output "checkStatus=$($check.StatusCode)"
        Write-Output "checkBody=$($check.Content)"
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        Write-Output "checkStatus=$code"
        if ($_.Exception.Response) {
            $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Output "checkBody=$($sr.ReadToEnd())"
        }
    }

    try {
        $validate = Invoke-WebRequest -Uri "$base/secure-image/validate?encryptedPayload=$([uri]::EscapeDataString($encryptedPayload))&signature=$([uri]::EscapeDataString($signature))" -Method POST -Headers $h -UseBasicParsing
        Write-Output "validateStatus=$($validate.StatusCode)"
        Write-Output "validateBody=$($validate.Content)"
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        Write-Output "validateStatus=$code"
        if ($_.Exception.Response) {
            $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Output "validateBody=$($sr.ReadToEnd())"
        }
    }
}
