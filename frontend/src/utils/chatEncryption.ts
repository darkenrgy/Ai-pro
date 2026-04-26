const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface EncryptedChatPayload {
  iv: string;
  ciphertext: string;
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
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
}

export async function deriveChatKey(sessionId: string, passphrase: string, scope?: string): Promise<CryptoKey> {
  const material = await importPassphrase(passphrase);
  const saltScope = scope?.trim() ? `${sessionId}:${scope.trim()}` : sessionId;
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(`ai-pro-chat:${saltScope}`),
      iterations: 210000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptChatMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plaintext)
  );

  const payload: EncryptedChatPayload = {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(payload);
}

export async function decryptChatMessage(key: CryptoKey, payload: string): Promise<string> {
  const parsed = JSON.parse(payload) as EncryptedChatPayload;
  const ivBytes = base64ToBytes(parsed.iv);
  const ciphertextBytes = base64ToBytes(parsed.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength) as ArrayBuffer,
    },
    key,
    ciphertextBytes.buffer.slice(ciphertextBytes.byteOffset, ciphertextBytes.byteOffset + ciphertextBytes.byteLength) as ArrayBuffer
  );

  return textDecoder.decode(plaintext);
}