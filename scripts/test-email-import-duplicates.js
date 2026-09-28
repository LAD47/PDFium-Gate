'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { detectExactSourceDuplicate, normalizeLookupMatches } = require('../src/email-import/integrity/duplicate-detector');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test', 'fixtures', 'email');
const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'expected.json'), 'utf8'));

function readFixture(filename) {
  return fs.readFileSync(path.join(fixtureRoot, filename));
}

(async () => {
  const existingDocument = {
    documentId: 'synthetic-existing-document-1',
    documentPath: 'Imported/Plain text test.pdf'
  };

  const plainBytes = readFixture('plain-text.eml');
  const plainHash = expected.sourceHashes['plain-text.eml'];
  let observedLookupHash = null;

  const exactDuplicate = await detectExactSourceDuplicate({
    sourceBytes: plainBytes,
    findBySourceSha256: async sourceSha256 => {
      observedLookupHash = sourceSha256;
      return sourceSha256 === plainHash ? [existingDocument] : [];
    }
  });

  assert.equal(observedLookupHash, plainHash, 'lookup receives SHA-256 of untouched source bytes');
  assert.equal(exactDuplicate.sourceSha256, plainHash, 'detector returns source SHA-256');
  assert.equal(exactDuplicate.exactDuplicate, true, 'identical source is detected as exact duplicate');
  assert.deepEqual(exactDuplicate.matches, [existingDocument], 'existing document identity is preserved for caller UX');

  const repeatedDuplicate = await detectExactSourceDuplicate({
    sourceBytes: Buffer.from(plainBytes),
    findBySourceSha256: async sourceSha256 => sourceSha256 === plainHash ? [existingDocument] : []
  });
  assert.equal(repeatedDuplicate.sourceSha256, exactDuplicate.sourceSha256, 'same bytes produce stable duplicate identity');
  assert.equal(repeatedDuplicate.exactDuplicate, true, 'second import of same bytes is detected');

  const differentBytes = readFixture('norwegian-utf8.eml');
  const differentResult = await detectExactSourceDuplicate({
    sourceBytes: differentBytes,
    findBySourceSha256: async sourceSha256 => sourceSha256 === plainHash ? [existingDocument] : []
  });
  assert.equal(differentResult.sourceSha256, expected.sourceHashes['norwegian-utf8.eml'], 'different source gets its own SHA-256');
  assert.equal(differentResult.exactDuplicate, false, 'different source bytes are not exact duplicates');
  assert.deepEqual(differentResult.matches, [], 'non-duplicate has no exact matches');

  // Same logical message content can be exported with different bytes. Exact
  // duplicate detection must remain byte-based rather than Message-ID-based.
  const byteVariant = Buffer.concat([plainBytes, Buffer.from('\r\n')]);
  const logicalVariantResult = await detectExactSourceDuplicate({
    sourceBytes: byteVariant,
    findBySourceSha256: async sourceSha256 => sourceSha256 === plainHash ? [existingDocument] : []
  });
  assert.notEqual(logicalVariantResult.sourceSha256, plainHash, 'byte variant has a different SHA-256');
  assert.equal(logicalVariantResult.exactDuplicate, false, 'same logical message with different bytes is not an exact duplicate');

  assert.deepEqual(normalizeLookupMatches(null), [], 'null lookup result normalizes to no matches');
  assert.deepEqual(normalizeLookupMatches(undefined), [], 'undefined lookup result normalizes to no matches');
  assert.throws(() => normalizeLookupMatches(existingDocument), /must resolve to an array/, 'ambiguous single-object lookup contract fails closed');

  await assert.rejects(
    detectExactSourceDuplicate({ sourceBytes: plainBytes, findBySourceSha256: null }),
    /must be a function/,
    'missing lookup dependency is rejected'
  );

  console.log('Email Import exact duplicate detection OK: identical source bytes match by SHA-256, different bytes do not, and existing-document matches remain available to caller policy.');
})().catch(error => {
  console.error('Email Import exact duplicate detection check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
