'use strict';

const assert=require('assert/strict');
const {zipSync,strToU8}=require('fflate');
const archiveRuntime=require('../src/archive-import/runtime-entry');
const {ArchiveImportFeature}=require('../src/plugin/features/21-archive-import');
const {DocumentInfoFeature}=require('../src/plugin/features/15-document-info');

global.ARCHIVE_IMPORT_RUNTIME=archiveRuntime;
global.Notice=class Notice {
  constructor(message){ Notice.messages.push(String(message)); }
};
global.Notice.messages=[];
global.ArchiveImportUnsupportedFilesModal=class ArchiveImportUnsupportedFilesModal {
  async openForDecision(){ return {action:'skip'}; }
};
global.ArchiveImportFailureModal=class ArchiveImportFailureModal {
  async openForDecision(){ return {action:'keep'}; }
};

function zip(files){
  const input={};
  for(const [name,value] of Object.entries(files)) {
    input[name]=value instanceof Uint8Array?value:strToU8(String(value));
  }
  return Buffer.from(zipSync(input,{level:6}));
}

class FakeElement {
  constructor(tag='div',opts={}){
    this.tag=tag;
    this.cls=String(opts.cls||'');
    this.text=String(opts.text||'');
    this.children=[];
    this.attributes={};
    this.listeners={};
    this.isConnected=true;
    this.parent=null;
  }
  createEl(tag,opts={}){ const child=new FakeElement(tag,opts); child.parent=this; this.children.push(child); return child; }
  createDiv(opts={}){ return this.createEl('div',opts); }
  setAttribute(name,value){ this.attributes[name]=String(value); }
  addEventListener(type,handler){ this.listeners[type]=handler; }
  async click(){
    const handler=this.listeners.click;
    if(handler) await handler({preventDefault(){},stopPropagation(){}});
  }
  empty(){ this.children=[]; this.text=''; }
  remove(){ this.isConnected=false; if(this.parent) this.parent.children=this.parent.children.filter(child=>child!==this); }
  all(){ return [this,...this.children.flatMap(child=>child.all())]; }
}

function createHost({zipBytes,zipPath='05 test/archive.zip',existing=[],failCreateAt=0}){
  const nodes=new Map(existing.map(path=>[path,{path,children:[]}]));
  const createdFiles=new Map();
  const recordsByPdf=new Map();
  let recordSeq=0;
  let createSeq=0;
  const sourceFile={
    path:zipPath,
    name:zipPath.split('/').pop(),
    extension:'zip',
    bytes:Buffer.from(zipBytes)
  };
  nodes.set(zipPath,sourceFile);

  const host=new ArchiveImportFeature();
  host.app={};
  host.i18n={t:key=>key};
  host.state={archiveImport:{
    suppressedPaths:new Set(),
    inFlight:new Set(),
    deferredPaths:new Set(),
    reconcileInFlight:false,
    lastResult:null
  }};
  host.obsidianVaultReadAdapter={
    async readBinary(file){ return Buffer.from(file?.bytes||[]); },
    async readText(file){ return String(file?.text||''); },
    getAbstractFileByPath(path){ return nodes.get(path)||createdFiles.get(path)||null; },
    listMarkdownFiles(){ return [...nodes.values()].filter(file=>String(file?.extension||'').toLowerCase()==='md'); },
    listFiles(){
      return [
        ...[...nodes.values()].filter(file=>file && typeof file.extension==='string'),
        ...createdFiles.values()
      ];
    },
    getBasePath(){ return 'C:/test-vault'; }
  };
  host.obsidianMetadataCacheAdapter={
    getFrontmatter(file){ return file?.frontmatter||null; },
    resolveLinkPath(linkPath){ return String(linkPath||'').replace(/^\/+|\/+$/g,''); }
  };
  host.obsidianVaultWriteAdapter={
    async ensureFolder(path){
      if(!nodes.has(path)) nodes.set(path,{path,children:[]});
      return nodes.get(path);
    },
    async createBinary(path,bytes){
      createSeq++;
      if(failCreateAt && createSeq===failCreateAt) throw new Error('synthetic create failure');
      if(nodes.has(path)||createdFiles.has(path)) throw new Error(`exists: ${path}`);
      const file={
        path,
        name:path.split('/').pop(),
        extension:(path.split('.').pop()||'').toLowerCase(),
        bytes:Buffer.from(bytes)
      };
      createdFiles.set(path,file);
      return file;
    },
    async modifyText(file,data){ file.text=String(data); return file; },
    async deleteFile(file){
      const target=String(file?.path||'');
      if(Array.isArray(file?.children)){
        for(const path of [...nodes.keys()]) if(path===target || path.startsWith(target+'/')) nodes.delete(path);
        for(const path of [...createdFiles.keys()]) if(path===target || path.startsWith(target+'/')) createdFiles.delete(path);
      } else {
        nodes.delete(target);
        createdFiles.delete(target);
      }
    }
  };
  host.ports={
    async handleDocumentRecordVaultCreate(file){
      if(String(file?.extension||'').toLowerCase()!=='pdf') return {ok:true,ignored:true};
      if(recordsByPdf.has(file.path)){
        const existingRecord=recordsByPdf.get(file.path);
        return {ok:true,created:false,id:existingRecord.id,recordPath:existingRecord.recordPath};
      }
      recordSeq++;
      const id=`record-${recordSeq}`;
      const recordPath=`File Metadata/test/${id}.md`;
      const recordFile={
        path:recordPath,
        name:`${id}.md`,
        extension:'md',
        frontmatter:{
          filemeta_id:id,
          filemeta_file:`[[${file.path}]]`,
          filemeta_status:'active'
        },
        text:`---\nfilemeta_id: ${id}\nfilemeta_file: "[[${file.path}]]"\nfilemeta_status: active\n---\n`
      };
      nodes.set(recordPath,recordFile);
      const state={ready:true,ok:true,registered:true,id,recordPath,status:'active',pdfPath:file.path,values:{}};
      recordsByPdf.set(file.path,state);
      return {ok:true,created:true,id,recordPath};
    },
    async ensureDocumentRecordIndexReady(){ return {ok:true}; },
    getDocumentMetadataRecordState(pdfPath){
      return recordsByPdf.get(pdfPath)||{ready:true,ok:true,registered:false,values:{}};
    },
    async deleteDocumentMetadataRecordForPdf(pdfPath){
      const state=recordsByPdf.get(pdfPath);
      if(!state) return {ok:true,deleted:false};
      nodes.delete(state.recordPath);
      recordsByPdf.delete(pdfPath);
      return {ok:true,deleted:true};
    }
  };
  return {host,nodes,createdFiles,recordsByPdf,sourceFile};
}

(async()=>{
  const basicBytes=zip({
    'README-test.txt':'root',
    'Dokumenter/notat.txt':'note',
    'Dokumenter/Underkatalog/info.txt':'deep',
    'Data/test.json':'{"ok":true}'
  });
  const basic=createHost({zipBytes:basicBytes,zipPath:'05 test/PDFium-Gate-ZIP-test-01.zip'});
  const basicResult=await basic.host.handleArchiveImportVaultCreate(basic.sourceFile);
  assert.equal(basicResult.ok,true);
  assert.equal(basicResult.sourceDeleted,true);
  assert.equal(basicResult.targetFolder,'05 test/PDFium-Gate-ZIP-test-01');
  assert.equal(basicResult.extractedCount,4);
  assert.equal(basic.host.obsidianVaultReadAdapter.getAbstractFileByPath(basic.sourceFile.path),null);
  assert.ok(basic.nodes.has('05 test/PDFium-Gate-ZIP-test-01'));
  assert.deepEqual([...basic.createdFiles.keys()].sort(),[
    '05 test/PDFium-Gate-ZIP-test-01/Data/test.json',
    '05 test/PDFium-Gate-ZIP-test-01/Dokumenter/Underkatalog/info.txt',
    '05 test/PDFium-Gate-ZIP-test-01/Dokumenter/notat.txt',
    '05 test/PDFium-Gate-ZIP-test-01/README-test.txt'
  ]);

  const collision=createHost({
    zipBytes:basicBytes,
    zipPath:'05 test/PDFium-Gate-ZIP-test-01.zip',
    existing:['05 test/PDFium-Gate-ZIP-test-01']
  });
  assert.equal(
    collision.host.archiveImportSuggestedFolderPath(collision.sourceFile.path),
    '05 test/PDFium-Gate-ZIP-test-01 (2)'
  );

  const relationshipBytes=zip({
    'rapport.pdf':'%PDF synthetic report',
    'Underkatalog/vedtak.pdf':'%PDF synthetic decision',
    'README.txt':'archive notes'
  });
  const linked=createHost({zipBytes:relationshipBytes,zipPath:'05 test/PDFium-Gate-ZIP-test-02-PDF.zip'});
  const linkedResult=await linked.host.handleArchiveImportVaultCreate(linked.sourceFile);
  assert.equal(linkedResult.ok,true);
  assert.equal(linkedResult.sourceDeleted,true);
  assert.equal(linkedResult.extractedCount,3);
  assert.equal(linkedResult.linkedPdfCount,2);
  assert.equal(linkedResult.vaultRootPath,'C:/test-vault');

  const rapportPath='05 test/PDFium-Gate-ZIP-test-02-PDF/rapport.pdf';
  const vedtakPath='05 test/PDFium-Gate-ZIP-test-02-PDF/Underkatalog/vedtak.pdf';
  const readmePath='05 test/PDFium-Gate-ZIP-test-02-PDF/README.txt';
  const rapportState=linked.recordsByPdf.get(rapportPath);
  const vedtakState=linked.recordsByPdf.get(vedtakPath);
  assert.ok(rapportState);
  assert.ok(vedtakState);

  const rapportRecord=linked.nodes.get(rapportState.recordPath);
  const rapportRelation=archiveRuntime.extractArchiveRelationship(rapportRecord.text);
  assert.equal(rapportRelation.sourceZipPath,null);
  assert.equal(rapportRelation.sourceArchiveName,'PDFium-Gate-ZIP-test-02-PDF.zip');
  assert.equal(rapportRelation.sourceArchiveSha256,archiveRuntime.sha256Hex(relationshipBytes));
  assert.equal(rapportRelation.parentDocumentPath,null);
  assert.deepEqual(rapportRelation.memberPaths,[vedtakPath,readmePath]);

  const openedLinks=[];
  const documentInfo=new DocumentInfoFeature();
  documentInfo.app={workspace:{async openLinkText(linktext,sourcePath,newLeaf){
    openedLinks.push({linktext,sourcePath,newLeaf});
  }}};
  documentInfo.i18n={t:key=>({
    'documentInfo.archive.title':'Vedlegg fra ZIP',
    'documentInfo.archive.source':'Kildearkiv',
    'documentInfo.archive.related':'Filer i samme arkiv',
    'documentInfo.archive.none':'Ingen andre filer i dette arkivet.'
  })[key]||key};
  documentInfo.obsidianVaultReadAdapter={
    getAbstractFileByPath:path=>linked.nodes.get(path)||null,
    async readText(file){ return String(file?.text||''); }
  };
  const relationHost=new FakeElement('div');
  const relationView={file:{path:rapportPath}};
  const displayed=await documentInfo.renderDocumentInfoArchiveRelations(
    relationHost,relationView,rapportPath,rapportState
  );
  assert.equal(displayed.sourceArchiveName,'PDFium-Gate-ZIP-test-02-PDF.zip');
  const anchors=relationHost.all().filter(node=>node.tag==='a');
  assert.deepEqual(anchors.map(node=>node.attributes['data-href']),[vedtakPath,readmePath]);
  await anchors[0].click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(openedLinks,[{linktext:vedtakPath,sourcePath:rapportPath,newLeaf:false}]);

  const rollbackBytes=zip({'one.txt':'1','two.txt':'2'});
  const rollback=createHost({
    zipBytes:rollbackBytes,
    zipPath:'05 test/rollback.zip',
    failCreateAt:2
  });
  const rollbackResult=await rollback.host.handleArchiveImportVaultCreate(
    rollback.sourceFile,
    {chooseFailure:async()=>({action:'keep'})}
  );
  assert.equal(rollbackResult.ok,false);
  assert.equal(rollbackResult.rolledBack,undefined);
  assert.equal(rollbackResult.sourceDeleted,false);
  assert.ok(rollback.host.obsidianVaultReadAdapter.getAbstractFileByPath('05 test/rollback.zip'));
  assert.equal(rollback.host.obsidianVaultReadAdapter.getAbstractFileByPath('05 test/rollback'),null);
  assert.equal([...rollback.createdFiles.keys()].some(path=>path.startsWith('05 test/rollback/')),false);

  const nestedBytes=zip({'inner.zip':zip({'inside.txt':'x'})});
  const nested=createHost({zipBytes:nestedBytes,zipPath:'05 test/nested.zip'});
  const nestedResult=await nested.host.handleArchiveImportVaultCreate(
    nested.sourceFile,
    {chooseFailure:async()=>({action:'delete'})}
  );
  assert.equal(nestedResult.ok,false);
  assert.equal(nestedResult.reason,'nested-zip');
  assert.equal(nestedResult.sourceDeleted,true);
  assert.equal(nested.host.obsidianVaultReadAdapter.getAbstractFileByPath('05 test/nested.zip'),null);
  assert.equal(nested.host.obsidianVaultReadAdapter.getAbstractFileByPath('05 test/nested'),null);

  const reconcile=createHost({zipBytes:basicBytes,zipPath:'05 test/external-copy.zip'});
  const reconcileResult=await reconcile.host.reconcileArchiveImportVaultFiles();
  assert.equal(reconcileResult.ok,true);
  assert.equal(reconcile.host.obsidianVaultReadAdapter.getAbstractFileByPath('05 test/external-copy.zip'),null);
  assert.ok(reconcile.host.obsidianVaultReadAdapter.getAbstractFileByPath('05 test/external-copy'));

  console.log('Archive Import transactional checks OK: preflight, preserved paths, PDF registration, source-name/SHA provenance, DocumentInfo relations, rollback on partial failure, failed-source keep/delete policy, source ZIP deletion after success, and reconciliation of externally copied ZIP files.');
})().catch(error=>{
  console.error('Archive Import transactional check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
