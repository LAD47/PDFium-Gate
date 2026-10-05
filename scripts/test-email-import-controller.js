'use strict';

const assert = require('assert/strict');
const { sourceFormatFromPath, runEmailImport } = require('../src/email-import/runtime/import-email-controller');

const SOURCE_SHA = 'a'.repeat(64);

function createHarness(overrides = {}) {
  const calls = [];
  const document = {
    source: { format: 'eml', sha256: SOURCE_SHA },
    message: {
      subject: 'Test subject',
      from: [{ name: 'Sender', address: 'sender@example.invalid' }],
      dateTime: { raw: '2026-09-29 10:00', iso: '2026-09-29T10:00:00+02:00' }
    }
  };

  const defaultServices = {
    detectExactSourceDuplicate: async ({ sourceBytes, findBySourceSha256 }) => {
      assert.equal(Buffer.from(sourceBytes).toString('utf8'), 'source-bytes');
      const matches = await findBySourceSha256(SOURCE_SHA);
      return { sha256: SOURCE_SHA, exactDuplicate: matches.length > 0, matches };
    },
    parseEml: async ({ sourceBytes, originalFilename }) => {
      assert.equal(Buffer.from(sourceBytes).toString('utf8'), 'source-bytes');
      assert.equal(originalFilename, 'message.eml');
      return document;
    },
    parseMsg: async () => { throw new Error('MSG parser should not run'); },
    suggestedEmailPdfPath: () => 'Email Imports/2026-09-29 - Test subject.pdf',
    validateTargetPdfPath: value => ({ ok: true, path: value }),
    retainOriginalSource: async ({ document: input, enabled }) => {
      calls.push(`retain:${enabled}`);
      return { created: enabled === true, document: input };
    },
    removeRetainedSourceIfExact: async () => { calls.push('remove-retained'); },
    buildEmailImportRegistrationPlan: ({ document: input }) => {
      assert.equal(input, document);
      return { ok: true, values: { email_import_source_sha256: SOURCE_SHA } };
    },
    generateEmailPdf: async ({ document: input, attachmentManifest, printHtmlToPdf }) => {
      assert.equal(input, document);
      assert.deepEqual(attachmentManifest,{folderPath:'Email Imports/2026-09-29 - Test subject Vedlegg',groups:[]});
      await printHtmlToPdf({ html: '<html>controlled</html>' });
      return Buffer.from('%PDF-test');
    }
  };

  const options = {
    chooseSource: async () => ({ canceled: false, filePath: '/tmp/message.eml' }),
    readSourceBytes: async path => {
      calls.push(`read:${path}`);
      return Buffer.from('source-bytes');
    },
    findBySourceSha256: async sha => {
      calls.push(`find:${sha}`);
      return [];
    },
    chooseReview: async model => {
      calls.push(`review:${model.summary.sender}`);
      assert.equal(model.summary.sourceFilename, 'message.eml');
      assert.equal(model.summary.sender, 'Sender <sender@example.invalid>');
      return {
        action: 'import',
        retainSource: true,
        pdfPath: 'Email Imports/2026-09-29 - Test subject.pdf'
      };
    },
    pathExists: () => false,
    getMetadataSchemaSnapshot: () => ({ fields: [] }),
    ensureDocumentRecordIndexReady: async () => { calls.push('ensure-index'); },
    getDocumentMetadataRecordState: path => {
      calls.push(`state:${path}`);
      return { ready: true, ok: true, registered: false };
    },
    vaultRootPath: '/vault',
    printHtmlToPdf: async ({ html }) => {
      calls.push(`print:${html.includes('controlled')}`);
      return Buffer.from('%PDF-printer');
    },
    ensureTargetFolders: async path => { calls.push(`folders:${path}`); },
    createPdf: async (path, bytes) => {
      calls.push(`create:${path}:${Buffer.from(bytes).toString('ascii')}`);
      return { path };
    },
    saveDocumentMetadataRecordValues: async (path, values) => {
      calls.push(`save:${path}:${values.email_import_source_sha256}`);
      return { ok: true };
    },
    deletePdf: async file => { calls.push(`delete:${file.path}`); },
    openPdf: async path => { calls.push(`open:${path}`); },
    onPdfRollbackError: error => { calls.push(`pdf-rollback-error:${error.message}`); },
    onRetainedRollbackError: error => { calls.push(`retained-rollback-error:${error.message}`); },
    attachmentFolderLabel:'Vedlegg',
    services: defaultServices,
    ...overrides
  };

  if (overrides.services) options.services = { ...defaultServices, ...overrides.services };
  return { calls, options };
}

async function run() {
  assert.equal(sourceFormatFromPath('mail.EML'), 'eml');
  assert.equal(sourceFormatFromPath('mail.msg'), 'msg');
  assert.equal(sourceFormatFromPath('mail.txt'), null);

  {
    const { calls, options } = createHarness();
    const result = await runEmailImport(options);
    assert.equal(result.ok, true);
    assert.equal(result.pdfPath, 'Email Imports/2026-09-29 - Test subject.pdf');
    assert.equal(result.duplicate, false);
    assert.equal(result.openError, null);
    assert.ok(calls.includes(`find:${SOURCE_SHA}`));
    assert.ok(calls.includes('retain:true'));
    assert.ok(calls.includes('print:true'));
    assert.ok(calls.includes('create:Email Imports/2026-09-29 - Test subject.pdf:%PDF-test'));
    assert.ok(calls.includes(`save:Email Imports/2026-09-29 - Test subject.pdf:${SOURCE_SHA}`));
    assert.ok(calls.includes('open:Email Imports/2026-09-29 - Test subject.pdf'));
  }

  {
    let readCalled = false;
    const { options } = createHarness({
      chooseSource: async () => ({ canceled: false, filePath: '/tmp/message.txt' }),
      readSourceBytes: async () => {
        readCalled = true;
        return Buffer.alloc(0);
      }
    });
    const result = await runEmailImport(options);
    assert.deepEqual(result, { ok: false, reason: 'unsupported-source' });
    assert.equal(readCalled, false);
  }

  {
    const { calls, options } = createHarness({
      chooseReview: async () => ({
        action: 'open-existing',
        match: { pdfPath: 'Email Imports/existing.pdf' }
      })
    });
    const result = await runEmailImport(options);
    assert.deepEqual(result, {
      ok:true,
      openedExisting:true,
      duplicate:true,
      sourceSha256:SOURCE_SHA,
      pdfPath:'Email Imports/existing.pdf'
    });
    assert.ok(calls.includes('open:Email Imports/existing.pdf'));
    assert.ok(!calls.some(item => item.startsWith('create:')));
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
    const result = await runEmailImport(options);
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
    await assert.rejects(() => runEmailImport(options), /metadata failed/);
    assert.ok(calls.includes('delete:Email Imports/2026-09-29 - Test subject.pdf'));
    assert.ok(calls.includes('remove-retained'));
  }

  {
    const openFailure = new Error('viewer unavailable');
    const { options } = createHarness({
      openPdf: async () => { throw openFailure; }
    });
    const result = await runEmailImport(options);
    assert.equal(result.ok, true);
    assert.equal(result.openError, openFailure);
  }

  console.log('Email Import source controller OK: source selection, type gating, duplicate lookup, attachment preflight manifest, target validation, optional retention/PDF rollback and viewer handoff behavior verified.');
}

run().catch(error => {
  console.error('Email Import source controller check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
