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

  function assess(readings, bands) {
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

    return {
      status: status,
      summary: summary,
      available: available,
      missing: missing,
      invalid: invalid,
      review: review,
      total: items.length,
      items: items
    };
  }

  root.AstraHealth = {
    SIGNALS: SIGNALS,
    DEFAULT_BANDS: DEFAULT_BANDS,
    evaluateSignal: evaluateSignal,
    assess: assess
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AstraHealth;
})(typeof globalThis !== "undefined" ? globalThis : this);
