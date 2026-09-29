'use strict';

const { parseEml } = require('./parsers/eml-parser');
const { parseMsg } = require('./parsers/msg-parser');
const { detectExactSourceDuplicate } = require('./integrity/duplicate-detector');
const {
  retainOriginalSource,
  readVerifiedRetainedSource,
  removeRetainedSourceIfExact
} = require('./storage/source-retention');
const {
  sourceDescriptorFromEmailImportRecord,
  loadCanonicalEmailFromRetainedRecord
} = require('./runtime/retained-source-loader');
const {
  normalizeVaultPath,
  safeFilenamePart,
  suggestedEmailPdfPath,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath
} = require('./runtime/target-path-policy');
const { runEmailPdfAttachmentImport } = require('./runtime/import-pdf-attachment-controller');
const { generateEmailPdf, validateGeneratedPdf } = require('./render/email-pdf-generator');
const { analyzeEmailAttachments } = require('./attachments/attachment-policy');
const { verifiedPdfAttachmentBytes } = require('./attachments/attachment-extraction');
const {
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan
} = require('./metadata/email-metadata-projection');

module.exports = {
  parseEml,
  parseMsg,
  detectExactSourceDuplicate,
  retainOriginalSource,
  readVerifiedRetainedSource,
  removeRetainedSourceIfExact,
  sourceDescriptorFromEmailImportRecord,
  loadCanonicalEmailFromRetainedRecord,
  normalizeVaultPath,
  safeFilenamePart,
  suggestedEmailPdfPath,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath,
  runEmailPdfAttachmentImport,
  generateEmailPdf,
  validateGeneratedPdf,
  analyzeEmailAttachments,
  verifiedPdfAttachmentBytes,
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan
};
