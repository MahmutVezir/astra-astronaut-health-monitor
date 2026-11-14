const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv } = require("../src/core/csv.js");
const { sha256, verifySha256 } = require("../src/core/integrity.js");
const { evaluateEvidence } = require("../src/core/evidence-engine.js");
const { validateTraceRecord, createTraceRecord } = require("../src/core/trace-contract.js");
const { runOsd575Pilot } = require("../src/core/osd575-pilot.js");

const COLUMNS = {
  participant: "participant_id",
  sample: "sample_id",
  timepoint: "timepoint",
  measurement: ["marker_a", "marker_b"]
};

function rowsForParticipants(count, timepointCount = 2) {
  const rows = [];
  for (let participant = 1; participant <= count; participant += 1) {
    for (let time = 1; time <= timepointCount; time += 1) {
      rows.push({
        participant_id: `P${participant}`,
        sample_id: `P${participant}_T${time}`,
        timepoint: `T${time}`,
        marker_a: String(1 + participant + time),
        marker_b: String(10 + participant + time)
      });
    }
  }
  return rows;
}

const HEADERS = ["participant_id", "sample_id", "timepoint", "marker_a", "marker_b"];

test("CSV parser handles BOM, escaped quotes, commas and CRLF", () => {
  const parsed = parseCsv('\uFEFFid,note,value\r\n1,"alpha, ""beta""",2.5\r\n');
  assert.deepEqual(parsed.headers, ["id", "note", "value"]);
  assert.equal(parsed.rows[0].note, 'alpha, "beta"');
  assert.equal(parsed.rows[0].value, "2.5");
});

test("CSV parser rejects ragged rows and unterminated quoted fields", () => {
  assert.throws(() => parseCsv("a,b\n1\n"), /expected 2/);
  assert.throws(() => parseCsv('a,b\n1,"open'), /unterminated/);
});

test("SHA-256 calculation and frozen-hash comparison are deterministic", () => {
  const bytes = Buffer.from("abc", "utf8");
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(sha256(bytes), expected);
  assert.equal(verifySha256(bytes, expected).matches, true);
  assert.equal(verifySha256(bytes, "0".repeat(64)).matches, false);
  assert.equal(verifySha256(bytes, null).verified, false);
});

test("trace contract keeps independent participants and samples as separate counts", () => {
  const record = createTraceRecord({
    dataset_id: "OSD-575",
    dataset_version: "3",
    source_url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
    license: "CC0-1.0",
    file_sha256: "a".repeat(64),
    participant_count: 4,
    sample_count: 28,
    measurement_type: "Serum multiplex panel",
    timepoints: ["L-3", "R+1"],
    analysis_question: "Descriptive timepoint summary only",
    decision: "LIMITED_EVIDENCE",
    decision_reasons: [{ code: "LOW_N", message: "Four independent participants." }]
  });
  assert.equal(record.participant_count, 4);
  assert.equal(record.sample_count, 28);
  assert.equal(validateTraceRecord(record).valid, true);
});

test("trace contract rejects unsupported decision values and missing abstention reasons", () => {
  const invalid = {
    dataset_id: "OSD-575",
    dataset_version: "3",
    source_url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
    license: "CC0-1.0",
    file_sha256: null,
    participant_count: 4,
    sample_count: 28,
    measurement_type: "Serum panel",
    timepoints: ["L-3", "R+1"],
    analysis_question: "Descriptive only",
    decision: "GUESS",
    decision_reasons: []
  };
  assert.equal(validateTraceRecord(invalid).valid, false);
  invalid.decision = "INSUFFICIENT_EVIDENCE";
  assert.equal(validateTraceRecord(invalid).valid, false);
});

test("four participants and 28 study samples are reported as limited, not 28 independent cases", () => {
  const result = evaluateEvidence({
    rows: rowsForParticipants(4),
    headers: HEADERS,
    columnMap: COLUMNS,
    expectedParticipantCount: 4,
    expectedSampleCount: 28,
    minIndependentParticipants: 10,
    rawDataAvailable: false
  });
  assert.equal(result.decision, "LIMITED_EVIDENCE");
  assert.equal(result.observed_participant_count, 4);
  assert.equal(result.observed_sample_count, 8);
  assert.ok(result.decision_reasons.some((item) => item.code === "LOW_INDEPENDENT_PARTICIPANT_COUNT"));
  assert.ok(result.decision_reasons.some((item) => item.code === "RAW_ASSAY_DATA_NOT_AVAILABLE"));
});

test("a single timepoint cannot support a within-participant temporal comparison", () => {
  const result = evaluateEvidence({
    rows: rowsForParticipants(12, 1),
    headers: HEADERS,
    columnMap: COLUMNS,
    expectedParticipantCount: 12,
    expectedSampleCount: 12,
    minIndependentParticipants: 10,
    rawDataAvailable: true
  });
  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
  assert.ok(result.decision_reasons.some((item) => item.code === "INSUFFICIENT_PAIRED_TIMEPOINTS"));
});

test("participant or sample counts above official study metadata are invalid", () => {
  const rows = rowsForParticipants(5);
  const result = evaluateEvidence({
    rows,
    headers: HEADERS,
    columnMap: COLUMNS,
    expectedParticipantCount: 4,
    expectedSampleCount: 28,
    minIndependentParticipants: 10,
    rawDataAvailable: true
  });
  assert.equal(result.decision, "INVALID_DATA");
  assert.ok(result.decision_reasons.some((item) => item.code === "PARTICIPANT_COUNT_EXCEEDS_METADATA"));
});

test("OSD-575 pilot downloads only the exact catalog file and records a SHA-256 digest", async () => {
  const csv = [
    "participant_id,sample_id,timepoint,marker_a,marker_b",
    "P1,P1_T1,L-3,1.2,2.2",
    "P1,P1_T2,R+1,1.4,2.4",
    "P2,P2_T1,L-3,1.1,2.1",
    "P2,P2_T2,R+1,1.3,2.3",
    "P3,P3_T1,L-3,1.0,2.0",
    "P3,P3_T2,R+1,1.2,2.2",
    "P4,P4_T1,L-3,0.9,1.9",
    "P4,P4_T2,R+1,1.1,2.1"
  ].join("\n");
  const bytes = Buffer.from(csv, "utf8");
  const expected = sha256(bytes);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/meta/575")) {
      return { ok: true, status: 200, json: async () => ({ study: { "OSD-575": {} } }) };
    }
    if (String(url).includes("/files/575/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          studies: {
            "OSD-575": {
              file_count: 1,
              study_files: [{
                file_name: "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
                remote_url: "/geode-py/ws/studies/OSD-575/download?file=pilot.csv"
              }]
            }
          }
        })
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === "content-length" ? String(bytes.length) : "text/csv" },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
  };

  const record = await runOsd575Pilot({
    fetchImpl,
    expectedSha256: expected,
    columnMap: COLUMNS
  });

  assert.equal(record.dataset_id, "OSD-575");
  assert.equal(record.file_sha256, expected);
  assert.equal(record.participant_count, 4);
  assert.equal(record.sample_count, 28);
  assert.equal(record.decision, "LIMITED_EVIDENCE");
  assert.equal(calls.length, 3);
  assert.ok(calls[0].endsWith("/meta/575"));
  assert.ok(calls[1].includes("/files/575/"));
  assert.ok(calls[2].startsWith("https://osdr.nasa.gov/"));
});

test("OSD-575 pilot marks a checksum mismatch as INVALID_DATA", async () => {
  const bytes = Buffer.from("participant_id,sample_id,timepoint,marker\nP1,S1,L-3,1\n", "utf8");
  const fetchImpl = async (url) => {
    if (String(url).includes("/meta/575")) {
      return { ok: true, status: 200, json: async () => ({ study: { "OSD-575": {} } }) };
    }
    if (String(url).includes("/files/575/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ studies: { "OSD-575": { study_files: [{
          file_name: "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
          remote_url: "/geode-py/ws/studies/OSD-575/download?file=pilot.csv"
        }] } } })
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
  };
  const record = await runOsd575Pilot({
    fetchImpl,
    expectedSha256: "0".repeat(64),
    columnMap: COLUMNS
  });
  assert.equal(record.decision, "INVALID_DATA");
  assert.equal(record.decision_reasons[0].code, "SHA256_MISMATCH");
});

test("OSDR file links must remain on HTTPS NASA domains", () => {
  const { resolveOsdrDownloadUrl } = require("../src/core/osdr-client.js");
  assert.equal(
    resolveOsdrDownloadUrl("/geode-py/ws/studies/OSD-575/download?file=x.csv"),
    "https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?file=x.csv"
  );
  assert.throws(() => resolveOsdrDownloadUrl("https://example.com/data.csv"), /outside NASA/);
  assert.throws(() => resolveOsdrDownloadUrl("http://osdr.nasa.gov/file.csv"), /outside NASA/);
});

test("unavailable OSDR catalog produces an explicit abstention record", async () => {
  const record = await runOsd575Pilot({
    fetchImpl: async (url) => {
      if (String(url).includes("/meta/575")) {
        return { ok: true, status: 200, json: async () => ({ study: { "OSD-575": {} } }) };
      }
      return { ok: false, status: 503 };
    },
    columnMap: COLUMNS
  });
  assert.equal(record.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(record.file_sha256, null);
  assert.equal(record.decision_reasons[0].code, "OSDR_FILE_CATALOG_UNAVAILABLE");
});


test("OSDR file catalog unwraps the documented studies[accession].study_files shape", async () => {
  const { listStudyFiles } = require("../src/core/osdr-client.js");
  const files = await listStudyFiles("OSD-575", {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        studies: { "OSD-575": { study_files: [{ file_name: "exact.csv", remote_url: "/file.csv" }] } }
      })
    })
  });
  assert.equal(files.length, 1);
  assert.equal(files[0].file_name, "exact.csv");
});

test("missing study entry in metadata API produces a reasoned abstention", async () => {
  const record = await runOsd575Pilot({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ study: {} }) }),
    columnMap: COLUMNS
  });
  assert.equal(record.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(record.decision_reasons[0].code, "OSDR_STUDY_METADATA_UNAVAILABLE");
});


test("CSV parser preserves NASA-style missing-value tokens without inventing nulls", () => {
  const parsed = parseCsv(
    "participant_id,sample_name,timepoint,marker_a,marker_b\n" +
    "C001,C001_serum_L-3,L-3,NA,\n" +
    "C001,C001_serum_R+194,R+194,1.25,NaN\n"
  );
  assert.equal(parsed.rows[0].marker_a, "NA");
  assert.equal(parsed.rows[0].marker_b, "");
  assert.equal(parsed.rows[1].timepoint, "R+194");
  assert.equal(parsed.rows[1].marker_b, "NaN");
});

test("OSD-575 R+194 is retained as a distinct timepoint label", () => {
  const { OSD575 } = require("../src/core/osd575-pilot.js");
  assert.ok(OSD575.timepoints.includes("R+194"));
  assert.equal(new Set(OSD575.timepoints).size, OSD575.timepoints.length);
});
