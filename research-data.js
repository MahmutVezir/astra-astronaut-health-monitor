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
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
