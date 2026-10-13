'use strict';
// Disk integration; unique OS-temp workspace, retained on success and failure.
// Only this script and production modules are read outside the new synthetic root.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const os=require('node:os');
const schema=require('../src/metadata/schema-contract');
const safe=require('../src/core/safe-config-file-write');
const {createMetadataSchemaRepository}=require('../src/metadata/schema-repository');
const {createObsidianAdapterFileStore}=require('../src/platform/obsidian-adapter-file-store');
const {MetadataSchemaFeature}=require('../src/plugin/features/14-metadata-schema');
const project=path.resolve(__dirname,'..');
const base=os.tmpdir();
const root=path.join(base,'metadata-migration-'+crypto.randomUUID());
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function plainAncestors(target) {
  let cursor=path.parse(target).root;
  for(const segment of target.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor=path.join(cursor,segment);
    if(fs.existsSync(cursor)) {
      assert.equal(fs.lstatSync(cursor).isSymbolicLink(),false,'symlink/junction: '+cursor);
      assert.equal(fs.realpathSync.native(cursor).toLowerCase(),cursor.toLowerCase(),'redirected path: '+cursor);
    }
  }
}
function resolveInside(caseRoot,relative) {
  assert.equal(path.isAbsolute(relative),false);
  assert.equal(relative.includes(':'),false);
  const segments=relative.replace(/\\/g,'/').split('/');
  assert.equal(segments.some(s=>s==='..'||s==='.'),false);
  const absolute=path.resolve(caseRoot,...segments);
  assert.ok(absolute.startsWith(caseRoot+path.sep),'outside case root');
  assert.ok(caseRoot.startsWith(root+path.sep),'outside workspace');
  plainAncestors(absolute);
  return absolute;
}
const results=[];
let oldApi;
function oldContract() {
  const fixture=path.join(project,'test/fixtures/metadata/0.1.227');
  const provenance=JSON.parse(fs.readFileSync(path.join(fixture,'provenance.json'),'utf8'));
  const frozenSha256='25e37e23db2b3f791c63f89ef05cad67edd88a8b93da3c95d1ff3874d17c6926';
  assert.equal(provenance.commit,'ca2ca22804c7689764cab6095a4f3b59e03f154b');
  assert.equal(provenance.version,'0.1.227');
  assert.equal(provenance.sha256,frozenSha256);
  const bytes=fs.readFileSync(path.join(fixture,'schema-contract.js'));
  assert.equal(hash(bytes),frozenSha256,'frozen 0.1.227 contract checksum');
  const source=bytes.toString('utf8');
  const context={module:{exports:{}},require};vm.createContext(context);
  vm.runInContext(source,context,{filename:'pre-upgrade-schema-contract.js'});
  return {api:context.module.exports,source};
}
function makeCase(name,fault=null) {
  const caseRoot=path.join(root,name);plainAncestors(caseRoot);fs.mkdirSync(caseRoot);
  const events=[];let injected=false;let installed=false;
  const isBackup=p=>p.startsWith(schema.METADATA_SCHEMA_BACKUP_ROOT+'/');
  function hit(kind,p) {
    if(injected||!fault)return false;
    const match=(fault==='backup-write'&&kind==='write'&&isBackup(p))
      ||(fault==='backup-readback'&&kind==='read'&&isBackup(p))
      ||(fault==='temp-write'&&kind==='write'&&p.includes('.tmp-'))
      ||(fault==='temp-readback'&&kind==='read'&&p.includes('.tmp-'))
      ||(fault==='rename'&&kind==='rename'&&p.includes('.tmp-'))
      ||(fault==='final-readback'&&kind==='read'&&p===schema.METADATA_SCHEMA_PATH&&installed);
    if(match)injected=true;return match;
  }
  const adapter={
    async exists(p){const q=resolveInside(caseRoot,p);events.push(['exists',p]);return fs.existsSync(q);},
    async read(p){const q=resolveInside(caseRoot,p);events.push(['read',p]);if(hit('read',p))return 'corrupt synthetic readback';return fs.readFileSync(q,'utf8');},
    async write(p,text){const q=resolveInside(caseRoot,p);events.push(['write',p]);if(hit('write',p))throw new Error('Injected '+fault);fs.writeFileSync(q,text,'utf8');},
    async mkdir(p){events.push(['mkdir',p]);fs.mkdirSync(resolveInside(caseRoot,p));},
    async copy(from,to){events.push(['copy',from,to]);fs.copyFileSync(resolveInside(caseRoot,from),resolveInside(caseRoot,to));},
    async rename(from,to){const a=resolveInside(caseRoot,from),b=resolveInside(caseRoot,to);events.push(['rename',from,to]);if(hit('rename',from))throw new Error('Injected '+fault);fs.renameSync(a,b);if(to===schema.METADATA_SCHEMA_PATH)installed=true;},
    async remove(p){events.push(['remove',p]);fs.unlinkSync(resolveInside(caseRoot,p));}
  };
  const store=createObsidianAdapterFileStore({adapter});
  const repository=createMetadataSchemaRepository({fileStore:store,schemaApi:schema,safeWriteApi:safe});
  const seed=schema.metadataDefaultSchema();
  seed.fields[0].label='Synthetic user date';seed.fields[0].label_source='user';
  const original=Buffer.from(JSON.stringify(seed,null,2)+'\n');
  fs.mkdirSync(resolveInside(caseRoot,'.pdf-metadata'));
  fs.writeFileSync(resolveInside(caseRoot,schema.METADATA_SCHEMA_PATH),original,{flag:'wx'});
  function feature() {
    Object.assign(global,schema);
    global.createMetadataSchemaRepository=options=>createMetadataSchemaRepository({...options,schemaApi:schema,safeWriteApi:safe});
    global.Notice=class{};global.PLUGIN_VERSION='synthetic';
    const owner=new MetadataSchemaFeature();owner.obsidianAdapterFileStore=store;owner.state={metadata:{}};
    owner.i18n={t:key=>key,getKnownTranslations:()=>[]};return owner;
  }
  function backupFiles() {
    const p=resolveInside(caseRoot,schema.METADATA_SCHEMA_BACKUP_ROOT);
    return fs.existsSync(p)?fs.readdirSync(p).map(n=>schema.METADATA_SCHEMA_BACKUP_ROOT+'/'+n):[];
  }
  return {caseRoot,repository,store,seed,original,events,feature,backupFiles,
    injected:()=>injected,readBytes:()=>fs.readFileSync(resolveInside(caseRoot,schema.METADATA_SCHEMA_PATH))};
}
function record(name,details){results.push({name,ok:true,...details});console.log('PASS '+name);}
async function run() {
  console.log('PLANNED WORKSPACE '+root);
  plainAncestors(root);assert.equal(fs.existsSync(root),false);
  const legacy=oldContract();oldApi=legacy.api;
  assert.ok(fs.statSync(base).isDirectory());
  fs.mkdirSync(root);console.log('WORKSPACE '+root);
  fs.writeFileSync(path.join(root,'pre-upgrade-schema-contract.js'),legacy.source,{flag:'wx'});
  const a=makeCase('A-upgrade');const owner=a.feature();
  assert.equal(oldApi.metadataValidateSchema(a.seed).ok,true);
  const upgraded=await owner.initializeMetadataSchema();assert.equal(upgraded.ok,true);
  const migrated=upgraded.schema;assert.equal(schema.metadataValidateSchema(migrated).ok,true);
  assert.equal(migrated.fields.length,a.seed.fields.length+2);
  assert.equal(migrated.fields.find(f=>f.property==='author').type,'text');
  assert.deepEqual(migrated.fields.find(f=>f.property==='source_url').config,{kind:'url'});
  for(const f of a.seed.fields)assert.deepEqual(migrated.fields.find(x=>x.id===f.id),f);
  assert.ok(migrated.migrations.author_source_url_v1);
  const firstBackups=a.backupFiles();assert.equal(firstBackups.length,1);
  const compatibleBackup=fs.readFileSync(resolveInside(a.caseRoot,firstBackups[0]));assert.deepEqual(compatibleBackup,a.original);
  const backupRead=a.events.findIndex(e=>e[0]==='read'&&e[1]===firstBackups[0]);
  const tempWrite=a.events.findIndex(e=>e[0]==='write'&&e[1].includes('.tmp-'));
  const replace=a.events.findIndex(e=>e[0]==='rename');assert.ok(backupRead>=0&&backupRead<tempWrite&&tempWrite<replace);
  record('A-upgrade',{backup:path.join(a.caseRoot,...firstBackups[0].split('/')),sha256:hash(compatibleBackup)});
  const before=a.readBytes(),start=a.events.length;
  assert.equal((await a.feature().initializeMetadataSchema()).ok,true);
  assert.deepEqual(a.readBytes(),before);assert.deepEqual(a.backupFiles(),firstBackups);
  assert.equal(a.events.slice(start).some(e=>['write','rename','remove'].includes(e[0])),false);
  record('B-repeated-startup',{});
  await owner.deleteMetadataSchemaField(migrated.fields.find(f=>f.property==='author').id);
  const reopened=a.feature();assert.equal((await reopened.initializeMetadataSchema()).ok,true);
  assert.equal(reopened.getMetadataSchemaSnapshot().fields.some(f=>f.property==='author'),false);
  await reopened.setMetadataSchemaFieldActive(migrated.fields.find(f=>f.property==='source_url').id,false);
  const disabled=a.feature();assert.equal((await disabled.initializeMetadataSchema()).ok,true);
  assert.equal(disabled.getMetadataSchemaSnapshot().fields.find(f=>f.property==='source_url').active,false);
  record('C-delete-disable',{});
  for(const fault of ['backup-write','backup-readback','temp-write','temp-readback','rename','final-readback']) {
    const h=makeCase('D-'+fault,fault);const feature=h.feature();
    const result=await feature.initializeMetadataSchema();assert.equal(result.ok,false);assert.equal(h.injected(),true);
    assert.equal(feature.state.metadata.loaded,false);assert.equal(feature.state.metadata.schema,null);
    assert.deepEqual(h.readBytes(),h.original,'original canonical bytes after '+fault);
    assert.equal((await h.repository.readSchema()).exists,true);
    for(const b of h.backupFiles())assert.deepEqual(fs.readFileSync(resolveInside(h.caseRoot,b)),h.original);
    record('D-'+fault,{error:result.error,backups:h.backupFiles().map(b=>path.join(h.caseRoot,...b.split('/')))});
  }
  const e=makeCase('E-compatible-restore');const result=await e.feature().initializeMetadataSchema();assert.equal(result.ok,true);
  assert.equal(oldApi.metadataValidateSchema(result.schema).ok,false,'old contract rejects marker');
  const restored=JSON.parse(compatibleBackup.toString('utf8'));
  // Execute the real repository/safe writer with the actual old contract for restore.
  const restoreRepo=createMetadataSchemaRepository({fileStore:e.store,schemaApi:oldApi,safeWriteApi:safe});
  const restoredResult=await restoreRepo.writeSchema(restored);assert.ok(restoredResult.backupPath);
  assert.equal(oldApi.metadataValidateSchema((await restoreRepo.readSchema()).schema).ok,true);
  assert.deepEqual(e.readBytes(),compatibleBackup);assert.deepEqual(JSON.parse(JSON.stringify(restoredResult.schema)),restored);
  record('E-compatible-restore',{schemaSha256:hash(e.readBytes()),backup:restoredResult.backupPath});
  fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({ok:true,root,results},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,scenarios:results.length,root,results},null,2));
}
run().catch(error=>{console.error(error.stack||error);console.error('Evidence retained; no automatic retry or cleanup.');process.exitCode=1;});
