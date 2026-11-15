# Third-Party Notices and Source Register

This document records data, software, research resources, and tools used to create ASTRA. The repository's `LICENSE` applies to original project code and documentation unless a separate license is stated below.

## Original project code

- Original ASTRA application code, CSS, JavaScript logic, tests, model-training script, model card, and project-authored documentation: MIT License, Copyright 2026 Mahmut Vezir.
- The MIT License does not relicense NASA data or other third-party materials.

## NASA data and research sources

### NASA OSDR — OSD-575, Inspiration4

- Record: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- Data used: Version 3 HDCVD9 transformed serum-assay CSV, NASA ISA sample map and study metadata.
- Declared source license: CC0-1.0 (as recorded on the OSDR study page).
- ASTRA preserves the exact downloaded transformed CSV and its project-maintained SHA-256. The SHA is a reproducibility pin, not a NASA signature.
- The transformed serum assay is retrospective biospecimen research; it is not continuous vital-sign telemetry.

### NASA Human Research Program resources listed for the 2026 Health Monitoring Software challenge

- 5 Hazards of Human Spaceflight: https://www.nasa.gov/hrp/hazards/
- Risks of Human Spaceflight: https://www.nasa.gov/hrp/risks/
- Ongoing HRP Research in Space: https://www.nasa.gov/hrp/ongoing-hrp-research/
- Official challenge: https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/

ASTRA cites these pages as research context for mission hazards and the relevance of sleep, wellbeing, immune and multisystem monitoring. The application does not copy NASA page images or present these resource pages as raw telemetry datasets.

### Other NASA research references

- NASA Standard Measures: https://www.nasa.gov/reference/standard-measures/
- NASA OSDR overview: https://osdr.nasa.gov/
- NASA Life Sciences Portal candidate records are shown with explicit evidence statuses; catalogue visibility is not described as file validation.

## Machine-learning development tools

- Python: https://www.python.org/ — used to execute the reproducible training script.
- NumPy 2.3.5: https://numpy.org/ — BSD-3-Clause; used only for model training and synthetic data generation.
- scikit-learn 1.8.0: https://scikit-learn.org/ — BSD-3-Clause; used only for training, scaling and held-out synthetic evaluation.
- NumPy and scikit-learn are not browser runtime dependencies. The browser performs the small MLP forward pass in project-authored JavaScript.

## AI assistance and model scope

- ChatGPT (OpenAI) assisted with research synthesis, code drafting/modification, debugging, code review, test design, data/analysis interpretation and documentation. AI-assisted output was reviewed and tested by the project lead; details are disclosed in the README.
- ASTRA-SYNTH-MLP-2 is the active project-trained model created from generated synthetic telemetry feature windows. ASTRA-SYNTH-MLP-1 is retained only as a historical artifact and is not loaded by the app. It was not downloaded from Hugging Face or Kaggle and was not trained on NASA or clinical participant data.
- No external LLM service is called by the running application. Mission replay and MLP v2 inference run locally in the browser. No Hugging Face model/Space, Kaggle notebook/dataset, or third-party inference service is integrated in this submission.

## User privacy and media

- No real crew personal data, names, faces, voices or sensitive health records are included in the mission replay.
- Demo and replay health values are synthetic or manually entered; users are instructed not to enter identifiable or sensitive health information.
- NASA attribution and source links do not imply NASA endorsement. ASTRA is an independent student project.
