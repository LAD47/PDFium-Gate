'use strict';

const assert=require('assert/strict');
const emailRuntime=require('../src/email-import/runtime-entry');
const {EmailImportFeature}=require('../src/plugin/features/20-email-import');

global.EMAIL_IMPORT_RUNTIME=emailRuntime;
global.Notice=class Notice { constructor(){} };

(async()=>{
  const sourceSha='a'.repeat(64);
  const attachmentSha='b'.repeat(64);
  const zipPath='05 test/Persistence-Check.zip';
  const rapportPath='05 test/Persistence-Check/rapport.pdf';
  const vedtakPath='05 test/Persistence-Check/Vedlegg/vedtak.pdf';
  const recordPath='File Metadata/aa/parent.md';
  const opened=[];
  const modalModels=[];

  global.ArchiveImportPdfChoiceModal=class ArchiveImportPdfChoiceModal {
    constructor(_app,_plugin,model){ modalModels.push(model); }
    async openForDecision(){ return {action:'open',path:rapportPath}; }
  };

  const feature=new EmailImportFeature();
  feature.app={};
  feature.i18n={t:key=>key};
  feature.emailImportAdapter=()=>({
    async findDuplicatesBySha256(){ return [{recordPath}]; },
    async openVaultFile(path){ opened.push(path); return true; }
  });
  const files=new Map([
    [recordPath,{path:recordPath,extension:'md'}],
    [zipPath,{path:zipPath,extension:'zip'}],
    [rapportPath,{path:rapportPath,extension:'pdf'}],
    [vedtakPath,{path:vedtakPath,extension:'pdf'}]
  ]);
  feature.obsidianVaultReadAdapter={
    getAbstractFileByPath:path=>files.get(path)||null,
    async readText(){
      return [
        '<!-- pdfium-gate:email-attachments:start -->',
        `- [[${zipPath}]]`,
        '<!-- pdfium-gate:email-attachments:end -->'
      ].join('\n');
    }
  };
  feature.obsidianMetadataCacheAdapter={
    resolveLinkPath:path=>path
  };
  feature.ports={
    async findArchivePdfMembersForSourceZip(path){
      assert.equal(path,zipPath);
      return {ok:true,sourceZipPath:path,pdfPaths:[rapportPath,vedtakPath]};
    }
  };

  const result=await feature.openEmailAttachmentFromProtocol({
    source:sourceSha,
    attachment:attachmentSha,
    index:0
  });

  assert.equal(result.ok,true);
  assert.equal(result.redirectedFromArchive,true);
  assert.equal(result.sourceAttachmentPath,zipPath);
  assert.equal(result.path,rapportPath);
  assert.deepEqual(opened,[rapportPath]);
  assert.equal(modalModels.length,1);
  assert.deepEqual(modalModels[0].pdfPaths,[rapportPath,vedtakPath]);

  opened.length=0;
  modalModels.length=0;
  feature.ports.findArchivePdfMembersForSourceZip=async()=>({
    ok:true,sourceZipPath:zipPath,pdfPaths:[vedtakPath]
  });
  const single=await feature.openEmailAttachmentFromProtocol({
    source:sourceSha,
    attachment:attachmentSha,
    index:0
  });
  assert.equal(single.ok,true);
  assert.equal(single.redirectedFromArchive,true);
  assert.equal(single.path,vedtakPath);
  assert.deepEqual(opened,[vedtakPath]);
  assert.equal(modalModels.length,0);

  console.log('Email ZIP attachment link routing OK: one extracted PDF opens directly; multiple PDFs require an explicit user choice and the source ZIP remains provenance.');
})().catch(error=>{
  console.error('Email ZIP attachment link routing check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
