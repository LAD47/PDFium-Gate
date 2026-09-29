'use strict';

const { sourceDescriptorFromEmailImportRecord, loadCanonicalEmailFromRetainedRecord } = require('./retained-source-loader');
const { suggestedAttachmentPdfPath, validateTargetPdfPath } = require('./target-path-policy');
const { analyzeEmailAttachments } = require('../attachments/attachment-policy');
const { verifiedPdfAttachmentBytes } = require('../attachments/attachment-extraction');
const { buildEmailAttachmentImportRecordValues } = require('../metadata/email-metadata-projection');

function requireFunction(name, value) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
  return value;
}

function buildServices(overrides) {
  return {
    sourceDescriptorFromEmailImportRecord,
    loadCanonicalEmailFromRetainedRecord,
    suggestedAttachmentPdfPath,
    validateTargetPdfPath,
    analyzeEmailAttachments,
    verifiedPdfAttachmentBytes,
    buildEmailAttachmentImportRecordValues,
    ...(overrides || {})
  };
}

async function runEmailPdfAttachmentImport({
  parentPdfPath,
  ensureDocumentRecordIndexReady,
  getDocumentMetadataRecordState,
  vaultRootPath,
  pathExists,
  chooseAttachment,
  getMetadataSchemaSnapshot,
  ensureTargetFolders,
  createPdf,
  saveDocumentMetadataRecordValues,
  deletePdf,
  openPdf,
  onRollbackError,
  services
}) {
  if (!parentPdfPath) return { ok: false, reason: 'no-active-pdf' };

  const ensureIndex = requireFunction('ensureDocumentRecordIndexReady', ensureDocumentRecordIndexReady);
  const getRecordState = requireFunction('getDocumentMetadataRecordState', getDocumentMetadataRecordState);
  const exists = requireFunction('pathExists', pathExists);
  const choose = requireFunction('chooseAttachment', chooseAttachment);
  const getSchema = requireFunction('getMetadataSchemaSnapshot', getMetadataSchemaSnapshot);
  const ensureFolders = requireFunction('ensureTargetFolders', ensureTargetFolders);
  const create = requireFunction('createPdf', createPdf);
  const saveMetadata = requireFunction('saveDocumentMetadataRecordValues', saveDocumentMetadataRecordValues);
  const removePdf = requireFunction('deletePdf', deletePdf);
  const open = requireFunction('openPdf', openPdf);
  const runtime = buildServices(services);

  await ensureIndex();
  const parentState = getRecordState(parentPdfPath);
  if (!parentState?.ready || !parentState?.ok || !parentState?.registered || !parentState?.values?.email_import_source_sha256) {
    return { ok: false, reason: 'not-email-import' };
  }

  const source = runtime.sourceDescriptorFromEmailImportRecord(parentState.values);
  if (source.retained !== true || !source.retainedPath) {
    return { ok: false, reason: 'source-not-retained' };
  }

  const loaded = await runtime.loadCanonicalEmailFromRetainedRecord({
    values: parentState.values,
    vaultRootPath
  });
  const document = loaded.document;
  const analysis = runtime.analyzeEmailAttachments(document);
  const pdfItems = (analysis.pdfCandidates || []).filter(item =>
    item?.extractable === true
    && Array.isArray(item.pdfEvidence)
    && item.pdfEvidence.includes('payload')
  );

  if (!pdfItems.length) return { ok: true, reason: 'no-pdf-attachments' };

  const modalItems = pdfItems.map(item => ({
    ...item,
    suggestedPdfPath: runtime.suggestedAttachmentPdfPath(parentPdfPath, item.attachment, exists)
  }));
  const decision = await choose({ parentPdfPath, items: modalItems });
  if (!decision || decision.action === 'cancel') return { ok: true, canceled: true };

  const selected = modalItems[Number(decision.index)];
  if (!selected?.attachment) throw new Error('Selected PDF attachment could not be resolved.');

  const target = runtime.validateTargetPdfPath(decision.pdfPath, exists);
  if (!target.ok) return { ok: false, reason: 'invalid-target', error: target.error };

  const verified = runtime.verifiedPdfAttachmentBytes(selected.attachment);
  const schema = getSchema();
  if (!schema) throw new Error('Metadata schema is unavailable.');

  const existingTargetState = getRecordState(target.path);
  if (existingTargetState?.registered) throw new Error('Target PDF path is already registered in Document Metadata.');
  if (existingTargetState?.ok === false) {
    throw new Error(existingTargetState.error || existingTargetState.reason || 'Target metadata state is unsafe.');
  }

  const provenance = runtime.buildEmailAttachmentImportRecordValues({
    schema,
    parentRecordId: parentState.id,
    sourceSha256: source.sha256,
    attachment: { ...selected.attachment, sha256: verified.sha256 }
  });

  let pdfFile = null;
  try {
    await ensureFolders(target.path);
    pdfFile = await create(target.path, verified.bytes);
    const saved = await saveMetadata(target.path, provenance.values);
    if (!saved?.ok) throw new Error(saved?.error || 'Attachment document metadata registration failed.');
  } catch (error) {
    if (pdfFile) {
      try {
        await removePdf(pdfFile);
      } catch (rollbackError) {
        if (typeof onRollbackError === 'function') onRollbackError(rollbackError);
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
    parentPdfPath,
    attachmentSha256: verified.sha256,
    openError
  };
}

module.exports = {
  runEmailPdfAttachmentImport
};
