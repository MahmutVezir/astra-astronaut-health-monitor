#!/usr/bin/env node
"use strict";

const { runOsd575Pilot } = require("../src/core/osd575-pilot.js");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error(
      'Usage: node scripts/run-osd575-pilot.js --file "EXACT_OSDR_FILENAME.csv" ' +
      '--participant-column "HEADER" --sample-column "HEADER" --timepoint-column "HEADER" ' +
      '--measurement-columns "HEADER_1|HEADER_2" [--expected-sha256 "64_HEX_CHARS"]'
    );
  }

  const columnMap = {
    participant: args["participant-column"],
    sample: args["sample-column"],
    timepoint: args["timepoint-column"],
    measurement: args["measurement-columns"]
      ? args["measurement-columns"].split("|").map((value) => value.trim()).filter(Boolean)
      : []
  };

  const record = await runOsd575Pilot({
    fileName: args.file,
    columnMap,
    expectedSha256: args["expected-sha256"] || null
  });

  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  if (record.decision === "INVALID_DATA") process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
