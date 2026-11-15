(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };
  const engine = window.AstraMissionEngine;
  const model = window.AstraMissionModel;
  if (!engine || !model || !$("replay-scenario")) return;

  const SCENARIO_NAMES = {
    nominal: "Nominal mission routine",
    "cardiovascular-shift": "Sustained heart-rate departure",
    "oxygen-deviation": "Oxygen-signal departure",
    "sleep-fatigue": "Sleep and fatigue co-occurrence",
    "temperature-drift": "Temperature drift pattern",
    "multi-signal": "Multi-signal deviation",
    "sensor-dropout": "DATA LOSS TEST — Sensor dropout (model abstains)"
  };
  const SIGNALS = [
    { key: "heartRate", label: "Heart rate", unit: "BPM", digits: 1, baseline: 72 },
    { key: "spo2", label: "SpO₂", unit: "%", digits: 1, baseline: 98 },
    { key: "temperature", label: "Body temperature", unit: "°C", digits: 2, baseline: 36.7 },
    { key: "sleep", label: "Sleep duration", unit: "h", digits: 1, baseline: 7.5 }
  ];

  let records = [];
  let cursor = 0;
  let timer = null;
  let playing = false;

  function format(value, digits) {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? "—"
      : Number(value).toFixed(digits);
  }

  function statusClass(status) {
    return status === "PATTERN_DEVIATION" ? "state-review"
      : status === "NOMINAL_LIKE" ? "state-good"
        : "state-limited";
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    playing = false;
  }

  function setMessage(message) {
    const target = $("replay-message");
    if (target) target.textContent = message;
  }

  function setCursor(nextCursor) {
    cursor = Math.max(0, Math.min(records.length - 1, nextCursor));
    render();
    if (cursor >= records.length - 1 && playing) {
      stopTimer();
      setMessage("Replay complete. Restart or select another reproducible scenario.");
    }
  }

  function startTimer() {
    if (playing || cursor >= records.length - 1) {
      if (cursor >= records.length - 1) setMessage("Replay is complete. Select Restart to play it again.");
      return;
    }
    playing = true;
    const speed = Number($("replay-speed").value) || 1000;
    $("replay-play").textContent = "Pause replay";
    setMessage("Playing " + SCENARIO_NAMES[$("replay-scenario").value] + ". All values are generated synthetic telemetry.");
    timer = window.setInterval(function () {
      setCursor(cursor + 1);
    }, speed);
  }

  function renderCards(record) {
    const target = $("replay-signal-cards");
    target.innerHTML = SIGNALS.map(function (signal) {
      const value = record.readings[signal.key];
      const missing = value === null || value === undefined;
      return '<article class="signal-card"><div class="card-top"><span class="signal-icon">' +
        ({ heartRate: "♡", spo2: "◉", temperature: "⌁", sleep: "☾" })[signal.key] +
        '</span><span class="state-label ' + (missing ? "state-missing" : "state-good") + '">' +
        (missing ? "NO DATA" : "SIMULATED") + '</span></div><p class="signal-name">' +
        signal.label + '</p><strong class="signal-value">' + format(value, signal.digits) + " " + signal.unit +
        '</strong><p class="signal-reference">Illustrative profile reference: ' + signal.baseline + " " +
        signal.unit + '</p></article>';
    }).join("");
  }

  function renderChart(signal, visible) {
    const svg = $("replay-chart-" + signal.key);
    if (!svg) return;
    const series = visible.slice(-14).map(function (record) {
      return { day: record.day, value: record.readings[signal.key] };
    });
    const valid = series.filter(function (point) { return Number.isFinite(point.value); });
    if (!valid.length) {
      svg.innerHTML = '<text x="260" y="88" text-anchor="middle" class="chart-placeholder">No available readings in this window</text>';
      return;
    }

    const minValue = Math.min.apply(null, valid.map(function (point) { return point.value; }).concat([signal.baseline]));
    const maxValue = Math.max.apply(null, valid.map(function (point) { return point.value; }).concat([signal.baseline]));
    const padding = Math.max((maxValue - minValue) * 0.18, signal.key === "temperature" ? 0.12 : 1);
    const min = minValue - padding;
    const max = maxValue + padding;
    const left = 42, right = 18, top = 18, bottom = 30, width = 520, height = 170;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = function (index) { return left + index * plotWidth / Math.max(1, series.length - 1); };
    const y = function (value) { return top + (max - value) * plotHeight / (max - min); };
    let path = "";
    let activeSegment = false;
    series.forEach(function (point, index) {
      if (!Number.isFinite(point.value)) {
        activeSegment = false;
        return;
      }
      path += (activeSegment ? " L " : " M ") + x(index).toFixed(1) + " " + y(point.value).toFixed(1);
      activeSegment = true;
    });
    const baselineY = y(signal.baseline);
    const circles = series.map(function (point, index) {
      if (!Number.isFinite(point.value)) return "";
      return '<circle cx="' + x(index).toFixed(1) + '" cy="' + y(point.value).toFixed(1) +
        '" r="3.5" class="replay-chart-point"><title>Mission day ' + point.day +
        ': ' + format(point.value, signal.digits) + " " + signal.unit + '</title></circle>';
    }).join("");
    const firstDay = series[0].day;
    const lastDay = series[series.length - 1].day;
    svg.innerHTML =
      '<line x1="' + left + '" y1="' + (height - bottom) + '" x2="' + (width - right) + '" y2="' + (height - bottom) + '" class="chart-axis"></line>' +
      '<line x1="' + left + '" y1="' + baselineY.toFixed(1) + '" x2="' + (width - right) + '" y2="' + baselineY.toFixed(1) + '" class="replay-baseline-line"></line>' +
      '<path d="' + path + '" class="replay-series-line"></path>' + circles +
      '<text x="' + left + '" y="12" class="chart-label">' + max.toFixed(signal.digits) + '</text>' +
      '<text x="' + left + '" y="' + (height - 8) + '" class="chart-label">Day ' + firstDay + '</text>' +
      '<text x="' + (width - right) + '" y="' + (height - 8) + '" text-anchor="end" class="chart-label">Day ' + lastDay + '</text>' +
      '<text x="' + (width - right - 2) + '" y="' + Math.max(11, baselineY - 5).toFixed(1) + '" text-anchor="end" class="replay-baseline-label">Reference ' + signal.baseline + '</text>';
  }

  function renderModel(visible) {
    const result = engine.analyzeWindow(visible, model);
    const status = $("replay-model-status");
    const score = $("replay-model-score");
    const summary = $("replay-model-summary");
    const drivers = $("replay-model-drivers");

    if (result.status === "INSUFFICIENT_HISTORY") {
      status.textContent = "WAITING FOR HISTORY";
      status.className = "state-label state-limited";
      score.textContent = "—";
      summary.textContent = result.reason;
      drivers.innerHTML = "";
      return result;
    }

    if (result.status === "LIMITED_DATA") {
      status.textContent = "MODEL ABSTAINED";
      status.className = "state-label state-limited";
      score.textContent = "—";
      summary.textContent = result.reason;
      drivers.innerHTML = '<p class="insight-empty">No physiological pattern classification was produced for this incomplete window.</p>';
      return result;
    }

    const prediction = result.prediction;
    status.textContent = prediction.status === "PATTERN_DEVIATION" ? "SYNTHETIC PATTERN FLAG" : "NO MODEL FLAG";
    status.className = "state-label " + statusClass(prediction.status);
    score.textContent = prediction.score.toFixed(3);
    summary.textContent = prediction.explanation;
    drivers.innerHTML = '<p class="mini-label">LARGEST STANDARDIZED FEATURE DEPARTURES · NOT CAUSAL EXPLANATIONS</p>' +
      prediction.drivers.map(function (driver) {
        const sign = driver.standardizedDeparture > 0 ? "+" : "";
        return '<div class="assessment-row"><span class="assessment-dot ' +
          (driver.magnitude >= 1.5 ? "dot-review" : "dot-limited") +
          '"></span><div><strong>' + driver.label + '</strong><small>' +
          sign + driver.standardizedDeparture.toFixed(2) +
          ' standard deviations from the synthetic training centre</small></div><span class="assessment-state">' +
          driver.magnitude.toFixed(2) + 'σ</span></div>';
      }).join("");
    return result;
  }

  function renderDataQuality(result) {
    const status = $("replay-data-status");
    const percent = $("replay-data-percent");
    const summary = $("replay-data-summary");
    const details = $("replay-data-details");
    if (result.status === "INSUFFICIENT_HISTORY") {
      status.textContent = "WAITING";
      status.className = "state-label state-limited";
      percent.textContent = "—";
      summary.textContent = result.reason;
      details.innerHTML = "";
      return;
    }

    const completePercent = (1 - result.missingFraction) * 100;
    percent.textContent = completePercent.toFixed(1) + "%";
    const limited = result.status === "LIMITED_DATA";
    status.textContent = limited ? "DATA REVIEW" : "WINDOW READY";
    status.className = "state-label " + (limited ? "state-review" : "state-good");
    summary.textContent = limited
      ? result.reason
      : "All four vital-sign channels have at least five of seven daily readings; the rolling window meets the model's completeness gate.";
    details.innerHTML =
      '<div class="assessment-row"><span class="assessment-dot ' + (result.missingCount ? "dot-review" : "dot-good") +
      '"></span><div><strong>' + result.missingCount + ' missing vital-sign cells</strong><small>Of 28 possible values in the rolling seven-day window</small></div><span class="assessment-state">' +
      (result.missingCount ? "Gaps retained" : "Complete") + '</span></div>';
  }

  function renderTable(visible) {
    const target = $("replay-record-table");
    const recent = visible.slice(-7);
    if (!recent.length) {
      target.innerHTML = '<p class="empty-state">No replay records yet.</p>';
      return;
    }
    target.innerHTML = '<table class="research-evidence-table"><thead><tr><th>Mission day</th><th>Heart rate</th><th>SpO₂</th><th>Temperature</th><th>Sleep</th><th>Data source</th></tr></thead><tbody>' +
      recent.map(function (record) {
        return '<tr><th scope="row">' + String(record.day).padStart(2, "0") + '</th>' +
          '<td>' + format(record.readings.heartRate, 1) + '</td>' +
          '<td>' + format(record.readings.spo2, 1) + '</td>' +
          '<td>' + format(record.readings.temperature, 2) + '</td>' +
          '<td>' + format(record.readings.sleep, 1) + '</td>' +
          '<td>SIMULATED</td></tr>';
      }).join("") + '</tbody></table>';
  }

  function render() {
    if (!records.length) return;
    const visible = records.slice(0, cursor + 1);
    const current = visible[visible.length - 1];
    const dayLabel = $("replay-day-label");
    const percent = Math.round((cursor + 1) / records.length * 100);
    dayLabel.textContent = "Mission day " + String(current.day).padStart(2, "0") + " / " + records.length;
    $("replay-progress-percent").textContent = percent + "%";
    $("replay-progress-fill").style.width = percent + "%";
    $("replay-progress-bar").setAttribute("aria-valuenow", current.day);

    renderCards(current);
    SIGNALS.forEach(function (signal) { renderChart(signal, visible); });
    const modelResult = renderModel(visible);
    renderDataQuality(modelResult);
    renderTable(visible);
    $("replay-source-state").textContent = "SIMULATED · SEED 20261115";
  }

  function resetReplay() {
    stopTimer();
    records = engine.createMissionReplay($("replay-scenario").value, { seed: 20261115, days: 30 });
    cursor = 0;
    $("replay-play").textContent = "Play replay";
    $("replay-progress-fill").style.width = "3%";
    setMessage($("replay-scenario").value === "sensor-dropout"
      ? "Sensor dropout begins on mission day 10. Advance to day 30 to inspect the final seven-day window; missing readings remain blank and the model abstains when coverage is insufficient."
      : "Replay reset. This scenario is deterministic and reproducible.");
    render();
  }

  function exportReplay() {
    const rows = [[
      "mission_day", "heart_rate_bpm", "spo2_percent", "temperature_c", "sleep_hours",
      "self_reported_fatigue_1_to_5", "self_reported_stress_1_to_5", "data_source", "scenario"
    ]];
    records.forEach(function (record) {
      rows.push([
        record.day,
        record.readings.heartRate ?? "",
        record.readings.spo2 ?? "",
        record.readings.temperature ?? "",
        record.readings.sleep ?? "",
        record.wellbeing.fatigue,
        record.wellbeing.stress,
        "SIMULATED",
        record.scenario
      ]);
    });
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell === null || cell === undefined ? "" : cell).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "astra-simulated-mission-replay.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setMessage("Full 30-day synthetic replay exported. The CSV is labelled SIMULATED.");
  }

  $("replay-scenario").addEventListener("change", resetReplay);
  $("replay-play").addEventListener("click", function () {
    if (playing) {
      stopTimer();
      $("replay-play").textContent = "Play replay";
      setMessage("Replay paused.");
    } else {
      startTimer();
    }
  });
  $("replay-step").addEventListener("click", function () {
    stopTimer();
    $("replay-play").textContent = "Play replay";
    if (cursor < records.length - 1) setCursor(cursor + 1);
    else setMessage("Replay is complete. Restart to replay the scenario.");
  });
  $("replay-reset").addEventListener("click", resetReplay);
  $("replay-speed").addEventListener("change", function () {
    if (playing) {
      stopTimer();
      $("replay-play").textContent = "Play replay";
      startTimer();
    }
  });
  $("replay-export").addEventListener("click", exportReplay);

  resetReplay();
})();
