from __future__ import annotations

from dataclasses import dataclass
from collections import Counter
import re
from typing import Iterable

from .settings import settings
from .utils import DetectionHit, detect_language, join_non_empty, normalize_text, truncate_text


@dataclass(frozen=True)
class DetectionResult:
    risk_score: int
    flagged: bool
    category: str
    matched_keywords: list[str]
    matched_patterns: list[str]
    detected_language: str


def _compile(patterns: Iterable[tuple[str, int, str, str]]) -> list[tuple[re.Pattern[str], int, str, str]]:
    return [(re.compile(pattern, re.IGNORECASE), weight, category, label) for pattern, weight, category, label in patterns]


TRAFFICKING_PATTERNS = _compile(
    [
        (r"\bsex trafficking\b", 40, "trafficking", "sex trafficking"),
        (r"\bhuman trafficking\b", 45, "trafficking", "human trafficking"),
        (r"\bforced labor\b", 38, "trafficking", "forced labor"),
        (r"\bno questions asked\b.*\b(girls|women|minors)\b", 32, "trafficking", "no questions asked"),
        (r"\btransport\b.*\b(girls|women|minors)\b", 30, "trafficking", "transport victims"),
        (r"\brecruit\b.*\b(girls|women|minors)\b", 28, "trafficking", "recruit victims"),
        (r"\bpassport(s)? taken\b", 26, "trafficking", "passport confiscation"),
        (r"\bforced prostitution\b", 42, "trafficking", "forced prostitution"),
        (r"\bdebt bondage\b", 34, "trafficking", "debt bondage"),
        (r"(?:लड़क(?:ी|ियां)|महिला|औरत).{0,24}(?:बेच|बेचना|तस्करी|भेजना|ले जाना)", 34, "trafficking", "hindi trafficking pattern"),
    ]
)

CHILD_EXPLOITATION_PATTERNS = _compile(
    [
        (r"\bcsam\b", 50, "child_exploitation", "csam"),
        (r"\bchild sexual abuse\b", 50, "child_exploitation", "child sexual abuse"),
        (r"\bunderage\b.*\b(sex|nude|image|video|girl|boy)\b", 42, "child_exploitation", "underage context"),
        (r"\b(?:13|14|15|16|17)\s?(?:yo|years? old)\b.*\b(?:sex|nude|pic|photo|video)\b", 45, "child_exploitation", "minor age disclosure"),
        (r"\bminor\b.*\b(?:nude|sex|explicit|video|image)\b", 46, "child_exploitation", "minor explicit context"),
        (r"\bschoolgirl\b.*\b(?:sex|nude|pic|video)\b", 40, "child_exploitation", "schoolgirl explicit context"),
        (r"\bchild bride\b", 45, "child_exploitation", "child bride"),
        (r"(?:नाबालिग|बच्ची|बच्चा).{0,24}(?:नग्न|सेक्स|वीडियो|तस्वीर)", 44, "child_exploitation", "hindi child exploitation pattern"),
    ]
)

WEAPONS_PATTERNS = _compile(
    [
        (r"\billegal weapons?\b", 42, "weapons", "illegal weapons"),
        (r"\b(?:sell|buy|supply|ship|smuggle)\b.*\b(?:gun|guns|rifle|pistol|ammo|ammunition|firearm|firearms|weapon|weapons)\b", 34, "weapons", "weapons trade intent"),
        (r"\bak[-\s]?47\b", 38, "weapons", "ak-47"),
        (r"\bghost gun\b", 40, "weapons", "ghost gun"),
        (r"\bserial number\b.*\bremoved\b", 28, "weapons", "serial number removal"),
        (r"(?:हथियार|बंदूक|पिस्तौल|राइफल).{0,24}(?:बेच|खरीद|तस्करी|सप्लाई)", 36, "weapons", "hindi weapons pattern"),
    ]
)

RULESETS = {
    "trafficking": TRAFFICKING_PATTERNS,
    "child_exploitation": CHILD_EXPLOITATION_PATTERNS,
    "weapons": WEAPONS_PATTERNS,
}


def detect_illegal_content(text: str, language_hint: str | None = None) -> DetectionResult:
    normalized_text = truncate_text(normalize_text(text))
    detected_language = language_hint or detect_language(text)

    if not normalized_text:
        return DetectionResult(
            risk_score=0,
            flagged=False,
            category="none",
            matched_keywords=[],
            matched_patterns=[],
            detected_language=detected_language,
        )

    hits: list[DetectionHit] = []
    pattern_labels: list[str] = []

    for category, patterns in RULESETS.items():
        for compiled_pattern, weight, hit_category, label in patterns:
            if compiled_pattern.search(normalized_text):
                hits.append(DetectionHit(category=hit_category, label=label, weight=weight))
                pattern_labels.append(label)

    if not hits:
        return DetectionResult(
            risk_score=0,
            flagged=False,
            category="none",
            matched_keywords=[],
            matched_patterns=[],
            detected_language=detected_language,
        )

    category_weights = Counter()
    for hit in hits:
        category_weights[hit.category] += hit.weight

    primary_category, primary_weight = max(category_weights.items(), key=lambda item: item[1])
    evidence_bonus = min(20, max(0, len(hits) - 1) * 6)
    score = min(100, primary_weight + evidence_bonus)

    if primary_category == "child_exploitation" and score < 45:
        score = 45
    elif primary_category == "trafficking" and score < 40:
        score = 40
    elif primary_category == "weapons" and score < 35:
        score = 35

    unique_labels = list(dict.fromkeys(pattern_labels))
    matched_keywords = [label for label in unique_labels if " " not in label or len(label) <= 24]

    return DetectionResult(
        risk_score=score,
        flagged=score >= settings.warn_threshold,
        category=primary_category,
        matched_keywords=matched_keywords,
        matched_patterns=unique_labels,
        detected_language=detected_language,
    )


def should_block_session(user_count: int, session_count: int) -> bool:
    return max(user_count, session_count) >= settings.block_session_threshold


def resolve_action(risk_score: int, user_count: int, session_count: int) -> str:
    if should_block_session(user_count, session_count):
        return "block"
    if user_count >= 3 or session_count >= 3:
        return "block"
    if risk_score >= settings.block_threshold:
        return "block"
    if risk_score >= settings.warn_threshold:
        return "warn"
    return "allow"


def merge_text_sources(content: str, metadata: dict[str, object] | None = None) -> str:
    if not metadata:
        return content
    values = [content]
    for key in ("file_name", "mime_type", "alt_text", "ocr_text"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
    return join_non_empty(values)
