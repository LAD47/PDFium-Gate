'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { retainOriginalSource } = require('../src/email-import/storage/source-retention');
const {
  sourceDescriptorFromEmailImportRecord,
  loadCanonicalEmailFromRetainedRecord
} = require('../src/email-import/runtime/retained-source-loader');

const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'test', 'fixtures', 'email', 'plain-text.eml');

function recordValuesFromDocument(document) {
  return {
    email_import_source_format: document.source.format,
    email_import_source_sha256: document.source.sha256,
    email_import_source_byte_size: document.source.byteSize,
    email_import_original_filename: document.source.originalFilename,
    email_import_source_retained: document.source.retained,
    email_import_retained_path: document.source.retainedPath
  };
}

(async () => {
  const sourceBytes = fs.readFileSync(fixturePath);
  const parsed = await parseEml({ sourceBytes, originalFilename: 'plain-text.eml' });
  const vaultRootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfium-email-loader-'));

  try {
    const retained = await retainOriginalSource({
      document: parsed,
      sourceBytes,
      vaultRootPath,
      enabled: true
    });
    const values = recordValuesFromDocument(retained.document);

    const descriptor = sourceDescriptorFromEmailImportRecord(values);
    assert.equal(descriptor.format, 'eml');
    assert.equal(descriptor.sha256, parsed.source.sha256);
    assert.equal(descriptor.byteSize, sourceBytes.length);
    assert.equal(descriptor.retained, true);
    assert.equal(descriptor.retainedPath, retained.retainedPath);

    const loaded = await loadCanonicalEmailFromRetainedRecord({ values, vaultRootPath });
    assert.equal(loaded.source.sha256, parsed.source.sha256, 'recorded source identity preserved');
    assert.equal(loaded.retainedSource.retainedPath, retained.retainedPath, 'canonical retained path returned');
    assert.ok(loaded.retainedSource.bytes.equals(sourceBytes), 'retained bytes remain byte-identical');
    assert.equal(loaded.document.source.sha256, parsed.source.sha256, 'reparsed canonical document preserves exact source SHA');
    assert.equal(loaded.document.message.subject, parsed.message.subject, 'reparsed canonical document preserves message content');

    await assert.rejects(
      () => loadCanonicalEmailFromRetainedRecord({
        values: { ...values, email_import_source_retained: false, email_import_retained_path: '' },
        vaultRootPath
      }),
      /not retained/i,
      'later source-backed actions fail clearly when the original source was not retained'
    );

    assert.throws(
      () => sourceDescriptorFromEmailImportRecord({ ...values, email_import_source_sha256: 'not-a-sha' }),
      /provenance metadata is incomplete or invalid/i,
      'invalid provenance metadata fails before filesystem access'
    );

    const retainedAbsolute = path.join(vaultRootPath, ...retained.retainedPath.split('/'));
    await fs.promises.writeFile(retainedAbsolute, Buffer.from('tampered retained source'));
    await assert.rejects(
      () => loadCanonicalEmailFromRetainedRecord({ values, vaultRootPath }),
      /byte length mismatch|SHA-256 mismatch/i,
      'tampered retained source fails closed before reparsing'
    );
  } finally {
    await fs.promises.rm(vaultRootPath, { recursive: true, force: true });
  }

  console.log('Email Import retained-source loader OK: provenance normalization, canonical path/SHA reread, canonical reparsing and fail-closed missing/tampered source behavior verified.');
})().catch(error => {
  console.error('Email Import retained-source loader check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
