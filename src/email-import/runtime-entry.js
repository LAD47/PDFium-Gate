'use strict';

const { parseEml } = require('./parsers/eml-parser');
const { parseMsg } = require('./parsers/msg-parser');
const { detectExactSourceDuplicate } = require('./integrity/duplicate-detector');
const {
  retainOriginalSource,
  readVerifiedRetainedSource,
  removeRetainedSourceIfExact
} = require('./storage/source-retention');
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
  generateEmailPdf,
  validateGeneratedPdf,
  analyzeEmailAttachments,
  verifiedPdfAttachmentBytes,
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan
};
