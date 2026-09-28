function emailImportT(plugin,key,params){ return plugin?.i18n?.t?.(key,params) || key; }

class EmailImportReviewModal extends Modal {
  constructor(app, plugin, model) {
    super(app);
    this.plugin=plugin;
    this.model=model || {};
    this.targetPath=String(this.model.suggestedPdfPath || '');
    this.retentionChoice='';
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
    contentEl.createEl('h2',{text:t('emailImport.modal.title')});
    contentEl.createEl('p',{text:t('emailImport.modal.intro')});

    const summary=this.model.summary || {};
    new Setting(contentEl).setName(t('emailImport.modal.source')).setDesc(String(summary.sourceFilename || ''));
    new Setting(contentEl).setName(t('emailImport.modal.subject')).setDesc(String(summary.subject || ''));
    new Setting(contentEl).setName(t('emailImport.modal.sender')).setDesc(String(summary.sender || ''));
    new Setting(contentEl).setName(t('emailImport.modal.date')).setDesc(String(summary.date || ''));

    const duplicates=Array.isArray(this.model.duplicates)?this.model.duplicates:[];
    if(duplicates.length) {
      const warning=contentEl.createDiv({cls:'pdfium-email-import-duplicate-warning'});
      warning.createEl('strong',{text:t('emailImport.modal.duplicateWarning',{count:duplicates.length})});
      const list=warning.createEl('ul');
      for(const match of duplicates.slice(0,10)) list.createEl('li',{text:String(match.pdfPath || match.recordPath || match.id || '')});
    } else {
      contentEl.createEl('p',{text:t('emailImport.modal.noDuplicates')});
    }

    new Setting(contentEl)
      .setName(t('emailImport.modal.targetPath'))
      .setDesc(t('emailImport.modal.targetPathDesc'))
      .addText(text=>text
        .setValue(this.targetPath)
        .onChange(value=>{ this.targetPath=String(value || ''); }));

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

    const actions=new Setting(contentEl);
    actions.addButton(button=>button
      .setButtonText(t('emailImport.modal.cancel'))
      .onClick(()=>this.finish({action:'cancel'})));

    if(duplicates.length===1 && duplicates[0]?.pdfPath) {
      actions.addButton(button=>button
        .setButtonText(t('emailImport.modal.openExisting'))
        .onClick(()=>this.finish({action:'open-existing',match:duplicates[0]})));
    }

    actions.addButton(button=>{
      this.importButton=button;
      button
        .setCta()
        .setButtonText(t('emailImport.modal.import'))
        .setDisabled(true)
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
