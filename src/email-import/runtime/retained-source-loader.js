'use strict';

const path = require('path');
const { parseEml } = require('../parsers/eml-parser');
const { parseMsg } = require('../parsers/msg-parser');
const { readVerifiedRetainedSource } = require('../storage/source-retention');

const SHA256_RE = /^[0-9a-f]{64}$/;
const SOURCE_FORMATS = new Set(['eml', 'msg']);

function sourceDescriptorFromEmailImportRecord(values) {
  const source = values && typeof values === 'object' ? values : {};
  const format = String(source.email_import_source_format || '').toLowerCase();
  const sha256 = String(source.email_import_source_sha256 || '').toLowerCase();
  const byteSize = Number(source.email_import_source_byte_size);
  const originalFilename = String(source.email_import_original_filename || '').trim();
  const retainedPath = String(source.email_import_retained_path || '').trim();
  const retained = source.email_import_source_retained === true
    || String(source.email_import_source_retained).toLowerCase() === 'true';

  if (!SOURCE_FORMATS.has(format) || !SHA256_RE.test(sha256) || !Number.isInteger(byteSize) || byteSize < 0) {
    throw new Error('Email provenance metadata is incomplete or invalid.');
  }

  return {
    format,
    sha256,
    byteSize,
    originalFilename,
    retained,
    retainedPath
  };
}

async function loadCanonicalEmailFromRetainedRecord({ values, vaultRootPath }) {
  const source = sourceDescriptorFromEmailImportRecord(values);
  if (source.retained !== true || !source.retainedPath) {
    throw new Error('The email source was not retained.');
  }

  const retainedSource = await readVerifiedRetainedSource({ source, vaultRootPath });
  const originalFilename = source.originalFilename || path.basename(source.retainedPath);
  const document = source.format === 'eml'
    ? await parseEml({ sourceBytes: retainedSource.bytes, originalFilename })
    : await parseMsg({ sourceBytes: retainedSource.bytes, originalFilename });

  if (String(document?.source?.sha256 || '').toLowerCase() !== source.sha256) {
    throw new Error('Reparsed retained source no longer matches recorded source SHA-256.');
  }

  return {
    source,
    retainedSource,
    document
  };
}

module.exports = {
  sourceDescriptorFromEmailImportRecord,
  loadCanonicalEmailFromRetainedRecord
};
