from __future__ import annotations

from dataclasses import dataclass
import os


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    hash_salt: str = os.getenv("MODERATION_HASH_SALT", "privacy-first-default-salt")
    max_content_length: int = int(os.getenv("MODERATION_MAX_CONTENT_LENGTH", "4000"))
    max_image_bytes: int = int(os.getenv("MODERATION_MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
    rate_limit_requests: int = int(os.getenv("MODERATION_RATE_LIMIT_REQUESTS", "120"))
    rate_limit_window_seconds: int = int(os.getenv("MODERATION_RATE_LIMIT_WINDOW_SECONDS", "60"))
    block_session_threshold: int = int(os.getenv("MODERATION_BLOCK_SESSION_THRESHOLD", "4"))
    warn_threshold: int = int(os.getenv("MODERATION_WARN_THRESHOLD", "30"))
    block_threshold: int = int(os.getenv("MODERATION_BLOCK_THRESHOLD", "70"))
    enable_ocr: bool = _env_bool("MODERATION_ENABLE_OCR", True)
    model_path: str = os.getenv("MODERATION_MODEL_PATH", "ai_moderation_model.pkl")


settings = Settings()
