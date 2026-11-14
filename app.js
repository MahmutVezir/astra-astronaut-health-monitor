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
  let researchEvidence = null;
  let researchEvidenceError = null;
  let selectedResearchMarker = "crp";
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
      return '<article class="signal-card"><div class="card-top"><span class="signal-icon">' + icon + '</span><span class="state-label state-' + statusClass(item.status) + '">' + statusText(item.status) + '</span></div><p class="signal-name">' + esc(item.label) + '</p><strong class="signal-value">' + esc(formatValue(item.key, item.value)) + '</strong><p class="signal-reference">Configured band: ' + esc(state.bands[item.key].lower + "–" + state.bands[item.key].upper + " " + window.AstraHealth.SIGNALS[item.key].unit) + '</p></article>';
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
    if (!window.AstraResearch || !window.AstraResearch.inspiration4) return;
    const study = window.AstraResearch.inspiration4;
    const markup = '<p class="timeline-heading">NASA-reported sample collection points</p><div class="timeline-track">' + study.timepoints.map(function (point) {
      return '<div class="timeline-point"><span class="timeline-code">' + esc(point.label) + '</span><span class="timeline-phase">' + esc(point.phase) + '</span></div>';
    }).join("") + '</div><p class="timeline-note">Relative to launch (L) or return (R). These are research sample timepoints, not continuous vital-sign measurements.</p>';
    ["research-timeline", "osd-timeline"].forEach(function (id) {
      const target = $(id);
      if (target) target.innerHTML = markup;
    });
  }

  function renderResearchMode() {
    const study = window.AstraResearch && window.AstraResearch.inspiration4;
    if (!study) return;
    const audit = researchEvidence ? researchEvidence.audit : (study.acquisitionAudit || {});
    const sourceAuditPassed = audit.decision === "LIMITED_EVIDENCE" && audit.analysisCompleted === true;
    const setText = function (id, value) {
      const target = $(id);
      if (target) target.textContent = value === null || value === undefined || value === ""
        ? "Not available"
        : String(value);
    };

    setText("research-version", study.studyId + " · v" + study.datasetVersion);
    setText("research-participants", study.participantCount);
    setText("research-samples", study.sampleCountListed);
    setText("research-timepoint-count", study.timepoints.length);
    setText("research-assay", study.assay || "Not reported");
    setText("research-decision", researchEvidence || sourceAuditPassed ? "LIMITED EVIDENCE" : "DATA QA PENDING");
    setText("research-metadata-status", audit.metadataVerified ? "Verified" : "Not verified");
    setText("research-catalog-status", researchEvidence
      ? "HTTP 200 · exact HDCVD9 record matched"
      : audit.catalogFileFound
        ? "HTTP " + audit.catalogHttpStatus + " · exact HDCVD9 record matched"
        : "Catalog record not verified");
    const sourceBytes = researchEvidence ? researchEvidence.fileBytes : (audit.byteLength || study.evidenceData?.byteLength);
    setText("research-file-status", sourceBytes
      ? "Downloaded · " + Number(sourceBytes).toLocaleString() + " bytes"
      : "Not downloaded");
    const sourceHash = researchEvidence ? researchEvidence.sha256 : audit.fileSha256;
    setText("research-hash-status", sourceHash
      ? sourceHash.slice(0, 12) + "…" + sourceHash.slice(-8)
      : "Not calculated");
    setText("research-run-status", researchEvidence
      ? "Run ID " + audit.workflow_run_id
      : audit.runNumber
        ? "Run #" + audit.runNumber + " · post-download audit passed"
        : "No completed source audit");
    setText("research-audit-note", researchEvidence
      ? "The browser rechecked the exact imported NASA bytes against the project-maintained SHA-256 pin. All 28 CSV sample names join one-to-one to the NASA ISA table, and all nine transformed percentage columns reproduce the all-crew pre-flight normalization. The scientific decision remains LIMITED_EVIDENCE: four independent participants, with raw assay data unavailable."
      : sourceAuditPassed
        ? (audit.note || "The source-level join and normalization audit passed.") + " Browser-side SHA-256, file-shape, sample-join and normalization checks still run before biomarker measurements are rendered."
        : (audit.note || "No completed file-acquisition and mapping audit has been recorded."));

    const stateLabel = $("research-data-state");
    if (stateLabel) {
      stateLabel.textContent = researchEvidence
        ? "DATA + ANALYSIS VERIFIED"
        : sourceAuditPassed
          ? "SOURCE AUDIT PASSED · BROWSER CHECK"
          : "POST-MAP QA PENDING";
      stateLabel.className = "state-label " + (researchEvidence ? "state-good" : "state-limited");
    }
    const modeIndicator = $("mode-indicator");
    if (modeIndicator) {
      modeIndicator.textContent = researchEvidence
        ? "NASA RESEARCH MODE · SHA-256 + SAMPLE MAP VERIFIED"
        : sourceAuditPassed
          ? "NASA RESEARCH MODE · SOURCE AUDIT PASSED · BROWSER CHECK REQUIRED"
          : "NASA RESEARCH MODE · POST-MAP DATA QA PENDING";
    }
  }

  function renderResearchEvidenceChart(marker) {
    const svg = $("research-marker-chart");
    const legend = $("research-chart-legend");
    const table = $("research-evidence-table");
    if (!svg || !legend || !table || !marker || !researchEvidence) return;

    const participantIds = researchEvidence.participantIds;
    const timepoints = researchEvidence.timepoints;
    const allValues = participantIds.flatMap(function (participant) {
      return marker.participants[participant].map(function (point) { return point.percentOfPreflightMean; });
    });
    const maximum = Math.max(100, ...allValues);
    const step = Math.max(25, Math.ceil(maximum / 4 / 25) * 25);
    const yMax = Math.ceil(maximum / step) * step;
    const left = 66, right = 28, top = 24, bottom = 62, width = 860, height = 360;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = function (index) { return left + index * plotWidth / Math.max(1, timepoints.length - 1); };
    const y = function (value) { return top + (yMax - value) * plotHeight / yMax; };
    const ticks = [];
    for (let tick = 0; tick <= yMax; tick += step) ticks.push(tick);
    let markup = '<title>' + esc(marker.label) + ' participant-level normalized trajectories</title>' +
      '<desc>Four individual participant lines across seven NASA OSD-575 serum collection timepoints. Values are percentages of the all-crew pre-flight mean; the dashed 100 percent line is a mathematical reference, not a clinical threshold.</desc>';
    ticks.forEach(function (tick) {
      const position = y(tick);
      markup += '<line x1="' + left + '" y1="' + position.toFixed(1) + '" x2="' + (width - right) + '" y2="' + position.toFixed(1) + '" class="chart-grid"></line>' +
        '<text x="' + (left - 12) + '" y="' + (position + 4).toFixed(1) + '" text-anchor="end" class="chart-axis-label">' + Math.round(tick) + '</text>';
    });
    if (yMax >= 100) {
      const baselineY = y(100);
      markup += '<line x1="' + left + '" y1="' + baselineY.toFixed(1) + '" x2="' + (width - right) + '" y2="' + baselineY.toFixed(1) + '" class="chart-baseline"></line>' +
        '<text x="' + (width - right - 2) + '" y="' + (baselineY - 6).toFixed(1) + '" text-anchor="end" class="chart-baseline-label">100% reference</text>';
    }
    timepoints.forEach(function (timepoint, index) {
      markup += '<text x="' + x(index).toFixed(1) + '" y="' + (height - bottom + 24) + '" text-anchor="middle" class="chart-axis-label">' + esc(timepoint.replace("-", "−")) + '</text>';
    });
    markup += '<text x="18" y="' + (height / 2) + '" transform="rotate(-90 18 ' + (height / 2) + ')" text-anchor="middle" class="chart-axis-title">% of pre-flight mean</text>';
    markup += '<text x="' + (left + plotWidth / 2) + '" y="' + (height - 12) + '" text-anchor="middle" class="chart-axis-title">NASA OSD-575 sample collection timepoint</text>';

    participantIds.forEach(function (participant, index) {
      const points = marker.participants[participant].map(function (point, pointIndex) {
        return { x: x(pointIndex), y: y(point.percentOfPreflightMean), value: point.percentOfPreflightMean, timepoint: point.timepoint };
      });
      const path = points.map(function (point, pointIndex) {
        return (pointIndex === 0 ? "M" : "L") + point.x.toFixed(1) + " " + point.y.toFixed(1);
      }).join(" ");
      markup += '<path d="' + path + '" class="chart-line crew-' + index + '"></path>';
      points.forEach(function (point) {
        markup += '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4.2" class="chart-point crew-' + index + '"><title>' +
          esc(participant + " · " + point.timepoint + " · " + point.value.toFixed(2) + "%") +
          '</title></circle>';
      });
    });
    svg.innerHTML = markup;
    svg.setAttribute("aria-label", marker.label + " normalized values for " + participantIds.join(", ") + " across " + timepoints.join(", "));

    legend.innerHTML = participantIds.map(function (participant, index) {
      return '<span><i class="crew-' + index + '"></i>' + esc(participant) + '</span>';
    }).join("");

    let tableMarkup = '<table class="research-evidence-table"><thead><tr><th>Participant</th>' +
      timepoints.map(function (timepoint) { return '<th>' + esc(timepoint) + '</th>'; }).join("") +
      '</tr></thead><tbody>';
    participantIds.forEach(function (participant) {
      tableMarkup += '<tr><th scope="row">' + esc(participant) + '</th>' +
        marker.participants[participant].map(function (point) {
          return '<td>' + point.percentOfPreflightMean.toFixed(1) + '%</td>';
        }).join("") + '</tr>';
    });
    tableMarkup += '</tbody><tfoot><tr><td>Crew mean (n=4)</td>' +
      marker.byTimepoint.map(function (point) { return '<td>' + point.mean.toFixed(1) + '%</td>'; }).join("") +
      '</tr></tfoot></table>';
    table.innerHTML = tableMarkup;

    const markerUnit = $("research-marker-unit");
    if (markerUnit) {
      markerUnit.textContent = marker.unit + " concentration; chart and table show the source's normalized percent column. Concentration values remain available in the preserved CSV.";
    }
    const flagged = $("research-flagged-marker-note");
    if (flagged) {
      flagged.hidden = !marker.flaggedForInterpretation;
      if (marker.flaggedForInterpretation) {
        flagged.textContent = "FIBRINOGEN FLAG: this assay column is present in the downloaded file and passes the mathematical normalization check, but the vendor states fibrinogen cannot be measured in serum. Values are shown for traceability only and must not be interpreted biologically until the discrepancy is resolved.";
      }
    }
  }

  function renderResearchEvidence() {
    const status = $("research-evidence-status");
    const rows = $("research-evidence-rows");
    const matches = $("research-evidence-matches");
    const people = $("research-evidence-people");
    const normalization = $("research-evidence-normalization");
    const error = $("research-evidence-error");
    const select = $("research-marker-select");
    if (!researchEvidence) {
      const audit = window.AstraResearch?.inspiration4?.acquisitionAudit || {};
      const sourceAuditPassed = audit.decision === "LIMITED_EVIDENCE" && audit.analysisCompleted === true;
      if (status) {
        status.textContent = researchEvidenceError
          ? "SOURCE VERIFICATION FAILED"
          : sourceAuditPassed
            ? "SOURCE AUDIT PASSED · BROWSER CHECK REQUIRED"
            : "POST-MAP AUDIT PENDING";
        status.className = "state-label state-limited";
      }
      [rows, matches, people, normalization].forEach(function (item) {
        if (item) item.textContent = "—";
      });
      if (error) {
        error.hidden = !researchEvidenceError;
        error.textContent = researchEvidenceError || "";
      }
      if (select) select.disabled = true;
      return;
    }

    if (status) {
      status.textContent = "SHA-256 · MAP · NORMALIZATION PASS";
      status.className = "state-label state-good";
    }
    if (rows) rows.textContent = researchEvidence.rowCount + " / 28";
    if (matches) matches.textContent = researchEvidence.matchedSampleCount + " / 28";
    if (people) people.textContent = researchEvidence.participantIds.length + " (n=4)";
    if (normalization) normalization.textContent = researchEvidence.normalizationAudit.analyteCount + " / 9 PASS";
    if (error) error.hidden = true;

    if (select) {
      const options = researchEvidence.markers.map(function (marker) {
        const label = marker.label + (marker.flaggedForInterpretation ? " · flagged" : "");
        return '<option value="' + esc(marker.id) + '">' + esc(label) + '</option>';
      }).join("");
      if (select.innerHTML !== options) select.innerHTML = options;
      const selected = researchEvidence.markers.some(function (marker) { return marker.id === selectedResearchMarker; })
        ? selectedResearchMarker
        : researchEvidence.markers[0].id;
      selectedResearchMarker = selected;
      select.value = selected;
      select.disabled = false;
      const selectedMarker = researchEvidence.markers.find(function (marker) { return marker.id === selected; });
      renderResearchEvidenceChart(selectedMarker);
    }

    const normalizationNote = $("research-normalization-note");
    if (normalizationNote) {
      normalizationNote.textContent = "Normalization audit: PASS for " + researchEvidence.normalizationAudit.analyteCount +
        " concentration/percentage pairs; " + researchEvidence.normalizationAudit.baselineSampleCount +
        " all-crew pre-flight samples define the denominator. Maximum absolute formula difference: " +
        researchEvidence.normalizationAudit.maxAbsoluteError.toExponential(2) +
        ". The dashed 100% line is a mathematical reference, not a clinical threshold.";
    }
    const hash = $("research-source-hash");
    if (hash) hash.textContent = "SHA-256 " + researchEvidence.sha256;
  }

  async function loadResearchEvidence() {
    if (!window.AstraResearchLoader || typeof window.AstraResearchLoader.loadOds575Evidence !== "function") return;
    const study = window.AstraResearch && window.AstraResearch.inspiration4;
    if (!study || !study.evidenceData) return;
    const status = $("research-evidence-status");
    if (status) status.textContent = "VERIFYING SOURCE FILE";
    try {
      researchEvidence = await window.AstraResearchLoader.loadOds575Evidence({ evidence: study.evidenceData });
      researchEvidenceError = null;
    } catch (error) {
      researchEvidence = null;
      researchEvidenceError = error && error.message ? error.message : "The source evidence could not be verified.";
    }
    renderResearchMode();
    renderResearchEvidence();
  }

  function renderResearchSources() {
    const target = $("research-source-grid");
    const research = window.AstraResearch;
    if (!target || !research || !Array.isArray(research.sources)) return;

    target.innerHTML = research.sources.map(function (source) {
      const measures = Array.isArray(source.measures) ? source.measures : [];
      return '<article class="research-source-card">' +
        '<div class="research-source-top"><span class="research-source-id">' + esc(source.id) +
        '</span><span class="research-source-status">' + esc(source.statusLabel) + '</span></div>' +
        '<h4>' + esc(source.name) + '</h4>' +
        '<p class="research-source-role">' + esc(source.role) + '</p>' +
        '<div class="research-source-meta"><span>' + esc(source.provider) + '</span><span>' +
        esc(source.environment) + '</span></div>' +
        '<p class="research-source-domain">' + esc(source.domain) + '</p>' +
        '<div class="research-source-measures">' + measures.map(function (measure) {
          return '<span>' + esc(measure) + '</span>';
        }).join("") + '</div>' +
        '<p class="research-source-note">' + esc(source.accessNote) + '</p>' +
        '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">Open source record ↗</a>' +
        '</article>';
    }).join("");
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
    renderResearchMode();
    renderResearchTimeline();
    renderResearchSources();
    renderResearchEvidence();
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
    if (document.body && document.body.classList) {
      document.body.classList.toggle("research-mode", name === "research");
      document.body.classList.toggle("demo-mode", name !== "research");
    }
    const modeIndicator = $("mode-indicator");
    if (modeIndicator) {
      modeIndicator.textContent = name === "research"
        ? (researchEvidence ? "NASA RESEARCH MODE · VERIFIED SOURCE DATA" : "NASA RESEARCH MODE · DATA QA PENDING")
        : "DEMO / MANUAL INPUT · NO LIVE SENSORS";
    }
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
    addLog("READINGS SAVED", assessment.available + " of " + assessment.total + " signals available; " + assessment.review + " outside configured bands.");
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
  $("research-marker-select").addEventListener("change", function () { selectedResearchMarker = this.value; renderResearchEvidence(); });
  $("clear-log").addEventListener("click", function () {
    state.log = [];
    saveState();
    renderAll();
  });
  ["sleep-quality", "stress", "fatigue", "mood"].forEach(function (id) {
    $(id).addEventListener("input", function () { $(id + "-value").textContent = this.value + " / 5"; });
  });

  loadState();
  activateView("research");
  renderAll();
  loadResearchEvidence();
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        $("storage-status").textContent = "Offline cache not available";
      });
    });
  }
})();