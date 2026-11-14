(function (root) {
  "use strict";

  const SIGNALS = {
    heartRate: { label: "Heart rate", unit: "BPM", lower: 60, upper: 85, min: 30, max: 220, digits: 0 },
    spo2: { label: "Blood oxygen", unit: "%", lower: 96, upper: 100, min: 50, max: 100, digits: 1 },
    temperature: { label: "Body temperature", unit: "°C", lower: 36.2, upper: 37.2, min: 30, max: 45, digits: 1 },
    sleep: { label: "Sleep duration", unit: "h", lower: 6.5, upper: 9, min: 0, max: 24, digits: 1 }
  };

  function toNumberOrNull(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function evaluateSignal(key, raw) {
    const spec = SIGNALS[key];
    if (!spec) throw new Error("Unknown signal: " + key);
    const value = toNumberOrNull(raw);

    if (value === null) {
      return { key: key, label: spec.label, value: null, unit: spec.unit, status: "NO_DATA", explanation: "No reading was entered. This signal cannot be assessed." };
    }
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
      return { key: key, label: spec.label, value: null, unit: spec.unit, status: "INVALID", explanation: "The entry is not a valid number in the app's basic input range. Check the value and unit." };
    }
    if (value < spec.lower || value > spec.upper) {
      const direction = value < spec.lower ? "below" : "above";
      return { key: key, label: spec.label, value: value, unit: spec.unit, status: "REVIEW", explanation: "This reading is " + direction + " the illustrative personal reference band (" + spec.lower + "–" + spec.upper + " " + spec.unit + "). Review the reading and follow mission procedures." };
    }
    return { key: key, label: spec.label, value: value, unit: spec.unit, status: "WITHIN", explanation: "This reading is inside the illustrative personal reference band (" + spec.lower + "–" + spec.upper + " " + spec.unit + ")." };
  }

  function assess(readings) {
    const items = Object.keys(SIGNALS).map(function (key) {
      return evaluateSignal(key, readings ? readings[key] : null);
    });
    const available = items.filter(function (item) { return item.status === "WITHIN" || item.status === "REVIEW"; }).length;
    const invalid = items.filter(function (item) { return item.status === "INVALID"; }).length;
    const missing = items.length - available - invalid;
    const review = items.filter(function (item) { return item.status === "REVIEW"; }).length;

    let status = "WITHIN";
    let summary = "All available readings are inside the illustrative personal reference bands. This is not a medical clearance.";
    if (invalid > 0) {
      status = "INVALID";
      summary = invalid + " entry" + (invalid === 1 ? " needs" : "ies need") + " correction before it can be assessed.";
    } else if (missing > 0) {
      status = "LIMITED";
      summary = "Assessment is limited: " + missing + " of " + items.length + " signals have no reading. Missing data is not treated as normal.";
      if (review > 0) summary += " " + review + " available signal" + (review === 1 ? " is" : "s are") + " outside its illustrative band.";
    } else if (review > 0) {
      status = "REVIEW";
      summary = review + " of " + items.length + " readings are outside their illustrative personal reference bands. Confirm the measurement and follow mission medical procedures.";
    }

    return { status: status, summary: summary, available: available, missing: missing, invalid: invalid, review: review, total: items.length, items: items };
  }

  root.AstraHealth = { SIGNALS: SIGNALS, evaluateSignal: evaluateSignal, assess: assess };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AstraHealth;
})(typeof globalThis !== "undefined" ? globalThis : this);