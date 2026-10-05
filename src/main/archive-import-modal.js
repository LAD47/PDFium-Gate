class ArchiveImportUnsupportedFilesModal extends Modal {
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
    const t=(key,params)=>this.plugin?.i18n?.t?.(key,params) || key;
    const {contentEl}=this;
    contentEl.empty();

    const archives=Array.isArray(this.model.archives)?this.model.archives:[];
    const unsupportedCount=Number(this.model.unsupportedCount || 0);
    contentEl.createEl('h2',{text:t('archiveImport.unsupported.title')});
    contentEl.createEl('p',{text:t('archiveImport.unsupported.intro',{count:unsupportedCount})});
    contentEl.createEl('p',{text:t('archiveImport.unsupported.supportedInfo')});

    for(const archive of archives) {
      if(!archive?.unsupportedCount) continue;
      contentEl.createEl('h3',{text:t('archiveImport.unsupported.archive',{
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
        contentEl.createEl('p',{text:t('archiveImport.unsupported.more',{count:items.length-50})});
      }
    }

    const actions=new Setting(contentEl);
    actions.addButton(button=>button
      .setButtonText(t('archiveImport.unsupported.cancelArchives'))
      .onClick(()=>this.finish({action:'cancel-archives'})));
    actions.addButton(button=>button
      .setCta()
      .setButtonText(t('archiveImport.unsupported.skipUnsupported'))
      .onClick(()=>this.finish({action:'skip'})));
    actions.addButton(button=>button
      .setButtonText(t('archiveImport.unsupported.keepUnsupported'))
      .onClick(()=>this.finish({action:'keep'})));
  }
}
