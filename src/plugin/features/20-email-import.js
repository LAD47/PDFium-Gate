'use strict';

function emailImportArrayBuffer(buffer) {
  const bytes=Buffer.from(buffer || []);
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

class EmailImportFeature {
  registerEmailImportCommand() {
    this.obsidianPluginRegistrationAdapter.addCommand({
      id:'import-email-source',
      name:this.i18n.t('commands.importEmail'),
      callback:()=>{ void this.startEmailImport(); }
    });
    this.obsidianPluginRegistrationAdapter.addCommand({
      id:'import-email-pdf-attachment',
      name:this.i18n.t('commands.importEmailPdfAttachment'),
      callback:()=>{ void this.startEmailPdfAttachmentImport(); }
    });
  }

  async findEmailImportDuplicatesBySha256(sourceSha256) {
    const sha=String(sourceSha256 || '').toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Invalid email source SHA-256.');
    await this.ports.ensureDocumentRecordIndexReady();
    const matches=[];
    for(const file of this.obsidianVaultReadAdapter.listMarkdownFiles()) {
      const recordPath=metadataRecordNormalizeVaultPath(file?.path);
      if(!metadataRecordIsPath(recordPath)) continue;
      const frontmatter=this.obsidianMetadataCacheAdapter?.getFrontmatter?.(file) || null;
      if(!frontmatter || String(frontmatter.email_import_source_sha256 || '').toLowerCase()!==sha) continue;
      matches.push({
        id:String(frontmatter.filemeta_id || ''),
        recordPath,
        pdfPath:metadataRecordFilePathFromLink(frontmatter.filemeta_file),
        status:String(frontmatter.filemeta_status || '')
      });
    }
    return matches;
  }

  async ensureEmailImportTargetFolders(pdfPath) {
    const parts=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(pdfPath).split('/').slice(0,-1);
    let current='';
    for(const part of parts) {
      current=current ? `${current}/${part}` : part;
      await this.obsidianVaultWriteAdapter.ensureFolder(current);
    }
  }

  async openEmailImportPdfPath(pdfPath) {
    const file=this.obsidianVaultReadAdapter.getAbstractFileByPath(EMAIL_IMPORT_RUNTIME.normalizeVaultPath(pdfPath));
    if(!file || String(file.extension || '').toLowerCase()!=='pdf') throw new Error('Imported PDF could not be resolved in the vault.');
    const target=this.pdfLeafAdapter?.acquireOpenTarget?.(true);
    if(!target?.ok || !target.leaf) throw new Error(target?.error || 'No WorkspaceLeaf is available for the imported PDF.');
    await target.leaf.openFile(file);
    return true;
  }

  emailImportActivePdfPath() {
    const active=this.pdfLeafAdapter?.getActiveLeaf?.();
    const view=active?.ok?active.leaf?.view:null;
    const file=view?.file || null;
    if(!file || String(file.extension || '').toLowerCase()!=='pdf') return null;
    return EMAIL_IMPORT_RUNTIME.normalizeVaultPath(file.path);
  }

  async startEmailPdfAttachmentImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    try {
      const result=await EMAIL_IMPORT_RUNTIME.runEmailPdfAttachmentImport({
        parentPdfPath:this.emailImportActivePdfPath(),
        ensureDocumentRecordIndexReady:()=>this.ports.ensureDocumentRecordIndexReady(),
        getDocumentMetadataRecordState:pdfPath=>this.ports.getDocumentMetadataRecordState(pdfPath),
        vaultRootPath:this.obsidianVaultReadAdapter.getBasePath(),
        pathExists:candidate=>Boolean(this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate)),
        chooseAttachment:model=>new EmailPdfAttachmentImportModal(this.app,this,model).openForDecision(),
        getMetadataSchemaSnapshot:()=>this.ports.getMetadataSchemaSnapshot(),
        ensureTargetFolders:pdfPath=>this.ensureEmailImportTargetFolders(pdfPath),
        createPdf:(pdfPath,bytes)=>this.obsidianVaultWriteAdapter.createBinary(pdfPath,emailImportArrayBuffer(bytes)),
        saveDocumentMetadataRecordValues:(pdfPath,values)=>this.ports.saveDocumentMetadataRecordValues(pdfPath,values),
        deletePdf:pdfFile=>this.obsidianVaultWriteAdapter.deleteFile(pdfFile,true),
        openPdf:pdfPath=>this.openEmailImportPdfPath(pdfPath),
        onRollbackError:rollbackError=>console.warn('[PDFium Gate] Email attachment PDF rollback failed',rollbackError)
      });

      if(result?.reason==='no-active-pdf') {
        new Notice(t('emailImport.notice.openEmailPdfFirst'),8000);
        return result;
      }
      if(result?.reason==='not-email-import') {
        new Notice(t('emailImport.notice.notImportedEmailPdf'),8000);
        return result;
      }
      if(result?.reason==='source-not-retained') {
        new Notice(t('emailImport.notice.sourceNotRetained'),9000);
        return result;
      }
      if(result?.reason==='no-pdf-attachments') {
        new Notice(t('emailImport.notice.noImportablePdfAttachments'),8000);
        return result;
      }
      if(result?.reason==='invalid-target') {
        new Notice(t('emailImport.notice.invalidTarget',{error:result.error}),9000);
        return result;
      }
      if(result?.canceled) return result;

      if(result?.ok && result.pdfPath) {
        if(result.openError) {
          console.warn('[PDFium Gate] Email attachment import succeeded but opening the PDF failed',result.openError);
          new Notice(t('emailImport.notice.attachmentOpenFailed',{path:result.pdfPath}),8000);
        }
        new Notice(t('emailImport.notice.attachmentImported',{path:result.pdfPath}),7000);
      }
      return result;
    } catch(error) {
      console.error('[PDFium Gate] Email PDF attachment import failed',error);
      new Notice(t('emailImport.notice.attachmentImportFailed',{error:error instanceof Error?error.message:String(error)}),10000);
      return {ok:false,reason:'attachment-import-failed',error:error instanceof Error?error.message:String(error)};
    }
  }

  async startEmailImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    try {
      const transport=this.mainProcessTransport;
      if(!transport?.getCapabilities?.().loaded) {
        new Notice(t('emailImport.notice.bridgeUnavailable'),8000);
        return {ok:false,reason:'main-bridge-unavailable'};
      }

      const result=await EMAIL_IMPORT_RUNTIME.runEmailImport({
        chooseSource:()=>transport.chooseEmailImportSource({
          title:t('emailImport.modal.title'),
          emailFilterName:t('commands.importEmail')
        }),
        readSourceBytes:sourcePath=>nodeFsModule.readFileSync(sourcePath),
        findBySourceSha256:sha=>this.findEmailImportDuplicatesBySha256(sha),
        chooseReview:model=>new EmailImportReviewModal(this.app,this,model).openForDecision(),
        pathExists:candidate=>Boolean(this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate)),
        getMetadataSchemaSnapshot:()=>this.ports.getMetadataSchemaSnapshot(),
        ensureDocumentRecordIndexReady:()=>this.ports.ensureDocumentRecordIndexReady(),
        getDocumentMetadataRecordState:pdfPath=>this.ports.getDocumentMetadataRecordState(pdfPath),
        vaultRootPath:this.obsidianVaultReadAdapter.getBasePath(),
        printHtmlToPdf:args=>transport.printControlledEmailHtmlToPdf(args),
        ensureTargetFolders:pdfPath=>this.ensureEmailImportTargetFolders(pdfPath),
        createPdf:(pdfPath,bytes)=>this.obsidianVaultWriteAdapter.createBinary(pdfPath,emailImportArrayBuffer(bytes)),
        saveDocumentMetadataRecordValues:(pdfPath,values)=>this.ports.saveDocumentMetadataRecordValues(pdfPath,values),
        deletePdf:pdfFile=>this.obsidianVaultWriteAdapter.deleteFile(pdfFile,true),
        openPdf:pdfPath=>this.openEmailImportPdfPath(pdfPath),
        onPdfRollbackError:rollbackError=>console.warn('[PDFium Gate] Email Import PDF rollback failed',rollbackError),
        onRetainedRollbackError:rollbackError=>console.warn('[PDFium Gate] Email Import retained-source rollback failed',rollbackError)
      });

      if(result?.canceled) return result;
      if(result?.reason==='unsupported-source') {
        new Notice(t('emailImport.notice.unsupportedSource'),8000);
        return result;
      }
      if(result?.reason==='existing-open-failed') {
        new Notice(t('emailImport.notice.existingOpenFailed',{error:result.error}),9000);
        return result;
      }
      if(result?.reason==='invalid-target') {
        new Notice(t('emailImport.notice.invalidTarget',{error:result.error}),9000);
        return result;
      }
      if(result?.openedExisting) {
        new Notice(t('emailImport.notice.existingOpened'),5000);
        return result;
      }

      if(result?.ok && result.pdfPath) {
        if(result.openError) {
          console.warn('[PDFium Gate] Email Import succeeded but opening the generated PDF failed',result.openError);
          new Notice(t('emailImport.notice.openFailed',{path:result.pdfPath}),8000);
        }
        new Notice(t('emailImport.notice.imported',{path:result.pdfPath}),7000);
      }
      return result;
    } catch(error) {
      console.error('[PDFium Gate] Email Import failed',error);
      new Notice(t('emailImport.notice.importFailed',{error:error instanceof Error?error.message:String(error)}),10000);
      return {ok:false,reason:'import-failed',error:error instanceof Error?error.message:String(error)};
    }
  }
}

module.exports={EmailImportFeature};
