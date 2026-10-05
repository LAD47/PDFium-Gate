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
  routeCreatedAttachments,
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
      archiveResult:null
    };
  }

  const schema = getSchema();
  if (!schema) throw new Error('Metadata schema is unavailable.');

  const exported = [];
  const failures = [];
  const relationPaths = [];
  const createdAttachments = [];

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
      if (createdFile) createdAttachments.push(createdFile);

      if (verifiedPdf) {
        await registerPdfTarget(targetPath,{ ...attachment, sha256:verifiedPdf.sha256 });
        pdfRegistered = true;
      }

      exported.push({
        path:targetPath,
        filename:runtime.sanitizeAttachmentFilename(attachment?.filename, attachment),
        sha256:verified.sha256,
        pdfRegistered
      });
      relationPaths.push(targetPath);
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

  let archiveResult = null;
  if (createdAttachments.length && typeof routeCreatedAttachments === 'function') {
    try {
      archiveResult = await routeCreatedAttachments(createdAttachments);
      for (const result of Array.isArray(archiveResult?.results) ? archiveResult.results : []) {
        if (result?.ok !== false) continue;
        failures.push({
          path:result?.zipPath || null,
          filename:String(result?.zipPath || 'archive.zip').split('/').pop(),
          error:result?.error || result?.reason || 'Archive Import failed.'
        });
      }
    } catch (error) {
      failures.push({
        path:null,
        filename:'archive-import',
        error:error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    ok:true,
    parentPdfPath,
    sourceSha256:source.sha256,
    exported,
    failures,
    archiveResult,
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
  runAutomaticEmailAttachmentExport,
  runPlannedEmailAttachmentExport
};


async function runPlannedEmailAttachmentExport({
  parentPdfPath,
  plan,
  ensureDocumentRecordIndexReady,
  getDocumentMetadataRecordState,
  getMetadataSchemaSnapshot,
  ensureTargetFolders,
  createBinary,
  readBinary,
  deleteFile,
  deleteFolder,
  deleteDocumentMetadataRecordForPdf,
  saveDocumentMetadataRecordValues,
  updateParentAttachmentLinks,
  writeArchiveRelationshipForPdf,
  onRollbackError,
  services
}) {
  if(!parentPdfPath) return {ok:false,reason:'no-parent-pdf'};
  if(!plan || !Array.isArray(plan.entries)) return {ok:false,reason:'attachment-plan-missing'};

  const ensureIndex=requireFunction('ensureDocumentRecordIndexReady',ensureDocumentRecordIndexReady);
  const getRecordState=requireFunction('getDocumentMetadataRecordState',getDocumentMetadataRecordState);
  const getSchema=requireFunction('getMetadataSchemaSnapshot',getMetadataSchemaSnapshot);
  const ensureFolders=requireFunction('ensureTargetFolders',ensureTargetFolders);
  const create=requireFunction('createBinary',createBinary);
  const read=requireFunction('readBinary',readBinary);
  const remove=requireFunction('deleteFile',deleteFile);
  const removeFolder=typeof deleteFolder==='function'?deleteFolder:null;
  const removeRecord=typeof deleteDocumentMetadataRecordForPdf==='function'?deleteDocumentMetadataRecordForPdf:null;
  const saveMetadata=requireFunction('saveDocumentMetadataRecordValues',saveDocumentMetadataRecordValues);
  const updateLinks=requireFunction('updateParentAttachmentLinks',updateParentAttachmentLinks);
  const runtime=buildServices(services);

  await ensureIndex();
  const parentState=getRecordState(parentPdfPath);
  if(!parentState?.ready || !parentState?.ok || !parentState?.registered || !parentState?.values?.email_import_source_sha256) {
    return {ok:false,reason:'not-email-import'};
  }
  const schema=getSchema();
  if(!schema) throw new Error('Metadata schema is unavailable.');

  const created=[];
  const registeredPdfPaths=[];
  const relationPaths=[];
  let relationWritten=false;

  async function rollback(primaryError) {
    if(relationWritten) {
      try { await updateLinks({parentPdfPath,parentRecordPath:parentState.recordPath,attachmentPaths:[]}); }
      catch(error){ if(typeof onRollbackError==='function') onRollbackError(error,'parent-attachment-links'); }
    }
    for(const pdfPath of registeredPdfPaths.slice().reverse()) {
      if(!removeRecord) continue;
      try { await removeRecord(pdfPath); }
      catch(error){ if(typeof onRollbackError==='function') onRollbackError(error,pdfPath); }
    }
    for(const item of created.slice().reverse()) {
      try { await remove(item.file); }
      catch(error){ if(typeof onRollbackError==='function') onRollbackError(error,item.path); }
    }
    if(removeFolder && plan.folderPath) {
      try { await removeFolder(plan.folderPath); }
      catch(error){ if(typeof onRollbackError==='function') onRollbackError(error,plan.folderPath); }
    }
    return {
      ok:false,
      reason:'attachment-transaction-failed',
      error:primaryError instanceof Error?primaryError.message:String(primaryError),
      rolledBack:true,
      parentPdfPath,
      folderPath:plan.folderPath,
      exported:[],
      exportedCount:0,
      attachmentCount:Number(plan.attachmentCount||0),
      archiveCount:Number(plan.archiveCount||0)
    };
  }

  try {
    for(const entry of plan.entries) {
      const targetPath=normalizeVaultPath(`${plan.folderPath}/${entry.relativePath}`);
      await ensureFolders(targetPath);
      const file=await create(targetPath,entry.bytes);
      if(!file) throw new Error(`Attachment write returned no vault file: ${targetPath}`);
      const readBack=Buffer.from(await read(file));
      const expected=Buffer.from(entry.bytes||[]);
      if(!readBack.equals(expected)) throw new Error(`Attachment read-back mismatch: ${targetPath}`);
      created.push({path:targetPath,file,entry});
      relationPaths.push(targetPath);
    }

    for(const item of created) {
      const entry=item.entry;
      if(entry.support!=='pdf') continue;
      const targetState=getRecordState(item.path);
      if(targetState?.ok===false) throw new Error(targetState.error||targetState.reason||`Unsafe metadata state: ${item.path}`);

      // The file path was fresh when this transaction started. If PDF auto-registration
      // has already created a minimal record in response to createBinary(), that record
      // belongs to this transaction and must be upgraded rather than treated as a collision.
      if(!registeredPdfPaths.includes(item.path)) registeredPdfPaths.push(item.path);

      const provenance=runtime.buildEmailAttachmentImportRecordValues({
        schema,
        parentRecordId:parentState.id,
        sourceSha256:String(parentState.values.email_import_source_sha256||''),
        attachment:{
          id:entry.attachmentId,
          filename:entry.archiveMemberPath || entry.sourceAttachmentFilename || entry.displayName,
          contentType:entry.contentType,
          sha256:entry.sha256,
          archiveName:entry.archiveName,
          archiveSha256:entry.archiveSha256,
          archiveMemberPath:entry.archiveMemberPath
        }
      });
      const saved=await saveMetadata(item.path,provenance.values);
      if(!saved?.ok) throw new Error(saved?.error||`Attachment metadata registration failed: ${item.path}`);
    }

    if(typeof writeArchiveRelationshipForPdf==='function') {
      for(const item of created) {
        const entry=item.entry;
        if(entry.support!=='pdf' || !entry.archiveName) continue;
        const siblingPaths=created
          .filter(candidate=>candidate.entry.sourceAttachmentIndex===entry.sourceAttachmentIndex)
          .map(candidate=>candidate.path);
        const relationship=await writeArchiveRelationshipForPdf({
          pdfPath:item.path,
          provenance:{
            sourceArchiveName:entry.archiveName,
            sourceArchiveSha256:entry.archiveSha256,
            parentDocumentPath:parentPdfPath
          },
          memberPaths:siblingPaths
        });
        if(relationship?.ok===false) throw new Error(relationship.error||`Archive relationship failed: ${item.path}`);
      }
    }

    const relation=await updateLinks({
      parentPdfPath,
      parentRecordPath:parentState.recordPath,
      attachmentPaths:relationPaths
    });
    if(relation?.ok===false) throw new Error(relation.error||'Attachment link relation update failed.');
    relationWritten=true;

    return {
      ok:true,
      parentPdfPath,
      folderPath:plan.folderPath,
      attachmentCount:Number(plan.attachmentCount||0),
      archiveCount:Number(plan.archiveCount||0),
      exportedCount:created.length,
      linkedCount:Number.isInteger(relation?.linkedCount)?relation.linkedCount:relationPaths.length,
      exported:created.map(item=>({
        path:item.path,
        filename:item.entry.displayName,
        sha256:item.entry.sha256,
        pdfRegistered:item.entry.support==='pdf',
        archiveName:item.entry.archiveName||null,
        archiveMemberPath:item.entry.archiveMemberPath||null
      })),
      failures:[],
      relationError:null
    };
  } catch(error) {
    return await rollback(error);
  }
}
