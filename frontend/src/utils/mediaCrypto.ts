import { decryptBlob, encryptBlob } from '@/utils/fileCrypto';
import { decryptChatMessage, encryptChatMessage } from '@/utils/chatEncryption';
import type { ChatMediaReference, EncryptedChatPayloadV2 } from '@/types/chat';

export interface SecureMediaUploadResult {
  encryptedBlob: Blob;
  media: ChatMediaReference;
}

export async function encryptFile(input: Blob, key: CryptoKey): Promise<Blob> {
  return encryptBlob(input, key);
}

export async function decryptFile(input: Blob, key: CryptoKey): Promise<Blob> {
  return decryptBlob(input, key);
}

export async function encryptMediaReference(
  key: CryptoKey,
  message: EncryptedChatPayloadV2
): Promise<string> {
  return encryptChatMessage(key, JSON.stringify(message));
}

export async function decryptMediaReference(
  key: CryptoKey,
  encryptedPayload: string
): Promise<EncryptedChatPayloadV2> {
  const decrypted = await decryptChatMessage(key, encryptedPayload);

  try {
    const parsed = JSON.parse(decrypted) as EncryptedChatPayloadV2;
    if (parsed.type) {
      return parsed;
    }
  } catch {
    // Fallback to legacy text payload below.
  }

  return {
    type: 'text',
    text: decrypted,
  };
}
