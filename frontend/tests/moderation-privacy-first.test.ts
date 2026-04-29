import { describe, expect, it } from 'vitest';
import { analyzeModerationText, detectLanguage, normalizeText } from '@/utils/moderation';

describe('privacy-first moderation', () => {
  it('normalizes whitespace and diacritics', () => {
    expect(normalizeText('  HÉLLO\nWORLD  ')).toBe('hello world');
  });

  it('detects devanagari text as hindi', () => {
    expect(detectLanguage('नाबालिग लड़की की बिक्री')).toBe('hi');
  });

  it('allows harmless speech', async () => {
    const result = await analyzeModerationText('We should meet tomorrow to discuss the project update.');
    expect(result.flagged).toBe(false);
    expect(result.action).toBe('allow');
    expect(result.category).toBe('none');
  });

  it('flags illegal weapons trade language', async () => {
    const result = await analyzeModerationText('Need to buy and ship illegal weapons across the border.', {
      sessionId: 'session-123',
      userId: 'user-123',
    });

    expect(result.flagged).toBe(true);
    expect(result.category).toBe('weapons');
    expect(result.action).not.toBe('allow');
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('flags hindi trafficking sample from dataset', async () => {
    const result = await analyzeModerationText('नाबालिगों को जबरन काम पर लगाओ', {
      sessionId: 'session-hi',
      userId: 'user-hi',
    });

    expect(result.flagged).toBe(true);
    expect(result.action).not.toBe('allow');
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('flags arabic weapons sample from dataset', async () => {
    const result = await analyzeModerationText('تهريب ذخيرة وأسلحة', {
      sessionId: 'session-ar',
      userId: 'user-ar',
    });

    expect(result.flagged).toBe(true);
    expect(result.action).not.toBe('allow');
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });
});
