# ASTRA-SYNTH-MLP-2 — Model Card

## Summary

ASTRA-SYNTH-MLP-2 is a compact multilayer perceptron (MLP) that runs locally in the ASTRA browser application. It evaluates a rolling seven-day synthetic telemetry feature window and reports whether the window resembles one of the generated deviation patterns.

This is an experimental software demonstration, not a medical model, clinical decision system, diagnosis, event predictor, or validated astronaut-health risk estimator.

## Training data and method

- Training data: generated synthetic feature windows only.
- No NASA participant measurements, clinical datasets, or real crew telemetry were used to train or validate this model.
- Training set: 16,000 nominal windows and 16,000 generated deviation windows.
- Hold-out set: 5,000 nominal windows and 5,000 generated deviation windows.
- Four generated deviation families: sustained heart-rate departure, oxygen-signal departure, sleep/fatigue/stress co-occurrence, and temperature drift.
- Sensor dropout is deliberately not a fifth classification label. A deterministic data-quality gate handles missing telemetry and abstains before MLP inference when coverage is insufficient.
- Training seed: `20261115`.
- Development dependencies: NumPy 2.3.5 and scikit-learn 1.8.0.
- Architecture: 9 inputs → 24 ReLU units → 12 ReLU units → 1 sigmoid output.
- Feature normalization: StandardScaler fitted only on the generated training partition.

Reproduce the artifact with Python 3.11+ and the pinned dependencies:

```bash
python -m pip install -r requirements-model-training.txt
python scripts/train_mission_model.py
```

The training script writes both `data/models/mission-anomaly-mlp-v2.json` and the offline browser bundle `data/models/mission-anomaly-mlp-v2.js`.

## Synthetic hold-out results

At the fixed 0.5 score threshold on the 10,000-window synthetic hold-out set:

| Metric | Result |
|---|---:|
| True negatives | 4,948 |
| False positives | 52 |
| False negatives | 53 |
| True positives | 4,947 |
| False-positive rate | 1.04% |
| Precision | 98.96% |
| Recall | 98.94% |

Per-generated-pattern recall:

| Synthetic pattern | Recall |
|---|---:|
| Sustained heart-rate departure | 99.36% |
| Oxygen-signal departure | 99.84% |
| Sleep/fatigue/stress co-occurrence | 99.60% |
| Temperature drift | 96.96% |

**These metrics describe only this artificial generator and its generated hold-out samples.** Training and hold-out windows are sampled from the same project-defined synthetic generator. The results are not independent biomedical validation and do not estimate performance on astronauts, real spacecraft telemetry, clinical measurements, or future missions.

The current JSON artifact is 8,943 bytes. Project-maintained SHA-256: `b82f960295409386fe12de542b72f778341dc0a7f28961a276e7c5ee4d057ea0`.

## Inputs and data-quality gate

The MLP receives nine features from the most recent seven daily records:

1. Mean heart-rate delta from a fixed demonstration reference.
2. Day-to-day heart-rate spread (standard deviation across daily readings; not beat-to-beat heart-rate variability).
3. Mean SpO₂ loss from a demonstration reference.
4. Minimum SpO₂ loss from the same reference.
5. Mean body-temperature delta.
6. Mean sleep-duration delta.
7. Mean self-reported fatigue delta.
8. Mean self-reported stress delta.
9. Fraction of missing vital-sign cells.

Before inference, ASTRA requires at least seven daily records, at least five of seven values for each vital-sign channel, and at least five of seven values for both fatigue and stress self-reports. A window with more than 25% missing vital-sign cells is also blocked. Missing values are never imputed. A blocked window receives a reasoned limited-data/abstention result; the MLP does not classify sensor dropout.

## Output interpretation

The model emits a score between 0 and 1 for similarity to the generated deviation class. This score is **not calibrated** and must not be interpreted as a probability of illness, a medical-risk percentage, or a clinical alert. A score below the threshold is not evidence of health or safety.

The UI's largest standardized feature departures are descriptive model inputs, not causal explanations. A model flag asks the user to inspect the synthetic replay and data completeness. It does not recommend treatment or override mission medical procedures.

## Limitations and risks

- The training generator uses hand-authored assumptions; the model may learn those assumptions rather than real physiology.
- Synthetic distributions, reference values and thresholds are not clinically justified.
- The model has not been evaluated with human-subject data or real spacecraft telemetry.
- The fixed references are demonstrator settings, not NASA standards or medical thresholds.
- The model is not suitable for real astronaut operations.
- A browser-local MLP is not a live external AI assistant. No external LLM or inference API is called by the running application.

## License and provenance

The model artifact was generated by the project's open training script and is distributed under the repository's MIT License. Training uses NumPy and scikit-learn only as development-time tools; deployed browser inference has no Python or third-party runtime dependency. The model was developed for ASTRA and was not downloaded from Hugging Face or Kaggle.
