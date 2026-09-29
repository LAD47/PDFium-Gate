'use strict';

const assert = require('assert/strict');
const {
  normalizeVaultPath,
  safeFilenamePart,
  suggestedEmailPdfPath,
  suggestedEmailPdfPathInFolder,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath
} = require('../src/email-import/runtime/target-path-policy');

function existingSet(values) {
  const set = new Set(values || []);
  return path => set.has(path);
}

assert.equal(normalizeVaultPath('\\Folder\\Mail.pdf'), 'Folder/Mail.pdf');
assert.equal(normalizeVaultPath('/Folder/Mail.pdf/'), 'Folder/Mail.pdf');

assert.equal(safeFilenamePart('  A:B?C  ', 'email'), 'A B C');
assert.equal(safeFilenamePart('CON', 'email'), '_CON');
assert.equal(safeFilenamePart('...', 'fallback'), 'fallback');

const emailDocument = {
  message: {
    subject: 'Quarterly report',
    dateTime: { iso: '2026-09-29T07:00:00.000Z' }
  }
};
assert.equal(
  suggestedEmailPdfPath(emailDocument, existingSet([])),
  'Email Imports/2026-09-29 - Quarterly report.pdf'
);
assert.equal(
  suggestedEmailPdfPath(emailDocument, existingSet([
    'Email Imports/2026-09-29 - Quarterly report.pdf',
    'Email Imports/2026-09-29 - Quarterly report (2).pdf'
  ])),
  'Email Imports/2026-09-29 - Quarterly report (3).pdf'
);
assert.equal(
  suggestedEmailPdfPathInFolder(emailDocument, 'Cases/2026', existingSet([])),
  'Cases/2026/2026-09-29 - Quarterly report.pdf'
);
assert.equal(
  suggestedEmailPdfPathInFolder(emailDocument, '', existingSet([])),
  '2026-09-29 - Quarterly report.pdf'
);
assert.equal(
  suggestedEmailPdfPathInFolder(emailDocument, 'Cases/2026', existingSet([
    'Cases/2026/2026-09-29 - Quarterly report.pdf'
  ])),
  'Cases/2026/2026-09-29 - Quarterly report (2).pdf'
);

const attachment = { filename: 'supporting-document.pdf' };
assert.equal(
  suggestedAttachmentPdfPath('Email Imports/parent.pdf', attachment, existingSet([])),
  'Email Imports/supporting-document.pdf'
);
assert.equal(
  suggestedAttachmentPdfPath('Email Imports/parent.pdf', attachment, existingSet([
    'Email Imports/supporting-document.pdf'
  ])),
  'Email Imports/supporting-document (2).pdf'
);
assert.equal(
  suggestedAttachmentPdfPath('parent.pdf', { filename: 'appendix' }, existingSet([])),
  'appendix.pdf'
);

assert.deepEqual(
  validateTargetPdfPath('Email Imports/new.pdf', existingSet([])),
  { ok: true, path: 'Email Imports/new.pdf' }
);
assert.equal(validateTargetPdfPath('Email Imports/new.txt', existingSet([])).ok, false);
assert.equal(validateTargetPdfPath('../new.pdf', existingSet([])).ok, false);
assert.equal(validateTargetPdfPath('.pdf-metadata/new.pdf', existingSet([])).ok, false);
assert.equal(validateTargetPdfPath('File Metadata/new.pdf', existingSet([])).ok, false);
assert.equal(validateTargetPdfPath('Email Imports/existing.pdf', existingSet(['Email Imports/existing.pdf'])).ok, false);

console.log('Email Import target-path policy OK: normalization, same-folder drop suggestions, safe filenames, deterministic unique allocation and fail-closed target validation verified.');
