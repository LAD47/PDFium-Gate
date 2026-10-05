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
    this.obsidianPluginRegistrationAdapter.registerObsidianProtocolHandler(
      EMAIL_IMPORT_RUNTIME.EMAIL_ATTACHMENT_PROTOCOL_ACTION,
      params=>{ void this.openEmailAttachmentFromProtocol(params); }
    );
    this.obsidianWorkspaceLifecycleAdapter.onLayoutReady(()=>this.installEmailImportVaultTrigger());
  }

  installEmailImportVaultTrigger() {
    const trigger=createVaultEmailCreateTrigger({
      onEmailFile:file=>this.startEmailImportFromVaultFile(file),
      onError:(error,file)=>console.error('[PDFium Gate] Vault email staging import failed',file?.path,error)
    });
    this.emailImportVaultTrigger=trigger;
    this.obsidianPluginRegistrationAdapter.registerEvent(
      this.obsidianVaultLifecycleAdapter.onCreate(file=>{ void trigger.handleCreate(file); })
    );
    this.obsidianPluginRegistrationAdapter.registerEvent(
      this.obsidianVaultLifecycleAdapter.onModify(file=>{
        void this.normalizeManagedEmailAttachmentLinks(file).catch(error=>
          console.warn('[PDFium Gate] Email attachment link normalization failed',file?.path,error)
        );
      })
    );
  }

  async normalizeManagedEmailAttachmentLinks(file) {
    const recordPath=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(file?.path);
    if(!recordPath || !/^File Metadata\//.test(recordPath) || !/\.md$/i.test(recordPath)) {
      return {ok:true,skipped:true,reason:'not-email-metadata-record'};
    }
    if(String(file?.extension || '').toLowerCase()!=='md') {
      return {ok:true,skipped:true,reason:'not-markdown'};
    }

    const inFlight=this.emailAttachmentLinkNormalizationInFlight || (this.emailAttachmentLinkNormalizationInFlight=new Set());
    if(inFlight.has(recordPath)) return {ok:true,skipped:true,reason:'normalization-in-flight'};
    inFlight.add(recordPath);
    try {
      const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath) || file;
      const before=String(await this.obsidianVaultReadAdapter.readText(current));
      const after=EMAIL_IMPORT_RUNTIME.normalizeResolvedEmailAttachmentLinkTargets(
        before,
        recordPath,
        (linkPath,sourcePath)=>this.obsidianMetadataCacheAdapter.resolveLinkPath(linkPath,sourcePath)
      );
      if(after===before) return {ok:true,changed:false,recordPath};
      await this.obsidianVaultWriteAdapter.modifyText(current,after);
      return {ok:true,changed:true,recordPath};
    } finally {
      inFlight.delete(recordPath);
    }
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

  async openEmailAttachmentFromProtocol(params) {
    const sourceSha256=String(params?.source || '').trim().toLowerCase();
    const attachmentSha256=String(params?.attachment || '').trim().toLowerCase();
    const parsedIndex=Number.parseInt(String(params?.index ?? ''),10);
    const preferredIndex=Number.isInteger(parsedIndex) && parsedIndex>=0 ? parsedIndex : -1;

    const fail=(reason,error)=>{
      if(error) console.warn('[PDFium Gate] Email attachment protocol link failed',reason,error);
      else console.warn('[PDFium Gate] Email attachment protocol link failed',reason);
      new Notice(this.i18n.t('emailImport.notice.attachmentLinkFailed'),8000);
      return {ok:false,reason,error:error instanceof Error?error.message:(error?String(error):null)};
    };

    if(!/^[0-9a-f]{64}$/.test(sourceSha256) || !/^[0-9a-f]{64}$/.test(attachmentSha256)) {
      return fail('invalid-protocol-identity');
    }

    try {
      const adapter=this.emailImportAdapter();
      const parents=await adapter.findDuplicatesBySha256(sourceSha256);
      if(!parents.length) return fail('source-record-not-found');

      const matches=new Map();
      const preferredMatches=new Map();
      const resolvedPaths=new Set();

      for(const parent of parents) {
        const recordPath=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(parent?.recordPath);
        if(!recordPath) continue;
        const recordFile=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath);
        if(!recordFile || String(recordFile.extension || '').toLowerCase()!=='md') continue;
        const markdown=String(await this.obsidianVaultReadAdapter.readText(recordFile));
        const linkPaths=EMAIL_IMPORT_RUNTIME.extractEmailAttachmentLinkPaths(markdown);

        for(let index=0;index<linkPaths.length;index++) {
          const linkPath=linkPaths[index];
          const resolved=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(
            this.obsidianMetadataCacheAdapter.resolveLinkPath(linkPath,recordPath) || linkPath
          );
          if(!resolved || resolvedPaths.has(resolved)) {
            if(resolved && index===preferredIndex && matches.has(resolved)) preferredMatches.set(resolved,matches.get(resolved));
            continue;
          }
          const file=this.obsidianVaultReadAdapter.getAbstractFileByPath(resolved);
          if(!file || typeof file.path!=='string' || typeof file.extension!=='string') continue;
          resolvedPaths.add(resolved);

          // attachmentSha256 identifies the immutable original attachment payload.
          // The exported vault document is intentionally mutable, so its current bytes
          // must not be compared with the import-time hash when resolving the live link.
          const match={path:resolved,recordPath,index};
          matches.set(resolved,match);
          if(index===preferredIndex) preferredMatches.set(resolved,match);
        }
      }

      const preferred=[...preferredMatches.values()];
      const all=[...matches.values()];
      const selected=preferred.length===1 ? preferred[0] : (preferred.length===0 && all.length===1 ? all[0] : null);
      if(!selected) return fail(all.length || preferred.length ? 'attachment-target-ambiguous' : 'attachment-target-not-found');

      let openPath=selected.path;
      const selectedFile=this.obsidianVaultReadAdapter.getAbstractFileByPath(selected.path);
      if(String(selectedFile?.extension || '').toLowerCase()==='zip') {
        const archiveMembers=await this.ports.findArchivePdfMembersForSourceZip(selected.path);
        const pdfPaths=Array.isArray(archiveMembers?.pdfPaths)?archiveMembers.pdfPaths:[];
        if(pdfPaths.length===1) {
          openPath=pdfPaths[0];
        } else if(pdfPaths.length>1) {
          const decision=await new ArchiveImportPdfChoiceModal(this.app,this,{
            sourceZipPath:selected.path,
            pdfPaths
          }).openForDecision();
          if(decision?.action!=='open' || !decision.path) {
            return {ok:true,canceled:true,path:null,sourceZipPath:selected.path,recordPath:selected.recordPath,index:selected.index};
          }
          openPath=String(decision.path);
        }
      }

      await adapter.openVaultFile(openPath);
      return {
        ok:true,
        path:openPath,
        sourceAttachmentPath:selected.path,
        redirectedFromArchive:openPath!==selected.path,
        recordPath:selected.recordPath,
        index:selected.index
      };
    } catch(error) {
      return fail('attachment-open-failed',error);
    }
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

  async runEmailImportFlow({chooseSource,readSourceBytes,chooseReview,services,notifySuccess=true}) {
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
        if(notifySuccess) new Notice(t('emailImport.notice.existingOpened'),5000);
        return result;
      }

      if(result?.ok && result.pdfPath && notifySuccess) {
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

  async emailImportExistingRetainedSourceMatches(pdfPath,sourceBytes) {
    try {
      const adapter=this.emailImportAdapter();
      await adapter.ensureDocumentRecordIndexReady();
      const state=adapter.getDocumentMetadataRecordState(pdfPath);
      if(!state?.ready || !state?.ok || !state?.registered || !state?.values) return false;
      const loaded=await EMAIL_IMPORT_RUNTIME.loadCanonicalEmailFromRetainedRecord({
        values:state.values,
        vaultRootPath:adapter.getVaultRootPath()
      });
      return Buffer.from(loaded.retainedSource?.bytes || []).equals(Buffer.from(sourceBytes || []));
    } catch(error) {
      console.warn('[PDFium Gate] Could not verify existing retained email source for staging cleanup',pdfPath,error);
      return false;
    }
  }

  async updateEmailAttachmentLinks({parentRecordPath,attachmentPaths}) {
    const recordPath=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(parentRecordPath);
    if(!recordPath || !/^File Metadata\//.test(recordPath) || !/\.md$/i.test(recordPath)) {
      throw new Error('Parent metadata record path is unavailable or unsafe for attachment links.');
    }
    const file=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath);
    if(!file || String(file.extension || '').toLowerCase()!=='md') {
      throw new Error(`Parent metadata record is missing: ${recordPath}`);
    }
    const before=String(await this.obsidianVaultReadAdapter.readText(file));
    const after=EMAIL_IMPORT_RUNTIME.upsertEmailAttachmentLinkBlock(before,attachmentPaths);
    if(after!==before) await this.obsidianVaultWriteAdapter.modifyText(file,after);

    const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(recordPath) || file;
    const verifiedText=String(await this.obsidianVaultReadAdapter.readText(current));
    const actual=EMAIL_IMPORT_RUNTIME.extractEmailAttachmentLinkPaths(verifiedText);
    const expected=[];
    const seen=new Set();
    for(const value of Array.isArray(attachmentPaths)?attachmentPaths:[]) {
      const path=EMAIL_IMPORT_RUNTIME.normalizeVaultPath(value);
      if(path && !seen.has(path)) { seen.add(path); expected.push(path); }
    }
    if(JSON.stringify(actual)!==JSON.stringify(expected)) {
      throw new Error('Attachment wikilink block failed read-back verification.');
    }
    return {ok:true,recordPath,linkedCount:actual.length,attachmentPaths:actual};
  }

  async exportPlannedEmailAttachments(parentPdfPath,plan) {
    const adapter=this.emailImportAdapter();
    return await EMAIL_IMPORT_RUNTIME.runPlannedEmailAttachmentExport({
      parentPdfPath,
      plan,
      ensureDocumentRecordIndexReady:adapter.ensureDocumentRecordIndexReady,
      getDocumentMetadataRecordState:adapter.getDocumentMetadataRecordState,
      getMetadataSchemaSnapshot:adapter.getMetadataSchemaSnapshot,
      ensureTargetFolders:adapter.ensureTargetFolders,
      createBinary:adapter.createBinary,
      readBinary:file=>this.obsidianVaultReadAdapter.readBinary(file),
      deleteFile:adapter.deleteFile,
      deleteFolder:async folderPath=>{
        const folder=this.obsidianVaultReadAdapter.getAbstractFileByPath(folderPath);
        if(folder) await this.obsidianVaultWriteAdapter.deleteFile(folder,true);
      },
      deleteDocumentMetadataRecordForPdf:pdfPath=>this.ports.deleteDocumentMetadataRecordForPdf(pdfPath),
      saveDocumentMetadataRecordValues:adapter.saveDocumentMetadataRecordValues,
      updateParentAttachmentLinks:model=>this.updateEmailAttachmentLinks(model),
      writeArchiveRelationshipForPdf:model=>this.ports.writeArchiveRelationshipsForPdf(
        model.pdfPath,
        model.provenance,
        model.memberPaths,
        null
      ),
      onRollbackError:(error,targetPath)=>console.warn('[PDFium Gate] Planned email attachment rollback failed',targetPath,error)
    });
  }

  async exportAutomaticEmailAttachments(parentPdfPath) {
    const adapter=this.emailImportAdapter();
    return await EMAIL_IMPORT_RUNTIME.runAutomaticEmailAttachmentExport({
      parentPdfPath,
      ensureDocumentRecordIndexReady:adapter.ensureDocumentRecordIndexReady,
      getDocumentMetadataRecordState:adapter.getDocumentMetadataRecordState,
      vaultRootPath:adapter.getVaultRootPath(),
      pathExists:adapter.pathExists,
      getMetadataSchemaSnapshot:adapter.getMetadataSchemaSnapshot,
      ensureTargetFolders:adapter.ensureTargetFolders,
      createBinary:adapter.createBinary,
      deleteFile:adapter.deleteFile,
      saveDocumentMetadataRecordValues:adapter.saveDocumentMetadataRecordValues,
      updateParentAttachmentLinks:model=>this.updateEmailAttachmentLinks(model),
      beforeCreateAttachment:targetPath=>{
        this.emailImportVaultTrigger?.suppressPathOnce?.(targetPath);
        this.ports.suppressArchiveImportPathOnce(targetPath);
      },
      routeCreatedAttachments:files=>this.ports.handleArchiveImportVaultFiles(files,{claimSuppressed:true}),
      onRollbackError:(error,targetPath)=>console.warn('[PDFium Gate] Automatic email attachment rollback failed',targetPath,error)
    });
  }

  async startEmailImportFromVaultFile(file) {
    const t=(key,params)=>this.i18n.t(key,params);
    if(this.settings?.emailDragDropAutomaticImport===false) {
      return {ok:true,skipped:true,reason:'automatic-import-disabled'};
    }

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
      chooseReview:async model=>{
        const duplicates=Array.isArray(model?.duplicates)?model.duplicates:[];
        if(duplicates.length) {
          return await new EmailImportReviewModal(this.app,this,{...model,retentionLocked:false}).openForDecision();
        }
        return {
          action:'import',
          retainSource:this.settings?.emailImportRetainSourceAfterSuccess===true,
          pdfPath:model.suggestedPdfPath
        };
      },
      services:{
        suggestedEmailPdfPath:(document,pathExists)=>EMAIL_IMPORT_RUNTIME.suggestedEmailPdfPathInFolder(document,folder,pathExists)
      },
      notifySuccess:false
    });

    let attachmentResult=null;
    if(result?.ok && !result.openedExisting && result.pdfPath && this.settings?.emailDragDropExtractAttachments!==false) {
      try {
        attachmentResult=await this.exportPlannedEmailAttachments(result.pdfPath,result.attachmentPlan);
        this.lastEmailAttachmentExportDiagnostic={
          at:new Date().toISOString(),
          parentPdfPath:result.pdfPath,
          result:deepClone(attachmentResult)
        };
        if(Array.isArray(attachmentResult?.failures) && attachmentResult.failures.length) {
          for(const failure of attachmentResult.failures) {
            console.warn('[PDFium Gate] Automatic email attachment item failed',result.pdfPath,failure);
          }
        }
        if(attachmentResult?.relationError) {
          console.warn('[PDFium Gate] Email attachments exported but native attachment links could not be written',result.pdfPath,attachmentResult.relationError);
        }
      } catch(error) {
        console.error('[PDFium Gate] Automatic email attachment export failed',result.pdfPath,error);
        attachmentResult={
          ok:false,
          failureCount:1,
          exportedCount:0,
          relationError:null,
          failures:[{filename:'',error:error instanceof Error?error.message:String(error)}]
        };
        this.lastEmailAttachmentExportDiagnostic={
          at:new Date().toISOString(),
          parentPdfPath:result.pdfPath,
          result:deepClone(attachmentResult)
        };
      }
    }

    const attachmentsRequired=this.settings?.emailDragDropExtractAttachments!==false;
    const attachmentPhaseOk=!attachmentsRequired || attachmentResult?.ok===true;
    const importTransactionComplete=Boolean(result?.ok && !result.openedExisting && result.pdfPath && attachmentPhaseOk);

    let stagingRemoved=false;
    if(importTransactionComplete && importedSourceBytes) {
      const current=this.obsidianVaultReadAdapter.getAbstractFileByPath(vaultPath);
      if(current) {
        try {
          const currentBytes=Buffer.from(await this.obsidianVaultReadAdapter.readBinary(current));
          if(currentBytes.equals(importedSourceBytes)) {
            await this.obsidianVaultWriteAdapter.deleteFile(current,true);
            stagingRemoved=true;
          } else {
            console.warn('[PDFium Gate] Email staging file changed during import; leaving it in place',vaultPath);
          }
        } catch(error) {
          console.warn('[PDFium Gate] Email import succeeded but staging-file cleanup failed',vaultPath,error);
        }
      }
    }

    if(result?.ok && result.openedExisting) {
      new Notice(t('emailImport.notice.dragDropExisting',{path:result.pdfPath}),6000);
    } else if(result?.ok && result.pdfPath) {
      const exported=Number(attachmentResult?.exportedCount || 0);
      const failed=Number(attachmentResult?.failureCount || 0) + (attachmentResult?.relationError ? 1 : 0);
      if(failed>0) {
        new Notice(t('emailImport.notice.dragDropImportedWithAttachmentErrors',{path:result.pdfPath,count:exported,failed}),9000);
      } else {
        new Notice(t('emailImport.notice.dragDropImported',{path:result.pdfPath,count:exported}),6000);
      }
    }

    return { ...result, attachmentResult, stagingRemoved };
  }
}

module.exports={EmailImportFeature};