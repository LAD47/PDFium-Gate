'use strict';

const assert=require('assert/strict');
const {zipSync,strToU8}=require('fflate');
const {parseEml}=require('../src/email-import/parsers/eml-parser');
const {analyzeEmailAttachments}=require('../src/email-import/attachments/attachment-policy');
const {sha256Hex}=require('../src/core/integrity/sha256');
const {runAutomaticEmailAttachmentExport}=require('../src/email-import/runtime/export-email-attachments-controller');

function mimeEmlWithZip(zipBytes){
  const boundary='pdfium-gate-modular-zip-boundary';
  const zipBase64=Buffer.from(zipBytes).toString('base64').replace(/(.{76})/g,'$1\r\n');
  return Buffer.from([
    'From: Test Sender <sender@example.invalid>',
    'To: Test Recipient <recipient@example.invalid>',
    'Date: Mon, 5 Oct 2026 13:20:00 +0200',
    'Subject: PDFium Gate modular ZIP handoff parser test',
    'Message-ID: <pdfium-gate-modular-zip-parser@example.invalid>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Synthetic modular handoff test.',
    `--${boundary}`,
    'Content-Type: application/zip; name="Modular-Handoff.zip"',
    'Content-Disposition: attachment; filename="Modular-Handoff.zip"',
    'Content-Transfer-Encoding: base64',
    '',
    zipBase64,
    `--${boundary}--`,
    ''
  ].join('\r\n'),'utf8');
}

(async()=>{
  const zipBytes=Buffer.from(zipSync({
    'rapport.pdf':strToU8('%PDF-1.4\nsynthetic\n%%EOF'),
    'Vedlegg/vedtak.pdf':strToU8('%PDF-1.4\nsynthetic decision\n%%EOF'),
    'Vedlegg/notat.txt':strToU8('note')
  },{level:6}));

  // First prove the real EML parser + real attachment policy exposes the ZIP
  // as an ordinary extractable attachment.
  const emlBytes=mimeEmlWithZip(zipBytes);
  const parsed=await parseEml({
    sourceBytes:emlBytes,
    originalFilename:'PDFium-Gate-email-ZIP-modular-handoff.eml'
  });
  assert.equal(parsed.attachments.length,1);
  assert.equal(parsed.attachments[0].filename,'Modular-Handoff.zip');
  assert.equal(parsed.attachments[0].contentType,'application/zip');
  assert.equal(parsed.attachments[0].disposition,'attachment');
  assert.equal(parsed.attachments[0].content.equals(zipBytes),true);
  const analyzed=analyzeEmailAttachments(parsed);
  assert.equal(analyzed.attachments.length,1);
  assert.equal(analyzed.attachments[0].extractable,true);
  assert.equal(analyzed.attachments[0].role,'attachment');

  // Then prove Email Import exports only the original ZIP and hands the
  // created vault file to Archive Import. It must not extract members itself.
  const sourceSha=sha256Hex(emlBytes);
  const attachment=parsed.attachments[0];
  const created=[];
  const linked=[];
  const routed=[];

  const result=await runAutomaticEmailAttachmentExport({
    parentPdfPath:'05 test/email.pdf',
    ensureDocumentRecordIndexReady:async()=>({ok:true}),
    getDocumentMetadataRecordState:path=>{
      if(path==='05 test/email.pdf') return {
        ready:true,ok:true,registered:true,id:'parent-id',recordPath:'File Metadata/aa/parent-id.md',
        values:{email_import_source_sha256:sourceSha}
      };
      return {ready:true,ok:true,registered:false,values:{}};
    },
    vaultRootPath:'C:/vault',
    pathExists:()=>false,
    getMetadataSchemaSnapshot:()=>({fields:[]}),
    ensureTargetFolders:async()=>{},
    createBinary:async(path,bytes)=>{
      const file={path,name:path.split('/').pop(),extension:(path.split('.').pop()||'').toLowerCase(),bytes:Buffer.from(bytes)};
      created.push(file);
      return file;
    },
    deleteFile:async()=>{},
    saveDocumentMetadataRecordValues:async()=>({ok:true}),
    updateParentAttachmentLinks:async model=>{
      linked.push(...model.attachmentPaths);
      return {ok:true,linkedCount:model.attachmentPaths.length};
    },
    beforeCreateAttachment:async()=>{},
    routeCreatedAttachments:async files=>{
      routed.push(...files);
      return {
        ok:true,
        handled:true,
        archiveCount:1,
        extractedArchiveCount:1,
        results:[{ok:true,zipPath:files[0].path,extractedCount:3}]
      };
    },
    services:{
      sourceDescriptorFromEmailImportRecord:()=>({
        retained:true,
        retainedPath:'.pdf-metadata/email-sources/source.eml',
        sha256:sourceSha
      }),
      loadCanonicalEmailFromRetainedRecord:async()=>({document:parsed})
    }
  });

  assert.equal(result.ok,true);
  assert.equal(result.exportedCount,1);
  assert.equal(result.failureCount,0);
  assert.deepEqual(created.map(item=>item.path),['05 test/Modular-Handoff.zip']);
  assert.deepEqual(linked,['05 test/Modular-Handoff.zip']);
  assert.equal(routed.length,1);
  assert.equal(routed[0].path,'05 test/Modular-Handoff.zip');
  assert.equal(result.archiveResult.archiveCount,1);
  assert.equal(result.archiveResult.extractedArchiveCount,1);
  assert.equal(result.exported.some(item=>item.fromArchive===true),false);

  console.log('Email Import ZIP handoff OK: real EML parser exposes the ZIP, Email Import creates and links only the original ZIP, then delegates the created file to Archive Import.');
})().catch(error=>{
  console.error('Email Import ZIP handoff check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
