from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from .ml_preprocessing import preprocess_text


LABEL_MAP: dict[int, str] = {
    0: "safe",
    1: "human_trafficking",
    2: "child_exploitation",
    3: "illegal_weapons",
}


def load_dataset(dataset_path: str | Path) -> pd.DataFrame:
    dataframe = pd.read_csv(dataset_path)

    required_columns = {"text", "label"}
    missing = required_columns - set(dataframe.columns)
    if missing:
        missing_values = ", ".join(sorted(missing))
        raise ValueError(f"Dataset is missing required columns: {missing_values}")

    dataframe = dataframe[["text", "label"]].dropna(subset=["text", "label"]).copy()
    dataframe["text"] = dataframe["text"].astype(str)
    dataframe["label"] = dataframe["label"].astype(int)

    invalid_labels = sorted(set(dataframe["label"].unique()) - set(LABEL_MAP.keys()))
    if invalid_labels:
        raise ValueError(f"Dataset contains unsupported labels: {invalid_labels}")

    if dataframe.empty:
        raise ValueError("Dataset is empty after cleaning. Provide valid rows with text and label.")

    if dataframe["label"].nunique() < 2:
        raise ValueError("At least two classes are required to train LogisticRegression.")

    return dataframe


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    preprocessor=preprocess_text,
                    lowercase=False,
                    max_features=5000,
                    ngram_range=(1, 2),
                    token_pattern=r"(?u)\b\w+\b",
                ),
            ),
            ("classifier", LogisticRegression(max_iter=2000)),
        ]
    )


def train_and_save_model(
    dataset_path: str | Path = "dataset.csv",
    model_output_path: str | Path = "ai_moderation_model.pkl",
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict[str, Any]:
    dataset = load_dataset(dataset_path)

    x_values = dataset["text"]
    y_values = dataset["label"]

    stratify_values = None
    value_counts = y_values.value_counts()
    if len(value_counts) > 1 and value_counts.min() >= 2:
        stratify_values = y_values

    x_train, x_test, y_train, y_test = train_test_split(
        x_values,
        y_values,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify_values,
    )

    pipeline = build_pipeline()
    pipeline.fit(x_train, y_train)

    predictions = pipeline.predict(x_test)
    present_labels = sorted(set(y_values.unique()))
    report = classification_report(
        y_test,
        predictions,
        labels=present_labels,
        target_names=[LABEL_MAP[label] for label in present_labels],
        zero_division=0,
    )

    artifact = {
        "pipeline": pipeline,
        "label_map": LABEL_MAP,
        "vectorizer": "TfidfVectorizer(max_features=5000, ngram_range=(1,2))",
        "classifier": "LogisticRegression",
    }
    model_output_path = Path(model_output_path)
    model_output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_output_path)

    return {
        "model_path": str(model_output_path),
        "classification_report": report,
        "train_size": len(x_train),
        "test_size": len(x_test),
    }


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train AI moderation model from dataset.csv")
    parser.add_argument("--dataset", default="dataset.csv", help="Path to CSV dataset with [text,label]")
    parser.add_argument("--output", default="ai_moderation_model.pkl", help="Path to save trained model")
    parser.add_argument("--test-size", type=float, default=0.2, help="Test split ratio")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for split")
    return parser


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()

    result = train_and_save_model(
        dataset_path=args.dataset,
        model_output_path=args.output,
        test_size=args.test_size,
        random_state=args.seed,
    )

    print("Model training completed.")
    print(f"Model saved to: {result['model_path']}")
    print(f"Train samples: {result['train_size']}")
    print(f"Test samples: {result['test_size']}")
    print("\nClassification report:\n")
    print(result["classification_report"])


if __name__ == "__main__":
    main()
