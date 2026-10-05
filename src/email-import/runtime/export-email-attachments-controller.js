'use strict';

const path = require('path');
const { sourceDescriptorFromEmailImportRecord, loadCanonicalEmailFromRetainedRecord } = require('./retained-source-loader');
const { analyzeEmailAttachments } = require('../attachments/attachment-policy');
const {
  sanitizeAttachmentFilename,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes
} = require('../attachments/attachment-extraction');
const {
  isZipAttachment,
  inspectZipAttachment,
  extractZipAttachment
} = require('../attachments/zip-attachment');
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

function suggestedArchiveFolderVaultPath(zipVaultPath, pathExists) {
  const exists = requireFunction('pathExists', pathExists);
  const zipPath = normalizeVaultPath(zipVaultPath);
  const slash = zipPath.lastIndexOf('/');
  const folder = slash >= 0 ? zipPath.slice(0, slash) : '';
  const filename = slash >= 0 ? zipPath.slice(slash + 1) : zipPath;
  const extension = path.extname(filename);
  const stem = sanitizeAttachmentFilename(extension ? filename.slice(0, -extension.length) : filename, { id:'archive' });

  for (let index = 1; index < 10000; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const name = `${stem}${suffix}`;
    const candidate = folder ? `${folder}/${name}` : name;
    if (!exists(candidate)) return candidate;
  }
  throw new Error('Could not allocate a unique ZIP extraction folder.');
}

function buildServices(overrides) {
  return {
    sourceDescriptorFromEmailImportRecord,
    loadCanonicalEmailFromRetainedRecord,
    analyzeEmailAttachments,
    sanitizeAttachmentFilename,
    verifiedAttachmentBytes,
    verifiedPdfAttachmentBytes,
    isZipAttachment,
    inspectZipAttachment,
    extractZipAttachment,
    buildEmailAttachmentImportRecordValues,
    suggestedAttachmentVaultPath,
    suggestedArchiveFolderVaultPath,
    ...(overrides || {})
  };
}

function archiveDecisionModel(zipPlans) {
  const archives = [];
  let unsupportedCount = 0;
  for (const plan of zipPlans.values()) {
    if (!plan?.inspection) continue;
    const unsupported = plan.inspection.unsupportedEntries.map(entry => ({
      path:entry.originalPath,
      size:entry.uncompressedSize
    }));
    unsupportedCount += unsupported.length;
    archives.push({
      filename:String(plan.attachment?.filename || 'archive.zip'),
      totalCount:plan.inspection.fileEntries.length,
      pdfCount:plan.inspection.pdfEntries.length,
      nativeCount:plan.inspection.nativeEntries.length,
      unsupportedCount:unsupported.length,
      blockedCount:plan.inspection.blockedEntries.length,
      unsupported
    });
  }
  return { archives, unsupportedCount };
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
  chooseUnsupportedArchiveFiles,
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
      relationError:null,
      archives:[]
    };
  }

  const schema = getSchema();
  if (!schema) throw new Error('Metadata schema is unavailable.');

  const exported = [];
  const failures = [];
  const relationPaths = [];
  const zipPlans = new Map();

  for (const item of items) {
    const attachment = item.attachment;
    if (!runtime.isZipAttachment(attachment)) continue;
    try {
      const verified = runtime.verifiedAttachmentBytes(attachment);
      const inspection = runtime.inspectZipAttachment({ ...attachment, content:verified.bytes });
      zipPlans.set(item,{ attachment, inspection, error:null });
      for (const blocked of inspection.blockedEntries) {
        failures.push({
          path:null,
          filename:`${String(attachment.filename || 'archive.zip')}::${blocked.originalPath}`,
          error:`ZIP entry was blocked: ${blocked.blockedReason || 'unsafe-entry'}`
        });
      }
    } catch (error) {
      zipPlans.set(item,{ attachment, inspection:null, error:error instanceof Error ? error.message : String(error) });
      failures.push({
        path:null,
        filename:String(attachment?.filename || attachment?.id || 'archive.zip'),
        error:`ZIP inspection failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  const decisionModel = archiveDecisionModel(zipPlans);
  let archiveMode = 'supported-only';
  if (decisionModel.unsupportedCount > 0 && typeof chooseUnsupportedArchiveFiles === 'function') {
    const decision = await chooseUnsupportedArchiveFiles(decisionModel);
    if (decision?.action === 'keep') archiveMode = 'all';
    else if (decision?.action === 'cancel-archives') archiveMode = 'none';
    else archiveMode = 'supported-only';
  }

  async function registerPdfTarget(targetPath, attachmentForMetadata) {
    const targetState = getRecordState(targetPath);
    if (targetState?.registered) throw new Error('Attachment target path is already registered in Document Metadata.');
    if (targetState?.ok === false) {
      throw new Error(targetState.error || targetState.reason || 'Attachment metadata state is unsafe.');
    }
    const provenance = runtime.buildEmailAttachmentImportRecordValues({
      schema,
      parentRecordId:parentState.id,
      sourceSha256:source.sha256,
      attachment:attachmentForMetadata
    });
    const saved = await saveMetadata(targetPath, provenance.values);
    if (!saved?.ok) throw new Error(saved?.error || 'Attachment document metadata registration failed.');
    return true;
  }

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

      await ensureFolders(targetPath);
      if (typeof beforeCreateAttachment === 'function') await beforeCreateAttachment(targetPath, item);
      createdFile = await create(targetPath, verified.bytes);

      if (verifiedPdf) {
        await registerPdfTarget(targetPath,{ ...attachment, sha256:verifiedPdf.sha256 });
        pdfRegistered = true;
      }

      exported.push({
        path:targetPath,
        filename:runtime.sanitizeAttachmentFilename(attachment?.filename, attachment),
        sha256:verified.sha256,
        pdfRegistered,
        fromArchive:false
      });
      relationPaths.push(targetPath);

      const zipPlan = zipPlans.get(item);
      if (!zipPlan?.inspection || archiveMode === 'none') continue;

      const archiveFolder = runtime.suggestedArchiveFolderVaultPath(targetPath, exists);
      const extractedEntries = runtime.extractZipAttachment(
        { ...attachment, content:verified.bytes },
        zipPlan.inspection,
        { includeUnsupported:archiveMode === 'all' }
      );

      for (const entry of extractedEntries) {
        const nestedPath = normalizeVaultPath(`${archiveFolder}/${entry.safePath}`);
        let nestedFile = null;
        let nestedPdfRegistered = false;
        const nestedAttachment = {
          id:`${String(attachment.id || 'zip')}::${entry.originalPath}`,
          filename:entry.originalPath,
          contentType:entry.contentType,
          content:entry.bytes,
          size:entry.bytes.length,
          sha256:entry.sha256
        };
        try {
          await ensureFolders(nestedPath);
          if (typeof beforeCreateAttachment === 'function') {
            await beforeCreateAttachment(nestedPath,{ attachment:nestedAttachment, fromArchive:true, archiveAttachment:attachment });
          }
          nestedFile = await create(nestedPath,entry.bytes);

          if (entry.support === 'pdf') {
            const verifiedNestedPdf = runtime.verifiedPdfAttachmentBytes(nestedAttachment);
            await registerPdfTarget(nestedPath,{ ...nestedAttachment, sha256:verifiedNestedPdf.sha256 });
            nestedPdfRegistered = true;
          }

          exported.push({
            path:nestedPath,
            filename:entry.safePath,
            originalArchivePath:entry.originalPath,
            archivePath:targetPath,
            archiveFolder,
            sha256:entry.sha256,
            pdfRegistered:nestedPdfRegistered,
            fromArchive:true,
            support:entry.support
          });
        } catch (error) {
          if (nestedFile && entry.support === 'pdf' && nestedPdfRegistered === false) {
            try {
              await remove(nestedFile);
            } catch (rollbackError) {
              if (typeof onRollbackError === 'function') onRollbackError(rollbackError, nestedPath);
            }
          }
          failures.push({
            path:nestedPath,
            filename:`${String(attachment.filename || 'archive.zip')}::${entry.originalPath}`,
            error:error instanceof Error ? error.message : String(error)
          });
        }
      }
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
  if (relationPaths.length) {
    try {
      const relation = await updateLinks({
        parentPdfPath,
        parentRecordPath:parentState.recordPath,
        attachmentPaths:relationPaths
      });
      if (relation?.ok === false) throw new Error(relation.error || 'Attachment link relation update failed.');
      linkedCount = Number.isInteger(relation?.linkedCount) ? relation.linkedCount : relationPaths.length;
    } catch (error) {
      relationError = error instanceof Error ? error.message : String(error);
    }
  }

  const archiveSummaries = [];
  for (const plan of zipPlans.values()) {
    archiveSummaries.push({
      filename:String(plan.attachment?.filename || 'archive.zip'),
      inspected:Boolean(plan.inspection),
      error:plan.error || null,
      totalCount:plan.inspection?.fileEntries?.length || 0,
      pdfCount:plan.inspection?.pdfEntries?.length || 0,
      nativeCount:plan.inspection?.nativeEntries?.length || 0,
      unsupportedCount:plan.inspection?.unsupportedEntries?.length || 0,
      blockedCount:plan.inspection?.blockedEntries?.length || 0
    });
  }

  return {
    ok:true,
    parentPdfPath,
    sourceSha256:source.sha256,
    exported,
    failures,
    archives:archiveSummaries,
    archiveMode,
    unsupportedArchiveCount:decisionModel.unsupportedCount,
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
  suggestedArchiveFolderVaultPath,
  archiveDecisionModel,
  runAutomaticEmailAttachmentExport
};
