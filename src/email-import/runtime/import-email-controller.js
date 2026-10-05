'use strict';

const path = require('path');
const { parseEml } = require('../parsers/eml-parser');
const { parseMsg } = require('../parsers/msg-parser');
const { detectExactSourceDuplicate } = require('../integrity/duplicate-detector');
const { retainOriginalSource, removeRetainedSourceIfExact } = require('../storage/source-retention');
const { suggestedEmailPdfPath, validateTargetPdfPath } = require('./target-path-policy');
const { generateEmailPdf } = require('../render/email-pdf-generator');
const { buildEmailImportRegistrationPlan } = require('../metadata/email-metadata-projection');
const { buildEmailAttachmentPlan, finalizeEmailAttachmentPlan } = require('./email-attachment-plan');

function requireFunction(name, value) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
  return value;
}

function addressText(addresses) {
  const list = Array.isArray(addresses) ? addresses : [];
  return list.map(entry => {
    const name = String(entry?.name || '').trim();
    const address = String(entry?.address || '').trim();
    if (name && address) return `${name} <${address}>`;
    return name || address;
  }).filter(Boolean).join(', ');
}

function sourceFormatFromPath(sourcePath) {
  const extension = path.extname(String(sourcePath || '')).toLowerCase();
  if (extension === '.eml') return 'eml';
  if (extension === '.msg') return 'msg';
  return null;
}

function buildServices(overrides) {
  return {
    parseEml,
    parseMsg,
    detectExactSourceDuplicate,
    retainOriginalSource,
    removeRetainedSourceIfExact,
    suggestedEmailPdfPath,
    validateTargetPdfPath,
    generateEmailPdf,
    buildEmailImportRegistrationPlan,
    buildEmailAttachmentPlan,
    finalizeEmailAttachmentPlan,
    ...(overrides || {})
  };
}

async function runEmailImport({
  chooseSource,
  readSourceBytes,
  findBySourceSha256,
  chooseReview,
  pathExists,
  getMetadataSchemaSnapshot,
  ensureDocumentRecordIndexReady,
  getDocumentMetadataRecordState,
  vaultRootPath,
  printHtmlToPdf,
  ensureTargetFolders,
  createPdf,
  saveDocumentMetadataRecordValues,
  deletePdf,
  openPdf,
  onPdfRollbackError,
  onRetainedRollbackError,
  services
}) {
  const choose = requireFunction('chooseSource', chooseSource);
  const read = requireFunction('readSourceBytes', readSourceBytes);
  const findDuplicates = requireFunction('findBySourceSha256', findBySourceSha256);
  const review = requireFunction('chooseReview', chooseReview);
  const exists = requireFunction('pathExists', pathExists);
  const getSchema = requireFunction('getMetadataSchemaSnapshot', getMetadataSchemaSnapshot);
  const ensureIndex = requireFunction('ensureDocumentRecordIndexReady', ensureDocumentRecordIndexReady);
  const getRecordState = requireFunction('getDocumentMetadataRecordState', getDocumentMetadataRecordState);
  const print = requireFunction('printHtmlToPdf', printHtmlToPdf);
  const ensureFolders = requireFunction('ensureTargetFolders', ensureTargetFolders);
  const create = requireFunction('createPdf', createPdf);
  const saveMetadata = requireFunction('saveDocumentMetadataRecordValues', saveDocumentMetadataRecordValues);
  const removePdf = requireFunction('deletePdf', deletePdf);
  const open = requireFunction('openPdf', openPdf);
  const runtime = buildServices(services);

  const picked = await choose();
  if (picked?.canceled || !picked?.filePath) return { ok: true, canceled: true };

  const sourcePath = String(picked.filePath);
  const format = sourceFormatFromPath(sourcePath);
  if (!format) return { ok: false, reason: 'unsupported-source' };

  const sourceBytes = Buffer.from(await read(sourcePath));
  const duplicateFacts = await runtime.detectExactSourceDuplicate({
    sourceBytes,
    findBySourceSha256: findDuplicates
  });
  const originalFilename = path.basename(sourcePath);
  const document = format === 'eml'
    ? await runtime.parseEml({ sourceBytes, originalFilename })
    : await runtime.parseMsg({ sourceBytes, originalFilename });

  const suggestedPdfPath = runtime.suggestedEmailPdfPath(document, exists);
  const decision = await review({
    suggestedPdfPath,
    duplicates: duplicateFacts.matches,
    summary: {
      sourceFilename: originalFilename,
      subject: String(document?.message?.subject || ''),
      sender: addressText(document?.message?.from),
      date: String(document?.message?.dateTime?.raw || document?.message?.dateTime?.iso || '')
    }
  });

  if (!decision || decision.action === 'cancel') return { ok: true, canceled: true };
  if (decision.action === 'open-existing') {
    try {
      await open(decision.match?.pdfPath);
      return {
        ok:true,
        openedExisting:true,
        duplicate:true,
        sourceSha256:duplicateFacts.sha256,
        pdfPath:decision.match?.pdfPath
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'existing-open-failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const target = runtime.validateTargetPdfPath(decision.pdfPath, exists);
  if (!target.ok) return { ok: false, reason: 'invalid-target', error: target.error };

  const attachmentPlan=runtime.finalizeEmailAttachmentPlan(runtime.buildEmailAttachmentPlan({
    document,
    parentPdfPath:target.path
  }));

  const schema = getSchema();
  if (!schema) throw new Error('Metadata schema is unavailable.');
  await ensureIndex();
  const existingTargetState = getRecordState(target.path);
  if (existingTargetState?.registered) throw new Error('Target PDF path is already registered in Document Metadata.');
  if (existingTargetState?.ok === false) {
    throw new Error(existingTargetState.error || existingTargetState.reason || 'Target metadata state is unsafe.');
  }

  let retained = null;
  let pdfFile = null;
  try {
    retained = await runtime.retainOriginalSource({
      document,
      sourceBytes,
      vaultRootPath,
      enabled: decision.retainSource === true
    });
    const retainedDocument = retained.document;
    const registration = runtime.buildEmailImportRegistrationPlan({
      document: retainedDocument,
      schema,
      documentRecordState: existingTargetState
    });
    if (!registration.ok) {
      throw new Error(registration.error || registration.reason || 'Email metadata projection failed.');
    }

    const pdfBytes = await runtime.generateEmailPdf({
      document: retainedDocument,
      attachmentManifest:attachmentPlan.manifest,
      printHtmlToPdf: print
    });

    await ensureFolders(target.path);
    pdfFile = await create(target.path, pdfBytes);
    const saved = await saveMetadata(target.path, registration.values);
    if (!saved?.ok) throw new Error(saved?.error || 'Document metadata registration failed.');
  } catch (error) {
    if (pdfFile) {
      try {
        await removePdf(pdfFile);
      } catch (rollbackError) {
        if (typeof onPdfRollbackError === 'function') onPdfRollbackError(rollbackError);
      }
    }
    if (retained?.created === true) {
      try {
        await runtime.removeRetainedSourceIfExact({
          document: retained.document,
          sourceBytes,
          vaultRootPath
        });
      } catch (rollbackError) {
        if (typeof onRetainedRollbackError === 'function') onRetainedRollbackError(rollbackError);
      }
    }
    throw error;
  }

  let openError = null;
  try {
    await open(target.path);
  } catch (error) {
    openError = error;
  }

  return {
    ok: true,
    pdfPath: target.path,
    duplicate: duplicateFacts.exactDuplicate,
    sourceRetained: retained?.document?.source?.retained === true,
    retainedPath: retained?.retainedPath || null,
    attachmentPlan,
    sourceDocument:retained?.document || document,
    openError
  };
}

module.exports = {
  addressText,
  sourceFormatFromPath,
  runEmailImport
};
