import type {
  ModerationAction,
  ModerationCategory,
  ModerationInput,
  ModerationResult,
} from '@/types/chat';
import { submitModerationReview } from '@/services/moderationService';

export type QuickModerationCheck = {
  suspicious: boolean;
  matchedKeywords: string[];
  category: 'safe' | 'suspicious';
};

type DetectionHit = {
  category: Exclude<ModerationCategory, 'none'>;
  label: string;
  weight: number;
};

type LocalSubjectState = {
  userViolationCount: number;
  sessionViolationCount: number;
  timestamps: number[];
};

const subjectState = new Map<string, LocalSubjectState>();

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const WHITESPACE_RE = /\s+/g;

const WARN_THRESHOLD = 30;
const BLOCK_THRESHOLD = 70;
const BLOCK_SESSION_THRESHOLD = 4;
const QUICK_CHECK_CACHE = new Map<string, QuickModerationCheck>();

const QUICK_KEYWORDS = [
  'gun',
  'guns',
  'weapon',
  'weapons',
  'illegal',
  'sell',
  'buy',
  'ship',
  'smuggle',
  'trafficking',
  'minor',
  'underage',
  'csam',
  'child abuse',
  'ammo',
  'ammunition',
  'pistol',
  'rifle',
  'ak-47',
];

const TRAFFICKING_PATTERNS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\bhuman trafficking\b/i, label: 'human trafficking', weight: 45 },
  { pattern: /\bsex trafficking\b/i, label: 'sex trafficking', weight: 40 },
  { pattern: /\bforced labor\b/i, label: 'forced labor', weight: 38 },
  { pattern: /\bforced prostitution\b/i, label: 'forced prostitution', weight: 42 },
  { pattern: /\bdebt bondage\b/i, label: 'debt bondage', weight: 34 },
  { pattern: /\bpassport(s)? taken\b/i, label: 'passport confiscation', weight: 26 },
  { pattern: /\bno questions asked\b.*\b(?:girls|women|minors)\b/i, label: 'no questions asked', weight: 32 },
  { pattern: /\b(?:recruit|transport|move|ship)\b.*\b(?:girls|women|minors)\b/i, label: 'victim transport', weight: 30 },
  { pattern: /(?:लड़क(?:ी|ियां)|महिला|औरत).{0,24}(?:बेच|बेचना|तस्करी|भेजना|ले जाना)/i, label: 'hindi trafficking pattern', weight: 34 },
];

const CHILD_EXPLOITATION_PATTERNS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\bcsam\b/i, label: 'csam', weight: 50 },
  { pattern: /\bchild sexual abuse\b/i, label: 'child sexual abuse', weight: 50 },
  { pattern: /\bunderage\b.*\b(?:sex|nude|image|video|girl|boy)\b/i, label: 'underage context', weight: 42 },
  { pattern: /\b(?:13|14|15|16|17)\s?(?:yo|years? old)\b.*\b(?:sex|nude|pic|photo|video)\b/i, label: 'minor age disclosure', weight: 45 },
  { pattern: /\bminor\b.*\b(?:nude|sex|explicit|video|image)\b/i, label: 'minor explicit context', weight: 46 },
  { pattern: /\bschoolgirl\b.*\b(?:sex|nude|pic|video)\b/i, label: 'schoolgirl explicit context', weight: 40 },
  { pattern: /\bchild bride\b/i, label: 'child bride', weight: 45 },
  { pattern: /(?:नाबालिग|बच्ची|बच्चा).{0,24}(?:नग्न|सेक्स|वीडियो|तस्वीर)/i, label: 'hindi child exploitation pattern', weight: 44 },
];

const WEAPONS_PATTERNS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\billegal weapons?\b/i, label: 'illegal weapons', weight: 42 },
  { pattern: /\b(?:sell|buy|supply|ship|smuggle)\b.*\b(?:gun|guns|rifle|pistol|ammo|ammunition|firearm|firearms|weapon|weapons)\b/i, label: 'weapons trade intent', weight: 34 },
  { pattern: /\bak[-\s]?47\b/i, label: 'ak-47', weight: 38 },
  { pattern: /\bghost gun\b/i, label: 'ghost gun', weight: 40 },
  { pattern: /\bserial number\b.*\bremoved\b/i, label: 'serial number removal', weight: 28 },
  { pattern: /(?:हथियार|बंदूक|पिस्तौल|राइफल).{0,24}(?:बेच|खरीद|तस्करी|सप्लाई)/i, label: 'hindi weapons pattern', weight: 36 },
];

const CATEGORY_PATTERNS: Record<Exclude<ModerationCategory, 'none'>, Array<{ pattern: RegExp; label: string; weight: number }>> = {
  trafficking: TRAFFICKING_PATTERNS,
  child_exploitation: CHILD_EXPLOITATION_PATTERNS,
  weapons: WEAPONS_PATTERNS,
};

function getSubjectKey(sessionId?: string, userId?: string) {
  return [sessionId ?? 'anonymous-session', userId ?? 'anonymous-user'].join('|');
}

function getSubjectState(key: string): LocalSubjectState {
  const current = subjectState.get(key);
  if (current) {
    return current;
  }

  const next: LocalSubjectState = {
    userViolationCount: 0,
    sessionViolationCount: 0,
    timestamps: [],
  };
  subjectState.set(key, next);
  return next;
}

function normalizeDiacritics(text: string) {
  return text.normalize('NFKC').replace(ZERO_WIDTH_RE, '').replace(/\u00A0/g, ' ').trim();
}

export function normalizeText(text: string) {
  if (!text) {
    return '';
  }

  const normalized = normalizeDiacritics(text).toLowerCase().normalize('NFKD');
  const withoutMarks = normalized.replace(/[\u0300-\u036f]/g, '');
  return withoutMarks.replace(WHITESPACE_RE, ' ');
}

function hasDevanagari(text: string) {
  return /[\u0900-\u097F]/.test(text);
}

export function detectLanguage(text: string) {
  const cleaned = normalizeText(text);
  if (!cleaned) {
    return 'unknown';
  }

  if (hasDevanagari(text)) {
    return 'hi';
  }

  const latinTokens = cleaned.match(/[a-z]+/g) ?? [];
  const tokenSet = new Set(latinTokens);
  const stopwordMap: Record<string, Set<string>> = {
    en: new Set(['the', 'and', 'to', 'of', 'for', 'with', 'buy', 'sell']),
    es: new Set(['el', 'la', 'de', 'y', 'para', 'con', 'venta']),
    fr: new Set(['le', 'la', 'de', 'et', 'pour', 'avec']),
    hi: new Set(['aur', 'hai', 'ke', 'ki', 'mein']),
  };

  const scored = Object.entries(stopwordMap).map(([language, stopwords]) => {
    let score = 0;
    stopwords.forEach((word) => {
      if (tokenSet.has(word)) {
        score += 1;
      }
    });
    return { language, score };
  });

  const best = scored.sort((left, right) => right.score - left.score)[0];
  return best && best.score > 0 ? best.language : 'unknown';
}

function detectPatterns(normalizedText: string): DetectionHit[] {
  const hits: DetectionHit[] = [];

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as Array<[
    Exclude<ModerationCategory, 'none'>,
    Array<{ pattern: RegExp; label: string; weight: number }>
  ]>) {
    for (const pattern of patterns) {
      if (pattern.pattern.test(normalizedText)) {
        hits.push({ category, label: pattern.label, weight: pattern.weight });
      }
    }
  }

  return hits;
}

function resolveCategory(hits: DetectionHit[]): Exclude<ModerationCategory, 'none'> | 'none' {
  if (hits.length === 0) {
    return 'none';
  }

  const categoryWeights = new Map<Exclude<ModerationCategory, 'none'>, number>();
  for (const hit of hits) {
    categoryWeights.set(hit.category, (categoryWeights.get(hit.category) ?? 0) + hit.weight);
  }

  const winner = Array.from(categoryWeights.entries()).sort((left, right) => right[1] - left[1])[0];
  return winner?.[0] ?? 'none';
}

function resolveRiskScore(hits: DetectionHit[]) {
  if (hits.length === 0) {
    return 0;
  }

  const totalWeight = hits.reduce((sum, hit) => sum + hit.weight, 0);
  const bonus = Math.min(20, Math.max(0, hits.length - 1) * 6);
  return Math.min(100, totalWeight + bonus);
}

function evaluateLocally(text: string) {
  const normalizedText = normalizeText(text);
  const detectedLanguage = detectLanguage(text);
  const hits = detectPatterns(normalizedText);
  const riskScore = resolveRiskScore(hits);
  const category = resolveCategory(hits);
  const uniqueLabels = Array.from(new Set(hits.map((hit) => hit.label)));

  return {
    riskScore,
    flagged: riskScore >= WARN_THRESHOLD,
    category,
    matchedKeywords: uniqueLabels.filter((label) => label.length <= 24),
    matchedPatterns: uniqueLabels,
    detectedLanguage,
  };
}

function resolveAction(riskScore: number, userViolationCount: number, sessionViolationCount: number): ModerationAction {
  // Never block safe content purely due to historical counters.
  if (riskScore < WARN_THRESHOLD) {
    return 'allow';
  }

  if (Math.max(userViolationCount, sessionViolationCount) >= BLOCK_SESSION_THRESHOLD) {
    return 'block';
  }

  if (userViolationCount >= 3 || sessionViolationCount >= 3 || riskScore >= BLOCK_THRESHOLD) {
    return 'block';
  }

  if (riskScore >= WARN_THRESHOLD) {
    return 'warn';
  }

  return 'allow';
}

function updateLocalCounts(sessionId?: string, userId?: string) {
  const state = getSubjectState(getSubjectKey(sessionId, userId));
  const now = Date.now();
  state.userViolationCount += 1;
  state.sessionViolationCount += 1;
  state.timestamps.push(now);

  if (state.timestamps.length > 20) {
    state.timestamps.splice(0, state.timestamps.length - 20);
  }

  return state;
}

function readLocalCounts(sessionId?: string, userId?: string) {
  return getSubjectState(getSubjectKey(sessionId, userId));
}

function withCompatFields(result: {
  riskScore: number;
  flagged: boolean;
  category: ModerationCategory;
  action: ModerationAction;
  blockSession: boolean;
  detectedLanguage: string;
  userViolationCount: number;
  sessionViolationCount: number;
  matchedKeywords: string[];
  matchedPatterns: string[];
}): ModerationResult {
  return {
    ...result,
    risk_score: result.riskScore,
    flagged_content: result.flagged,
    block_session: result.blockSession,
    warning: result.action !== 'allow',
    blocked: result.action === 'block',
  };
}

async function enrichWithRemoteApi(input: ModerationInput, localResult: ReturnType<typeof evaluateLocally>): Promise<ModerationResult> {
  const remoteResponse = await submitModerationReview(input);

  if (!remoteResponse) {
    const state = input.recordViolation && localResult.flagged
      ? updateLocalCounts(input.sessionId, input.userId)
      : readLocalCounts(input.sessionId, input.userId);
    const action = resolveAction(localResult.riskScore, state.userViolationCount, state.sessionViolationCount);
    return withCompatFields({
      riskScore: localResult.riskScore,
      flagged: localResult.flagged,
      category: localResult.category,
      action,
      blockSession: Math.max(state.userViolationCount, state.sessionViolationCount) >= BLOCK_SESSION_THRESHOLD,
      detectedLanguage: localResult.detectedLanguage,
      userViolationCount: state.userViolationCount,
      sessionViolationCount: state.sessionViolationCount,
      matchedKeywords: localResult.matchedKeywords,
      matchedPatterns: localResult.matchedPatterns,
    });
  }

  return withCompatFields({
    riskScore: remoteResponse.risk_score,
    flagged: remoteResponse.flagged,
    category: remoteResponse.category,
    action: remoteResponse.action,
    blockSession: remoteResponse.block_session,
    detectedLanguage: remoteResponse.detected_language,
    userViolationCount: remoteResponse.user_violation_count,
    sessionViolationCount: remoteResponse.session_violation_count,
    matchedKeywords: remoteResponse.matched_keywords,
    matchedPatterns: remoteResponse.matched_patterns,
  });
}

export async function analyzeModerationInput(input: ModerationInput): Promise<ModerationResult> {
  const safeContent = input.content.slice(0, 4000);
  const localResult = evaluateLocally(safeContent);
  const shouldEscalate = Boolean(input.sessionId && input.userId && (localResult.flagged || input.type === 'image'));

  if (!shouldEscalate) {
    const state = input.recordViolation && localResult.flagged
      ? updateLocalCounts(input.sessionId, input.userId)
      : readLocalCounts(input.sessionId, input.userId);
    const action = resolveAction(localResult.riskScore, state.userViolationCount, state.sessionViolationCount);
    return withCompatFields({
      riskScore: localResult.riskScore,
      flagged: localResult.flagged,
      category: localResult.category,
      action,
      blockSession: Math.max(state.userViolationCount, state.sessionViolationCount) >= BLOCK_SESSION_THRESHOLD,
      detectedLanguage: localResult.detectedLanguage,
      userViolationCount: state.userViolationCount,
      sessionViolationCount: state.sessionViolationCount,
      matchedKeywords: localResult.matchedKeywords,
      matchedPatterns: localResult.matchedPatterns,
    });
  }

  return enrichWithRemoteApi(input, localResult);
}

export async function analyzeModerationText(text: string, context: Omit<ModerationInput, 'type' | 'content'> = {}): Promise<ModerationResult> {
  return analyzeModerationInput({
    type: 'text',
    content: text,
    ...context,
  });
}

export async function analyzeModerationImage(content: string, context: Omit<ModerationInput, 'type' | 'content'> = {}): Promise<ModerationResult> {
  return analyzeModerationInput({
    type: 'image',
    content,
    ...context,
  });
}

export function checkMessage(text: string): QuickModerationCheck {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { suspicious: false, matchedKeywords: [], category: 'safe' };
  }

  const cached = QUICK_CHECK_CACHE.get(normalized);
  if (cached) {
    return cached;
  }

  const matchedKeywords = QUICK_KEYWORDS.filter((keyword) => normalized.includes(keyword));
  const result: QuickModerationCheck = {
    suspicious: matchedKeywords.length > 0,
    matchedKeywords,
    category: matchedKeywords.length > 0 ? 'suspicious' : 'safe',
  };

  if (QUICK_CHECK_CACHE.size > 250) {
    QUICK_CHECK_CACHE.clear();
  }

  QUICK_CHECK_CACHE.set(normalized, result);
  return result;
}