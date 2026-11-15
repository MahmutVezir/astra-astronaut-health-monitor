const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../data/models/mission-anomaly-mlp-v2.json");

globalThis.AstraMissionModel = model;
const mission = require("../mission-engine.js");

test("local MLP artifact has the documented feature and weight dimensions", function () {
  assert.equal(model.modelId, "ASTRA-SYNTH-MLP-2");
  assert.equal(model.version, 2);
  assert.equal(model.featureNames.length, 9);
  assert.deepEqual(model.weights.map((layer) => [layer.length, layer[0].length]), [
    [9, 24],
    [24, 12],
    [12, 1]
  ]);
  assert.deepEqual(model.biases.map((layer) => layer.length), [24, 12, 1]);
  assert.equal(model.threshold, 0.5);
  assert.equal(model.training.syntheticOnly, true);
  assert.equal(model.training.noNASAOrClinicalTrainingData, true);
  assert.equal(model.training.nominalTrainingWindows, 16000);
  assert.equal(model.training.deviationTrainingWindows, 16000);
  assert.equal(model.training.syntheticDeviationFamilies.length, 4);
  assert.match(model.training.missingnessHandling, /Sensor dropout is handled by abstention/);
  assert.deepEqual(Object.keys(model.validation.perSyntheticPatternRecall), ["0", "1", "2", "3"]);
  const digest = require("node:crypto").createHash("sha256")
    .update(require("node:fs").readFileSync(require("node:path").join(__dirname, "../data/models/mission-anomaly-mlp-v2.json")))
    .digest("hex");
  assert.equal(digest, "b82f960295409386fe12de542b72f778341dc0a7f28961a276e7c5ee4d057ea0");
});

test("offline browser bundle exposes the exact MLP v2 JSON artifact", function () {
  const browserWindow = {};
  const source = fs.readFileSync(path.join(__dirname, "../data/models/mission-anomaly-mlp-v2.js"), "utf8");
  vm.runInNewContext(source, { window: browserWindow });
  assert.deepEqual(JSON.parse(JSON.stringify(browserWindow.AstraMissionModel)), model);
  assert.equal(browserWindow.AstraMissionModel.modelId, "ASTRA-SYNTH-MLP-2");
  assert.equal(browserWindow.AstraMissionModel.version, 2);
});

test("daily heart-rate spread is not described as beat-to-beat HRV", function () {
  assert.equal(mission.FEATURE_LABELS.heart_rate_std_bpm, "Day-to-day heart-rate spread");
});

test("mission replay is deterministic for a fixed scenario and seed", function () {
  const first = mission.createMissionReplay("multi-signal", { seed: 20261115, days: 30 });
  const second = mission.createMissionReplay("multi-signal", { seed: 20261115, days: 30 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 30);
  assert.equal(first[0].source, "SIMULATED");
  assert.equal(first[29].scenario, "multi-signal");
});

test("nominal synthetic feature fixture produces a nominal-like model output", function () {
  const features = [0, 4.4, 0.15, 1.05, 0, 0, 0, 0, 0.03];
  const result = mission.predict(features, model);
  assert.equal(result.status, "NOMINAL_LIKE");
  assert.ok(result.score >= 0 && result.score < 0.5);
  assert.equal(result.drivers.length, 3);
});

test("synthetic multichannel departure fixture is flagged by the trained MLP", function () {
  const features = [16, 8, 2, 5, 0.75, -2.5, 2, 1.5, 0.03];
  const result = mission.predict(features, model);
  assert.equal(result.status, "PATTERN_DEVIATION");
  assert.ok(result.score >= 0.5 && result.score <= 1);
  assert.match(result.explanation, /synthetic training set/);
  assert.doesNotMatch(result.explanation, /diagnos|medical risk/i);
});

test("seven complete nominal replay records pass the rolling-window gate", function () {
  const records = mission.createMissionReplay("nominal", { seed: 20261115, days: 30 }).slice(-7);
  const result = mission.buildFeatureVector(records);
  assert.equal(result.status, "READY");
  assert.equal(result.missingCount, 0);
  assert.equal(result.featureVector.length, 9);
});

test("one to six days of history abstain instead of silently expanding to seven", function () {
  for (let days = 1; days < 7; days += 1) {
    const records = mission.createMissionReplay("nominal", { seed: 20261115, days });
    assert.equal(records.length, days);
    const result = mission.analyzeWindow(records, model);
    assert.equal(result.status, "INSUFFICIENT_HISTORY");
    assert.equal(result.prediction, undefined);
  }
});

test("insufficient telemetry coverage causes model abstention and preserves missing cells", function () {
  const records = mission.createMissionReplay("nominal", { seed: 20261115, days: 7 });
  records.forEach(function (record) {
    record.readings.heartRate = null;
    record.readings.spo2 = null;
    record.wellbeing.fatigue = null;
    record.wellbeing.stress = null;
  });
  const result = mission.analyzeWindow(records, model);
  assert.equal(result.status, "LIMITED_DATA");
  assert.equal(result.prediction, undefined);
  assert.match(result.reason, /fewer than five of seven/i);
  assert.ok(records.every((record) => record.readings.heartRate === null));
});

test("missing wellbeing values are ignored rather than coerced to zero", function () {
  const records = mission.createMissionReplay("nominal", { seed: 20261115, days: 7 });
  records[0].wellbeing.fatigue = null;
  records[1].wellbeing.stress = null;
  const result = mission.buildFeatureVector(records);
  const expectedFatigue = records.slice(1).reduce((sum, record) => sum + record.wellbeing.fatigue, 0) / 6 - 2;
  const expectedStress = records.filter((record, index) => index !== 1)
    .reduce((sum, record) => sum + record.wellbeing.stress, 0) / 6 - 2;
  assert.equal(result.status, "READY");
  assert.equal(result.selfReportMissingCount, 2);
  assert.ok(Math.abs(result.values.fatigue_mean_delta_1_to_5 - expectedFatigue) < 1e-10);
  assert.ok(Math.abs(result.values.stress_mean_delta_1_to_5 - expectedStress) < 1e-10);
});

test("sensor dropout is handled by the deterministic quality gate rather than an MLP class", function () {
  const records = mission.createMissionReplay("sensor-dropout", { seed: 20261115, days: 30 });
  const activeWindow = records.slice(-7);
  const missingCount = activeWindow.reduce(function (sum, record) {
    return sum + mission.SIGNAL_KEYS.filter((key) => record.readings[key] === null).length;
  }, 0);
  assert.ok(missingCount > 7);
  assert.ok(activeWindow.some((record) => Object.values(record.readings).some((value) => value === null)));
  const result = mission.analyzeWindow(activeWindow, model);
  assert.equal(result.status, "LIMITED_DATA");
  assert.equal(result.prediction, undefined);
  assert.ok(result.missingCount > 7);
});

test("model rejects malformed feature vectors", function () {
  assert.throws(() => mission.predict([1, 2], model), /complete finite feature vector/i);
  assert.throws(() => mission.predict(new Array(9).fill(NaN), model), /complete finite feature vector/i);
});


test("sensor-dropout scenario is discoverable and explains how to verify abstention", function () {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const replayUi = fs.readFileSync(path.join(__dirname, "../mission-replay-ui.js"), "utf8");
  assert.match(html, /value="sensor-dropout">DATA LOSS TEST — Sensor dropout \(model abstains\)/);
  assert.match(html, /replay-scenario-help/);
  assert.match(html, /advance to day 30/i);
  assert.match(replayUi, /Sensor dropout begins on mission day 10/);
  assert.match(replayUi, /MODEL ABSTAINED/);
});
