(function (root) {
  "use strict";

  const FEATURE_LIMITS = {
    heart_rate_delta_bpm: [-30, 30],
    spo2_drop_percentage_points: [-10, 10],
    temperature_delta_c: [-5, 5],
    sleep_delta_hours: [-8, 8],
    missing_rate: [0, 1],
    stale_rate: [0, 1],
    flatline_rate: [0, 1],
    wellbeing_flag_count: [0, 4]
  };

  const FEATURE_LABELS = {
    heart_rate_delta_bpm: "heart-rate change",
    spo2_drop_percentage_points: "SpO2 change",
    temperature_delta_c: "temperature change",
    sleep_delta_hours: "sleep-duration change",
    missing_rate: "missing-data rate",
    stale_rate: "stale-telemetry rate",
    flatline_rate: "flatline rate",
    wellbeing_flag_count: "wellbeing self-report flags"
  };

  const PATTERN_LABELS = {
    STABLE_MONITORING: "Stable monitoring pattern",
    MULTI_SIGNAL_DRIFT: "Multi-signal drift pattern",
    DATA_QUALITY_REVIEW: "Telemetry quality review",
    WELLBEING_CONTEXT_REVIEW: "Wellbeing-context pattern",
    MIXED_REVIEW: "Mixed signal and data-quality pattern"
  };

  const PATTERN_DESCRIPTIONS = {
    STABLE_MONITORING: "The synthetic model found no strong review pattern in this window. This is not a health clearance.",
    MULTI_SIGNAL_DRIFT: "Several signals changed together relative to the beginning of this simulated window. Confirm the readings and review mission context.",
    DATA_QUALITY_REVIEW: "Missing, delayed or repeated measurements are prominent. The system prioritizes data-quality review before interpreting the signal pattern.",
    WELLBEING_CONTEXT_REVIEW: "A wellbeing self-report flag pattern appears alongside changes in the measurements. This is context for human review, not a psychological or medical assessment.",
    MIXED_REVIEW: "Signal changes and telemetry-quality concerns occur together. The window should be reviewed before drawing conclusions."
  };

  function mulberry32(seed) {
    return function () {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    const first = Math.max(1e-9, random());
    const second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  }

  function round(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
  }

  function simulateWindow(profile, seed) {
    const scenario = profile || "nominal";
    const random = mulberry32(Number.isInteger(seed) ? seed : 20261115);
    const previous = { heartRate: null, spo2: null, temperature: null, sleepHours: null };
    const wellbeingProfiles = {
      nominal: { sleepQuality: 4, stress: 2, fatigue: 2, mood: 4 },
      drift: { sleepQuality: 3, stress: 3, fatigue: 3, mood: 4 },
      dropouts: { sleepQuality: 4, stress: 2, fatigue: 2, mood: 4 },
      wellbeing: { sleepQuality: 2, stress: 4, fatigue: 4, mood: 3 },
      mixed: { sleepQuality: 2, stress: 4, fatigue: 4, mood: 3 }
    };
    if (!wellbeingProfiles[scenario]) throw new Error("Unknown mission scenario: " + scenario);

    const samples = [];
    for (let index = 0; index < 12; index += 1) {
      const progress = index / 11;
      let heartRate = 72 + normal(random) * 1.4;
      let spo2 = 98.1 + normal(random) * 0.28;
      let temperature = 36.7 + normal(random) * 0.07;
      let sleepHours = 7.5 + normal(random) * 0.28;
      let latencySeconds = 15 + Math.round(random() * 45);
      const wellbeing = Object.assign({}, wellbeingProfiles[scenario]);

      if (scenario === "drift") {
        heartRate += 12.5 * progress;
        spo2 -= 2.0 * progress;
        temperature += 0.58 * progress;
        sleepHours -= 1.55 * progress;
      } else if (scenario === "wellbeing") {
        heartRate += 5.5 * progress;
        spo2 -= 0.35 * progress;
        temperature += 0.18 * progress;
        sleepHours -= 1.8 * progress;
      } else if (scenario === "mixed") {
        heartRate += 13.5 * progress;
        spo2 -= 2.2 * progress;
        temperature += 0.68 * progress;
        sleepHours -= 1.8 * progress;
        if (index >= 6 && random() < 0.45) latencySeconds = 160 + Math.round(random() * 180);
      } else if (scenario === "dropouts") {
        if (index >= 4 && random() < 0.62) latencySeconds = 150 + Math.round(random() * 240);
      }

      heartRate = round(clamp(heartRate, 30, 220), 1);
      spo2 = round(clamp(spo2, 50, 100), 1);
      temperature = round(clamp(temperature, 30, 45), 2);
      sleepHours = round(clamp(sleepHours, 0, 24), 1);

      if (scenario === "dropouts") {
        if (index >= 4 && random() < 0.30) heartRate = null;
        if (index >= 3 && random() < 0.27) spo2 = null;
        if (index >= 5 && random() < 0.22) temperature = null;
        if (index >= 4 && random() < 0.20) sleepHours = null;
        if (index >= 6 && previous.heartRate !== null && random() < 0.45) heartRate = previous.heartRate;
        if (index >= 6 && previous.spo2 !== null && random() < 0.40) spo2 = previous.spo2;
      }

      samples.push({
        index: index,
        timepoint: "T+" + (index * 2) + "h",
        heartRate: heartRate,
        spo2: spo2,
        temperature: temperature,
        sleepHours: sleepHours,
        latencySeconds: latencySeconds,
        wellbeing: wellbeing,
        source: "SIMULATED"
      });

      if (heartRate !== null) previous.heartRate = heartRate;
      if (spo2 !== null) previous.spo2 = spo2;
      if (temperature !== null) previous.temperature = temperature;
      if (sleepHours !== null) previous.sleepHours = sleepHours;
    }

    return {
      profile: scenario,
      generatedAt: new Date().toISOString(),
      source: "SIMULATED",
      samples: samples
    };
  }

  function mean(values) {
    return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null;
  }

  function wellbeingFlagCount(value) {
    if (!value) return 0;
    return [
      Number(value.sleepQuality) <= 2,
      Number(value.stress) >= 4,
      Number(value.fatigue) >= 4,
      Number(value.mood) <= 2
    ].filter(Boolean).length;
  }

  function extractFeatures(windowData) {
    const samples = Array.isArray(windowData) ? windowData : windowData && windowData.samples;
    if (!Array.isArray(samples) || samples.length < 6) {
      return { status: "ABSTAIN", reason: "At least six checkpoints are required to compare the beginning and end of a monitoring window." };
    }

    const keys = ["heartRate", "spo2", "temperature", "sleepHours"];
    const feature = {};
    const validCounts = {};
    let missing = 0;
    let expected = samples.length * keys.length;

    keys.forEach(function (key) {
      const values = samples.map(function (sample) {
        const value = sample[key];
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      });
      const valid = values.filter(function (value) { return value !== null; });
      validCounts[key] = valid.length;
      missing += values.length - valid.length;
      const first = values.slice(0, 3).filter(function (value) { return value !== null; });
      const last = values.slice(-3).filter(function (value) { return value !== null; });
      if (valid.length < 4 || first.length < 1 || last.length < 1) {
        feature[key] = null;
      } else {
        feature[key] = { first: mean(first), last: mean(last), values: valid };
      }
    });

    const inadequate = keys.filter(function (key) { return !feature[key]; });
    if (inadequate.length) {
      return {
        status: "ABSTAIN",
        reason: "Not enough valid samples to compare: " + inadequate.join(", ") + ".",
        validCounts: validCounts
      };
    }

    const flatline = { heartRate: 1, spo2: 0.05, temperature: 0.01, sleepHours: 0.05 };
    let repeated = 0;
    let pairs = 0;
    keys.forEach(function (key) {
      let previousValue = null;
      samples.forEach(function (sample) {
        const value = sample[key];
        if (typeof value !== "number" || !Number.isFinite(value)) return;
        if (previousValue !== null) {
          pairs += 1;
          if (Math.abs(value - previousValue) <= flatline[key]) repeated += 1;
        }
        previousValue = value;
      });
    });

    const staleCount = samples.filter(function (sample) {
      return Number.isFinite(Number(sample.latencySeconds)) && Number(sample.latencySeconds) > 120;
    }).length;

    const lastWellbeing = samples[samples.length - 1].wellbeing;
    const features = {
      heart_rate_delta_bpm: round(feature.heartRate.last - feature.heartRate.first, 3),
      spo2_drop_percentage_points: round(feature.spo2.first - feature.spo2.last, 3),
      temperature_delta_c: round(feature.temperature.last - feature.temperature.first, 3),
      sleep_delta_hours: round(feature.sleepHours.last - feature.sleepHours.first, 3),
      missing_rate: round(missing / expected, 4),
      stale_rate: round(staleCount / samples.length, 4),
      flatline_rate: round(pairs ? repeated / pairs : 0, 4),
      wellbeing_flag_count: wellbeingFlagCount(lastWellbeing)
    };

    if (features.missing_rate > 0.70) {
      return { status: "ABSTAIN", reason: "More than 70% of the expected signal values are missing.", features: features, validCounts: validCounts };
    }

    const outOfRange = Object.keys(FEATURE_LIMITS).filter(function (key) {
      const bounds = FEATURE_LIMITS[key];
      return !Number.isFinite(features[key]) || features[key] < bounds[0] || features[key] > bounds[1];
    });
    if (outOfRange.length) {
      return { status: "ABSTAIN", reason: "Feature values are outside the model's supported envelope: " + outOfRange.join(", ") + ".", features: features, validCounts: validCounts };
    }

    return { status: "READY", features: features, validCounts: validCounts };
  }

  function predictPattern(features, model, options) {
    const settings = options || {};
    const threshold = Number.isFinite(settings.minimumConfidence) ? settings.minimumConfidence : 0.65;
    if (!model || !model.tree || !Array.isArray(model.dataset && model.dataset.features)) {
      return { status: "ABSTAIN", reason: "The local mission-pattern model is not available." };
    }

    const missing = model.dataset.features.filter(function (key) {
      return !features || !Number.isFinite(features[key]);
    });
    if (missing.length) {
      return { status: "ABSTAIN", reason: "Required model features are missing: " + missing.join(", ") + "." };
    }

    const path = [];
    let node = model.tree;
    while (node && node.feature) {
      const value = features[node.feature];
      const goLeft = value <= node.threshold;
      path.push({
        feature: node.feature,
        label: FEATURE_LABELS[node.feature] || node.feature,
        value: value,
        operator: goLeft ? "≤" : ">",
        threshold: node.threshold
      });
      node = goLeft ? node.left : node.right;
    }

    if (!node || !node.class || !node.probabilities) {
      return { status: "ABSTAIN", reason: "The model tree did not return a valid terminal class." };
    }

    const confidence = Number(node.probabilities[node.class]) || 0;
    if (confidence < threshold) {
      return {
        status: "ABSTAIN",
        reason: "The terminal model leaf does not provide enough class support for a prediction.",
        confidence: confidence,
        minimumConfidence: threshold,
        path: path
      };
    }

    return {
      status: "PREDICTION",
      className: node.class,
      label: PATTERN_LABELS[node.class] || node.class,
      description: PATTERN_DESCRIPTIONS[node.class] || "Review this synthetic pattern with mission context.",
      confidence: confidence,
      confidenceKind: "training-leaf class share; not a clinical probability",
      minimumConfidence: threshold,
      path: path,
      modelId: model.model_id,
      validation: model.validation || null,
      syntheticOnly: true
    };
  }

  function analyzeWindow(windowData, model, options) {
    const featureResult = extractFeatures(windowData);
    if (featureResult.status !== "READY") {
      return {
        status: "ABSTAIN",
        reason: featureResult.reason,
        features: featureResult.features || null,
        validCounts: featureResult.validCounts || null,
        source: windowData && windowData.source || "UNKNOWN"
      };
    }
    const prediction = predictPattern(featureResult.features, model, options);
    return Object.assign({}, prediction, {
      features: featureResult.features,
      validCounts: featureResult.validCounts,
      source: windowData && windowData.source || "UNKNOWN",
      sampleCount: (Array.isArray(windowData) ? windowData : windowData.samples).length
    });
  }

  root.AstraMissionAI = {
    FEATURE_LIMITS: FEATURE_LIMITS,
    PATTERN_LABELS: PATTERN_LABELS,
    simulateWindow: simulateWindow,
    extractFeatures: extractFeatures,
    predictPattern: predictPattern,
    analyzeWindow: analyzeWindow
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AstraMissionAI;
})(typeof globalThis !== "undefined" ? globalThis : this);
