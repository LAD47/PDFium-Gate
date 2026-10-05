'use strict';

const assert = require('assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { sha256Hex } = require('../src/core/integrity/sha256');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const {
  safeArchiveEntryPath,
  inspectZipAttachment,
  extractZipAttachment
} = require('../src/email-import/attachments/zip-attachment');
const {
  suggestedArchiveFolderVaultPath,
  runAutomaticEmailAttachmentExport
} = require('../src/email-import/runtime/export-email-attachments-controller');

const SOURCE_SHA='a'.repeat(64);

function pdfBytes(label='ZIP PDF') {
  return Buffer.from(`%PDF-1.4\n% synthetic ${label}\n1 0 obj<<>>endobj\n%%EOF\n`,'utf8');
}

function makeZip(files) {
  const input={};
  for(const [name,bytes] of Object.entries(files)) input[name]=bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(zipSync(input,{level:6}));
}

function zipAttachment(files,name='Saksdokumenter.zip') {
  const content=makeZip(files);
  return {
    id:'zip-1',
    filename:name,
    contentType:'application/zip',
    content,
    size:content.length,
    sha256:sha256Hex(content)
  };
}

function wrapBase64(buffer) {
  return Buffer.from(buffer).toString('base64').match(/.{1,76}/g).join('\r\n');
}

function emlWithZip(zipBytes, zipName='Saksdokumenter.zip') {
  const boundary='pdfium-gate-zip-integration-test';
  return Buffer.from([
    'From: Test Sender <sender@example.invalid>',
    'To: Test Recipient <recipient@example.invalid>',
    'Date: Mon, 5 Oct 2026 08:01:00 +0200',
    'Subject: ZIP parser integration test',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    '',
    'ZIP integration test.',
    '',
    `--${boundary}`,
    `Content-Type: application/zip; name="${zipName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${zipName}"`,
    '',
    wrapBase64(zipBytes),
    '',
    `--${boundary}--`,
    ''
  ].join('\r\n'),'utf8');
}

async function run() {
  assert.equal(safeArchiveEntryPath('../evil.txt').ok,false);
  assert.equal(safeArchiveEntryPath('nested/report.pdf').path,'nested/report.pdf');
  assert.equal(
    suggestedArchiveFolderVaultPath('Cases/Saksdokumenter.zip',path=>path==='Cases/Saksdokumenter'),
    'Cases/Saksdokumenter (2)'
  );

  const attachment=zipAttachment({
    'rapport.pdf':pdfBytes(),
    'tekst/notat.txt':strToU8('notat'),
    'office/brev.docx':strToU8('synthetic docx placeholder')
  });
  const inspection=inspectZipAttachment(attachment);
  assert.equal(inspection.fileCount,3);
  assert.equal(inspection.pdfEntries.length,1);
  assert.equal(inspection.nativeEntries.length,1);
  assert.equal(inspection.unsupportedEntries.length,1);
  const supported=extractZipAttachment(attachment,inspection,{includeUnsupported:false});
  assert.deepEqual(supported.map(x=>[x.safePath,x.support]),[
    ['rapport.pdf','pdf'],
    ['tekst/notat.txt','native']
  ]);
  const all=extractZipAttachment(attachment,inspection,{includeUnsupported:true});
  assert.equal(all.length,3);

  {
    const zipBytes=makeZip({
      'rapport.pdf':pdfBytes('Parser PDF'),
      'underkatalog/vedtak.pdf':pdfBytes('Parser nested PDF')
    });
    const sourceBytes=emlWithZip(zipBytes);
    const parsed=await parseEml({sourceBytes,originalFilename:'zip-parser-integration.eml'});
    assert.equal(parsed.attachments.length,1);
    const parsedZip=parsed.attachments[0];
    assert.equal(parsedZip.filename,'Saksdokumenter.zip');
    assert.equal(parsedZip.contentType,'application/zip');
    assert.equal(Buffer.isBuffer(parsedZip.content),true);
    assert.equal(parsedZip.content.equals(zipBytes),true);
    const parsedInspection=inspectZipAttachment(parsedZip);
    assert.equal(parsedInspection.pdfEntries.length,2);
    const parsedExtracted=extractZipAttachment(parsedZip,parsedInspection);
    assert.deepEqual(parsedExtracted.map(entry=>entry.safePath),[
      'rapport.pdf',
      'underkatalog/vedtak.pdf'
    ]);
  }

  const unsafe=zipAttachment({
    '../evil.txt':strToU8('evil'),
    'safe/ok.txt':strToU8('ok')
  },'unsafe.zip');
  const unsafeInspection=inspectZipAttachment(unsafe);
  assert.equal(unsafeInspection.blockedEntries.length,1);
  assert.equal(unsafeInspection.nativeEntries.length,1);
  assert.equal(extractZipAttachment(unsafe,unsafeInspection).length,1);

  async function exercise(action) {
    const calls=[];
    const created=new Map();
    const metadata=new Map();
    const item={attachment,extractable:true,pdfCandidate:false,pdfEvidence:[]};
    const services={
      sourceDescriptorFromEmailImportRecord:()=>({retained:true,retainedPath:'.pdf-metadata/email-sources/aa/source.eml',sha256:SOURCE_SHA}),
      loadCanonicalEmailFromRetainedRecord:async()=>({document:{attachments:[attachment]}}),
      analyzeEmailAttachments:()=>({attachments:[item],inlineResources:[]}),
      buildEmailAttachmentImportRecordValues:({attachment:child})=>({values:{email_import_attachment_sha256:child.sha256}})
    };
    const result=await runAutomaticEmailAttachmentExport({
      parentPdfPath:'Cases/mail.pdf',
      ensureDocumentRecordIndexReady:async()=>{},
      getDocumentMetadataRecordState:path=>path==='Cases/mail.pdf'
        ? {ready:true,ok:true,registered:true,id:'parent-record',recordPath:'File Metadata/pa/parent-record.md',values:{email_import_source_sha256:SOURCE_SHA}}
        : {ready:true,ok:true,registered:false},
      vaultRootPath:'/vault',
      pathExists:path=>created.has(path),
      getMetadataSchemaSnapshot:()=>({fields:[]}),
      ensureTargetFolders:async path=>calls.push(`folders:${path}`),
      createBinary:async(path,bytes)=>{created.set(path,Buffer.from(bytes));calls.push(`create:${path}`);return {path};},
      deleteFile:async file=>{created.delete(file.path);calls.push(`delete:${file.path}`);},
      saveDocumentMetadataRecordValues:async(path,values)=>{metadata.set(path,values);calls.push(`metadata:${path}`);return {ok:true};},
      updateParentAttachmentLinks:async model=>{calls.push(`links:${model.attachmentPaths.join('|')}`);return {ok:true,linkedCount:model.attachmentPaths.length};},
      chooseUnsupportedArchiveFiles:async model=>{
        assert.equal(model.unsupportedCount,1);
        assert.equal(model.archives[0].unsupported[0].path,'office/brev.docx');
        return {action};
      },
      beforeCreateAttachment:async path=>calls.push(`before:${path}`),
      services
    });
    return {result,calls,created,metadata};
  }

  {
    const {result,created,metadata,calls}=await exercise('skip');
    assert.equal(result.ok,true);
    assert.equal(result.archiveMode,'supported-only');
    assert.ok(created.has('Cases/Saksdokumenter.zip'));
    assert.ok(created.has('Cases/Saksdokumenter/rapport.pdf'));
    assert.ok(created.has('Cases/Saksdokumenter/tekst/notat.txt'));
    assert.ok(!created.has('Cases/Saksdokumenter/office/brev.docx'));
    assert.ok(metadata.has('Cases/Saksdokumenter/rapport.pdf'));
    assert.equal(result.linkedCount,1);
    assert.ok(calls.includes('links:Cases/Saksdokumenter.zip'));
  }

  {
    const {result,created}=await exercise('keep');
    assert.equal(result.archiveMode,'all');
    assert.ok(created.has('Cases/Saksdokumenter/office/brev.docx'));
  }

  {
    const {result,created}=await exercise('cancel-archives');
    assert.equal(result.archiveMode,'none');
    assert.deepEqual([...created.keys()],['Cases/Saksdokumenter.zip']);
    assert.equal(result.linkedCount,1);
  }

  console.log('Email Import ZIP attachment checks OK: dedicated subfolders, preserved nested paths, normal PDF registration, one-shot unsupported-file decision, original ZIP relationship, and traversal blocking.');
}

run().catch(error=>{
  console.error('Email Import ZIP attachment check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
