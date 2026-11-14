(function () {
  "use strict";

  const STORAGE_KEY = "astra.demo.v1";
  const DEFAULT_WELLBEING = { sleepQuality: 4, stress: 2, fatigue: 2, mood: 4 };
  const SCENARIOS = {
    nominal: { heartRate: 72, spo2: 98.1, temperature: 36.7, sleep: 7.6 },
    shift: { heartRate: 101, spo2: 94.5, temperature: 37.5, sleep: 4.3 },
    incomplete: { heartRate: 82, spo2: null, temperature: 36.8, sleep: null }
  };
  const DEFAULT_BANDS = window.AstraHealth.DEFAULT_BANDS;
  const LABELS = { sleepQuality: "Sleep quality", stress: "Perceived stress", fatigue: "Fatigue", mood: "Mood" };
  let state = {
    readings: Object.assign({}, SCENARIOS.nominal),
    bands: Object.keys(DEFAULT_BANDS).reduce(function (out, key) { out[key] = Object.assign({}, DEFAULT_BANDS[key]); return out; }, {}),
    wellbeing: Object.assign({}, DEFAULT_WELLBEING),
    log: [],
    updatedAt: null,
    scenario: "nominal"
  };

  const $ = function (id) { return document.getElementById(id); };
  const esc = function (value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  };
  const formatValue = function (key, value) {
    if (value === null || value === undefined || value === "") return "—";
    const spec = window.AstraHealth.SIGNALS[key];
    return Number(value).toFixed(spec.digits) + " " + spec.unit;
  };
  const statusText = function (status) {
    return ({ WITHIN: "Within configured band", REVIEW: "Review", NO_DATA: "No data", INVALID: "Invalid", LIMITED: "Assessment limited" })[status] || status;
  };
  const statusClass = function (status) {
    return ({ WITHIN: "good", REVIEW: "review", NO_DATA: "missing", INVALID: "invalid", LIMITED: "limited" })[status] || "neutral";
  };
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $("storage-status").textContent = "Stored on this device only";
    } catch (error) {
      $("storage-status").textContent = "Local storage unavailable";
    }
  }

  function mergeBands(source) {
    return Object.keys(DEFAULT_BANDS).reduce(function (out, key) {
      out[key] = Object.assign({}, DEFAULT_BANDS[key], source && source[key] ? source[key] : {});
      return out;
    }, {});
  }

  function bandFieldId(key, edge) {
    const slug = key === "heartRate" ? "heart-rate" : key;
    return "band-" + slug + "-" + edge;
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && parsed.readings && parsed.wellbeing && Array.isArray(parsed.log)) {
        state = {
          readings: Object.assign({}, SCENARIOS.nominal, parsed.readings),
          bands: mergeBands(parsed.bands),
          wellbeing: Object.assign({}, DEFAULT_WELLBEING, parsed.wellbeing),
          log: parsed.log.slice(0, 100),
          updatedAt: parsed.updatedAt || null,
          scenario: SCENARIOS[parsed.scenario] ? parsed.scenario : "nominal"
        };
      }
    } catch (error) {
      state = {
        readings: Object.assign({}, SCENARIOS.nominal),
        bands: mergeBands(null),
        wellbeing: Object.assign({}, DEFAULT_WELLBEING),
        log: [],
        updatedAt: null,
        scenario: "nominal"
      };
    }
  }

  function renderCards(assessment) {
    const html = assessment.items.map(function (item) {
      const icon = ({ heartRate: "♡", spo2: "◉", temperature: "⌁", sleep: "☾" })[item.key];
      return '<article class="signal-card"><div class="card-top"><span class="signal-icon">' + icon + '</span><span class="state-label state-' + statusClass(item.status) + '">' + statusText(item.status) + '</span></div><p class="signal-name">' + esc(item.label) + '</p><strong class="signal-value">' + esc(formatValue(item.key, item.value)) + '</strong><p class="signal-reference">Demo band: ' + esc(state.bands[item.key].lower + "–" + state.bands[item.key].upper + " " + window.AstraHealth.SIGNALS[item.key].unit) + '</p></article>';
    }).join("");
    $("signal-cards").innerHTML = html;
  }

  function renderAssessment(assessment) {
    const badge = $("overall-status");
    badge.textContent = assessment.status === "WITHIN" ? "WITHIN CONFIGURED BAND" : assessment.status === "REVIEW" ? "REVIEW READINGS" : assessment.status === "LIMITED" ? "DATA INCOMPLETE" : "CHECK INPUTS";
    badge.className = "status-badge status-" + statusClass(assessment.status);
    $("assessment-summary").textContent = assessment.summary;
    $("assessment-list").innerHTML = assessment.items.map(function (item) {
      return '<div class="assessment-row"><span class="assessment-dot dot-' + statusClass(item.status) + '"></span><div><strong>' + esc(item.label) + '</strong><small>' + esc(item.explanation) + '</small></div><span class="assessment-state">' + esc(statusText(item.status)) + '</span></div>';
    }).join("");
    $("data-completeness").textContent = assessment.available + " of " + assessment.total + " signals available";
  }

  function renderTrend() {
    const values = state.log.filter(function (entry) { return entry.heartRate !== null && Number.isFinite(Number(entry.heartRate)); }).slice(0, 8).reverse().map(function (entry) { return Number(entry.heartRate); });
    if (values.length === 0) values.push(Number(state.readings.heartRate) || 72);
    if (values.length === 1) values.unshift(values[0]);
    const min = Math.min.apply(null, values.concat([50]));
    const max = Math.max.apply(null, values.concat([110]));
    const range = Math.max(10, max - min);
    const points = values.map(function (value, index) {
      const x = 34 + (index * (492 / Math.max(1, values.length - 1)));
      const y = 150 - ((value - (min - 5)) / (range + 10)) * 118;
      return { x: x, y: y };
    });
    $("trend-line").setAttribute("points", points.map(function (point) { return point.x.toFixed(1) + "," + point.y.toFixed(1); }).join(" "));
    $("trend-points").innerHTML = points.map(function (point) {
      return '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4" class="chart-point"></circle>';
    }).join("");
  }

  function renderResearchTimeline() {
    const target = $("osd-timeline");
    if (!target || !window.AstraResearch || !window.AstraResearch.inspiration4) return;
    const study = window.AstraResearch.inspiration4;
    target.innerHTML = '<p class="timeline-heading">NASA-reported sample collection points</p><div class="timeline-track">' + study.timepoints.map(function (point) {
      return '<div class="timeline-point"><span class="timeline-code">' + esc(point.label) + '</span><span class="timeline-phase">' + esc(point.phase) + '</span></div>';
    }).join("") + '</div><p class="timeline-note">Relative to launch (L) or return (R). These are research sample timepoints, not continuous vital-sign measurements.</p>';
  }

  function renderLog() {
    const list = $("log-list");
    $("empty-log").hidden = state.log.length > 0;
    list.innerHTML = state.log.map(function (entry) {
      return '<div class="log-entry"><span class="log-marker"></span><div><strong>' + esc(entry.type) + '</strong><p>' + esc(entry.message) + '</p><small>' + esc(new Date(entry.time).toLocaleString()) + '</small></div></div>';
    }).join("");
  }

  function renderInputs() {
    $("heart-rate").value = state.readings.heartRate === null ? "" : state.readings.heartRate;
    $("spo2").value = state.readings.spo2 === null ? "" : state.readings.spo2;
    $("temperature").value = state.readings.temperature === null ? "" : state.readings.temperature;
    $("sleep").value = state.readings.sleep === null ? "" : state.readings.sleep;
    Object.keys(window.AstraHealth.SIGNALS).forEach(function (key) {
      $(bandFieldId(key, "lower")).value = state.bands[key].lower;
      $(bandFieldId(key, "upper")).value = state.bands[key].upper;
    });
    Object.keys(LABELS).forEach(function (key) {
      const input = $(key.replace(/[A-Z]/g, function (letter) { return "-" + letter.toLowerCase(); }));
      if (input) {
        input.value = state.wellbeing[key];
        $(input.id + "-value").textContent = state.wellbeing[key] + " / 5";
      }
    });
  }

  function renderAll() {
    const assessment = window.AstraHealth.assess(state.readings, state.bands);
    renderCards(assessment);
    renderAssessment(assessment);
    renderTrend();
    renderLog();
    renderInputs();
    renderResearchTimeline();
    $("last-updated").textContent = state.updatedAt ? "Updated " + new Date(state.updatedAt).toLocaleString() : "Demo readings loaded";
  }

  function activateView(name) {
    document.querySelectorAll(".tab").forEach(function (button) {
      const active = button.dataset.view === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    document.querySelectorAll(".view").forEach(function (view) {
      const active = view.id === "view-" + name;
      view.classList.toggle("active", active);
      view.hidden = !active;
    });
  }

  function applyScenario(name) {
    if (!SCENARIOS[name]) return;
    state.scenario = name;
    state.readings = Object.assign({}, SCENARIOS[name]);
    state.updatedAt = new Date().toISOString();
    addLog("DEMO SCENARIO", "Loaded " + name + " scenario. All readings are simulated.");
    saveState();
    renderAll();
    $("signals-message").textContent = "Scenario loaded. These are simulated demo readings.";
    $("demo-scenario").value = name;
  }

  function saveReadings(event) {
    event.preventDefault();
    const raw = {
      heartRate: $("heart-rate").value,
      spo2: $("spo2").value,
      temperature: $("temperature").value,
      sleep: $("sleep").value
    };
    const invalid = Object.keys(raw).filter(function (key) {
      const result = window.AstraHealth.evaluateSignal(key, raw[key]);
      return result.status === "INVALID";
    });
    if (invalid.length) {
      $("signals-message").textContent = "Check the entered value or unit for: " + invalid.map(function (key) { return window.AstraHealth.SIGNALS[key].label; }).join(", ") + ".";
      return;
    }
    state.readings = {
      heartRate: raw.heartRate === "" ? null : Number(raw.heartRate),
      spo2: raw.spo2 === "" ? null : Number(raw.spo2),
      temperature: raw.temperature === "" ? null : Number(raw.temperature),
      sleep: raw.sleep === "" ? null : Number(raw.sleep)
    };
    state.scenario = "manual";
    state.updatedAt = new Date().toISOString();
    const assessment = window.AstraHealth.assess(state.readings, state.bands);
    addLog("READINGS SAVED", assessment.available + " of " + assessment.total + " signals available; " + assessment.review + " outside illustrative bands.");
    saveState();
    renderAll();
    $("signals-message").textContent = "Readings saved locally. " + assessment.summary;
  }

  function saveBands(event) {
    event.preventDefault();
    const candidate = {};
    const errors = [];
    Object.keys(window.AstraHealth.SIGNALS).forEach(function (key) {
      const spec = window.AstraHealth.SIGNALS[key];
      const lowerRaw = $(bandFieldId(key, "lower")).value;
      const upperRaw = $(bandFieldId(key, "upper")).value;
      const lower = Number(lowerRaw);
      const upper = Number(upperRaw);
      if (lowerRaw === "" || upperRaw === "" || !Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper || lower < spec.min || upper > spec.max) {
        errors.push(spec.label);
      } else {
        candidate[key] = { lower: lower, upper: upper };
      }
    });
    if (errors.length) {
      $("baseline-message").textContent = "Check lower/upper order and allowed input ranges for: " + errors.join(", ") + ".";
      return;
    }
    state.bands = candidate;
    state.updatedAt = new Date().toISOString();
    addLog("REFERENCE BANDS UPDATED", "The local demo comparison ranges were changed. This is not a medical validation.");
    saveState();
    renderAll();
    $("baseline-message").textContent = "Reference bands saved locally. The dashboard now compares readings with these configured values.";
  }

  function saveWellbeing(event) {
    event.preventDefault();
    Object.keys(LABELS).forEach(function (key) {
      const inputId = key.replace(/[A-Z]/g, function (letter) { return "-" + letter.toLowerCase(); });
      state.wellbeing[key] = Number($(inputId).value);
    });
    state.updatedAt = new Date().toISOString();
    addLog("WELLBEING CHECK-IN", "Self-report saved: " + Object.keys(LABELS).map(function (key) { return LABELS[key] + " " + state.wellbeing[key] + "/5"; }).join(", ") + ".");
    saveState();
    renderAll();
    $("wellbeing-message").textContent = "Check-in saved on this device.";
  }

  function exportCsv() {
    const rows = [["recorded_at", "record_type", "heart_rate_bpm", "spo2_percent", "temperature_c", "sleep_hours", "note"]];
    state.log.forEach(function (entry) {
      rows.push([entry.time, entry.type, entry.heartRate ?? "", entry.spo2 ?? "", entry.temperature ?? "", entry.sleep ?? "", entry.message]);
    });
    if (state.log.length === 0) {
      rows.push([new Date().toISOString(), "CURRENT DEMO STATE", state.readings.heartRate ?? "", state.readings.spo2 ?? "", state.readings.temperature ?? "", state.readings.sleep ?? "", "Simulated or manually entered; not a medical record"]);
    }
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        const text = String(cell === null || cell === undefined ? "" : cell);
        return '"' + text.replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "astra-local-demo-log.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function addLog(type, message) {
    state.log.unshift({ time: new Date().toISOString(), type: type, message: message, heartRate: state.readings.heartRate, spo2: state.readings.spo2, temperature: state.readings.temperature, sleep: state.readings.sleep });
    state.log = state.log.slice(0, 100);
  }

  document.querySelectorAll(".tab").forEach(function (button) {
    button.addEventListener("click", function () { activateView(button.dataset.view); });
  });
  $("load-scenario").addEventListener("click", function () { applyScenario($("demo-scenario").value); });
  $("reset-demo").addEventListener("click", function () {
    state.readings = Object.assign({}, SCENARIOS.nominal);
    state.wellbeing = Object.assign({}, DEFAULT_WELLBEING);
    state.scenario = "nominal";
    state.updatedAt = new Date().toISOString();
    addLog("DEMO RESET", "Returned to the nominal simulated scenario.");
    saveState();
    renderAll();
    $("demo-scenario").value = "nominal";
    $("signals-message").textContent = "Demo reset to nominal simulated values.";
  });
  $("signals-form").addEventListener("submit", saveReadings);
  $("baseline-form").addEventListener("submit", saveBands);
  $("wellbeing-form").addEventListener("submit", saveWellbeing);
  $("export-csv").addEventListener("click", exportCsv);
  $("clear-log").addEventListener("click", function () {
    state.log = [];
    saveState();
    renderAll();
  });
  ["sleep-quality", "stress", "fatigue", "mood"].forEach(function (id) {
    $(id).addEventListener("input", function () { $(id + "-value").textContent = this.value + " / 5"; });
  });

  loadState();
  renderAll();
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        $("storage-status").textContent = "Offline cache not available";
      });
    });
  }
})();