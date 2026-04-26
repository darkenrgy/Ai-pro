const textEncoder = new TextEncoder();

interface EncryptedBlobPayload {
  iv: string;
  ciphertext: string;
  mimeType: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importPassphrase(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
}

export async function deriveFileKey(sessionId: string, passphrase: string): Promise<CryptoKey> {
  const material = await importPassphrase(passphrase);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(`ai-pro-file:${sessionId}`),
      iterations: 200000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBlob(input: Blob, key: CryptoKey): Promise<Blob> {
  const raw = await input.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, raw);

  const payload: EncryptedBlobPayload = {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    mimeType: input.type || 'application/octet-stream',
  };

  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function decryptBlob(encryptedBlob: Blob, key: CryptoKey): Promise<Blob> {
  const payloadText = await encryptedBlob.text();
  const payload = JSON.parse(payloadText) as EncryptedBlobPayload;

  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    },
    key,
    ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as ArrayBuffer
  );

  return new Blob([plaintext], { type: payload.mimeType || 'application/octet-stream' });
}
