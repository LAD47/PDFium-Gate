'use strict';
const assert=require('node:assert/strict');
const schema=require('../src/metadata/schema-contract');
const records=require('../src/metadata/record-contract');
const base=require('../src/metadata/document-register-base-config');
Object.assign(global,schema,records,base);
const examples=require('../src/metadata/example-files');
Object.assign(global,examples);
const {installMetadataExampleFiles}=require('../src/main/example-files-installer');

function vault() {
  const entries=new Map();
  const read={
    getAbstractFileByPath:p=>entries.get(p)||null,
    readText:async file=>file.text
  };
  const write={
    ensureFolder:async p=>{const folder={path:p,children:[]};entries.set(p,folder);return folder;},
    createText:async(p,text)=>{if(entries.has(p))throw Error('Already exists '+p);const file={path:p,extension:p.endsWith('.base')?'base':'md',text};entries.set(p,file);return file;},
    modifyText:async(file,text)=>{file.text=text;return file;},
    deleteFile:async file=>{entries.delete(file.path);}
  };
  return {entries,read,write};
}
async function main(){
  const upgraded=schema.metadataUpgradeAuthorSourceUrl(schema.metadataDefaultSchema()).schema;
  const first=vault();
  const initial=await installMetadataExampleFiles(first.read,first.write,upgraded);
  assert.equal(initial.ok,true,initial.error);
  assert.equal(initial.registerCreated,true);
  assert.equal(initial.total,10);
  const main=first.entries.get('PDF Dokumentregister.base');
  const copy=first.entries.get('Examples-Obsidian-PDFium-Gate/PDF Dokumentregister.base');
  assert.ok(main);assert.ok(copy);assert.equal(main.text,copy.text);
  assert.ok(main.text.includes('pdfium-document-register'));
  assert.ok(main.text.includes('File Metadata'));
  assert.ok(main.text.includes('author:'));assert.ok(main.text.includes('source_url:'));
  const native=first.entries.get('Examples-Obsidian-PDFium-Gate/Example - Native Obsidian Base - All documents.base');
  assert.ok(native.text.includes('- type: table'));
  assert.ok(native.text.includes('Examples-Obsidian-PDFium-Gate'));
  assert.ok(!native.text.includes('pdfium-document-register'));
  const sample=first.entries.get('Examples-Obsidian-PDFium-Gate/Example - Active PDF record.md');
  assert.ok(sample.text.includes('author:'));assert.ok(sample.text.includes('source_url:'));
  const custom='views:\n  - type: table\n    name: "My custom view"\n';
  main.text=custom;
  const again=await installMetadataExampleFiles(first.read,first.write,upgraded);
  assert.equal(again.ok,true,again.error);
  assert.equal(again.registerCreated,false);assert.equal(again.registerPreserved,true);
  assert.equal(first.entries.get('PDF Dokumentregister.base').text,custom);
  assert.equal(first.entries.get('Examples-Obsidian-PDFium-Gate/PDF Dokumentregister.base').text,copy.text);
  const conflict=vault();
  conflict.entries.set('PDF Dokumentregister.base',{path:'PDF Dokumentregister.base',children:[]});
  const blocked=await installMetadataExampleFiles(conflict.read,conflict.write,upgraded);
  assert.equal(blocked.ok,false);
  assert.equal(conflict.entries.size,1,'folder conflict must fail before modifying examples');
  const modified=schema.metadataClone(upgraded);
  modified.fields.push(schema.metadataMakeField({property:'case_owner',label:'Case owner',type:'text'}));
  const second=vault();
  const withField=await installMetadataExampleFiles(second.read,second.write,modified);
  assert.equal(withField.ok,true);
  assert.ok(second.entries.get('PDF Dokumentregister.base').text.includes('case_owner:'));
  assert.equal(second.entries.get('PDF Dokumentregister.base').text,second.entries.get('Examples-Obsidian-PDFium-Gate/PDF Dokumentregister.base').text);
  console.log('Example register installation OK: copyable Base, root create-once, preservation, conflict safety, custom schema, synthetic isolation.');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
