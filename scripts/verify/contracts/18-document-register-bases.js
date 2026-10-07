'use strict';
const ctx=require('../context');

module.exports=function verifyDocumentRegisterBasesContract(){
  const {path,ROOT,fail,read}=ctx;
  const schemaApi=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  global.metadataRegionalSettings=require(path.join(ROOT,'src/metadata/field-type-registry.js')).metadataRegionalSettings;
  global.metadataValidateCanonicalValue=schemaApi.metadataValidateCanonicalValue;
  global.metadataClone=schemaApi.metadataClone;
  const registryApi=require(path.join(ROOT,'src/metadata/field-type-registry.js'));
  const presentation=require(path.join(ROOT,'src/metadata/base-presentation.js'));
  const baseConfig=require(path.join(ROOT,'src/metadata/document-register-base-config.js'));
  const registrationApi=require(path.join(ROOT,'src/platform/obsidian-plugin-registration.js'));
  const recordContract=require(path.join(ROOT,'src/metadata/record-contract.js'));
  global.metadataRecordNormalizeVaultPath=recordContract.metadataRecordNormalizeVaultPath;
  global.METADATA_RECORD_STATUS_ACTIVE=recordContract.METADATA_RECORD_STATUS_ACTIVE;
  global.METADATA_RECORD_STATUS_MISSING=recordContract.METADATA_RECORD_STATUS_MISSING;
  const {documentRecordRegisterStatusSnapshot}=require(path.join(ROOT,'src/plugin/features/16-document-records.js'));

  const schema=schemaApi.metadataDefaultSchema();
  const registry=registryApi.createMetadataFieldTypeRegistry();
  const settings={regionalDateFormat:'DD.MM.YYYY',regionalTimeFormat:'HH:mm',regionalDecimalSeparator:',',uiBooleanLabels:{yes:'Ja',no:'Nei'}};
  const sourceFrontmatter={
    filemeta_type:'pdf',
    filemeta_profile:'document',
    filemeta_version:2,
    filemeta_id:'a49dde44-7872-4d89-b97e-027a6e689d94',
    filemeta_file:'[[10_Kilder/PDF/test.pdf]]',
    filemeta_status:'active',
    document_date:'2016-03-17',
    document_time:'14:35',
    sender:'Oslo kommune',
    document_type:'letter',
    response_received:true,
    response_received_date:'2026-03-24',
    response_sent:false
  };
  const before=JSON.stringify(sourceFrontmatter);
  const presented=presentation.metadataBasePresentFrontmatter(sourceFrontmatter,schema,settings,registry);
  if(!presented.ok) fail('Bases presentation rejected canonical PDF metadata frontmatter');
  const byProperty=new Map(presented.fields.map(item=>[item.property,item]));
  if(byProperty.get('document_type')?.raw!=='letter'||byProperty.get('document_type')?.display!=='Letter') fail('Bases select machine-value -> schema-label mapping failed');
  if(byProperty.get('document_date')?.display!=='17.03.2016') fail('Bases date presentation did not reuse regional formatter');
  if(byProperty.get('response_received')?.display!=='Ja') fail('Bases boolean presentation did not reuse regional formatter');
  if(JSON.stringify(sourceFrontmatter)!==before) fail('Bases presentation mutated persisted metadata values');

  const dateField=schema.fields.find(field=>field.property==='document_date');
  const validDate=presentation.metadataBasePrepareFieldUpdate(dateField,'18.03.2016',settings,registry);
  if(!validDate.ok||validDate.value!=='2016-03-18') fail('Bases inline edit did not reuse canonical localized date parsing');
  const invalidDate=presentation.metadataBasePrepareFieldUpdate(dateField,'31.02.2016',settings,registry);
  if(invalidDate.ok) fail('Bases inline edit accepted invalid date');
  const typeFieldForEdit=schema.fields.find(field=>field.property==='document_type');
  const selectEdit=presentation.metadataBasePrepareFieldUpdate(typeFieldForEdit,'letter',settings,registry);
  if(!selectEdit.ok||selectEdit.value!=='letter') fail('Bases inline edit did not preserve select machine value');

  const relabeled=schemaApi.metadataClone(schema);
  const typeField=relabeled.fields.find(field=>field.property==='document_type');
  const letter=typeField.config.options.find(option=>option.value==='letter');
  letter.label='Korrespondanse';
  const relabeledPresentation=presentation.metadataBasePresentFrontmatter(sourceFrontmatter,relabeled,settings,registry);
  if(relabeledPresentation.fields.find(item=>item.property==='document_type')?.display!=='Korrespondanse') fail('Bases presentation hardcoded select label instead of schema label');
  if(sourceFrontmatter.document_type!=='letter') fail('schema label change rewrote machine value');

  const hidden=schemaApi.metadataClone(schema);
  hidden.fields.find(field=>field.property==='sender').show_in_default_base=false;
  const visible=presentation.metadataBaseVisibleFields(hidden);
  if(visible.some(field=>field.property==='sender')) fail('show_in_default_base=false did not hide field from custom Bases view');

  const standardBaseYaml=baseConfig.metadataDocumentRegisterStandardBaseYaml(schema);
  if(baseConfig.PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH!=='PDF Dokumentregister.base') fail('standard Dokumentregister Base path drifted');
  if(baseConfig.PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE!=='pdfium-document-register') fail('standard Dokumentregister custom view type drifted');
  if(!standardBaseYaml.includes('file.inFolder(\\"File Metadata\\")')||!standardBaseYaml.includes('filemeta_type == \\"pdf\\"')||!standardBaseYaml.includes('filemeta_profile == \\"document\\"')) fail('standard Dokumentregister Base does not scope query to canonical PDF/document metadata records');
  if(!standardBaseYaml.includes('type: pdfium-document-register')||!standardBaseYaml.includes('property: document_date')||!standardBaseYaml.includes('direction: DESC')) fail('standard Dokumentregister Base lacks custom view/default newest-first sort');
  if(!standardBaseYaml.includes('displayName: "Document date"')||!standardBaseYaml.includes('displayName: "Status"')||!standardBaseYaml.includes('displayName: "PDF"')) fail('standard Document Register Base lacks canonical English human display names');
  if(!standardBaseYaml.includes('pdfiumHiddenColumns:')||!standardBaseYaml.includes('      - document_time')||!standardBaseYaml.includes('      - response_received')) fail('standard Document Register Base lacks compact default hidden-column config');
  const orderBlock=standardBaseYaml.split('    order:')[1]?.split('    sort:')[0] || '';
  if(!orderBlock.trimStart().startsWith('- filemeta_file')) fail('standard Document Register Base does not put PDF first in column order');
  if(standardBaseYaml.includes('      - document_date\n')===false||standardBaseYaml.includes('      - sender\n')===false||standardBaseYaml.includes('      - document_type\n')===false) fail('standard Document Register Base compact defaults hid primary columns');
  const ignoredLocalizedBase=baseConfig.metadataDocumentRegisterStandardBaseYaml(schema,()=> 'SHOULD NOT BE USED');
  if(ignoredLocalizedBase!==standardBaseYaml) fail('standard Base factory unexpectedly depends on UI language');
  if(standardBaseYaml.includes('filemeta_id')||standardBaseYaml.includes('record filename')) fail('standard Dokumentregister Base exposes technical identity fields');
  const hiddenBaseYaml=baseConfig.metadataDocumentRegisterStandardBaseYaml(hidden);
  if(hiddenBaseYaml.includes('  sender:')||hiddenBaseYaml.includes('      - sender')) fail('standard Dokumentregister Base ignores show_in_default_base=false');

  {
    const documentRecords={
      invalidRecordPaths:new Set(['File Metadata/ff/invalid.md']),
      ambiguousIds:new Set(['dup-id']),
      ambiguousPdfPaths:new Set(),
      recordPathsById:new Map([['dup-id',new Set(['File Metadata/aa/dup-a.md','File Metadata/bb/dup-b.md'])]]),
      idsByPdfPath:new Map(),
      entryByRecordPath:new Map([
        ['File Metadata/01/active.md',{status:'active'}],
        ['File Metadata/02/missing.md',{status:'missing'}],
        ['File Metadata/aa/dup-a.md',{id:'dup-id',pdfPath:'Docs/dup-a.pdf',status:'active'}],
        ['File Metadata/bb/dup-b.md',{id:'dup-id',pdfPath:'Docs/dup-b.pdf',status:'active'}]
      ])
    };
    const pdfFiles=[{path:'Docs/active.pdf'},{path:'Docs/unregistered.pdf'},{path:'Docs/problem.pdf'}];
    const registrationStates={
      'Docs/active.pdf':{ok:true,registered:true},
      'Docs/unregistered.pdf':{ok:true,registered:false},
      'Docs/problem.pdf':{ok:false,registered:false}
    };
    const summary=documentRecordRegisterStatusSnapshot(documentRecords,pdfFiles,path=>registrationStates[path]);
    if(summary.activeCount!==1||summary.missingCount!==1||summary.errorCount!==3||summary.unregisteredCount!==1||summary.allCount!==2) fail('Document Register status snapshot produced incorrect category counts');
    if(summary.totalRecordCount!==5||summary.totalPdfCount!==3||summary.registrationProblemCount!==1) fail('Document Register status snapshot produced incorrect totals/problem count');
    if(summary.errorItems.length!==3||summary.errorItems.filter(item=>item.reason==='ambiguous-id').length!==2||summary.errorItems.filter(item=>item.reason==='invalid').length!==1) fail('Document Register status snapshot did not expose concrete error items/reasons');
    if(JSON.stringify(summary.unregisteredPdfPaths)!==JSON.stringify(['Docs/unregistered.pdf'])) fail('Document Register status snapshot did not expose concrete unregistered PDF paths');
  }

  const registrations=[];
  const adapter=registrationApi.createObsidianPluginRegistrationAdapter({plugin:{
    registerBasesView(type,registration){ registrations.push({type,registration}); return true; }
  }});
  const registered=adapter.registerBasesView('pdfium-document-register',{factory:()=>({})});
  if(registered!==true||registrations.length!==1||registrations[0].type!=='pdfium-document-register') fail('Obsidian Bases registration adapter failed');
  const unavailable=registrationApi.createObsidianPluginRegistrationAdapter({plugin:{}});
  if(unavailable.registerBasesView('pdfium-document-register',{factory:()=>({})})!==false) fail('Bases registration adapter must fail open when API is unavailable');

  const viewSource=read('src/main/pdf-document-register-bases-view.js');
  const recordFeatureSource=read('src/plugin/features/16-document-records.js');
  const pluginStateSource=read('src/plugin/plugin-state.js');
  const baseConfigSource=read('src/metadata/document-register-base-config.js');
  const featureSource=read('src/plugin/features/18-document-register-bases.js');
  const lifecycleSource=read('src/plugin/features/01-lifecycle.js');
  const settingsSource=read('src/main/settings.js');
  const headerSource=read('src/main/00-header.js');
  const contextMenuSource=read('src/plugin/features/05-context-menu.js');
  const bridgeRoutingSource=read('src/plugin/features/07-main-bridge-routing.js');
  if(!baseConfigSource.includes("PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE = 'pdfium-document-register'")) fail('custom Bases view type id missing');
  const releaseVersion=JSON.parse(read('manifest.json')).version;
  if(!headerSource.includes(`const PLUGIN_VERSION = '${releaseVersion}';`)) fail(`internal PLUGIN_VERSION drifted from manifest ${releaseVersion}`);
  if(!contextMenuSource.includes('main-bridge-${PLUGIN_VERSION}.js')) fail('versioned Main Bridge runtime path contract missing');
  if(!bridgeRoutingSource.includes("resolvePluginPath('main-bridge-0.1.205.js')")||!bridgeRoutingSource.includes('removeFile(staleBridgePath)')) fail('stale main-bridge-0.1.205.js cleanup missing');
  if(!settingsSource.includes("settings.documentRegister.rememberFilters.name")||!settingsSource.includes("saveSetting('rememberDocumentRegisterFilters'")) fail('localized remember-filter setting missing');
  if(!lifecycleSource.includes('rememberDocumentRegisterFilters:persistedSettings.rememberDocumentRegisterFilters === true')) fail('remember-filter default/restore contract missing');
  if(!viewSource.includes('metadataBaseVisibleFields(schema)')||!viewSource.includes('metadataBasePresentFrontmatter(')) fail('custom Bases view bypasses schema-aware presentation contract');
  if(!viewSource.includes('metadataBasePrepareFieldUpdate(')||!viewSource.includes('metadataFieldTypeRegistry.get(field.type)')) fail('custom Bases inline edit bypasses field-type registry');
  if(!viewSource.includes('this.host?.saveValues?.(pdfPath')) fail('custom Bases inline edit does not route through explicit save operation');
  if(viewSource.includes('processFrontMatter(')||viewSource.includes('obsidianVaultWriteAdapter')||viewSource.includes('createText(')) fail('custom Bases view writes metadata directly');
  if(viewSource.includes("document_type==='letter'")||viewSource.includes("'letter':'Brev'")||viewSource.includes('letter → Brev')) fail('custom Bases view hardcodes document-type translation');
  if(/PdfDocumentRelinkModal|listPdfFiles|relinkMissingRecord|recoverMissingRecord|documentRegister\.relink/.test(viewSource)) fail('missing-PDF relink/recovery UX must not be exposed');
  if(!viewSource.includes("pdfium-document-register-missing-path")) fail('missing records must remain visibly identifiable in the custom Bases view');
  if(!viewSource.includes('getSortDirection(property)')||!viewSource.includes('this.config.setSortProperty(propertyId, next)')||!viewSource.includes('pdfDocumentRegisterPropertyId(property)')) fail('clickable header sort does not route through Bases setSortProperty operation');
  if(!viewSource.includes('nextSortDirection(current)')||!viewSource.includes("return current === 'ASC' ? 'DESC' : 'ASC'")) fail('simple ASC/DESC click toggle contract missing');
  if(viewSource.includes('event.shiftKey')||viewSource.includes('shiftKey')) fail('Dokumentregister sorting must not depend on Shift');
  if(!viewSource.includes("typeof this.config.setSortProperty !== 'function'")) fail('must capability-check BasesViewConfig.setSortProperty');
  if(!viewSource.includes("this.config.setSortProperty(existingProperty, 'NONE')")) fail('single-column sort must clear existing Bases sorts through setSortProperty');
  if(!viewSource.includes('this.config.setSortProperty(propertyId, next)')) fail('sort must use BasesViewConfig.setSortProperty');
  if(viewSource.includes("this.config.set('sort'")) fail('must not mutate Bases sort through generic config.set');
  if(!viewSource.includes('class PdfDocumentRegisterHeaderFilterModal extends Modal')||!viewSource.includes('this.headerFilters = new Map()')||!viewSource.includes('matchesHeaderFilters(values)')) fail('transient column-filter UX prototype missing');
  if(!viewSource.includes('pdfDocumentRegisterFilterType(field')||!viewSource.includes("kind:'range'")||!viewSource.includes("kind:'choices'")||!viewSource.includes("kind:'boolean'")||!viewSource.includes("kind:'contains'")) fail('0.1.206 schema-aware filter modes missing');
  if(!viewSource.includes("type === 'date'")||!viewSource.includes("type === 'select'")||!viewSource.includes("type === 'boolean'")||!viewSource.includes("systemType:'status'")) fail('0.1.206 filter UI is not datatype-aware');
  if(!viewSource.includes('metadataFieldTypeRegistry.parseNormalizeValidate')||!viewSource.includes('pdfDocumentRegisterMatchesFilter(filter')) fail('0.1.206 filter validation/matching does not reuse canonical field types');
  if(viewSource.includes("this.config.set('filters'")||viewSource.includes('modifyText(PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH')||viewSource.includes('modifyText("PDF Dokumentregister.base"')) fail('header filters must not rewrite native Bases filters or the Base file directly');
  if(!viewSource.includes("PDF_DOCUMENT_REGISTER_HEADER_FILTERS_CONFIG_KEY = 'pdfiumHeaderFilters'")||!viewSource.includes('pdfDocumentRegisterHeaderFiltersFromConfig(')||!viewSource.includes('pdfDocumentRegisterHeaderFiltersToConfig(')) fail('persistent header-filter config contract missing');
  if(!viewSource.includes("PDF_DOCUMENT_REGISTER_HIDDEN_COLUMNS_CONFIG_KEY = 'pdfiumHiddenColumns'")||!viewSource.includes('pdfDocumentRegisterHiddenColumnsFromConfig(')||!viewSource.includes('pdfDocumentRegisterHiddenColumnsToConfig(')) fail('persistent hidden-column config contract missing');
  if(!viewSource.includes('class PdfDocumentRegisterColumnPickerModal extends Modal')||!viewSource.includes("documentRegister.columns.button")||!viewSource.includes('this.openColumnPicker(columns,hiddenColumns)')) fail('Document Register column picker UI missing');
  if(!viewSource.includes("this.config.set(\n      PDF_DOCUMENT_REGISTER_HIDDEN_COLUMNS_CONFIG_KEY")||!viewSource.includes('this.onDataUpdated();')) fail('column visibility is not persisted through the current Bases view config');
  if(viewSource.includes("cls:'pdfium-document-register-open'")||viewSource.includes("text:this.t('common.open')")) fail('PDF column still renders a separate Open button');
  if(!viewSource.includes("cls:'internal-link pdfium-document-register-pdf-link'")||!viewSource.includes("text:fileName || 'PDF'")||!viewSource.includes("this.host?.openLink?.(resolvedPath")) fail('PDF column does not render the filename as a clickable internal link');
  if(!viewSource.includes("if(showStatus)")||!viewSource.includes("if(showPdf)")||!viewSource.includes("fields=allFields.filter")) fail('column visibility is not applied to metadata and system columns');
  if(!pluginStateSource.includes('invalidRecordPaths: new Set()')) fail('document record state does not track invalid record paths');
  if(!recordFeatureSource.includes('async getDocumentRegisterStatusSummary()')||!recordFeatureSource.includes('function documentRecordRegisterStatusSnapshot(')||!recordFeatureSource.includes('invalidRecordPaths=new Set(state.invalidRecordPaths')||!recordFeatureSource.includes('problemRecordPaths=new Set(invalidRecordPaths)')) fail('Document Register status summary is missing or does not include invalid records');
  if(!recordFeatureSource.includes('this.state.documentRecords.invalidRecordPaths.add(path)')||!recordFeatureSource.includes('this.state.documentRecords.invalidRecordPaths.delete(path)')) fail('invalid record tracking is not maintained by live record refresh');
  if(!recordFeatureSource.includes('pruneMissingInvalidDocumentRecordPaths()')||!recordFeatureSource.includes('const existsAsMarkdown=!!file')||!recordFeatureSource.includes('staleInvalidRemovedCount')) fail('Document Register does not self-heal stale invalid-record paths before status summary');
  if(!recordFeatureSource.includes("reason:'vault-lookup-unavailable'")||!recordFeatureSource.includes('uncertainPaths.push(path)')) fail('stale-invalid pruning does not fail closed on lookup uncertainty');
  if(!recordFeatureSource.includes('unregisteredPdfPaths.push(path)')||!recordFeatureSource.includes('METADATA_RECORD_STATUS_MISSING) missingCount++')) fail('Document Register status summary does not count/expose unregistered or missing documents');
  if(!recordFeatureSource.includes('errorItems')||!recordFeatureSource.includes("reason='ambiguous-id'")||!recordFeatureSource.includes("reason='ambiguous-pdf-path'")) fail('Document Register status summary does not expose problem rows/reasons');
  if(!featureSource.includes('getStatusSummary:() => this.ports.getDocumentRegisterStatusSummary()')) fail('Document Register view host does not expose canonical status summary');
  if(!viewSource.includes('renderStatusOverview(')||!viewSource.includes("documentRegister.overview.active")||!viewSource.includes("documentRegister.overview.unregistered")||!viewSource.includes("documentRegister.overview.all")) fail('Document Register status overview/filter UI missing');
  if(!viewSource.includes("this.statusFilter = 'all'")||!viewSource.includes("setStatusFilter(kind)")||!viewSource.includes("this.statusFilter==='active' && !activeRecord")||!viewSource.includes("this.statusFilter==='missing' && activeRecord")) fail('Active/Missing/All status filtering is not wired into normal register rows');
  if(!viewSource.includes("this.statusFilter==='error' || this.statusFilter==='unregistered'")||!viewSource.includes('renderSpecialStatusTable(')||!viewSource.includes('summary.errorItems')||!viewSource.includes('summary.unregisteredPdfPaths')) fail('Error/Unregistered status filtering does not render concrete special result lists');
  const activeSpecIndex=viewSource.indexOf("['active','documentRegister.overview.active','activeCount']");
  const missingSpecIndex=viewSource.indexOf("['missing','documentRegister.overview.missing','missingCount']");
  const errorSpecIndex=viewSource.indexOf("['error','documentRegister.overview.errors','errorCount']");
  const unregisteredSpecIndex=viewSource.indexOf("['unregistered','documentRegister.overview.unregistered','unregisteredCount']");
  const allSpecIndex=viewSource.indexOf("['all','documentRegister.overview.all','allCount']");
  if([activeSpecIndex,missingSpecIndex,errorSpecIndex,unregisteredSpecIndex,allSpecIndex].some(index=>index<0) || !(activeSpecIndex<missingSpecIndex&&missingSpecIndex<errorSpecIndex&&errorSpecIndex<unregisteredSpecIndex&&unregisteredSpecIndex<allSpecIndex)) fail('status-filter order must be Active, Missing, Errors, Unregistered, All');
  if(!viewSource.includes("card.setAttribute('aria-pressed'")||!viewSource.includes("card.classList.add('is-selected')")) fail('selected status filter is not visibly/accessibly marked');
  const overviewIndex=viewSource.indexOf('this.renderStatusOverview();');
  const emptyIndex=viewSource.indexOf('if (!entries.length)');
  if(overviewIndex<0||emptyIndex<0||overviewIndex>emptyIndex) fail('Document Register status overview is not rendered when the table has no valid rows');
  const pdfHeaderIndex=viewSource.indexOf("if(showPdf) this.renderHeaderCell(headRow");
  const fieldHeaderIndex=viewSource.indexOf("for (const field of fields) this.renderHeaderCell(headRow");
  if(pdfHeaderIndex<0||fieldHeaderIndex<0||pdfHeaderIndex>fieldHeaderIndex) fail('PDF header is not the first rendered table column');
  const pdfCellIndex=viewSource.indexOf("const pdfCell = row.createEl('td'");
  const fieldCellIndex=viewSource.indexOf("const fieldByProperty = new Map(fields.map");
  if(pdfCellIndex<0||fieldCellIndex<0||pdfCellIndex>fieldCellIndex) fail('PDF body cell is not the first rendered table column');
  const toolbarActionsIndex=viewSource.indexOf("const toolbarActions=toolbar.createDiv");
  const toolbarHelpIndex=viewSource.indexOf("const help = toolbar.createDiv");
  if(toolbarActionsIndex<0||toolbarHelpIndex<0||toolbarActionsIndex>toolbarHelpIndex) fail('Columns button is not positioned on the left before help text');
  const pickerPdfIndex=viewSource.indexOf("{property:'filemeta_file',label:this.t('documentRegister.pdf')");
  const pickerFieldIndex=viewSource.indexOf("...(Array.isArray(fields) ? fields : [])");
  if(pickerPdfIndex<0||pickerFieldIndex<0||pickerPdfIndex>pickerFieldIndex) fail('column picker does not mirror PDF-first table order');
  {
    const fromConfig=eval(`(${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterHiddenColumnsFromConfig')})`);
    const toConfig=eval(`(${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterHiddenColumnsToConfig')})`);
    const allowed=['document_date','sender','filemeta_status','filemeta_file'];
    const restored=fromConfig(['sender','unknown','sender','filemeta_file'],allowed);
    if(restored.size!==2||!restored.has('sender')||!restored.has('filemeta_file')||restored.has('unknown')) fail('hidden-column restore did not sanitize stale/duplicate properties');
    const serialized=toConfig(new Set(['filemeta_file','unknown','sender']),allowed);
    if(JSON.stringify(serialized)!==JSON.stringify(['filemeta_file','sender'])) fail('hidden-column serialization did not sanitize/sort properties');
  }
  if(!viewSource.includes('rememberDocumentRegisterFilters')||!viewSource.includes('persistHeaderFiltersIfEnabled()')||!viewSource.includes('this.config.set(')) fail('optional header-filter persistence path missing');
  if(viewSource.includes("sortButton.setAttribute('title'")||viewSource.includes("filterButton.setAttribute('title'")) fail('header buttons must not duplicate native title and Obsidian accessibility tooltip text');
  if(!viewSource.includes("property:'filemeta_status', label:this.t('documentRegister.status')")||!viewSource.includes("property:'filemeta_file', label:this.t('documentRegister.pdf')")) fail('status/PDF headers are not wired to localized shared header interaction');
  {
    const sanitize=eval(`(${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterSanitizeStoredFilter')})`);
    const fromConfig=eval(`(function(pdfDocumentRegisterSanitizeStoredFilter){ return (${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterHeaderFiltersFromConfig')}); })`)(sanitize);
    const toConfig=eval(`(function(pdfDocumentRegisterSanitizeStoredFilter){ return (${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterHeaderFiltersToConfig')}); })`)(sanitize);
    const stored={
      sender:{kind:'contains',query:'Oslo'},
      response_received:{kind:'boolean',value:false},
      document_type:{kind:'choices',values:['letter','decision'],includeEmpty:false,systemType:''},
      document_date:{kind:'range',valueType:'date',from:'2024-01-01',to:'2025-12-31'},
      unsafe:{kind:'unknown',payload:'drop-me'}
    };
    if(!sanitize(stored.sender)||sanitize(stored.unsafe)!==null) fail('stored header-filter sanitizer does not fail closed');
    const restored=fromConfig(stored);
    if(restored.size!==4||restored.get('sender')?.query!=='Oslo'||restored.get('response_received')?.value!==false) fail('stored header-filter restore failed');
    const serialized=toConfig(restored);
    if(Object.keys(serialized).length!==4||serialized.unsafe) fail('stored header-filter serialization failed');
  }
  if(!featureSource.includes("name:this.i18n.t('documentRegister.viewName')")||!featureSource.includes('registerBasesView(')) fail('custom Bases registration feature missing');
  if(!featureSource.includes('this.ports.getMetadataSchemaPresentationSnapshot()')||!featureSource.includes('this.ports.resolveDocumentRecordPdfPath(')||!featureSource.includes('this.ports.saveDocumentMetadataRecordValues(')) fail('custom Bases feature does not use explicit presentation-schema/identity/save ports');
  if(/recoverMissingDocumentRecordByExactSha|relinkMissingDocumentRecord|listPdfFiles:/.test(featureSource)) fail('custom Bases feature must not expose missing-PDF recovery or manual relink');
  if(featureSource.includes('obsidianFrontmatterAdapter')||featureSource.includes('processFrontMatter(')||featureSource.includes('modifyText(')) fail('custom Bases feature unexpectedly mutates metadata or overwrites Base files');
  if(!featureSource.includes('metadataDocumentRegisterStandardBaseYaml(schema)')||!featureSource.includes('this.obsidianVaultWriteAdapter.createText(path, yaml)')) fail('standard Document Register Base create-only path missing');
  if(!featureSource.includes("name:this.i18n.t('commands.openDocumentRegister')")||!featureSource.includes("getLeaf?.('tab')")||!featureSource.includes('await leaf.openFile(ensured.file)')) fail('standard Dokumentregister open command missing');
  const existingGuard=featureSource.indexOf('if (existing)');
  const createBase=featureSource.indexOf('this.obsidianVaultWriteAdapter.createText(path, yaml)');
  if(existingGuard<0||createBase<0||existingGuard>createBase) fail('standard Dokumentregister Base is not protected from overwrite');
  const schemaInit=lifecycleSource.indexOf('await this.ports.initializeMetadataSchema();');
  const basesRegistration=lifecycleSource.indexOf('this.ports.registerPdfDocumentRegisterBasesView();');
  if(schemaInit<0||basesRegistration<0||basesRegistration<schemaInit) fail('custom Bases view is not registered after metadata schema initialization');

  delete global.metadataRegionalSettings;
  delete global.metadataValidateCanonicalValue;
  delete global.metadataClone;
  delete global.metadataRecordNormalizeVaultPath;
  delete global.METADATA_RECORD_STATUS_ACTIVE;
  delete global.METADATA_RECORD_STATUS_MISSING;

  return {
    customViewType:'pdfium-document-register',
    nativeBasesRegistration:true,
    basesOwnsQueryMembership:true,
    schemaDrivenColumns:true,
    showInDefaultBaseHonored:true,
    selectMachineValuePreserved:true,
    selectSchemaLabelPresented:true,
    regionalFormattingReused:true,
    schemaRelabelWithoutRecordRewrite:true,
    inlineEditing:true,
    editUsesFieldTypeRegistry:true,
    invalidDateRejectedBeforeWrite:true,
    canonicalSaveOperationOnly:true,
    missingRecordsReadOnly:true,
    missingPdfRecoveryUi:false,
    manualPdfRelinkPickerExposed:false,
    standardBaseCreateOnly:true,
    standardBaseUserOwnedAfterCreation:true,
    standardBaseScopedToRecordRoot:true,
    standardNewestDocumentFirst:true,
    standardOpenCommand:true,
    clickableHeaderSortUsesBasesConfig:true,
    simpleAscendingDescendingToggle:true,
    shiftSortingDisabled:true,
    transientHeaderFilterPrototype:true,
    optionalPersistentHeaderFilters:true,
    persistentHeaderFiltersDefaultOff:true,
    persistentColumnVisibility:true,
    compactStandardColumns:true,
    pdfFilenameIsClickableLink:true,
    statusOverview:true,
    clickableStatusFilters:true,
    allStatusFilterLast:true,
    specialErrorAndUnregisteredLists:true,
    invalidRecordTracking:true,
    staleInvalidRecordSelfHealing:true,
    failClosedInvalidPathLookup:true,
    unregisteredPdfCount:true,
    headerTooltipDeduplicated:true,
    internalVersionSynchronized:true,
    staleVersionedMainBridgeCleanup:true,
    schemaAwareHeaderFilters:true,
    dateRangeFilter:true,
    selectChoiceFilter:true,
    booleanFilter:true,
    textContainsFilter:true,
    headerFilterDoesNotWriteNativeBasesFilters:true,
    humanStatusAndPdfActions:viewSource.includes("text:activeRecord ? this.t('common.active') : this.t('common.missing')")&&viewSource.includes("cls:'internal-link pdfium-document-register-pdf-link'"),
    multilingualUiRoadmapDocumented:read('docs/history/MILESTONE.md').includes('Future localization reminder')
  };
};
