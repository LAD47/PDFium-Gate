'use strict';

const assert=require('assert/strict');
const {runAutomaticEmailAttachmentExport}=require('../src/email-import/runtime/export-email-attachments-controller');

(async()=>{
  const sourceSha='a'.repeat(64);
  const zipBytes=Buffer.from('PK\\x03\\x04synthetic-zip-payload','binary');
  const attachment={
    id:'zip-1',
    filename:'Saksdokumenter.zip',
    contentType:'application/zip',
    content:zipBytes,
    size:zipBytes.length,
    sha256:'b'.repeat(64)
  };

  const created=[];
  const linked=[];
  const routed=[];
  const createdFile={path:'05 test/Saksdokumenter.zip',name:'Saksdokumenter.zip',extension:'zip'};

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
      created.push({path,bytes:Buffer.from(bytes)});
      return {...createdFile,path};
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
        results:[{ok:true,zipPath:files[0].path,extractedCount:2}]
      };
    },
    services:{
      sourceDescriptorFromEmailImportRecord:()=>({retained:true,retainedPath:'.pdf-metadata/email-sources/source.eml',sha256:sourceSha}),
      loadCanonicalEmailFromRetainedRecord:async()=>({document:{attachments:[attachment]}}),
      analyzeEmailAttachments:()=>({attachments:[{
        extractable:true,
        attachment,
        pdfCandidate:false,
        pdfEvidence:[]
      }]}),
      verifiedAttachmentBytes:()=>({bytes:zipBytes,sha256:attachment.sha256}),
      sanitizeAttachmentFilename:()=>attachment.filename
    }
  });

  assert.equal(result.ok,true);
  assert.equal(result.exportedCount,1);
  assert.equal(result.failureCount,0);
  assert.deepEqual(created.map(item=>item.path),['05 test/Saksdokumenter.zip']);
  assert.deepEqual(linked,['05 test/Saksdokumenter.zip']);
  assert.equal(routed.length,1);
  assert.equal(routed[0].path,'05 test/Saksdokumenter.zip');
  assert.equal(result.archiveResult.archiveCount,1);
  assert.equal(result.archiveResult.extractedArchiveCount,1);
  assert.equal(result.exported.some(item=>item.fromArchive===true),false);

  console.log('Email Import ZIP handoff OK: Email Import creates and links only the original ZIP, then delegates the created file to Archive Import.');
})().catch(error=>{
  console.error('Email Import ZIP handoff check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
