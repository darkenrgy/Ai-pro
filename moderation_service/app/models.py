from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ModerationType = Literal["text", "image"]
ModerationCategory = Literal["safe", "human_trafficking", "child_exploitation", "illegal_weapons"]
ModerationAction = Literal["allow", "warn", "strong_warn", "block"]


class ModerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: ModerationType = "text"
    content: str = ""
    session_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    image_base64: str | None = None
    image_mime_type: str | None = None
    record_violation: bool = False
    metadata: dict[str, Any] | None = None

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_content_for_type(self) -> "ModerationRequest":
        if self.type == "text" and not self.content:
            raise ValueError("content is required for text messages")

        if self.type == "image" and not self.content and not self.image_base64:
            raise ValueError("For image type, provide image path in content or image_base64")

        return self


class ModerationResponse(BaseModel):
    risk_score: int
    flagged: bool
    category: ModerationCategory
    action: ModerationAction
    block_session: bool
    user_violation_count: int = 0
    session_violation_count: int = 0
    detected_language: str = "unknown"
    matched_keywords: list[str] = Field(default_factory=list)
    matched_patterns: list[str] = Field(default_factory=list)
