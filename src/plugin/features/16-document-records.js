'use strict';

function documentRecordBenchmarkNowMs() {
  return typeof performance!=='undefined' && performance && typeof performance.now==='function' ? performance.now() : Date.now();
}

function documentRecordBenchmarkMemorySnapshot() {
  try {
    const usage=typeof process!=='undefined' && process && typeof process.memoryUsage==='function' ? process.memoryUsage() : null;
    if(!usage) return null;
    const mb=value=>Number((Number(value||0)/(1024*1024)).toFixed(3));
    return {rssMb:mb(usage.rss),heapUsedMb:mb(usage.heapUsed),heapTotalMb:mb(usage.heapTotal),externalMb:mb(usage.external)};
  } catch(_) { return null; }
}

function documentRecordStableComparable(value) {
  if(Array.isArray(value)) return value.map(item=>documentRecordStableComparable(item));
  if(value && typeof value==='object') {
    const out={};
    for(const key of Object.keys(value).sort((a,b)=>a.localeCompare(b))) out[key]=documentRecordStableComparable(value[key]);
    return out;
  }
  return value;
}

function documentRecordComparableValues(values) {
  const source=values && typeof values==='object' && !Array.isArray(values) ? values : {};
  return JSON.stringify(documentRecordStableComparable(source));
}

function documentRecordRegisterStatusSnapshot(documentRecords,pdfFiles,getState) {
  const state=documentRecords || {};
  const invalidRecordPaths=new Set(state.invalidRecordPaths || []);
  const problemRecordPaths=new Set(invalidRecordPaths);
  for(const id of state.ambiguousIds || []) {
    const paths=state.recordPathsById?.get?.(id);
    for(const path of paths || []) problemRecordPaths.add(metadataRecordNormalizeVaultPath(path));
  }
  for(const pdfPath of state.ambiguousPdfPaths || []) {
    const ids=state.idsByPdfPath?.get?.(pdfPath);
    for(const id of ids || []) {
      const paths=state.recordPathsById?.get?.(id);
      for(const path of paths || []) problemRecordPaths.add(metadataRecordNormalizeVaultPath(path));
    }
  }

  let activeCount=0;
  let missingCount=0;
  for(const [recordPath,entry] of state.entryByRecordPath?.entries?.() || []) {
    if(problemRecordPaths.has(recordPath)) continue;
    if(entry?.status===METADATA_RECORD_STATUS_ACTIVE) activeCount++;
    else if(entry?.status===METADATA_RECORD_STATUS_MISSING) missingCount++;
  }

  const duplicatePdfGroups=[...(state.ambiguousPdfPaths || [])].map(rawPdfPath=>{
    const pdfPath=metadataRecordNormalizeVaultPath(rawPdfPath);
    const records=[];
    const ids=state.idsByPdfPath?.get?.(pdfPath);
    for(const id of ids || []) {
      const paths=state.recordPathsById?.get?.(id);
      for(const recordPath of paths || []) {
        const entry=state.entryByRecordPath?.get?.(recordPath) || null;
        if(!entry || metadataRecordNormalizeVaultPath(entry.pdfPath)!==pdfPath) continue;
        records.push({
          id:String(entry.id || id || ''),
          recordPath:metadataRecordNormalizeVaultPath(entry.recordPath || recordPath),
          pdfPath,
          status:String(entry.status || ''),
          values:metadataRecordClone(entry.values || {})
        });
      }
    }
    records.sort((a,b)=>a.recordPath.localeCompare(b.recordPath));
    const signatures=records.map(record=>documentRecordComparableValues(record.values));
    const metadataIdentical=records.length>1 && signatures.every(signature=>signature===signatures[0]);
    return {pdfPath,metadataIdentical,records};
  }).filter(group=>group.records.length>1).sort((a,b)=>a.pdfPath.localeCompare(b.pdfPath));

  const errorItems=[...problemRecordPaths].map(recordPath=>{
    const entry=state.entryByRecordPath?.get?.(recordPath) || null;
    let reason='identity';
    if(invalidRecordPaths.has(recordPath)) reason='invalid';
    else if(entry?.id && state.ambiguousIds?.has?.(entry.id)) reason='ambiguous-id';
    else if(entry?.pdfPath && state.ambiguousPdfPaths?.has?.(entry.pdfPath)) reason='ambiguous-pdf-path';
    return {
      recordPath:metadataRecordNormalizeVaultPath(recordPath),
      pdfPath:metadataRecordNormalizeVaultPath(entry?.pdfPath || ''),
      reason,
      detail:reason==='invalid' ? String(state.invalidRecordErrors?.get?.(recordPath) || '') : ''
    };
  }).sort((a,b)=>a.recordPath.localeCompare(b.recordPath));

  const registrationProblemPaths=[];
  const unregisteredPdfPaths=[];
  const files=Array.isArray(pdfFiles) ? pdfFiles : [];
  for(const file of files) {
    const path=metadataRecordNormalizeVaultPath(file?.path);
    const registrationState=typeof getState === 'function' ? getState(path) : {ok:false};
    if(!registrationState?.ok) {
      registrationProblemPaths.push(path);
      continue;
    }
    if(!registrationState.registered) unregisteredPdfPaths.push(path);
  }
  unregisteredPdfPaths.sort((a,b)=>a.localeCompare(b));

  return {
    ok:true,
    activeCount,
    missingCount,
    errorCount:errorItems.length,
    unregisteredCount:unregisteredPdfPaths.length,
    allCount:activeCount + missingCount,
    totalRecordCount:Number(state.entryByRecordPath?.size || 0) + Number(state.invalidRecordPaths?.size || 0),
    totalPdfCount:files.length,
    errorItems,
    duplicatePdfGroups,
    unregisteredPdfPaths,
    problemRecordPaths:errorItems.map(item=>item.recordPath),
    registrationProblemCount:registrationProblemPaths.length,
    registrationProblemPaths
  };
}

class DocumentRecordsFeature {
  getDocumentRecordIndexCache() {
    if(this.metadataRecordIndexCache) return this.metadataRecordIndexCache;
    this.metadataRecordIndexCache=createMetadataRecordIndexCache({
      fileStore:this.obsidianAdapterFileStore,
      recordApi:metadataRecordContract,
      cryptoApi:crypto
    });
    return this.metadataRecordIndexCache;
  }

  getDocumentRecordRepository() {
    if(this.metadataRecordRepository) return this.metadataRecordRepository;
    this.metadataRecordRepository=createMetadataRecordRepository({
      vaultReadAdapter:this.obsidianVaultReadAdapter,
      vaultWriteAdapter:this.obsidianVaultWriteAdapter,
      frontmatterAdapter:this.obsidianFrontmatterAdapter,
      parseYamlFn:parseYaml,
      recordApi:metadataRecordContract
    });
    return this.metadataRecordRepository;
  }

  runDocumentRecordOperation(task) {
    const previous=this.state.documentRecords.operationQueue;
    const next=previous.then(()=>task(),()=>task());
    this.state.documentRecords.operationQueue=next.then(()=>undefined,()=>undefined);
    return next;
  }

  resolveDocumentRecordPdfPath(pdfPath, recordPath = '') {
    const linkPath=metadataRecordNormalizeVaultPath(pdfPath);
    if(!linkPath) return '';

    // Canonical identity is the actual vault TFile.path, never the textual
    // wikilink representation stored in filemeta_file. Obsidian may rewrite
    // an equivalent link from [[Folder/file.pdf]] to [[file.pdf]] after
    // rename; both must resolve to the same index key.
    // Resolve with Obsidian's own link semantics first. This is essential for
    // shortest-path links because a basename may refer to a file outside the
    // vault root and must not be mistaken for a same-named root file.
    const resolved=this.obsidianLinkResolutionAdapter?.resolveFirst?.(linkPath,metadataRecordNormalizeVaultPath(recordPath));
    if(resolved?.ok && resolved.file && String(resolved.file.extension || '').toLowerCase()==='pdf') {
      return metadataRecordNormalizeVaultPath(resolved.file.path);
    }

    // Direct lookup is only a fallback when Obsidian's resolver is unavailable
    // or cannot resolve an otherwise canonical vault path.
    const direct=this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(linkPath) || null;
    if(direct && String(direct.extension || '').toLowerCase()==='pdf') {
      return metadataRecordNormalizeVaultPath(direct.path);
    }

    // Missing PDFs must retain their persisted path so delete/missing records
    // remain inspectable even when there is no TFile to resolve.
    return linkPath;
  }

  clearDocumentRecordIndex() {
    this.state.documentRecords.byPdfPath.clear();
    this.state.documentRecords.byId.clear();
    this.state.documentRecords.entryByRecordPath.clear();
    this.state.documentRecords.recordPathsById.clear();
    this.state.documentRecords.idsByPdfPath.clear();
    this.state.documentRecords.ambiguousIds.clear();
    this.state.documentRecords.ambiguousPdfPaths.clear();
    this.state.documentRecords.invalidRecordPaths.clear();
    this.state.documentRecords.invalidRecordErrors.clear();
  }

  recomputeDocumentRecordPdfPath(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path) return;
    const ids=this.state.documentRecords.idsByPdfPath.get(path);
    if(!ids || ids.size===0) {
      this.state.documentRecords.idsByPdfPath.delete(path);
      this.state.documentRecords.byPdfPath.delete(path);
      this.state.documentRecords.ambiguousPdfPaths.delete(path);
      return;
    }
    if(ids.size===1) {
      const id=ids.values().next().value;
      const entry=this.state.documentRecords.byId.get(id);
      if(entry && !this.state.documentRecords.ambiguousIds.has(id) && entry.status===METADATA_RECORD_STATUS_ACTIVE && entry.pdfPath===path) {
        this.state.documentRecords.byPdfPath.set(path,id);
        this.state.documentRecords.ambiguousPdfPaths.delete(path);
        return;
      }
    }
    this.state.documentRecords.byPdfPath.delete(path);
    this.state.documentRecords.ambiguousPdfPaths.add(path);
  }

  recomputeDocumentRecordId(id) {
    const key=String(id || '').toLowerCase();
    const paths=this.state.documentRecords.recordPathsById.get(key);
    if(!paths || paths.size===0) {
      this.state.documentRecords.recordPathsById.delete(key);
      this.state.documentRecords.byId.delete(key);
      this.state.documentRecords.ambiguousIds.delete(key);
      return;
    }
    if(paths.size===1) {
      const recordPath=paths.values().next().value;
      const entry=this.state.documentRecords.entryByRecordPath.get(recordPath);
      if(entry) {
        this.state.documentRecords.byId.set(key,entry);
        this.state.documentRecords.ambiguousIds.delete(key);
      }
    } else {
      this.state.documentRecords.byId.delete(key);
      this.state.documentRecords.ambiguousIds.add(key);
    }
    for(const recordPath of paths) {
      const entry=this.state.documentRecords.entryByRecordPath.get(recordPath);
      if(entry?.pdfPath) this.recomputeDocumentRecordPdfPath(entry.pdfPath);
    }
  }

  addDocumentRecordEntry(entry) {
    const recordPath=metadataRecordNormalizeVaultPath(entry?.recordPath);
    const id=String(entry?.id || '').toLowerCase();
    const pdfPath=this.resolveDocumentRecordPdfPath(entry?.pdfPath,recordPath);
    if(!recordPath || !metadataRecordIsUuidV4(id) || !pdfPath) throw new Error('kan ikke indeksere ugyldig metadata-record');
    const canonicalPath=metadataRecordPathFromId(id);
    if(recordPath!==canonicalPath) throw new Error(`metadata-record ligger på ikke-canonical sti: ${recordPath}`);
    const normalized={...entry,recordPath,id,pdfPath,values:metadataRecordClone(entry.values || {})};
    this.state.documentRecords.invalidRecordPaths.delete(recordPath);
    this.state.documentRecords.invalidRecordErrors.delete(recordPath);
    this.state.documentRecords.entryByRecordPath.set(recordPath,normalized);
    let idPaths=this.state.documentRecords.recordPathsById.get(id);
    if(!idPaths) {
      idPaths=new Set();
      this.state.documentRecords.recordPathsById.set(id,idPaths);
    }
    idPaths.add(recordPath);
    if(normalized.status===METADATA_RECORD_STATUS_ACTIVE) {
      let pathIds=this.state.documentRecords.idsByPdfPath.get(pdfPath);
      if(!pathIds) {
        pathIds=new Set();
        this.state.documentRecords.idsByPdfPath.set(pdfPath,pathIds);
      }
      pathIds.add(id);
    }
    this.recomputeDocumentRecordId(id);
    this.recomputeDocumentRecordPdfPath(pdfPath);
    return normalized;
  }

  removeDocumentRecordEntryByPath(recordPath) {
    const path=metadataRecordNormalizeVaultPath(recordPath);
    this.state.documentRecords.invalidRecordPaths.delete(path);
    this.state.documentRecords.invalidRecordErrors.delete(path);
    const entry=this.state.documentRecords.entryByRecordPath.get(path);
    if(!entry) return null;
    this.state.documentRecords.entryByRecordPath.delete(path);
    const idPaths=this.state.documentRecords.recordPathsById.get(entry.id);
    if(idPaths) {
      idPaths.delete(path);
      if(idPaths.size===0) this.state.documentRecords.recordPathsById.delete(entry.id);
    }
    if(entry.status===METADATA_RECORD_STATUS_ACTIVE) {
      const pathIds=this.state.documentRecords.idsByPdfPath.get(entry.pdfPath);
      if(pathIds) {
        pathIds.delete(entry.id);
        if(pathIds.size===0) this.state.documentRecords.idsByPdfPath.delete(entry.pdfPath);
      }
    }
    this.recomputeDocumentRecordId(entry.id);
    this.recomputeDocumentRecordPdfPath(entry.pdfPath);
    return entry;
  }

  replaceDocumentRecordEntry(readBack) {
    const recordPath=metadataRecordNormalizeVaultPath(readBack?.recordPath || readBack?.file?.path);
    if(!readBack?.ok || !readBack.record || !recordPath) throw new Error(readBack?.error || 'metadata record read-back mangler');
    this.removeDocumentRecordEntryByPath(recordPath);
    return this.addDocumentRecordEntry({
      id:readBack.record.id,
      pdfPath:readBack.record.pdfPath,
      status:readBack.record.status,
      values:readBack.record.values,
      recordPath,
      file:readBack.file
    });
  }

  async parseDocumentRecordFile(file,schema,preferDisk = false) {
    const recordPath=metadataRecordNormalizeVaultPath(file?.path);
    if(!metadataRecordIsPath(recordPath) || String(file?.extension || '').toLowerCase()!=='md') return {ok:false,ignored:true,error:'ikke metadata-record'};
    const cached=preferDisk ? null : (this.obsidianMetadataCacheAdapter?.getFrontmatter?.(file) || null);
    if(cached) {
      const parsed=metadataRecordFromFrontmatter(cached,schema);
      if(parsed.ok) return {...parsed,file,recordPath};
    }
    return await this.getDocumentRecordRepository().readRecordFile(file,schema);
  }


  cancelDocumentRecordIndexWarmup() {
    const handle=this.state.documentRecords.warmupIdleHandle;
    if(!handle) return false;
    try { this.obsidianWorkspaceLifecycleAdapter?.cancelIdle?.(handle); } catch(_) {}
    this.state.documentRecords.warmupIdleHandle=null;
    return true;
  }

  markDocumentRecordLayoutReady() {
    if(!this.state.documentRecords.warmupLayoutReady) {
      this.state.documentRecords.warmupLayoutReady=true;
      this.state.documentRecords.warmupGateOrder=this.state.documentRecords.warmupGateOrder
        ? `${this.state.documentRecords.warmupGateOrder}>layout-ready`
        : 'layout-ready';
    }
    return this.scheduleDocumentRecordIndexWarmup();
  }

  markDocumentRecordMetadataResolved() {
    if(!this.state.documentRecords.warmupMetadataResolved) {
      this.state.documentRecords.warmupMetadataResolved=true;
      this.state.documentRecords.warmupGateOrder=this.state.documentRecords.warmupGateOrder
        ? `${this.state.documentRecords.warmupGateOrder}>metadata-resolved`
        : 'metadata-resolved';
    }
    return this.scheduleDocumentRecordIndexWarmup();
  }

  scheduleDocumentRecordIndexWarmup() {
    if(!this.state.documentRecords.warmupLayoutReady || !this.state.documentRecords.warmupMetadataResolved) return false;
    if(this.state.documentRecords.initialized || this.state.documentRecords.readyPromise || this.state.documentRecords.warmupIdleHandle) return false;
    const scheduler=this.obsidianWorkspaceLifecycleAdapter;
    if(!scheduler || typeof scheduler.scheduleIdle!=='function') {
      void this.ensureDocumentRecordIndexReady('cold-start-demand').catch(error=>console.warn(`[PDFium Gate ${PLUGIN_VERSION}] metadata record index warmup failed`,error));
      return false;
    }
    this.state.documentRecords.warmupScheduledAtMs=documentRecordBenchmarkNowMs();
    this.state.documentRecords.warmupScheduleMode='idle-after-layout-ready+metadata-resolved';
    this.state.documentRecords.warmupIdleHandle=scheduler.scheduleIdle(()=>{
      this.state.documentRecords.warmupIdleHandle=null;
      void this.ensureDocumentRecordIndexReady('cold-start-idle').catch(error=>console.warn(`[PDFium Gate ${PLUGIN_VERSION}] metadata record idle warmup failed`,error));
    });
    return true;
  }

  async rebuildDocumentRecordIndex(reason='normal') {
    const startedAt=documentRecordBenchmarkNowMs();
    const memoryBefore=documentRecordBenchmarkMemorySnapshot();
    const schema=this.ports.getMetadataSchemaSnapshot();
    if(!schema) throw new Error('metadata schema er ikke tilgjengelig for record-index');
    this.clearDocumentRecordIndex();
    const listedAt=documentRecordBenchmarkNowMs();
    const markdownFiles=this.obsidianVaultReadAdapter.listMarkdownFiles();
    const listedDoneAt=documentRecordBenchmarkNowMs();
    const files=markdownFiles.filter(file=>metadataRecordIsPath(file?.path));
    const filteredAt=documentRecordBenchmarkNowMs();

    const cacheStartedAt=documentRecordBenchmarkNowMs();
    let cacheState={ok:true,usable:false,reason:'unavailable',entries:new Map()};
    try { cacheState=await this.getDocumentRecordIndexCache().load(schema); }
    catch(error) {
      cacheState={ok:true,usable:false,reason:'load-error',entries:new Map(),error:error instanceof Error?error.message:String(error)};
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Metadata index-cache ignoreres; Markdown brukes som sannhet.`,error);
    }
    const cacheLoadedAt=documentRecordBenchmarkNowMs();

    let invalidCount=0;
    let cacheHits=0;
    let cacheMisses=0;
    let diskReadParseMs=0;
    let indexPopulateMs=0;
    const cacheWriteItems=[];

    for(const file of files) {
      let parsed=null;
      try {
        parsed=this.getDocumentRecordIndexCache().get(cacheState,file);
        if(parsed) cacheHits++;
        else {
          cacheMisses++;
          const readStarted=documentRecordBenchmarkNowMs();
          parsed=await this.parseDocumentRecordFile(file,schema,true);
          diskReadParseMs+=documentRecordBenchmarkNowMs()-readStarted;
        }
        if(!parsed?.ok) {
          invalidCount++;
          const invalidPath=metadataRecordNormalizeVaultPath(file?.path);
          this.state.documentRecords.invalidRecordPaths.add(invalidPath);
          this.state.documentRecords.invalidRecordErrors.set(invalidPath,String(parsed?.error || 'metadata record kunne ikke valideres'));
          continue;
        }
        cacheWriteItems.push({file,parsed});
        const indexStarted=documentRecordBenchmarkNowMs();
        this.addDocumentRecordEntry({
          id:parsed.record.id,
          pdfPath:parsed.record.pdfPath,
          status:parsed.record.status,
          values:parsed.record.values,
          recordPath:parsed.recordPath,
          file
        });
        indexPopulateMs+=documentRecordBenchmarkNowMs()-indexStarted;
      } catch(error) {
        invalidCount++;
        const invalidPath=metadataRecordNormalizeVaultPath(file?.path);
        const invalidError=error instanceof Error ? error.message : String(error);
        this.state.documentRecords.invalidRecordPaths.add(invalidPath);
        this.state.documentRecords.invalidRecordErrors.set(invalidPath,invalidError || 'metadata record kunne ikke indekseres');
        console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Ignorerer ugyldig metadata-record ${file?.path || ''}`,error);
      }
    }

    let cacheWriteMs=0;
    let cacheWriteError=null;
    const shouldRefreshCache=!cacheState.usable || cacheMisses>0 || Number(cacheState.entries?.size||0)!==cacheWriteItems.length;
    if(shouldRefreshCache) {
      const writeStarted=documentRecordBenchmarkNowMs();
      try { await this.getDocumentRecordIndexCache().write(schema,cacheWriteItems); }
      catch(error) {
        cacheWriteError=error instanceof Error?error.message:String(error);
        console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Metadata index-cache kunne ikke oppdateres; Markdown-indexen er fortsatt gyldig.`,error);
      }
      cacheWriteMs=documentRecordBenchmarkNowMs()-writeStarted;
    }

    this.state.documentRecords.lastError=invalidCount ? `${invalidCount} metadata-record(s) kunne ikke indekseres` : null;
    this.state.documentRecords.initialized=true;
    const finishedAt=documentRecordBenchmarkNowMs();
    const isStartupBuild=String(reason||'').startsWith('cold-start');
    const startupDeferralMs=isStartupBuild && Number.isFinite(this.state.documentRecords.warmupScheduledAtMs)
      ? Math.max(0,startedAt-this.state.documentRecords.warmupScheduledAtMs)
      : null;
    this.state.documentRecords.lastBuildMetrics={
      reason:String(reason||'normal'),
      startupScheduleMode:isStartupBuild ? String(this.state.documentRecords.warmupScheduleMode||'on-demand') : null,
      startupGateOrder:isStartupBuild ? String(this.state.documentRecords.warmupGateOrder||'') : null,
      startupDeferralMs:startupDeferralMs===null ? null : Number(startupDeferralMs.toFixed(3)),
      durationMs:Number((finishedAt-startedAt).toFixed(3)),
      listMarkdownMs:Number((listedDoneAt-listedAt).toFixed(3)),
      filterCandidatesMs:Number((filteredAt-listedDoneAt).toFixed(3)),
      cacheLoadMs:Number((cacheLoadedAt-cacheStartedAt).toFixed(3)),
      cacheReason:String(cacheState.reason||''),
      cacheUsable:cacheState.usable===true,
      cacheEntriesLoaded:Number(cacheState.entries?.size||0),
      cacheHits,
      cacheMisses,
      diskReadParseMs:Number(diskReadParseMs.toFixed(3)),
      indexPopulateMs:Number(indexPopulateMs.toFixed(3)),
      cacheWriteMs:Number(cacheWriteMs.toFixed(3)),
      cacheWriteError,
      parseAndIndexMs:Number((finishedAt-filteredAt).toFixed(3)),
      markdownFileCount:markdownFiles.length,
      recordCandidateCount:files.length,
      recordCount:this.state.documentRecords.entryByRecordPath.size,
      activePathCount:this.state.documentRecords.byPdfPath.size,
      ambiguousPathCount:this.state.documentRecords.ambiguousPdfPaths.size,
      ambiguousIdCount:this.state.documentRecords.ambiguousIds.size,
      invalidCount,
      memoryBefore,
      memoryAfter:documentRecordBenchmarkMemorySnapshot()
    };
    return {
      ok:true,
      recordCount:this.state.documentRecords.entryByRecordPath.size,
      activePathCount:this.state.documentRecords.byPdfPath.size,
      ambiguousPathCount:this.state.documentRecords.ambiguousPdfPaths.size,
      invalidCount,
      metrics:metadataRecordClone(this.state.documentRecords.lastBuildMetrics)
    };
  }

  ensureDocumentRecordIndexReady(reason='cold-start-demand') {
    if(this.state.documentRecords.initialized) return Promise.resolve({ok:true,alreadyReady:true});
    if(this.state.documentRecords.readyPromise) return this.state.documentRecords.readyPromise;
    if(this.state.documentRecords.warmupIdleHandle && reason!=='cold-start-idle') {
      this.cancelDocumentRecordIndexWarmup();
      this.state.documentRecords.warmupScheduleMode='on-demand-before-idle';
    } else if(reason!=='cold-start-idle' && (!this.state.documentRecords.warmupLayoutReady || !this.state.documentRecords.warmupMetadataResolved)) {
      this.state.documentRecords.warmupScheduleMode='on-demand-before-startup-gate';
    }
    const readyPromise=this.runDocumentRecordOperation(async()=>{
      if(this.state.documentRecords.initialized) return {ok:true,alreadyReady:true};
      try {
        return await this.rebuildDocumentRecordIndex(reason);
      } catch(error) {
        this.state.documentRecords.lastError=error instanceof Error?error.message:String(error);
        throw error;
      }
    });
    this.state.documentRecords.readyPromise=readyPromise;
    void readyPromise.catch(()=>{ if(this.state.documentRecords.readyPromise===readyPromise) this.state.documentRecords.readyPromise=null; });
    return readyPromise;
  }

  setDocumentRecordBenchmarkEventSuppression(enabled) {
    this.state.documentRecords.benchmarkEventSuppression=enabled===true;
    return this.state.documentRecords.benchmarkEventSuppression;
  }

  async runDocumentRecordIndexBenchmark() {
    return await this.runDocumentRecordOperation(async()=>{
      const previousBuild=metadataRecordClone(this.state.documentRecords.lastBuildMetrics || null);
      const memoryBefore=documentRecordBenchmarkMemorySnapshot();
      this.state.documentRecords.initialized=false;
      const rebuild=await this.rebuildDocumentRecordIndex('benchmark-forced');
      const paths=[...this.state.documentRecords.byPdfPath.keys()];
      const rawIterations=paths.length ? Math.min(100000,Math.max(10000,paths.length*2)) : 0;
      let checksum=0;
      let started=documentRecordBenchmarkNowMs();
      for(let i=0;i<rawIterations;i++) {
        const id=this.state.documentRecords.byPdfPath.get(paths[i%paths.length]);
        if(id) checksum+=id.charCodeAt(0)||0;
      }
      const rawDurationMs=documentRecordBenchmarkNowMs()-started;
      const stateIterations=paths.length ? Math.min(20000,Math.max(2000,paths.length)) : 0;
      started=documentRecordBenchmarkNowMs();
      for(let i=0;i<stateIterations;i++) {
        const state=this.getDocumentMetadataRecordState(paths[i%paths.length]);
        if(state?.registered) checksum+=String(state.id||'').length;
      }
      const stateDurationMs=documentRecordBenchmarkNowMs()-started;
      let benchmarkRecordsIndexed=0;
      for(const entry of this.state.documentRecords.byId.values()) if(metadataBenchmarkIsPdfPath(entry?.pdfPath)) benchmarkRecordsIndexed++;
      return {
        ok:true,
        previousBuild,
        forcedBuild:metadataRecordClone(this.state.documentRecords.lastBuildMetrics || rebuild?.metrics || null),
        lookup:{
          rawIterations,
          rawDurationMs:Number(rawDurationMs.toFixed(3)),
          rawAverageUs:rawIterations?Number(((rawDurationMs*1000)/rawIterations).toFixed(6)):0,
          stateIterations,
          stateDurationMs:Number(stateDurationMs.toFixed(3)),
          stateAverageUs:stateIterations?Number(((stateDurationMs*1000)/stateIterations).toFixed(6)):0,
          checksum
        },
        index:{
          recordCount:this.state.documentRecords.entryByRecordPath.size,
          activePathCount:this.state.documentRecords.byPdfPath.size,
          ambiguousPathCount:this.state.documentRecords.ambiguousPdfPaths.size,
          ambiguousIdCount:this.state.documentRecords.ambiguousIds.size
        },
        benchmarkRecordsIndexed,
        memory:{before:memoryBefore,after:documentRecordBenchmarkMemorySnapshot()}
      };
    });
  }

  getDocumentMetadataRecordState(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path) return {ready:this.state.documentRecords.initialized,ok:false,registered:false,reason:'missing-pdf-path'};
    if(!this.state.documentRecords.initialized) return {ready:false,ok:true,registered:false};
    if(this.state.documentRecords.ambiguousPdfPaths.has(path)) return {ready:true,ok:false,registered:false,reason:'ambiguous-pdf-path',error:'Flere metadata-records peker til samme PDF-sti. Ingen record velges automatisk.'};
    const id=this.state.documentRecords.byPdfPath.get(path);
    if(!id) return {ready:true,ok:true,registered:false,values:{}};
    if(this.state.documentRecords.ambiguousIds.has(id)) return {ready:true,ok:false,registered:false,reason:'ambiguous-record-id',error:'Metadata-record-ID er duplisert. Ingen record velges automatisk.'};
    const entry=this.state.documentRecords.byId.get(id);
    if(!entry) return {ready:true,ok:false,registered:false,reason:'index-inconsistent',error:'Metadata-index er inkonsistent.'};
    return {
      ready:true,
      ok:true,
      registered:true,
      id:entry.id,
      recordPath:entry.recordPath,
      status:entry.status,
      pdfPath:entry.pdfPath,
      values:metadataRecordClone(entry.values || {})
    };
  }

  async saveDocumentMetadataRecordValues(pdfPath,updates) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:false,error:'PDF-filsti mangler eller er ugyldig'};
    await this.ensureDocumentRecordIndexReady();
    return await this.runDocumentRecordOperation(async()=>{
      const state=this.getDocumentMetadataRecordState(path);
      if(!state.ok) return {ok:false,error:state.error || state.reason || 'metadata-record kan ikke identifiseres sikkert'};
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) return {ok:false,error:'Metadata-skjema er ikke tilgjengelig'};
      const repository=this.getDocumentRecordRepository();
      const patch=updates && typeof updates==='object' && !Array.isArray(updates) ? updates : {};
      let readBack;
      if(state.registered) {
        const entry=this.state.documentRecords.byId.get(state.id);
        if(!entry?.file) return {ok:false,error:'Metadata-record-filen kunne ikke identifiseres'};
        const values=metadataRecordClone(entry.values || {});
        for(const [property,value] of Object.entries(patch)) values[property]=metadataRecordClone(value);
        readBack=await repository.updateRecord(entry.file,{
          id:entry.id,
          pdfPath:path,
          status:METADATA_RECORD_STATUS_ACTIVE,
          values
        },schema);
      } else {
        const values={};
        for(const [property,value] of Object.entries(patch)) values[property]=metadataRecordClone(value);
        const created=await this.createDocumentMetadataRecord(path,values,schema,repository);
        if(!created.ok) return created;
        readBack=created.readBack;
      }
      const entry=this.replaceDocumentRecordEntry(readBack);
      this.state.documentRecords.lastError=null;
      return {ok:true,id:entry.id,recordPath:entry.recordPath,values:metadataRecordClone(entry.values)};
    }).catch(error=>{
      this.state.documentRecords.lastError=error instanceof Error?error.message:String(error);
      return {ok:false,error:this.state.documentRecords.lastError};
    });
  }

  async deleteDuplicateDocumentMetadataRecord(recordPath,expectedId,expectedPdfPath) {
    const path=metadataRecordNormalizeVaultPath(recordPath);
    const id=String(expectedId || '').trim().toLowerCase();
    const pdfPath=metadataRecordNormalizeVaultPath(expectedPdfPath);
    if(!metadataRecordIsPath(path) || !metadataRecordIsUuidV4(id) || !pdfPath || !/\.pdf$/i.test(pdfPath)) {
      return {ok:false,error:'Duplicate metadata record identity is missing or invalid'};
    }
    await this.ensureDocumentRecordIndexReady('duplicate-record-delete');
    return await this.runDocumentRecordOperation(async()=>{
      const entry=this.state.documentRecords.entryByRecordPath.get(path) || null;
      if(!entry) return {ok:false,error:'Metadata record is no longer indexed'};
      if(String(entry.id || '').toLowerCase()!==id || metadataRecordNormalizeVaultPath(entry.pdfPath)!==pdfPath) {
        return {ok:false,error:'Metadata record changed after the comparison was shown'};
      }
      const ids=this.state.documentRecords.idsByPdfPath.get(pdfPath);
      if(!this.state.documentRecords.ambiguousPdfPaths.has(pdfPath) || !(ids instanceof Set) || ids.size<2 || !ids.has(id)) {
        return {ok:false,error:'The PDF no longer has this duplicate-record conflict'};
      }

      const file=this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(path) || null;
      if(!file || String(file.extension || '').toLowerCase()!=='md') {
        return {ok:false,error:'Metadata record file could not be resolved'};
      }
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) return {ok:false,error:'Metadata schema is unavailable'};
      const parsed=await this.parseDocumentRecordFile(file,schema,true);
      if(!parsed?.ok || String(parsed.record?.id || '').toLowerCase()!==id) {
        return {ok:false,error:'Metadata record changed and must be reviewed again before deletion'};
      }
      const currentPdfPath=this.resolveDocumentRecordPdfPath(parsed.record.pdfPath,path);
      if(currentPdfPath!==pdfPath) {
        return {ok:false,error:'Metadata record PDF target changed and must be reviewed again before deletion'};
      }

      if(typeof this.obsidianVaultWriteAdapter?.trashFile!=='function') {
        return {ok:false,error:'Metadata record trash operation is unavailable'};
      }
      await this.obsidianVaultWriteAdapter.trashFile(file);
      this.removeDocumentRecordEntryByPath(path);
      this.state.documentRecords.lastError=null;
      const remainingIds=this.state.documentRecords.idsByPdfPath.get(pdfPath);
      return {
        ok:true,
        deleted:true,
        id,
        recordPath:path,
        pdfPath,
        remainingRecordCount:Number(remainingIds?.size || 0)
      };
    }).catch(error=>{
      const message=error instanceof Error ? error.message : String(error);
      this.state.documentRecords.lastError=message;
      return {ok:false,error:message};
    });
  }

  async deleteDocumentMetadataRecordForPdf(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:false,error:'PDF path is missing or invalid'};
    await this.ensureDocumentRecordIndexReady();
    return await this.runDocumentRecordOperation(async()=>{
      const state=this.getDocumentMetadataRecordState(path);
      if(!state?.ok) return {ok:false,error:state?.error || state?.reason || 'Document metadata state is unsafe'};
      if(!state.registered) return {ok:true,deleted:false,reason:'not-registered'};
      const entry=this.state.documentRecords.byId.get(state.id);
      if(!entry?.file) return {ok:false,error:'Metadata record file could not be resolved'};
      const recordPath=metadataRecordNormalizeVaultPath(entry.recordPath);
      await this.obsidianVaultWriteAdapter.deleteFile(entry.file,true);
      this.removeDocumentRecordEntryByPath(recordPath);
      this.state.documentRecords.lastError=null;
      return {ok:true,deleted:true,id:state.id,recordPath};
    }).catch(error=>{
      const message=error instanceof Error?error.message:String(error);
      this.state.documentRecords.lastError=message;
      return {ok:false,error:message};
    });
  }

  async createDocumentMetadataRecord(pdfPath,values={},schema=null,repository=null) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:false,error:'PDF-filsti mangler eller er ugyldig'};
    const effectiveSchema=schema || this.ports.getMetadataSchemaSnapshot();
    if(!effectiveSchema) return {ok:false,error:'Metadata-skjema er ikke tilgjengelig'};
    const effectiveRepository=repository || this.getDocumentRecordRepository();
    const id=metadataUuidV4();
    const normalizedValues=metadataRecordClone(values && typeof values==='object' && !Array.isArray(values) ? values : {});
    const readBack=await effectiveRepository.createRecord({
      id,
      pdfPath:path,
      status:METADATA_RECORD_STATUS_ACTIVE,
      values:normalizedValues
    },effectiveSchema);
    if(!readBack?.ok) return {ok:false,error:readBack?.error || 'Metadata-record kunne ikke opprettes'};
    return {ok:true,id,readBack};
  }

  isDocumentRegistrationPdfPath(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return false;
    const segments=path.split('/').map(part=>String(part||'').toLowerCase());
    if(segments.includes('.pdfium-backup')) return false;
    if(metadataBenchmarkIsPdfPath(path)) return false;
    return true;
  }

  listDocumentRegistrationPdfFiles() {
    const files=this.obsidianVaultReadAdapter?.listFiles?.();
    if(!Array.isArray(files)) throw new Error('Vault-filene kunne ikke listes');
    return files
      .filter(file=>this.isDocumentRegistrationPdfPath(file?.path))
      .slice()
      .sort((a,b)=>metadataRecordNormalizeVaultPath(a?.path).localeCompare(metadataRecordNormalizeVaultPath(b?.path),undefined,{numeric:true,sensitivity:'base'}));
  }

  pruneMissingInvalidDocumentRecordPaths() {
    const invalid=this.state.documentRecords.invalidRecordPaths;
    if(!(invalid instanceof Set) || invalid.size===0) {
      return {ok:true,checkedCount:0,removedCount:0,removedPaths:[],uncertainPaths:[]};
    }
    const lookup=this.obsidianVaultReadAdapter?.getAbstractFileByPath;
    if(typeof lookup!=='function') {
      return {
        ok:false,
        checkedCount:0,
        removedCount:0,
        removedPaths:[],
        uncertainPaths:[...invalid],
        reason:'vault-lookup-unavailable'
      };
    }

    const removedPaths=[];
    const uncertainPaths=[];
    let checkedCount=0;
    for(const rawPath of [...invalid]) {
      const path=metadataRecordNormalizeVaultPath(rawPath);
      if(!path) {
        invalid.delete(rawPath);
        removedPaths.push(path || String(rawPath || ''));
        continue;
      }
      try {
        checkedCount++;
        const file=lookup.call(this.obsidianVaultReadAdapter,path);
        const existsAsMarkdown=!!file && String(file.extension || '').toLowerCase()==='md';
        if(!existsAsMarkdown) {
          invalid.delete(rawPath);
          invalid.delete(path);
          this.state.documentRecords.invalidRecordErrors.delete(rawPath);
          this.state.documentRecords.invalidRecordErrors.delete(path);
          removedPaths.push(path);
        }
      } catch(error) {
        uncertainPaths.push(path);
      }
    }
    return {
      ok:uncertainPaths.length===0,
      checkedCount,
      removedCount:removedPaths.length,
      removedPaths:removedPaths.sort((a,b)=>a.localeCompare(b)),
      uncertainPaths:uncertainPaths.sort((a,b)=>a.localeCompare(b))
    };
  }

  async getDocumentRegisterStatusSummary() {
    await this.ensureDocumentRecordIndexReady('document-register-status');
    const invalidPrune=this.pruneMissingInvalidDocumentRecordPaths();
    const summary=documentRecordRegisterStatusSnapshot(
      this.state.documentRecords,
      this.listDocumentRegistrationPdfFiles(),
      path=>this.getDocumentMetadataRecordState(path)
    );
    return {
      ...summary,
      staleInvalidRemovedCount:Number(invalidPrune?.removedCount || 0),
      staleInvalidRemovedPaths:Array.isArray(invalidPrune?.removedPaths) ? invalidPrune.removedPaths : [],
      invalidPruneUncertainCount:Array.isArray(invalidPrune?.uncertainPaths) ? invalidPrune.uncertainPaths.length : 0
    };
  }

  async getExistingPdfRegistrationSummary() {
    await this.ensureDocumentRecordIndexReady('existing-pdf-scan');
    return await this.runDocumentRecordOperation(async()=>{
      const files=this.listDocumentRegistrationPdfFiles();
      let registeredCount=0;
      let unregisteredCount=0;
      const problemPaths=[];
      for(const file of files) {
        const path=metadataRecordNormalizeVaultPath(file?.path);
        const state=this.getDocumentMetadataRecordState(path);
        if(!state.ok) {
          problemPaths.push(path);
          continue;
        }
        if(state.registered) registeredCount++;
        else unregisteredCount++;
      }
      return {
        ok:true,
        totalPdfCount:files.length,
        registeredCount,
        unregisteredCount,
        problemCount:problemPaths.length,
        problemPaths
      };
    }).catch(error=>({
      ok:false,
      error:error instanceof Error?error.message:String(error)
    }));
  }

  async registerExistingPdfRecords() {
    await this.ensureDocumentRecordIndexReady('existing-pdf-register');
    return await this.runDocumentRecordOperation(async()=>{
      const files=this.listDocumentRegistrationPdfFiles();
      let createdCount=0;
      let alreadyRegisteredCount=0;
      const problemPaths=[];
      for(const file of files) {
        const path=metadataRecordNormalizeVaultPath(file?.path);
        const state=this.getDocumentMetadataRecordState(path);
        if(!state.ok) {
          problemPaths.push(path);
          continue;
        }
        if(state.registered) {
          alreadyRegisteredCount++;
          continue;
        }
        try {
          const created=await this.createDocumentMetadataRecord(path,{});
          if(!created?.ok) {
            problemPaths.push(path);
            continue;
          }
          this.replaceDocumentRecordEntry(created.readBack);
          createdCount++;
        } catch(error) {
          problemPaths.push(path);
          console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Could not register existing PDF ${path}`,error);
        }
      }
      this.state.documentRecords.lastError=problemPaths.length
        ? `${problemPaths.length} existing PDF(s) could not be registered`
        : null;
      return {
        ok:true,
        totalPdfCount:files.length,
        createdCount,
        alreadyRegisteredCount,
        problemCount:problemPaths.length,
        problemPaths
      };
    }).catch(error=>({
      ok:false,
      error:error instanceof Error?error.message:String(error)
    }));
  }

  async ensureMinimalDocumentRecordForPdf(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:true,ignored:true,reason:'not-pdf'};
    await this.ensureDocumentRecordIndexReady();
    return await this.runDocumentRecordOperation(async()=>{
      const state=this.getDocumentMetadataRecordState(path);
      if(!state.ok) return {ok:false,error:state.error || state.reason || 'metadata-record kan ikke identifiseres sikkert'};
      if(state.registered) return {ok:true,created:false,id:state.id,recordPath:state.recordPath};
      const created=await this.createDocumentMetadataRecord(path,{});
      if(!created.ok) return created;
      const entry=this.replaceDocumentRecordEntry(created.readBack);
      this.state.documentRecords.lastError=null;
      return {ok:true,created:true,id:entry.id,recordPath:entry.recordPath,values:{}};
    }).catch(error=>{
      this.state.documentRecords.lastError=error instanceof Error?error.message:String(error);
      return {ok:false,error:this.state.documentRecords.lastError};
    });
  }

  async refreshDocumentRecordFile(file) {
    const path=metadataRecordNormalizeVaultPath(file?.path);
    if(!metadataRecordIsPath(path) || String(file?.extension || '').toLowerCase()!=='md') return {ok:true,ignored:true};
    const schema=this.ports.getMetadataSchemaSnapshot();
    if(!schema) return {ok:false,error:'metadata schema mangler'};
    const parsed=await this.parseDocumentRecordFile(file,schema,true);
    this.removeDocumentRecordEntryByPath(path);
    if(!parsed.ok) {
      const detail=String(parsed.error || 'ukjent feil');
      this.state.documentRecords.invalidRecordPaths.add(path);
      this.state.documentRecords.invalidRecordErrors.set(path,detail);
      this.state.documentRecords.lastError=`Ugyldig metadata-record ${path}: ${detail}`;
      return {ok:false,error:this.state.documentRecords.lastError};
    }
    this.state.documentRecords.invalidRecordPaths.delete(path);
    this.state.documentRecords.invalidRecordErrors.delete(path);
    this.addDocumentRecordEntry({id:parsed.record.id,pdfPath:parsed.record.pdfPath,status:parsed.record.status,values:parsed.record.values,recordPath:path,file});
    this.state.documentRecords.lastError=null;
    return {ok:true};
  }

  async updateDocumentRecordForPdfRename(oldPdfPath,newPdfPath) {
    const oldPath=metadataRecordNormalizeVaultPath(oldPdfPath);
    const newPath=metadataRecordNormalizeVaultPath(newPdfPath);
    if(!oldPath || !newPath || !/\.pdf$/i.test(oldPath) || !/\.pdf$/i.test(newPath)) return {ok:true,ignored:true};
    if(this.state.documentRecords.ambiguousPdfPaths.has(oldPath)) return {ok:false,error:'Gammel PDF-sti er tvetydig; rename håndteres fail closed'};
    const id=this.state.documentRecords.byPdfPath.get(oldPath);
    if(!id) return {ok:true,ignored:true};
    const entry=this.state.documentRecords.byId.get(id);
    if(!entry?.file) return {ok:false,error:'Metadata-record for rename mangler'};
    const conflicting=this.state.documentRecords.byPdfPath.get(newPath);
    const newAmbiguous=this.state.documentRecords.ambiguousPdfPaths.has(newPath);
    const schema=this.ports.getMetadataSchemaSnapshot();
    const repository=this.getDocumentRecordRepository();
    const record={id:entry.id,pdfPath:entry.pdfPath,status:entry.status,values:metadataRecordClone(entry.values || {})};
    if((conflicting && conflicting!==id) || newAmbiguous) {
      record.status=METADATA_RECORD_STATUS_MISSING;
    } else {
      record.pdfPath=newPath;
      record.status=METADATA_RECORD_STATUS_ACTIVE;
    }
    const readBack=await repository.updateRecord(entry.file,record,schema);
    this.replaceDocumentRecordEntry(readBack);
    return {ok:true,id,status:record.status,pdfPath:record.pdfPath};
  }

  resolveDocumentRecordPdfPresence(pdfPath, recordPath='') {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    const sourcePath=metadataRecordNormalizeVaultPath(recordPath);
    if(!path) return {ok:false,present:false,reason:'missing-pdf-path'};

    let resolution=null;
    try {
      resolution=this.obsidianLinkResolutionAdapter?.resolveFirst?.(path,sourcePath) || null;
    } catch(error) {
      resolution={ok:false,file:null,reason:'resolution-threw',error:error instanceof Error?error.message:String(error)};
    }
    if(resolution?.ok && resolution.file) {
      const extension=String(resolution.file.extension || '').toLowerCase();
      if(extension!=='pdf') return {ok:false,present:false,reason:'resolved-non-pdf'};
      const resolvedPath=metadataRecordNormalizeVaultPath(resolution.file.path);
      try {
        const resolvedDirect=this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(resolvedPath) || null;
        if(resolvedDirect && String(resolvedDirect.extension || '').toLowerCase()==='pdf') {
          return {ok:true,present:true,path:metadataRecordNormalizeVaultPath(resolvedDirect.path),reason:'resolved-link-confirmed'};
        }
      } catch(error) {
        return {ok:false,present:false,reason:'resolved-direct-lookup-failed',error:error instanceof Error?error.message:String(error)};
      }
    }

    let direct=null;
    try {
      direct=this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(path) || null;
    } catch(error) {
      return {ok:false,present:false,reason:'direct-lookup-failed',error:error instanceof Error?error.message:String(error)};
    }
    if(direct) {
      const extension=String(direct.extension || '').toLowerCase();
      if(extension==='pdf') return {ok:true,present:true,path:metadataRecordNormalizeVaultPath(direct.path),reason:'direct-path'};
      return {ok:false,present:false,reason:'direct-non-pdf'};
    }

    if(resolution && resolution.ok===false && resolution.reason!=='not-found') {
      return {ok:false,present:false,reason:resolution.reason || 'resolution-unavailable',error:resolution.error || null};
    }
    return {ok:true,present:false,path,reason:'not-found'};
  }

  async reconcileMissingDocumentRecords() {
    await this.ensureDocumentRecordIndexReady('cold-start-idle');
    return await this.runDocumentRecordOperation(async()=>{
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) return {ok:false,error:'Metadata schema is unavailable'};
      const repository=this.getDocumentRecordRepository();
      let changedCount=0;
      let presentCount=0;
      let skippedCount=0;
      const problemPaths=[];

      const candidates=[...this.state.documentRecords.byId.values()]
        .filter(entry=>entry?.status===METADATA_RECORD_STATUS_ACTIVE)
        .slice();

      for(const entry of candidates) {
        if(!entry?.file || !entry.id || !entry.pdfPath) {
          skippedCount++;
          continue;
        }
        if(metadataBenchmarkIsPdfPath(entry.pdfPath)) {
          skippedCount++;
          continue;
        }
        if(this.state.documentRecords.ambiguousIds.has(entry.id) || this.state.documentRecords.ambiguousPdfPaths.has(entry.pdfPath)) {
          problemPaths.push(entry.pdfPath);
          continue;
        }

        const presence=this.resolveDocumentRecordPdfPresence(entry.pdfPath,entry.recordPath);
        if(!presence.ok) {
          problemPaths.push(entry.pdfPath);
          continue;
        }
        if(presence.present) {
          presentCount++;
          continue;
        }

        try {
          const readBack=await repository.updateRecord(entry.file,{
            id:entry.id,
            pdfPath:entry.pdfPath,
            status:METADATA_RECORD_STATUS_MISSING,
            values:metadataRecordClone(entry.values || {})
          },schema);
          this.replaceDocumentRecordEntry(readBack);
          changedCount++;
        } catch(error) {
          problemPaths.push(entry.pdfPath);
          console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Could not mark offline-missing PDF ${entry.pdfPath}`,error);
        }
      }

      const missingSummary=this.getMissingDocumentRecordSummary();
      this.state.documentRecords.lastError=problemPaths.length
        ? `${problemPaths.length} document record(s) could not be reconciled`
        : null;
      return {
        ok:true,
        changedCount,
        presentCount,
        skippedCount,
        problemCount:problemPaths.length,
        problemPaths,
        totalMissingCount:missingSummary.count
      };
    }).catch(error=>({
      ok:false,
      error:error instanceof Error?error.message:String(error)
    }));
  }

  getMissingDocumentRecordSummary() {
    const items=[];
    for(const entry of this.state.documentRecords.byId.values()) {
      if(entry?.status!==METADATA_RECORD_STATUS_MISSING) continue;
      if(this.state.documentRecords.ambiguousIds.has(entry.id)) continue;
      items.push({
        id:String(entry.id || ''),
        recordPath:metadataRecordNormalizeVaultPath(entry.recordPath),
        pdfPath:metadataRecordNormalizeVaultPath(entry.pdfPath)
      });
    }
    items.sort((a,b)=>String(a.pdfPath).localeCompare(String(b.pdfPath)));
    return {count:items.length,items};
  }

  async deleteMissingDocumentRecords() {
    await this.ensureDocumentRecordIndexReady('missing-record-delete');
    return await this.runDocumentRecordOperation(async()=>{
      const summary=this.getMissingDocumentRecordSummary();
      let deletedCount=0;
      for(const item of summary.items) {
        if(this.state.documentRecords.ambiguousIds.has(item.id)) {
          return {ok:false,error:'Tvetydig metadata-record-ID; sletting avbrytes fail closed',deletedCount};
        }
        const entry=this.state.documentRecords.byId.get(item.id);
        if(!entry || entry.status!==METADATA_RECORD_STATUS_MISSING) continue;
        if(!entry.file) return {ok:false,error:'Metadata-record-filen kunne ikke identifiseres',deletedCount};
        await this.obsidianVaultWriteAdapter.deleteFile(entry.file,false);
        this.removeDocumentRecordEntryByPath(entry.recordPath);
        deletedCount++;
      }
      return {
        ok:true,
        deletedCount,
        remainingCount:this.getMissingDocumentRecordSummary().count
      };
    }).catch(error=>({
      ok:false,
      error:error instanceof Error?error.message:String(error)
    }));
  }

  async markDocumentRecordMissingForPdfDelete(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:true,ignored:true};
    if(this.state.documentRecords.ambiguousPdfPaths.has(path)) return {ok:false,error:'PDF-sti er tvetydig; delete håndteres fail closed'};
    const id=this.state.documentRecords.byPdfPath.get(path);
    if(!id) return {ok:true,ignored:true};
    const entry=this.state.documentRecords.byId.get(id);
    if(!entry?.file) return {ok:false,error:'Metadata-record for forsvunnet PDF mangler'};
    const schema=this.ports.getMetadataSchemaSnapshot();
    const readBack=await this.getDocumentRecordRepository().updateRecord(entry.file,{
      id:entry.id,
      pdfPath:entry.pdfPath,
      status:METADATA_RECORD_STATUS_MISSING,
      values:metadataRecordClone(entry.values || {})
    },schema);
    this.replaceDocumentRecordEntry(readBack);
    return {ok:true,id,status:METADATA_RECORD_STATUS_MISSING};
  }

  handleDocumentRecordVaultCreate(file) {
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(file?.path) || metadataBenchmarkIsPdfPath(file?.path))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    const extension=String(file?.extension || '').toLowerCase();
    if(extension==='pdf') {
      if(!this.isDocumentRegistrationPdfPath(file?.path)) return Promise.resolve({ok:true,ignored:true,reason:'technical-pdf'});
      if(this.settings?.autoRegisterNewPdfs === false) return Promise.resolve({ok:true,ignored:true,reason:'auto-registration-disabled'});
      return this.ensureMinimalDocumentRecordForPdf(file?.path);
    }
    if(!metadataRecordIsPath(file?.path) || extension!=='md') return;
    return this.ensureDocumentRecordIndexReady().then(()=>this.runDocumentRecordOperation(()=>this.refreshDocumentRecordFile(file))).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

  handleDocumentRecordVaultModify(file) {
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(file?.path) || metadataBenchmarkIsPdfPath(file?.path))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    if(!metadataRecordIsPath(file?.path) || String(file?.extension || '').toLowerCase()!=='md') return;
    return this.ensureDocumentRecordIndexReady().then(()=>this.runDocumentRecordOperation(()=>this.refreshDocumentRecordFile(file))).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

  handleDocumentRecordVaultRename(file,oldPath) {
    const before=metadataRecordNormalizeVaultPath(oldPath);
    const after=metadataRecordNormalizeVaultPath(file?.path);
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(before) || metadataBenchmarkIsRecordPath(after) || metadataBenchmarkIsPdfPath(before) || metadataBenchmarkIsPdfPath(after))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    const tasks=[];
    if(/\.pdf$/i.test(before) && /\.pdf$/i.test(after)) tasks.push(()=>this.updateDocumentRecordForPdfRename(before,after));
    if(metadataRecordIsPath(before) || metadataRecordIsPath(after)) tasks.push(async()=>{
      if(metadataRecordIsPath(before)) this.removeDocumentRecordEntryByPath(before);
      if(metadataRecordIsPath(after) && String(file?.extension || '').toLowerCase()==='md') await this.refreshDocumentRecordFile(file);
      return {ok:true};
    });
    if(tasks.length===0) return Promise.resolve({ok:true,ignored:true});
    return this.ensureDocumentRecordIndexReady().then(async()=>{
      let result={ok:true};
      for(const task of tasks) result=await this.runDocumentRecordOperation(task);
      return result;
    }).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

  handleDocumentRecordVaultDelete(file) {
    const path=metadataRecordNormalizeVaultPath(file?.path);
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(path) || metadataBenchmarkIsPdfPath(path))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    const tasks=[];
    if(/\.pdf$/i.test(path)) tasks.push(()=>this.markDocumentRecordMissingForPdfDelete(path));
    if(metadataRecordIsPath(path) && String(file?.extension || '').toLowerCase()==='md') tasks.push(()=>{
      this.removeDocumentRecordEntryByPath(path);
      return {ok:true};
    });
    if(tasks.length===0) return Promise.resolve({ok:true,ignored:true});
    return this.ensureDocumentRecordIndexReady().then(async()=>{
      let result={ok:true};
      for(const task of tasks) result=await this.runDocumentRecordOperation(task);
      return result;
    }).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

}

module.exports={DocumentRecordsFeature,documentRecordRegisterStatusSnapshot,documentRecordComparableValues};
