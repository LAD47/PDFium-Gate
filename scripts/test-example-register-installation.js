'use strict';
// Synthetic adapters only; no actual Vault or filesystem writes.
const assert=require('node:assert/strict');
const schema=require('../src/metadata/schema-contract');
const records=require('../src/metadata/record-contract');
const base=require('../src/metadata/document-register-base-config');
Object.assign(global,schema,records,base);
const examples=require('../src/metadata/example-files');
Object.assign(global,examples);
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const installerSource=fs.readFileSync(path.join(__dirname,'../src/main/example-files-installer.js'),'utf8');
const installMetadataExampleFiles=vm.runInThisContext('(function(){\n'+installerSource+'\nreturn installMetadataExampleFiles;\n})()', {filename:'src/main/example-files-installer.js'});
const rootPath='PDF Dokumentregister.base';
const exampleRoot='Examples-Obsidian-PDFium-Gate';
const copyPath=exampleRoot+'/'+rootPath;
const legacyPath=exampleRoot+'/Example PDF Document Register.base';

function vault() {
  const entries=new Map(),writes=[],reads=[];
  const read={
    getAbstractFileByPath:p=>{reads.push(p);return entries.get(p)||null;},
    readText:async()=>{throw Error('Historical files must not be read for migration');}
  };
  const write={
    ensureFolder:async p=>{writes.push(['folder',p]);const folder={path:p,children:[]};entries.set(p,folder);return folder;},
    createText:async(p,text)=>{if(entries.has(p))throw Error('Already exists '+p);writes.push(['create',p]);const file={path:p,extension:p.endsWith('.base')?'base':'md',text};entries.set(p,file);return file;},
    modifyText:async(file,text)=>{writes.push(['modify',file.path]);file.text=text;return file;},
    deleteFile:async()=>{throw Error('No deletion is permitted');}
  };
  return {entries,read,write,writes,reads};
}
function realRegisters(v) {
  return [...v.entries.values()].filter(file=>file.extension==='base' && file.text.includes('- type: pdfium-document-register'));
}
async function main(){
  const upgraded=schema.metadataUpgradeAuthorSourceUrl(schema.metadataDefaultSchema()).schema;
  const first=vault();
  const initial=await installMetadataExampleFiles(first.read,first.write,upgraded);
  assert.equal(initial.ok,true,initial.error);
  assert.equal(initial.registerCreated,true);
  assert.equal(initial.total,9);
  assert.equal(initial.created.length,9);
  const register=first.entries.get(rootPath);
  assert.ok(register);
  assert.equal(first.entries.has(copyPath),false,'no second real register');
  assert.equal(realRegisters(first).length,1);
  assert.equal(realRegisters(first)[0].path,rootPath);
  assert.ok(register.text.includes('File Metadata'));
  assert.ok(register.text.includes('author:'));assert.ok(register.text.includes('source_url:'));
  const natives=[...first.entries.values()].filter(file=>file.extension==='base' && file.path.startsWith(exampleRoot+'/'));
  assert.equal(natives.length,2);
  for(const native of natives) {
    assert.ok(native.text.includes('- type: table'));
    assert.ok(native.text.includes(exampleRoot));
    assert.ok(!native.text.includes('pdfium-document-register'));
    assert.ok(!native.text.includes('File Metadata'));
  }
  assert.equal([...first.entries.values()].filter(file=>file.extension==='md' && file.path!==exampleRoot+'/README.md').length,6);
  const sample=first.entries.get(exampleRoot+'/Example - Active PDF record.md');
  assert.ok(sample.text.includes('author:'));assert.ok(sample.text.includes('source_url:'));
  assert.ok(first.entries.get(exampleRoot+'/README.md').text.includes('No register copy is installed'));

  const custom='views:\n  - type: table\n    name: "My custom view"\n';
  register.text=custom;
  for(let n=0;n<2;n++) {
    const before=first.writes.length;
    const again=await installMetadataExampleFiles(first.read,first.write,upgraded,'PDF Dokumentregister');
    assert.equal(again.ok,true,again.error);
    assert.equal(again.registerCreated,false);assert.equal(again.registerPreserved,true);
    assert.equal(again.overwritten.length,9);
    assert.equal(first.entries.get(rootPath).text,custom);
    assert.equal(first.entries.has(copyPath),false,'updates and reinstalls never recreate a copy');
    assert.ok(first.writes.slice(before).every(([,p])=>p.startsWith(exampleRoot+'/') && p!==copyPath));
  }

  // Preserve canonical and customized historical copies, legacy Bases, PDFs and records.
  for(const copyText of [base.metadataDocumentRegisterStandardBaseYaml(upgraded),'custom register copy']) {
    for(const legacyText of [examples.metadataExampleLegacyNativeBaseYaml(),'custom legacy Base']) {
      const existing=vault();
      const untouched=new Map([
        [rootPath,custom],[copyPath,copyText],[legacyPath,legacyText],
        ['File Metadata/synthetic-record.md','synthetic metadata must be unchanged'],
        ['Synthetic Documents/preserved.pdf','synthetic PDF bytes must be unchanged'],
        [exampleRoot+'/My own Base.base','custom user Base']
      ]);
      for(const [p,text]of untouched) existing.entries.set(p,{path:p,extension:p.split('.').at(-1),text});
      for(let n=0;n<2;n++) {
        const result=await installMetadataExampleFiles(existing.read,existing.write,upgraded);
        assert.equal(result.ok,true,result.error);
        assert.deepEqual(Array.from(result.legacyRemoved),[]);
        assert.deepEqual(Array.from(result.legacyPreserved).sort(),[copyPath,legacyPath].sort());
        for(const [p,text]of untouched) assert.equal(existing.entries.get(p).text,text,'preserve '+p);
        assert.ok(existing.writes.every(([,p])=>!untouched.has(p)));
      }
    }
  }

  // A historical copy never prevents creation of the missing root register.
  const copiedOnly=vault();
  copiedOnly.entries.set(copyPath,{path:copyPath,extension:'base',text:'user-owned historical copy'});
  assert.equal((await installMetadataExampleFiles(copiedOnly.read,copiedOnly.write,upgraded)).registerCreated,true);
  assert.equal(copiedOnly.entries.get(copyPath).text,'user-owned historical copy');
  assert.equal(realRegisters(copiedOnly).length,1);

  const conflict=vault();
  conflict.entries.set(rootPath,{path:rootPath,children:[]});
  const blocked=await installMetadataExampleFiles(conflict.read,conflict.write,upgraded);
  assert.equal(blocked.ok,false);
  assert.equal(conflict.entries.size,1);
  assert.equal(conflict.writes.length,0,'root folder conflict fails before modifying examples');
  const historicalFolder=vault();
  historicalFolder.entries.set(copyPath,{path:copyPath,children:[]});
  assert.equal((await installMetadataExampleFiles(historicalFolder.read,historicalFolder.write,upgraded)).ok,true);
  assert.ok(Array.isArray(historicalFolder.entries.get(copyPath).children),'historical folder is untouched');

  const modified=schema.metadataClone(upgraded);
  modified.fields.push(schema.metadataMakeField({property:'case_owner',label:'Case owner',type:'text'}));
  const customSchema=vault();
  assert.equal((await installMetadataExampleFiles(customSchema.read,customSchema.write,modified)).ok,true);
  assert.ok(customSchema.entries.get(rootPath).text.includes('case_owner:'));
  assert.equal(customSchema.entries.has(copyPath),false);

  const placeholders=value=>[...value.matchAll(/\{\{(\w+)\}\}/g)].map(match=>match[1]).sort();
  for(const locale of examples.PDFIUM_EXAMPLE_INSTALLER_LOCALES) {
    const dictionary=examples.PDFIUM_EXAMPLE_INSTALLER_TEXT[locale];
    for(const [key,value]of Object.entries(dictionary)) {
      assert.deepEqual(placeholders(value),placeholders(examples.PDFIUM_EXAMPLE_INSTALLER_TEXT.en[key]),locale+' placeholder drift');
    }
    const i18n={getResolvedLanguage:()=>locale};
    const description=examples.metadataExampleUiText(i18n,'description',{path:exampleRoot});
    assert.ok(description.includes(exampleRoot));
  }
  const localized=vault();
  const localizedResult=await installMetadataExampleFiles(localized.read,localized.write,upgraded,'PDF Dokumentregister');
  assert.equal(localizedResult.ok,true,localizedResult.error);
  assert.ok(localized.entries.get(rootPath).text.includes('name: "PDF Dokumentregister"'));
  assert.ok(!localized.entries.get(rootPath).text.includes('file.backlinks'));
  assert.equal(localized.entries.has(copyPath),false);

  // Exercise the existing standard-register creation/open operation, not a second writer.
  const {DocumentRegisterBasesFeature}=require('../src/plugin/features/18-document-register-bases');
  const commandVault=vault(),opened=[];
  const feature=new DocumentRegisterBasesFeature();
  feature.obsidianVaultReadAdapter=commandVault.read;
  feature.obsidianVaultWriteAdapter=commandVault.write;
  feature.ports={getMetadataSchemaPresentationSnapshot:()=>upgraded};
  feature.i18n={t:key=>key==='documentRegister.viewName' ? 'Document Register' : key};
  feature.app={workspace:{getLeaf:()=>({openFile:async file=>opened.push(file.path)})}};
  global.Notice=class {};
  assert.equal((await feature.openStandardPdfDocumentRegister()).created,true);
  commandVault.entries.get(rootPath).text=custom;
  const reopened=await feature.openStandardPdfDocumentRegister();
  assert.equal(reopened.ok,true);assert.equal(reopened.created,false);
  assert.equal(commandVault.entries.get(rootPath).text,custom);
  assert.deepEqual(opened,[rootPath,rootPath]);
  assert.deepEqual(commandVault.writes,[['create',rootPath]]);
  delete global.Notice;
  console.log('Example register installation OK: one root register, two synthetic native Bases, six records, no copy on install/reinstall, untouched historical/user/PDF/metadata files, conflicts, schema/localization and standard open command.');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
