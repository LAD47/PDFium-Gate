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
      try {
        for(const entry of extracted) {
          const targetPath=this.normalizeArchiveImportVaultPath(`${targetFolder}/${entry.safePath}`);
          const slash=targetPath.lastIndexOf('/');
          if(slash>=0) await this.ensureArchiveImportFolderChain(targetPath.slice(0,slash));
          this.suppressArchiveImportPathOnce(targetPath);
          await this.obsidianVaultWriteAdapter.createBinary(targetPath,entry.bytes);
          created.push(targetPath);
        }
      } catch(error) {
        throw error;
      }

      const result={
        ok:true,
        handled:true,
        zipPath,
        targetFolder,
        extractedCount:created.length,
        extractedPaths:created
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
