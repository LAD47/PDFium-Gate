'use strict';

const path = require('path');
const { sourceDescriptorFromEmailImportRecord, loadCanonicalEmailFromRetainedRecord } = require('./retained-source-loader');
const { analyzeEmailAttachments } = require('../attachments/attachment-policy');
const {
  sanitizeAttachmentFilename,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes
} = require('../attachments/attachment-extraction');
const { buildEmailAttachmentImportRecordValues } = require('../metadata/email-metadata-projection');

function requireFunction(name, value) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
  return value;
}

function normalizeVaultPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function suggestedAttachmentVaultPath(parentPdfPath, attachment, pathExists) {
  const exists = requireFunction('pathExists', pathExists);
  const parent = normalizeVaultPath(parentPdfPath);
  const slash = parent.lastIndexOf('/');
  const folder = slash >= 0 ? parent.slice(0, slash) : '';
  const filename = sanitizeAttachmentFilename(attachment?.filename, attachment);
  const extension = path.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;

  for (let index = 1; index < 10000; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const name = `${stem}${suffix}${extension}`;
    const candidate = folder ? `${folder}/${name}` : name;
    if (!exists(candidate)) return candidate;
  }

  throw new Error('Could not allocate a unique attachment path.');
}

function buildServices(overrides) {
  return {
    sourceDescriptorFromEmailImportRecord,
    loadCanonicalEmailFromRetainedRecord,
    analyzeEmailAttachments,
    sanitizeAttachmentFilename,
    verifiedAttachmentBytes,
    verifiedPdfAttachmentBytes,
    buildEmailAttachmentImportRecordValues,
    suggestedAttachmentVaultPath,
    ...(overrides || {})
  };
}

async function runAutomaticEmailAttachmentExport({
  parentPdfPath,
  ensureDocumentRecordIndexReady,
  getDocumentMetadataRecordState,
  vaultRootPath,
  pathExists,
  getMetadataSchemaSnapshot,
  ensureTargetFolders,
  createBinary,
  deleteFile,
  saveDocumentMetadataRecordValues,
  updateParentAttachmentLinks,
  beforeCreateAttachment,
  onRollbackError,
  services
}) {
  if (!parentPdfPath) return { ok:false, reason:'no-parent-pdf' };

  const ensureIndex = requireFunction('ensureDocumentRecordIndexReady', ensureDocumentRecordIndexReady);
  const getRecordState = requireFunction('getDocumentMetadataRecordState', getDocumentMetadataRecordState);
  const exists = requireFunction('pathExists', pathExists);
  const getSchema = requireFunction('getMetadataSchemaSnapshot', getMetadataSchemaSnapshot);
  const ensureFolders = requireFunction('ensureTargetFolders', ensureTargetFolders);
  const create = requireFunction('createBinary', createBinary);
  const remove = requireFunction('deleteFile', deleteFile);
  const saveMetadata = requireFunction('saveDocumentMetadataRecordValues', saveDocumentMetadataRecordValues);
  const updateLinks = requireFunction('updateParentAttachmentLinks', updateParentAttachmentLinks);
  const runtime = buildServices(services);

  await ensureIndex();
  const parentState = getRecordState(parentPdfPath);
  if (!parentState?.ready || !parentState?.ok || !parentState?.registered || !parentState?.values?.email_import_source_sha256) {
    return { ok:false, reason:'not-email-import' };
  }

  const source = runtime.sourceDescriptorFromEmailImportRecord(parentState.values);
  if (source.retained !== true || !source.retainedPath) {
    return { ok:false, reason:'source-not-retained' };
  }

  const loaded = await runtime.loadCanonicalEmailFromRetainedRecord({
    values: parentState.values,
    vaultRootPath
  });
  const analysis = runtime.analyzeEmailAttachments(loaded.document);
  const items = (analysis.attachments || []).filter(item => item?.extractable === true && item?.attachment);
  if (!items.length) {
    return {
      ok:true,
      reason:'no-attachments',
      parentPdfPath,
      sourceSha256:source.sha256,
      exported:[],
      failures:[],
      linkedCount:0,
      relationError:null
    };
  }

  const schema = getSchema();
  if (!schema) throw new Error('Metadata schema is unavailable.');

  const exported = [];
  const failures = [];

  for (const item of items) {
    const attachment = item.attachment;
    let createdFile = null;
    let targetPath = null;
    let pdfRegistered = false;

    try {
      const verified = runtime.verifiedAttachmentBytes(attachment);
      targetPath = runtime.suggestedAttachmentVaultPath(parentPdfPath, attachment, exists);

      let verifiedPdf = null;
      if (item.pdfCandidate === true && Array.isArray(item.pdfEvidence) && item.pdfEvidence.includes('payload')) {
        try {
          verifiedPdf = runtime.verifiedPdfAttachmentBytes(attachment);
        } catch (_) {
          verifiedPdf = null;
        }
      }

      let provenance = null;
      if (verifiedPdf) {
        const targetState = getRecordState(targetPath);
        if (targetState?.registered) throw new Error('Attachment target path is already registered in Document Metadata.');
        if (targetState?.ok === false) {
          throw new Error(targetState.error || targetState.reason || 'Attachment metadata state is unsafe.');
        }
        provenance = runtime.buildEmailAttachmentImportRecordValues({
          schema,
          parentRecordId:parentState.id,
          sourceSha256:source.sha256,
          attachment:{ ...attachment, sha256:verifiedPdf.sha256 }
        });
      }

      await ensureFolders(targetPath);
      if (typeof beforeCreateAttachment === 'function') await beforeCreateAttachment(targetPath, item);
      createdFile = await create(targetPath, verified.bytes);

      if (provenance) {
        const saved = await saveMetadata(targetPath, provenance.values);
        if (!saved?.ok) throw new Error(saved?.error || 'Attachment document metadata registration failed.');
        pdfRegistered = true;
      }

      exported.push({
        path:targetPath,
        filename:runtime.sanitizeAttachmentFilename(attachment?.filename, attachment),
        sha256:verified.sha256,
        pdfRegistered
      });
    } catch (error) {
      if (createdFile && pdfRegistered === false && item.pdfCandidate === true) {
        try {
          await remove(createdFile);
        } catch (rollbackError) {
          if (typeof onRollbackError === 'function') onRollbackError(rollbackError, targetPath);
        }
      }
      failures.push({
        path:targetPath,
        filename:String(attachment?.filename || attachment?.id || 'attachment'),
        error:error instanceof Error ? error.message : String(error)
      });
    }
  }

  let relationError = null;
  let linkedCount = 0;
  if (exported.length) {
    try {
      const relation = await updateLinks({
        parentPdfPath,
        parentRecordPath:parentState.recordPath,
        attachmentPaths:exported.map(item => item.path)
      });
      if (relation?.ok === false) throw new Error(relation.error || 'Attachment link relation update failed.');
      linkedCount = Number.isInteger(relation?.linkedCount) ? relation.linkedCount : exported.length;
    } catch (error) {
      relationError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok:true,
    parentPdfPath,
    sourceSha256:source.sha256,
    exported,
    failures,
    attachmentCount:items.length,
    exportedCount:exported.length,
    failureCount:failures.length,
    linkedCount,
    relationError
  };
}

module.exports = {
  normalizeVaultPath,
  suggestedAttachmentVaultPath,
  runAutomaticEmailAttachmentExport
};
