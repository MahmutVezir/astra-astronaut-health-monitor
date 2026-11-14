(function (root) {
  "use strict";

  root.AstraResearch = {
    inspiration4: {
      studyId: "OSD-575",
      datasetVersion: "3",
      title: "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays",
      missionDurationDays: 3,
      missionPeriod: "16–18 September 2021",
      participantCount: 4,
      sampleCountListed: 28,
      license: "CC0-1.0",
      doi: "10.26030/mc5d-p710",
      assay: "Eve Technologies Panel HDCVD9",
      measurementContext: "Human serum multiplex immunoassay; transformed assay values, not continuous vital-sign telemetry.",
      evidenceData: {
        csvPath: "./data/osdr/OSD-575/LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
        metadataPath: "./data/osdr/OSD-575/isa-sample-map.json",
        auditPath: "./data/osdr/OSD-575/source-audit.json",
        sha256: "fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c",
        byteLength: 6207,
        expectedRows: 28,
        expectedColumns: 19,
        expectedParticipants: 4,
        expectedTimepoints: 7,
        expectedConcentrationMarkers: 9
      },
      timepoints: [
        { label: "L−92", phase: "Pre-flight" },
        { label: "L−44", phase: "Pre-flight" },
        { label: "L−3", phase: "Pre-flight" },
        { label: "R+1", phase: "Post-flight" },
        { label: "R+45", phase: "Post-flight" },
        { label: "R+82", phase: "Post-flight" },
        { label: "R+194", phase: "Post-flight" }
      ],
      acquisitionAudit: {
        runNumber: 9,
        runId: 43612460864,
        auditedAt: "2026-11-14T15:52:10Z",
        decision: "LIMITED_EVIDENCE",
        metadataVerified: true,
        transformedFileReferencedInMetadata: true,
        catalogHttpStatus: 200,
        catalogHits: 1,
        catalogTotalHits: 1,
        catalogReturnedStudyCount: 1,
        catalogFileFound: true,
        catalogFileSizeBytes: 6207,
        catalogFileRestricted: false,
        catalogLookupForm: "VERSIONED_DOCUMENTED_BARE_ENDPOINT",
        csvDownloaded: true,
        fileSha256: "fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c",
        byteLength: 6207,
        analysisCompleted: true,
        note: "Live run #9 (GitHub Actions run 43612460864) downloaded the exact public HDCVD9 transformed CSV (6,207 bytes), verified the project-maintained SHA-256 pin, joined all 28 CSV sample names one-to-one to the NASA ISA sample table, and passed baseline normalization checks for nine analytes. The cohort contains four independent participants and seven collection timepoints. The scientific decision remains LIMITED_EVIDENCE because raw assay data are unavailable and the participant count is small; fibrinogen remains flagged for assay-suitability review."
      },
      source: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"
    },
    sources: [
      {
        id: "OSD-575",
        name: "Inspiration4 serum biomarker study",
        provider: "NASA OSDR / ALSDA",
        environment: "Commercial spaceflight · human biospecimens",
        domain: "Immune and cardiovascular-related serum proteins",
        measures: ["HDCVD9 multiplex assay", "Transformed serum measurements"],
        evidenceStatus: "VERIFIED_FILE_METADATA_AND_NORMALIZATION",
        statusLabel: "File, map + normalization verified",
        accessNote: "Live audit run #9 (GitHub Actions run 43612460864) retrieved and preserved the exact 6,207-byte HDCVD9 transformed CSV. The project-maintained SHA-256 pin matches; all 28 sample names join one-to-one to NASA ISA metadata for four participants across seven collection timepoints; and all nine concentration/percentage pairs pass the baseline-normalization audit. Results remain LIMITED_EVIDENCE: these are transformed serum assay measurements, not continuous vital-sign telemetry, and raw assay data are unavailable. Fibrinogen is retained for traceability but flagged because the vendor's serum suitability statement conflicts with the column label.",
        role: "Primary spaceflight research source",
        url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"
      },
      {
        id: "BRSMACT_Campaign_1_Actigraphy",
        name: "UTMB Bedrest Campaign 1 Actigraphy",
        provider: "NASA Life Sciences Portal (NLSP)",
        environment: "Ground-based head-down bed-rest analogue",
        domain: "Sleep and circadian research",
        measures: ["Sleep duration", "Sleep latency", "Sleep efficiency"],
        evidenceStatus: "PUBLIC_LISTING_FILE_QA_PENDING",
        statusLabel: "Public listing · file QA pending",
        accessNote: "NLSP lists this processed dataset as available online with three files. The reported values are campaign-level processed actigraphy summaries, not live astronaut telemetry.",
        role: "Priority next dataset for sleep evidence",
        url: "https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS"
      },
      {
        id: "BRSMCF",
        name: "Bed Rest Standard Measures: Cardiovascular Function",
        provider: "NASA Life Sciences Portal (NLSP)",
        environment: "Ground-based head-down bed-rest / artificial-gravity analogues",
        domain: "Cardiovascular structure and function",
        measures: ["Echocardiography-derived cardiac function", "Stroke volume", "Ejection fraction"],
        evidenceStatus: "PUBLIC_DATASETS_LISTED_FILE_QA_PENDING",
        statusLabel: "14 public datasets listed · file QA pending",
        accessNote: "NLSP lists 14 open-access datasets, including processed CFT70 cardiac-function and UTMB echocardiography collections. These are research assessments, not continuous heart-rate streams.",
        role: "Priority next dataset for cardiovascular research context",
        url: "https://nlsp.nasa.gov/search/data/details/9af6f9ba-3730-54ab-a82a-1a32798667ae?dataType=EXPERIMENTS"
      },
      {
        id: "DSO-602",
        name: "In-flight arterial pressure and Holter monitoring",
        provider: "NASA Life Sciences Portal (NLSP) / NASA EDOMP",
        environment: "Shuttle spaceflight · 4–14-day missions",
        domain: "In-flight cardiovascular monitoring",
        measures: ["Continuous 24-hour ECG / Holter", "Heart rate and rhythm", "Automated blood pressure every 20 min awake / 30 min asleep"],
        evidenceStatus: "HISTORICAL_PROTOCOL_DOCUMENTED_DETAIL_PENDING",
        statusLabel: "NASA study documented · detail pending",
        accessNote: "NASA\u0027s EDOMP report documents 12 astronauts and continuous 24-hour Holter ECG with automated BP every 20 minutes while awake and 30 minutes during sleep. The NLSP hardware index lists Blood Pressure Variability During Space Flight as DSO 602, but its experiment-specific data record and file inventory have not yet been located. Do not confuse it with the separate NLSP experiment 3.1.2.",
        role: "High-priority in-flight HR/BP candidate · exact record required",
        url: "https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000561?dataType=HARDWARE"
      },
      {
        id: "NLSP-3.1.2",
        name: "Orthostatic intolerance mechanisms · ambulatory monitoring and baroreflex",
        provider: "NASA Life Sciences Portal (NLSP) / NASA-Mir Program",
        environment: "STS-71 and Mir 18 · long-duration spaceflight research",
        domain: "Cardiovascular and pulmonary physiology",
        measures: ["Continuous 24-hour ECG / Holter", "Heart rate and rhythm", "Automated BP every 20 min awake / 30 min asleep", "Baroreflex and Valsalva measurements"],
        evidenceStatus: "OPEN_TIMETABLE_RESTRICTED_PHYSIOLOGY_VARIABLES",
        statusLabel: "One timetable public · ECG/BP restricted",
        accessNote: "This is experiment 3.1.2, not DSO 602. Its NLSP record lists one open-access data-collection timetable and seven restricted-access variable groups, including blood pressure and ECG. The record describes continuous Holter ECG and automated BP sampling; no raw physiological values have been retrieved for ASTRA.",
        role: "Public protocol/timetable audit · measurements require authorized access",
        url: "https://nlsp.nasa.gov/search/data/details/f8e3f755-5caa-522c-b628-7153cfe446f5?dataType=EXPERIMENTS"
      },
      {
        id: "DSO-603",
        name: "Orthostatic function during entry, landing and egress",
        provider: "NASA EDOMP / NASA Life Sciences Portal (NLSP)",
        environment: "Shuttle launch, entry, landing and post-landing phases",
        domain: "Event-specific cardiovascular response",
        measures: ["Continuous ECG", "Heart rate and arterial pressure at 2-minute intervals", "Systolic / diastolic / mean arterial pressure and pulse pressure"],
        evidenceStatus: "HISTORICAL_STUDY_DOCUMENTED_FILES_UNVERIFIED",
        statusLabel: "34-subject study · files unverified",
        accessNote: "NASA\u0027s EDOMP report documents 34 subjects and two-minute HR/arterial-pressure intervals around launch, entry and landing. This is phase-specific monitoring, not continuous 24-hour crew telemetry. Exact data files, access terms and schema have not been verified.",
        role: "Event-phase HR/BP candidate · file-level audit pending",
        url: "https://nlsp.nasa.gov/search/data/details/IDP-LSDA_MISSION-0000000000000326?dataType=MISSIONS"
      },
      {
        id: "DSO-470",
        name: "Space Adaptation Syndrome and cerebral blood velocity",
        provider: "NASA Life Sciences Portal (NLSP)",
        environment: "Shuttle flights · STS-29, STS-34 and STS-42",
        domain: "In-flight cardiovascular / cerebral blood-flow physiology",
        measures: ["Heart rate", "Diastolic blood pressure", "Cerebral artery blood-flow velocity"],
        evidenceStatus: "PUBLIC_INDEX_CANDIDATE_DETAIL_QA_PENDING",
        statusLabel: "Public index candidate · detail QA pending",
        accessNote: "The NLSP experiment index marks the data as complete and publicly available and lists heart rate and diastolic blood pressure. The exact study record and downloadable file listing still require verification before ingestion.",
        role: "Highest-priority in-flight cardiovascular data candidate",
        url: "https://nlsp.nasa.gov/explore"
      }
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
