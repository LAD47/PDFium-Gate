'use strict';

function emailImportAddressText(addresses) {
  const list=Array.isArray(addresses)?addresses:[];
  return list.map(entry=>{
    const name=String(entry?.name || '').trim();
    const address=String(entry?.address || '').trim();
    if(name && address) return `${name} <${address}>`;
    return name || address;
  }).filter(Boolean).join(', ');
}

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

  emailImportSuggestedPdfPath(document) {
    return EMAIL_IMPORT_RUNTIME.suggestedEmailPdfPath(
      document,
      candidate=>Boolean(this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate))
    );
  }

  emailImportSuggestedAttachmentPdfPath(parentPdfPath, attachment) {
    return EMAIL_IMPORT_RUNTIME.suggestedAttachmentPdfPath(
      parentPdfPath,
      attachment,
      candidate=>Boolean(this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate))
    );
  }

  emailImportValidateTargetPath(value) {
    return EMAIL_IMPORT_RUNTIME.validateTargetPdfPath(
      value,
      candidate=>Boolean(this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate))
    );
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

  emailImportSourceDescriptorFromRecord(values) {
    return EMAIL_IMPORT_RUNTIME.sourceDescriptorFromEmailImportRecord(values);
  }

  async startEmailPdfAttachmentImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    try {
      const parentPdfPath=this.emailImportActivePdfPath();
      if(!parentPdfPath) {
        new Notice(t('emailImport.notice.openEmailPdfFirst'),8000);
        return {ok:false,reason:'no-active-pdf'};
      }

      await this.ports.ensureDocumentRecordIndexReady();
      const parentState=this.ports.getDocumentMetadataRecordState(parentPdfPath);
      if(!parentState?.ready || !parentState?.ok || !parentState?.registered || !parentState?.values?.email_import_source_sha256) {
        new Notice(t('emailImport.notice.notImportedEmailPdf'),8000);
        return {ok:false,reason:'not-email-import'};
      }

      const source=this.emailImportSourceDescriptorFromRecord(parentState.values);
      if(source.retained!==true || !source.retainedPath) {
        new Notice(t('emailImport.notice.sourceNotRetained'),9000);
        return {ok:false,reason:'source-not-retained'};
      }

      const vaultRootPath=this.obsidianVaultReadAdapter.getBasePath();
      const loaded=await EMAIL_IMPORT_RUNTIME.loadCanonicalEmailFromRetainedRecord({
        values:parentState.values,
        vaultRootPath
      });
      const document=loaded.document;

      const analysis=EMAIL_IMPORT_RUNTIME.analyzeEmailAttachments(document);
      const pdfItems=(analysis.pdfCandidates || []).filter(item=>item?.extractable===true && Array.isArray(item.pdfEvidence) && item.pdfEvidence.includes('payload'));
      if(!pdfItems.length) {
        new Notice(t('emailImport.notice.noImportablePdfAttachments'),8000);
        return {ok:true,reason:'no-pdf-attachments'};
      }

      const modalItems=pdfItems.map(item=>({
        ...item,
        suggestedPdfPath:this.emailImportSuggestedAttachmentPdfPath(parentPdfPath,item.attachment)
      }));
      const decision=await new EmailPdfAttachmentImportModal(this.app,this,{parentPdfPath,items:modalItems}).openForDecision();
      if(!decision || decision.action==='cancel') return {ok:true,canceled:true};
      const selected=modalItems[Number(decision.index)];
      if(!selected?.attachment) throw new Error('Selected PDF attachment could not be resolved.');

      const target=this.emailImportValidateTargetPath(decision.pdfPath);
      if(!target.ok) {
        new Notice(t('emailImport.notice.invalidTarget',{error:target.error}),9000);
        return {ok:false,reason:'invalid-target'};
      }

      const verified=EMAIL_IMPORT_RUNTIME.verifiedPdfAttachmentBytes(selected.attachment);
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) throw new Error('Metadata schema is unavailable.');
      const existingTargetState=this.ports.getDocumentMetadataRecordState(target.path);
      if(existingTargetState?.registered) throw new Error('Target PDF path is already registered in Document Metadata.');
      if(existingTargetState?.ok===false) throw new Error(existingTargetState.error || existingTargetState.reason || 'Target metadata state is unsafe.');

      const provenance=EMAIL_IMPORT_RUNTIME.buildEmailAttachmentImportRecordValues({
        schema,
        parentRecordId:parentState.id,
        sourceSha256:source.sha256,
        attachment:{...selected.attachment,sha256:verified.sha256}
      });

      let pdfFile=null;
      try {
        await this.ensureEmailImportTargetFolders(target.path);
        pdfFile=await this.obsidianVaultWriteAdapter.createBinary(target.path,emailImportArrayBuffer(verified.bytes));
        const saved=await this.ports.saveDocumentMetadataRecordValues(target.path,provenance.values);
        if(!saved?.ok) throw new Error(saved?.error || 'Attachment document metadata registration failed.');
      } catch(error) {
        if(pdfFile) {
          try { await this.obsidianVaultWriteAdapter.deleteFile(pdfFile,true); }
          catch(rollbackError) { console.warn('[PDFium Gate] Email attachment PDF rollback failed',rollbackError); }
        }
        throw error;
      }

      try { await this.openEmailImportPdfPath(target.path); }
      catch(error) {
        console.warn('[PDFium Gate] Email attachment import succeeded but opening the PDF failed',error);
        new Notice(t('emailImport.notice.attachmentOpenFailed',{path:target.path}),8000);
      }
      new Notice(t('emailImport.notice.attachmentImported',{path:target.path}),7000);
      return {ok:true,pdfPath:target.path,parentPdfPath,attachmentSha256:verified.sha256};
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

      const picked=await transport.chooseEmailImportSource({
        title:t('emailImport.modal.title'),
        emailFilterName:t('commands.importEmail')
      });
      if(picked?.canceled || !picked?.filePath) return {ok:true,canceled:true};
      const sourcePath=String(picked.filePath);
      const extension=path.extname(sourcePath).toLowerCase();
      const format=extension==='.eml'?'eml':extension==='.msg'?'msg':null;
      if(!format) {
        new Notice(t('emailImport.notice.unsupportedSource'),8000);
        return {ok:false,reason:'unsupported-source'};
      }

      const sourceBytes=Buffer.from(nodeFsModule.readFileSync(sourcePath));
      const duplicateFacts=await EMAIL_IMPORT_RUNTIME.detectExactSourceDuplicate({
        sourceBytes,
        findBySourceSha256:sha=>this.findEmailImportDuplicatesBySha256(sha)
      });
      const originalFilename=path.basename(sourcePath);
      const document=format==='eml'
        ? await EMAIL_IMPORT_RUNTIME.parseEml({sourceBytes,originalFilename})
        : await EMAIL_IMPORT_RUNTIME.parseMsg({sourceBytes,originalFilename});

      const suggestedPdfPath=this.emailImportSuggestedPdfPath(document);
      const decision=await new EmailImportReviewModal(this.app,this,{
        suggestedPdfPath,
        duplicates:duplicateFacts.matches,
        summary:{
          sourceFilename:originalFilename,
          subject:String(document?.message?.subject || ''),
          sender:emailImportAddressText(document?.message?.from),
          date:String(document?.message?.dateTime?.raw || document?.message?.dateTime?.iso || '')
        }
      }).openForDecision();

      if(!decision || decision.action==='cancel') return {ok:true,canceled:true};
      if(decision.action==='open-existing') {
        try {
          await this.openEmailImportPdfPath(decision.match?.pdfPath);
          new Notice(t('emailImport.notice.existingOpened'),5000);
          return {ok:true,openedExisting:true,pdfPath:decision.match?.pdfPath};
        } catch(error) {
          new Notice(t('emailImport.notice.existingOpenFailed',{error:error instanceof Error?error.message:String(error)}),9000);
          return {ok:false,reason:'existing-open-failed'};
        }
      }

      const target=this.emailImportValidateTargetPath(decision.pdfPath);
      if(!target.ok) {
        new Notice(t('emailImport.notice.invalidTarget',{error:target.error}),9000);
        return {ok:false,reason:'invalid-target'};
      }

      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) throw new Error('Metadata schema is unavailable.');
      await this.ports.ensureDocumentRecordIndexReady();
      const existingTargetState=this.ports.getDocumentMetadataRecordState(target.path);
      if(existingTargetState?.registered) throw new Error('Target PDF path is already registered in Document Metadata.');
      if(existingTargetState?.ok===false) throw new Error(existingTargetState.error || existingTargetState.reason || 'Target metadata state is unsafe.');

      const vaultRootPath=this.obsidianVaultReadAdapter.getBasePath();
      let retained=null;
      let pdfFile=null;
      try {
        retained=await EMAIL_IMPORT_RUNTIME.retainOriginalSource({
          document,
          sourceBytes,
          vaultRootPath,
          enabled:decision.retainSource===true
        });
        const retainedDocument=retained.document;
        const registration=EMAIL_IMPORT_RUNTIME.buildEmailImportRegistrationPlan({
          document:retainedDocument,
          schema,
          documentRecordState:existingTargetState
        });
        if(!registration.ok) throw new Error(registration.error || registration.reason || 'Email metadata projection failed.');

        const pdfBytes=await EMAIL_IMPORT_RUNTIME.generateEmailPdf({
          document:retainedDocument,
          printHtmlToPdf:args=>transport.printControlledEmailHtmlToPdf(args)
        });

        await this.ensureEmailImportTargetFolders(target.path);
        pdfFile=await this.obsidianVaultWriteAdapter.createBinary(target.path,emailImportArrayBuffer(pdfBytes));
        const saved=await this.ports.saveDocumentMetadataRecordValues(target.path,registration.values);
        if(!saved?.ok) throw new Error(saved?.error || 'Document metadata registration failed.');
      } catch(error) {
        if(pdfFile) {
          try { await this.obsidianVaultWriteAdapter.deleteFile(pdfFile,true); }
          catch(rollbackError) { console.warn('[PDFium Gate] Email Import PDF rollback failed',rollbackError); }
        }
        if(retained?.created===true) {
          try {
            await EMAIL_IMPORT_RUNTIME.removeRetainedSourceIfExact({document:retained.document,sourceBytes,vaultRootPath});
          } catch(rollbackError) {
            console.warn('[PDFium Gate] Email Import retained-source rollback failed',rollbackError);
          }
        }
        throw error;
      }

      try { await this.openEmailImportPdfPath(target.path); }
      catch(error) {
        console.warn('[PDFium Gate] Email Import succeeded but opening the generated PDF failed',error);
        new Notice(t('emailImport.notice.openFailed',{path:target.path}),8000);
      }
      new Notice(t('emailImport.notice.imported',{path:target.path}),7000);
      return {ok:true,pdfPath:target.path,duplicate:duplicateFacts.exactDuplicate};
    } catch(error) {
      console.error('[PDFium Gate] Email Import failed',error);
      new Notice(t('emailImport.notice.importFailed',{error:error instanceof Error?error.message:String(error)}),10000);
      return {ok:false,reason:'import-failed',error:error instanceof Error?error.message:String(error)};
    }
  }
}

module.exports={EmailImportFeature};