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
        runNumber: 4,
        runId: 43596179113,
        auditedAt: "2026-11-14T12:43:13.791Z",
        decision: "INSUFFICIENT_EVIDENCE",
        metadataVerified: true,
        transformedFileReferencedInMetadata: true,
        catalogHttpStatus: 200,
        catalogHits: 0,
        catalogTotalHits: 1,
        catalogReturnedStudyCount: 0,
        csvDownloaded: false,
        fileSha256: null,
        note: "This is the last live data-access audit (run #4): its versioned paginated catalog request returned no file record or download URL. The current main branch adds two documented bare-endpoint fallbacks, but that updated lookup has not yet been executed live. No measurements were downloaded or analyzed."
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
        evidenceStatus: "METADATA_VERIFIED_FILE_NOT_RETRIEVED",
        statusLabel: "File access blocked",
        accessNote: "Study metadata is verified; the versioned file catalog returned zero file records. No CSV values or file hash are available.",
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
        evidenceStatus: "PUBLIC_PROTOCOL_RESTRICTED_MEASUREMENTS",
        statusLabel: "Timetable public · ECG/BP restricted",
        accessNote: "NASA\u0027s NLSP record lists one open-access collection-timetable spreadsheet and restricted-access ECG, blood-pressure and related variables. NASA\u0027s EDOMP report describes 12 astronauts; raw measurement data have not been retrieved or approved for ASTRA.",
        role: "Best-matched in-flight HR/BP candidate · access verification required",
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
