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
  }

  async startEmailPdfAttachmentImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    const adapter=createObsidianEmailImportAdapter(this);
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

  async startEmailImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    const transport=this.mainProcessTransport;
    if(!transport?.getCapabilities?.().loaded) {
      new Notice(t('emailImport.notice.bridgeUnavailable'),8000);
      return {ok:false,reason:'main-bridge-unavailable'};
    }

    const adapter=createObsidianEmailImportAdapter(this);
    try {
      const result=await EMAIL_IMPORT_RUNTIME.runEmailImport({
        chooseSource:()=>transport.chooseEmailImportSource({
          title:t('emailImport.modal.title'),
          emailFilterName:t('commands.importEmail')
        }),
        readSourceBytes:sourcePath=>nodeFsModule.readFileSync(sourcePath),
        findBySourceSha256:adapter.findDuplicatesBySha256,
        chooseReview:model=>new EmailImportReviewModal(this.app,this,model).openForDecision(),
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