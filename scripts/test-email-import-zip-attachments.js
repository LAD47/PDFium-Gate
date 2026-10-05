'use strict';

const assert=require('assert/strict');
const {zipSync,strToU8}=require('fflate');
const {parseEml}=require('../src/email-import/parsers/eml-parser');
const {
  buildEmailAttachmentPlan,
  finalizeEmailAttachmentPlan
}=require('../src/email-import/runtime/email-attachment-plan');
const {
  runPlannedEmailAttachmentExport
}=require('../src/email-import/runtime/export-email-attachments-controller');
const {sha256Hex}=require('../src/core/integrity/sha256');

function b64(bytes){
  return Buffer.from(bytes).toString('base64').replace(/(.{76})/g,'$1\r\n');
}

function multipartEml({zipOne,zipTwo,directPdf}){
  const boundary='pdfium-gate-multi-zip-boundary';
  const parts=[
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      'Synthetic multi-ZIP email attachment test.'
    ].join('\r\n'),
    [
      `--${boundary}`,
      'Content-Type: application/pdf; name="cover.pdf"',
      'Content-Disposition: attachment; filename="cover.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(directPdf)
    ].join('\r\n'),
    [
      `--${boundary}`,
      'Content-Type: application/zip; name="Dokumenter.zip"',
      'Content-Disposition: attachment; filename="Dokumenter.zip"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(zipOne)
    ].join('\r\n'),
    [
      `--${boundary}`,
      'Content-Type: application/zip; name="Saksvedlegg.zip"',
      'Content-Disposition: attachment; filename="Saksvedlegg.zip"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(zipTwo)
    ].join('\r\n')
  ];
  return Buffer.from([
    'From: Test Sender <sender@example.invalid>',
    'To: Test Recipient <recipient@example.invalid>',
    'Date: Mon, 5 Oct 2026 18:00:00 +0200',
    'Subject: Multi ZIP attachment model',
    'Message-ID: <pdfium-gate-multi-zip@example.invalid>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...parts,
    `--${boundary}--`,
    ''
  ].join('\r\n'),'utf8');
}

(async()=>{
  const directPdf=Buffer.from('%PDF-1.4\ndirect cover\n%%EOF');
  const zipOne=Buffer.from(zipSync({
    'rapport.pdf':strToU8('%PDF-1.4\nreport\n%%EOF'),
    'Vedlegg/notat.txt':strToU8('note one')
  },{level:6}));
  const zipTwo=Buffer.from(zipSync({
    'vedtak.pdf':strToU8('%PDF-1.4\ndecision\n%%EOF'),
    'Vedlegg/notat.txt':strToU8('note two')
  },{level:6}));

  const emlBytes=multipartEml({zipOne,zipTwo,directPdf});
  const parsed=await parseEml({
    sourceBytes:emlBytes,
    originalFilename:'multi-zip.eml'
  });
  assert.equal(parsed.attachments.length,3);

  const parentPdfPath='05 test/2026-10-05 - Multi ZIP attachment model.pdf';
  const plan=finalizeEmailAttachmentPlan(buildEmailAttachmentPlan({
    document:parsed,
    parentPdfPath
  }));

  assert.equal(plan.folderPath,'05 test/2026-10-05 - Multi ZIP attachment model');
  assert.equal(plan.attachmentCount,3);
  assert.equal(plan.archiveCount,2);
  assert.equal(plan.outputCount,5);
  assert.deepEqual(plan.entries.map(entry=>entry.relativePath),[
    'cover.pdf',
    'rapport.pdf',
    'Vedlegg/notat.txt',
    'vedtak.pdf',
    'Vedlegg/notat (2).txt'
  ]);
  assert.deepEqual(plan.groups.map(group=>[group.type,group.label,group.entries.length]),[
    ['direct','cover.pdf',1],
    ['archive','Dokumenter.zip',2],
    ['archive','Saksvedlegg.zip',2]
  ]);
  assert.equal(plan.entries.some(entry=>/\.zip$/i.test(entry.relativePath)),false);

  const sourceSha=sha256Hex(emlBytes);
  const created=new Map();
  const registered=new Set();
  const deleted=[];
  const parentLinks=[];
  const archiveRelations=[];

  const result=await runPlannedEmailAttachmentExport({
    parentPdfPath,
    plan,
    ensureDocumentRecordIndexReady:async()=>({ok:true}),
    getDocumentMetadataRecordState:path=>path===parentPdfPath
      ? {
          ready:true,ok:true,registered:true,id:'parent-id',
          recordPath:'File Metadata/aa/parent-id.md',
          values:{email_import_source_sha256:sourceSha}
        }
      : {ready:true,ok:true,registered:registered.has(path),values:{}},
    getMetadataSchemaSnapshot:()=>({fields:[]}),
    ensureTargetFolders:async()=>{},
    createBinary:async(path,bytes)=>{
      const file={path,extension:(path.split('.').pop()||'').toLowerCase(),bytes:Buffer.from(bytes)};
      created.set(path,file);
      return file;
    },
    readBinary:async file=>Buffer.from(file.bytes),
    deleteFile:async file=>{ deleted.push(file.path); created.delete(file.path); },
    deleteFolder:async()=>{ for(const path of [...created.keys()]) created.delete(path); },
    deleteDocumentMetadataRecordForPdf:async path=>{ registered.delete(path); return {ok:true,deleted:true}; },
    saveDocumentMetadataRecordValues:async path=>{ registered.add(path); return {ok:true}; },
    updateParentAttachmentLinks:async model=>{
      parentLinks.splice(0,parentLinks.length,...model.attachmentPaths);
      return {ok:true,linkedCount:model.attachmentPaths.length};
    },
    writeArchiveRelationshipForPdf:async model=>{
      archiveRelations.push(model);
      return {ok:true,linked:true};
    }
  });

  assert.equal(result.ok,true);
  assert.equal(result.exportedCount,5);
  assert.equal(result.archiveCount,2);
  assert.equal(result.folderPath,plan.folderPath);
  assert.equal([...created.keys()].some(path=>/\.zip$/i.test(path)),false);
  assert.deepEqual(parentLinks,plan.entries.map(entry=>`${plan.folderPath}/${entry.relativePath}`));
  assert.equal(registered.has(`${plan.folderPath}/cover.pdf`),true);
  assert.equal(registered.has(`${plan.folderPath}/rapport.pdf`),true);
  assert.equal(registered.has(`${plan.folderPath}/vedtak.pdf`),true);
  assert.equal(archiveRelations.length,2);
  assert.deepEqual(archiveRelations.map(item=>item.provenance.sourceArchiveName).sort(),[
    'Dokumenter.zip','Saksvedlegg.zip'
  ]);
  assert.ok(archiveRelations.every(item=>item.provenance.parentDocumentPath===parentPdfPath));

  console.log('Email Import multi-ZIP attachment model OK: complete preflight plan, one sibling attachment folder, multiple ZIP contents merged safely with collision suffixes, no ZIP transport files persisted, PDFs registered, parent links ordered to match the email PDF, and archive provenance retained on nested PDFs.');
})().catch(error=>{
  console.error('Email Import multi-ZIP attachment model check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
