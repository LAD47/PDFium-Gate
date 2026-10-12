'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class FakeElement {
  constructor(tag='div',parent=null,opts={}) {
    this.tagName=String(tag).toUpperCase();
    this.parentElement=parent;
    this.children=[];
    this.listeners={};
    this.dataset={};
    this.attributes={};
    this.classNames=new Set();
    this.classList={
      add:(...items)=>items.forEach(item=>this.classNames.add(item)),
      remove:(...items)=>items.forEach(item=>this.classNames.delete(item)),
      contains:item=>this.classNames.has(item)
    };
    this.isConnected=true;
    this.textContent=String(opts.text||'');
    this.value=opts.value??'';
    this.disabled=false;
    this.focused=false;
    this.focusCount=0;
    if(opts.cls) this.classList.add(opts.cls);
  }
  createDiv(options={}){return this.createEl('div',typeof options==='string'?{cls:options}:options);}
  createSpan(options={}){return this.createEl('span',options);}
  createEl(tag,options={}) {
    const el=new FakeElement(tag,this,options);
    this.children.push(el);
    return el;
  }
  empty(){this.children.length=0;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  removeAttribute(key){delete this.attributes[key];}
  setText(value){this.textContent=String(value);}
  focus(){this.focused=true;this.focusCount++;}
  select(){this.selected=true;}
  addEventListener(type,callback){(this.listeners[type] ||= []).push(callback);}
  dispatch(type,props={}) {
    let defaultPrevented=false;
    let propagationStopped=false;
    const event={
      type,target:this,key:'',isComposing:false,keyCode:0,
      preventDefault(){defaultPrevented=true;},
      stopPropagation(){propagationStopped=true;},
      ...props
    };
    for(let el=this;el;el=el.parentElement){
      if(el['on'+type]) el['on'+type](event);
      for(const handler of el.listeners[type]||[]) handler(event);
      if(propagationStopped)break;
    }
    return {defaultPrevented,propagationStopped};
  }
  descendants(){
    return [this,...this.children.flatMap(c=>c.descendants())];
  }
  first(tag){
    return this.descendants().find(el=>el.tagName===String(tag).toUpperCase())||null;
  }
}

const registry={
  get(type){
    return {renderEdit(parent,{value}) {
      const tag=type==='select'||type==='multiselect'?'select'
        :type==='multiline'?'textarea':'input';
      const input=parent.createEl(tag);
      input.value=value;
      return {inputEl:input,readRaw:()=>input.value};
    }};
  }
};
const sandbox={
  obsidianModule:{},
  Modal:class {},
  PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE:'pdfium-document-register',
  metadataFieldTypeRegistry:registry,
  metadataPresentationSettings:(settings)=>settings,
  metadataBaseFormatFieldValue:(_registry,_field,value)=>String(value??''),
  metadataBasePrepareFieldUpdate:(field,raw)=>raw==='INVALID'
    ? {ok:false,errors:['Invalid value']}
    : {ok:true,property:field.property,value:raw},
  console
};
vm.createContext(sandbox);
const source=fs.readFileSync(path.join(__dirname,'../src/main/pdf-document-register-bases-view.js'),'utf8');
vm.runInContext(source,sandbox,{filename:'pdf-document-register-bases-view.js'});
const View=vm.runInContext('PdfDocumentRegisterBasesView',sandbox);

function makeEditor(type='text',value='old',saveValues=async(_,patch)=>({ok:true,values:patch})){
  const root=new FakeElement();
  const view=new View({},root,{
    saveValues,
    getSettings:()=>({}),
    getI18n:()=>({t:key=>key})
  });
  const cell=root.createEl('td');
  const field={property:'sender',type,label:'Sender'};
  view.renderDisplayCell(cell,{field,value,pdfPath:'Docs/one.pdf',editable:true});
  const begin=cell.dispatch('keydown',{key:'F2'});
  assert.equal(begin.defaultPrevented,true);
  assert.equal(cell.classList.contains('is-editing'),true);
  const editor=cell.children.find(el=>el.classList.contains('pdfium-document-register-cell-editor'));
  assert.ok(editor,'editor created');
  const input=editor.first(type==='select'||type==='multiselect'?'select':type==='multiline'?'textarea':'input');
  assert.ok(input,'field-type editor input created');
  const buttons=editor.descendants().filter(el=>el.tagName==='BUTTON');
  assert.equal(buttons.length,2);
  return {root,view,cell,editor,input,save:buttons[0],cancel:buttons[1]};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  {
    const updates=[];
    const e=makeEditor('text','before',async(path,patch)=>{
      updates.push({path,patch});
      return {ok:true,values:patch};
    });
    e.input.value='after';
    const action=e.input.dispatch('keydown',{key:'Enter'});
    assert.equal(action.defaultPrevented,true);
    await flush();
    assert.equal(updates.length,1);
    assert.equal(updates[0].path,'Docs/one.pdf');
    assert.equal(updates[0].patch.sender,'after');
    assert.equal(e.cell.classList.contains('is-editing'),false);
    assert.equal(e.cell.dataset.rawValue,'after');
    assert.equal(e.cell.focused,true,'keyboard focus returns to the edited cell');
  }
  {
    const updates=[];
    const e=makeEditor('text','original',async()=>{updates.push('write');return {ok:true};});
    e.input.value='draft';
    const action=e.input.dispatch('keydown',{key:'Escape'});
    assert.equal(action.defaultPrevented,true);
    assert.equal(updates.length,0,'Escape never saves');
    assert.equal(e.cell.dataset.rawValue,'original');
    assert.equal(e.cell.focused,true);
  }
  for(const type of ['select','boolean','multiselect']){
    const updates=[];
    const e=makeEditor(type,'before',async(_,patch)=>{
      updates.push(patch.sender);
      return {ok:true,values:patch};
    });
    e.input.value='new';
    e.input.dispatch('change');
    assert.equal(updates.length,0,`${type} must not save on change before Enter`);
    if(type==='multiselect') {
      e.input.dispatch('keydown',{key:' '});
      assert.equal(updates.length,0,'Space on multi-select remains a selection action');
    }
    e.input.dispatch('keydown',{key:'Escape'});
    assert.equal(updates.length,0,`${type}: Escape cancels selection edits`);
    assert.equal(e.cell.dataset.rawValue,'before');
    const next=makeEditor(type,'before',async(_,patch)=>{
      updates.push(patch.sender);
      return {ok:true,values:patch};
    });
    next.input.value='new';
    next.input.dispatch('keydown',{key:'Enter'});
    await flush();
    assert.deepEqual(updates,['new'],`${type}: Enter saves once`);
  }
  {
    const writes=[];
    const e=makeEditor('multiline','start',async(_,patch)=>{
      writes.push(patch.sender);
      return {ok:true,values:patch};
    });
    e.input.value='two\\nlines';
    e.input.dispatch('keydown',{key:'Enter'});
    assert.equal(writes.length,0,'regular Enter remains newline in multiline editor');
    e.input.dispatch('keydown',{key:'Enter',ctrlKey:true});
    await flush();
    assert.equal(writes.length,1,'Ctrl+Enter saves multiline editor');
  }
  {
    let writes=0;
    const e=makeEditor('text','original',async()=>{writes++;return {ok:true};});
    e.input.dispatch('keydown',{key:'Enter',isComposing:true});
    assert.equal(writes,0,'IME composition Enter must not save');
    e.cancel.dispatch('keydown',{key:'Enter'});
    assert.equal(writes,0,'Enter on cancel button must not save');
    e.cancel.dispatch('click');
    assert.equal(e.cell.dataset.rawValue,'original','cancel button still works');
  }
  {
    const e=makeEditor('text','start',async()=>{throw new Error('synthetic disk failure');});
    e.input.value='new';
    e.input.dispatch('keydown',{key:'Enter'});
    await flush();
    assert.equal(e.cell.classList.contains('has-error'),true);
    assert.equal(e.cell.classList.contains('is-editing'),true);
    assert.equal(e.save.disabled,false);
    e.input.dispatch('keydown',{key:'Escape'});
    assert.equal(e.cell.dataset.rawValue,'start','failed save can be cancelled');
  }
  {
    let complete;
    const e=makeEditor('text','original',()=>new Promise(resolve=>{complete=resolve;}));
    e.input.value='saved';
    e.input.dispatch('keydown',{key:'Enter'});
    assert.equal(typeof complete,'function');
    e.input.dispatch('keydown',{key:'Escape'});
    assert.equal(e.cell.classList.contains('is-editing'),true,'Esc cannot silently undo an in-flight write');
    complete({ok:true,values:{sender:'saved'}});
    await flush();
    assert.equal(e.cell.dataset.rawValue,'saved');
  }
  console.log('Document Register editor keyboard checks OK: Enter saves, Escape cancels, multi/select/boolean parity, multiline safeguard, IME, focus restore, saving race, persistence failure and existing buttons.');
})().catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});
