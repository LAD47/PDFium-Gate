'use strict';

// Permanent register DOM and column-picker regression. Synthetic in-memory adapters only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class Element {
  constructor(tag='div',parent=null,options={}) {
    this.tagName=tag.toUpperCase();
    this.parentElement=parent;
    this.children=[];
    this.attributes={};
    this.dataset={};
    this.listeners={};
    this.names=new Set(String(options.cls || '').split(/\s+/).filter(Boolean));
    this.classList={
      contains:name=>this.names.has(name),
      add:(...names)=>{this.classMutations++;names.forEach(name=>this.names.add(name));},
      remove:(...names)=>{this.classMutations++;names.forEach(name=>this.names.delete(name));}
    };
    this.text=options.text || '';
    this.isConnected=true;
    this.style={};
    this.hidden=false;
    this.classMutations=0;
  }
  createEl(tag,options={}) {
    const child=new Element(tag,this,options);
    this.children.push(child);
    return child;
  }
  createDiv(options={}) { return this.createEl('div',typeof options==='string' ? {cls:options} : options); }
  createSpan(options={}) { return this.createEl('span',options); }
  addEventListener(type,callback) { (this.listeners[type] ||= []).push(callback); }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  getAttribute(key) {
    assert.ok(['role','data-type','aria-selected','aria-pressed','aria-hidden','aria-label','title'].includes(key),
      'native UI must read only necessary system attributes: '+key);
    return this.attributes[key] ?? null;
  }
  setText(value) { this.text=String(value); }
  empty() { for(const child of this.children) child.parentElement=null; this.children=[]; }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() {
    const siblings=this.parentElement?.children || [];
    return siblings[siblings.indexOf(this)+1] || null;
  }
  contains(other) { for(let el=other;el;el=el.parentElement) if(el===this) return true; return false; }
  closest(selector) {
    assert.ok(selector.startsWith('.'));
    for(let el=this;el;el=el.parentElement) if(el.names.has(selector.slice(1))) return el;
    return null;
  }
  all() { return [this,...this.children.flatMap(child=>child.all())]; }
  querySelectorAll(selector) {
    assert.equal(selector,'.bases-toolbar-properties-menu','only the native control synchronizer may query DOM');
    return this.all().filter(el=>el!==this && el.names.has(selector.slice(1)));
  }
  click() {
    const event={preventDefault(){},stopPropagation(){}};
    for(const handler of this.listeners.click || []) handler(event);
  }
  get textContent() { throw new Error('arbitrary text must not be read'); }
  get innerHTML() { throw new Error('HTML must not be read'); }
  get outerHTML() { throw new Error('HTML must not be read'); }
}

class LocalObserver {
  static instances=[];
  constructor(callback) {
    this.callback=callback;
    this.targets=[];
    this.disconnected=false;
    LocalObserver.instances.push(this);
  }
  observe(target,options) {
    assert.ok(target.names.has('view-content') || target.names.has('workspace-leaf-content'),'observer must stay inside the owning leaf');
    assert.equal(options.attributes,true);
    assert.deepEqual(Array.from(options.attributeFilter),['class','style','hidden','aria-hidden','data-type']);
    if(target.names.has('view-content')) assert.equal(options.subtree,true);
    else assert.ok(!options.subtree,'owner is observed only for its own attributes/direct replacements');
    this.targets.push({target,options});
  }
  disconnect() { this.disconnected=true;this.targets=[]; }
  trigger() { if(!this.disconnected) this.callback([]); }
}

const sandbox={
  obsidianModule:{BasesView:class {
    constructor(controller) {
      this.controller=controller || null;
      this.data=controller?.data || {groupedData:[]};
      this.config=controller?.config || null;
      this.cleanup=[];
    }
    register(callback) { this.cleanup.push(callback); }
  }},
  MutationObserver:LocalObserver,
  Modal:class {
    static latest=null;
    constructor() {
      this.contentEl=new Element();
      this.modalEl=new Element();
      sandbox.Modal.latest=this;
    }
    open() { this.onOpen?.(); }
    close() { this.onClose?.(); }
  },
  Notice:class {},
  PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE:'pdfium-document-register',
  METADATA_RECORD_STATUS_ACTIVE:'active',
  METADATA_RECORD_STATUS_MISSING:'missing',
  metadataBaseVisibleFields:require('../src/metadata/base-presentation').metadataBaseVisibleFields,
  metadataBaseFormatFieldValue:(_registry,_field,value)=>String(value ?? ''),
  metadataPresentationSettings:settings=>settings,
  metadataFieldTypeRegistry:{},
  metadataRecordFromFrontmatter:()=>({ok:true,record:{values:{}}}),
  metadataBasePresentFrontmatter:()=>({ok:true,fields:[]}),
  metadataRecordPdfPathFromLink:()=> 'Private/Synthetic-secret.pdf'
};
vm.createContext(sandbox);
const source=fs.readFileSync(path.join(__dirname,'../src/main/pdf-document-register-bases-view.js'),'utf8');
vm.runInContext(source,sandbox,{filename:'pdf-document-register-bases-view.js'});
const View=vm.runInContext('PdfDocumentRegisterBasesView',sandbox);
const dictionaries=Object.fromEntries(['en','nb','de','es','sv','da','fr'].map(locale=>[
  locale,JSON.parse(fs.readFileSync(path.join(__dirname,'../src/i18n',locale+'.json'),'utf8'))
]));
const translated=(locale='en')=>({t:key=>dictionaries[locale][key] || key});
const forbidden=()=>{throw new Error('unexpected persistence or data operation');};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function make({schema=true,fields=[],entries=false,status='all',locale='en',leaf=true,bases=true,root=new Element()}={}) {
  const workspace=leaf ? root.createDiv({cls:'workspace-leaf is-active'}) : root;
  const owner=workspace.createDiv({cls:'workspace-leaf-content'});
  owner.setAttribute('data-type','bases');
  const content=owner.createDiv({cls:'view-content'});
  if(!leaf) content.setAttribute('data-type','bases');
  const base=bases ? content.createDiv({cls:'bases-view'}) : content;
  const view=new View({
    config:{get:()=>[],set:forbidden,setSortProperty:forbidden,getSort:()=>[]},
    data:{groupedData:[{entries:entries ? [{file:{path:'Private/secret-record.md'}}] : []}]}
  },base,{
    getSchema:()=>schema ? {fields} : null,
    getI18n:()=>translated(locale),
    getSettings:()=>({}),
    getFrontmatter:()=>({filemeta_status:'active',filemeta_file:'[[Private/Synthetic-secret.pdf]]'}),
    getStatusSummary:async()=>({ok:true,activeCount:1,missingCount:0,errorCount:0,unregisteredCount:0}),
    saveValues:forbidden,
    openLink:forbidden,
    registerExistingPdfRecords:forbidden,
    deleteDuplicateRecord:forbidden
  });
  view.statusFilter=status;
  return {root,workspace,owner,content,base,view,container:view.containerEl};
}
let groups=0;
(async()=>{
  // Real render path and localized columns button in all supported languages/status routes.
  for(const locale of Object.keys(dictionaries)) {
    for(const options of [
      {entries:true},{entries:false},{schema:false},{status:'error'},
      {status:'unregistered'},{status:'missing'},{status:'active'}
    ]) {
      const f=make({...options,locale});
      f.view.onDataUpdated();await flush();
      const toolbar=f.container.all().find(el=>el.names.has('pdfium-document-register-toolbar'));
      assert.ok(toolbar);
      const actions=toolbar.children.find(el=>el.names.has('pdfium-document-register-toolbar-actions'));
      const buttons=actions.children.filter(el=>el.tagName==='BUTTON');
      assert.equal(buttons.length,1,'toolbar keeps the single permanent columns action');
      assert.equal(buttons[0].text,dictionaries[locale]['documentRegister.columns.button']);
      assert.equal(buttons[0].attributes['aria-label'],dictionaries[locale]['documentRegister.columns.buttonAria']);
      assert.equal(buttons[0].disabled,options.schema===false);
      if(options.schema!==false) {
        buttons[0].click();
        const rows=sandbox.Modal.latest.contentEl.all().filter(el=>el.tagName==='INPUT');
        assert.equal(rows.length,2,'PDF and Status remain available in alternate states');
        sandbox.Modal.latest.close();
      }
      if(options.entries) assert.ok(f.container.all().some(el=>el.tagName==='TD'));
    }
  }
  assert.equal(dictionaries.nb['documentRegister.columns.button'],'Velg Kolonner');
  groups++;

  // Only schema-enabled/default-visible fields and system columns; saved choices survive redraw/reopen.
  for(const entries of [false,true]) {
    const fields=[
      {property:'sender',label:'Custom sender label',type:'text',active:true,show_in_default_base:true},
      {property:'inactive',label:'Disabled field',type:'text',active:false,show_in_default_base:true},
      {property:'not_in_base',label:'Excluded field',type:'text',active:true,show_in_default_base:false}
    ];
    const unchangedSchema=JSON.stringify(fields);
    const f=make({fields,entries,locale:'nb'});
    let hidden=['sender'],writes=0;
    f.view.config.get=key=>key==='pdfiumHiddenColumns' ? hidden : [];
    f.view.config.set=(key,value)=>{
      assert.equal(key,'pdfiumHiddenColumns');
      hidden=Array.from(value);writes++;
    };
    f.view.onDataUpdated();await flush();
    const open=()=>{
      f.container.all().find(el=>el.tagName==='BUTTON' && el.text==='Velg Kolonner').click();
      return sandbox.Modal.latest;
    };
    let modal=open();
    let rows=modal.contentEl.all().filter(el=>el.tagName==='LABEL');
    assert.deepEqual(rows.map(row=>row.children.find(el=>el.tagName==='SPAN').text),[
      dictionaries.nb['documentRegister.pdf'],'Custom sender label',dictionaries.nb['documentRegister.status']
    ]);
    assert.deepEqual(rows.map(row=>row.children[0].checked),[true,false,true]);
    modal.contentEl.all().find(el=>el.text===dictionaries.nb['documentRegister.columns.showAll']).click();
    assert.deepEqual(rows.map(row=>row.children[0].checked),[true,true,true]);
    modal.contentEl.all().find(el=>el.text===dictionaries.nb['common.cancel']).click();
    assert.equal(writes,0,'cancel does not persist a changed choice');
    modal=open();
    rows=modal.contentEl.all().filter(el=>el.tagName==='LABEL');
    assert.deepEqual(rows.map(row=>row.children[0].checked),[true,false,true]);
    rows[2].children[0].checked=false;
    modal.contentEl.all().find(el=>el.text===dictionaries.nb['documentRegister.columns.apply']).click();
    await flush();
    assert.equal(writes,1);
    assert.deepEqual(hidden,['filemeta_status','sender']);
    modal=open();
    rows=modal.contentEl.all().filter(el=>el.tagName==='LABEL');
    assert.deepEqual(rows.map(row=>row.children[0].checked),[true,false,false]);
    modal.close();
    assert.equal(JSON.stringify(fields),unchangedSchema,'render and visibility never rewrite schema/metadata');
  }
  groups++;

  // Observed Obsidian hierarchy: native menu is a DIV in a sibling header.
  function host(f) {
    const header=f.content.createDiv({cls:'bases-header'});
    const toolbar=header.createDiv({cls:'bases-toolbar'});
    const button=toolbar.createDiv({cls:'bases-toolbar-item bases-toolbar-properties-menu'});
    const cleanup=f.view.cleanup;
    f.view.containerEl.ownerDocument={defaultView:{MutationObserver:LocalObserver}};
    return {header,toolbar,button,cleanup};
  }
  const marked=el=>el.names.has('pdfium-register-native-properties-hidden');
  {
    const f=make(),h=host(f);
    assert.equal(marked(h.button),false);
    f.view.onload();
    const observer=f.view.nativePropertiesObserver;
    assert.ok(observer);
    assert.equal(observer.targets[0].target,f.content);
    assert.equal(observer.targets[1].target,f.owner);
    assert.equal(marked(h.button),true,'correct sibling header menu identified');
    assert.equal(f.base.contains(h.button),false,'outside .bases-view');
    assert.equal(f.view.nativePropertiesButtons.size,1);
    assert.equal(f.view.nativePropertiesObserverRoot,f.content);
    assert.equal(f.view.nativePropertiesLoaded,true);
    const changes=h.button.classMutations;
    observer.trigger();observer.trigger();observer.trigger();
    await flush();
    assert.equal(h.button.classMutations,changes,'sync coalesces and settles without marker churn');
    f.view.onunload();
    assert.equal(observer.disconnected,true);
    assert.equal(marked(h.button),false);
    assert.equal(f.view.nativePropertiesButtons.size,0);
    assert.equal(f.view.nativePropertiesObserver,null);
  }
  groups++;

  // Delayed chrome, replacement controls and stale markers.
  {
    const f=make();
    const cleanup=f.view.cleanup;
    f.view.onload();
    const observer=f.view.nativePropertiesObserver;
    assert.equal(f.view.nativePropertiesButtons.size,0);
    const h=host(f);
    observer.trigger();
    await flush();
    assert.equal(marked(h.button),true);
    h.toolbar.empty();
    const replacement=h.toolbar.createDiv({cls:'bases-toolbar-properties-menu'});
    observer.trigger();
    await flush();
    assert.equal(marked(h.button),false,'detached old button loses marker');
    assert.equal(marked(replacement),true);
    observer.trigger();
    cleanup[0]();
    await flush();
    assert.equal(marked(replacement),false,'unload invalidates already queued sync');
    assert.equal(observer.disconnected,true);
    assert.equal(f.view.nativePropertiesLoaded,false);
  }
  groups++;

  // View switches and host visibility/type changes remove markers and can recover.
  {
    const f=make(),h=host(f);
    f.view.onload();
    const observer=f.view.nativePropertiesObserver;
    for(const [set,restore]of [
      [()=>{f.container.hidden=true;},()=>{f.container.hidden=false;}],
      [()=>{f.base.style.display='none';},()=>{f.base.style.display='';}],
      [()=>{f.container.attributes['aria-hidden']='true';},()=>{delete f.container.attributes['aria-hidden'];}],
      [()=>{f.owner.attributes['data-type']='markdown';},()=>{f.owner.attributes['data-type']='bases';}],
      [()=>{f.view.type='table';},()=>{f.view.type='pdfium-document-register';}],
      [()=>{f.container.isConnected=false;},()=>{f.container.isConnected=true;}]
    ]) {
      set();observer.trigger();await flush();
      assert.equal(marked(h.button),false,'inactive/hidden/wrong-type host stays visible');
      restore();observer.trigger();await flush();
      assert.equal(marked(h.button),true,'restored custom view is recognized');
    }
    const nativeTable=f.base.createDiv({cls:'bases-table'});
    observer.trigger();await flush();
    assert.equal(marked(h.button),false,'another current view makes ownership ambiguous');
    f.base.children.splice(f.base.children.indexOf(nativeTable),1);
    nativeTable.parentElement=null;
    observer.trigger();await flush();
    assert.equal(marked(h.button),true);
    f.base.children=[];
    f.container.parentElement=null;
    f.base.createDiv({cls:'bases-table'});
    observer.trigger();await flush();
    assert.equal(marked(h.button),false,'switch to built-in table releases native Properties');
    f.view.onunload();
  }
  groups++;

  // Independent leaves and nested chrome never share a marker.
  {
    const root=new Element();
    const first=make({root}),firstHost=host(first);
    const second=make({root}),secondHost=host(second);
    first.view.onload();
    assert.equal(marked(firstHost.button),true);
    assert.equal(marked(secondHost.button),false,'other Bases view keeps Properties');
    const nested=make({root:first.container}),nestedHost=host(nested);
    nested.view.type='table';
    nested.view.onload();
    assert.equal(marked(nestedHost.button),false);
    first.view.syncNativePropertiesButtons();
    assert.equal(marked(firstHost.button),true);
    second.view.onload();
    assert.equal(marked(secondHost.button),true,'second custom register owns only its own marker');
    first.view.onunload();
    assert.equal(marked(firstHost.button),false);
    assert.equal(marked(secondHost.button),true);
    second.view.onunload();nested.view.onunload();
  }
  groups++;

  // Ambiguous/unknown host shapes and absent cleanup/observer fail open.
  for(const mutate of [
    f=>{f.content.createDiv({cls:'bases-view'});},
    f=>{f.content.createDiv({cls:'bases-header'});},
    (f,h)=>{h.header.createDiv({cls:'bases-toolbar'});},
    (f,h)=>{h.toolbar.createDiv({cls:'bases-toolbar-properties-menu'});},
    f=>{f.base.createDiv({cls:'pdfium-document-register-base-view'});},
    f=>{delete f.owner.attributes['data-type'];},
    f=>{f.view.register=undefined;},
    f=>{f.container.ownerDocument={defaultView:{MutationObserver:class {constructor(){throw Error('unavailable');}}}};},
    f=>{f.container.ownerDocument={defaultView:{MutationObserver:class {observe(){throw Error('unavailable');}disconnect(){}}}};}
  ]) {
    const f=make(),h=host(f);
    mutate(f,h);
    f.view.onload();
    assert.equal(marked(h.button),false,'uncertain ownership leaves Properties available');
    f.view.onunload();
  }
  {
    const f=make(),h=host(f);
    delete sandbox.MutationObserver;
    delete f.container.ownerDocument;
    f.view.onload();
    assert.equal(marked(h.button),false,'missing observer fails open');
    assert.equal(f.view.nativePropertiesObserver,null);
    f.view.onunload();
    sandbox.MutationObserver=LocalObserver;
  }
  groups++;

  // Moving a live custom view rebinds its observer and releases the previous header.
  {
    const root=new Element(),f=make({root}),h=host(f),other=make({root}),otherHost=host(other);
    f.view.onload();
    const oldObserver=f.view.nativePropertiesObserver;
    f.base.empty();
    other.base.empty();
    other.base.children.push(f.container);
    f.container.parentElement=other.base;
    oldObserver.trigger();await flush();
    assert.equal(marked(h.button),false);
    assert.equal(marked(otherHost.button),true);
    assert.equal(oldObserver.disconnected,true);
    assert.equal(f.view.nativePropertiesObserverRoot,other.content);
    f.view.onunload();
    assert.equal(marked(otherHost.button),false);
  }
  groups++;

  // The existing column picker still opens and applies visibility in empty and populated registers.
  for(const entries of [false,true]) {
    const f=make({entries});
    f.view.onDataUpdated();await flush();
    let hidden=[],writes=0;
    f.view.config.get=key=>key==='pdfiumHiddenColumns' ? hidden : [];
    f.view.config.set=(key,value)=>{
      assert.equal(key,'pdfiumHiddenColumns','only the existing view visibility preference is written');
      hidden=Array.from(value);writes++;
    };
    f.container.all().find(el=>el.tagName==='BUTTON' && el.text==='Choose columns').click();
    const modal=sandbox.Modal.latest;
    const checkboxes=modal.contentEl.all().filter(el=>el.tagName==='INPUT');
    assert.equal(checkboxes.length,2);
    const apply=modal.contentEl.all().find(el=>el.text===dictionaries.en['documentRegister.columns.apply']);
    checkboxes[0].checked=false;checkboxes[1].checked=false;
    apply.click();
    assert.equal(writes,0,'at least one visible column is required');
    checkboxes[0].checked=true;
    apply.click();
    await flush();
    assert.equal(writes,1);
    assert.deepEqual(hidden,['filemeta_status']);
    assert.equal(modal.contentEl.children.length,0,'successful apply closes the modal');
    if(entries) assert.equal(f.container.all().filter(el=>el.tagName==='TH').length,1,'redraw honors the column choice');
  }
  groups++;

  console.log('Document Register native Properties/columns: '+groups+' groups passed (observed DOM, local observation, lifecycle, isolation, failure handling, seven locales, status routes and persistent schema-aware columns).');
})().catch(error=>{console.error(error.stack || error);process.exitCode=1;});
