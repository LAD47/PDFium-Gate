'use strict';

const assert = require('assert/strict');
const { runEmailPdfAttachmentImport } = require('../src/email-import/runtime/import-pdf-attachment-controller');

const SOURCE_SHA = 'a'.repeat(64);
const ATTACHMENT_SHA = 'b'.repeat(64);

function createHarness(overrides = {}) {
  const calls = [];
  const parentState = {
    ready: true,
    ok: true,
    registered: true,
    id: 'parent-record-id',
    values: { email_import_source_sha256: SOURCE_SHA }
  };
  const attachment = {
    id: 'attachment-1',
    filename: 'document.pdf',
    size: 12,
    content: Buffer.from('%PDF-test')
  };

  const defaultServices = {
    sourceDescriptorFromEmailImportRecord: () => ({
      format: 'eml',
      sha256: SOURCE_SHA,
      byteSize: 123,
      originalFilename: 'message.eml',
      retained: true,
      retainedPath: `.pdf-metadata/email-sources/${SOURCE_SHA.slice(0, 2)}/${SOURCE_SHA}.eml`
    }),
    loadCanonicalEmailFromRetainedRecord: async () => {
      calls.push('load-retained');
      return { document: { attachments: [attachment] } };
    },
    analyzeEmailAttachments: () => ({
      pdfCandidates: [{ attachment, extractable: true, pdfEvidence: ['payload'] }]
    }),
    suggestedAttachmentPdfPath: () => 'Email Imports/document.pdf',
    validateTargetPdfPath: value => ({ ok: true, path: value }),
    verifiedPdfAttachmentBytes: selected => {
      assert.equal(selected, attachment);
      return { bytes: Buffer.from('%PDF-test'), sha256: ATTACHMENT_SHA };
    },
    buildEmailAttachmentImportRecordValues: ({ parentRecordId, sourceSha256, attachment: selected }) => {
      assert.equal(parentRecordId, 'parent-record-id');
      assert.equal(sourceSha256, SOURCE_SHA);
      assert.equal(selected.sha256, ATTACHMENT_SHA);
      return {
        values: {
          email_import_parent_record_id: parentRecordId,
          email_import_attachment_sha256: selected.sha256
        }
      };
    }
  };

  const options = {
    parentPdfPath: 'Email Imports/message.pdf',
    ensureDocumentRecordIndexReady: async () => { calls.push('ensure-index'); },
    getDocumentMetadataRecordState: path => {
      calls.push(`state:${path}`);
      return path === 'Email Imports/message.pdf'
        ? parentState
        : { ready: true, ok: true, registered: false };
    },
    vaultRootPath: '/vault',
    pathExists: path => {
      calls.push(`exists:${path}`);
      return false;
    },
    chooseAttachment: async model => {
      calls.push(`choose:${model.items.length}`);
      return { action: 'import', index: 0, pdfPath: 'Email Imports/document.pdf' };
    },
    getMetadataSchemaSnapshot: () => {
      calls.push('schema');
      return { fields: [] };
    },
    ensureTargetFolders: async path => { calls.push(`folders:${path}`); },
    createPdf: async (path, bytes) => {
      calls.push(`create:${path}:${Buffer.from(bytes).toString('ascii')}`);
      return { path };
    },
    saveDocumentMetadataRecordValues: async (path, values) => {
      calls.push(`save:${path}:${values.email_import_parent_record_id}`);
      return { ok: true };
    },
    deletePdf: async file => { calls.push(`delete:${file.path}`); },
    openPdf: async path => { calls.push(`open:${path}`); },
    onRollbackError: error => { calls.push(`rollback-error:${error.message}`); },
    services: defaultServices,
    ...overrides
  };

  if (overrides.services) options.services = { ...defaultServices, ...overrides.services };
  return { calls, options };
}

async function run() {
  {
    const { calls, options } = createHarness();
    const result = await runEmailPdfAttachmentImport(options);
    assert.equal(result.ok, true);
    assert.equal(result.pdfPath, 'Email Imports/document.pdf');
    assert.equal(result.parentPdfPath, 'Email Imports/message.pdf');
    assert.equal(result.attachmentSha256, ATTACHMENT_SHA);
    assert.equal(result.openError, null);
    assert.ok(calls.includes('load-retained'));
    assert.ok(calls.includes('choose:1'));
    assert.ok(calls.includes('create:Email Imports/document.pdf:%PDF-test'));
    assert.ok(calls.includes('save:Email Imports/document.pdf:parent-record-id'));
    assert.ok(calls.includes('open:Email Imports/document.pdf'));
  }

  {
    let loaderCalled = false;
    const { options } = createHarness({
      services: {
        sourceDescriptorFromEmailImportRecord: () => ({
          format: 'eml', sha256: SOURCE_SHA, byteSize: 123,
          originalFilename: 'message.eml', retained: false, retainedPath: ''
        }),
        loadCanonicalEmailFromRetainedRecord: async () => {
          loaderCalled = true;
          throw new Error('should not load');
        }
      }
    });
    const result = await runEmailPdfAttachmentImport(options);
    assert.deepEqual(result, { ok: false, reason: 'source-not-retained' });
    assert.equal(loaderCalled, false);
  }

  {
    let chooserCalled = false;
    const { options } = createHarness({
      chooseAttachment: async () => {
        chooserCalled = true;
        return { action: 'cancel' };
      },
      services: { analyzeEmailAttachments: () => ({ pdfCandidates: [] }) }
    });
    const result = await runEmailPdfAttachmentImport(options);
    assert.deepEqual(result, { ok: true, reason: 'no-pdf-attachments' });
    assert.equal(chooserCalled, false);
  }

  {
    let createCalled = false;
    const { options } = createHarness({
      createPdf: async () => {
        createCalled = true;
        return {};
      },
      services: {
        validateTargetPdfPath: () => ({ ok: false, error: 'Target path already exists.' })
      }
    });
    const result = await runEmailPdfAttachmentImport(options);
    assert.deepEqual(result, {
      ok: false,
      reason: 'invalid-target',
      error: 'Target path already exists.'
    });
    assert.equal(createCalled, false);
  }

  {
    const { calls, options } = createHarness({
      saveDocumentMetadataRecordValues: async () => ({ ok: false, error: 'metadata failed' })
    });
    await assert.rejects(
      () => runEmailPdfAttachmentImport(options),
      /metadata failed/
    );
    assert.ok(calls.includes('delete:Email Imports/document.pdf'));
  }

  {
    const openFailure = new Error('viewer unavailable');
    const { options } = createHarness({
      openPdf: async () => { throw openFailure; }
    });
    const result = await runEmailPdfAttachmentImport(options);
    assert.equal(result.ok, true);
    assert.equal(result.openError, openFailure);
  }

  console.log('Email Import PDF attachment controller OK: state validation, retained-source delegation, passive selection, target validation, write/metadata rollback and viewer handoff behavior verified.');
}

run().catch(error => {
  console.error('Email Import PDF attachment controller check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
