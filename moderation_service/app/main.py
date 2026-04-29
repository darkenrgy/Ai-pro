from __future__ import annotations

import binascii
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from .ai_runtime import action_from_score, apply_violation_policy, load_model_artifact, predict_illegal_risk
from .models import ModerationRequest, ModerationResponse
from .settings import settings
from .state import store
from .utils import decode_base64_image, hash_identifier, normalize_text, truncate_text

app = FastAPI(
    title="Privacy-First Moderation API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_load_model() -> None:
    try:
        app.state.model_artifact = load_model_artifact(settings.model_path)
    except Exception:
        app.state.model_artifact = None

def _extract_image_text(image_bytes: bytes) -> str:
    if not settings.enable_ocr or not image_bytes:
        return ""

    if len(image_bytes) > settings.max_image_bytes:
        return ""

    try:
        image = Image.open(BytesIO(image_bytes))
    except (UnidentifiedImageError, OSError, ValueError):
        return ""

    try:
        image.load()
    except Exception:
        return ""

    try:
        import pytesseract  # type: ignore
    except Exception:
        return ""

    try:
        grayscale = image.convert("L")
        grayscale.thumbnail((1600, 1600))
        text = pytesseract.image_to_string(grayscale)
        return normalize_text(text)
    except Exception:
        return ""


def _extract_from_image_path(image_path: str) -> str:
    try:
        candidate = Path(image_path).expanduser().resolve()
    except Exception:
        return ""

    if not candidate.exists() or not candidate.is_file():
        return ""

    try:
        if candidate.stat().st_size > settings.max_image_bytes:
            return ""
    except OSError:
        return ""

    try:
        return _extract_image_text(candidate.read_bytes())
    except OSError:
        return ""


def _prepare_message_text(request_body: ModerationRequest) -> str:
    content = truncate_text(request_body.content)
    if request_body.type == "text":
        return content

    if request_body.image_base64:
        try:
            image_bytes = decode_base64_image(request_body.image_base64)
            return _extract_image_text(image_bytes)
        except (ValueError, binascii.Error):
            return ""

    return _extract_from_image_path(content)


def _get_counts(request_body: ModerationRequest) -> tuple[str, str, int, int]:
    user_hash = hash_identifier(request_body.user_id)
    session_hash = hash_identifier(request_body.session_id)
    user_count, session_count = store.read_counts(user_hash, session_hash)
    return user_hash, session_hash, user_count, session_count


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=ModerationResponse)
async def analyze(request_body: ModerationRequest, request: Request) -> ModerationResponse:
    model_artifact: dict[str, Any] | None = getattr(app.state, "model_artifact", None)
    if model_artifact is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Moderation model is not loaded. Train and place ai_moderation_model.pkl first.",
        )

    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hash_identifier(client_ip)
    if store.is_rate_limited(ip_hash):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

    prepared_text = _prepare_message_text(request_body)
    if not prepared_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No analyzable content found")

    prediction = predict_illegal_risk(prepared_text, model_artifact)

    user_hash, session_hash, user_count, session_count = _get_counts(request_body)
    if prediction.flagged and request_body.record_violation:
        user_count, session_count = store.increment_violation(user_hash, session_hash, prediction.risk_score)

    base_action = action_from_score(prediction.risk_score)
    action, block_session = apply_violation_policy(base_action, user_count, session_count)

    return ModerationResponse(
        risk_score=prediction.risk_score,
        flagged=prediction.flagged,
        category=prediction.category,
        action=action,
        block_session=block_session,
        user_violation_count=user_count,
        session_violation_count=session_count,
        detected_language="unknown",
        matched_keywords=[],
        matched_patterns=[],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "moderation_service.app.main:app",
        host="127.0.0.1",
        port=8001,
        reload=False,
        access_log=False,
    )
