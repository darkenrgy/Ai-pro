from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib

from .ml_preprocessing import preprocess_text
from .settings import settings


SAFE_LABEL = "safe"
ILLEGAL_LABELS = ("human_trafficking", "child_exploitation", "illegal_weapons")


@dataclass(frozen=True)
class RuntimePrediction:
    risk_score: int
    flagged: bool
    category: str
    probabilities: dict[str, float]


def load_model_artifact(model_path: str | Path | None = None) -> dict[str, Any]:
    resolved_path = Path(model_path or settings.model_path)
    if not resolved_path.exists():
        raise FileNotFoundError(f"Model file not found: {resolved_path}")

    artifact = joblib.load(resolved_path)
    if not isinstance(artifact, dict) or "pipeline" not in artifact or "label_map" not in artifact:
        raise ValueError("Invalid model artifact. Expected keys: pipeline, label_map")
    return artifact


def _normalize_probability_map(probabilities: dict[str, float]) -> dict[str, float]:
    normalized = {label: float(max(0.0, min(1.0, score))) for label, score in probabilities.items()}
    for label in (SAFE_LABEL, *ILLEGAL_LABELS):
        normalized.setdefault(label, 0.0)
    return normalized


def predict_illegal_risk(text: str, artifact: dict[str, Any]) -> RuntimePrediction:
    pipeline = artifact["pipeline"]
    label_map: dict[int, str] = artifact["label_map"]

    cleaned_text = preprocess_text(text)
    classes = pipeline.classes_
    class_probabilities = pipeline.predict_proba([cleaned_text])[0]

    probability_map = {
        label_map[int(label_id)]: float(probability)
        for label_id, probability in zip(classes, class_probabilities)
    }
    probability_map = _normalize_probability_map(probability_map)

    top_illegal_category = max(ILLEGAL_LABELS, key=lambda label: probability_map.get(label, 0.0))
    top_illegal_probability = probability_map.get(top_illegal_category, 0.0)
    risk_score = int(round(top_illegal_probability * 100))

    category = top_illegal_category if risk_score >= settings.warn_threshold else SAFE_LABEL
    return RuntimePrediction(
        risk_score=risk_score,
        flagged=risk_score >= settings.warn_threshold,
        category=category,
        probabilities=probability_map,
    )


def action_from_score(risk_score: int) -> str:
    if risk_score > settings.block_threshold:
        return "block"
    if risk_score >= settings.warn_threshold:
        return "warn"
    return "allow"


def apply_violation_policy(base_action: str, user_count: int, session_count: int) -> tuple[str, bool]:
    block_session = session_count >= settings.block_session_threshold

    if block_session:
        return "block", True

    if user_count >= 3:
        return "block", False
    if user_count == 2:
        return "strong_warn", False
    if user_count == 1:
        return "warn", False
    return base_action, False
