'use strict';

function createObsidianEmailImportAdapter(plugin) {
  if (!plugin || typeof plugin !== 'object') throw new TypeError('plugin is required.');

  function normalizePdfPath(value) {
    return EMAIL_IMPORT_RUNTIME.normalizeVaultPath(value);
  }

  async function findDuplicatesBySha256(sourceSha256) {
    const sha = String(sourceSha256 || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Invalid email source SHA-256.');

    await plugin.ports.ensureDocumentRecordIndexReady();
    const matches = [];
    for (const file of plugin.obsidianVaultReadAdapter.listMarkdownFiles()) {
      const recordPath = metadataRecordNormalizeVaultPath(file?.path);
      if (!metadataRecordIsPath(recordPath)) continue;
      const frontmatter = plugin.obsidianMetadataCacheAdapter?.getFrontmatter?.(file) || null;
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
      await plugin.obsidianVaultWriteAdapter.ensureFolder(current);
    }
  }

  async function openPdf(pdfPath) {
    const file = plugin.obsidianVaultReadAdapter.getAbstractFileByPath(normalizePdfPath(pdfPath));
    if (!file || String(file.extension || '').toLowerCase() !== 'pdf') {
      throw new Error('Imported PDF could not be resolved in the vault.');
    }
    const target = plugin.pdfLeafAdapter?.acquireOpenTarget?.(true);
    if (!target?.ok || !target.leaf) {
      throw new Error(target?.error || 'No WorkspaceLeaf is available for the imported PDF.');
    }
    await target.leaf.openFile(file);
    return true;
  }

  function activePdfPath() {
    const active = plugin.pdfLeafAdapter?.getActiveLeaf?.();
    const view = active?.ok ? active.leaf?.view : null;
    const file = view?.file || null;
    if (!file || String(file.extension || '').toLowerCase() !== 'pdf') return null;
    return normalizePdfPath(file.path);
  }

  function pathExists(candidate) {
    return Boolean(plugin.obsidianVaultReadAdapter.getAbstractFileByPath(candidate));
  }

  function createPdf(pdfPath, bytes) {
    const buffer = Buffer.from(bytes || []);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return plugin.obsidianVaultWriteAdapter.createBinary(pdfPath, arrayBuffer);
  }

  return Object.freeze({
    findDuplicatesBySha256,
    ensureTargetFolders,
    openPdf,
    activePdfPath,
    pathExists,
    createPdf,
    deletePdf: pdfFile => plugin.obsidianVaultWriteAdapter.deleteFile(pdfFile, true),
    getVaultRootPath: () => plugin.obsidianVaultReadAdapter.getBasePath(),
    getMetadataSchemaSnapshot: () => plugin.ports.getMetadataSchemaSnapshot(),
    ensureDocumentRecordIndexReady: () => plugin.ports.ensureDocumentRecordIndexReady(),
    getDocumentMetadataRecordState: pdfPath => plugin.ports.getDocumentMetadataRecordState(pdfPath),
    saveDocumentMetadataRecordValues: (pdfPath, values) => plugin.ports.saveDocumentMetadataRecordValues(pdfPath, values)
  });
}

module.exports = { createObsidianEmailImportAdapter };
