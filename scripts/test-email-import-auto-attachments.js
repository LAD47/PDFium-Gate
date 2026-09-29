'use strict';

const assert = require('assert/strict');
const {
  suggestedAttachmentVaultPath,
  runAutomaticEmailAttachmentExport
} = require('../src/email-import/runtime/export-email-attachments-controller');

const SOURCE_SHA = 'a'.repeat(64);
const TXT_SHA = 'b'.repeat(64);
const PDF_SHA = 'c'.repeat(64);

function createHarness(overrides = {}) {
  const calls = [];
  const txt = { id:'txt-1', filename:'notes.txt', contentType:'text/plain', content:Buffer.from('notes'), size:5, sha256:TXT_SHA };
  const pdf = { id:'pdf-1', filename:'report.pdf', contentType:'application/pdf', content:Buffer.from('%PDF-test\n%%EOF'), size:15, sha256:PDF_SHA };
  const services = {
    sourceDescriptorFromEmailImportRecord: () => ({ retained:true, retainedPath:'.pdf-metadata/email-sources/aa/source.eml', sha256:SOURCE_SHA }),
    loadCanonicalEmailFromRetainedRecord: async () => ({ document:{ attachments:[txt,pdf] } }),
    analyzeEmailAttachments: () => ({
      attachments:[
        { attachment:txt, extractable:true, pdfCandidate:false, pdfEvidence:[] },
        { attachment:pdf, extractable:true, pdfCandidate:true, pdfEvidence:['payload','mime','filename'] }
      ],
      inlineResources:[{ attachment:{ filename:'logo.png' } }]
    }),
    sanitizeAttachmentFilename: attachment => String(attachment || ''),
    verifiedAttachmentBytes: attachment => ({ bytes:Buffer.from(attachment.content), sha256:attachment.sha256 }),
    verifiedPdfAttachmentBytes: attachment => ({ bytes:Buffer.from(attachment.content), sha256:attachment.sha256 }),
    buildEmailAttachmentImportRecordValues: ({ parentRecordId, sourceSha256, attachment }) => {
      assert.equal(parentRecordId,'parent-record');
      assert.equal(sourceSha256,SOURCE_SHA);
      assert.equal(attachment.sha256,PDF_SHA);
      return { values:{ email_import_attachment_sha256:PDF_SHA } };
    }
  };

  const options = {
    parentPdfPath:'Cases/mail.pdf',
    ensureDocumentRecordIndexReady:async()=>calls.push('ensure-index'),
    getDocumentMetadataRecordState:path=>path==='Cases/mail.pdf'
      ? { ready:true, ok:true, registered:true, id:'parent-record', recordPath:'File Metadata/pa/parent-record.md', values:{ email_import_source_sha256:SOURCE_SHA } }
      : { ready:true, ok:true, registered:false },
    vaultRootPath:'/vault',
    pathExists:()=>false,
    getMetadataSchemaSnapshot:()=>({ fields:[] }),
    ensureTargetFolders:async path=>calls.push(`folders:${path}`),
    createBinary:async(path,bytes)=>{ calls.push(`create:${path}:${Buffer.from(bytes).toString('ascii')}`); return {path}; },
    deleteFile:async file=>calls.push(`delete:${file.path}`),
    saveDocumentMetadataRecordValues:async(path,values)=>{ calls.push(`save:${path}:${values.email_import_attachment_sha256}`); return {ok:true}; },
    updateParentAttachmentLinks:async model=>{
      calls.push(`links:${model.parentRecordPath}:${model.attachmentPaths.join('|')}`);
      return {ok:true,linkedCount:model.attachmentPaths.length};
    },
    beforeCreateAttachment:async path=>calls.push(`before:${path}`),
    onRollbackError:error=>calls.push(`rollback-error:${error.message}`),
    services,
    ...overrides
  };
  if (overrides.services) options.services = { ...services, ...overrides.services };
  return { calls, options, txt, pdf };
}

async function run() {
  assert.equal(
    suggestedAttachmentVaultPath('Cases/mail.pdf',{filename:'report.pdf'},path=>path==='Cases/report.pdf'),
    'Cases/report (2).pdf'
  );
  assert.equal(
    suggestedAttachmentVaultPath('mail.pdf',{filename:'notes.txt'},()=>false),
    'notes.txt'
  );

  {
    const { calls, options } = createHarness();
    const result = await runAutomaticEmailAttachmentExport(options);
    assert.equal(result.ok,true);
    assert.equal(result.exportedCount,2);
    assert.equal(result.failureCount,0);
    assert.equal(result.linkedCount,2);
    assert.equal(result.relationError,null);
    assert.deepEqual(result.exported.map(item=>[item.path,item.pdfRegistered]),[
      ['Cases/notes.txt',false],
      ['Cases/report.pdf',true]
    ]);
    assert.ok(calls.includes('before:Cases/notes.txt'));
    assert.ok(calls.includes('before:Cases/report.pdf'));
    assert.ok(calls.includes('create:Cases/notes.txt:notes'));
    assert.ok(calls.includes('create:Cases/report.pdf:%PDF-test\n%%EOF'));
    assert.ok(calls.includes(`save:Cases/report.pdf:${PDF_SHA}`));
    assert.ok(calls.includes('links:File Metadata/pa/parent-record.md:Cases/notes.txt|Cases/report.pdf'));
    assert.ok(!calls.some(item=>item.includes('logo.png')));
  }

  {
    const { calls, options } = createHarness({
      saveDocumentMetadataRecordValues:async path=>path.endsWith('report.pdf')
        ? {ok:false,error:'metadata failed'}
        : {ok:true}
    });
    const result = await runAutomaticEmailAttachmentExport(options);
    assert.equal(result.ok,true);
    assert.equal(result.exportedCount,1);
    assert.equal(result.failureCount,1);
    assert.equal(result.linkedCount,1);
    assert.equal(result.failures[0].filename,'report.pdf');
    assert.ok(calls.includes('delete:Cases/report.pdf'));
    assert.ok(calls.includes('create:Cases/notes.txt:notes'));
    assert.ok(calls.includes('links:File Metadata/pa/parent-record.md:Cases/notes.txt'));
  }

  {
    const { options } = createHarness({
      updateParentAttachmentLinks:async()=>{ throw new Error('link write failed'); }
    });
    const result = await runAutomaticEmailAttachmentExport(options);
    assert.equal(result.ok,true);
    assert.equal(result.exportedCount,2);
    assert.equal(result.linkedCount,0);
    assert.equal(result.relationError,'link write failed');
  }

  {
    const { options } = createHarness({
      services:{ analyzeEmailAttachments:()=>({attachments:[],inlineResources:[]}) }
    });
    const result = await runAutomaticEmailAttachmentExport(options);
    assert.equal(result.reason,'no-attachments');
    assert.deepEqual(result.exported,[]);
    assert.equal(result.linkedCount,0);
  }

  console.log('Email Import automatic attachment export OK: ordinary attachments export beside parent PDF, inline resources stay hidden, PDFs receive provenance metadata, native parent links cover only successful exports, and relation-write failures preserve exported files.');
}

run().catch(error=>{
  console.error('Email Import automatic attachment export check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
