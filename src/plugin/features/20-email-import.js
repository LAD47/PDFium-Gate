'use strict';

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
    this.obsidianWorkspaceLifecycleAdapter.onLayoutReady(()=>this.installEmailImportVaultTrigger());
  }

  installEmailImportVaultTrigger() {
    const trigger=createVaultEmailCreateTrigger({
      onEmailFile:file=>this.startEmailImportFromVaultFile(file),
      onError:(error,file)=>console.error('[PDFium Gate] Vault email staging import failed',file?.path,error)
    });
    this.obsidianPluginRegistrationAdapter.registerEvent(
      this.obsidianVaultLifecycleAdapter.onCreate(file=>{ void trigger.handleCreate(file); })
    );
  }

  emailImportAdapter() {
    return createObsidianEmailImportAdapter({
      runtime:EMAIL_IMPORT_RUNTIME,
      vaultRead:this.obsidianVaultReadAdapter,
      metadataCache:this.obsidianMetadataCacheAdapter,
      vaultWrite:this.obsidianVaultWriteAdapter,
      pdfLeaf:this.pdfLeafAdapter,
      ensureDocumentRecordIndexReady:()=>this.ports.ensureDocumentRecordIndexReady(),
      getMetadataSchemaSnapshot:()=>this.ports.getMetadataSchemaSnapshot(),
      getDocumentMetadataRecordState:pdfPath=>this.ports.getDocumentMetadataRecordState(pdfPath),
      saveDocumentMetadataRecordValues:(pdfPath,values)=>this.ports.saveDocumentMetadataRecordValues(pdfPath,values)
    });
  }

  async startEmailPdfAttachmentImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    const adapter=this.emailImportAdapter();
    try {
      const result=await EMAIL_IMPORT_RUNTIME.runEmailPdfAttachmentImport({
        parentPdfPath:adapter.activePdfPath(),
        ensureDocumentRecordIndexReady:adapter.ensureDocumentRecordIndexReady,
        getDocumentMetadataRecordState:adapter.getDocumentMetadataRecordState,
        vaultRootPath:adapter.getVaultRootPath(),
        pathExists:adapter.pathExists,
        chooseAttachment:model=>new EmailPdfAttachmentImportModal(this.app,this,model).openForDecision(),
        getMetadataSchemaSnapshot:adapter.getMetadataSchemaSnapshot,
        ensureTargetFolders:adapter.ensureTargetFolders,
        createPdf:adapter.createPdf,
        saveDocumentMetadataRecordValues:adapter.saveDocumentMetadataRecordValues,
        deletePdf:adapter.deletePdf,
        openPdf:adapter.openPdf,
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

  async runEmailImportFlow({chooseSource,readSourceBytes,chooseReview,services}) {
    const t=(key,params)=>this.i18n.t(key,params);
    const transport=this.mainProcessTransport;
    if(!transport?.getCapabilities?.().loaded) {
      new Notice(t('emailImport.notice.bridgeUnavailable'),8000);
      return {ok:false,reason:'main-bridge-unavailable'};
    }

    const adapter=this.emailImportAdapter();
    try {
      const result=await EMAIL_IMPORT_RUNTIME.runEmailImport({
        chooseSource,
        readSourceBytes,
        findBySourceSha256:adapter.findDuplicatesBySha256,
        chooseReview,
        pathExists:adapter.pathExists,
        getMetadataSchemaSnapshot:adapter.getMetadataSchemaSnapshot,
        ensureDocumentRecordIndexReady:adapter.ensureDocumentRecordIndexReady,
        getDocumentMetadataRecordState:adapter.getDocumentMetadataRecordState,
        vaultRootPath:adapter.getVaultRootPath(),
        printHtmlToPdf:args=>transport.printControlledEmailHtmlToPdf(args),
        ensureTargetFolders:adapter.ensureTargetFolders,
        createPdf:adapter.createPdf,
        saveDocumentMetadataRecordValues:adapter.saveDocumentMetadataRecordValues,
        deletePdf:adapter.deletePdf,
        openPdf:adapter.openPdf,
        onPdfRollbackError:rollbackError=>console.warn('[PDFium Gate] Email Import PDF rollback failed',rollbackError),
        onRetainedRollbackError:rollbackError=>console.warn('[PDFium Gate] Email Import retained-source rollback failed',rollbackError),
        services
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

  async startEmailImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    const transport=this.mainProcessTransport;
    return await this.runEmailImportFlow({
      chooseSource:()=>transport.chooseEmailImportSource({
        title:t('emailImport.modal.title'),
        emailFilterName:t('commands.importEmail')
      }),
      readSourceBytes:sourcePath=>nodeFsModule.readFileSync(sourcePath),
      chooseReview:model=>new EmailImportReviewModal(this.app,this,model).openForDecision()
    });
  }

  async startEmailImportFromVaultFile(file) {
    const vaultPath=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(file?.path);
    if(!vaultPath || !/\.(?:eml|msg)$/i.test(vaultPath)) return {ok:false,reason:'not-email-staging-file'};
    const slash=vaultPath.lastIndexOf('/');
    const folder=slash>=0?vaultPath.slice(0,slash):'';
    let importedSourceBytes=null;

    const result=await this.runEmailImportFlow({
      chooseSource:async()=>({canceled:false,filePath:vaultPath}),
      readSourceBytes:async()=>{
        const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(vaultPath) || file;
        const bytes=Buffer.from(await this.obsidianVaultReadAdapter.readBinary(current));
        importedSourceBytes=Buffer.from(bytes);
        return bytes;
      },
      chooseReview:model=>new EmailImportReviewModal(this.app,this,{...model,retentionLocked:true}).openForDecision(),
      services:{
        suggestedEmailPdfPath:(document,pathExists)=>EMAIL_IMPORT_RUNTIME.suggestedEmailPdfPathInFolder(document,folder,pathExists)
      }
    });

    if(result?.ok && !result.openedExisting && result.pdfPath && result.sourceRetained===true && result.retainedPath && importedSourceBytes) {
      const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(vaultPath);
      if(current) {
        try {
          const currentBytes=Buffer.from(await this.obsidianVaultReadAdapter.readBinary(current));
          if(currentBytes.equals(importedSourceBytes)) {
            await this.obsidianVaultWriteAdapter.deleteFile(current,true);
          } else {
            console.warn('[PDFium Gate] Email staging file changed during import; leaving it in place',vaultPath);
          }
        } catch(error) {
          console.warn('[PDFium Gate] Email import succeeded but staging-file cleanup failed',vaultPath,error);
        }
      }
    }

    return result;
  }
}

module.exports={EmailImportFeature};
