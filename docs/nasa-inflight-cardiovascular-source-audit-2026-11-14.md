# NASA in-flight cardiovascular source audit

**Review date:** 14 November 2026  
**Purpose:** Identify flight-relevant cardiovascular research sources for ASTRA without confusing protocol descriptions, catalogue metadata, and downloadable physiological measurements.

## Executive finding

NASA's historical cardiovascular reports describe several studies with real in-flight ECG, heart-rate, and arterial-pressure measurements. They are scientifically relevant to ASTRA, but the available evidence is not uniform. Some records are only protocol descriptions, one NLSP record exposes a timetable while marking the physiological variables as restricted, and the public index entry for DSO 470 still needs an exact file-level audit.

**No raw ECG, heart-rate, or blood-pressure files from the sources below have been downloaded or integrated by this audit.** The entries in `research-data.js` are source-status cards, not measured observations.

## Source-by-source findings

### DSO 602 — Blood Pressure Variability During Space Flight

NASA's Extended Duration Orbiter Medical Project (EDOMP) report describes DSO 602 as an in-flight arterial-pressure and Holter-monitoring study involving **12 astronauts** on missions lasting **4–14 days**. For 24-hour periods before, during, and after flight, the ECG was recorded continuously with a Holter monitor. Blood pressure was measured automatically every **20 minutes while awake** and every **30 minutes during sleep**.

The NLSP Continuous Blood Pressure Device hardware record lists “Blood Pressure Variability During Space Flight” as an associated experiment under **DSO 602**. However, that hardware page is not an experiment-specific data record and does not establish that a DSO 602 measurement file is publicly downloadable. The exact DSO 602 detail record and file inventory remain unresolved.

**ASTRA status:** high-priority in-flight HR/BP candidate; do not ingest until the exact DSO 602 record, file, license/access terms, and schema have been verified.

### NLSP Experiment 3.1.2 — Studies of Mechanisms Underlying Orthostatic Intolerance

This is a **separate NLSP experiment**, explicitly identified on its detail page as **3.1.2**. It is part of the NASA-Mir Program and lists STS-71 and Mir 18. Its protocol also includes a 24-hour ECG and blood-pressure monitoring objective: continuous Holter ECG, with automatic blood-pressure readings every 20 minutes while awake and every 30 minutes while asleep.

The NLSP record lists:
- **One open-access file:** a data-collection timetable spreadsheet for experiment 3.1.2.
- **Seven restricted-access variable groups**, including blood pressure and ECG, along with catecholamines, neck pressure, renin, respiration, and Valsalva pressure.

The timetable describes collection sessions and protocol context; it is not the underlying physiological time series. This record must not be represented in ASTRA as DSO 602 or as an accessible ECG/BP dataset.

**ASTRA status:** suitable for a public-protocol/timetable ingestion test after its exact file URL, license, bytes, and schema are checked. Physiological measurements remain restricted in the retrieved NLSP listing.

### DSO 603 — Orthostatic Function During Entry, Landing and Egress

NASA's EDOMP report describes a separate event-phase study. It reports **34 subjects** and an instrumentation design in which ECG was recorded continuously while heart rate and arterial pressure were determined at **two-minute intervals**. The measurements concern preflight and in-flight/entry/landing/egress conditions, rather than a continuous 24-hour baseline stream.

The STS-42 NLSP mission record lists DSO 603 among its experiments. That mission-level index entry does not by itself establish a downloadable DSO 603 data file, the complete cohort coverage, or reuse terms.

**ASTRA status:** promising event-phase candidate; exact experiment record and file-level access remain unverified.

### DSO 470 — Space Adaptation Syndrome and cerebral blood velocity

The NLSP public experiment index lists DSO 470 with STS-29, STS-34 and STS-42, and lists heart rate, diastolic blood pressure, and cerebral artery blood-flow velocity among the variables. The index describes the data as complete and publicly available. NASA's earlier DSO status report also records a completed study.

The exact experiment-specific data file, its structure, sampling cadence, cohort coverage, and license have not been audited here.

**ASTRA status:** in-flight cerebral-hemodynamics candidate; do not ingest from the index alone.

### DSO 463 — In-flight Holter Monitoring

NASA's later EDOMP review describes 24-hour Holter recordings before, during, and after flight on **five crew members**. An earlier 1988–1990 DSO status report recorded one subject as completed at that time. These are reports from different dates and should be retained as dated status evidence rather than collapsed into one undocumented number. No public raw Holter file has been identified by this review.

**ASTRA status:** useful historical protocol and literature context; no verified data file.

## Why the source identities matter

The DSO 602 hardware record and the NLSP 3.1.2 experiment page are linked by overlapping cardiovascular hardware and a similar 24-hour monitoring protocol, but they are not the same experiment. The 3.1.2 record explicitly carries its own experiment ID, NASA-Mir program designation, mission list, data inventory, and access sections. ASTRA therefore stores them as two different source records:

- `DSO-602` points to the NLSP hardware record that identifies the associated DSO 602 experiment.
- `NLSP-3.1.2` points to the experiment-specific NLSP record and retains its actual ID and access description.

A shared device or similar protocol is not sufficient evidence to merge two study identities.

## Recommended acquisition sequence

1. Retrieve and inspect the public 3.1.2 collection-timetable file. It can validate NLSP file acquisition and document scheduled versus actual collection sessions, but must not be treated as physiological measurements.
2. Locate the exact DSO 602 experiment record and determine whether any authorized downloadable data product exists.
3. Audit the exact DSO 603 experiment record and its files.
4. Resolve the DSO 470 experiment-specific file inventory and reuse terms.
5. Continue with BRSMACT and BRSMCF file-level audits for sleep and cardiovascular-function research context.
6. Keep the OSD-575 updated three-route catalog lookup as a separate, not-yet-live-verified task.

No restricted-access request should be bypassed. If data require approval, use the portal's legitimate request process and record the decision.

## Sources

- NASA EDOMP report, *Cardiovascular Deconditioning* (DSO 463, 602, 603 study designs, sample counts, and measurement cadence): https://ntrs.nasa.gov/citations/20040201532
- NLSP Continuous Blood Pressure Device hardware record (associated experiments include DSO 602): https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000561?dataType=HARDWARE
- NLSP Experiment 3.1.2 detail record (explicit ID, methods, open timetable, restricted variable groups): https://nlsp.nasa.gov/search/data/details/f8e3f755-5caa-522c-b628-7153cfe446f5?dataType=EXPERIMENTS
- NLSP STS-42 mission record (lists DSO 603 among mission experiments): https://nlsp.nasa.gov/search/data/details/IDP-LSDA_MISSION-0000000000000326?dataType=MISSIONS
- NLSP public experiment index (DSO 470): https://nlsp.nasa.gov/explore
- NASA 1988–1990 DSO status report (dated status of DSO 463 and DSO 470): https://ntrs.nasa.gov/api/citations/20240013498/downloads/DSOs%201988-1990.pdf
