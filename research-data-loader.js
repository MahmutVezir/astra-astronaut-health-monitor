(function (root) {
  "use strict";

  const TIMEPOINTS = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];
  const MARKER_LABELS = {
    a2_macroglobulin: "α2-Macroglobulin",
    agp: "Alpha-1-acid glycoprotein (AGP)",
    crp: "C-reactive protein (CRP)",
    fetuin_a36: "Fetuin A",
    fibrinogen: "Fibrinogen",
    haptoglobin: "Haptoglobin",
    l_selectin: "L-selectin",
    pf4: "Platelet factor 4 (PF4)",
    sap: "Serum amyloid P component (SAP)"
  };

  function parseCsv(input) {
    const source = String(input).replace(/^\uFEFF/, "");
    const grid = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"') {
          if (source[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && source[index + 1] === "\n") index += 1;
        row.push(field);
        field = "";
        if (row.some((value) => value !== "")) grid.push(row);
        row = [];
      } else {
        field += char;
      }
    }

    if (quoted) throw new Error("CSV contains an unterminated quoted field.");
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      if (row.some((value) => value !== "")) grid.push(row);
    }
    if (grid.length < 2) throw new Error("CSV must contain a header row and at least one data row.");

    const headers = grid.shift().map((value) => value.trim());
    if (headers.some((value) => !value) || new Set(headers).size !== headers.length) {
      throw new Error("CSV headers are blank or duplicated.");
    }
    const rows = grid.map((values, index) => {
      if (values.length !== headers.length) {
        throw new Error("CSV row " + (index + 2) + " has " + values.length + " columns; expected " + headers.length + ".");
      }
      return headers.reduce((result, header, column) => {
        result[header] = values[column];
        return result;
      }, {});
    });
    return { headers, rows };
  }

  function normalizeTimepoint(value) {
    const label = String(value || "").trim().replace(/\s+days?$/i, "");
    const launch = label.match(/^Launch minus (\d+)$/i);
    if (launch) return "L-" + launch[1];
    const returned = label.match(/^Return plus (\d+)$/i);
    if (returned) return "R+" + returned[1];
    if (/^L-\d+$/i.test(label)) return label.toUpperCase();
    if (/^R\+\d+$/i.test(label)) return "R+" + label.slice(2);
    return null;
  }

  async function digestSha256(bytes, cryptoImpl) {
    if (!cryptoImpl || !cryptoImpl.subtle || typeof cryptoImpl.subtle.digest !== "function") {
      throw new Error("This browser does not expose Web Crypto SHA-256; research measurements remain hidden.");
    }
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function loadOds575Evidence(options) {
    const config = options || {};
    const fetchImpl = config.fetchImpl || root.fetch;
    const cryptoImpl = config.cryptoImpl || root.crypto;
    const evidenceConfig = config.evidence || (root.AstraResearch && root.AstraResearch.inspiration4 && root.AstraResearch.inspiration4.evidenceData);
    if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable; the NASA source data could not be loaded.");

    const csvPath = config.csvPath || (evidenceConfig && evidenceConfig.csvPath);
    const metadataPath = config.metadataPath || (evidenceConfig && evidenceConfig.metadataPath);
    const expectedSha = config.expectedSha256 || (evidenceConfig && evidenceConfig.sha256);
    if (!csvPath || !metadataPath || !expectedSha) throw new Error("The verified OSD-575 source manifest is incomplete.");

    const responses = await Promise.all([
      fetchImpl(csvPath, { cache: "no-cache" }),
      fetchImpl(metadataPath, { cache: "no-cache" })
    ]);
    if (!responses[0] || !responses[0].ok) {
      throw new Error("The source HDCVD9 CSV could not be loaded (HTTP " + (responses[0] && responses[0].status || "unknown") + ").");
    }
    if (!responses[1] || !responses[1].ok) {
      throw new Error("The NASA ISA sample map could not be loaded (HTTP " + (responses[1] && responses[1].status || "unknown") + ").");
    }

    const sourceBuffer = await responses[0].arrayBuffer();
    const actualSha = await digestSha256(sourceBuffer, cryptoImpl);
    if (actualSha !== expectedSha) {
      throw new Error("Source integrity check failed: SHA-256 " + actualSha + " does not match the reviewed project pin.");
    }

    const metadata = await responses[1].json();
    if (!metadata || metadata.dataset_id !== "OSD-575" || String(metadata.dataset_version) !== "3" ||
        !Array.isArray(metadata.records) || metadata.records.length !== 28) {
      throw new Error("The NASA ISA sample map is not the expected OSD-575 Version 3, 28-sample map.");
    }

    const bytes = new Uint8Array(sourceBuffer);
    const csvText = new TextDecoder("utf-8").decode(bytes);
    const parsed = parseCsv(csvText);
    if (parsed.rows.length !== 28 || parsed.headers.length !== 19) {
      throw new Error("The HDCVD9 file shape differs from the reviewed 28-row, 19-column source.");
    }

    const sampleIndex = new Map();
    metadata.records.forEach((record) => {
      const sampleName = String(record.sample_name || "").trim();
      const participant = String(record.source_name || "").trim();
      const timepoint = normalizeTimepoint(record.time_label);
      if (!sampleName || !participant || !TIMEPOINTS.includes(timepoint) || sampleIndex.has(sampleName)) {
        throw new Error("The NASA ISA map contains an invalid or duplicate sample identifier.");
      }
      sampleIndex.set(sampleName, { participant, timepoint });
    });

    const seen = new Set();
    const mappedRows = parsed.rows.map((row, index) => {
      const sampleName = String(row["Sample Name"] || "").trim();
      const metadataRecord = sampleIndex.get(sampleName);
      if (!metadataRecord || seen.has(sampleName)) {
        throw new Error("CSV sample row " + (index + 1) + " cannot be uniquely joined to NASA ISA sample metadata.");
      }
      seen.add(sampleName);
      return Object.assign({}, row, {
        __participant: metadataRecord.participant,
        __timepoint: metadataRecord.timepoint
      });
    });
    if (seen.size !== 28 || sampleIndex.size !== 28) {
      throw new Error("The CSV and NASA ISA sample map do not have complete one-to-one sample coverage.");
    }

    const participantIds = Array.from(new Set(mappedRows.map((row) => row.__participant))).sort();
    const observedTimepoints = TIMEPOINTS.filter((timepoint) => mappedRows.some((row) => row.__timepoint === timepoint));
    if (participantIds.length !== 4 || observedTimepoints.length !== 7) {
      throw new Error("The mapped source does not contain the reviewed four participants and seven timepoints.");
    }
    participantIds.forEach((participant) => {
      const count = mappedRows.filter((row) => row.__participant === participant).length;
      if (count !== 7) throw new Error("Participant " + participant + " does not have exactly seven source samples.");
    });

    const concentrationColumns = parsed.headers.filter((header) =>
      /_concentration_(nanogram|picogram)_per_milliliter$/i.test(header)
    );
    if (concentrationColumns.length !== 9) {
      throw new Error("The HDCVD9 source does not expose the reviewed nine concentration columns.");
    }
    const baselineRows = mappedRows.filter((row) => row.__timepoint.startsWith("L-"));
    if (baselineRows.length !== 12) throw new Error("Expected 12 all-crew pre-flight samples for normalization.");

    const markers = concentrationColumns.map((concentrationColumn) => {
      const match = concentrationColumn.match(/^(.*)_concentration_(nanogram|picogram)_per_milliliter$/i);
      const markerId = match[1];
      const percentageColumn = markerId + "_percent";
      if (!parsed.headers.includes(percentageColumn)) {
        throw new Error("The normalized percentage column is missing for " + concentrationColumn + ".");
      }

      const concentrationValues = mappedRows.map((row) => Number(row[concentrationColumn]));
      const percentageValues = mappedRows.map((row) => Number(row[percentageColumn]));
      if (concentrationValues.some((value) => !Number.isFinite(value)) ||
          percentageValues.some((value) => !Number.isFinite(value))) {
        throw new Error("The source contains a non-numeric assay value for " + markerId + ".");
      }
      const baselineConcentrations = baselineRows.map((row) => Number(row[concentrationColumn]));
      const baselineMean = baselineConcentrations.reduce((sum, value) => sum + value, 0) / baselineConcentrations.length;
      if (!Number.isFinite(baselineMean) || baselineMean <= 0) {
        throw new Error("The pre-flight normalization denominator is invalid for " + markerId + ".");
      }
      const maxAbsoluteError = Math.max(...mappedRows.map((row) =>
        Math.abs(Number(row[percentageColumn]) - 100 * Number(row[concentrationColumn]) / baselineMean)
      ));
      if (maxAbsoluteError > 1e-6) {
        throw new Error("The baseline-percent normalization check failed for " + markerId + ".");
      }

      const byParticipant = {};
      participantIds.forEach((participant) => {
        byParticipant[participant] = observedTimepoints.map((timepoint) => {
          const row = mappedRows.find((item) => item.__participant === participant && item.__timepoint === timepoint);
          if (!row) throw new Error("A participant/timepoint pair is missing for " + participant + " " + timepoint + ".");
          return {
            timepoint,
            concentration: Number(row[concentrationColumn]),
            percentOfPreflightMean: Number(row[percentageColumn])
          };
        });
      });

      const byTimepoint = observedTimepoints.map((timepoint) => {
        const values = mappedRows.filter((row) => row.__timepoint === timepoint)
          .map((row) => Number(row[percentageColumn]));
        return {
          timepoint,
          n: values.length,
          mean: values.reduce((sum, value) => sum + value, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      });

      return {
        id: markerId,
        label: MARKER_LABELS[markerId] || markerId,
        concentrationColumn,
        percentageColumn,
        unit: match[2].toLowerCase() === "nanogram" ? "ng/mL" : "pg/mL",
        baselineMean,
        normalizationMaxAbsoluteError: maxAbsoluteError,
        flaggedForInterpretation: markerId === "fibrinogen",
        participants: byParticipant,
        byTimepoint
      };
    });

    const normalizationAudit = {
      status: "PASS",
      formula: "100 × concentration / mean concentration across all crew pre-flight samples",
      baselineSampleCount: baselineRows.length,
      analyteCount: markers.length,
      maxAbsoluteError: Math.max(...markers.map((marker) => marker.normalizationMaxAbsoluteError))
    };

    return {
      datasetId: "OSD-575",
      datasetVersion: "3",
      fileName: csvPath.split("/").pop(),
      fileBytes: bytes.byteLength,
      sha256: actualSha,
      rowCount: mappedRows.length,
      columnCount: parsed.headers.length,
      participantIds,
      timepoints: observedTimepoints,
      matchedSampleCount: seen.size,
      metadataSampleCount: sampleIndex.size,
      measurementCellCount: mappedRows.length * concentrationColumns.length,
      normalizationAudit,
      markers,
      excludedMarkerNote: "Fibrinogen is retained and auditable in the source file, but its biological interpretation is flagged because the current assay vendor documentation states it cannot be measured in serum. Do not use it for biological conclusions until the discrepancy is resolved."
    };
  }

  root.AstraResearchLoader = {
    parseCsv,
    normalizeTimepoint,
    loadOds575Evidence
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AstraResearchLoader;
})(typeof window !== "undefined" ? window : globalThis);
