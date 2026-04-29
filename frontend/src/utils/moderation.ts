import type {
  ModerationAction,
  ModerationCategory,
  ModerationInput,
  ModerationResult,
} from '@/types/chat';
import { isModerationApiConfigured, submitModerationReview } from '@/services/moderationService';

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

const CATEGORY_KEYWORDS: Record<Exclude<ModerationCategory, 'none'>, Array<{ term: string; label: string; weight: number }>> = {
  trafficking: [
    { term: 'secretly', label: 'secretly trafficking', weight: 24 },
    { term: 'hide', label: 'hide victims keyword', weight: 22 },
    { term: 'debt', label: 'debt bondage keyword', weight: 26 },
    { term: 'arrange', label: 'arrange trafficking keyword', weight: 20 },
    { term: 'control', label: 'control victims keyword', weight: 22 },
    { term: 'workers', label: 'workers exploitation keyword', weight: 18 },
    { term: 'exploit', label: 'exploit keyword', weight: 24 },
    { term: 'servitude', label: 'servitude keyword', weight: 24 },
    { term: 'domestic', label: 'domestic servitude keyword', weight: 20 },
    { term: 'workshop', label: 'hidden workshop keyword', weight: 18 },
    { term: 'trap', label: 'trap victims keyword', weight: 20 },
    { term: 'fake jobs', label: 'fake jobs keyword', weight: 22 },
    { term: 'documents', label: 'confiscate documents keyword', weight: 20 },
    { term: 'trafficking', label: 'trafficking keyword', weight: 26 },
    { term: 'forced labor', label: 'forced labor keyword', weight: 26 },
    { term: 'forced prostitution', label: 'forced prostitution keyword', weight: 28 },
    { term: 'debt bondage', label: 'debt bondage keyword', weight: 24 },
    { term: 'passport', label: 'passport control keyword', weight: 18 },
    { term: 'नाबालिग', label: 'minor trafficking keyword (hi)', weight: 24 },
    { term: 'तस्करी', label: 'trafficking keyword (hi)', weight: 26 },
    { term: 'जबरन मजदूरी', label: 'forced labor keyword (hi)', weight: 28 },
    { term: 'trata', label: 'trafficking keyword (es)', weight: 24 },
    { term: 'explotacion', label: 'exploitation keyword (es)', weight: 22 },
    { term: 'mineures', label: 'minors keyword (fr)', weight: 22 },
    { term: 'travail force', label: 'forced labor keyword (fr)', weight: 24 },
    { term: 'मजदूरी', label: 'labor keyword (hi)', weight: 20 },
    { term: 'गुलामी', label: 'slavery keyword (hi)', weight: 22 },
    { term: 'استغلال', label: 'exploitation keyword (ar)', weight: 22 },
    { term: 'قاصرات', label: 'minor girls keyword (ar)', weight: 22 },
  ],
  child_exploitation: [
    { term: 'intimate', label: 'intimate content keyword', weight: 26 },
    { term: 'picture', label: 'picture request keyword', weight: 24 },
    { term: 'request', label: 'request keyword', weight: 18 },
    { term: 'abuse', label: 'abuse keyword', weight: 28 },
    { term: 'bride', label: 'child bride keyword', weight: 26 },
    { term: 'schoolgirl', label: 'schoolgirl keyword', weight: 24 },
    { term: 'schoolboy', label: 'schoolboy keyword', weight: 24 },
    { term: 'csam', label: 'csam keyword', weight: 36 },
    { term: 'underage', label: 'underage keyword', weight: 28 },
    { term: 'minor', label: 'minor keyword', weight: 26 },
    { term: 'child sexual', label: 'child sexual keyword', weight: 34 },
    { term: 'nude', label: 'nude keyword', weight: 26 },
    { term: 'explicit', label: 'explicit keyword', weight: 24 },
    { term: 'नाबालिग', label: 'minor keyword (hi)', weight: 26 },
    { term: 'अश्लील', label: 'explicit keyword (hi)', weight: 28 },
    { term: 'वीडियो', label: 'video keyword (hi)', weight: 18 },
    { term: 'अंतरंग', label: 'intimate keyword (hi)', weight: 26 },
    { term: 'नग्न', label: 'nude keyword (hi)', weight: 26 },
    { term: 'चैट', label: 'chat keyword (hi)', weight: 16 },
    { term: 'फोटो', label: 'photo keyword (hi)', weight: 18 },
    { term: 'menor', label: 'minor keyword (es)', weight: 26 },
    { term: 'explotacion sexual', label: 'sexual exploitation keyword (es)', weight: 32 },
    { term: 'desnuda', label: 'nude keyword (es)', weight: 26 },
    { term: 'intimida', label: 'intimate keyword (es)', weight: 22 },
    { term: 'mineur', label: 'minor keyword (fr)', weight: 24 },
    { term: 'contenu sexuel', label: 'sexual content keyword (fr)', weight: 28 },
    { term: 'nue', label: 'nude keyword (fr)', weight: 24 },
    { term: 'enfant', label: 'child keyword (fr)', weight: 20 },
    { term: 'قاصر', label: 'minor keyword (ar)', weight: 26 },
    { term: 'جنسي', label: 'sexual keyword (ar)', weight: 24 },
  ],
  weapons: [
    { term: 'assault', label: 'assault weapon keyword', weight: 28 },
    { term: 'prohibited', label: 'prohibited weapon keyword', weight: 26 },
    { term: 'hidden', label: 'hidden cache keyword', weight: 24 },
    { term: 'broker', label: 'weapons broker keyword', weight: 26 },
    { term: 'cache', label: 'weapon cache keyword', weight: 26 },
    { term: 'handgun', label: 'handgun keyword', weight: 22 },
    { term: 'permit', label: 'without permit keyword', weight: 20 },
    { term: 'unregistered', label: 'unregistered keyword', weight: 24 },
    { term: 'illegal weapons', label: 'illegal weapons keyword', weight: 30 },
    { term: 'weapon', label: 'weapon keyword', weight: 22 },
    { term: 'gun', label: 'gun keyword', weight: 22 },
    { term: 'rifle', label: 'rifle keyword', weight: 22 },
    { term: 'ammo', label: 'ammo keyword', weight: 20 },
    { term: 'ammunition', label: 'ammunition keyword', weight: 20 },
    { term: 'smuggle', label: 'smuggling keyword', weight: 24 },
    { term: 'black market', label: 'black market keyword', weight: 24 },
    { term: 'हथियार', label: 'weapons keyword (hi)', weight: 24 },
    { term: 'बंदूक', label: 'gun keyword (hi)', weight: 24 },
    { term: 'लाइसेंस', label: 'license keyword (hi)', weight: 20 },
    { term: 'बारूद', label: 'ammo keyword (hi)', weight: 22 },
    { term: 'गुप्त', label: 'secret keyword (hi)', weight: 20 },
    { term: 'भेजो', label: 'send/ship keyword (hi)', weight: 16 },
    { term: 'तस्करी', label: 'smuggling keyword (hi)', weight: 22 },
    { term: 'armas', label: 'weapons keyword (es)', weight: 22 },
    { term: 'municion', label: 'ammo keyword (es)', weight: 22 },
    { term: 'permiso', label: 'permit keyword (es)', weight: 20 },
    { term: 'licencia', label: 'license keyword (es)', weight: 20 },
    { term: 'prohibidas', label: 'prohibited keyword (es)', weight: 22 },
    { term: 'armes', label: 'weapons keyword (fr)', weight: 22 },
    { term: 'munitions', label: 'ammo keyword (fr)', weight: 22 },
    { term: 'permis', label: 'permit keyword (fr)', weight: 20 },
    { term: 'interdites', label: 'banned keyword (fr)', weight: 22 },
    { term: 'secret', label: 'secret keyword (fr)', weight: 20 },
    { term: 'تهريب', label: 'smuggling keyword (ar)', weight: 24 },
    { term: 'سلاح', label: 'weapon keyword (ar)', weight: 24 },
    { term: 'أسلحة', label: 'weapons keyword (ar)', weight: 24 },
    { term: 'اسلحة', label: 'weapons keyword no-hamza (ar)', weight: 24 },
    { term: 'ذخيرة', label: 'ammo keyword (ar)', weight: 22 },
    { term: 'تصريح', label: 'permit keyword (ar)', weight: 20 },
  ],
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

function detectKeywordSignals(normalizedText: string): DetectionHit[] {
  const hits: DetectionHit[] = [];

  for (const [category, signals] of Object.entries(CATEGORY_KEYWORDS) as Array<[
    Exclude<ModerationCategory, 'none'>,
    Array<{ term: string; label: string; weight: number }>
  ]>) {
    for (const signal of signals) {
      if (normalizedText.includes(signal.term)) {
        hits.push({ category, label: signal.label, weight: signal.weight });
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
  const hits = [...detectPatterns(normalizedText), ...detectKeywordSignals(normalizedText)];
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

function mapRemoteCategory(category: string): ModerationCategory {
  if (category === 'human_trafficking') {
    return 'trafficking';
  }
  if (category === 'illegal_weapons') {
    return 'weapons';
  }
  if (category === 'child_exploitation') {
    return 'child_exploitation';
  }
  return 'none';
}

function mapRemoteAction(action: string, riskScore: number): ModerationAction {
  if (action === 'block') {
    return 'block';
  }

  if (action === 'warn' || action === 'strong_warn') {
    return 'warn';
  }

  return riskScore >= WARN_THRESHOLD ? 'warn' : 'allow';
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

  const remoteRiskScore = Number.isFinite(remoteResponse.risk_score) ? remoteResponse.risk_score : localResult.riskScore;
  const remoteFlagged = typeof remoteResponse.flagged === 'boolean'
    ? remoteResponse.flagged
    : remoteRiskScore >= WARN_THRESHOLD;

  return withCompatFields({
    riskScore: remoteRiskScore,
    flagged: remoteFlagged,
    category: mapRemoteCategory(String(remoteResponse.category ?? 'safe')),
    action: mapRemoteAction(String(remoteResponse.action ?? 'allow'), remoteRiskScore),
    blockSession: Boolean(remoteResponse.block_session),
    detectedLanguage: remoteResponse.detected_language ?? localResult.detectedLanguage,
    userViolationCount: remoteResponse.user_violation_count ?? readLocalCounts(input.sessionId, input.userId).userViolationCount,
    sessionViolationCount: remoteResponse.session_violation_count ?? readLocalCounts(input.sessionId, input.userId).sessionViolationCount,
    matchedKeywords: Array.isArray(remoteResponse.matched_keywords) ? remoteResponse.matched_keywords : localResult.matchedKeywords,
    matchedPatterns: Array.isArray(remoteResponse.matched_patterns) ? remoteResponse.matched_patterns : localResult.matchedPatterns,
  });
}

export async function analyzeModerationInput(input: ModerationInput): Promise<ModerationResult> {
  const safeContent = input.content.slice(0, 4000);
  const localResult = evaluateLocally(safeContent);
  const shouldEscalate = Boolean(isModerationApiConfigured() && input.sessionId && input.userId);

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