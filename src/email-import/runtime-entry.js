'use strict';

const { parseEml } = require('./parsers/eml-parser');
const { parseMsg } = require('./parsers/msg-parser');
const { sha256Hex } = require('../core/integrity/sha256');
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
const { runAutomaticEmailAttachmentExport, runPlannedEmailAttachmentExport } = require('./runtime/export-email-attachments-controller');
const { runEmailImport } = require('./runtime/import-email-controller');
const {
  attachmentFolderPath,
  buildEmailAttachmentPlan,
  finalizeEmailAttachmentPlan,
  manifestFromPlan
} = require('./runtime/email-attachment-plan');
const { generateEmailPdf, validateGeneratedPdf } = require('./render/email-pdf-generator');
const { EMAIL_ATTACHMENT_PROTOCOL_ACTION } = require('./render/email-html-renderer');
const { analyzeEmailAttachments } = require('./attachments/attachment-policy');
const { verifiedAttachmentBytes, verifiedPdfAttachmentBytes } = require('./attachments/attachment-extraction');
const {
  parseEmailAttachmentProtocolUri,
  pointInsideAnnotationRect,
  resolveEmailAttachmentPdfLink
} = require('./attachments/pdf-link-hit-test');
const {
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan
} = require('./metadata/email-metadata-projection');
const {
  attachmentWikilink,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths,
  normalizeResolvedEmailAttachmentLinkTargets
} = require('./metadata/email-attachment-links');

module.exports = {
  parseEml,
  parseMsg,
  sha256Hex,
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
  runPlannedEmailAttachmentExport,
  runEmailImport,
  attachmentFolderPath,
  buildEmailAttachmentPlan,
  finalizeEmailAttachmentPlan,
  manifestFromPlan,
  generateEmailPdf,
  validateGeneratedPdf,
  EMAIL_ATTACHMENT_PROTOCOL_ACTION,
  analyzeEmailAttachments,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes,
  parseEmailAttachmentProtocolUri,
  pointInsideAnnotationRect,
  resolveEmailAttachmentPdfLink,
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan,
  attachmentWikilink,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths,
  normalizeResolvedEmailAttachmentLinkTargets
};
