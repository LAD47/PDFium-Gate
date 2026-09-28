'use strict';

function emailImportNormalizeVaultPath(value) {
  return String(value || '').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').trim();
}

function emailImportSafeFilenamePart(value, fallback='email') {
  let text=String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim();
  text=text.replace(/[. ]+$/g,'').trim();
  if(!text) text=fallback;
  if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(text)) text=`_${text}`;
  return text.slice(0,120).trim() || fallback;
}

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
      callback:()=>{ void this.ports.startEmailImport(); }
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
    const subject=emailImportSafeFilenamePart(document?.message?.subject,'email');
    const iso=String(document?.message?.dateTime?.iso || '');
    const date=/^\d{4}-\d{2}-\d{2}/.test(iso)?iso.slice(0,10):'';
    const base=emailImportSafeFilenamePart(`${date ? `${date} - ` : ''}${subject}`,'email');
    const folder='Email Imports';
    let index=1;
    while(index<10000) {
      const suffix=index===1?'':` (${index})`;
      const candidate=`${folder}/${base}${suffix}.pdf`;
      if(!this.obsidianVaultReadAdapter.getAbstractFileByPath(candidate)) return candidate;
      index++;
    }
    throw new Error('Could not allocate a unique Email Import PDF path.');
  }

  emailImportValidateTargetPath(value) {
    const target=emailImportNormalizeVaultPath(value);
    if(!target || !/\.pdf$/i.test(target)) return {ok:false,error:'Target must be a vault-relative .pdf path.'};
    const parts=target.split('/');
    if(parts.some(part=>!part || part==='.' || part==='..')) return {ok:false,error:'Target path contains an unsafe segment.'};
    const lower=target.toLowerCase();
    if(lower==='.pdf-metadata' || lower.startsWith('.pdf-metadata/') || lower==='file metadata' || lower.startsWith('file metadata/')) {
      return {ok:false,error:'Target PDF cannot be stored in plugin metadata areas.'};
    }
    if(this.obsidianVaultReadAdapter.getAbstractFileByPath(target)) return {ok:false,error:'Target path already exists.'};
    return {ok:true,path:target};
  }

  async ensureEmailImportTargetFolders(pdfPath) {
    const parts=emailImportNormalizeVaultPath(pdfPath).split('/').slice(0,-1);
    let current='';
    for(const part of parts) {
      current=current ? `${current}/${part}` : part;
      await this.obsidianVaultWriteAdapter.ensureFolder(current);
    }
  }

  async openEmailImportPdfPath(pdfPath) {
    const file=this.obsidianVaultReadAdapter.getAbstractFileByPath(emailImportNormalizeVaultPath(pdfPath));
    if(!file || String(file.extension || '').toLowerCase()!=='pdf') throw new Error('Imported PDF could not be resolved in the vault.');
    const target=this.pdfLeafAdapter?.acquireOpenTarget?.(true);
    if(!target?.ok || !target.leaf) throw new Error(target?.error || 'No WorkspaceLeaf is available for the imported PDF.');
    await target.leaf.openFile(file);
    return true;
  }

  async startEmailImport() {
    const t=(key,params)=>this.i18n.t(key,params);
    try {
      const transport=this.mainProcessTransport;
      if(!transport?.getCapabilities?.().loaded) {
        new Notice(t('emailImport.notice.bridgeUnavailable'),8000);
        return {ok:false,reason:'main-bridge-unavailable'};
      }

      const picked=await transport.chooseEmailImportSource();
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
        findBySourceSha256:sha=>this.ports.findEmailImportDuplicatesBySha256(sha)
      });
      const originalFilename=path.basename(sourcePath);
      const document=format==='eml'
        ? await EMAIL_IMPORT_RUNTIME.parseEml({sourceBytes,originalFilename})
        : await EMAIL_IMPORT_RUNTIME.parseMsg({sourceBytes,originalFilename});

      const suggestedPdfPath=this.ports.emailImportSuggestedPdfPath(document);
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
          await this.ports.openEmailImportPdfPath(decision.match?.pdfPath);
          new Notice(t('emailImport.notice.existingOpened'),5000);
          return {ok:true,openedExisting:true,pdfPath:decision.match?.pdfPath};
        } catch(error) {
          new Notice(t('emailImport.notice.existingOpenFailed',{error:error instanceof Error?error.message:String(error)}),9000);
          return {ok:false,reason:'existing-open-failed'};
        }
      }

      const target=this.ports.emailImportValidateTargetPath(decision.pdfPath);
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

        const sourceOpenUri=retainedDocument.source.retained===true
          ? EMAIL_IMPORT_RUNTIME.buildObsidianRetainedSourceUri({
              vault:this.app.vault?.getName?.() || path.basename(vaultRootPath),
              retainedPath:retainedDocument.source.retainedPath
            })
          : null;

        const pdfBytes=await EMAIL_IMPORT_RUNTIME.generateEmailPdf({
          document:retainedDocument,
          printHtmlToPdf:args=>transport.printControlledEmailHtmlToPdf(args),
          renderOptions:{sourceOpenUri}
        });

        await this.ports.ensureEmailImportTargetFolders(target.path);
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

      try { await this.ports.openEmailImportPdfPath(target.path); }
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
