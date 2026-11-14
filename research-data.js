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
        note: "The NASA metadata response names the transformed HDCVD9 CSV, but the versioned file-catalog response contains no file record or download URL. No measurements were downloaded or analyzed."
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
