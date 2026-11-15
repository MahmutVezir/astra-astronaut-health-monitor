#!/usr/bin/env python3
"""Train ASTRA's simulator-only mission pattern classifier.

This script intentionally generates synthetic telemetry features. It does not
read NASA OSDR data and must never be used to imply clinical validity.
Requirements: Python 3.10+, numpy, scikit-learn.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

SEED = 20261115
FEATURES = [
    "heart_rate_delta_bpm",
    "spo2_drop_percentage_points",
    "temperature_delta_c",
    "sleep_delta_hours",
    "missing_rate",
    "stale_rate",
    "flatline_rate",
    "wellbeing_flag_count",
]
CLASSES = [
    "STABLE_MONITORING",
    "MULTI_SIGNAL_DRIFT",
    "DATA_QUALITY_REVIEW",
    "WELLBEING_CONTEXT_REVIEW",
    "MIXED_REVIEW",
]


def generate_class(label: str, count: int, rng: np.random.Generator) -> np.ndarray:
    rows = []
    for _ in range(count):
        if label == "STABLE_MONITORING":
            row = [
                rng.normal(0, 3.2), rng.normal(0, 0.75), rng.normal(0, 0.22),
                rng.normal(0, 0.85), rng.uniform(0, 0.18), rng.uniform(0, 0.18),
                rng.uniform(0, 0.18), rng.integers(0, 3),
            ]
        elif label == "MULTI_SIGNAL_DRIFT":
            row = [
                rng.uniform(5, 18), rng.uniform(0.4, 3.3), rng.uniform(0.15, 0.9),
                rng.uniform(-2.5, -0.3), rng.uniform(0, 0.24), rng.uniform(0, 0.18),
                rng.uniform(0, 0.18), rng.integers(0, 4),
            ]
        elif label == "DATA_QUALITY_REVIEW":
            row = [
                rng.normal(1, 4.5), rng.normal(0, 1.0), rng.normal(0.1, 0.3),
                rng.normal(0, 1.0), rng.uniform(0.18, 0.70), rng.uniform(0.12, 0.80),
                rng.uniform(0.08, 0.75), rng.integers(0, 5),
            ]
        elif label == "WELLBEING_CONTEXT_REVIEW":
            row = [
                rng.uniform(1, 10), rng.uniform(-0.5, 1.5), rng.uniform(0, 0.5),
                rng.uniform(-2.6, -0.25), rng.uniform(0, 0.20), rng.uniform(0, 0.16),
                rng.uniform(0, 0.16), rng.integers(2, 5),
            ]
        else:
            row = [
                rng.uniform(4, 17), rng.uniform(0.25, 3.5), rng.uniform(0.15, 1.0),
                rng.uniform(-2.8, -0.25), rng.uniform(0.12, 0.50), rng.uniform(0.08, 0.5),
                rng.uniform(0.05, 0.45), rng.integers(1, 5),
            ]
        rows.append(row)
    return np.asarray(rows, dtype=float)


def export_node(tree, index: int, class_order: list[str]) -> dict:
    if tree.children_left[index] == tree.children_right[index]:
        counts = tree.value[index][0]
        total = float(counts.sum())
        return {
            "class": class_order[int(np.argmax(counts))],
            "samples": int(tree.n_node_samples[index]),
            "probabilities": {
                class_order[i]: round(float(counts[i] / total), 4)
                for i in range(len(class_order)) if counts[i] > 0
            },
        }
    return {
        "feature": FEATURES[int(tree.feature[index])],
        "threshold": round(float(tree.threshold[index]), 6),
        "left": export_node(tree, int(tree.children_left[index]), class_order),
        "right": export_node(tree, int(tree.children_right[index]), class_order),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/models/mission-pattern-model.json")
    args = parser.parse_args()

    rng = np.random.default_rng(SEED)
    x = np.vstack([generate_class(label, 3000, rng) for label in CLASSES])
    y = np.concatenate([np.repeat(label, 3000) for label in CLASSES])
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.25, random_state=SEED, stratify=y
    )

    model = DecisionTreeClassifier(
        max_depth=4, min_samples_leaf=50, class_weight="balanced", random_state=SEED
    )
    model.fit(x_train, y_train)
    predicted = model.predict(x_test)
    class_order = list(model.classes_)
    report = classification_report(
        y_test, predicted, labels=class_order, output_dict=True, zero_division=0
    )

    result = {
        "model_id": "ASTRA-MISSION-PATTERN-TREE-1",
        "algorithm": "scikit-learn DecisionTreeClassifier",
        "random_seed": SEED,
        "dataset": {
            "type": "synthetic_only",
            "samples": int(len(y)),
            "train_samples": int(len(y_train)),
            "test_samples": int(len(y_test)),
            "features": FEATURES,
            "classes": class_order,
            "generator_version": "astra-synthetic-mission-window-v1",
        },
        "training": {"max_depth": 4, "min_samples_leaf": 50, "class_weight": "balanced"},
        "validation": {
            "accuracy": round(float(accuracy_score(y_test, predicted)), 6),
            "macro_f1": round(float(f1_score(y_test, predicted, average="macro")), 6),
            "confusion_matrix_labels": class_order,
            "confusion_matrix": confusion_matrix(y_test, predicted, labels=class_order).tolist(),
            "classification_report": {
                key: (
                    {metric: round(float(value), 6) for metric, value in entry.items()}
                    if isinstance(entry, dict) else round(float(entry), 6)
                )
                for key, entry in report.items()
            },
        },
        "feature_importances": {
            FEATURES[i]: round(float(value), 6)
            for i, value in enumerate(model.feature_importances_)
        },
        "tree": export_node(model.tree_, 0, class_order),
        "limitations": [
            "Trained and evaluated only on simulator-generated synthetic feature vectors.",
            "Metrics quantify the synthetic generator, not generalization to astronauts or real flight data.",
            "Operational pattern labels only; not diagnosis, risk probability, event prediction, or flight rules.",
        ],
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "samples": len(y),
        "train_samples": len(y_train),
        "test_samples": len(y_test),
        "accuracy": result["validation"]["accuracy"],
        "macro_f1": result["validation"]["macro_f1"],
        "tree_nodes": int(model.tree_.node_count),
    }, indent=2))


if __name__ == "__main__":
    main()
