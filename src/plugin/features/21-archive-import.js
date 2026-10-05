'use strict';

class ArchiveImportFeature {
  normalizeArchiveImportVaultPath(value) {
    return String(value || '').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').trim();
  }

  isArchiveImportZipFile(file) {
    const vaultPath=this.normalizeArchiveImportVaultPath(file?.path);
    if(!vaultPath) return false;
    const lower=vaultPath.toLowerCase();
    if(lower === '.pdf-metadata' || lower.startsWith('.pdf-metadata/')) return false;
    if(lower === '.obsidian' || lower.startsWith('.obsidian/')) return false;
    const extension=String(file?.extension || '').toLowerCase();
    return extension === 'zip' || /\.zip$/i.test(vaultPath);
  }

  suppressArchiveImportPathOnce(value) {
    const vaultPath=this.normalizeArchiveImportVaultPath(value);
    if(vaultPath && /\.zip$/i.test(vaultPath)) this.state.archiveImport.suppressedPaths.add(vaultPath);
  }

  archiveImportSuggestedFolderPath(zipPath) {
    const normalized=this.normalizeArchiveImportVaultPath(zipPath);
    const slash=normalized.lastIndexOf('/');
    const folder=slash >= 0 ? normalized.slice(0,slash) : '';
    const filename=slash >= 0 ? normalized.slice(slash+1) : normalized;
    const stem=filename.replace(/\.zip$/i,'') || 'ZIP';
    for(let index=1;index<10000;index++) {
      const suffix=index===1 ? '' : ` (${index})`;
      const candidate=folder ? `${folder}/${stem}${suffix}` : `${stem}${suffix}`;
      if(!this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error('Could not allocate a unique ZIP extraction folder.');
  }

  async ensureArchiveImportFolderChain(vaultPath) {
    const normalized=this.normalizeArchiveImportVaultPath(vaultPath);
    if(!normalized) return;
    const parts=normalized.split('/').filter(Boolean);
    let current='';
    for(const part of parts) {
      current=current ? `${current}/${part}` : part;
      await this.obsidianVaultWriteAdapter.ensureFolder(current);
    }
  }

  async writeArchiveRelationshipsForPdf(pdfPath,sourceZipPath,memberPaths,createdFile=null) {
    const registration=createdFile
      ? await Promise.resolve(this.ports.handleDocumentRecordVaultCreate(createdFile))
      : null;
    if(registration?.ok===false) {
      return {ok:false,pdfPath,error:registration.error||registration.reason||'PDF registration failed'};
    }
    await this.ports.ensureDocumentRecordIndexReady('archive-relationship');
    const state=this.ports.getDocumentMetadataRecordState(pdfPath);
    if(!state?.ok) return {ok:false,pdfPath,error:state?.error||state?.reason||'PDF metadata state is unsafe'};
    if(!state?.registered || !state?.recordPath) {
      return {ok:true,pdfPath,linked:false,reason:registration?.reason||'pdf-not-registered'};
    }
    const recordPath=this.normalizeArchiveImportVaultPath(state.recordPath);
    const recordFile=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath);
    if(!recordFile || String(recordFile.extension||'').toLowerCase()!=='md') {
      return {ok:false,pdfPath,error:'PDF metadata record file is missing'};
    }
    const before=String(await this.obsidianVaultReadAdapter.readText(recordFile));
    const after=ARCHIVE_IMPORT_RUNTIME.upsertArchiveRelationshipBlock(before,{
      sourceZipPath,
      memberPaths,
      selfPath:pdfPath
    });
    if(after!==before) await this.obsidianVaultWriteAdapter.modifyText(recordFile,after);
    const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath)||recordFile;
    const verified=String(await this.obsidianVaultReadAdapter.readText(current));
    const relation=ARCHIVE_IMPORT_RUNTIME.extractArchiveRelationship(verified);
    const expectedMembers=ARCHIVE_IMPORT_RUNTIME.normalizeArchiveRelationshipPaths(memberPaths)
      .filter(path=>path!==pdfPath && path!==sourceZipPath);
    if(!relation || relation.sourceZipPath!==sourceZipPath || JSON.stringify(relation.memberPaths)!==JSON.stringify(expectedMembers)) {
      return {ok:false,pdfPath,error:'Archive relationship block failed read-back verification'};
    }
    return {ok:true,pdfPath,linked:true,recordPath,linkedCount:expectedMembers.length+1};
  }

  archiveImportDecisionModel(plans) {
    const archives=[];
    let unsupportedCount=0;
    for(const plan of Array.isArray(plans)?plans:[]) {
      const unsupported=(plan?.inspection?.unsupportedEntries || []).map(entry=>({
        path:entry.originalPath,
        size:entry.uncompressedSize
      }));
      unsupportedCount+=unsupported.length;
      archives.push({
        filename:String(plan?.file?.name || plan?.attachment?.filename || 'archive.zip'),
        totalCount:Number(plan?.inspection?.fileEntries?.length || 0),
        pdfCount:Number(plan?.inspection?.pdfEntries?.length || 0),
        nativeCount:Number(plan?.inspection?.nativeEntries?.length || 0),
        unsupportedCount:unsupported.length,
        blockedCount:Number(plan?.inspection?.blockedEntries?.length || 0),
        unsupported
      });
    }
    return {archives,unsupportedCount};
  }

  async prepareArchiveImportFile(file) {
    const zipPath=this.normalizeArchiveImportVaultPath(file?.path);
    if(!this.isArchiveImportZipFile(file)) return {ok:false,handled:false,reason:'not-zip',file,zipPath};
    const bytes=await this.obsidianVaultReadAdapter.readBinary(file);
    const attachment={
      id:`vault-zip:${zipPath}`,
      filename:file.name || zipPath.split('/').pop() || 'archive.zip',
      contentType:'application/zip',
      content:Buffer.from(bytes),
      size:Number(bytes?.byteLength ?? bytes?.length ?? 0)
    };
    const inspection=ARCHIVE_IMPORT_RUNTIME.inspectZipAttachment(attachment);
    if(inspection.blockedEntries.length) {
      return {
        ok:false,
        handled:true,
        reason:'blocked-files',
        file,
        zipPath,
        attachment,
        inspection,
        error:`ZIP contains ${inspection.blockedEntries.length} blocked/unsafe entr${inspection.blockedEntries.length===1?'y':'ies'}.`
      };
    }
    return {ok:true,handled:true,file,zipPath,attachment,inspection};
  }

  async extractPreparedArchiveImport(plan,{includeUnsupported=false}={}) {
    const {file,zipPath,attachment,inspection}=plan;
    const targetFolder=this.archiveImportSuggestedFolderPath(zipPath);
    const extracted=ARCHIVE_IMPORT_RUNTIME.extractZipAttachment(attachment,inspection,{includeUnsupported});
    await this.ensureArchiveImportFolderChain(targetFolder);

    const created=[];
    const createdEntries=[];
    for(const entry of extracted) {
      const targetPath=this.normalizeArchiveImportVaultPath(`${targetFolder}/${entry.safePath}`);
      const slash=targetPath.lastIndexOf('/');
      if(slash>=0) await this.ensureArchiveImportFolderChain(targetPath.slice(0,slash));
      const createdFile=await this.obsidianVaultWriteAdapter.createBinary(targetPath,entry.bytes);
      const persistedFile=this.obsidianVaultReadAdapter.getAbstractFileByPath(targetPath) || createdFile;
      if(!persistedFile || String(persistedFile.path || '')!==targetPath) {
        throw new Error(`Archive member write did not become visible in vault: ${targetPath}`);
      }
      const readBack=Buffer.from(await this.obsidianVaultReadAdapter.readBinary(persistedFile));
      const expected=Buffer.from(entry.bytes || []);
      if(!readBack.equals(expected)) {
        throw new Error(`Archive member read-back mismatch: ${targetPath}`);
      }
      created.push(targetPath);
      createdEntries.push({path:targetPath,file:persistedFile,support:entry.support});
    }

    const relationshipResults=[];
    for(const createdEntry of createdEntries) {
      if(createdEntry.support!=='pdf') continue;
      try {
        relationshipResults.push(await this.writeArchiveRelationshipsForPdf(
          createdEntry.path,
          zipPath,
          created,
          createdEntry.file
        ));
      } catch(error) {
        relationshipResults.push({
          ok:false,
          pdfPath:createdEntry.path,
          error:error instanceof Error?error.message:String(error)
        });
      }
    }
    const relationshipFailures=relationshipResults.filter(item=>item?.ok===false);
    const linkedPdfCount=relationshipResults.filter(item=>item?.linked===true).length;

    const result={
      ok:true,
      handled:true,
      zipPath,
      targetFolder,
      vaultRootPath:(()=>{ try { return this.obsidianVaultReadAdapter.getBasePath(); } catch(_) { return null; } })(),
      extractedCount:created.length,
      extractedPaths:created,
      linkedPdfCount,
      relationshipFailures
    };
    new Notice(`PDFium Gate: ZIP pakket ut til ${targetFolder} (${created.length} filer).`,7000);
    return result;
  }

  async handleArchiveImportVaultFiles(files,options={}) {
    const list=[];
    const seen=new Set();
    for(const file of Array.isArray(files)?files:[]) {
      if(!this.isArchiveImportZipFile(file)) continue;
      const zipPath=this.normalizeArchiveImportVaultPath(file?.path);
      if(!zipPath || seen.has(zipPath)) continue;
      seen.add(zipPath);
      list.push(file);
    }
    if(!list.length) return {ok:true,handled:false,reason:'no-zip-files',results:[]};

    const claimSuppressed=options?.claimSuppressed===true;
    const claimed=[];
    const immediateResults=[];
    for(const file of list) {
      const zipPath=this.normalizeArchiveImportVaultPath(file.path);
      if(claimSuppressed) {
        this.state.archiveImport.suppressedPaths.delete(zipPath);
      } else if(this.state.archiveImport.suppressedPaths.delete(zipPath)) {
        immediateResults.push({ok:true,handled:false,reason:'suppressed',zipPath});
        continue;
      }
      if(this.state.archiveImport.inFlight.has(zipPath)) {
        immediateResults.push({ok:true,handled:false,reason:'already-in-flight',zipPath});
        continue;
      }
      this.state.archiveImport.inFlight.add(zipPath);
      claimed.push({file,zipPath});
    }

    const prepared=[];
    const results=[...immediateResults];
    try {
      for(const item of claimed) {
        try {
          const plan=await this.prepareArchiveImportFile(item.file);
          if(plan.ok) prepared.push(plan);
          else {
            results.push(plan);
            if(plan.error) {
              console.warn('[PDFium Gate] Archive Import inspection failed',plan);
              new Notice(`PDFium Gate: Kunne ikke pakke ut ZIP: ${plan.error}`,10000);
            }
          }
        } catch(error) {
          const result={
            ok:false,
            handled:true,
            zipPath:item.zipPath,
            error:error instanceof Error?error.message:String(error)
          };
          results.push(result);
          console.warn('[PDFium Gate] Archive Import inspection failed',result);
          new Notice(`PDFium Gate: Kunne ikke pakke ut ZIP: ${result.error}`,10000);
        }
      }

      const decisionModel=this.archiveImportDecisionModel(prepared);
      let archiveMode='supported-only';
      if(decisionModel.unsupportedCount>0) {
        const chooser=typeof options?.chooseUnsupported==='function'
          ? options.chooseUnsupported
          : model=>new ArchiveImportUnsupportedFilesModal(this.app,this,model).openForDecision();
        const decision=await chooser(decisionModel);
        if(decision?.action==='keep') archiveMode='all';
        else if(decision?.action==='cancel-archives') archiveMode='none';
        else archiveMode='supported-only';
      }

      for(const plan of prepared) {
        if(archiveMode==='none') {
          results.push({
            ok:true,
            handled:true,
            reason:'archive-extraction-cancelled',
            zipPath:plan.zipPath,
            extractedCount:0,
            extractedPaths:[],
            linkedPdfCount:0,
            relationshipFailures:[]
          });
          continue;
        }
        try {
          results.push(await this.extractPreparedArchiveImport(plan,{
            includeUnsupported:archiveMode==='all'
          }));
        } catch(error) {
          const result={
            ok:false,
            handled:true,
            zipPath:plan.zipPath,
            error:error instanceof Error?error.message:String(error)
          };
          results.push(result);
          console.warn('[PDFium Gate] Archive Import failed',result);
          new Notice(`PDFium Gate: Kunne ikke pakke ut ZIP: ${result.error}`,10000);
        }
      }

      const aggregate={
        ok:results.every(result=>result?.ok!==false),
        handled:true,
        archiveCount:list.length,
        extractedArchiveCount:results.filter(result=>Number(result?.extractedCount||0)>0).length,
        unsupportedCount:decisionModel.unsupportedCount,
        archiveMode,
        results
      };
      this.state.archiveImport.lastResult=aggregate;
      return aggregate;
    } finally {
      for(const item of claimed) this.state.archiveImport.inFlight.delete(item.zipPath);
    }
  }

  async handleArchiveImportVaultCreate(file,options={}) {
    if(!this.isArchiveImportZipFile(file)) return {ok:true,handled:false,reason:'not-zip'};
    const aggregate=await this.handleArchiveImportVaultFiles([file],options);
    if(Array.isArray(aggregate?.results) && aggregate.results.length===1) {
      const single=aggregate.results[0];
      this.state.archiveImport.lastResult=single;
      return single;
    }
    return aggregate;
  }
}

module.exports={ArchiveImportFeature};
