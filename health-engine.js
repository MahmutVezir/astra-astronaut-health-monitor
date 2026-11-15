(function (root) {
  "use strict";
  const SIGNALS = {
    heartRate: { label: "Heart rate", unit: "BPM", lower: 60, upper: 85, min: 30, max: 220, digits: 0 },
    spo2: { label: "Blood oxygen", unit: "%", lower: 96, upper: 100, min: 50, max: 100, digits: 1 },
    temperature: { label: "Body temperature", unit: "°C", lower: 36.2, upper: 37.2, min: 30, max: 45, digits: 1 },
    sleep: { label: "Sleep duration", unit: "h", lower: 6.5, upper: 9, min: 0, max: 24, digits: 1 }
  };

  const DEFAULT_BANDS = Object.keys(SIGNALS).reduce(function (result, key) {
    result[key] = { lower: SIGNALS[key].lower, upper: SIGNALS[key].upper };
    return result;
  }, {});

  // These are demonstration sensitivities for comparing a reading with a captured
  // personal baseline. They are not clinical limits or NASA flight rules.
  const BASELINE_TOLERANCES = {
    heartRate: 15,
    spo2: 2,
    temperature: 0.5,
    sleep: 1.5
  };

  const WELLBEING_LABELS = {
    sleepQuality: "Sleep quality",
    stress: "Perceived stress",
    fatigue: "Fatigue",
    mood: "Mood"
  };

  function parseFiniteNumber(raw) {
    if (typeof raw !== "number" && typeof raw !== "string") return NaN;
    if (typeof raw === "string" && raw.trim() === "") return NaN;
    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function toNumberOrNull(raw) {
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
    return parseFiniteNumber(raw);
  }

  function resolveBand(key, bands) {
    const spec = SIGNALS[key];
    const hasOverride = bands && Object.prototype.hasOwnProperty.call(bands, key);
    const candidate = hasOverride ? bands[key] : DEFAULT_BANDS[key];

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { lower: NaN, upper: NaN, valid: false };
    }

    const lower = parseFiniteNumber(candidate.lower);
    const upper = parseFiniteNumber(candidate.upper);
    const valid = Number.isFinite(lower) &&
      Number.isFinite(upper) &&
      lower < upper &&
      lower >= spec.min &&
      upper <= spec.max;

    return { lower: lower, upper: upper, valid: valid };
  }

  function evaluateSignal(key, raw, bands) {
    const spec = SIGNALS[key];
    if (!spec) throw new Error("Unknown signal: " + key);

    const value = toNumberOrNull(raw);
    const band = resolveBand(key, bands);

    if (!band.valid) {
      return {
        key: key,
        label: spec.label,
        value: null,
        unit: spec.unit,
        status: "INVALID",
        explanation: "The configured reference band is invalid. Check its lower and upper values."
      };
    }

    if (value === null) {
      return {
        key: key,
        label: spec.label,
        value: null,
        unit: spec.unit,
        status: "NO_DATA",
        explanation: "No reading was entered. This signal cannot be assessed."
      };
    }

    if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
      return {
        key: key,
        label: spec.label,
        value: null,
        unit: spec.unit,
        status: "INVALID",
        explanation: "The entry is not a valid number in the app's basic input range. Check the value and unit."
      };
    }

    if (value < band.lower || value > band.upper) {
      const direction = value < band.lower ? "below" : "above";
      return {
        key: key,
        label: spec.label,
        value: value,
        unit: spec.unit,
        status: "REVIEW",
        explanation: "This reading is " + direction + " the configured reference band (" + band.lower + "–" + band.upper + " " + spec.unit + "). Review the reading and follow mission procedures."
      };
    }

    return {
      key: key,
      label: spec.label,
      value: value,
      unit: spec.unit,
      status: "WITHIN",
      explanation: "This reading is inside the configured reference band (" + band.lower + "–" + band.upper + " " + spec.unit + ")."
    };
  }

  function assessBaseline(readings, baseline, tolerances) {
    const baselineValues = baseline && baseline.readings ? baseline.readings : baseline;
    const hasBaseline = baselineValues && typeof baselineValues === "object";
    const activeTolerances = tolerances || BASELINE_TOLERANCES;
    const items = Object.keys(SIGNALS).map(function (key) {
      const spec = SIGNALS[key];
      const current = toNumberOrNull(readings ? readings[key] : null);
      const reference = hasBaseline ? toNumberOrNull(baselineValues[key]) : null;
      const tolerance = parseFiniteNumber(activeTolerances[key]);

      if (!hasBaseline) {
        return {
          key: key,
          label: spec.label,
          value: Number.isFinite(current) ? current : null,
          baseline: null,
          delta: null,
          tolerance: Number.isFinite(tolerance) ? tolerance : null,
          status: "NO_BASELINE",
          explanation: "No personal baseline is recorded for this signal."
        };
      }

      if (current === null) {
        return {
          key: key,
          label: spec.label,
          value: null,
          baseline: Number.isFinite(reference) ? reference : null,
          delta: null,
          tolerance: Number.isFinite(tolerance) ? tolerance : null,
          status: "NO_DATA",
          explanation: "No current reading is available for comparison."
        };
      }

      if (reference === null) {
        return {
          key: key,
          label: spec.label,
          value: current,
          baseline: null,
          delta: null,
          tolerance: Number.isFinite(tolerance) ? tolerance : null,
          status: "NO_BASELINE",
          explanation: "No personal baseline is recorded for this signal."
        };
      }

      if (!Number.isFinite(current) || current < spec.min || current > spec.max ||
          !Number.isFinite(reference) || reference < spec.min || reference > spec.max ||
          !Number.isFinite(tolerance) || tolerance <= 0) {
        return {
          key: key,
          label: spec.label,
          value: null,
          baseline: Number.isFinite(reference) ? reference : null,
          delta: null,
          tolerance: Number.isFinite(tolerance) ? tolerance : null,
          status: "INVALID",
          explanation: "The current value, baseline value or demonstration tolerance is invalid."
        };
      }

      const delta = current - reference;
      const shifted = Math.abs(delta) >= tolerance;
      const direction = delta > 0 ? "above" : delta < 0 ? "below" : "equal to";
      return {
        key: key,
        label: spec.label,
        value: current,
        baseline: reference,
        delta: delta,
        tolerance: tolerance,
        status: shifted ? "SHIFT" : "STABLE",
        explanation: shifted
          ? "Current reading is " + Math.abs(delta).toFixed(spec.digits) + " " + spec.unit + " " + direction +
            " the captured baseline; the demonstration tolerance is " + tolerance + " " + spec.unit + "."
          : "Difference from the captured baseline is within the demonstration tolerance (" + tolerance + " " + spec.unit + ")."
      };
    });

    const available = items.filter(function (item) { return item.status === "SHIFT" || item.status === "STABLE"; }).length;
    const shifts = items.filter(function (item) { return item.status === "SHIFT"; });
    const invalid = items.filter(function (item) { return item.status === "INVALID"; }).length;
    const missing = items.length - available - invalid;
    let status = "STABLE";
    let summary = "All available signals are within the illustrative personal-baseline tolerances.";

    if (!hasBaseline) {
      status = "NO_BASELINE";
      summary = "No personal baseline is set. Save a complete, valid set of readings as a baseline before comparing future changes.";
    } else if (invalid > 0) {
      status = "INVALID";
      summary = invalid + " baseline comparison" + (invalid === 1 ? " has" : "s have") + " invalid input and cannot be interpreted.";
    } else if (missing > 0) {
      status = "LIMITED";
      summary = "Baseline comparison is limited: " + missing + " of " + items.length + " signal comparisons lack a current or baseline value.";
      if (shifts.length) summary += " " + shifts.length + " available signal" + (shifts.length === 1 ? " exceeds" : "s exceed") + " its demonstration tolerance.";
    } else if (shifts.length > 0) {
      status = "SHIFT";
      summary = shifts.length + " of " + items.length + " signals exceed their illustrative personal-baseline tolerances. Confirm the readings and review the context.";
    }

    return { status: status, summary: summary, available: available, missing: missing, invalid: invalid, shifts: shifts, items: items };
  }

  function assessWellbeing(wellbeing, recorded) {
    if (!recorded) {
      return {
        status: "NO_CHECK_IN",
        summary: "No wellbeing check-in has been saved. Subjective crew context is not available.",
        flags: [],
        items: []
      };
    }

    const values = wellbeing || {};
    const invalid = Object.keys(WELLBEING_LABELS).filter(function (key) {
      const value = parseFiniteNumber(values[key]);
      return !Number.isInteger(value) || value < 1 || value > 5;
    });
    if (invalid.length) {
      return {
        status: "INVALID",
        summary: "The wellbeing check-in contains values outside the 1–5 input scale.",
        flags: [],
        items: invalid.map(function (key) { return { key: key, label: WELLBEING_LABELS[key], status: "INVALID" }; })
      };
    }

    const rules = [
      { key: "sleepQuality", test: values.sleepQuality <= 2, message: "Low self-reported sleep quality" },
      { key: "stress", test: values.stress >= 4, message: "High self-reported stress" },
      { key: "fatigue", test: values.fatigue >= 4, message: "High self-reported fatigue" },
      { key: "mood", test: values.mood <= 2, message: "Low self-reported mood" }
    ];
    const flags = rules.filter(function (rule) { return rule.test; }).map(function (rule) {
      return { key: rule.key, label: WELLBEING_LABELS[rule.key], message: rule.message };
    });
    return {
      status: flags.length ? "REVIEW" : "NO_FLAGS",
      summary: flags.length
        ? flags.map(function (flag) { return flag.message; }).join("; ") + ". These are self-reported context flags, not a psychological or medical assessment."
        : "No self-report flags were triggered by the illustrative review rules. This does not establish that a crew member is well.",
      flags: flags,
      items: Object.keys(WELLBEING_LABELS).map(function (key) {
        return { key: key, label: WELLBEING_LABELS[key], value: Number(values[key]), status: "RECORDED" };
      })
    };
  }

  function assessContext(baseline, wellbeing) {
    const baselineAvailable = baseline.status === "STABLE" || baseline.status === "SHIFT";
    const wellbeingAvailable = wellbeing.status === "NO_FLAGS" || wellbeing.status === "REVIEW";
    if (!baselineAvailable || !wellbeingAvailable) {
      return {
        status: "LIMITED",
        summary: "Combined context is limited until both a complete personal baseline comparison and a saved wellbeing check-in are available."
      };
    }
    if (baseline.status === "SHIFT" && wellbeing.status === "REVIEW") {
      return {
        status: "CONCURRENT_FLAGS",
        summary: "Baseline deviations and self-reported wellbeing flags are present in the same review. This co-occurrence is a prompt for human review; it does not establish correlation, cause or a medical condition."
      };
    }
    if (baseline.status === "SHIFT") {
      return {
        status: "BASELINE_ONLY",
        summary: "Personal-baseline deviations are present without a wellbeing self-report flag. Review the measurements and collect context before drawing conclusions."
      };
    }
    if (wellbeing.status === "REVIEW") {
      return {
        status: "WELLBEING_ONLY",
        summary: "The wellbeing check-in contains self-report flags, while current signals remain within the configured personal-baseline tolerances. Consider the self-report as separate context."
      };
    }
    return {
      status: "NO_FLAGS",
      summary: "No baseline-deviation or wellbeing self-report flags were triggered by the illustrative rules. This is not a medical clearance."
    };
  }

  function assess(readings, bands, context) {
    const options = context || {};
    const items = Object.keys(SIGNALS).map(function (key) {
      return evaluateSignal(key, readings ? readings[key] : null, bands);
    });
    const available = items.filter(function (item) {
      return item.status === "WITHIN" || item.status === "REVIEW";
    }).length;
    const invalid = items.filter(function (item) { return item.status === "INVALID"; }).length;
    const missing = items.length - available - invalid;
    const review = items.filter(function (item) { return item.status === "REVIEW"; }).length;

    let status = "WITHIN";
    let summary = "All available readings are inside the configured reference bands. This is not a medical clearance.";

    if (invalid > 0) {
      status = "INVALID";
      summary = invalid + (invalid === 1 ? " entry needs" : " entries need") + " correction before it can be assessed.";
    } else if (missing > 0) {
      status = "LIMITED";
      summary = "Assessment is limited: " + missing + " of " + items.length + " signals have no reading. Missing data is not treated as normal.";
      if (review > 0) summary += " " + review + " available signal" + (review === 1 ? " is" : "s are") + " outside its configured band.";
    } else if (review > 0) {
      status = "REVIEW";
      summary = review + " of " + items.length + " readings are outside their configured reference bands. Confirm the measurement and follow mission medical procedures.";
    }

    const baseline = assessBaseline(readings, options.baseline, options.baselineTolerances);
    const wellbeing = assessWellbeing(options.wellbeing, options.wellbeingRecorded === true);
    const combinedContext = assessContext(baseline, wellbeing);

    return {
      status: status,
      summary: summary,
      available: available,
      missing: missing,
      invalid: invalid,
      review: review,
      total: items.length,
      items: items,
      baseline: baseline,
      wellbeing: wellbeing,
      context: combinedContext
    };
  }

  root.AstraHealth = {
    SIGNALS: SIGNALS,
    DEFAULT_BANDS: DEFAULT_BANDS,
    BASELINE_TOLERANCES: BASELINE_TOLERANCES,
    evaluateSignal: evaluateSignal,
    assessBaseline: assessBaseline,
    assessWellbeing: assessWellbeing,
    assess: assess
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AstraHealth;
})(typeof globalThis !== "undefined" ? globalThis : this);
