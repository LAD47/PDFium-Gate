'use strict';

const { parseEml } = require('./parsers/eml-parser');
const { parseMsg } = require('./parsers/msg-parser');
const { detectExactSourceDuplicate } = require('./integrity/duplicate-detector');
const {
  retainOriginalSource,
  removeRetainedSourceIfExact
} = require('./storage/source-retention');
const { generateEmailPdf, validateGeneratedPdf } = require('./render/email-pdf-generator');
const { analyzeEmailAttachments } = require('./attachments/attachment-policy');
const {
  buildEmailImportRecordValues,
  buildEmailImportRegistrationPlan
} = require('./metadata/email-metadata-projection');

module.exports = {
  parseEml,
  parseMsg,
  detectExactSourceDuplicate,
  retainOriginalSource,
  removeRetainedSourceIfExact,
  generateEmailPdf,
  validateGeneratedPdf,
  analyzeEmailAttachments,
  buildEmailImportRecordValues,
  buildEmailImportRegistrationPlan
};
