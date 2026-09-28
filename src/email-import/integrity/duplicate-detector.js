'use strict';

const { sha256Hex, toBuffer } = require('./sha256');

function normalizeLookupMatches(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('findBySourceSha256 must resolve to an array, null, or undefined.');
  }
  return value.slice();
}

async function detectExactSourceDuplicate({ sourceBytes, findBySourceSha256 }) {
  if (typeof findBySourceSha256 !== 'function') {
    throw new TypeError('findBySourceSha256 must be a function.');
  }

  // Exact-source identity is established from the untouched source bytes,
  // before parsing, normalization, rendering, or PDF generation.
  const bytes = toBuffer(sourceBytes);
  const sourceSha256 = sha256Hex(bytes);
  const lookupResult = await findBySourceSha256(sourceSha256);
  const matches = normalizeLookupMatches(lookupResult);

  // This module reports duplicate facts only. User-facing policy belongs in
  // the Import Controller, which may open the existing document, cancel, or
  // deliberately continue with a second import.
  return {
    sourceSha256,
    exactDuplicate: matches.length > 0,
    matches
  };
}

module.exports = {
  detectExactSourceDuplicate,
  normalizeLookupMatches
};
