from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import sklearn
from sklearn.metrics import confusion_matrix
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

SEED = 20261115
FEATURES = [
    "heart_rate_mean_delta_bpm",
    "heart_rate_std_bpm",
    "spo2_mean_loss_percentage_points",
    "spo2_min_loss_percentage_points",
    "temperature_mean_delta_c",
    "sleep_mean_delta_hours",
    "fatigue_mean_delta_1_to_5",
    "stress_mean_delta_1_to_5",
    "missing_fraction",
]
DEVIATION_FAMILIES = [
    "sustained_heart_rate_departure",
    "oxygen_signal_departure",
    "sleep_fatigue_stress_cooccurrence",
    "temperature_drift",
]
rng = np.random.default_rng(SEED)


def make_nominal(n: int) -> np.ndarray:
    x = np.column_stack([
        rng.normal(0.0, 4.0, n),
        rng.normal(4.4, 0.85, n),
        rng.normal(0.15, 0.28, n),
        np.maximum(0.0, rng.normal(1.05, 0.45, n)),
        rng.normal(0.0, 0.17, n),
        rng.normal(0.0, 0.65, n),
        rng.normal(0.0, 0.55, n),
        rng.normal(0.0, 0.55, n),
        rng.beta(1.0, 30.0, n),
    ])
    x[:, 6] += np.maximum(0.0, -x[:, 5]) * 0.12
    x[:, 7] += np.maximum(0.0, -x[:, 5]) * 0.08
    x[:, 1] = np.clip(x[:, 1], 1.3, 8.5)
    # Keep model features inside the runtime data-quality gate.
    x[:, 8] = np.clip(x[:, 8], 0.0, 0.25)
    return x


def make_deviations(n: int) -> tuple[np.ndarray, np.ndarray]:
    x = make_nominal(n)
    kinds = np.arange(n) % len(DEVIATION_FAMILIES)
    rng.shuffle(kinds)
    for i, kind in enumerate(kinds):
        if kind == 0:
            x[i, 0] += rng.uniform(12.0, 22.0)
            x[i, 1] += rng.uniform(2.5, 5.0)
        elif kind == 1:
            x[i, 2] += rng.uniform(1.4, 3.0)
            x[i, 3] += rng.uniform(3.0, 6.5)
        elif kind == 2:
            x[i, 5] -= rng.uniform(1.8, 3.2)
            x[i, 6] += rng.uniform(1.8, 3.0)
            x[i, 7] += rng.uniform(1.0, 2.7)
        elif kind == 3:
            x[i, 4] += rng.uniform(0.55, 1.0)
            x[i, 0] += rng.uniform(4.0, 10.0)
    return x, kinds


def round_artifact(value):
    if isinstance(value, list):
        return [round_artifact(item) for item in value]
    if isinstance(value, float):
        return round(value, 8)
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/models/mission-anomaly-mlp-v2.json"),
    )
    args = parser.parse_args()

    n_train = 16000
    x_nominal_train = make_nominal(n_train)
    x_deviation_train, _ = make_deviations(n_train)
    x_train = np.concatenate([x_nominal_train, x_deviation_train])
    y_train = np.concatenate([
        np.zeros(n_train, dtype=int),
        np.ones(n_train, dtype=int),
    ])
    permutation = rng.permutation(len(y_train))
    x_train, y_train = x_train[permutation], y_train[permutation]

    x_nominal_validation = make_nominal(5000)
    x_deviation_validation, validation_kinds = make_deviations(5000)
    x_validation = np.concatenate([x_nominal_validation, x_deviation_validation])
    y_validation = np.concatenate([
        np.zeros(len(x_nominal_validation), dtype=int),
        np.ones(len(x_deviation_validation), dtype=int),
    ])

    scaler = StandardScaler().fit(x_train)
    z_train = scaler.transform(x_train)
    z_validation = scaler.transform(x_validation)
    model = MLPClassifier(
        hidden_layer_sizes=(24, 12),
        activation="relu",
        solver="adam",
        alpha=0.001,
        batch_size=256,
        learning_rate_init=0.001,
        max_iter=300,
        early_stopping=True,
        validation_fraction=0.12,
        n_iter_no_change=15,
        random_state=SEED,
    )
    model.fit(z_train, y_train)
    probabilities = model.predict_proba(z_validation)[:, 1]
    predictions = probabilities >= 0.5
    cm = confusion_matrix(y_validation, predictions, labels=[0, 1])
    tn, fp, fn, tp = [int(value) for value in cm.ravel()]

    validation_predictions = predictions[len(x_nominal_validation):]
    per_type_recall = {
        str(kind): float(np.mean(validation_predictions[validation_kinds == kind]))
        for kind in range(len(DEVIATION_FAMILIES))
    }

    artifact = {
        "modelId": "ASTRA-SYNTH-MLP-2",
        "modelType": "MultiLayerPerceptronBinaryClassifier",
        "version": 2,
        "featureNames": FEATURES,
        "threshold": 0.5,
        "activation": "relu_hidden_sigmoid_output",
        "outputLabels": ["nominal_like", "synthetic_pattern_deviation"],
        "inference": {
            "normalization": "z = (x - scalerMean) / scalerScale",
            "hiddenActivation": "ReLU",
            "outputActivation": "sigmoid",
            "decision": "synthetic_pattern_deviation_score >= 0.5",
        },
        "scalerMean": round_artifact(scaler.mean_.astype(float).tolist()),
        "scalerScale": round_artifact(scaler.scale_.astype(float).tolist()),
        "weights": [
            round_artifact(weights.astype(float).tolist())
            for weights in model.coefs_
        ],
        "biases": [
            round_artifact(biases.astype(float).tolist())
            for biases in model.intercepts_
        ],
        "training": {
            "seed": SEED,
            "nominalTrainingWindows": n_train,
            "deviationTrainingWindows": n_train,
            "nominalValidationWindows": len(x_nominal_validation),
            "deviationValidationWindows": len(x_deviation_validation),
            "scikitLearnVersion": sklearn.__version__,
            "numpyVersion": np.__version__,
            "trainingMethod": "Supervised MLP trained on generated nominal and four generated physiological-deviation window families.",
            "syntheticOnly": True,
            "noNASAOrClinicalTrainingData": True,
            "syntheticDeviationFamilies": DEVIATION_FAMILIES,
            "missingnessHandling": "Deterministic data-quality gate; model inputs are generated with missing_fraction <= 0.25. Sensor dropout is handled by abstention, not a fifth classifier label.",
            "generatorRevision": 2,
        },
        "validation": {
            "threshold": 0.5,
            "trueNegatives": tn,
            "falsePositives": fp,
            "falseNegatives": fn,
            "truePositives": tp,
            "falsePositiveRate": fp / max(1, fp + tn),
            "precision": tp / max(1, tp + fp),
            "recall": tp / max(1, tp + fn),
            "perSyntheticPatternRecall": per_type_recall,
            "scope": "Synthetic generator hold-out only; not real-world or clinical validation.",
        },
        "limitations": [
            "Trained only on generated synthetic telemetry windows, not NASA participant data or clinical datasets.",
            "The output estimates similarity to the generated deviation class; it is not a probability of illness, medical risk, or clinical event.",
            "Validation metrics apply only to the documented synthetic data generator and do not estimate real astronaut performance.",
            "Windows failing the deterministic data-quality gate are not classified by the MLP.",
            "The model is an experimental decision-support signal and must never override mission medical procedures.",
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    json_text = json.dumps(artifact, separators=(",", ":"))
    args.output.write_text(json_text, encoding="utf-8")
    js_path = args.output.with_suffix(".js")
    js_path.write_text(
        '"use strict";\nwindow.AstraMissionModel = ' + json_text + ";\n",
        encoding="utf-8",
    )
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(json.dumps({
        "iterations": int(model.n_iter_),
        "trainingAccuracy": float(model.score(z_train, y_train)),
        "validation": artifact["validation"],
        "artifactBytes": args.output.stat().st_size,
        "artifactSha256": digest,
        "javascriptArtifact": str(js_path),
        "output": str(args.output),
    }, indent=2))


if __name__ == "__main__":
    main()
