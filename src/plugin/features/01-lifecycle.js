'use strict';

class LifecycleFeature {
async onload() {
    this.obsidianPluginRegistrationAdapter = createObsidianPluginRegistrationAdapter({ plugin:this });
    this.obsidianPluginDataAdapter = createObsidianPluginDataAdapter({ plugin:this });
    this.nodeFilesystemAdapter = createNodeFilesystemAdapter({ fsModule:nodeFsModule });
    const savedSettings = await this.obsidianPluginDataAdapter.loadData().catch(() => null);
    const persistedSettings = savedSettings && typeof savedSettings === 'object' ? savedSettings : {};
    this.settings = {
      diagnosticsEnabled:persistedSettings.diagnosticsEnabled === true,
      uiLanguage:pdfiumNormalizeLanguageSetting(persistedSettings.uiLanguage || 'auto'),
      regionalDateFormat:String(persistedSettings.regionalDateFormat || 'DD.MM.YYYY'),
      regionalTimeFormat:String(persistedSettings.regionalTimeFormat || 'HH:mm'),
      regionalDecimalSeparator:String(persistedSettings.regionalDecimalSeparator || ',') === '.' ? '.' : ',',
      includeHeaderFooterText:persistedSettings.includeHeaderFooterText === true,
      backupOriginalPdf:persistedSettings.backupOriginalPdf !== false,
      hideDocumentMetadataFilesInExplorer:persistedSettings.hideDocumentMetadataFilesInExplorer !== false,
      rememberDocumentRegisterFilters:persistedSettings.rememberDocumentRegisterFilters === true,
      autoRegisterNewPdfs:persistedSettings.autoRegisterNewPdfs !== false,
      emailDragDropAutomaticImport:persistedSettings.emailDragDropAutomaticImport !== false,
      emailDragDropExtractAttachments:persistedSettings.emailDragDropExtractAttachments !== false
    };
    this.i18n = createPdfiumI18n({
      requestedLanguage:this.settings.uiLanguage,
      obsidianApi:obsidianModule,
      windowObject:typeof window!=='undefined'?window:null,
      translations:PDFIUM_I18N_TRANSLATIONS
    });
    // All mutable operational state is grouped by owner; adapters remain explicit dependencies.
    this.state = createPluginState();
    this.obsidianPluginRegistrationAdapter.addSettingTab(new PdfiumGateSettingsTab(this.app, this));
    this.ports.installAnnotatorMessageListener();

    this.ports.configureRendererBridgeHandlers();
    // PdfiumGateView registers any pop-out window when it is created or moved.
    this.ports.registerRendererBridgeWindow(window);
    this.ports.applyDocumentRecordVisibility();

    this.mainProcessTransport = null;
    this.ports.closePdfContextOverlay();

    this.pdfLeafAdapter = createPdfLeafAdapter({ workspace:this.app.workspace, viewType:VIEW_TYPE });
    this.obsidianCommandExecutionAdapter = createObsidianCommandExecutionAdapter({ commands:this.app.commands });
    this.obsidianOpenLinkHookAdapter = createObsidianOpenLinkHookAdapter({ workspace:this.app.workspace });
    this.obsidianLinkResolutionAdapter = createObsidianLinkResolutionAdapter({ metadataCache:this.app.metadataCache });
    this.obsidianMarkdownLinkAdapter = createObsidianMarkdownLinkAdapter({ fileManager:this.app.fileManager });
    this.obsidianViewRegistryAdapter = createObsidianViewRegistryAdapter({
      viewRegistry:this.app.viewRegistry,
      registerPluginExtensions:(extensions, viewType) => this.obsidianPluginRegistrationAdapter.registerExtensions(extensions, viewType)
    });
    this.obsidianWorkspaceLifecycleAdapter = createObsidianWorkspaceLifecycleAdapter({ workspace:this.app.workspace, windowObject:window });
    this.obsidianVaultLifecycleAdapter = createObsidianVaultLifecycleAdapter({ vault:this.app.vault });
    this.obsidianMetadataCacheAdapter = createObsidianMetadataCacheAdapter({ metadataCache:this.app.metadataCache });
    this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianMetadataCacheAdapter.onResolved(() => {
      this.ports.markDocumentRecordMetadataResolved();
      this.state.lifecycle.missingReconciliationMetadataResolved=true;
      this.scheduleOfflineMissingReconciliation();
    }));
    this.obsidianFrontmatterAdapter = createObsidianFrontmatterAdapter({ fileManager:this.app.fileManager });
    this.obsidianVaultReadAdapter = createObsidianVaultReadAdapter({ vault:this.app.vault, TFolderClass:TFolder });
    this.obsidianPluginPathsAdapter = createObsidianPluginPathsAdapter({
      vault:this.app.vault,
      manifest:this.manifest,
      pathModule:path,
      vaultReadAdapter:this.obsidianVaultReadAdapter
    });
    this.obsidianVaultWriteAdapter = createObsidianVaultWriteAdapter({ vault:this.app.vault });
    this.obsidianAdapterFileStore = createObsidianAdapterFileStore({ adapter:this.app.vault?.adapter });
    this.ports.registerMetadataBenchmarkCommands();
    await this.ports.ensureRootCategoryConfigInitialized();
    await this.ports.initializeMetadataSchema();
    await this.ports.relocalizeFactoryDefaultsForUiLanguage();
    this.ports.registerPdfDocumentRegisterBasesView();
    this.electronRemoteRequireAdapter = createElectronRemoteRequireAdapter({ electronModule:rendererElectronModule });
    this.electronFocusDiagnosticsAdapter = createElectronFocusDiagnosticsAdapter({ mainModuleLoader:this.electronRemoteRequireAdapter });
    this.mainProcessTransport = createMainProcessTransport({ remoteRequireAdapter:this.electronRemoteRequireAdapter });
    this.ports.registerEmailImportCommand();
    if(typeof window!=='undefined') {
      this.obsidianPluginRegistrationAdapter.registerDomEvent(window,'focus',()=>{
        void this.ports.reconcileArchiveImportVaultFiles().catch(error=>
          console.warn('[PDFium Gate] Archive Import focus reconciliation failed',error)
        );
      });
    }

    this.obsidianPluginRegistrationAdapter.registerView(VIEW_TYPE, leaf => new PdfiumGateView(leaf, this));
    this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianWorkspaceLifecycleAdapter.onActiveLeafChange(leaf => {
      void this.ports.syncActivePdfIdentity('active-leaf-change', leaf);
      this.ports.handleDocumentInfoActiveLeafChange(leaf);
    }));

    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'full-page-go-to-page',
      name: this.i18n.t('commands.goToPage'),
      checkCallback: checking => {
        const view = this.ports.getActiveReader();
        if (!view || !view.file) return false;
        if (!checking) new GoToPageModal(this.app, page => view.renderFullPage(view.file, page)).open();
        return true;
      }
    });






    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'manage-metadata-fields',
      name: this.i18n.t('commands.manageMetadataFields'),
      callback: () => new MetadataSchemaManagerModal(this.app, this).open()
    });


    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'show-document-info',
      name: this.i18n.t('commands.showDocumentInfo'),
      checkCallback: checking => {
        const view = this.ports.getActiveReader();
        if (!view || !view.file) return false;
        if (!checking) this.ports.openDocumentInfoForView(view);
        return true;
      }
    });


    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'toggle-document-metadata-files',
      name: this.i18n.t('commands.toggleMetadataFiles'),
      callback: () => { void this.ports.toggleDocumentRecordVisibility(); }
    });

    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'review-missing-documents',
      name: this.i18n.t('commands.reviewMissingDocuments'),
      callback: () => { void this.openMissingDocumentRecordsDialog(true); }
    });




    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'create-category-config',
      name: this.i18n.t('commands.createCategoryConfig'),
      callback: () => {
        const file = this.ports.getCommandTargetPdfFile();
        new CategoryConfigBootstrapModal(this.app, this, file).open();
      }
    });

    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'edit-folder-category-config',
      name: this.i18n.t('commands.editFolderCategories'),
      callback: () => {
        const file = this.ports.getCommandTargetPdfFile();
        if (!file) { new Notice(this.i18n.t('commands.openPdfFirst',{version:PLUGIN_VERSION}), 8000); return; }
        this.ports.openCategoryEditor(file);
      }
    });

    this.obsidianPluginRegistrationAdapter.addCommand({
      id: 'show-effective-category-config',
      name: this.i18n.t('commands.showEffectiveCategoryConfig'),
      callback: () => {
        const file = this.ports.getCommandTargetPdfFile();
        if (!file) { new Notice(this.i18n.t('commands.openPdfFirst',{version:PLUGIN_VERSION}), 8000); return; }
        this.ports.openEffectiveCategoryConfig(file);
      }
    });

    this.ports.addDiagnosticCommand({
      id: 'toggle-diagnostics',
      name: this.i18n.t('commands.toggleDiagnostics'),
      callback: () => { void this.ports.toggleDiagnostics(); }
    });


    this.ports.addDiagnosticCommand({
      id: 'show-focus-retest-diagnostics',
      name: this.i18n.t('commands.showDiagnosticsNow'),
      callback: () => this.ports.openFocusRetestDiagnostic()
    });

    this.ports.addDiagnosticCommand({
      id: 'copy-last-selection-link-diagnostic',
      name: this.i18n.t('commands.copySelectionLinkDiagnostic'),
      callback: () => {
        const diagnostic = this.state.navigation.lastSelectionLinkDiagnostic;
        if (!diagnostic) {
          new Notice(this.i18n.t('lifecycle.selectionDiagnosticNone',{version:PLUGIN_VERSION}), 9000);
          return;
        }
        try {
          clipboardTextAdapter.writeText(JSON.stringify(diagnostic, null, 2));
          new Notice(this.i18n.t('lifecycle.selectionDiagnosticCopied',{version:PLUGIN_VERSION}), 4500);
        } catch (error) {
          new Notice(this.i18n.t('lifecycle.diagnosticCopyFailed',{version:PLUGIN_VERSION,error:error instanceof Error ? error.message : String(error)}), 9000);
        }
      }
    });

    this.ports.addDiagnosticCommand({
      id: 'copy-platform-capability-report',
      name: this.i18n.t('commands.copyPlatformCapabilityReport'),
      callback: () => { void this.ports.copyPlatformCapabilityReport(); }
    });

    this.ports.addDiagnosticCommand({
      id: 'copy-runtime-compatibility-status',
      name: this.i18n.t('commands.copyRuntimeCompatibilityStatus'),
      callback: () => this.ports.copyRuntimeCompatibilityStatus()
    });

    this.ports.addDiagnosticCommand({
      id: 'show-gate-status',
      name: this.i18n.t('commands.showGateStatus'),
      callback: () => this.showStatus()
    });

    this.ports.installOpenLinkTextHook();

    this.ports.addDiagnosticCommand({
      id: 'show-last-link-intercept',
      name: this.i18n.t('commands.showLastMarkdownLink'),
      callback: () => {
        const info = this.state.navigation.lastInterceptedLink || this.i18n.t('lifecycle.lastInterceptNone');
        new Notice(`PDFium ${PLUGIN_VERSION} | ${info}`, 12000);
        console.log(`[PDFium Gate ${PLUGIN_VERSION}] last intercepted link:`, info);
      }
    });

    this.obsidianWorkspaceLifecycleAdapter.onLayoutReady(() => {
      this.installPdfOverride();
      this.ports.installFocusRetestDiagnostics();
      this.ports.installMainProcessUxBridge();
      const refreshDocumentInfoAfterRecordEvent=(operation,reason)=>{
        return Promise.resolve(operation).then(result=>{
          this.ports.refreshDocumentInfoViews(reason);
          return result;
        }).catch(error=>{
          console.warn(`[PDFium Gate ${PLUGIN_VERSION}] metadata record lifecycle event failed`,error);
          this.ports.refreshDocumentInfoViews(`${reason}-error`);
          return {ok:false,error:error instanceof Error?error.message:String(error)};
        });
      };
      this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianVaultLifecycleAdapter.onCreate(file => refreshDocumentInfoAfterRecordEvent(this.ports.handleDocumentRecordVaultCreate(file),'record-create')));
      this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianVaultLifecycleAdapter.onCreate(file => {
        void this.ports.handleArchiveImportVaultCreate(file);
      }));
      void this.ports.reconcileArchiveImportVaultFiles().catch(error=>
        console.warn('[PDFium Gate] Archive Import startup reconciliation failed',error)
      );
      this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianVaultLifecycleAdapter.onModify(file => refreshDocumentInfoAfterRecordEvent(this.ports.handleDocumentRecordVaultModify(file),'record-modify')));
      this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianVaultLifecycleAdapter.onRename((file, oldPath) => refreshDocumentInfoAfterRecordEvent(this.ports.handleDocumentRecordVaultRename(file, oldPath),'record-rename')));
      this.obsidianPluginRegistrationAdapter.registerEvent(this.obsidianVaultLifecycleAdapter.onDelete(file => {
        const tracked=refreshDocumentInfoAfterRecordEvent(this.ports.handleDocumentRecordVaultDelete(file),'record-delete');
        if(String(file?.extension || '').toLowerCase()==='pdf') {
          void tracked.then(result=>{
            if(result?.ok && result?.status==='missing') this.scheduleMissingDocumentRecordsDialog();
          });
        }
      }));
      this.ports.markDocumentRecordLayoutReady();
      this.state.lifecycle.missingReconciliationLayoutReady=true;
      this.scheduleOfflineMissingReconciliation();
      void this.ports.reconcileOpenPdfRuntimes('layout-ready');
      const active = this.pdfLeafAdapter?.getActiveLeaf?.();
      void this.ports.syncActivePdfIdentity('layout-ready', active?.ok ? active.leaf : null);
      this.ports.handleDocumentInfoActiveLeafChange(active?.ok ? active.leaf : null);
    });
  }

  scheduleOfflineMissingReconciliation() {
    if(this.state.lifecycle.missingReconciliationCompleted) return false;
    if(!this.state.lifecycle.missingReconciliationLayoutReady) return false;
    if(this.state.lifecycle.missingReconciliationIdleHandle) return false;
    const scheduler=this.obsidianWorkspaceLifecycleAdapter;
    if(!scheduler || typeof scheduler.scheduleIdle!=='function') {
      void this.runOfflineMissingReconciliation();
      return true;
    }
    this.state.lifecycle.missingReconciliationIdleHandle=scheduler.scheduleIdle(()=>{
      this.state.lifecycle.missingReconciliationIdleHandle=null;
      void this.runOfflineMissingReconciliation();
    });
    return true;
  }

  async runOfflineMissingReconciliation() {
    if(this.state.lifecycle.missingReconciliationCompleted) return {ok:true,ignored:true,reason:'already-completed'};
    this.state.lifecycle.missingReconciliationCompleted=true;
    try {
      const result=await this.ports.reconcileMissingDocumentRecords();
      this.ports.refreshDocumentInfoViews('offline-missing-reconciliation');
      if(result?.ok && Number(result.totalMissingCount || 0)>0) this.scheduleMissingDocumentRecordsDialog();
      return result;
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] offline missing-document reconciliation failed`,error);
      return {ok:false,error:message};
    }
  }

  scheduleMissingDocumentRecordsDialog() {
    const current=this.state.lifecycle.missingRecordsDialogTimer;
    if(current) {
      try { window.clearTimeout(current); } catch (_) {}
    }
    this.state.lifecycle.missingRecordsDialogTimer=window.setTimeout(()=>{
      this.state.lifecycle.missingRecordsDialogTimer=null;
      void this.openMissingDocumentRecordsDialog(false);
    },200);
    return true;
  }

  async openMissingDocumentRecordsDialog(notifyWhenEmpty=false) {
    try {
      await this.ports.ensureDocumentRecordIndexReady('missing-record-review');
      const summary=this.ports.getMissingDocumentRecordSummary();
      if(!summary?.count) {
        if(notifyWhenEmpty) new Notice(this.i18n.t('missingRecords.none'),5000);
        return {ok:true,opened:false,count:0};
      }
      if(this.state.lifecycle.missingRecordsDialogOpen) return {ok:true,opened:false,count:summary.count,alreadyOpen:true};
      this.state.lifecycle.missingRecordsDialogOpen=true;
      new MissingDocumentRecordsModal(this.app,this,{
        onClosed:()=>{ this.state.lifecycle.missingRecordsDialogOpen=false; }
      }).open();
      return {ok:true,opened:true,count:summary.count};
    } catch(error) {
      this.state.lifecycle.missingRecordsDialogOpen=false;
      const message=error instanceof Error?error.message:String(error);
      new Notice(this.i18n.t('missingRecords.openFailed',{error:message}),10000);
      return {ok:false,error:message};
    }
  }

  installPdfOverride() {
    const takeover = this.obsidianViewRegistryAdapter?.takeOverExtension?.(PDF_EXTENSION, VIEW_TYPE, 'pdf') || {
      ok:false, originalViewType:null, reason:'adapter-unavailable', error:'Obsidian view-registry adapter mangler'
    };
    if (!takeover.ok) {
      console.error('[PDFium Gate] Could not replace .pdf view:', takeover.error || takeover.reason);
      new Notice(this.i18n.t('lifecycle.takeoverUnavailable'));
      return;
    }
    this.state.lifecycle.originalPdfViewType = takeover.originalViewType || 'pdf';
    this.state.lifecycle.overrideInstalled = true;
    new Notice(this.i18n.t('lifecycle.active',{version:PLUGIN_VERSION}));
  }

  showStatus() {
    const view = this.ports.getActiveReader();
    let current = this.i18n.t('common.unknown');
    try {
      const resolved = this.obsidianViewRegistryAdapter?.getCurrentType?.(PDF_EXTENSION);
      if (resolved?.ok) current = resolved.viewType || this.i18n.t('lifecycle.none');
    } catch (_) {}
    new Notice(this.i18n.t('lifecycle.status',{version:PLUGIN_VERSION,view:current,mode:view?.mode || this.i18n.t('lifecycle.none'),http:this.state.http.port || this.i18n.t('lifecycle.off'),gate:this.state.lifecycle.overrideInstalled ? this.i18n.t('common.yes') : this.i18n.t('common.no'),diagnostics:this.settings?.diagnosticsEnabled ? this.i18n.t('lifecycle.on') : this.i18n.t('lifecycle.disabled')}), 10000);
  }

  async relocalizeFactoryDefaultsForUiLanguage() {
    const result={categories:null,metadata:null,errors:[]};
    try {
      result.categories=await this.ports.relocalizeRootFactoryCategoryNames();
    } catch(error) {
      const message=error instanceof Error ? error.message : String(error);
      result.errors.push({area:'categories',error:message});
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] could not relocalize factory category names`,error);
    }
    try {
      result.metadata=await this.ports.relocalizeMetadataFactoryLabels();
    } catch(error) {
      const message=error instanceof Error ? error.message : String(error);
      result.errors.push({area:'metadata',error:message});
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] could not relocalize factory metadata labels`,error);
    }
    return {ok:result.errors.length===0,...result};
  }

  onunload() {
    try {
      const result = this.obsidianOpenLinkHookAdapter?.restore?.();
      if (result && !result.ok) {
        console.error('[PDFium Gate] Could not restore workspace.openLinkText:', result.error || result.reason);
      }
    } catch (error) {
      console.error('[PDFium Gate] Could not restore workspace.openLinkText:', error);
    }

    try { this.ports.shutdownAnnotatorHost(); } catch (_) {}
    try { this.ports.resetLinkLocatorLifecycleState(); } catch (_) {}
    try { this.ports.unregisterRendererBridgeWindows(); } catch (_) {}
    try { this.ports.clearRendererBridgeHandlers(); } catch (_) {}
    try { this.ports.disposeDiagnosticsRuntime(); } catch (_) {}
    try { this.ports.clearDocumentRecordVisibility(); } catch (_) {}
    try { this.ports.cancelDocumentRecordIndexWarmup(); } catch (_) {}
    try {
      if(this.state.lifecycle.missingRecordsDialogTimer) window.clearTimeout(this.state.lifecycle.missingRecordsDialogTimer);
      this.state.lifecycle.missingRecordsDialogTimer=null;
      this.state.lifecycle.missingRecordsDialogOpen=false;
      if(this.state.lifecycle.missingReconciliationIdleHandle) this.obsidianWorkspaceLifecycleAdapter?.cancelIdle?.(this.state.lifecycle.missingReconciliationIdleHandle);
      this.state.lifecycle.missingReconciliationIdleHandle=null;
    } catch (_) {}

    if (this.mainProcessTransport?.getCapabilities?.().loaded) {
      try { this.mainProcessTransport.uninstall(); } catch (_) {}
    }
    try { this.mainProcessTransport?.reset?.(); } catch (_) {}
    this.ports.resetMainBridgeDiagnosticState();
    this.ports.closePdfContextOverlay();

    try {
      const restored = this.obsidianViewRegistryAdapter?.restoreExtension?.(PDF_EXTENSION, this.state.lifecycle.originalPdfViewType) || {
        ok:false, restored:false, reason:'adapter-unavailable', error:'Obsidian view-registry adapter mangler'
      };
      if (!restored.ok && this.state.lifecycle.originalPdfViewType) {
        console.error('[PDFium Gate] Could not restore original PDF mapping:', restored.error || restored.reason);
        new Notice(this.i18n.t('lifecycle.restartRestore'));
      }
    } catch (error) {
      console.error('[PDFium Gate] Could not restore workspace.openLinkText:', error);
      if (this.state.lifecycle.originalPdfViewType) new Notice(this.i18n.t('lifecycle.restartRestore'));
    }
  }
}

module.exports = { LifecycleFeature };
