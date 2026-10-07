'use strict';
const ctx=require('../context');

module.exports=async function verifyDocumentRecordsContract(){
  const {path,ROOT,fail,read}=ctx;
  const schemaApi=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  const recordApi=require(path.join(ROOT,'src/metadata/record-contract.js'));
  const benchmarkApi=require(path.join(ROOT,'src/metadata/benchmark-contract.js'));
  const cacheApi=require(path.join(ROOT,'src/metadata/record-index-cache.js'));
  const repositoryApi=require(path.join(ROOT,'src/metadata/record-repository.js'));
  const schema=schemaApi.metadataDefaultSchema();
  const id='123e4567-e89b-42d3-a456-426614174000';

  if(recordApi.METADATA_RECORD_CONTRACT_VERSION!=='0.4') fail('metadata record contract version drifted');
  if(recordApi.METADATA_RECORD_FORMAT_VERSION!==2) fail('metadata record format version drifted');
  if(recordApi.METADATA_RECORDS_ROOT!=='File Metadata') fail(`metadata record root drifted: ${recordApi.METADATA_RECORDS_ROOT}`);
  if(recordApi.METADATA_RECORDS_ROOT.startsWith('.')) fail('metadata record root is hidden from Obsidian indexing');
  if(recordApi.METADATA_RECORD_CONTRACT_VERSION!=='0.4') fail('active/missing record contract version must be 0.4');
  if(Object.prototype.hasOwnProperty.call(recordApi,'METADATA_RECORD_STATUS_TRASHED')) fail('trashed status must not exist in ordinary document record contract');
  if(recordApi.metadataRecordPathFromId(id)!==`File Metadata/12/${id}.md`) fail('metadata UUID sharding path drifted');
  if(!recordApi.metadataRecordIsPath(`File Metadata/12/${id}.md`)) fail('canonical metadata record path not recognized');
  if(recordApi.metadataRecordIsPath(`.pdf-metadata/${id}.md`)) fail('hidden technical metadata root accepted as document record root');

  const record={
    id,
    pdfPath:'Cases/2016/example.pdf',
    status:recordApi.METADATA_RECORD_STATUS_ACTIVE,
    values:{
      document_date:'2016-03-17',
      document_time:'14:35',
      sender:'Oslo kommune',
      document_type:'decision',
      response_received:false
    }
  };
  const markdown=recordApi.metadataRecordSerializeMarkdown(record,schema);
  for(const required of [
    'filemeta_type: "pdf"',
    'filemeta_profile: "document"',
    'filemeta_version: 2',
    `filemeta_id: "${id}"`,
    'filemeta_file: "[[Cases/2016/example.pdf]]"',
    'filemeta_status: "active"',
    'document_date: 2016-03-17',
    'document_time: "14:35"',
    'sender: "Oslo kommune"',
    'document_type: "decision"',
    'response_received: false'
  ]) if(!markdown.includes(required)) fail(`metadata record serialization missing: ${required}`);

  const parsed=recordApi.metadataRecordFromFrontmatter({
    filemeta_type:'pdf',filemeta_profile:'document',filemeta_version:2,filemeta_id:id,filemeta_file:'[[Cases/2016/example.pdf]]',filemeta_status:'active',
    document_date:'2016-03-17',document_time:'14:35',sender:'Oslo kommune',document_type:'decision',response_received:false
  },schema);
  if(!parsed.ok||parsed.record.id!==id||parsed.record.pdfPath!=='Cases/2016/example.pdf'||parsed.record.values.document_date!=='2016-03-17'||parsed.record.values.response_received!==false) fail('metadata record frontmatter parse contract failed');
  const rejectedTrashed=recordApi.metadataRecordFromFrontmatter({
    filemeta_type:'pdf',filemeta_profile:'document',filemeta_version:2,filemeta_id:id,filemeta_file:'[[Cases/2016/example.pdf]]',filemeta_status:'trashed'
  },schema);
  if(rejectedTrashed.ok) fail('ordinary document record accepted retired trashed status');
  const rejectedSha=recordApi.metadataRecordFromFrontmatter({
    filemeta_type:'pdf',filemeta_profile:'document',filemeta_version:2,filemeta_id:id,filemeta_file:'[[Cases/2016/example.pdf]]',filemeta_status:'active',filemeta_sha256:'0'.repeat(64)
  },schema);
  if(rejectedSha.ok) fail('ordinary document record accepted retired filemeta_sha256 field');

  const repositorySource=read('src/metadata/record-repository.js');
  const cacheSource=read('src/metadata/record-index-cache.js');
  const feature=read('src/plugin/features/16-document-records.js');
  const lifecycle=read('src/plugin/features/01-lifecycle.js');
  const settingsSource=read('src/main/settings.js');
  const vaultRead=read('src/platform/obsidian-vault-read.js');
  if(repositoryApi.METADATA_RECORD_REPOSITORY_CONTRACT_VERSION!=='0.2') fail('metadata record repository contract version drifted');
  if(cacheApi.METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION!=='0.2') fail('metadata record index cache contract version drifted');
  if(cacheApi.METADATA_RECORD_INDEX_CACHE_PATH!=='.pdf-metadata/document-record-index-cache.json') fail('metadata record index cache path drifted');
  for(const required of ['schema_sha256','mtime','size','record_contract_version','record_format_version']) if(!cacheSource.includes(required)) fail(`metadata record index cache safety contract missing: ${required}`);
  const cacheFiles=new Map();
  const cacheStore={
    async exists(p){return cacheFiles.has(p)},
    async readText(p){return cacheFiles.get(p)||''},
    async writeText(p,data){cacheFiles.set(p,String(data));return {path:p}},
    async ensureFolder(){return {path:'.pdf-metadata'}}
  };
  const cache=cacheApi.createMetadataRecordIndexCache({fileStore:cacheStore,recordApi,cryptoApi:require('crypto')});
  const cacheFile={path:`File Metadata/12/${id}.md`,extension:'md',stat:{mtime:1000,size:321}};
  await cache.write(schema,[{file:cacheFile,parsed:{ok:true,record,recordPath:cacheFile.path}}]);
  let cacheState=await cache.load(schema);
  if(!cacheState.usable||cacheState.entries.size!==1) fail('metadata record index cache did not round-trip');
  if(!cache.get(cacheState,cacheFile)?.cacheHit) fail('metadata record index cache did not hit unchanged file');
  if(cache.get(cacheState,{...cacheFile,stat:{mtime:1001,size:321}})) fail('metadata record index cache trusted changed mtime');
  const changedSchema=JSON.parse(JSON.stringify(schema)); changedSchema.fields[0].label='Changed label';
  cacheState=await cache.load(changedSchema);
  if(cacheState.usable||cacheState.reason!=='schema-mismatch') fail('metadata record index cache did not invalidate on schema change');
  for(const required of ['vaultWriteAdapter.createText','frontmatterAdapter.processFrontMatter','verifyRecordPath']) if(!repositorySource.includes(required)) fail(`metadata record repository persistence contract missing: ${required}`);
  if(!vaultRead.includes('listMarkdownFiles()')||!vaultRead.includes('vault.getMarkdownFiles()')) fail('metadata RAM-index does not enumerate Obsidian-indexed Markdown files');
  if(!vaultRead.includes('listFiles()')||!vaultRead.includes('vault.getFiles()')) fail('existing-PDF registration cannot enumerate vault files');
  if(!feature.includes('parseDocumentRecordFile(file,schema,true)')) fail('cold-start record index does not force canonical disk frontmatter reads');
  for(const required of ['byPdfPath','byId','metadataUuidV4()','METADATA_RECORD_STATUS_MISSING','updateDocumentRecordForPdfRename','markDocumentRecordMissingForPdfDelete','ambiguousPdfPaths','resolveDocumentRecordPdfPath','obsidianLinkResolutionAdapter?.resolveFirst','ensureMinimalDocumentRecordForPdf','autoRegisterNewPdfs','getMissingDocumentRecordSummary','deleteMissingDocumentRecords','getExistingPdfRegistrationSummary','registerExistingPdfRecords','isDocumentRegistrationPdfPath','resolveDocumentRecordPdfPresence','reconcileMissingDocumentRecords']) if(!feature.includes(required)) fail(`DocumentRecords feature contract missing: ${required}`);
  if(/recoverMissingDocumentRecordByExactSha|relinkMissingDocumentRecord|metadataMissingRecovery|filemeta_sha256/.test(feature)) fail('DocumentRecords must not expose abandoned SHA/manual relink behavior');
  if(feature.includes('refreshDocumentInfoViews')) fail('DocumentRecords calls back into DocumentInfo and creates a cross-feature cycle');
  if(!lifecycle.includes('onLayoutReady(() =>')||!lifecycle.includes('handleDocumentRecordVaultRename')||!lifecycle.includes('handleDocumentRecordVaultDelete')) fail('metadata record lifecycle listeners missing from layout-ready orchestration');
  if(lifecycle.indexOf('onLayoutReady(() =>')>lifecycle.indexOf('handleDocumentRecordVaultRename')) fail('metadata record vault listeners are registered before layoutReady');
  if(!lifecycle.includes("refreshDocumentInfoAfterRecordEvent")) fail('metadata record lifecycle does not refresh open DocumentInfo views through lifecycle owner');
  if(!lifecycle.includes("scheduleMissingDocumentRecordsDialog")||!lifecycle.includes("review-missing-documents")) fail('missing-record review dialog is not connected to lifecycle/Command Palette');
  for(const required of ["scheduleOfflineMissingReconciliation","runOfflineMissingReconciliation","missingReconciliationLayoutReady","reconcileMissingDocumentRecords"]) if(!lifecycle.includes(required)) fail(`offline missing reconciliation lifecycle contract missing: ${required}`);
  if(!lifecycle.includes("scheduler.scheduleIdle")) fail('offline missing reconciliation is not deferred through idle scheduling');
  const offlineScheduleStart=lifecycle.indexOf("scheduleOfflineMissingReconciliation() {");
  const offlineScheduleEnd=lifecycle.indexOf("async runOfflineMissingReconciliation()",offlineScheduleStart);
  const offlineScheduleSource=lifecycle.slice(offlineScheduleStart,offlineScheduleEnd);
  if(offlineScheduleSource.includes("!this.state.lifecycle.missingReconciliationMetadataResolved")) fail('offline reconciliation still depends on a cache-resolved event that may have fired before plugin registration');
  if(!lifecycle.includes("obsidianMetadataCacheAdapter.onResolved")||!lifecycle.includes("markDocumentRecordMetadataResolved()")) fail('metadata-resolved startup gate is not registered early by lifecycle owner');
  if(!lifecycle.includes("markDocumentRecordLayoutReady()")) fail('layout-ready startup gate is not signaled by lifecycle owner');
  if(!lifecycle.includes("autoRegisterNewPdfs:persistedSettings.autoRegisterNewPdfs !== false")) fail('automatic new-PDF registration setting is not default-on');
  if(!settingsSource.includes("settings.documentRegister.autoRegisterNewPdfs.name")||!settingsSource.includes("saveSetting('autoRegisterNewPdfs'")) fail('automatic new-PDF registration setting is missing from Settings UI');
  if(!settingsSource.includes("settings.documentRegister.registerExisting.name")||!settingsSource.includes("getExistingPdfRegistrationSummary")||!settingsSource.includes("registerExistingPdfRecords")) fail('explicit existing-PDF registration action is missing from Settings UI');
  if(lifecycle.includes("this.ports.scheduleDocumentRecordIndexWarmup()")) fail('lifecycle owner bypasses DocumentRecords two-signal startup gate');
  if(lifecycle.includes("void this.ports.ensureDocumentRecordIndexReady().catch")) fail('layout-ready still starts DocumentRecords synchronously');
  for(const required of ["markDocumentRecordLayoutReady()","markDocumentRecordMetadataResolved()","warmupLayoutReady","warmupMetadataResolved","idle-after-layout-ready+metadata-resolved","readyPromise","cold-start-idle"]) if(!feature.includes(required)) fail(`DocumentRecords resolved/layout/idle readiness contract missing: ${required}`);
  const metadataCacheAdapterSource=read('src/platform/obsidian-metadata-cache.js');
  if(!metadataCacheAdapterSource.includes("metadataCache.on('resolved'")||!metadataCacheAdapterSource.includes('onResolved')) fail('metadata cache adapter lacks resolved-event boundary');
  const metadataCacheApi=require(path.join(ROOT,'src/platform/obsidian-metadata-cache.js'));
  let resolvedCallback=null;
  const metadataAdapter=metadataCacheApi.createObsidianMetadataCacheAdapter({metadataCache:{on(name,callback){if(name!=='resolved') fail('metadata cache adapter subscribed to wrong event'); resolvedCallback=callback; return {event:name};},getFileCache(){return null;}}});
  if(metadataCacheApi.OBSIDIAN_METADATA_CACHE_CONTRACT_VERSION!=='0.2') fail('metadata cache adapter contract version drifted');
  const resolvedRef=metadataAdapter.onResolved(()=>{});
  if(resolvedRef?.event!=='resolved'||typeof resolvedCallback!=='function') fail('metadata cache resolved-event adapter contract failed');
  const workspaceLifecycle=read('src/platform/obsidian-workspace-lifecycle.js');
  if(!workspaceLifecycle.includes('requestIdleCallback')||!workspaceLifecycle.includes('cancelIdleCallback')) fail('workspace lifecycle adapter lacks browser idle scheduling');
  const workspaceLifecycleApi=require(path.join(ROOT,'src/platform/obsidian-workspace-lifecycle.js'));
  let idleCallback=null, cancelledIdleId=null;
  const fakeWindow={
    requestIdleCallback(callback){ idleCallback=callback; return 77; },
    cancelIdleCallback(id){ cancelledIdleId=id; },
    setTimeout(callback){ callback(); return 88; },
    clearTimeout(){}
  };
  const fakeWorkspace={on(){return {event:'active-leaf-change'}},onLayoutReady(callback){callback();return {event:'layout-ready'}}};
  const lifecycleAdapter=workspaceLifecycleApi.createObsidianWorkspaceLifecycleAdapter({workspace:fakeWorkspace,windowObject:fakeWindow});
  let idleRan=false;
  const idleHandle=lifecycleAdapter.scheduleIdle(()=>{idleRan=true});
  if(idleHandle.kind!=='requestIdleCallback'||idleHandle.id!==77||idleRan) fail('idle scheduler did not defer callback through requestIdleCallback');
  idleCallback();
  if(!idleRan) fail('idle scheduler callback did not run');
  lifecycleAdapter.cancelIdle(idleHandle);
  if(cancelledIdleId!==77) fail('idle scheduler cancellation did not use cancelIdleCallback');

  // Behavioral integration of the owner: automatic minimal create -> metadata update -> PDF rename -> unexpected disappearance/missing -> fresh identity on a later PDF at the same path -> ambiguity fail-closed.
  const globalKeys=[
    'METADATA_RECORD_CONTRACT_VERSION','METADATA_RECORD_FORMAT_VERSION','METADATA_RECORD_TYPE','METADATA_RECORDS_ROOT',
    'METADATA_RECORD_STATUS_ACTIVE','METADATA_RECORD_STATUS_MISSING','METADATA_RECORD_SYSTEM_PROPERTIES',
    'metadataRecordNormalizeVaultPath','metadataRecordIsUuidV4','metadataRecordPathFromId','metadataRecordIsPath',
    'metadataRecordPdfLink','metadataRecordPdfPathFromLink','metadataRecordClone','metadataRecordIsEmptyUserValue',
    'metadataRecordNormalizeFrontmatterValue','metadataRecordFromFrontmatter','metadataRecordSerializeMarkdown'
  ];
  for(const key of globalKeys) global[key]=recordApi[key];
  global.metadataUuidV4=schemaApi.metadataUuidV4;
  global.metadataBenchmarkIsPdfPath=benchmarkApi.metadataBenchmarkIsPdfPath;
  global.metadataBenchmarkIsRecordPath=benchmarkApi.metadataBenchmarkIsRecordPath;
  global.PLUGIN_VERSION=JSON.parse(read('manifest.json')).version;
  const featureModulePath=path.join(ROOT,'src/plugin/features/16-document-records.js');
  delete require.cache[require.resolve(featureModulePath)];
  const {DocumentRecordsFeature}=require(featureModulePath);
  const makeState=()=>({
    initialized:false,readyPromise:null,warmupIdleHandle:null,warmupScheduledAtMs:null,warmupScheduleMode:null,warmupLayoutReady:false,warmupMetadataResolved:false,warmupGateOrder:'',operationQueue:Promise.resolve(),byPdfPath:new Map(),byId:new Map(),entryByRecordPath:new Map(),
    recordPathsById:new Map(),idsByPdfPath:new Map(),ambiguousIds:new Set(),ambiguousPdfPaths:new Set(),invalidRecordPaths:new Set(),invalidRecordErrors:new Map(),lastError:null,
    lastBuildMetrics:null,benchmarkEventSuppression:false
  });
  const files=new Map();
  const fakeRepository={
    async createRecord(value){
      const recordPath=recordApi.metadataRecordPathFromId(value.id);
      const file={path:recordPath,extension:'md'};
      const cloned=recordApi.metadataRecordClone(value);
      files.set(recordPath,{file,record:cloned});
      return {ok:true,file,record:cloned,recordPath};
    },
    async updateRecord(file,value){
      const cloned=recordApi.metadataRecordClone(value);
      files.set(file.path,{file,record:cloned});
      return {ok:true,file,record:cloned,recordPath:file.path};
    },
    async readRecordFile(file){
      const stored=files.get(file.path);
      return stored ? {ok:true,file,record:recordApi.metadataRecordClone(stored.record),recordPath:file.path} : {ok:false,error:'missing',file,recordPath:file.path};
    }
  };
  const owner=new DocumentRecordsFeature();
  owner.state={documentRecords:makeState()};
  owner.settings={autoRegisterNewPdfs:true};
  owner.ports={getMetadataSchemaSnapshot:()=>schema};
  const extraVaultFiles=new Map();
  const pdfFiles=new Map([
    ['Docs/a.pdf',{path:'Docs/a.pdf',extension:'pdf'}],
    ['Archive/a.pdf',{path:'Archive/a.pdf',extension:'pdf'}],
    ['Recovered/a.pdf',{path:'Recovered/a.pdf',extension:'pdf'}],
    ['Taken/occupied.pdf',{path:'Taken/occupied.pdf',extension:'pdf'}],
    ['10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf',{path:'10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf',extension:'pdf'}]
  ]);
  owner.obsidianVaultReadAdapter={
    listMarkdownFiles:()=>[...files.values()].map(item=>item.file),
    listFiles:()=>[...pdfFiles.values()],
    getAbstractFileByPath:path=>pdfFiles.get(String(path||'')) || extraVaultFiles.get(String(path||'')) || null
  };
  owner.obsidianLinkResolutionAdapter={resolveFirst:(linkpath)=>{
    const target=String(linkpath||'');
    if(target==='h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf') return {ok:true,file:pdfFiles.get('10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf')};
    const direct=pdfFiles.get(target) || null;
    return {ok:true,file:direct};
  }};
  owner.obsidianMetadataCacheAdapter={getFrontmatter:()=>null};
  owner.obsidianVaultWriteAdapter={
    async deleteFile(file){
      if(!file?.path) throw new Error('test delete mangler fil');
      files.delete(file.path);
      return true;
    }
  };
  owner.metadataRecordRepository=fakeRepository;
  owner.metadataRecordIndexCache={
    async load(){return {ok:true,usable:true,reason:'test-empty',entries:new Map()}},
    get(){return null},
    async write(){return {ok:true,entryCount:files.size,path:cacheApi.METADATA_RECORD_INDEX_CACHE_PATH}}
  };

  let scheduledOwnerIdle=null, ownerIdleCancelled=0;
  owner.obsidianWorkspaceLifecycleAdapter={
    scheduleIdle(callback){scheduledOwnerIdle=callback;return {kind:'requestIdleCallback',id:91}},
    cancelIdle(handle){if(handle?.id===91) ownerIdleCancelled++;return true}
  };
  if(owner.markDocumentRecordLayoutReady()!==false||scheduledOwnerIdle!==null) fail('layout-ready alone incorrectly scheduled DocumentRecords warmup');
  if(owner.markDocumentRecordMetadataResolved()!==true||typeof scheduledOwnerIdle!=='function') fail('resolved+layout-ready did not schedule background idle warmup');
  if(owner.state.documentRecords.warmupGateOrder!=='layout-ready>metadata-resolved') fail(`startup gate order not captured: ${owner.state.documentRecords.warmupGateOrder}`);
  if(owner.state.documentRecords.initialized) fail('DocumentRecords warmup ran before idle callback');
  const firstReady=owner.ensureDocumentRecordIndexReady('cold-start-demand');
  const secondReady=owner.ensureDocumentRecordIndexReady('cold-start-demand');
  if(firstReady!==secondReady) fail('DocumentRecords readiness is not single-flight');
  await firstReady;

  // Status-summary self-healing: an invalid-record path that no longer exists
  // must disappear automatically, while a still-existing invalid Markdown file
  // remains visible as an error. Lookup uncertainty must never delete state.
  const staleInvalidPath='File Metadata/ff/stale-invalid.md';
  const presentInvalidPath='File Metadata/ee/present-invalid.md';
  owner.state.documentRecords.invalidRecordPaths.add(staleInvalidPath);
  owner.state.documentRecords.invalidRecordErrors.set(staleInvalidPath,'stale invalid detail');
  extraVaultFiles.set(presentInvalidPath,{path:presentInvalidPath,extension:'md'});
  owner.state.documentRecords.invalidRecordPaths.add(presentInvalidPath);
  owner.state.documentRecords.invalidRecordErrors.set(presentInvalidPath,'filemeta_id er ikke UUID v4');
  let registerStatus=await owner.getDocumentRegisterStatusSummary();
  if(registerStatus.errorCount!==1||registerStatus.staleInvalidRemovedCount!==1||!owner.state.documentRecords.invalidRecordPaths.has(presentInvalidPath)||owner.state.documentRecords.invalidRecordPaths.has(staleInvalidPath)) {
    fail(`Document Register stale-invalid pruning failed: ${JSON.stringify(registerStatus)}`);
  }
  if(registerStatus.errorItems[0]?.detail!=='filemeta_id er ikke UUID v4'||owner.state.documentRecords.invalidRecordErrors.has(staleInvalidPath)) {
    fail(`Document Register invalid-record validation detail drifted: ${JSON.stringify(registerStatus)}`);
  }
  extraVaultFiles.delete(presentInvalidPath);
  registerStatus=await owner.getDocumentRegisterStatusSummary();
  if(registerStatus.errorCount!==0||registerStatus.staleInvalidRemovedCount!==1||owner.state.documentRecords.invalidRecordPaths.has(presentInvalidPath)||owner.state.documentRecords.invalidRecordErrors.has(presentInvalidPath)) {
    fail(`Document Register did not prune invalid record/error detail after file disappearance: ${JSON.stringify(registerStatus)}`);
  }

  if(ownerIdleCancelled!==1) fail('on-demand readiness did not cancel pending idle warmup');
  if(!owner.state.documentRecords.lastBuildMetrics || owner.state.documentRecords.lastBuildMetrics.reason!=='cold-start-demand') fail('document record on-demand cold-start metrics were not captured');
  if(owner.state.documentRecords.lastBuildMetrics.startupScheduleMode!=='on-demand-before-idle') fail('on-demand startup scheduling mode not captured');
  const technicalCreate=await owner.handleDocumentRecordVaultCreate({path:'Docs/.pdfium-backup/a.pdf',extension:'pdf'});
  if(!technicalCreate?.ignored||technicalCreate.reason!=='technical-pdf') fail('live automatic registration did not exclude .pdfium-backup PDF');

  owner.settings.autoRegisterNewPdfs=false;
  let disabledCreate=await owner.handleDocumentRecordVaultCreate({path:'Recovered/a.pdf',extension:'pdf'});
  if(!disabledCreate?.ignored||disabledCreate.reason!=='auto-registration-disabled') fail('disabled automatic PDF registration did not ignore PDF create');
  if(owner.getDocumentMetadataRecordState('Recovered/a.pdf').registered) fail('disabled automatic PDF registration created a record');
  owner.settings.autoRegisterNewPdfs=true;

  let autoCreated=await owner.handleDocumentRecordVaultCreate({path:'Docs/a.pdf',extension:'pdf'});
  if(!autoCreated?.ok||!autoCreated.created) fail(`automatic minimal record create failed: ${autoCreated?.error || 'unknown'}`);
  const firstId=autoCreated.id, firstRecordPath=autoCreated.recordPath;
  let lookup=owner.getDocumentMetadataRecordState('Docs/a.pdf');
  if(!lookup.registered||lookup.id!==firstId||Object.keys(lookup.values||{}).length!==0) fail('automatic minimal record was not indexed as an empty active record');

  let duplicateCreate=await owner.handleDocumentRecordVaultCreate({path:'Docs/a.pdf',extension:'pdf'});
  if(!duplicateCreate?.ok||duplicateCreate.created!==false||duplicateCreate.id!==firstId) fail('repeat PDF create was not idempotent for an existing active record');

  let persisted=await owner.saveDocumentMetadataRecordValues('Docs/a.pdf',{sender:'Oslo kommune',document_date:'2016-03-17'});
  if(!persisted.ok||persisted.id!==firstId) fail(`metadata update did not preserve minimal-record identity: ${persisted.error || 'unknown'}`);
  lookup=owner.getDocumentMetadataRecordState('Docs/a.pdf');
  if(!lookup.registered||lookup.id!==firstId||lookup.values.sender!=='Oslo kommune') fail('metadata update after automatic minimal create was not indexed');
  let lifecycleResult=await owner.handleDocumentRecordVaultRename({path:'Archive/a.pdf',extension:'pdf'},'Docs/a.pdf');
  if(!lifecycleResult?.ok||owner.getDocumentMetadataRecordState('Docs/a.pdf').registered) fail('PDF rename did not remove old path binding');
  lookup=owner.getDocumentMetadataRecordState('Archive/a.pdf');
  if(!lookup.registered||lookup.id!==firstId) fail('PDF rename did not preserve record identity at new path');

  // Simulate full Obsidian restart after rename where metadataCache is stale but Markdown on disk is correct.
  // Cold-start rebuild must trust the persisted record, not cache frontmatter.
  owner.state.documentRecords=makeState();
  owner.obsidianMetadataCacheAdapter={getFrontmatter:()=>({
    filemeta_type:'pdf',filemeta_version:1,filemeta_id:firstId,filemeta_file:'[[Docs/a.pdf]]',filemeta_status:'active',
    sender:'Oslo kommune',document_date:'2016-03-17'
  })};
  await owner.ensureDocumentRecordIndexReady();
  lookup=owner.getDocumentMetadataRecordState('Archive/a.pdf');
  if(!lookup.registered||lookup.id!==firstId) fail('cold-start rebuild after PDF rename trusted stale metadataCache instead of persisted Markdown record');
  if(owner.getDocumentMetadataRecordState('Docs/a.pdf').registered) fail('cold-start rebuild after PDF rename resurrected stale pre-rename PDF path');

  // Obsidian may rewrite an equivalent filemeta_file link to shortest-path form on rename.
  // The textual link is not document identity: both forms must index as the same TFile.path.
  const shortestId='423e4567-e89b-42d3-a456-426614174000';
  const shortestRecordPath=recordApi.metadataRecordPathFromId(shortestId);
  const shortestFile={path:shortestRecordPath,extension:'md'};
  files.clear();
  files.set(shortestRecordPath,{file:shortestFile,record:{
    id:shortestId,
    pdfPath:'h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf',
    status:recordApi.METADATA_RECORD_STATUS_ACTIVE,
    values:{sender:'Oslo kommune'}
  }});
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  lookup=owner.getDocumentMetadataRecordState('10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf');
  if(!lookup.registered||lookup.id!==shortestId||lookup.values.sender!=='Oslo kommune') fail('shortest-path filemeta_file was not canonicalized to resolved TFile.path');
  if(owner.getDocumentMetadataRecordState('h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf').registered) fail('raw shortest wikilink text leaked into byPdfPath identity');

  // Restore the first record for delete lifecycle continuation.
  files.clear();
  const firstFile={path:firstRecordPath,extension:'md'};
  files.set(firstRecordPath,{file:firstFile,record:{id:firstId,pdfPath:'Archive/a.pdf',status:recordApi.METADATA_RECORD_STATUS_ACTIVE,values:{sender:'Oslo kommune',document_date:'2016-03-17'}}});
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  lifecycleResult=await owner.handleDocumentRecordVaultDelete({path:'Archive/a.pdf',extension:'pdf'});
  if(!lifecycleResult?.ok||owner.getDocumentMetadataRecordState('Archive/a.pdf').registered) fail('PDF delete retained an active path binding');
  const retained=files.get(firstRecordPath)?.record;
  if(!retained||retained.status!==recordApi.METADATA_RECORD_STATUS_MISSING||retained.pdfPath!=='Archive/a.pdf') fail('PDF disappearance did not retain the record as missing');

  // A later PDF at the same path is a new document identity. The missing record remains historical.
  pdfFiles.set('Archive/a.pdf',{path:'Archive/a.pdf',extension:'pdf'});
  const createResult=await owner.handleDocumentRecordVaultCreate({path:'Archive/a.pdf',extension:'pdf'});
  if(!createResult?.ok||!createResult.created) fail('new PDF at a missing record path did not receive a fresh minimal record');
  if(createResult.id===firstId) fail('new PDF at a missing record path reused the missing record identity');
  lookup=owner.getDocumentMetadataRecordState('Archive/a.pdf');
  if(!lookup.registered||lookup.id!==createResult.id) fail('new PDF at a missing record path was not indexed as the active record');
  const stillMissing=files.get(firstRecordPath)?.record;
  if(!stillMissing||stillMissing.status!==recordApi.METADATA_RECORD_STATUS_MISSING||stillMissing.id!==firstId) fail('missing safety record was modified/rebound when a later PDF appeared at the same path');

  const missingSummary=owner.getMissingDocumentRecordSummary();
  if(missingSummary.count!==1||missingSummary.items[0]?.id!==firstId) fail('missing record summary did not report the retained missing metadata');
  const missingDelete=await owner.deleteMissingDocumentRecords();
  if(!missingDelete?.ok||missingDelete.deletedCount!==1||missingDelete.remainingCount!==0) fail('missing metadata delete operation did not remove exactly the missing record');
  if(files.has(firstRecordPath)) fail('missing metadata file remained after explicit delete');
  lookup=owner.getDocumentMetadataRecordState('Archive/a.pdf');
  if(!lookup.registered||lookup.id!==createResult.id) fail('deleting missing metadata removed or disturbed the active replacement record');

  // Missing is a temporary safety state awaiting user action. There is deliberately no
  // automatic or manual transition from a missing record back to active.
  if(typeof owner.relinkMissingDocumentRecord!=='undefined'||typeof owner.recoverMissingDocumentRecordByExactSha!=='undefined') fail('missing record recovery/relink operation must not exist');

  // Explicit registration of PDFs that already exist in the vault is user-invoked.
  // Technical annotation backups and benchmark PDFs must not be treated as user documents.
  files.clear();
  pdfFiles.clear();
  const existingActiveId='523e4567-e89b-42d3-a456-426614174000';
  const existingActivePath=recordApi.metadataRecordPathFromId(existingActiveId);
  const existingActiveFile={path:existingActivePath,extension:'md'};
  files.set(existingActivePath,{file:existingActiveFile,record:{
    id:existingActiveId,pdfPath:'Existing/already.pdf',status:recordApi.METADATA_RECORD_STATUS_ACTIVE,values:{}
  }});
  const historicalMissingId='623e4567-e89b-42d3-a456-426614174000';
  const historicalMissingPath=recordApi.metadataRecordPathFromId(historicalMissingId);
  const historicalMissingFile={path:historicalMissingPath,extension:'md'};
  files.set(historicalMissingPath,{file:historicalMissingFile,record:{
    id:historicalMissingId,pdfPath:'Legacy/missing-again.pdf',status:recordApi.METADATA_RECORD_STATUS_MISSING,values:{sender:'Historical'}
  }});
  pdfFiles.set('Existing/already.pdf',{path:'Existing/already.pdf',extension:'pdf'});
  pdfFiles.set('Legacy/one.pdf',{path:'Legacy/one.pdf',extension:'pdf'});
  pdfFiles.set('Legacy/missing-again.pdf',{path:'Legacy/missing-again.pdf',extension:'pdf'});
  pdfFiles.set('Existing/.pdfium-backup/already.pdf',{path:'Existing/.pdfium-backup/already.pdf',extension:'pdf'});
  const benchmarkPdfPath=benchmarkApi.metadataBenchmarkPdfPath(1);
  pdfFiles.set(benchmarkPdfPath,{path:benchmarkPdfPath,extension:'pdf'});
  owner.state.documentRecords=makeState();
  owner.obsidianMetadataCacheAdapter={getFrontmatter:()=>null};
  await owner.ensureDocumentRecordIndexReady();
  const existingSummary=await owner.getExistingPdfRegistrationSummary();
  if(!existingSummary?.ok||existingSummary.totalPdfCount!==3||existingSummary.registeredCount!==1||existingSummary.unregisteredCount!==2||existingSummary.problemCount!==0) {
    fail(`existing-PDF scan summary drifted: ${JSON.stringify(existingSummary)}`);
  }
  const existingRegistration=await owner.registerExistingPdfRecords();
  if(!existingRegistration?.ok||existingRegistration.createdCount!==2||existingRegistration.alreadyRegisteredCount!==1||existingRegistration.problemCount!==0) {
    fail(`existing-PDF registration failed: ${JSON.stringify(existingRegistration)}`);
  }
  const postExistingSummary=await owner.getExistingPdfRegistrationSummary();
  if(postExistingSummary.unregisteredCount!==0||postExistingSummary.registeredCount!==3) fail('existing-PDF registration was not idempotent');
  const recreatedMissing=owner.getDocumentMetadataRecordState('Legacy/missing-again.pdf');
  if(!recreatedMissing.registered||recreatedMissing.id===historicalMissingId) fail('existing-PDF registration reused a historical missing identity');
  const retainedHistoricalMissing=files.get(historicalMissingPath)?.record;
  if(!retainedHistoricalMissing||retainedHistoricalMissing.status!==recordApi.METADATA_RECORD_STATUS_MISSING) fail('existing-PDF registration modified historical missing metadata');
  if([...files.values()].some(item=>item.record?.pdfPath==='Existing/.pdfium-backup/already.pdf'||item.record?.pdfPath===benchmarkPdfPath)) fail('existing-PDF registration included technical PDF paths');

  // Offline reconciliation: an active record whose PDF disappeared while Obsidian
  // was closed becomes missing after the startup index is ready. Present files stay active.
  files.clear();
  pdfFiles.clear();
  const offlinePresentId='723e4567-e89b-42d3-a456-426614174000';
  const offlineGoneId='823e4567-e89b-42d3-a456-426614174000';
  const offlineAlreadyMissingId='923e4567-e89b-42d3-a456-426614174000';
  const offlineBenchmarkId='a23e4567-e89b-42d3-a456-426614174000';
  const putRecord=(id,pdfPath,status,values={})=>{
    const recordPath=recordApi.metadataRecordPathFromId(id);
    const file={path:recordPath,extension:'md'};
    files.set(recordPath,{file,record:{id,pdfPath,status,values}});
    return recordPath;
  };
  const offlinePresentRecordPath=putRecord(offlinePresentId,'Offline/present.pdf',recordApi.METADATA_RECORD_STATUS_ACTIVE);
  const offlineGoneRecordPath=putRecord(offlineGoneId,'Offline/gone.pdf',recordApi.METADATA_RECORD_STATUS_ACTIVE,{sender:'Offline sender'});
  const offlineAlreadyMissingRecordPath=putRecord(offlineAlreadyMissingId,'Offline/already-missing.pdf',recordApi.METADATA_RECORD_STATUS_MISSING,{sender:'Existing missing'});
  const offlineBenchmarkPath=benchmarkApi.metadataBenchmarkPdfPath(2);
  const offlineBenchmarkRecordPath=putRecord(offlineBenchmarkId,offlineBenchmarkPath,recordApi.METADATA_RECORD_STATUS_ACTIVE);
  pdfFiles.set('Offline/present.pdf',{path:'Offline/present.pdf',extension:'pdf'});
  owner.state.documentRecords=makeState();
  owner.obsidianMetadataCacheAdapter={getFrontmatter:()=>null};
  await owner.ensureDocumentRecordIndexReady('cold-start-idle');
  if(!owner.getDocumentMetadataRecordState('Offline/gone.pdf').registered) fail('offline-gone record was not active before reconciliation test');
  const offlineReconcile=await owner.reconcileMissingDocumentRecords();
  if(!offlineReconcile?.ok||offlineReconcile.changedCount!==1||offlineReconcile.totalMissingCount!==2) {
    fail(`offline missing reconciliation counts drifted: ${JSON.stringify(offlineReconcile)}`);
  }
  if(files.get(offlineGoneRecordPath)?.record?.status!==recordApi.METADATA_RECORD_STATUS_MISSING) fail('offline-disappeared PDF did not transition active -> missing');
  if(files.get(offlinePresentRecordPath)?.record?.status!==recordApi.METADATA_RECORD_STATUS_ACTIVE) fail('present PDF was incorrectly marked missing during offline reconciliation');
  if(files.get(offlineAlreadyMissingRecordPath)?.record?.status!==recordApi.METADATA_RECORD_STATUS_MISSING) fail('existing missing record changed during offline reconciliation');
  if(files.get(offlineBenchmarkRecordPath)?.record?.status!==recordApi.METADATA_RECORD_STATUS_ACTIVE) fail('benchmark PDF record was mutated by offline reconciliation');
  if(owner.getDocumentMetadataRecordState('Offline/gone.pdf').registered) fail('offline-disappeared PDF retained an active path binding after reconciliation');

  // Resolver/infrastructure uncertainty must fail closed: do not mark active as missing
  // merely because link resolution is unavailable.
  files.clear();
  pdfFiles.clear();
  const uncertainId='b23e4567-e89b-42d3-a456-426614174000';
  const uncertainRecordPath=putRecord(uncertainId,'Offline/uncertain.pdf',recordApi.METADATA_RECORD_STATUS_ACTIVE);
  owner.state.documentRecords=makeState();
  owner.obsidianLinkResolutionAdapter={resolveFirst:()=>({ok:false,file:null,reason:'resolver-unavailable',error:'test unavailable'})};
  await owner.ensureDocumentRecordIndexReady('cold-start-idle');
  const uncertainReconcile=await owner.reconcileMissingDocumentRecords();
  if(!uncertainReconcile?.ok||uncertainReconcile.changedCount!==0||uncertainReconcile.problemCount!==1) fail('offline reconciliation did not fail closed on resolver uncertainty');
  if(files.get(uncertainRecordPath)?.record?.status!==recordApi.METADATA_RECORD_STATUS_ACTIVE) fail('resolver uncertainty incorrectly changed active record to missing');

  // Restore normal fake link resolver for the remaining benchmark checks.
  owner.obsidianLinkResolutionAdapter={resolveFirst:(linkpath)=>{
    const target=String(linkpath||'');
    if(target==='h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf') return {ok:true,file:pdfFiles.get('10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf'),reason:'resolved-first-linkpath-destination'};
    const direct=pdfFiles.get(target) || null;
    return {ok:true,file:direct,reason:direct?'resolved-first-linkpath-destination':'not-found'};
  }};

  const benchmarkResult=await owner.runDocumentRecordIndexBenchmark();
  if(!benchmarkResult?.ok || benchmarkResult?.forcedBuild?.reason!=='benchmark-forced' || typeof benchmarkResult?.lookup?.rawAverageUs!=='number') fail('document record benchmark instrumentation failed');

  owner.setDocumentRecordBenchmarkEventSuppression(true);
  const suppressed=await owner.handleDocumentRecordVaultCreate({path:recordApi.metadataRecordPathFromId(benchmarkApi.metadataBenchmarkUuid(1)),extension:'md'});
  if(!suppressed?.benchmarkSuppressed) fail('benchmark bulk lifecycle suppression did not ignore benchmark record event');
  owner.setDocumentRecordBenchmarkEventSuppression(false);

  const duplicateIds=['223e4567-e89b-42d3-a456-426614174000','323e4567-e89b-42d3-a456-426614174000'];
  for(const duplicateId of duplicateIds){
    const recordPath=recordApi.metadataRecordPathFromId(duplicateId);
    const file={path:recordPath,extension:'md'};
    files.set(recordPath,{file,record:{id:duplicateId,pdfPath:'Dup/x.pdf',status:recordApi.METADATA_RECORD_STATUS_ACTIVE,values:{}}});
  }
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  lookup=owner.getDocumentMetadataRecordState('Dup/x.pdf');
  if(lookup.ok||lookup.reason!=='ambiguous-pdf-path') fail('duplicate PDF-path records did not fail closed');

  for(const key of globalKeys) delete global[key];
  delete global.metadataUuidV4;
  delete global.metadataBenchmarkIsPdfPath;
  delete global.metadataBenchmarkIsRecordPath;
  delete global.PLUGIN_VERSION;

  return {
    recordContractVersion:recordApi.METADATA_RECORD_CONTRACT_VERSION,
    recordFormatVersion:recordApi.METADATA_RECORD_FORMAT_VERSION,
    recordRoot:recordApi.METADATA_RECORDS_ROOT,
    visibleIndexedRoot:true,
    uuidSharded:true,
    lazyFirstSave:false,
    automaticMinimalRecordOnPdfCreate:true,
    autoRegisterNewPdfsSetting:true,
    explicitExistingPdfRegistration:true,
    existingPdfRegistrationExcludesTechnicalPdfs:true,
    liveRegistrationExcludesTechnicalPdfs:true,
    offlineMissingReconciliation:true,
    offlineReconciliationPreservesPresentPdf:true,
    offlineReconciliationFailsClosedOnResolverUncertainty:true,
    offlineReconciliationUsesIdleLifecycleGate:true,
    existingPdfRegistrationIsIdempotent:true,
    systemProperties:[...recordApi.METADATA_RECORD_SYSTEM_PROPERTIES],
    markdownYamlSourceOfTruth:true,
    ramIndex:{byPdfPath:true,byId:true},
    pdfRenameMoveTracking:true,
    pdfDeleteRetainsRecord:true,
    failClosedAmbiguity:true,
    frontmatterUpdatesViaFileManager:true,
    lifecycleAfterLayoutReady:true,
    backgroundWarmupAfterBrowserIdle:true,
    metadataResolvedAndLayoutReadyGate:true,
    startupGateOrderCaptured:true,
    singleFlightReadinessPromise:true,
    fixedStartupDelay:false,
    behavioralLazyCreate:false,
    behavioralAutomaticMinimalCreate:true,
    missingPathNewPdfGetsFreshIdentity:true,
    missingRecordReviewSummary:true,
    explicitMissingMetadataDelete:true,
    missingMetadataDeletePreservesActiveReplacement:true,
    behavioralRenamePreservesId:true,
    coldStartRenameReadsCanonicalDisk:true,
    wikilinkRepresentationResolvesToCanonicalTFilePath:true,
    behavioralDeleteRetainsMissing:true,
    missingPdfDoesNotAutoRebind:true,
    activeMissingStatusModel:true,
    missingRecoveryUnsupported:true,
    manualRelinkUnsupported:true,
    behavioralAmbiguityFailClosed:true,
    coldIndexMetricsCaptured:true,
    forcedIndexBenchmark:true,
    benchmarkEventSuppressionScoped:true,
    disposableIndexCache:true,
    cacheUsesFileMtimeAndSize:true,
    cacheInvalidatesOnSchemaChange:true,
    cacheKeepsMarkdownSourceOfTruth:true
  };
};
