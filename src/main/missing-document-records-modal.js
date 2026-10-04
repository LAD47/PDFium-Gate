class MissingDocumentRecordsModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onClosed = typeof options.onClosed === 'function' ? options.onClosed : null;
  }

  t(key, params) {
    return this.plugin?.i18n?.t?.(key, params) || key;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text:this.t('missingRecords.title') });

    const summary=this.plugin?.ports?.getMissingDocumentRecordSummary?.() || {count:0,items:[]};
    const count=Number(summary.count || 0);
    if(count<=0) {
      contentEl.createEl('p', { text:this.t('missingRecords.none') });
      new Setting(contentEl)
        .addButton(button=>button
          .setButtonText(this.t('missingRecords.close'))
          .setCta()
          .onClick(()=>this.close()));
      return;
    }

    contentEl.createEl('p', { text:this.t('missingRecords.count',{count}) });
    contentEl.createEl('p', { text:this.t('missingRecords.description') });
    contentEl.createEl('p', { text:this.t('missingRecords.deleteWarning',{count}) });

    new Setting(contentEl)
      .addButton(button=>button
        .setButtonText(this.t('missingRecords.close'))
        .onClick(()=>this.close()))
      .addButton(button=>button
        .setButtonText(this.t('missingRecords.deleteMetadata'))
        .setWarning()
        .onClick(async()=>{
          button.setDisabled(true);
          try {
            const result=await this.plugin.ports.deleteMissingDocumentRecords();
            if(!result?.ok) throw new Error(result?.error || this.t('missingRecords.deleteFailed'));
            new Notice(this.t('missingRecords.deleted',{count:result.deletedCount || 0}),8000);
            try { this.plugin.ports.refreshDocumentInfoViews('missing-record-metadata-delete'); } catch (_) {}
            this.close();
          } catch(error) {
            const message=error instanceof Error ? error.message : String(error);
            new Notice(this.t('missingRecords.deleteFailed',{error:message}),10000);
            button.setDisabled(false);
          }
        }));
  }

  onClose() {
    this.contentEl.empty();
    try { this.onClosed?.(); } catch (_) {}
  }
}
