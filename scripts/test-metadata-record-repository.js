'use strict';

const assert=require('assert/strict');
const recordApi=require('../src/metadata/record-contract');
const {createMetadataRecordRepository}=require('../src/metadata/record-repository');

(async()=>{
  const id='123e4567-e89b-42d3-a456-426614174000';
  const recordPath=recordApi.metadataRecordPathFromId(id);
  const file={
    path:recordPath,
    extension:'md',
    frontmatter:{
      filemeta_type:'pdf',
      filemeta_profile:'document',
      filemeta_version:recordApi.METADATA_RECORD_FORMAT_VERSION,
      filemeta_id:id,
      filemeta_file:'[[05 test/mail.pdf]]',
      filemeta_status:'active',
      sender:'Before'
    }
  };

  const repository=createMetadataRecordRepository({
    vaultReadAdapter:{
      async readText(){ return '---\nplaceholder: true\n---\n'; },
      getAbstractFileByPath(path){ return path===recordPath ? file : null; }
    },
    vaultWriteAdapter:{
      async createText(){ throw new Error('not used'); },
      async ensureFolder(){ throw new Error('not used'); }
    },
    frontmatterAdapter:{
      async processFrontMatter(target,mutator){
        mutator(target.frontmatter);
      }
    },
    parseYamlFn:()=>file.frontmatter,
    recordApi
  });

  const schema={
    fields:[
      {property:'sender',type:'text',active:true}
    ]
  };

  const sourceSha='a'.repeat(64);
  const first=await repository.updateRecord(file,{
    id,
    pdfPath:'05 test/mail.pdf',
    status:'active',
    values:{
      sender:'After',
      email_import_source_sha256:sourceSha,
      email_import_source_retained:true,
      email_import_retained_path:'.pdf-metadata/email-sources/aa/source.eml'
    }
  },schema);

  assert.equal(first.ok,true);
  assert.equal(file.frontmatter.sender,'After');
  assert.equal(file.frontmatter.email_import_source_sha256,sourceSha);
  assert.equal(file.frontmatter.email_import_source_retained,true);
  assert.equal(file.frontmatter.email_import_retained_path,'.pdf-metadata/email-sources/aa/source.eml');
  assert.equal(first.record.values.email_import_source_sha256,sourceSha);

  const second=await repository.updateRecord(file,{
    id,
    pdfPath:'05 test/mail.pdf',
    status:'missing',
    values:first.record.values
  },schema);

  assert.equal(second.ok,true);
  assert.equal(second.record.status,'missing');
  assert.equal(second.record.values.email_import_source_sha256,sourceSha);
  assert.equal(file.frontmatter.email_import_source_sha256,sourceSha);

  const thirdValues={...second.record.values,email_import_retained_path:null};
  const third=await repository.updateRecord(file,{
    id,
    pdfPath:'05 test/mail.pdf',
    status:'active',
    values:thirdValues
  },schema);
  assert.equal(third.ok,true);
  assert.equal(Object.prototype.hasOwnProperty.call(file.frontmatter,'email_import_retained_path'),false);
  assert.equal(third.record.values.email_import_source_sha256,sourceSha);

  console.log('Metadata record repository update OK: schema fields and technical extension values persist consistently, status updates preserve them, and explicit empty values remove them.');
})().catch(error=>{
  console.error('Metadata record repository update check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
