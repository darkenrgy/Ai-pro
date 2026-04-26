import { describe, expect, it } from 'vitest';
import { deriveChatKey, encryptChatMessage } from '@/utils/chatEncryption';
import { decryptMediaReference, encryptMediaReference } from '@/utils/mediaCrypto';

describe('multimedia payload encryption parsing', () => {
  it('round-trips typed media payload envelope', async () => {
    const key = await deriveChatKey('session-123', 'shared-secret');

    const encrypted = await encryptMediaReference(key, {
      type: 'image',
      text: 'IMAGE: preview.png',
      media: {
        fileId: 'file-1',
        fileName: 'preview.png',
        mimeType: 'image/png',
        mediaType: 'image',
        sizeBytes: 1280,
        encrypted: true,
        compressed: false,
      },
    });

    const decrypted = await decryptMediaReference(key, encrypted);

    expect(decrypted.type).toBe('image');
    expect(decrypted.media?.fileId).toBe('file-1');
    expect(decrypted.media?.mimeType).toBe('image/png');
  });

  it('parses legacy encrypted text payload as text type', async () => {
    const key = await deriveChatKey('session-legacy', 'shared-secret');

    const legacyEncrypted = await encryptChatMessage(key, 'legacy plain encrypted message');
    const decrypted = await decryptMediaReference(key, legacyEncrypted);

    expect(decrypted.type).toBe('text');
    expect(decrypted.text).toBe('legacy plain encrypted message');
  });
});
