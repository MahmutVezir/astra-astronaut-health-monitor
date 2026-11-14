const test = require("node:test");
const assert = require("node:assert/strict");
const health = require("../health-engine.js");

test("returns NO_DATA for blank values", function () {
  assert.equal(health.evaluateSignal("heartRate", "").status, "NO_DATA");
  assert.equal(health.evaluateSignal("spo2", null).status, "NO_DATA");
});

test("accepts inclusive reference band boundaries", function () {
  assert.equal(health.evaluateSignal("heartRate", 60).status, "WITHIN");
  assert.equal(health.evaluateSignal("heartRate", 85).status, "WITHIN");
});

test("flags values outside the illustrative personal band for review", function () {
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
