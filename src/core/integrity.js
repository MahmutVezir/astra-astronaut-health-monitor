"use strict";

const crypto = require("node:crypto");

function sha256(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("sha256 expects a Buffer");
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function verifySha256(buffer, expectedSha256) {
  const actualSha256 = sha256(buffer);
  if (expectedSha256 === null || expectedSha256 === undefined || expectedSha256 === "") {
    return { actualSha256, expectedSha256: null, verified: false, matches: null };
  }
  if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new TypeError("expectedSha256 must be a 64-character hexadecimal digest");
  }
  return {
    actualSha256,
    expectedSha256: expectedSha256.toLowerCase(),
    verified: true,
    matches: actualSha256 === expectedSha256.toLowerCase()
  };
}

module.exports = { sha256, verifySha256 };
