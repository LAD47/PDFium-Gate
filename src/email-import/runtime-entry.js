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
  suggestedEmailPdfPathInFolder,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath
} = require('./runtime/target-path-policy');
const { runEmailPdfAttachmentImport } = require('./runtime/import-pdf-attachment-controller');
const { runAutomaticEmailAttachmentExport } = require('./runtime/export-email-attachments-controller');
const { runEmailImport } = require('./runtime/import-email-controller');
const { generateEmailPdf, validateGeneratedPdf } = require('./render/email-pdf-generator');
const { analyzeEmailAttachments } = require('./attachments/attachment-policy');
const { verifiedAttachmentBytes, verifiedPdfAttachmentBytes } = require('./attachments/attachment-extraction');
const {
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan
} = require('./metadata/email-metadata-projection');
const {
  attachmentWikilink,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths
} = require('./metadata/email-attachment-links');

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
  suggestedEmailPdfPathInFolder,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath,
  runEmailPdfAttachmentImport,
  runAutomaticEmailAttachmentExport,
  runEmailImport,
  generateEmailPdf,
  validateGeneratedPdf,
  analyzeEmailAttachments,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes,
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan,
  attachmentWikilink,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths
};
