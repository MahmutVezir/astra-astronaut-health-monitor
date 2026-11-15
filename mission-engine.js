(function (root) {
  "use strict";

  const SIGNAL_KEYS = ["heartRate", "spo2", "temperature", "sleep"];
  const SIGNAL_SPECS = {
    heartRate: { label: "Heart rate", unit: "BPM", baseline: 72 },
    spo2: { label: "SpO₂", unit: "%", baseline: 98 },
    temperature: { label: "Body temperature", unit: "°C", baseline: 36.7 },
    sleep: { label: "Sleep duration", unit: "h", baseline: 7.5 }
  };
  const FEATURE_LABELS = {
    heart_rate_mean_delta_bpm: "Mean heart-rate change",
    heart_rate_std_bpm: "Day-to-day heart-rate spread",
    spo2_mean_loss_percentage_points: "Mean SpO₂ change",
    spo2_min_loss_percentage_points: "Lowest SpO₂ departure",
    temperature_mean_delta_c: "Mean temperature change",
    sleep_mean_delta_hours: "Mean sleep-duration change",
    fatigue_mean_delta_1_to_5: "Self-reported fatigue",
    stress_mean_delta_1_to_5: "Self-reported stress",
    missing_fraction: "Missing telemetry fraction"
  };

  function makeRandom(seed) {
    let state = (seed >>> 0) || 1;
    return function () {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function makeNormal(random) {
    let spare = null;
    return function () {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      const u = Math.max(random(), 1e-12);
      const v = random();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      const angle = 2 * Math.PI * v;
      spare = magnitude * Math.sin(angle);
      return magnitude * Math.cos(angle);
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createMissionReplay(scenarioId, options) {
    const scenario = scenarioId || "nominal";
    const settings = options || {};
    const seed = Number.isInteger(settings.seed) ? settings.seed : 20261115;
    const days = Number.isInteger(settings.days) ? clamp(settings.days, 1, 60) : 30;
    const random = makeRandom(seed);
    const normal = makeNormal(random);
    const records = [];

    for (let day = 1; day <= days; day += 1) {
      const active = day >= 10;
      let heartRate = 72 + normal() * 4.4;
      let spo2 = 98 + normal() * 0.45;
      let temperature = 36.7 + normal() * 0.17;
      let sleep = 7.5 + normal() * 0.65;
      let fatigue = clamp(2 + normal() * 0.55, 1, 5);
      let stress = clamp(2 + normal() * 0.55, 1, 5);

      if (active && scenario === "cardiovascular-shift") {
        heartRate += 15 + normal() * 2.5;
      } else if (active && scenario === "oxygen-deviation") {
        spo2 -= 2.0 + Math.max(0, normal() * 0.35);
        if (day % 4 === 0) spo2 -= 1.5;
      } else if (active && scenario === "sleep-fatigue") {
        sleep -= 2.25 + normal() * 0.25;
        fatigue += 2.1;
        stress += 1.35;
      } else if (active && scenario === "temperature-drift") {
        temperature += 0.72 + normal() * 0.08;
        heartRate += 6 + normal() * 1.5;
      } else if (active && scenario === "multi-signal") {
        heartRate += 13 + normal() * 2;
        spo2 -= 1.7 + Math.max(0, normal() * 0.25);
        temperature += 0.58 + normal() * 0.06;
        sleep -= 1.9 + normal() * 0.2;
        fatigue += 1.8;
        stress += 1.4;
      }

      const readings = {
        heartRate: Math.round(heartRate * 10) / 10,
        spo2: Math.round(spo2 * 10) / 10,
        temperature: Math.round(temperature * 100) / 100,
        sleep: Math.round(sleep * 10) / 10
      };

      if (active && scenario === "sensor-dropout") {
        const missingCount = 1 + Math.floor(random() * 2);
        const order = SIGNAL_KEYS.slice();
        for (let i = order.length - 1; i > 0; i -= 1) {
          const j = Math.floor(random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        order.slice(0, missingCount).forEach(function (key) { readings[key] = null; });
      }

      SIGNAL_KEYS.forEach(function (key) {
        if (readings[key] !== null) {
          readings[key] = clamp(readings[key], key === "spo2" ? 80 : key === "temperature" ? 34 : key === "sleep" ? 0 : 35,
            key === "spo2" ? 100 : key === "temperature" ? 41 : key === "sleep" ? 14 : 180);
        }
      });

      records.push({
        day: day,
        elapsedHours: day * 24,
        timestamp: "Mission day " + String(day).padStart(2, "0"),
        readings: readings,
        wellbeing: {
          fatigue: Math.round(clamp(fatigue, 1, 5) * 10) / 10,
          stress: Math.round(clamp(stress, 1, 5) * 10) / 10
        },
        source: "SIMULATED",
        scenario: scenario
      });
    }

    return records;
  }

  function average(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function standardDeviation(values) {
    if (values.length < 2) return 0;
    const mean = average(values);
    return Math.sqrt(average(values.map(function (value) { return Math.pow(value - mean, 2); })));
  }

  function buildFeatureVector(windowRecords) {
    if (!Array.isArray(windowRecords) || windowRecords.length < 7) {
      return { status: "INSUFFICIENT_HISTORY", reason: "At least seven daily records are required for a rolling analysis." };
    }

    const window = windowRecords.slice(-7);
    const series = {};
    let missing = 0;
    SIGNAL_KEYS.forEach(function (key) {
      series[key] = window.map(function (record) {
        const raw = record && record.readings ? record.readings[key] : null;
        if (raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw))) {
          missing += 1;
          return null;
        }
        return Number(raw);
      }).filter(function (value) { return value !== null; });
    });

    const missingFraction = missing / (window.length * SIGNAL_KEYS.length);
    const insufficient = SIGNAL_KEYS.filter(function (key) { return series[key].length < 5; });
    if (insufficient.length) {
      return {
        status: "LIMITED_DATA",
        reason: "The model abstained because fewer than five of seven daily readings are available for: " +
          insufficient.map(function (key) { return SIGNAL_SPECS[key].label; }).join(", ") + ".",
        missingFraction: missingFraction,
        missingCount: missing
      };
    }

    const selfReportValues = function (key) {
      return window.map(function (record) {
        const raw = record && record.wellbeing ? record.wellbeing[key] : null;
        if (raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw))) return null;
        return Number(raw);
      }).filter(function (value) { return value !== null; });
    };
    const fatigue = selfReportValues("fatigue");
    const stress = selfReportValues("stress");
    const selfReportMissingCount = window.length * 2 - fatigue.length - stress.length;
    if (fatigue.length < 5 || stress.length < 5) {
      return {
        status: "LIMITED_DATA",
        reason: "The model abstained because fewer than five daily values are available for both fatigue and stress self-reports.",
        missingFraction: missingFraction,
        missingCount: missing,
        selfReportMissingCount: selfReportMissingCount
      };
    }

    const hr = series.heartRate;
    const oxygen = series.spo2;
    const temperature = series.temperature;
    const sleep = series.sleep;

    const values = {
      heart_rate_mean_delta_bpm: average(hr) - SIGNAL_SPECS.heartRate.baseline,
      heart_rate_std_bpm: standardDeviation(hr),
      spo2_mean_loss_percentage_points: SIGNAL_SPECS.spo2.baseline - average(oxygen),
      spo2_min_loss_percentage_points: SIGNAL_SPECS.spo2.baseline - Math.min.apply(null, oxygen),
      temperature_mean_delta_c: average(temperature) - SIGNAL_SPECS.temperature.baseline,
      sleep_mean_delta_hours: average(sleep) - SIGNAL_SPECS.sleep.baseline,
      fatigue_mean_delta_1_to_5: average(fatigue) - 2,
      stress_mean_delta_1_to_5: average(stress) - 2,
      missing_fraction: missingFraction
    };

    return {
      status: missingFraction > 0.25 ? "LIMITED_DATA" : "READY",
      reason: missingFraction > 0.25
        ? "More than one quarter of the vital-sign cells are missing. The model abstained rather than inferring a physiological pattern."
        : null,
      missingFraction: missingFraction,
      missingCount: missing,
      selfReportMissingCount: selfReportMissingCount,
      values: values,
      featureVector: Object.keys(FEATURE_LABELS).map(function (key) { return values[key]; })
    };
  }

  function sigmoid(value) {
    if (value >= 0) {
      const z = Math.exp(-value);
      return 1 / (1 + z);
    }
    const z = Math.exp(value);
    return z / (1 + z);
  }

  function matrixLayer(input, weights, biases, activation) {
    const outputCount = biases.length;
    const output = new Array(outputCount);
    for (let j = 0; j < outputCount; j += 1) {
      let sum = biases[j];
      for (let i = 0; i < input.length; i += 1) {
        sum += input[i] * weights[i][j];
      }
      output[j] = activation === "relu" ? Math.max(0, sum) : sum;
    }
    return output;
  }

  function predict(features, model) {
    if (!model || model.modelId !== "ASTRA-SYNTH-MLP-2" || model.version !== 2) {
      throw new Error("ASTRA synthetic model v2 is not available.");
    }
    if (!Number.isFinite(model.threshold) || model.threshold <= 0 || model.threshold >= 1) {
      throw new Error("ASTRA synthetic model v2 has no valid classification threshold.");
    }
    if (!Array.isArray(features) || features.length !== model.featureNames.length ||
        features.some(function (value) { return !Number.isFinite(value); })) {
      throw new Error("The model requires a complete finite feature vector.");
    }

    let values = features.map(function (value, index) {
      return (value - model.scalerMean[index]) / model.scalerScale[index];
    });

    model.weights.forEach(function (weights, index) {
      values = matrixLayer(values, weights, model.biases[index],
        index < model.weights.length - 1 ? "relu" : "linear");
    });

    const score = sigmoid(values[0]);
    const standardized = features.map(function (value, index) {
      return (value - model.scalerMean[index]) / model.scalerScale[index];
    });
    const drivers = standardized.map(function (value, index) {
      return {
        key: model.featureNames[index],
        label: FEATURE_LABELS[model.featureNames[index]],
        standardizedDeparture: value,
        magnitude: Math.abs(value)
      };
    }).sort(function (a, b) { return b.magnitude - a.magnitude; }).slice(0, 3);

    return {
      status: score >= model.threshold ? "PATTERN_DEVIATION" : "NOMINAL_LIKE",
      score: score,
      threshold: model.threshold,
      drivers: drivers,
      explanation: score >= model.threshold
        ? "The seven-day feature window resembles one or more generated deviation patterns in the synthetic training set. This is not a medical-risk estimate."
        : "The seven-day feature window did not cross the model's synthetic-pattern threshold. This is not a health clearance.",
      modelId: model.modelId
    };
  }

  function analyzeWindow(records, model) {
    const featureResult = buildFeatureVector(records);
    if (featureResult.status !== "READY") return featureResult;
    const prediction = predict(featureResult.featureVector, model);
    return Object.assign({}, featureResult, { prediction: prediction, status: prediction.status });
  }

  root.AstraMissionEngine = {
    SIGNAL_KEYS: SIGNAL_KEYS,
    SIGNAL_SPECS: SIGNAL_SPECS,
    FEATURE_LABELS: FEATURE_LABELS,
    createMissionReplay: createMissionReplay,
    buildFeatureVector: buildFeatureVector,
    predict: predict,
    analyzeWindow: analyzeWindow
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AstraMissionEngine;
})(typeof globalThis !== "undefined" ? globalThis : this);
