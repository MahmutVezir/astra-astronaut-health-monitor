const test = require("node:test");
const assert = require("node:assert/strict");
const health = require("../health-engine.js");

test("returns NO_DATA for blank values", function () {
  assert.equal(health.evaluateSignal("heartRate", "").status, "NO_DATA");
  assert.equal(health.evaluateSignal("spo2", null).status, "NO_DATA");
  assert.equal(health.evaluateSignal("sleep", "   ").status, "NO_DATA");
});

test("accepts inclusive reference band boundaries", function () {
  assert.equal(health.evaluateSignal("heartRate", 60).status, "WITHIN");
  assert.equal(health.evaluateSignal("heartRate", 85).status, "WITHIN");
});

test("flags values outside the illustrative reference band for review", function () {
  assert.equal(health.evaluateSignal("heartRate", 59).status, "REVIEW");
  assert.equal(health.evaluateSignal("spo2", 94.5).status, "REVIEW");
});

test("rejects invalid or out-of-range entries", function () {
  assert.equal(health.evaluateSignal("temperature", "abc").status, "INVALID");
  assert.equal(health.evaluateSignal("sleep", 25).status, "INVALID");
});

test("does not treat missing signals as normal", function () {
  const result = health.assess({ heartRate: 72, spo2: null, temperature: 36.7, sleep: null });
  assert.equal(result.status, "LIMITED");
  assert.equal(result.available, 2);
  assert.equal(result.missing, 2);
});

test("review state takes precedence when all readings exist", function () {
  const result = health.assess({ heartRate: 101, spo2: 94.5, temperature: 37.5, sleep: 4.3 });
  assert.equal(result.status, "REVIEW");
  assert.equal(result.review, 4);
});

test("nominal demo scenario stays within demo bands", function () {
  const result = health.assess({ heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 });
  assert.equal(result.status, "WITHIN");
  assert.equal(result.available, 4);
});

test("supports a user-configured reference band", function () {
  const bands = { heartRate: { lower: 70, upper: 90 } };
  assert.equal(health.evaluateSignal("heartRate", 68, bands).status, "REVIEW");
  assert.equal(health.evaluateSignal("heartRate", 75, bands).status, "WITHIN");
});

test("rejects an invalid configured reference band", function () {
  const bands = { heartRate: { lower: 100, upper: 80 } };
  assert.equal(health.evaluateSignal("heartRate", 75, bands).status, "INVALID");
});

test("rejects blank and null configured bounds instead of coercing them to zero", function () {
  assert.equal(health.evaluateSignal("sleep", 7, { sleep: { lower: "", upper: 9 } }).status, "INVALID");
  assert.equal(health.evaluateSignal("sleep", 7, { sleep: { lower: null, upper: 9 } }).status, "INVALID");
  assert.equal(health.evaluateSignal("sleep", 7, { sleep: null }).status, "INVALID");
});

test("rejects non-numeric configured bounds", function () {
  assert.equal(health.evaluateSignal("sleep", 7, { sleep: { lower: true, upper: 9 } }).status, "INVALID");
});

test("assessment reports invalid reference settings instead of silently using defaults", function () {
  const result = health.assess(
    { heartRate: 72, spo2: 98, temperature: 36.7, sleep: 7 },
    { sleep: { lower: "", upper: 9 } }
  );
  assert.equal(result.status, "INVALID");
  assert.equal(result.invalid, 1);
});


test("compares each current signal with a captured personal baseline using explicit demo tolerances", function () {
  const baseline = { heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 };
  const shifted = { heartRate: 101, spo2: 94.5, temperature: 37.5, sleep: 4.3 };
  const result = health.assessBaseline(shifted, baseline);

  assert.equal(result.status, "SHIFT");
  assert.equal(result.shifts.length, 4);
  assert.equal(result.items.find((item) => item.key === "heartRate").delta, 29);
  assert.equal(result.items.find((item) => item.key === "spo2").status, "SHIFT");
});

test("a matching reading is stable against the captured baseline", function () {
  const baseline = { heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 };
  const result = health.assessBaseline(baseline, baseline);
  assert.equal(result.status, "STABLE");
  assert.equal(result.shifts.length, 0);
  assert.ok(result.items.every((item) => item.status === "STABLE"));
});

test("baseline comparison preserves missing readings instead of imputing them", function () {
  const baseline = { heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 };
  const result = health.assessBaseline({ heartRate: 82, spo2: null, temperature: 36.8, sleep: null }, baseline);
  assert.equal(result.status, "LIMITED");
  assert.equal(result.missing, 2);
  assert.equal(result.items.find((item) => item.key === "spo2").status, "NO_DATA");
});

test("baseline comparison abstains when no personal baseline has been captured", function () {
  const result = health.assessBaseline({ heartRate: 72, spo2: 98, temperature: 36.7, sleep: 7 }, null);
  assert.equal(result.status, "NO_BASELINE");
  assert.ok(result.items.every((item) => item.status === "NO_BASELINE"));
});

test("wellbeing self-report flags low sleep quality, high stress, high fatigue and low mood", function () {
  const result = health.assessWellbeing({ sleepQuality: 2, stress: 4, fatigue: 5, mood: 1 }, true);
  assert.equal(result.status, "REVIEW");
  assert.deepEqual(result.flags.map((flag) => flag.key), ["sleepQuality", "stress", "fatigue", "mood"]);
});

test("wellbeing is not evaluated until a check-in has actually been saved", function () {
  const result = health.assessWellbeing({ sleepQuality: 1, stress: 5, fatigue: 5, mood: 1 }, false);
  assert.equal(result.status, "NO_CHECK_IN");
  assert.equal(result.flags.length, 0);
});

test("invalid wellbeing values are rejected instead of being interpreted", function () {
  const result = health.assessWellbeing({ sleepQuality: 0, stress: 6, fatigue: 2, mood: 3 }, true);
  assert.equal(result.status, "INVALID");
});

test("combined context reports co-occurring flags without claiming causation", function () {
  const baseline = health.assessBaseline(
    { heartRate: 101, spo2: 94.5, temperature: 37.5, sleep: 4.3 },
    { heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 }
  );
  const wellbeing = health.assessWellbeing({ sleepQuality: 2, stress: 4, fatigue: 5, mood: 3 }, true);
  const result = health.assess(
    { heartRate: 101, spo2: 94.5, temperature: 37.5, sleep: 4.3 },
    undefined,
    {
      baseline: { heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 },
      wellbeing: { sleepQuality: 2, stress: 4, fatigue: 5, mood: 3 },
      wellbeingRecorded: true
    }
  );
  assert.equal(baseline.status, "SHIFT");
  assert.equal(wellbeing.status, "REVIEW");
  assert.equal(result.context.status, "CONCURRENT_FLAGS");
  assert.match(result.context.summary, /does not establish correlation, cause/);
});
