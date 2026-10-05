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

  async writeArchiveRelationshipsForPdf(pdfPath,provenance,memberPaths,createdFile=null) {
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
      return {ok:true,pdfPath,linked:false,recordCreated:false,reason:registration?.reason||'pdf-not-registered'};
    }
    const recordPath=this.normalizeArchiveImportVaultPath(state.recordPath);
    const recordFile=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath);
    if(!recordFile || String(recordFile.extension||'').toLowerCase()!=='md') {
      return {ok:false,pdfPath,error:'PDF metadata record file is missing'};
    }
    const before=String(await this.obsidianVaultReadAdapter.readText(recordFile));
    const model={
      sourceArchiveName:String(provenance?.sourceArchiveName || ''),
      sourceArchiveSha256:String(provenance?.sourceArchiveSha256 || ''),
      parentDocumentPath:this.normalizeArchiveImportVaultPath(provenance?.parentDocumentPath),
      memberPaths,
      selfPath:pdfPath
    };
    const after=ARCHIVE_IMPORT_RUNTIME.upsertArchiveRelationshipBlock(before,model);
    if(after!==before) await this.obsidianVaultWriteAdapter.modifyText(recordFile,after);
    const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath)||recordFile;
    const verified=String(await this.obsidianVaultReadAdapter.readText(current));
    const relation=ARCHIVE_IMPORT_RUNTIME.extractArchiveRelationship(verified);
    const expectedMembers=ARCHIVE_IMPORT_RUNTIME.normalizeArchiveRelationshipPaths(memberPaths)
      .filter(path=>path!==pdfPath && path!==model.parentDocumentPath);
    if(!relation
      || relation.sourceArchiveName!==model.sourceArchiveName
      || relation.sourceArchiveSha256!==model.sourceArchiveSha256
      || (relation.parentDocumentPath||'')!==(model.parentDocumentPath||'')
      || JSON.stringify(relation.memberPaths)!==JSON.stringify(expectedMembers)) {
      return {ok:false,pdfPath,error:'Archive relationship block failed read-back verification'};
    }
    return {
      ok:true,
      pdfPath,
      linked:true,
      recordCreated:registration?.created===true,
      recordPath,
      linkedCount:expectedMembers.length+(model.parentDocumentPath?1:0)
    };
  }

  archiveImportFilePathFromWikilink(value) {
    const text=String(value || '').trim();
    const match=/^\[\[([\s\S]+)\]\]$/.exec(text);
    const target=match ? String(match[1] || '').split('|',1)[0] : text;
    return this.normalizeArchiveImportVaultPath(target);
  }

  // Legacy compatibility for email PDFs created before ZIP files became transient.
  async findArchivePdfMembersForSourceZip(sourceZipPath) {
    const source=this.normalizeArchiveImportVaultPath(sourceZipPath);
    if(!source || !/\.zip$/i.test(source)) return {ok:true,sourceZipPath:source,pdfPaths:[]};
    const markdownFiles=this.obsidianVaultReadAdapter.listMarkdownFiles();
    const pdfPaths=[];
    const seen=new Set();
    for(const recordFile of Array.isArray(markdownFiles)?markdownFiles:[]) {
      const recordPath=this.normalizeArchiveImportVaultPath(recordFile?.path);
      if(!/^File Metadata\//.test(recordPath) || String(recordFile?.extension || '').toLowerCase()!=='md') continue;
      const frontmatter=this.obsidianMetadataCacheAdapter?.getFrontmatter?.(recordFile) || null;
      if(!frontmatter || String(frontmatter.filemeta_status || '')!=='active') continue;
      const linkedPdfPath=this.archiveImportFilePathFromWikilink(frontmatter.filemeta_file);
      if(!linkedPdfPath) continue;
      const resolvedPdf=this.normalizeArchiveImportVaultPath(
        this.obsidianMetadataCacheAdapter?.resolveLinkPath?.(linkedPdfPath,recordPath) || linkedPdfPath
      );
      const pdfFile=this.obsidianVaultReadAdapter.getAbstractFileByPath(resolvedPdf);
      if(!pdfFile || String(pdfFile.extension || '').toLowerCase()!=='pdf') continue;
      const markdown=String(await this.obsidianVaultReadAdapter.readText(recordFile));
      const relation=ARCHIVE_IMPORT_RUNTIME.extractArchiveRelationship(markdown);
      if(!relation?.sourceZipPath) continue;
      const resolvedSource=this.normalizeArchiveImportVaultPath(
        this.obsidianMetadataCacheAdapter?.resolveLinkPath?.(relation.sourceZipPath,recordPath) || relation.sourceZipPath
      );
      if(resolvedSource!==source || seen.has(resolvedPdf)) continue;
      seen.add(resolvedPdf);
      pdfPaths.push(resolvedPdf);
    }
    pdfPaths.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
    return {ok:true,sourceZipPath:source,pdfPaths};
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
        filename:String(plan?.sourceArchiveName || plan?.file?.name || 'archive.zip'),
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
    const bytes=Buffer.from(await this.obsidianVaultReadAdapter.readBinary(file));
    const attachment={
      id:`vault-zip:${zipPath}`,
      filename:file.name || zipPath.split('/').pop() || 'archive.zip',
      contentType:'application/zip',
      content:bytes,
      size:bytes.length
    };
    const inspection=ARCHIVE_IMPORT_RUNTIME.inspectZipAttachment(attachment);
    if(inspection.blockedEntries.length) {
      return {
        ok:false,handled:true,reason:'blocked-files',file,zipPath,attachment,inspection,
        error:`ZIP contains ${inspection.blockedEntries.length} blocked or unsafe entries.`
      };
    }
    const nested=inspection.fileEntries.find(entry=>/\.zip$/i.test(String(entry?.safePath || entry?.originalPath || '')));
    if(nested) {
      return {
        ok:false,handled:true,reason:'nested-zip',file,zipPath,attachment,inspection,
        error:`Nested ZIP is not supported: ${nested.originalPath}`
      };
    }
    return {
      ok:true,
      handled:true,
      file,
      zipPath,
      attachment,
      inspection,
      sourceArchiveName:attachment.filename,
      sourceArchiveSha256:ARCHIVE_IMPORT_RUNTIME.sha256Hex(bytes)
    };
  }

  async rollbackArchiveImport({targetFolder,createdEntries,registeredPdfPaths}) {
    const errors=[];
    for(const pdfPath of Array.isArray(registeredPdfPaths)?registeredPdfPaths.slice().reverse():[]) {
      try {
        const removed=await this.ports.deleteDocumentMetadataRecordForPdf(pdfPath);
        if(removed?.ok===false) throw new Error(removed.error||'metadata rollback failed');
      } catch(error) {
        errors.push({path:pdfPath,error:error instanceof Error?error.message:String(error)});
      }
    }
    const folder=this.obsidianVaultReadAdapter.getAbstractFileByPath(targetFolder);
    if(folder) {
      try { await this.obsidianVaultWriteAdapter.deleteFile(folder,true); }
      catch(error){ errors.push({path:targetFolder,error:error instanceof Error?error.message:String(error)}); }
    } else {
      for(const item of Array.isArray(createdEntries)?createdEntries.slice().reverse():[]) {
        const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(item.path) || item.file;
        if(!current) continue;
        try { await this.obsidianVaultWriteAdapter.deleteFile(current,true); }
        catch(error){ errors.push({path:item.path,error:error instanceof Error?error.message:String(error)}); }
      }
    }
    return {ok:errors.length===0,errors};
  }

  async extractPreparedArchiveImport(plan,{includeUnsupported=false,parentDocumentPath=null}={}) {
    const {file,zipPath,attachment,inspection,sourceArchiveName,sourceArchiveSha256}=plan;
    const targetFolder=this.archiveImportSuggestedFolderPath(zipPath);
    const extracted=ARCHIVE_IMPORT_RUNTIME.extractZipAttachment(attachment,inspection,{includeUnsupported});
    const createdEntries=[];
    const registeredPdfPaths=[];

    try {
      await this.ensureArchiveImportFolderChain(targetFolder);
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
        if(!readBack.equals(expected)) throw new Error(`Archive member read-back mismatch: ${targetPath}`);
        createdEntries.push({path:targetPath,file:persistedFile,support:entry.support});
      }

      const createdPaths=createdEntries.map(item=>item.path);
      const relationshipResults=[];
      for(const createdEntry of createdEntries) {
        if(createdEntry.support!=='pdf') continue;
        const relationship=await this.writeArchiveRelationshipsForPdf(
          createdEntry.path,
          {sourceArchiveName,sourceArchiveSha256,parentDocumentPath},
          createdPaths,
          createdEntry.file
        );
        relationshipResults.push(relationship);
        if(relationship?.recordCreated===true) registeredPdfPaths.push(createdEntry.path);
        if(relationship?.ok===false) throw new Error(relationship.error||`Archive relationship failed: ${createdEntry.path}`);
      }

      const currentSource=this.obsidianVaultReadAdapter.getAbstractFileByPath(zipPath) || file;
      if(!currentSource) throw new Error('Source ZIP disappeared before final cleanup.');
      await this.obsidianVaultWriteAdapter.deleteFile(currentSource,true);
      if(this.obsidianVaultReadAdapter.getAbstractFileByPath(zipPath)) {
        throw new Error('Source ZIP is still present after successful deletion.');
      }

      const result={
        ok:true,
        handled:true,
        zipPath,
        sourceArchiveName,
        sourceArchiveSha256,
        sourceDeleted:true,
        targetFolder,
        vaultRootPath:(()=>{ try { return this.obsidianVaultReadAdapter.getBasePath(); } catch(_) { return null; } })(),
        extractedCount:createdEntries.length,
        extractedPaths:createdPaths,
        linkedPdfCount:relationshipResults.filter(item=>item?.linked===true).length,
        relationshipFailures:[]
      };
      new Notice(`PDFium Gate: ZIP imported to ${targetFolder} (${createdEntries.length} files).`,7000);
      return result;
    } catch(error) {
      const rollback=await this.rollbackArchiveImport({targetFolder,createdEntries,registeredPdfPaths});
      return {
        ok:false,
        handled:true,
        reason:'archive-transaction-failed',
        zipPath,
        sourceArchiveName,
        sourceArchiveSha256,
        sourceDeleted:false,
        targetFolder,
        error:error instanceof Error?error.message:String(error),
        rollback
      };
    }
  }

  async resolveFailedArchiveSource(file,result,options={}) {
    const zipPath=this.normalizeArchiveImportVaultPath(file?.path || result?.zipPath);
    const chooser=typeof options?.chooseFailure==='function'
      ? options.chooseFailure
      : model=>new ArchiveImportFailureModal(this.app,this,model).openForDecision();
    let decision={action:'keep'};
    try {
      decision=await chooser({
        path:zipPath,
        name:file?.name || zipPath.split('/').pop() || 'ZIP',
        error:result?.error || result?.reason || 'Archive import failed.'
      }) || decision;
    } catch(error) {
      console.warn('[PDFium Gate] Archive Import failure dialog failed; keeping source ZIP',error);
    }

    if(decision?.action==='delete') {
      try {
        const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(zipPath) || file;
        if(current) await this.obsidianVaultWriteAdapter.deleteFile(current,true);
        this.state.archiveImport.deferredPaths.delete(zipPath);
        return {...result,sourceDeleted:true,failureDecision:'delete'};
      } catch(error) {
        this.state.archiveImport.deferredPaths.add(zipPath);
        new Notice(`PDFium Gate: Could not delete failed ZIP: ${error instanceof Error?error.message:String(error)}`,10000);
        return {...result,sourceDeleted:false,failureDecision:'delete-failed',deleteError:error instanceof Error?error.message:String(error)};
      }
    }

    this.state.archiveImport.deferredPaths.add(zipPath);
    return {...result,sourceDeleted:false,failureDecision:'keep'};
  }

  async handleArchiveImportVaultFiles(files,options={}) {
    const list=[];
    const seen=new Set();
    for(const file of Array.isArray(files)?files:[]) {
      if(!this.isArchiveImportZipFile(file)) continue;
      const zipPath=this.normalizeArchiveImportVaultPath(file?.path);
      if(!zipPath || seen.has(zipPath)) continue;
      if(options?.includeDeferred!==true && this.state.archiveImport.deferredPaths.has(zipPath)) continue;
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
        let plan;
        try {
          plan=await this.prepareArchiveImportFile(item.file);
        } catch(error) {
          plan={ok:false,handled:true,zipPath:item.zipPath,file:item.file,error:error instanceof Error?error.message:String(error)};
        }
        if(plan.ok) {
          prepared.push(plan);
        } else {
          const resolved=await this.resolveFailedArchiveSource(item.file,plan,options);
          results.push(resolved);
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
          this.state.archiveImport.deferredPaths.add(plan.zipPath);
          results.push({
            ok:true,
            handled:true,
            reason:'archive-extraction-cancelled',
            zipPath:plan.zipPath,
            sourceDeleted:false,
            extractedCount:0,
            extractedPaths:[],
            linkedPdfCount:0,
            relationshipFailures:[]
          });
          continue;
        }
        const result=await this.extractPreparedArchiveImport(plan,{
          includeUnsupported:archiveMode==='all',
          parentDocumentPath:options?.parentDocumentPath || null
        });
        if(result?.ok===false) {
          results.push(await this.resolveFailedArchiveSource(plan.file,result,options));
        } else {
          this.state.archiveImport.deferredPaths.delete(plan.zipPath);
          results.push(result);
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

  async reconcileArchiveImportVaultFiles(options={}) {
    if(this.state.archiveImport.reconcileInFlight) return {ok:true,handled:false,reason:'reconcile-in-flight'};
    this.state.archiveImport.reconcileInFlight=true;
    try {
      const files=this.obsidianVaultReadAdapter.listFiles();
      const zips=(Array.isArray(files)?files:[]).filter(file=>this.isArchiveImportZipFile(file))
        .filter(file=>!this.state.archiveImport.deferredPaths.has(this.normalizeArchiveImportVaultPath(file.path)));
      if(!zips.length) return {ok:true,handled:false,reason:'no-zip-files',results:[]};
      return await this.handleArchiveImportVaultFiles(zips,options);
    } finally {
      this.state.archiveImport.reconcileInFlight=false;
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
