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
  constructor(_app,_plugin,model){ this.model=model; }
  async openForDecision(){ return {action:'skip'}; }
};

function zip(files){
  const input={};
  for(const [name,value] of Object.entries(files)) input[name]=value instanceof Uint8Array?value:strToU8(String(value));
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
  setText(value){ this.text=String(value); }
  addEventListener(type,handler){ this.listeners[type]=handler; }
  async click(){
    const handler=this.listeners.click;
    if(!handler) return;
    await handler({preventDefault(){},stopPropagation(){}});
  }
  empty(){ this.children=[]; this.text=''; }
  remove(){ this.isConnected=false; if(this.parent) this.parent.children=this.parent.children.filter(child=>child!==this); }
  all(){ return [this,...this.children.flatMap(child=>child.all())]; }
}

function createHost(zipBytes,{existing=[]}={}){
  const nodes=new Map(existing.map(path=>[path,{path,children:[]}]));
  const createdFiles=new Map();
  const recordsByPdf=new Map();
  let recordSeq=0;
  const host=new ArchiveImportFeature();
  host.state={archiveImport:{suppressedPaths:new Set(),inFlight:new Set(),lastResult:null}};
  host.obsidianVaultReadAdapter={
    async readBinary(file){
      if(file?.bytes) return file.bytes;
      return zipBytes;
    },
    async readText(file){ return String(file?.text||''); },
    getAbstractFileByPath(path){ return nodes.get(path)||createdFiles.get(path)||null; },
    listMarkdownFiles(){ return [...nodes.values()].filter(file=>String(file?.extension||'').toLowerCase()==='md'); },
    getBasePath(){ return 'C:/test-vault'; }
  };
  host.obsidianMetadataCacheAdapter={
    getFrontmatter(file){ return file?.frontmatter || null; },
    resolveLinkPath(linkPath){ return String(linkPath||'').replace(/^\/+|\/+$/g,''); }
  };
  host.obsidianVaultWriteAdapter={
    async ensureFolder(path){
      if(!nodes.has(path)) nodes.set(path,{path,children:[]});
      return nodes.get(path);
    },
    async createBinary(path,bytes){
      if(nodes.has(path)||createdFiles.has(path)) throw new Error(`exists: ${path}`);
      const file={path,name:path.split('/').pop(),extension:(path.split('.').pop()||'').toLowerCase(),bytes:Buffer.from(bytes)};
      createdFiles.set(path,file);
      return file;
    },
    async modifyText(file,data){
      file.text=String(data);
      return file;
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
    }
  };
  return {host,nodes,createdFiles,recordsByPdf};
}

(async()=>{
  const bytes=zip({
    'README-test.txt':'root',
    'Dokumenter/notat.txt':'note',
    'Dokumenter/Underkatalog/info.txt':'deep',
    'Data/test.json':'{"ok":true}'
  });
  const {host,nodes,createdFiles}=createHost(bytes);
  const file={path:'05 test/PDFium-Gate-ZIP-test-01.zip',name:'PDFium-Gate-ZIP-test-01.zip',extension:'zip'};

  assert.equal(host.isArchiveImportZipFile(file),true);
  assert.equal(host.isArchiveImportZipFile({path:'05 test/a.txt',extension:'txt'}),false);

  const result=await host.handleArchiveImportVaultCreate(file);
  assert.equal(result.ok,true);
  assert.equal(result.handled,true);
  assert.equal(result.targetFolder,'05 test/PDFium-Gate-ZIP-test-01');
  assert.equal(result.extractedCount,4);
  assert.equal(result.linkedPdfCount,0);
  assert.ok(nodes.has('05 test/PDFium-Gate-ZIP-test-01'));
  assert.ok(nodes.has('05 test/PDFium-Gate-ZIP-test-01/Dokumenter'));
  assert.ok(nodes.has('05 test/PDFium-Gate-ZIP-test-01/Dokumenter/Underkatalog'));
  assert.ok(nodes.has('05 test/PDFium-Gate-ZIP-test-01/Data'));
  assert.deepEqual([...createdFiles.keys()].sort(),[
    '05 test/PDFium-Gate-ZIP-test-01/Data/test.json',
    '05 test/PDFium-Gate-ZIP-test-01/Dokumenter/Underkatalog/info.txt',
    '05 test/PDFium-Gate-ZIP-test-01/Dokumenter/notat.txt',
    '05 test/PDFium-Gate-ZIP-test-01/README-test.txt'
  ]);
  assert.equal(global.Notice.messages.length,1);

  const collision=createHost(bytes,{existing:['05 test/PDFium-Gate-ZIP-test-01']});
  assert.equal(collision.host.archiveImportSuggestedFolderPath(file.path),'05 test/PDFium-Gate-ZIP-test-01 (2)');

  const suppressed=createHost(bytes);
  suppressed.host.suppressArchiveImportPathOnce(file.path);
  const suppressedResult=await suppressed.host.handleArchiveImportVaultCreate(file);
  assert.equal(suppressedResult.reason,'suppressed');
  assert.equal(suppressed.createdFiles.size,0);

  const unsupportedBytes=zip({'safe.txt':'ok','office.docx':'placeholder'});
  const unsupported=createHost(unsupportedBytes);
  const unsupportedResult=await unsupported.host.handleArchiveImportVaultCreate(file);
  assert.equal(unsupportedResult.ok,true);
  assert.equal(unsupportedResult.extractedCount,1);
  assert.ok(unsupported.createdFiles.has('05 test/PDFium-Gate-ZIP-test-01/safe.txt'));
  assert.equal([...unsupported.createdFiles.keys()].some(path=>path.endsWith('office.docx')),false);

  const relationshipBytes=zip({
    'rapport.pdf':'%PDF synthetic report',
    'Underkatalog/vedtak.pdf':'%PDF synthetic decision',
    'README.txt':'archive notes'
  });
  const linked=createHost(relationshipBytes);
  const linkedFile={path:'05 test/PDFium-Gate-ZIP-test-02-PDF.zip',name:'PDFium-Gate-ZIP-test-02-PDF.zip',extension:'zip'};
  linked.nodes.set(linkedFile.path,linkedFile);
  const linkedResult=await linked.host.handleArchiveImportVaultCreate(linkedFile);
  assert.equal(linkedResult.ok,true);
  assert.equal(linkedResult.extractedCount,3);
  assert.equal(linkedResult.linkedPdfCount,2);
  assert.equal(linkedResult.vaultRootPath,'C:/test-vault');
  assert.deepEqual(linkedResult.relationshipFailures,[]);

  const rapportPath='05 test/PDFium-Gate-ZIP-test-02-PDF/rapport.pdf';
  const vedtakPath='05 test/PDFium-Gate-ZIP-test-02-PDF/Underkatalog/vedtak.pdf';
  const readmePath='05 test/PDFium-Gate-ZIP-test-02-PDF/README.txt';
  const rapportState=linked.recordsByPdf.get(rapportPath);
  const vedtakState=linked.recordsByPdf.get(vedtakPath);
  assert.ok(rapportState);
  assert.ok(vedtakState);

  const rapportRecord=linked.nodes.get(rapportState.recordPath);
  const vedtakRecord=linked.nodes.get(vedtakState.recordPath);
  const rapportRelation=archiveRuntime.extractArchiveRelationship(rapportRecord.text);
  const vedtakRelation=archiveRuntime.extractArchiveRelationship(vedtakRecord.text);

  assert.deepEqual(rapportRelation,{
    sourceZipPath:linkedFile.path,
    memberPaths:[vedtakPath,readmePath]
  });
  assert.deepEqual(vedtakRelation,{
    sourceZipPath:linkedFile.path,
    memberPaths:[rapportPath,readmePath]
  });
  assert.ok(rapportRecord.text.includes(`- archive: [[${linkedFile.path}]]`));
  assert.ok(rapportRecord.text.includes(`- member: [[${vedtakPath}]]`));
  assert.ok(rapportRecord.text.includes(`- member: [[${readmePath}]]`));
  assert.ok(!rapportRelation.memberPaths.includes(rapportPath));

  const archivePdfMembers=await linked.host.findArchivePdfMembersForSourceZip(linkedFile.path);
  assert.equal(archivePdfMembers.ok,true);
  assert.deepEqual(archivePdfMembers.pdfPaths,[rapportPath,vedtakPath].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})));

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
    relationHost,
    relationView,
    rapportPath,
    rapportState
  );
  assert.equal(displayed.sourceZipPath,linkedFile.path);
  const anchors=relationHost.all().filter(node=>node.tag==='a');
  assert.deepEqual(anchors.map(node=>node.attributes['data-href']),[
    linkedFile.path,
    vedtakPath,
    readmePath
  ]);
  assert.deepEqual(anchors.map(node=>node.text),[
    'PDFium-Gate-ZIP-test-02-PDF.zip',
    'vedtak.pdf',
    'README.txt'
  ]);
  await anchors[1].click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(openedLinks,[{
    linktext:vedtakPath,
    sourcePath:rapportPath,
    newLeaf:false
  }]);

  console.log('Archive Import manual ZIP checks OK: vault-create detection, dedicated folder, nested paths, collision suffix, suppression, unsupported-file fail-closed behavior, PDF registration handoff, archive-member wikilinks, DocumentInfo relationship presentation, and explicit Obsidian link activation.');
})().catch(error=>{
  console.error('Archive Import manual ZIP check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
