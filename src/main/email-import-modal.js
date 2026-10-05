function emailImportT(plugin,key,params){ return plugin?.i18n?.t?.(key,params) || key; }

class EmailImportReviewModal extends Modal {
  constructor(app, plugin, model) {
    super(app);
    this.plugin=plugin;
    this.model=model || {};
    this.targetPath=String(this.model.suggestedPdfPath || '');
    this.retentionLocked=this.model.retentionLocked===true;
    this.retentionChoice=this.retentionLocked?'keep':'';
    this.selectedDuplicateIndex=0;
    this.settled=false;
    this.resolveDecision=null;
    this.importButton=null;
  }

  openForDecision() {
    return new Promise(resolve=>{
      this.resolveDecision=resolve;
      this.open();
    });
  }

  finish(decision) {
    if(this.settled) return;
    this.settled=true;
    const resolve=this.resolveDecision;
    this.resolveDecision=null;
    try { this.close(); } catch(_) {}
    if(typeof resolve==='function') resolve(decision);
  }

  onOpen() { this.render(); }

  onClose() {
    this.contentEl.empty();
    if(!this.settled) {
      this.settled=true;
      const resolve=this.resolveDecision;
      this.resolveDecision=null;
      if(typeof resolve==='function') resolve({action:'cancel'});
    }
  }

  updateImportEnabled() {
    try { this.importButton?.setDisabled?.(!this.retentionChoice); } catch(_) {}
  }

  render() {
    const t=(key,params)=>emailImportT(this.plugin,key,params);
    const {contentEl}=this;
    contentEl.empty();

    const duplicates=Array.isArray(this.model.duplicates)?this.model.duplicates:[];
    const openableDuplicates=duplicates.filter(match=>match?.pdfPath);
    if(this.selectedDuplicateIndex<0 || this.selectedDuplicateIndex>=openableDuplicates.length) this.selectedDuplicateIndex=0;
    const duplicateDecision=this.retentionLocked && duplicates.length>0;

    contentEl.createEl('h2',{text:duplicateDecision
      ? t('emailImport.modal.duplicateWarning',{count:duplicates.length})
      : t('emailImport.modal.title')});
    contentEl.createEl('p',{text:t('emailImport.modal.intro')});

    const summary=this.model.summary || {};
    new Setting(contentEl).setName(t('emailImport.modal.source')).setDesc(String(summary.sourceFilename || ''));
    new Setting(contentEl).setName(t('emailImport.modal.subject')).setDesc(String(summary.subject || ''));
    new Setting(contentEl).setName(t('emailImport.modal.sender')).setDesc(String(summary.sender || ''));
    new Setting(contentEl).setName(t('emailImport.modal.date')).setDesc(String(summary.date || ''));

    if(duplicates.length) {
      const warning=contentEl.createDiv({cls:'pdfium-email-import-duplicate-warning'});
      if(!duplicateDecision) warning.createEl('strong',{text:t('emailImport.modal.duplicateWarning',{count:duplicates.length})});
      const list=warning.createEl('ul');
      for(const match of duplicates.slice(0,10)) list.createEl('li',{text:String(match.pdfPath || match.recordPath || match.id || '')});

      if(openableDuplicates.length>1) {
        new Setting(contentEl)
          .setName(t('emailImport.modal.openExisting'))
          .addDropdown(dropdown=>{
            openableDuplicates.forEach((match,index)=>dropdown.addOption(String(index),String(match.pdfPath)));
            dropdown.setValue(String(this.selectedDuplicateIndex));
            dropdown.onChange(value=>{
              const index=Number(value);
              if(Number.isInteger(index) && index>=0 && index<openableDuplicates.length) this.selectedDuplicateIndex=index;
            });
          });
      }
    } else {
      contentEl.createEl('p',{text:t('emailImport.modal.noDuplicates')});
    }

    new Setting(contentEl)
      .setName(t('emailImport.modal.targetPath'))
      .setDesc(t('emailImport.modal.targetPathDesc'))
      .addText(text=>text
        .setValue(this.targetPath)
        .onChange(value=>{ this.targetPath=String(value || ''); }));

    if(!this.retentionLocked) {
      new Setting(contentEl)
        .setName(t('emailImport.modal.retention'))
        .setDesc(t('emailImport.modal.retentionDesc'))
        .addDropdown(dropdown=>dropdown
          .addOption('',t('emailImport.modal.retentionChoose'))
          .addOption('keep',t('emailImport.modal.retentionKeep'))
          .addOption('discard',t('emailImport.modal.retentionDiscard'))
          .setValue(this.retentionChoice)
          .onChange(value=>{
            this.retentionChoice=String(value || '');
            this.updateImportEnabled();
          }));
    }

    const actions=new Setting(contentEl);
    actions.addButton(button=>button
      .setButtonText(t('emailImport.modal.cancel'))
      .onClick(()=>this.finish({action:'cancel'})));

    if(openableDuplicates.length) {
      actions.addButton(button=>button
        .setButtonText(t('emailImport.modal.openExisting'))
        .onClick(()=>{
          const match=openableDuplicates[this.selectedDuplicateIndex] || null;
          if(match?.pdfPath) this.finish({action:'open-existing',match});
        }));
    }

    actions.addButton(button=>{
      this.importButton=button;
      button
        .setCta()
        .setButtonText(t('emailImport.modal.import'))
        .setDisabled(!this.retentionChoice)
        .onClick(()=>{
          if(!this.retentionChoice) return;
          this.finish({
            action:'import',
            retainSource:this.retentionChoice==='keep',
            pdfPath:this.targetPath
          });
        });
    });
    this.updateImportEnabled();
  }
}

class EmailPdfAttachmentImportModal extends Modal {
  constructor(app, plugin, model) {
    super(app);
    this.plugin=plugin;
    this.model=model || {};
    this.items=Array.isArray(this.model.items)?this.model.items:[];
    this.selectedIndex=0;
    this.targetPath=String(this.items[0]?.suggestedPdfPath || '');
    this.targetInput=null;
    this.settled=false;
    this.resolveDecision=null;
  }

  openForDecision() {
    return new Promise(resolve=>{
      this.resolveDecision=resolve;
      this.open();
    });
  }

  finish(decision) {
    if(this.settled) return;
    this.settled=true;
    const resolve=this.resolveDecision;
    this.resolveDecision=null;
    try { this.close(); } catch(_) {}
    if(typeof resolve==='function') resolve(decision);
  }

  onOpen() { this.render(); }

  onClose() {
    this.contentEl.empty();
    if(!this.settled) {
      this.settled=true;
      const resolve=this.resolveDecision;
      this.resolveDecision=null;
      if(typeof resolve==='function') resolve({action:'cancel'});
    }
  }

  render() {
    const t=(key,params)=>emailImportT(this.plugin,key,params);
    const {contentEl}=this;
    contentEl.empty();
    contentEl.createEl('h2',{text:t('emailImport.attachmentModal.title')});
    contentEl.createEl('p',{text:t('emailImport.attachmentModal.intro')});
    new Setting(contentEl)
      .setName(t('emailImport.attachmentModal.parent'))
      .setDesc(String(this.model.parentPdfPath || ''));

    new Setting(contentEl)
      .setName(t('emailImport.attachmentModal.select'))
      .addDropdown(dropdown=>{
        this.items.forEach((item,index)=>{
          const attachment=item?.attachment || {};
          const name=String(attachment.filename || attachment.id || `#${index+1}`);
          const size=Number.isInteger(attachment.size)?` · ${attachment.size} B`:'';
          dropdown.addOption(String(index),`${name}${size}`);
        });
        dropdown.setValue(String(this.selectedIndex));
        dropdown.onChange(value=>{
          const index=Number(value);
          if(!Number.isInteger(index) || index<0 || index>=this.items.length) return;
          this.selectedIndex=index;
          this.targetPath=String(this.items[index]?.suggestedPdfPath || '');
          this.targetInput?.setValue?.(this.targetPath);
        });
      });

    new Setting(contentEl)
      .setName(t('emailImport.attachmentModal.targetPath'))
      .setDesc(t('emailImport.attachmentModal.targetPathDesc'))
      .addText(text=>{
        this.targetInput=text;
        text.setValue(this.targetPath).onChange(value=>{ this.targetPath=String(value || ''); });
      });

    const actions=new Setting(contentEl);
    actions.addButton(button=>button
      .setButtonText(t('emailImport.attachmentModal.cancel'))
      .onClick(()=>this.finish({action:'cancel'})));
    actions.addButton(button=>button
      .setCta()
      .setButtonText(t('emailImport.attachmentModal.import'))
      .onClick(()=>this.finish({action:'import',index:this.selectedIndex,pdfPath:this.targetPath})));
  }
}

class EmailZipUnsupportedFilesModal extends Modal {
  constructor(app, plugin, model) {
    super(app);
    this.plugin=plugin;
    this.model=model || {};
    this.settled=false;
    this.resolveDecision=null;
  }

  openForDecision() {
    return new Promise(resolve=>{
      this.resolveDecision=resolve;
      this.open();
    });
  }

  finish(decision) {
    if(this.settled) return;
    this.settled=true;
    const resolve=this.resolveDecision;
    this.resolveDecision=null;
    try { this.close(); } catch(_) {}
    if(typeof resolve==='function') resolve(decision);
  }

  onOpen() { this.render(); }

  onClose() {
    this.contentEl.empty();
    if(!this.settled) {
      this.settled=true;
      const resolve=this.resolveDecision;
      this.resolveDecision=null;
      if(typeof resolve==='function') resolve({action:'cancel-archives'});
    }
  }

  render() {
    const t=(key,params)=>emailImportT(this.plugin,key,params);
    const {contentEl}=this;
    contentEl.empty();

    const archives=Array.isArray(this.model.archives)?this.model.archives:[];
    const unsupportedCount=Number(this.model.unsupportedCount || 0);
    contentEl.createEl('h2',{text:t('emailImport.zipModal.title')});
    contentEl.createEl('p',{text:t('emailImport.zipModal.intro',{count:unsupportedCount})});
    contentEl.createEl('p',{text:t('emailImport.zipModal.supportedInfo')});

    for(const archive of archives) {
      if(!archive?.unsupportedCount) continue;
      contentEl.createEl('h3',{text:t('emailImport.zipModal.archive',{
        filename:String(archive.filename || 'archive.zip'),
        count:Number(archive.unsupportedCount || 0)
      })});
      const list=contentEl.createEl('ul');
      const items=Array.isArray(archive.unsupported)?archive.unsupported:[];
      for(const item of items.slice(0,50)) {
        const size=Number.isFinite(Number(item?.size)) ? ` · ${Number(item.size)} B` : '';
        list.createEl('li',{text:`${String(item?.path || '')}${size}`});
      }
      if(items.length>50) {
        contentEl.createEl('p',{text:t('emailImport.zipModal.more',{count:items.length-50})});
      }
    }

    const actions=new Setting(contentEl);
    actions.addButton(button=>button
      .setButtonText(t('emailImport.zipModal.cancelArchives'))
      .onClick(()=>this.finish({action:'cancel-archives'})));
    actions.addButton(button=>button
      .setCta()
      .setButtonText(t('emailImport.zipModal.skipUnsupported'))
      .onClick(()=>this.finish({action:'skip'})));
    actions.addButton(button=>button
      .setButtonText(t('emailImport.zipModal.keepUnsupported'))
      .onClick(()=>this.finish({action:'keep'})));
  }
}

