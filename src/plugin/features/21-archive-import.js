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
    if(vaultPath) this.state.archiveImport.suppressedPaths.add(vaultPath);
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

  async handleArchiveImportVaultCreate(file) {
    if(!this.isArchiveImportZipFile(file)) return {ok:true,handled:false,reason:'not-zip'};
    const zipPath=this.normalizeArchiveImportVaultPath(file.path);
    if(this.state.archiveImport.suppressedPaths.delete(zipPath)) {
      return {ok:true,handled:false,reason:'suppressed',zipPath};
    }
    if(this.state.archiveImport.inFlight.has(zipPath)) {
      return {ok:true,handled:false,reason:'already-in-flight',zipPath};
    }

    this.state.archiveImport.inFlight.add(zipPath);
    try {
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
        throw new Error(`ZIP contains ${inspection.blockedEntries.length} blocked/unsafe entr${inspection.blockedEntries.length===1?'y':'ies'}.`);
      }
      if(inspection.unsupportedEntries.length) {
        return {
          ok:false,
          handled:true,
          reason:'unsupported-files',
          zipPath,
          unsupported:inspection.unsupportedEntries.map(entry=>entry.originalPath)
        };
      }

      const targetFolder=this.archiveImportSuggestedFolderPath(zipPath);
      const extracted=ARCHIVE_IMPORT_RUNTIME.extractZipAttachment(attachment,inspection,{includeUnsupported:false});
      await this.ensureArchiveImportFolderChain(targetFolder);

      const created=[];
      const createdEntries=[];
      try {
        for(const entry of extracted) {
          const targetPath=this.normalizeArchiveImportVaultPath(`${targetFolder}/${entry.safePath}`);
          const slash=targetPath.lastIndexOf('/');
          if(slash>=0) await this.ensureArchiveImportFolderChain(targetPath.slice(0,slash));
          const createdFile=await this.obsidianVaultWriteAdapter.createBinary(targetPath,entry.bytes);
          created.push(targetPath);
          createdEntries.push({path:targetPath,file:createdFile,support:entry.support});
        }
      } catch(error) {
        throw error;
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
        extractedCount:created.length,
        extractedPaths:created,
        linkedPdfCount,
        relationshipFailures
      };
      this.state.archiveImport.lastResult=result;
      new Notice(`PDFium Gate: ZIP pakket ut til ${targetFolder} (${created.length} filer).`,7000);
      return result;
    } catch(error) {
      const result={
        ok:false,
        handled:true,
        zipPath,
        error:error instanceof Error ? error.message : String(error)
      };
      this.state.archiveImport.lastResult=result;
      console.warn('[PDFium Gate] Archive Import failed',result);
      new Notice(`PDFium Gate: Kunne ikke pakke ut ZIP: ${result.error}`,10000);
      return result;
    } finally {
      this.state.archiveImport.inFlight.delete(zipPath);
    }
  }
}

module.exports={ArchiveImportFeature};
