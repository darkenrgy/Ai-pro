import { describe, expect, it } from 'vitest';
import { decryptChatMessage, deriveChatKey, encryptChatMessage } from '@/utils/chatEncryption';

describe('secure chat unlock', () => {
  it('decrypts successfully when both users use the same shared secret', async () => {
    const sessionId = 'fbf1a9a8-4eaa-4742-bf91-8b4e10f1db0e';
    const sharedSecret = 'alpha-bravo-secure-key';
    const plaintext = 'hello from secure chat';

    const senderKey = await deriveChatKey(sessionId, sharedSecret);
    const receiverKey = await deriveChatKey(sessionId, sharedSecret);

    const encryptedPayload = await encryptChatMessage(senderKey, plaintext);
    const decryptedText = await decryptChatMessage(receiverKey, encryptedPayload);

    expect(decryptedText).toBe(plaintext);
  });

  it('fails decryption when shared secret does not match', async () => {
    const sessionId = 'fbf1a9a8-4eaa-4742-bf91-8b4e10f1db0e';
    const senderSecret = 'alpha-bravo-secure-key';
    const wrongSecret = 'wrong-secret-value';

    const senderKey = await deriveChatKey(sessionId, senderSecret);
    const wrongReceiverKey = await deriveChatKey(sessionId, wrongSecret);

    const encryptedPayload = await encryptChatMessage(senderKey, 'mismatch check');

    await expect(decryptChatMessage(wrongReceiverKey, encryptedPayload)).rejects.toThrow();
  });
});
