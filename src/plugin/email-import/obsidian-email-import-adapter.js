'use strict';

function createObsidianEmailImportAdapter({
  runtime,
  vaultRead,
  metadataCache,
  vaultWrite,
  pdfLeaf,
  ensureDocumentRecordIndexReady,
  getMetadataSchemaSnapshot,
  getDocumentMetadataRecordState,
  saveDocumentMetadataRecordValues
}) {
  if (!runtime || typeof runtime.normalizeVaultPath !== 'function') throw new TypeError('runtime is required.');
  if (!vaultRead || !vaultWrite) throw new TypeError('vault adapters are required.');
  if (typeof ensureDocumentRecordIndexReady !== 'function') throw new TypeError('ensureDocumentRecordIndexReady is required.');
  if (typeof getMetadataSchemaSnapshot !== 'function') throw new TypeError('getMetadataSchemaSnapshot is required.');
  if (typeof getDocumentMetadataRecordState !== 'function') throw new TypeError('getDocumentMetadataRecordState is required.');
  if (typeof saveDocumentMetadataRecordValues !== 'function') throw new TypeError('saveDocumentMetadataRecordValues is required.');

  function normalizePdfPath(value) {
    return runtime.normalizeVaultPath(value);
  }

  async function findDuplicatesBySha256(sourceSha256) {
    const sha = String(sourceSha256 || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Invalid email source SHA-256.');

    await ensureDocumentRecordIndexReady();
    const matches = [];
    for (const file of vaultRead.listMarkdownFiles()) {
      const recordPath = metadataRecordNormalizeVaultPath(file?.path);
      if (!metadataRecordIsPath(recordPath)) continue;
      const frontmatter = metadataCache?.getFrontmatter?.(file) || null;
      if (!frontmatter || String(frontmatter.email_import_source_sha256 || '').toLowerCase() !== sha) continue;
      matches.push({
        id: String(frontmatter.filemeta_id || ''),
        recordPath,
        pdfPath: metadataRecordFilePathFromLink(frontmatter.filemeta_file),
        status: String(frontmatter.filemeta_status || '')
      });
    }
    return matches;
  }

  async function ensureTargetFolders(pdfPath) {
    const parts = normalizePdfPath(pdfPath).split('/').slice(0, -1);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      await vaultWrite.ensureFolder(current);
    }
  }

  async function openPdf(pdfPath) {
    const file = vaultRead.getAbstractFileByPath(normalizePdfPath(pdfPath));
    if (!file || String(file.extension || '').toLowerCase() !== 'pdf') {
      throw new Error('Imported PDF could not be resolved in the vault.');
    }
    const target = pdfLeaf?.acquireOpenTarget?.(true);
    if (!target?.ok || !target.leaf) {
      throw new Error(target?.error || 'No WorkspaceLeaf is available for the imported PDF.');
    }
    await target.leaf.openFile(file);
    return true;
  }

  function activePdfPath() {
    const active = pdfLeaf?.getActiveLeaf?.();
    const view = active?.ok ? active.leaf?.view : null;
    const file = view?.file || null;
    if (!file || String(file.extension || '').toLowerCase() !== 'pdf') return null;
    return normalizePdfPath(file.path);
  }

  function pathExists(candidate) {
    return Boolean(vaultRead.getAbstractFileByPath(candidate));
  }

  function createPdf(pdfPath, bytes) {
    const buffer = Buffer.from(bytes || []);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return vaultWrite.createBinary(pdfPath, arrayBuffer);
  }

  return Object.freeze({
    findDuplicatesBySha256,
    ensureTargetFolders,
    openPdf,
    activePdfPath,
    pathExists,
    createPdf,
    deletePdf: pdfFile => vaultWrite.deleteFile(pdfFile, true),
    getVaultRootPath: () => vaultRead.getBasePath(),
    getMetadataSchemaSnapshot,
    ensureDocumentRecordIndexReady,
    getDocumentMetadataRecordState,
    saveDocumentMetadataRecordValues
  });
}

module.exports = { createObsidianEmailImportAdapter };
