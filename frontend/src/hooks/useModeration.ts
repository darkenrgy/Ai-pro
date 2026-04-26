import { useEffect, useState } from 'react';
import { analyzeModerationText } from '@/utils/moderation';
import type { ModerationResult } from '@/types/chat';

export function useModeration(draftMessage: string) {
  const [result, setResult] = useState<ModerationResult | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);

  useEffect(() => {
    let active = true;

    const evaluate = async () => {
      const trimmedMessage = draftMessage.trim();
      if (!trimmedMessage) {
        if (active) {
          setResult(null);
        }
        return;
      }

      const nextResult = await analyzeModerationText(trimmedMessage);
      if (active) {
        setResult(nextResult);
      }
    };

    void evaluate();

    return () => {
      active = false;
    };
  }, [draftMessage]);

  useEffect(() => {
    if (!result) {
      return;
    }

    if (result.blocked) {
      setViolationCount((current) => current + 1);
      return;
    }

    if (result.warning) {
      setWarningCount((current) => current + 1);
    }
  }, [result]);

  return {
    moderation: result,
    violationCount,
    warningCount,
  };
}
