from __future__ import annotations

import base64
import hashlib
import io
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from typing import Iterable

from .settings import settings


try:
    from langdetect import DetectorFactory, LangDetectException, detect  # type: ignore

    DetectorFactory.seed = 0
except Exception:  # pragma: no cover - optional dependency
    detect = None
    LangDetectException = Exception


@dataclass(frozen=True)
class DetectionHit:
    category: str
    label: str
    weight: int


_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")
_WHITESPACE_RE = re.compile(r"\s+")


def hash_identifier(value: str) -> str:
    digest = hashlib.sha256(f"{settings.hash_salt}:{value}".encode("utf-8")).hexdigest()
    return digest


def normalize_text(text: str) -> str:
    if not text:
        return ""

    normalized = unicodedata.normalize("NFKC", text)
    normalized = _ZERO_WIDTH_RE.sub("", normalized)
    normalized = normalized.replace("\u00A0", " ")
    normalized = normalized.lower().strip()
    normalized = unicodedata.normalize("NFKD", normalized)
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    normalized = _WHITESPACE_RE.sub(" ", normalized)
    return normalized


def detect_language(text: str) -> str:
    cleaned = normalize_text(text)
    if not cleaned:
        return "unknown"

    if _looks_like_devanagari(text):
        return "hi"

    if detect is not None:
        try:
            return detect(cleaned)
        except LangDetectException:
            return "unknown"
        except Exception:
            return "unknown"

    return _heuristic_language(cleaned, text)


def _looks_like_devanagari(text: str) -> bool:
    return any("\u0900" <= character <= "\u097F" for character in text)


def _heuristic_language(normalized_text: str, original_text: str) -> str:
    if _looks_like_devanagari(original_text):
        return "hi"

    tokens = set(re.findall(r"[a-z]+", normalized_text))
    stopword_map = {
        "en": {"the", "and", "to", "of", "for", "with", "buy", "sell"},
        "es": {"el", "la", "de", "y", "para", "con", "venta"},
        "fr": {"le", "la", "de", "et", "pour", "avec"},
        "hi": {"aur", "hai", "ke", "ki", "mein", "mein"},
    }
    scores = {language: len(tokens & stopwords) for language, stopwords in stopword_map.items()}
    if not scores:
        return "unknown"
    language, score = max(scores.items(), key=lambda item: item[1])
    return language if score > 0 else "unknown"


def decode_base64_image(encoded_image: str) -> bytes:
    if not encoded_image:
        return b""
    payload = encoded_image.split(",", 1)[-1]
    return base64.b64decode(payload, validate=False)


def truncate_text(text: str, max_length: int | None = None) -> str:
    limit = max_length if max_length is not None else settings.max_content_length
    if len(text) <= limit:
        return text
    return text[:limit]


def join_non_empty(parts: Iterable[str]) -> str:
    return " ".join(part for part in parts if part)
