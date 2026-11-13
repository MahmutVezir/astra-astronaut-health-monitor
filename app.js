const STORAGE_KEY = "astra-demo-state-v1";
const DEFAULTS = {
  hr: 74, spo2: 98, temp: 36.7, sleep: 7.4,
  checkin: { sleepQuality: 4, stress: 2, fatigue: 2, mood: 4 },
  logs: []
};
const REFERENCES = {
  hr: { low: 60, high: 85, label: "Heart rate" },
  spo2: { low: 96, high: 99, label: "Oxygen saturation" },
  temp: { low: 36.1, high: 37.2, label: "Temperature" },
  sleep: { low: 7, high: 9, label: "Sleep duration" }
};
const SCENARIOS = {
  nominal: { hr: 74, spo2: 98, temp: 36.7, sleep: 7.4, checkin: { sleepQuality: 4, stress: 2, fatigue: 2, mood: 4 } },
  shift: { hr: 101, spo2: 94.5, temp: 37.5, sleep: 4.3, checkin: { sleepQuality: 2, stress: 5, fatigue: 5, mood: 2 } },
  incomplete: { hr: 77, spo2: null, temp: null, sleep: 6.2, checkin: { sleepQuality: 3, stress: 3, fatigue: 3, mood: 3 } }
};
let state = loadState();
let currentScenario = "nominal";

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : structuredClone(DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function fmt(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits).replace(/\.0$/, "") : "—";
}
function assess(key) {
  const value = state[key];
  const ref = REFERENCES[key];
  if (value === null || value === undefined || value === "") return { status: "missing", label: "No data", note: "Reading unavailable; assessment limited." };
  const n = Number(value);
  if (!Number.isFinite(n)) return { status: "missing", label: "No data", note: "Reading is not valid numeric data." };
  if (n < ref.low || n > ref.high) return { status: "review", label: "Review", note: "Outside illustrative personal reference band." };
  return { status: "ok", label: "OK", note: "Inside illustrative personal reference band." };
}
function allAssessments() { return Object.keys(REFERENCES).map(key => ({ key, ...assess(key), name: REFERENCES[key].label })); }
function overall() {
  const items = allAssessments();
  const missing = items.filter(x => x.status === "missing").length;
  const review = items.filter(x => x.status === "review").length;
  if (missing) return { status: "limited", title: "Assessment is limited", explanation: missing + " signal(s) are unavailable. ASTRA will not infer or replace missing values.", missing, review, items };
  if (review) return { status: "review", title: "Baseline deviation to review", explanation: review + " signal(s) are outside the illustrative personal reference bands. Review the trend and add context.", missing, review, items };
  return { status: "ok", title: "Within personal reference", explanation: "Available readings are inside the illustrative personal ranges configured for this demo.", missing, review, items };
}
function addLog(kind, title, detail) {
  const stamp = new Date().toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  state.logs.unshift({ stamp, kind, title, detail });
  state.logs = state.logs.slice(0, 30);
  persist();
}
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function renderMetric(key, value, suffix = "") {
  const result = assess(key);
  const val = key === "temp" || key === "sleep" ? fmt(value, 1) : fmt(value, 0);
  setText(key + "-value", val);
  const stateEl = document.getElementById(key + "-state");
  const card = stateEl ? stateEl.closest(".metric-card") : null;
  if (stateEl) {
    stateEl.className = "metric-state " + (result.status === "ok" ? "" : result.status);
    stateEl.textContent = (result.status === "ok" ? "● Within baseline" : result.status === "review" ? "● Review deviation" : "● No data");
  }
  if (card) card.classList.toggle("outside", result.status === "review"), card.classList.toggle("missing", result.status === "missing");
  const track = document.getElementById(key + "-track");
  if (track) {
    const ranges = { hr: [40, 130], spo2: [85, 100], temp: [35, 40], sleep: [0, 12] };
    const r = ranges[key];
    const pct = value === null || value === undefined ? 0 : Math.max(2, Math.min(100, (Number(value) - r[0]) / (r[1] - r[0]) * 100));
    track.style.width = pct + "%";
  }
}
function renderAssessment() {
  const result = overall();
  const banner = document.getElementById("status-banner");
  banner.className = "status-banner " + result.status;
  setText("status-symbol", result.status === "ok" ? "✓" : result.status === "review" ? "!" : "?");
  setText("status-kicker", result.status === "ok" ? "BASELINE CHECK" : result.status === "review" ? "REVIEW REQUESTED" : "DATA QUALITY");
  setText("overall-status", result.title);
  setText("status-explanation", result.explanation);
  setText("assessment-quality", (4 - result.missing) + " / 4 signals available");
  setText("deviation-count", String(result.review + result.missing).padStart(2, "0"));
  setText("assessment-time", "JUST NOW");
  const list = document.getElementById("assessment-list");
  list.replaceChildren();
  result.items.forEach(item => {
    const row = document.createElement("div");
    row.className = "assessment-row " + item.status;
    const icon = document.createElement("span");
    icon.className = "assessment-check";
    icon.textContent = item.status === "ok" ? "✓" : item.status === "review" ? "!" : "–";
    const textWrap = document.createElement("div");
    const strong = document.createElement("strong"); strong.textContent = item.name;
    const small = document.createElement("small"); small.textContent = item.note;
    textWrap.append(strong, small);
    const status = document.createElement("b");
    status.textContent = item.status === "ok" ? "OK" : item.status === "review" ? "REVIEW" : "NO DATA";
    row.append(icon, textWrap, status); list.append(row);
  });
}
function renderInputs() {
  [["hr","input-hr"],["spo2","input-spo2"],["temp","input-temp"],["sleep","input-sleep"]].forEach(([key,id]) => {
    document.getElementById(id).value = state[key] === null ? "" : state[key];
  });
}
function renderChart() {
  const svg = document.getElementById("trend-chart");
  const values = currentScenario === "shift" ? [72,73,74,76,79,82,85,91,96,99,102,101] :
    currentScenario === "incomplete" ? [72,73,75,74,76,75,77,76,78,77,76,77] :
    [70,73,72,75,74,76,72,74,73,75,74,74];
  const width = 700, height = 220, left = 38, right = 14, top = 12, bottom = 20;
  const min = 50, max = 120;
  const x = i => left + i * (width - left - right) / (values.length - 1);
  const y = v => top + (max - v) * (height - top - bottom) / (max - min);
  const points = values.map((v,i) => x(i) + "," + y(v)).join(" ");
  const bandTop = y(85), bandBottom = y(60);
  svg.innerHTML = '<defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#66e4dc" stop-opacity=".22"/><stop offset="100%" stop-color="#66e4dc" stop-opacity="0"/></linearGradient></defs>' +
    '<rect x="' + left + '" y="' + bandTop + '" width="' + (width-left-right) + '" height="' + (bandBottom-bandTop) + '" fill="#3d8c89" opacity=".12"/>' +
    [60,80,100,120].map(v => '<line x1="' + left + '" y1="' + y(v) + '" x2="' + (width-right) + '" y2="' + y(v) + '" stroke="#243a50" stroke-width="1"/><text x="4" y="' + (y(v)+3) + '" fill="#73889d" font-size="9" font-family="DM Mono">' + v + '</text>').join("") +
    '<line x1="' + left + '" y1="' + bandTop + '" x2="' + (width-right) + '" y2="' + bandTop + '" stroke="#75939d" stroke-dasharray="4 5" opacity=".8"/>' +
    '<line x1="' + left + '" y1="' + bandBottom + '" x2="' + (width-right) + '" y2="' + bandBottom + '" stroke="#75939d" stroke-dasharray="4 5" opacity=".8"/>' +
    '<polygon points="' + left + ',' + (height-bottom) + ' ' + points + ' ' + (width-right) + ',' + (height-bottom) + '" fill="url(#areaFill)"/>' +
    '<polyline points="' + points + '" fill="none" stroke="#66e4dc" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    values.map((v,i) => '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="' + (i===values.length-1?4:2.1) + '" fill="' + (v<60||v>85?"#f1bb68":"#66e4dc") + '" stroke="#0d1a2a" stroke-width="1.5"/>').join("");
}
function renderLog() {
  const holder = document.getElementById("mission-log");
  holder.replaceChildren();
  if (!state.logs || !state.logs.length) {
    const empty = document.createElement("div"); empty.className = "empty-log"; empty.textContent = "No saved activity yet. Run an assessment or save a check-in to begin."; holder.append(empty); return;
  }
  state.logs.forEach(item => {
    const row = document.createElement("div"); row.className = "log-entry";
    const time = document.createElement("span"); time.className = "log-time"; time.textContent = item.stamp;
    const body = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = item.title;
    const detail = document.createElement("small"); detail.textContent = item.detail;
    body.append(title, detail);
    const kind = document.createElement("span"); kind.className = "log-kind"; kind.textContent = item.kind.toUpperCase();
    row.append(time, body, kind); holder.append(row);
  });
}
function renderAll() {
  ["hr","spo2","temp","sleep"].forEach(key => renderMetric(key, state[key]));
  renderAssessment(); renderInputs(); renderChart(); renderLog();
  [["check-sleep","sleepQuality"],["check-stress","stress"],["check-fatigue","fatigue"],["check-mood","mood"]]
    .forEach(([id,key]) => { document.getElementById(id).value = state.checkin[key]; });
  updateCheckinOutputs();
}
function updateCheckinOutputs() {
  const pairs = [["check-sleep","sleep-quality-out"],["check-stress","stress-out"],["check-fatigue","fatigue-out"],["check-mood","mood-out"]];
  pairs.forEach(([input,out]) => setText(out, document.getElementById(input).value + " / 5"));
}
function applyScenario(name) {
  currentScenario = name;
  state = { ...state, ...structuredClone(SCENARIOS[name]) };
  document.querySelectorAll(".scenario-card").forEach(btn => btn.classList.toggle("selected", btn.dataset.scenario === name));
  renderAll(); persist();
  addLog("scenario", "Demo scenario: " + (name === "nominal" ? "Nominal day" : name === "shift" ? "Baseline shift" : "Incomplete data"), overall().title);
}
function readInputs() {
  const parse = id => { const value = document.getElementById(id).value.trim(); return value === "" ? null : Number(value); };
  state.hr = parse("input-hr"); state.spo2 = parse("input-spo2"); state.temp = parse("input-temp"); state.sleep = parse("input-sleep");
  currentScenario = "custom";
  document.querySelectorAll(".scenario-card").forEach(btn => btn.classList.remove("selected"));
  persist(); renderAll();
  addLog("assessment", "Manual assessment completed", overall().title);
}
function saveCheckin() {
  state.checkin = {
    sleepQuality: Number(document.getElementById("check-sleep").value),
    stress: Number(document.getElementById("check-stress").value),
    fatigue: Number(document.getElementById("check-fatigue").value),
    mood: Number(document.getElementById("check-mood").value)
  };
  persist();
  setText("checkin-saved", "Saved locally · " + new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
  addLog("check-in", "Daily wellbeing check-in saved", "Sleep " + state.checkin.sleepQuality + "/5 · Stress " + state.checkin.stress + "/5 · Fatigue " + state.checkin.fatigue + "/5 · Mood " + state.checkin.mood + "/5");
}
function exportCSV() {
  const rows = [["field","value","illustrative_reference"],["heart_rate_bpm",state.hr,"60-85"],["oxygen_saturation_percent",state.spo2,"96-99"],["body_temperature_celsius",state.temp,"36.1-37.2"],["sleep_hours",state.sleep,"7-9"],["sleep_quality_1_to_5",state.checkin.sleepQuality,"self-report"],["stress_1_to_5",state.checkin.stress,"self-report"],["fatigue_1_to_5",state.checkin.fatigue,"self-report"],["mood_1_to_5",state.checkin.mood,"self-report"],["data_note","SIMULATED DEMO DATA","not real astronaut data"]];
  const csv = rows.map(row => row.map(v => '"' + String(v ?? "").replace(/"/g,'""') + '"').join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "astra-demo-health-data.csv"; a.click();
  URL.revokeObjectURL(url);
}
function navigate(view) {
  document.querySelectorAll(".view-panel").forEach(panel => panel.classList.toggle("active", panel.id === "view-" + view));
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.view)));
document.querySelectorAll(".scenario-card").forEach(btn => btn.addEventListener("click", () => applyScenario(btn.dataset.scenario)));
document.getElementById("apply-readings").addEventListener("click", readInputs);
document.getElementById("reset-button").addEventListener("click", () => { state = structuredClone(DEFAULTS); currentScenario="nominal"; persist(); document.querySelectorAll(".scenario-card").forEach(btn => btn.classList.toggle("selected",btn.dataset.scenario==="nominal")); renderAll(); setText("checkin-saved","Demo reset"); });
document.getElementById("export-button").addEventListener("click", exportCSV);
document.getElementById("save-checkin").addEventListener("click", saveCheckin);
["check-sleep","check-stress","check-fatigue","check-mood"].forEach(id => document.getElementById(id).addEventListener("input",updateCheckinOutputs));
document.getElementById("clear-log").addEventListener("click", () => { state.logs=[]; persist(); renderLog(); });
document.getElementById("sources-toggle").addEventListener("click", e => { e.preventDefault(); document.getElementById("source-drawer").hidden=false; });
document.getElementById("close-sources").addEventListener("click", () => { document.getElementById("source-drawer").hidden=true; });
renderAll();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
