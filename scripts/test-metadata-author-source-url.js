'use strict';
// Synthetic in-memory schema repository and canonical metadata-port simulation.
// Run explicitly with node scripts/test-metadata-author-source-url.js; no disk writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const schema=require('../src/metadata/schema-contract');
Object.assign(global,schema);
const registryApi=require('../src/metadata/field-type-registry');
global.metadataFieldTypeRegistry=registryApi.metadataFieldTypeRegistry;
global.metadataPresentationSettings=registryApi.metadataPresentationSettings;
const {MetadataSchemaFeature}=require('../src/plugin/features/14-metadata-schema');
const {DocumentInfoFeature}=require('../src/plugin/features/15-document-info');
const dictionaries=Object.fromEntries(['en','nb','de','es','sv','da','fr'].map(locale=>[
  locale,JSON.parse(fs.readFileSync(path.join(__dirname,'../src/i18n',`${locale}.json`),'utf8'))
]));
let locale='nb';
const i18n={t:key=>dictionaries[locale][key] || key,
  getKnownTranslations:key=>Object.values(dictionaries).map(dict=>dict[key]).filter(Boolean)};
function schemaHost(initial) {
  let stored=schema.metadataClone(initial);
  let writes=0;
  global.createMetadataSchemaRepository=()=>({
    loadOrCreateDefault:async()=>{
      if(stored) return {schema:schema.metadataClone(stored),created:false};
      stored=schema.metadataUpgradeAuthorSourceUrl(schema.metadataDefaultSchema()).schema;
      writes++;
      return {schema:schema.metadataClone(stored),created:true};
    },
    writeSchema:async candidate=>{
      assert.equal(schema.metadataValidateSchema(candidate).ok,true);
      stored=schema.metadataClone(candidate); writes++;
      return {schema:schema.metadataClone(stored),backupPath:'synthetic-backup'};
    }
  });
  const feature=new MetadataSchemaFeature();
  feature.state={metadata:{}};feature.i18n=i18n;
  return {feature,getStored:()=>schema.metadataClone(stored),writes:()=>writes};
}
async function main() {
  global.Notice=class {};
  global.PLUGIN_VERSION='synthetic';
  const freshSchema=schemaHost(null);
  assert.equal((await freshSchema.feature.initializeMetadataSchema()).ok,true);
  assert.equal(freshSchema.getStored().fields.length,11);
  assert.equal(freshSchema.writes(),1);
  await freshSchema.feature.initializeMetadataSchema();
  assert.equal(freshSchema.writes(),1);
  const original=schema.metadataDefaultSchema();
  const h=schemaHost(original);
  assert.equal((await h.feature.initializeMetadataSchema()).ok,true);
  assert.equal(h.writes(),1,'one controlled first upgrade');
  const upgraded=h.getStored();
  assert.ok(upgraded.migrations.author_source_url_v1);
  for(const old of original.fields) assert.deepEqual(upgraded.fields.find(f=>f.id===old.id),old);
  await h.feature.initializeMetadataSchema();
  assert.equal(h.writes(),1,'repeated startup does not write');
  for(const lang of ['nb','en','nb']) {
    locale=lang;
    const presentation=h.feature.getMetadataSchemaPresentationSnapshot();
    for(const property of ['author','source_url']) {
      const f=presentation.fields.find(f=>f.property===property);
      assert.equal(f.label,i18n.t(property==='author'?'localTest.metadata.author':'localTest.metadata.sourceUrl'));
      assert.equal(f.id,upgraded.migrations.author_source_url_v1[property]);
    }
    assert.deepEqual(h.getStored(),upgraded,'language presentation never rewrites schema');
  }
  const author=upgraded.fields.find(f=>f.property==='author');
  const renamed={...author,label:'My own author',label_source:'user'};
  await h.feature.replaceMetadataSchemaField(author.id,renamed);
  locale='en';
  assert.equal(h.feature.getMetadataSchemaPresentationSnapshot().fields.find(f=>f.id===author.id).label,'My own author');
  await h.feature.setMetadataSchemaFieldActive(author.id,false);
  await h.feature.initializeMetadataSchema();
  assert.equal(h.getStored().fields.find(f=>f.id===author.id).active,false);
  await h.feature.deleteMetadataSchemaField(author.id);
  const before=h.writes();
  await h.feature.initializeMetadataSchema();
  assert.equal(h.writes(),before);
  assert.equal(h.getStored().fields.some(f=>f.property==='author'),false);
  const legacy=schema.metadataDefaultSchema();
  const legacyAuthor=schema.metadataMakeField({property:'author',label:'Forfatter',type:'text'});
  legacyAuthor.active=false;legacy.fields.push(legacyAuthor);
  const customUrl=schema.metadataMakeField({property:'source_url',label:'My source',type:'link',config:{kind:'url'}});
  legacy.fields.push(customUrl);
  const old=schema.metadataUpgradeAuthorSourceUrl(legacy).schema;
  assert.deepEqual(old.fields.find(f=>f.id===legacyAuthor.id),legacyAuthor);
  assert.deepEqual(old.fields.find(f=>f.id===customUrl.id),customUrl);
  assert.equal(schema.metadataSchemaForPresentation(old,i18n.t).fields.find(f=>f.id===legacyAuthor.id).label,'Forfatter',
    'matching translation does not prove factory ownership');
  assert.equal(schema.metadataValidateSchema({...old,migrations:{author_source_url_v1:{author:'bad',source_url:'bad'}}}).ok,false);
  const url=upgraded.fields.find(f=>f.property==='source_url');
  for(const lang of ['en','nb','de','es','sv','da','fr']) {
    locale=lang;
    const settings=registryApi.metadataPresentationSettings({},i18n);
    const parse=raw=>registryApi.metadataFieldTypeRegistry.parseNormalizeValidate(url,raw,settings);
    assert.equal(parse('https://example.invalid/a').ok,true);
    assert.equal(parse('http://example.invalid').ok,true);
    assert.equal(parse('').value,null);
    for(const raw of ['javascript:alert(1)','www.example.invalid','https://']) {
      assert.equal(parse(raw).ok,false);
      assert.equal(parse(raw).errors[0],dictionaries[lang]['validation.expectedHttpUrl']);
    }
  }
  function infoHost(raw,originalRaw='www.example.invalid') {
    const feature=new DocumentInfoFeature();
    const values={source_url:originalRaw,author:'Old author'}; const patches=[];
    feature.state={documentInfo:{editingPdfPath:'Docs/test.pdf'}};
    feature.settings={};feature.i18n=i18n;
    feature.getDocumentInfoSchemaFields=()=>[url,author];
    feature.renderDocumentInfoForView=()=>{};feature.restoreDocumentInfoPdfFocus=async()=>{};
    feature.ports={saveDocumentMetadataRecordValues:async(pdf,patch)=>{
      patches.push(patch);Object.assign(values,patch);return {ok:true,values};
    }};
    const controls=new Map([
      ['source_url',{readRaw:()=>raw,originalValue:originalRaw,originalRaw}],
      ['author',{readRaw:()=> 'New author'}]
    ]);
    return {feature,controls,values,patches};
  }
  for(const raw of ['www.example.invalid','https://example.invalid','', 'not a url']) {
    const h=infoHost(raw);
    const result=await h.feature.saveDocumentInfoFromView({file:{path:'Docs/test.pdf'}},h.controls);
    if(raw==='not a url') {assert.equal(result.ok,false);assert.equal(h.patches.length,0);continue;}
    assert.equal(result.ok,true);
    assert.equal(h.values.author,'New author');
    if(raw==='www.example.invalid') {
      assert.equal(h.values.source_url,raw);
      assert.equal(Object.hasOwn(h.patches[0],'source_url'),false);
    } else assert.equal(h.values.source_url,raw || null);
  }
  const fresh=infoHost('www.example.invalid','');
  assert.equal((await fresh.feature.saveDocumentInfoFromView({file:{path:'Docs/test.pdf'}},fresh.controls)).ok,false);
  console.log('Metadata author/source URL regression checks OK');
}
main().catch(error=>{console.error(error.stack || error);process.exitCode=1;});
