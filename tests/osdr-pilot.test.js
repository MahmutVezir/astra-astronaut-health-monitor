const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv } = require("../src/core/csv.js");
const { sha256, verifySha256 } = require("../src/core/integrity.js");
const { evaluateEvidence } = require("../src/core/evidence-engine.js");
const { validateTraceRecord, createTraceRecord } = require("../src/core/trace-contract.js");
const { analyzeOsd575FileBytes, runOsd575Pilot } = require("../src/core/osd575-pilot.js");

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
    if (String(url).includes("/files/575")) {
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
  assert.ok(calls[1].includes("/files/575"));
  assert.ok(calls[2].startsWith("https://osdr.nasa.gov/"));
});

test("OSD-575 pilot marks a checksum mismatch as INVALID_DATA", async () => {
  const bytes = Buffer.from("participant_id,sample_id,timepoint,marker\nP1,S1,L-3,1\n", "utf8");
  const fetchImpl = async (url) => {
    if (String(url).includes("/meta/575")) {
      return { ok: true, status: 200, json: async () => ({ study: { "OSD-575": {} } }) };
    }
    if (String(url).includes("/files/575")) {
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

test("catalog download URLs stay on NASA HTTPS and redirects allow only the official OSDR public bucket", () => {
  const {
    resolveOsdrDownloadUrl,
    validateOsdrDownloadResponseUrl
  } = require("../src/core/osdr-client.js");
  const fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  assert.equal(
    resolveOsdrDownloadUrl("/geode-py/ws/studies/OSD-575/download?file=x.csv"),
    "https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?file=x.csv"
  );
  assert.throws(() => resolveOsdrDownloadUrl("https://example.com/data.csv"), /outside NASA/);
  assert.throws(() => resolveOsdrDownloadUrl("http://osdr.nasa.gov/file.csv"), /outside NASA/);
  assert.equal(
    validateOsdrDownloadResponseUrl("https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?file=x.csv"),
    "https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?file=x.csv"
  );
  assert.equal(
    validateOsdrDownloadResponseUrl(
      "https://nasa-osdr.s3.us-west-2.amazonaws.com/OSD-575/version-3/ALSDA/" + fileName,
      fileName
    ),
    "https://nasa-osdr.s3.us-west-2.amazonaws.com/OSD-575/version-3/ALSDA/" + fileName
  );
  assert.throws(
    () => validateOsdrDownloadResponseUrl("https://example.com/" + fileName, fileName),
    /outside verified NASA HTTPS endpoints/
  );
  assert.equal(
    validateOsdrDownloadResponseUrl(
      "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/" + fileName,
      fileName
    ),
    "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/" + fileName
  );
  assert.throws(
    () => validateOsdrDownloadResponseUrl("https://another-bucket.s3.amazonaws.com/" + fileName, fileName),
    /outside verified NASA HTTPS endpoints/
  );
  assert.throws(
    () => validateOsdrDownloadResponseUrl("http://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/" + fileName, fileName),
    /outside verified NASA HTTPS endpoints/
  );
  assert.throws(
    () => validateOsdrDownloadResponseUrl(
      "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/other-study/" + fileName,
      fileName
    ),
    /exact catalog filename and approved object path/
  );
  assert.throws(
    () => validateOsdrDownloadResponseUrl(
      "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/other.csv",
      fileName
    ),
    /exact catalog filename and approved object path/
  );
  assert.throws(
    () => validateOsdrDownloadResponseUrl(
      "https://nasa-osdr.s3.us-west-2.amazonaws.com/OSD-575/version-3/other.csv",
      fileName
    ),
    /exact catalog filename/
  );
});

test("OSDR download accepts the observed ALSDA bucket only for the exact HDCVD9 object", async () => {
  const { downloadStudyFile } = require("../src/core/osdr-client.js");
  const fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const bytes = Buffer.from("source,sample,timepoint,marker\nC001,S1,L-3,1\n", "utf8");
  const record = {
    file_name: fileName,
    file_size: bytes.length,
    remote_url: "/geode-py/ws/studies/OSD-575/download?source=datamanager&file=" + fileName
  };
  const result = await downloadStudyFile(record, async () => ({
    ok: true,
    status: 200,
    url: "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/" + fileName,
    headers: { get: (name) => name.toLowerCase() === "content-length" ? String(bytes.length) : "text/csv" },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }));
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.catalogFileSizeBytes, bytes.length);
  assert.equal(result.downloadUrl, "https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=" + fileName);
  assert.equal(result.finalResponseUrl, "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/" + fileName);
  assert.equal(result.finalResponseHost, "genelab-alsda-repo-prod.s3.amazonaws.com");
  assert.equal(result.finalResponsePath, "/alsda-data/LSDS-8/Multiplex/" + fileName);
  assert.equal(result.redirected, true);
  await assert.rejects(
    () => downloadStudyFile({ ...record, file_size: bytes.length + 1 }, async () => ({
      ok: true,
      status: 200,
      url: "https://genelab-alsda-repo-prod.s3.amazonaws.com/alsda-data/LSDS-8/Multiplex/" + fileName,
      headers: { get: () => null },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    })),
    /mismatch with OSDR catalog/
  );
  await assert.rejects(
    () => downloadStudyFile(record, async () => ({
      ok: true,
      status: 200,
      url: "https://example.com/" + fileName,
      headers: { get: () => null },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    })),
    (error) => {
      assert.match(error.message, /outside verified NASA HTTPS endpoints/);
      assert.deepEqual(error.redirect, {
        protocol: "https:",
        host: "example.com",
        path: "/" + fileName,
        filename: fileName
      });
      return true;
    }
  );
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

test("live fetch mapping recognizes OSDR sample identifiers and only numeric measurement columns", () => {
  const { inferColumnMap } = require("../scripts/fetch-osd575.js");
  const headers = ["Source Name", "Sample Name", "Factor Value: Time", "IL-6", "Protocol REF"];
  const rows = [
    { "Source Name": "C001", "Sample Name": "C001_serum_L-3", "Factor Value: Time": "Launch minus 3 day", "IL-6": "1.2", "Protocol REF": "Sample Preparation" },
    { "Source Name": "C001", "Sample Name": "C001_serum_R+194", "Factor Value: Time": "Return plus 194 day", "IL-6": "NA", "Protocol REF": "Assay Information" }
  ];
  assert.deepEqual(inferColumnMap(headers, rows), {
    participant: "Source Name",
    sample: "Sample Name",
    timepoint: "Factor Value: Time",
    measurement: ["IL-6"]
  });
});


test("OSD-575 study version, assay, participant and timepoint metadata come from the NASA JSON structure", () => {
  const { extractStudyMetadata } = require("../scripts/fetch-osd575.js");
  const fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const payload = {
    study: {
      "OSD-575": {
        version: 3,
        studies: [{
          identifier: "OSD-575",
          title: "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays",
          publicReleaseDate: "2024-05-14"
        }],
        additionalInformation: {
          samples: {
            "s_OSD-575-txt": {
              header: [
                { title: "Source Name", field: "source" },
                { title: "Sample Name", field: "sample" },
                { title: "Factor Value: Time", field: "time" }
              ],
              raw: [
                { source: "C001", sample: "C001_serum_L-3", time: "Launch minus 3" },
                { source: "C001", sample: "C001_serum_R+194", time: "Return plus 194" },
                { source: "C002", sample: "C002_serum_L-3", time: "Launch minus 3" }
              ]
            }
          },
          assays: {
            "a_OSD-575_immunoassay_multiplex_Eve Technologies Panel HDCVD9-txt": {
              header: [
                { title: "Raw Data File", field: "rawFile" },
                { title: "Protocol REF", field: "protocolA" },
                { title: "Protocol REF", field: "protocolB" },
                { title: "Parameter Value:  Transformed Files", field: "transformed" }
              ],
              raw: [{
                rawFile: "Not Available",
                protocolA: "Assay Information",
                protocolB: "ALSDA Transformed Data",
                transformed: fileName
              }]
            }
          }
        }
      }
    }
  };

  const result = extractStudyMetadata(payload);
  assert.equal(result.dataset_version, "3");
  assert.equal(result.study_identifier, "OSD-575");
  assert.match(result.study_title, /Inspiration4/);
  assert.equal(result.participant_count, 2);
  assert.equal(result.sample_count, 3);
  assert.ok(result.timepoints.includes("Return plus 194"));
  assert.equal(result.transformed_data_class, "ALSDA Transformed Data");
  assert.equal(result.transformed_data_verified, true);
  assert.equal(result.raw_data_file_status, "Not Available");
  assert.equal(result.license, "CC0-1.0");
  assert.equal(result.license_api_value, null);
  assert.equal(result.license_api_status, "NOT_EXPOSED_BY_LEGACY_METADATA_API");
});

test("OSD-575 metadata API license is used only when a license field is actually present", () => {
  const { findApiLicense } = require("../scripts/fetch-osd575.js");
  assert.equal(findApiLicense({ license: "CC0-1.0" }), "CC0-1.0");
  assert.equal(findApiLicense({ comments: [{ name: "License", value: "CC0-1.0" }] }), "CC0-1.0");
  assert.equal(findApiLicense({ comments: [], studies: [{ identifier: "OSD-575" }] }), null);
});

test("OSD-575 metadata API version mismatch is rejected before downloading data", () => {
  const { extractStudyMetadata } = require("../scripts/fetch-osd575.js");
  const payload = {
    study: {
      "OSD-575": {
        version: 4,
        studies: [{ identifier: "OSD-575", title: "Different version" }],
        additionalInformation: {}
      }
    }
  };
  assert.throws(() => extractStudyMetadata(payload), /expected version 3/);
});


test("OSD-575 catalog requests the metadata-verified version and follows every page_total page", async () => {
  const { listStudyFiles, selectStudyFile } = require("../src/core/osdr-client.js");
  const pages = [
    {
      page_number: 0,
      page_size: 2,
      page_total: 2,
      hits: 1,
      total_hits: 1,
      studies: {
        "OSD-575.3": {
          file_count: 3,
          study_files: [
            { file_name: "first.txt", remote_url: "/download?file=first.txt" },
            { file_name: "second.txt", remote_url: "/download?file=second.txt" }
          ]
        }
      }
    },
    {
      page_number: 1,
      page_size: 2,
      page_total: 2,
      hits: 1,
      total_hits: 1,
      studies: {
        "OSD-575.3": {
          file_count: 3,
          study_files: [
            { file_name: "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv", remote_url: "/download?file=target.csv" }
          ]
        }
      }
    }
  ];
  const urls = [];
  const records = await listStudyFiles("OSD-575", {
    studyVersion: "3",
    pageSize: 2,
    fetchImpl: async (url) => {
      urls.push(String(url));
      const page = Number(new URL(String(url)).searchParams.get("page"));
      return { ok: true, json: async () => pages[page] };
    }
  });

  assert.equal(records.length, 3);
  assert.ok(urls[0].includes("/files/575.3/"));
  assert.ok(urls[0].includes("page=0"));
  assert.ok(urls[1].includes("/files/575.3/"));
  assert.ok(urls[1].includes("page=1"));
  assert.equal(
    selectStudyFile(records, "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv").file_name,
    "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv"
  );
});

test("OSDR catalog client supports NASA-documented bare versioned and unversioned endpoints", async () => {
  const { listStudyFiles } = require("../src/core/osdr-client.js");
  const expected = {
    file_name: "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
    remote_url: "/geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv"
  };

  for (const testCase of [
    { studyVersion: "3", key: "OSD-575.3", suffix: "/files/575.3" },
    { studyVersion: null, key: "OSD-575", suffix: "/files/575" }
  ]) {
    const urls = [];
    const records = await listStudyFiles("OSD-575", {
      studyVersion: testCase.studyVersion,
      trailingSlash: false,
      bareFirstPage: true,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return {
          ok: true,
          json: async () => ({
            hits: 1,
            input: testCase.studyVersion ? "575.3" : "575",
            page_number: 0,
            page_size: 25,
            page_total: 1,
            total_hits: 1,
            studies: { [testCase.key]: { file_count: 1, study_files: [expected] } }
          })
        };
      }
    });

    assert.equal(urls.length, 1);
    assert.ok(urls[0].endsWith(testCase.suffix));
    assert.equal(new URL(urls[0]).search, "");
    assert.deepEqual(records, [expected]);
  }
});

test("catalog file selection matches the exact target at the end of remote_url file query values", () => {
  const { selectStudyFile, getCsvFileCandidates } = require("../src/core/osdr-client.js");
  const target = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const records = [
    {
      file_name: "opaque-download-entry",
      remote_url: "/geode-py/ws/studies/OSD-575/download?source=datamanager&file=assays/HDCVD9/" + target
    },
    {
      filename: "another.csv",
      remote_url: "/geode-py/ws/studies/OSD-575/download?file=other.csv"
    }
  ];

  assert.equal(selectStudyFile(records, target), records[0]);
  assert.deepEqual(getCsvFileCandidates(records), ["another.csv", target, "other.csv"]);
});

test("catalog pagination rejects a truncated study_file list when file_count is larger", async () => {
  const { listStudyFiles } = require("../src/core/osdr-client.js");
  await assert.rejects(
    () => listStudyFiles("OSD-575", {
      studyVersion: "3",
      pageSize: 2,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          page_number: 0,
          page_size: 2,
          page_total: 1,
          hits: 1,
          total_hits: 1,
          studies: {
            "OSD-575.3": {
              file_count: 3,
              study_files: [
                { file_name: "one.txt", remote_url: "/file/one.txt" },
                { file_name: "two.txt", remote_url: "/file/two.txt" }
              ]
            }
          }
        })
      })
    }),
    /returned 2 unique files, but study metadata declares file_count=3/
  );
});

test("catalog pagination uses total_hits when page_total is omitted", async () => {
  const { listStudyFiles } = require("../src/core/osdr-client.js");
  const urls = [];
  const records = await listStudyFiles("OSD-575", {
    pageSize: 2,
    fetchImpl: async (url) => {
      urls.push(String(url));
      const page = Number(new URL(String(url)).searchParams.get("page"));
      return {
        ok: true,
        json: async () => ({
          page_number: page,
          page_size: 2,
          total_hits: 3,
          studies: {
            "OSD-575": {
              study_files: page === 0
                ? [
                    { file_name: "one.txt", remote_url: "/file/one.txt" },
                    { file_name: "two.txt", remote_url: "/file/two.txt" }
                  ]
                : [{ file_name: "three.txt", remote_url: "/file/three.txt" }]
            }
          }
        })
      };
    }
  });

  assert.equal(records.length, 3);
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes("page=1"));
});


function makeOsd575MetadataPayload(fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv") {
  const assayKey = "a_OSD-575_immunoassay_multiplex_Eve Technologies Panel HDCVD9-txt";
  return {
    study: {
      "OSD-575": {
        version: 3,
        studies: [{
          identifier: "OSD-575",
          title: "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays",
          assays: [{
            filename: assayKey.replace(/-txt$/, ".txt"),
            dataFiles: [{ name: "Not Available", type: "Raw Data File" }],
            processSequence: [
              {},
              {},
              { parameterValues: [{ value: "LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv" }, { value: fileName }] }
            ]
          }]
        }],
        additionalInformation: {
          samples: {
            "s_OSD-575-txt": {
              header: [
                { title: "Source Name", field: "source" },
                { title: "Sample Name", field: "sample" },
                { title: "Factor Value: Time", field: "time" }
              ],
              raw: [{ source: "C001", sample: "C001_serum_L-3", time: "Launch minus 3" }]
            }
          },
          assays: {
            [assayKey]: {
              header: [
                { title: "Raw Data File", field: "rawFile" },
                { title: "Protocol REF", field: "protocolA" },
                { title: "Protocol REF", field: "protocolB" },
                { title: "Parameter Value: Transformed Files", field: "transformedFile" }
              ],
              raw: [{
                rawFile: "Not Available",
                protocolA: "Sample Preparation",
                protocolB: "ALSDA Transformed Data",
                transformedFile: fileName
              }]
            }
          }
        }
      }
    }
  };
}

function fakeJsonResponse(url, body) {
  return {
    ok: true,
    status: 200,
    url,
    text: async () => JSON.stringify(body)
  };
}

test("OSD-575 metadata filename references are extracted from the observed meta/575 ISA fields, without inventing URLs", () => {
  const { extractMetadataFileReferences } = require("../scripts/fetch-osd575.js");
  const references = extractMetadataFileReferences(makeOsd575MetadataPayload());

  assert.equal(references.file_name, "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv");
  assert.equal(references.occurrences.length, 2);
  assert.ok(references.occurrences.some((item) =>
    item.source_path.includes("additionalInformation.assays") &&
    item.source_path.endsWith(".raw[0].transformedFile")
  ));
  assert.ok(references.occurrences.some((item) =>
    item.source_path.includes(".studies[0].assays[0].processSequence[2].parameterValues[1].value")
  ));
  assert.deepEqual(references.download_urls, []);
});

test("empty documented OSDR catalog variants preserve responses and abstain without asserting the file does not exist", async () => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("../scripts/fetch-osd575.js");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "osd575-empty-catalog-"));
  const metadata = makeOsd575MetadataPayload();
  const versionedCatalog = {
    hits: 0,
    input: "575.3",
    page_number: 0,
    page_size: 25,
    page_total: 1,
    studies: {},
    success: true,
    total_hits: 1,
    valid_input: ["575"]
  };
  const unversionedCatalog = { ...versionedCatalog, input: "575" };
  const fetchCalls = [];

  try {
    const result = await main({
      outputDir,
      logger: { log() {}, warn() {}, error() {} },
      fetchImpl: async (url) => {
        const address = String(url);
        fetchCalls.push(address);
        if (address.includes("/meta/575")) return fakeJsonResponse(address, metadata);
        if (address.includes("/files/575.3/")) return fakeJsonResponse(address, versionedCatalog);
        if (address.endsWith("/files/575.3")) return fakeJsonResponse(address, versionedCatalog);
        if (address.endsWith("/files/575")) return fakeJsonResponse(address, unversionedCatalog);
        throw new Error("Unexpected network request: " + address);
      }
    });

    assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.manifest.file_sha256, null);
    assert.equal(result.manifest.file_download_url, null);
    assert.equal(result.manifest.file_catalog_record_found, false);
    assert.equal(result.manifest.catalog_access_state, "NO_VERIFIED_CATALOG_MATCH_OR_DOWNLOAD_URL");
    assert.equal(result.pilotReport.trace_contract.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(
      result.pilotReport.trace_contract.decision_reasons[0].code,
      "NO_CATALOG_MATCH_AFTER_DOCUMENTED_LOOKUPS"
    );
    assert.ok(fetchCalls.some((url) => url.includes("/meta/575")));
    assert.ok(fetchCalls.some((url) => url.includes("/files/575.3/?page=0")));
    assert.ok(fetchCalls.some((url) => url.endsWith("/files/575.3")));
    assert.ok(fetchCalls.some((url) => url.endsWith("/files/575")));
    assert.equal(result.pilotReport.catalog_discovery_attempts.length, 3);

    const metadataArtifact = JSON.parse(await fs.readFile(path.join(outputDir, "metadata-response.json"), "utf8"));
    const catalogArtifact = JSON.parse(await fs.readFile(path.join(outputDir, "file-catalog-response.json"), "utf8"));
    const reportArtifact = JSON.parse(await fs.readFile(path.join(outputDir, "pilot-report.json"), "utf8"));
    assert.ok(metadataArtifact[0].raw_response_text.includes("LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv"));
    assert.equal(catalogArtifact.length, 3);
    assert.ok(catalogArtifact.every((snapshot) => snapshot.body.hits === 0));
    assert.equal(catalogArtifact[0].body.total_hits, 1);
    assert.equal(reportArtifact.trace_contract.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(reportArtifact.file_sha256, null);
    assert.equal(reportArtifact.analysis_gate.data_pipeline_completed, false);
    await assert.rejects(fs.access(path.join(outputDir, "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv")));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("when the exact transformed CSV has a real catalog remote_url, the fetch audit hashes bytes and runs the OSD-575 pilot", async () => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("../scripts/fetch-osd575.js");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "osd575-download-success-"));
  const metadata = makeOsd575MetadataPayload();
  const fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const fileRecord = {
    file_name: fileName,
    remote_url: "/osd/data/osd/download/" + encodeURIComponent(fileName)
  };
  const catalog = {
    hits: 1,
    input: "575.3",
    page_number: 0,
    page_size: 25,
    page_total: 1,
    studies: { "OSD-575.3": { study_files: [fileRecord] } },
    success: true,
    total_hits: 1,
    valid_input: ["575"]
  };
  const timepoints = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];
  const rows = ["Source Name,Sample Name,Factor Value: Time,IL-6"];
  for (let participant = 1; participant <= 4; participant += 1) {
    for (const timepoint of timepoints) {
      rows.push("C00" + participant + ",C00" + participant + "_serum_" + timepoint + "," + timepoint + "," + (participant * 10));
    }
  }
  const bytes = Buffer.from(rows.join("\n") + "\n", "utf8");
  fileRecord.file_size = bytes.length;
  const expectedDigest = sha256(bytes);

  try {
    const result = await main({
      outputDir,
      referenceSha256: expectedDigest,
      logger: { log() {}, warn() {}, error() {} },
      fetchImpl: async (url) => {
        const address = String(url);
        if (address.includes("/meta/575")) return fakeJsonResponse(address, metadata);
        if (address.includes("/files/575.3/")) return fakeJsonResponse(address, catalog);
        if (address.includes("/osd/data/osd/download/")) {
          return {
            ok: true,
            status: 200,
            url: address,
            headers: {
              get: (name) => name.toLowerCase() === "content-length" ? String(bytes.length) : "text/csv"
            },
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          };
        }
        throw new Error("Unexpected network request: " + address);
      }
    });

    assert.equal(result.manifest.file_sha256, expectedDigest);
    assert.equal(result.manifest.raw_bytes_preserved, true);
    assert.equal(result.manifest.download_response.final_host, "osdr.nasa.gov");
    assert.equal(result.manifest.download_response.final_path, "/osd/data/osd/download/" + fileName);
    assert.equal(result.manifest.download_response.redirected, false);
    assert.equal(result.pilotReport.download_response.final_url, "https://osdr.nasa.gov/osd/data/osd/download/" + fileName);
    assert.equal(result.pilotReport.file_sha256, expectedDigest);
    assert.ok(result.pilotReport.trace_contract);
    assert.equal(result.pilotReport.trace_contract.file_sha256, expectedDigest);
    const savedBytes = await fs.readFile(path.join(outputDir, fileName));
    assert.equal(sha256(savedBytes), expectedDigest);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});


test("byte analysis returns INSUFFICIENT_EVIDENCE when no participant has repeated timepoints, but LIMITED_EVIDENCE for partial participant coverage", () => {
  const { analyzeOsd575FileBytes } = require("../src/core/osd575-pilot.js");
  const { inferColumnMap } = require("../scripts/fetch-osd575.js");
  const timepoints = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];

  const partialRows = ["participant_id,sample_id,timepoint,marker_a,marker_b"];
  for (let participant = 1; participant <= 3; participant += 1) {
    for (const timepoint of timepoints) {
      partialRows.push("C00" + participant + ",C00" + participant + "_" + timepoint + "," + timepoint + "," + participant + ",2");
    }
  }
  const partialBytes = Buffer.from(partialRows.join("\n") + "\n", "utf8");
  const partialParsed = parseCsv(partialBytes.toString("utf8"));
  const partialMap = inferColumnMap(partialParsed.headers, partialParsed.rows);
  const partial = analyzeOsd575FileBytes({
    bytes: partialBytes,
    columnMap: partialMap,
    rawDataAvailable: false
  });

  assert.equal(partial.trace.decision, "LIMITED_EVIDENCE");
  assert.equal(partial.evidence.observed_participant_count, 3);
  assert.equal(partial.evidence.paired_participant_count, 3);
  assert.ok(partial.trace.decision_reasons.some((item) => item.code === "PARTICIPANT_COVERAGE_BELOW_STUDY_TOTAL"));
  assert.ok(!partial.trace.decision_reasons.some((item) => item.code === "INSUFFICIENT_PAIRED_TIMEPOINTS"));

  const singleRows = ["participant_id,sample_id,timepoint,marker_a,marker_b"];
  for (let participant = 1; participant <= 4; participant += 1) {
    singleRows.push("C00" + participant + ",C00" + participant + "_L-3,L-3," + participant + ",2");
  }
  const singleBytes = Buffer.from(singleRows.join("\n") + "\n", "utf8");
  const singleParsed = parseCsv(singleBytes.toString("utf8"));
  const singleMap = inferColumnMap(singleParsed.headers, singleParsed.rows);
  const single = analyzeOsd575FileBytes({
    bytes: singleBytes,
    columnMap: singleMap,
    rawDataAvailable: false
  });

  assert.equal(single.trace.decision, "INSUFFICIENT_EVIDENCE");
  assert.ok(single.trace.decision_reasons.some((item) => item.code === "INSUFFICIENT_PAIRED_TIMEPOINTS"));
  assert.equal(single.fileSha256, sha256(singleBytes));
  assert.equal(single.byteLength, singleBytes.length);
});


test("HDCVD9 rows are joined to the authoritative NASA ISA sample table and processed percentages reproduce the all-crew pre-flight baseline", async () => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const {
    main,
    extractSampleMetadata,
    mapRowsUsingSampleMetadata,
    auditBaselinePercentNormalization
  } = require("../scripts/fetch-osd575.js");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "osd575-hdcvd9-metadata-join-"));
  const metadata = makeOsd575MetadataPayload();
  const sampleRaw = [];
  const csvLines = [
    "Sample Name,crp_concentration_picogram_per_milliliter,crp_percent"
  ];
  const baselineValues = [100, 200, 300, 400];
  for (let index = 0; index < 4; index += 1) {
    const participant = "C00" + (index + 1);
    for (const point of [
      { sample: "L-3", metadata: "Launch minus 3" },
      { sample: "R+1", metadata: "Return plus 1" }
    ]) {
      const sampleName = participant + "_serum_" + point.sample;
      const concentration = point.sample === "L-3"
        ? baselineValues[index]
        : baselineValues[index] * 2;
      const percent = concentration / (baselineValues.reduce((sum, value) => sum + value, 0) / 4) * 100;
      sampleRaw.push({ source: participant, sample: sampleName, time: point.metadata });
      csvLines.push(sampleName + "," + concentration + "," + percent);
    }
  }
  metadata.study["OSD-575"].additionalInformation.samples["s_OSD-575-txt"].raw = sampleRaw;
  const csvBytes = Buffer.from(csvLines.join("\n") + "\n", "utf8");
  const expectedDigest = sha256(csvBytes);
  const sampleMetadata = extractSampleMetadata(metadata);
  const parsed = parseCsv(csvBytes.toString("utf8"));
  const mapped = mapRowsUsingSampleMetadata(parsed.headers, parsed.rows, sampleMetadata);

  assert.equal(sampleMetadata.length, 8);
  assert.equal(mapped.columnMap.participant, "__osdr_metadata_participant_id");
  assert.equal(mapped.columnMap.sample, "Sample Name");
  assert.equal(mapped.columnMap.timepoint, "__osdr_metadata_timepoint");
  assert.deepEqual(mapped.columnMap.measurement, ["crp_concentration_picogram_per_milliliter"]);
  assert.equal(mapped.provenance.complete_csv_row_match, true);
  assert.equal(mapped.provenance.full_study_sample_coverage, true);
  assert.equal(mapped.rows.length, 8);
  assert.equal(mapped.rows[0].__osdr_metadata_participant_id, "C001");
  assert.equal(mapped.rows[0].__osdr_metadata_timepoint, "L-3");

  const normalization = auditBaselinePercentNormalization(
    mapped.rows,
    mapped.headers,
    mapped.columnMap
  );
  assert.equal(normalization.status, "PASS");
  assert.equal(normalization.baseline_sample_count, 4);
  assert.ok(normalization.analytes[0].max_absolute_error <= 1e-6);

  const fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const fileRecord = {
    file_name: fileName,
    remote_url: "/geode-py/ws/studies/OSD-575/download?source=datamanager&file=" + encodeURIComponent(fileName),
    file_size: csvBytes.length,
    restricted: false
  };
  const catalog = {
    hits: 1,
    input: "575.3",
    page_number: 0,
    page_size: 25,
    page_total: 1,
    total_hits: 1,
    studies: { "OSD-575.3": { file_count: 1, study_files: [fileRecord] } },
    success: true,
    valid_input: ["575"]
  };
  try {
    const result = await main({
      outputDir,
      referenceSha256: expectedDigest,
      logger: { log() {}, warn() {}, error() {} },
      fetchImpl: async (url) => {
        const address = String(url);
        if (address.includes("/meta/575")) return fakeJsonResponse(address, metadata);
        if (address.includes("/files/575.3/")) return fakeJsonResponse(address, catalog);
        if (address.includes("/geode-py/ws/studies/OSD-575/download")) {
          return {
            ok: true,
            status: 200,
            url: address,
            headers: {
              get: (name) => name.toLowerCase() === "content-length" ? String(csvBytes.length) : "text/csv"
            },
            arrayBuffer: async () => csvBytes.buffer.slice(csvBytes.byteOffset, csvBytes.byteOffset + csvBytes.byteLength)
          };
        }
        throw new Error("Unexpected network request: " + address);
      }
    });

    assert.equal(result.decision, "LIMITED_EVIDENCE");
    assert.equal(result.manifest.reference_sha256, expectedDigest);
    assert.equal(result.manifest.reference_sha256_status, "MATCHED_REVIEWED_REFERENCE_SHA256");
    assert.equal(result.pilotReport.row_mapping_provenance.method, "EXACT_SAMPLE_NAME_JOIN_TO_OSDR_ISA_SAMPLE_TABLE");
    assert.equal(result.pilotReport.observed.participant_count, 4);
    assert.equal(result.pilotReport.observed.sample_count, 8);
    assert.deepEqual(result.pilotReport.observed.timepoints, ["L-3", "R+1"]);
    assert.equal(result.pilotReport.observed.paired_participant_count, 4);
    assert.equal(result.pilotReport.baseline_percent_normalization_audit.status, "PASS");
    assert.equal(result.pilotReport.analysis_gate.data_pipeline_completed, true);
    assert.equal(result.pilotReport.trace_contract.decision, "LIMITED_EVIDENCE");
    assert.ok(result.pilotReport.trace_contract.decision_reasons.some(
      (item) => item.code === "LOW_INDEPENDENT_PARTICIPANT_COUNT"
    ));
    const saved = await fs.readFile(path.join(outputDir, fileName));
    assert.equal(sha256(saved), expectedDigest);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("metadata-backed mapping refuses CSV sample names that cannot be joined to the official ISA table", () => {
  const { extractSampleMetadata, mapRowsUsingSampleMetadata } = require("../scripts/fetch-osd575.js");
  const metadata = makeOsd575MetadataPayload();
  const sampleMetadata = extractSampleMetadata(metadata);
  const headers = ["Sample Name", "crp_concentration_picogram_per_milliliter"];
  const rows = [{ "Sample Name": "C999_serum_L-3", crp_concentration_picogram_per_milliliter: "42" }];
  const mapped = mapRowsUsingSampleMetadata(headers, rows, sampleMetadata);
  assert.equal(mapped.columnMap, null);
  assert.equal(mapped.provenance.complete_csv_row_match, false);
  assert.deepEqual(mapped.provenance.unmatched_csv_sample_names, ["C999_serum_L-3"]);
});

test("end-to-end audit uses the documented unversioned catalog fallback and analyzes synthetic incomplete CSV bytes", async () => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("../scripts/fetch-osd575.js");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "osd575-unversioned-fallback-"));
  const metadata = makeOsd575MetadataPayload();
  const fileName = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const fileRecord = {
    file_name: fileName,
    remote_url: "/geode-py/ws/studies/OSD-575/download?source=datamanager&file=" + encodeURIComponent(fileName),
    category: "Transformed Data",
    restricted: false
  };
  const emptyVersioned = {
    hits: 0,
    input: "575.3",
    page_number: 0,
    page_size: 25,
    page_total: 1,
    studies: {},
    success: true,
    total_hits: 1,
    valid_input: ["575"]
  };
  const unversioned = {
    hits: 1,
    input: "575",
    page_number: 0,
    page_size: 25,
    page_total: 1,
    studies: { "OSD-575": { file_count: 1, study_files: [fileRecord] } },
    success: true,
    total_hits: 1,
    valid_input: ["575"]
  };
  const rows = ["Source Name,Sample Name,Factor Value: Time,IL-6"];
  for (let participant = 1; participant <= 4; participant += 1) {
    rows.push("C00" + participant + ",C00" + participant + "_serum_L-3,Launch minus 3," + (participant * 10));
  }
  const bytes = Buffer.from(rows.join("\n") + "\n", "utf8");
  const expectedDigest = sha256(bytes);
  const requestedUrls = [];

  try {
    const result = await main({
      outputDir,
      referenceSha256: expectedDigest,
      logger: { log() {}, warn() {}, error() {} },
      fetchImpl: async (url) => {
        const address = String(url);
        requestedUrls.push(address);
        if (address.includes("/meta/575")) return fakeJsonResponse(address, metadata);
        if (address.includes("/files/575.3/")) return fakeJsonResponse(address, emptyVersioned);
        if (address.endsWith("/files/575.3")) return fakeJsonResponse(address, emptyVersioned);
        if (address.endsWith("/files/575")) return fakeJsonResponse(address, unversioned);
        if (address.includes("/geode-py/ws/studies/OSD-575/download")) {
          return {
            ok: true,
            status: 200,
            url: address,
            headers: {
              get: (name) => name.toLowerCase() === "content-length" ? String(bytes.length) : "text/csv"
            },
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          };
        }
        throw new Error("Unexpected network request: " + address);
      }
    });

    assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.manifest.file_catalog_record_found, true);
    assert.equal(result.manifest.file_catalog_record_source, "UNVERSIONED_DOCUMENTED_BARE_ENDPOINT");
    assert.equal(result.manifest.catalog_access_state, "FILE_DOWNLOADED_AND_HASHED");
    assert.equal(result.manifest.file_sha256, expectedDigest);
    assert.equal(result.manifest.byte_length, bytes.length);
    assert.equal(result.manifest.raw_bytes_preserved, true);
    assert.equal(result.pilotReport.file_sha256, expectedDigest);
    assert.equal(result.pilotReport.column_map.participant, "Source Name");
    assert.equal(result.pilotReport.column_map.sample, "Sample Name");
    assert.equal(result.pilotReport.column_map.timepoint, "Factor Value: Time");
    assert.equal(result.pilotReport.observed.participant_count, 4);
    assert.equal(result.pilotReport.observed.sample_count, 4);
    assert.deepEqual(result.pilotReport.observed.timepoints, ["L-3"]);
    assert.ok(result.pilotReport.trace_contract.decision_reasons.some(
      (item) => item.code === "INSUFFICIENT_PAIRED_TIMEPOINTS"
    ));
    assert.equal(result.pilotReport.analysis_gate.data_pipeline_completed, true);
    assert.ok(requestedUrls.some((url) => url.endsWith("/files/575.3")));
    assert.ok(requestedUrls.some((url) => url.endsWith("/files/575")));
    assert.ok(requestedUrls.some((url) => url.includes("/geode-py/ws/studies/OSD-575/download")));

    const saved = await fs.readFile(path.join(outputDir, fileName));
    assert.equal(sha256(saved), expectedDigest);
    const report = JSON.parse(await fs.readFile(path.join(outputDir, "pilot-report.json"), "utf8"));
    assert.equal(report.trace_contract.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(report.observed.participant_count, 4);
    assert.equal(report.analysis_gate.data_pipeline_completed, true);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
