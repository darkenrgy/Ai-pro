import api from '@/services/http';
import type { ModerationResult } from '@/types/chat';

export interface ModerationSignalStateResponse {
  accepted: boolean;
  userViolationCount: number;
  sessionViolationCount: number;
  blockSession: boolean;
  lastRiskScore: number;
  recordedAt: string;
}

export async function hashModerationValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const digestArray = Array.from(new Uint8Array(digest));
  return digestArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sendModerationSignal(
  result: ModerationResult,
  sessionId: string,
  userId: string
): Promise<ModerationSignalStateResponse | null> {
  if (!result.flagged) {
    return null;
  }

  try {
    const [hashedSessionId, hashedUserId] = await Promise.all([
      hashModerationValue(sessionId),
      hashModerationValue(userId),
    ]);

    const response = await api.post<ModerationSignalStateResponse>('/moderation/signal', {
      hashedUserId,
      hashedSessionId,
      riskScore: Math.round(result.riskScore),
      category: result.category,
      action: result.action,
      timestamp: new Date().toISOString(),
    });
    return response.data;
  } catch {
    // Signal submission must never block chat delivery.
    return null;
  }
}

export async function getModerationSignalState(
  sessionId: string,
  userId: string
): Promise<ModerationSignalStateResponse | null> {
  try {
    const [hashedSessionId, hashedUserId] = await Promise.all([
      hashModerationValue(sessionId),
      hashModerationValue(userId),
    ]);

    const response = await api.get<ModerationSignalStateResponse>('/moderation/signal-state', {
      params: {
        hashedUserId,
        hashedSessionId,
      },
    });
    return response.data;
  } catch {
    return null;
  }
}
