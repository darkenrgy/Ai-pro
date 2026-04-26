from __future__ import annotations

import re
import unicodedata


_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")
_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")


def _is_supported_character(character: str) -> bool:
    if character.isspace():
        return True

    category = unicodedata.category(character)
    return category.startswith("L") or category.startswith("N")


def preprocess_text(text: str) -> str:
    """Normalize and clean user text while preserving multilingual content.

    Steps:
    1. Unicode normalize (NFKC) for cross-script consistency.
    2. Lowercase with casefold for robust multilingual normalization.
    3. Remove URLs and zero-width characters.
    4. Keep letters/numbers from all scripts, drop punctuation/symbols.
    5. Collapse repeated whitespace.
    """
    if text is None:
        return ""

    normalized = unicodedata.normalize("NFKC", str(text))
    normalized = normalized.casefold()
    normalized = _ZERO_WIDTH_RE.sub("", normalized)
    normalized = _URL_RE.sub(" ", normalized)

    cleaned = "".join(character if _is_supported_character(character) else " " for character in normalized)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned
