'use strict';

const assert=require('assert/strict');
const {zipSync,strToU8}=require('fflate');
const archiveRuntime=require('../src/archive-import/runtime-entry');
const {ArchiveImportFeature}=require('../src/plugin/features/21-archive-import');

global.ARCHIVE_IMPORT_RUNTIME=archiveRuntime;
global.Notice=class Notice {
  constructor(message){ Notice.messages.push(String(message)); }
};
global.Notice.messages=[];

function zip(files){
  const input={};
  for(const [name,value] of Object.entries(files)) input[name]=value instanceof Uint8Array?value:strToU8(String(value));
  return Buffer.from(zipSync(input,{level:6}));
}

function createHost(zipBytes,{existing=[]}={}){
  const nodes=new Map(existing.map(path=>[path,{path,children:[]}]));
  const createdFiles=new Map();
  const host=new ArchiveImportFeature();
  host.state={archiveImport:{suppressedPaths:new Set(),inFlight:new Set(),lastResult:null}};
  host.obsidianVaultReadAdapter={
    async readBinary(){ return zipBytes; },
    getAbstractFileByPath(path){ return nodes.get(path)||createdFiles.get(path)||null; }
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
    }
  };
  return {host,nodes,createdFiles};
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
  assert.equal(unsupportedResult.ok,false);
  assert.equal(unsupportedResult.reason,'unsupported-files');
  assert.deepEqual(unsupportedResult.unsupported,['office.docx']);
  assert.equal(unsupported.createdFiles.size,0);

  console.log('Archive Import manual ZIP checks OK: vault-create detection, dedicated folder, nested paths, collision suffix, suppression, and unsupported-file fail-closed behavior.');
})().catch(error=>{
  console.error('Archive Import manual ZIP check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
