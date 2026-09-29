'use strict';

const assert = require('assert/strict');

global.metadataRecordNormalizeVaultPath = value => String(value || '').replace(/\\/g, '/');
global.metadataRecordIsPath = value => String(value || '').startsWith('File Metadata/') && String(value || '').endsWith('.md');
global.metadataRecordFilePathFromLink = value => String(value || '');

const { createObsidianEmailImportAdapter } = require('../src/plugin/email-import/obsidian-email-import-adapter');

async function run() {
  const calls = [];
  const sha = 'a'.repeat(64);
  const runtime = {
    normalizeVaultPath(value) {
      return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
    }
  };
  const vaultRead = {
    listMarkdownFiles: () => [
      { path: 'File Metadata/a.md' },
      { path: 'Notes/not-a-record.md' }
    ],
    getAbstractFileByPath: path => {
      calls.push(`lookup:${path}`);
      if (path === 'Folder/open.pdf') return { path, extension: 'pdf' };
      if (path === 'Folder/existing.pdf') return { path, extension: 'pdf' };
      return null;
    },
    getBasePath: () => '/vault'
  };
  const metadataCache = {
    getFrontmatter: file => file.path === 'File Metadata/a.md'
      ? {
          filemeta_id: 'record-1',
          filemeta_file: 'Folder/mail.pdf',
          filemeta_status: 'ok',
          email_import_source_sha256: sha
        }
      : null
  };
  const vaultWrite = {
    ensureFolder: async path => { calls.push(`folder:${path}`); },
    createBinary: async (path, bytes) => {
      assert.ok(bytes instanceof ArrayBuffer);
      calls.push(`create:${path}:${Buffer.from(bytes).toString('ascii')}`);
      return { path };
    },
    deleteFile: async (file, permanent) => { calls.push(`delete:${file.path}:${permanent}`); }
  };
  const pdfLeaf = {
    getActiveLeaf: () => ({ ok: true, leaf: { view: { file: { path: 'Folder\\active.pdf', extension: 'pdf' } } } }),
    acquireOpenTarget: () => ({
      ok: true,
      leaf: { openFile: async file => { calls.push(`open:${file.path}`); } }
    })
  };
  const ensureDocumentRecordIndexReady = async () => { calls.push('ensure-index'); };
  const getMetadataSchemaSnapshot = () => ({ fields: [] });
  const getDocumentMetadataRecordState = path => ({ ready: true, ok: true, path });
  const saveDocumentMetadataRecordValues = async (path, values) => ({ ok: true, path, values });

  const adapter = createObsidianEmailImportAdapter({
    runtime,
    vaultRead,
    metadataCache,
    vaultWrite,
    pdfLeaf,
    ensureDocumentRecordIndexReady,
    getMetadataSchemaSnapshot,
    getDocumentMetadataRecordState,
    saveDocumentMetadataRecordValues
  });

  assert.equal(adapter.activePdfPath(), 'Folder/active.pdf');
  assert.equal(adapter.getVaultRootPath(), '/vault');
  assert.equal(adapter.pathExists('Folder/existing.pdf'), true);
  assert.equal(adapter.pathExists('Folder/new.pdf'), false);

  const duplicates = await adapter.findDuplicatesBySha256(sha);
  assert.deepEqual(duplicates, [{
    id: 'record-1',
    recordPath: 'File Metadata/a.md',
    pdfPath: 'Folder/mail.pdf',
    status: 'ok'
  }]);
  assert.ok(calls.includes('ensure-index'));

  await adapter.ensureTargetFolders('A/B/file.pdf');
  assert.ok(calls.includes('folder:A'));
  assert.ok(calls.includes('folder:A/B'));

  const created = await adapter.createPdf('Folder/new.pdf', Buffer.from('%PDF-test'));
  assert.equal(created.path, 'Folder/new.pdf');
  assert.ok(calls.includes('create:Folder/new.pdf:%PDF-test'));

  await adapter.openPdf('Folder/open.pdf');
  assert.ok(calls.includes('open:Folder/open.pdf'));

  await adapter.deletePdf({ path: 'Folder/new.pdf' });
  assert.ok(calls.includes('delete:Folder/new.pdf:true'));

  assert.deepEqual(adapter.getMetadataSchemaSnapshot(), { fields: [] });
  assert.deepEqual(adapter.getDocumentMetadataRecordState('Folder/new.pdf'), { ready: true, ok: true, path: 'Folder/new.pdf' });
  assert.equal((await adapter.saveDocumentMetadataRecordValues('Folder/new.pdf', { x: 1 })).ok, true);

  await assert.rejects(() => adapter.findDuplicatesBySha256('bad'), /Invalid email source SHA-256/);
  await assert.rejects(() => adapter.openPdf('Folder/missing.pdf'), /could not be resolved/);
  assert.throws(() => createObsidianEmailImportAdapter({}), /runtime is required/);

  console.log('Email Import Obsidian adapter OK: explicit dependencies, vault/provenance lookup, path/open/write boundaries and plugin-port forwarding verified.');
}

run().catch(error => {
  console.error('Email Import Obsidian adapter check failed.');
  console.error(error);
  process.exitCode = 1;
});
