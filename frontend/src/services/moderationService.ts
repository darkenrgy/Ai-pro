import type { ModerationApiResponse, ModerationInput } from '@/types/chat';

const DEFAULT_DEV_MODERATION_API_URL = import.meta.env.DEV ? 'http://127.0.0.1:8001' : '';
const API_BASE_URL = (import.meta.env.VITE_MODERATION_API_URL ?? DEFAULT_DEV_MODERATION_API_URL).replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_MODERATION_TIMEOUT_MS ?? 1500);

export function isModerationApiConfigured() {
  return Boolean(API_BASE_URL);
}

export async function submitModerationReview(payload: ModerationInput): Promise<ModerationApiResponse | null> {
  if (!API_BASE_URL) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: payload.type,
        content: payload.content,
        session_id: payload.sessionId,
        user_id: payload.userId,
        record_violation: payload.recordViolation ?? false,
        metadata: payload.metadata,
        image_base64: payload.imageBase64,
        image_mime_type: payload.imageMimeType,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ModerationApiResponse;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}