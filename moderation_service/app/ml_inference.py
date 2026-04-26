from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib


def load_trained_model(model_path: str | Path = "ai_moderation_model.pkl") -> dict[str, Any]:
    artifact = joblib.load(model_path)
    if not isinstance(artifact, dict) or "pipeline" not in artifact or "label_map" not in artifact:
        raise ValueError("Invalid model artifact. Expected keys: pipeline, label_map")
    return artifact


def predict_text(text: str, model_artifact: dict[str, Any]) -> dict[str, Any]:
    pipeline = model_artifact["pipeline"]
    label_map: dict[int, str] = model_artifact["label_map"]

    predicted_label = int(pipeline.predict([text])[0])
    probabilities: dict[str, float] = {}

    if hasattr(pipeline, "predict_proba"):
        model_classes = pipeline.classes_
        class_probabilities = pipeline.predict_proba([text])[0]
        probabilities = {
            label_map[int(label)]: float(probability)
            for label, probability in zip(model_classes, class_probabilities)
        }

    return {
        "label_id": predicted_label,
        "label_name": label_map.get(predicted_label, "unknown"),
        "probabilities": probabilities,
    }
