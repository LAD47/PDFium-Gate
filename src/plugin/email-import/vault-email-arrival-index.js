'use strict';

// Inventory of EML/MSG files already present in the vault.  A first run
// snapshots historical mail sources instead of treating them as a new import
// batch.  Subsequent startups/focus events discover files copied while the
// plugin was inactive, without repeatedly prompting for failed imports.
function createEmailVaultArrivalIndex({
  savedIndex=null,
  isEligible,
  onDiscovered,
  persistIndex
}={}) {
  if(typeof isEligible!=='function') throw new TypeError('isEligible required');
  if(typeof onDiscovered!=='function') throw new TypeError('onDiscovered required');
  if(typeof persistIndex!=='function') throw new TypeError('persistIndex required');

  function pathOf(file) {
    return String(file?.path||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').trim();
  }

  function signature(file) {
    const stat=file?.stat;
    // Obsidian TFile supplies both fields; 'unknown' is a safe fallback for
    // tests/adapters which cannot provide a filesystem stat.
    const size=Number(stat?.size);
    const mtime=Number(stat?.mtime);
    return stat && Number.isFinite(size) && Number.isFinite(mtime)
      ? `${size}:${mtime}` : 'unknown';
  }

  function sanitizeSaved(value) {
    if(!value || value.version!==1 || !value.files || typeof value.files!=='object'
      || Array.isArray(value.files)) return null;
    const out=Object.create(null);
    for(const [key,sig] of Object.entries(value.files)) {
      if(!key || !/\.(eml|msg)$/i.test(key) || typeof sig!=='string') continue;
      out[key]=sig;
    }
    return out;
  }

  let observed=sanitizeSaved(savedIndex);
  let running=false;
  let persistence=Promise.resolve();

  function snapshot() {
    return {version:1,files:{...(observed||{})}};
  }

  async function save() {
    const state=snapshot();
    // Serialized writes prevent a slow earlier save from overwriting the
    // newest inventory. The caller persists this in the normal plugin data.
    persistence=persistence.catch(()=>undefined).then(()=>persistIndex(state));
    await persistence;
  }

  function observeCreate(file) {
    if(!isEligible(file)) return {handled:false};
    const path=pathOf(file);
    if(!path) return {handled:false};
    // No inventory before first startup snapshot: don't accidentally turn an
    // entire existing EML collection into a mass import.
    if(observed===null) return {handled:false,reason:'awaiting-first-baseline'};
    const sig=signature(file);
    if(observed[path]===sig) return {handled:false,reason:'already-observed'};
    observed[path]=sig;
    // Persistence is deliberately fire-and-report here, since Vault create
    // events are synchronous and must not block Obsidian's event dispatcher.
    void save().catch(error=>console.warn('[PDFium Gate] Email arrival index save failed',error));
    return {handled:true,path};
  }

  async function reconcile(files,{importEnabled=true}={}) {
    if(running) return {ok:true,handled:false,reason:'already-reconciling'};
    running=true;
    try {
      const live=Object.create(null);
      const discovered=[];
      for(const file of Array.isArray(files)?files:[]) {
        if(!isEligible(file)) continue;
        const path=pathOf(file);
        if(!path || Object.prototype.hasOwnProperty.call(live,path)) continue;
        const sig=signature(file);
        live[path]=sig;
        if(observed!==null && observed[path]!==sig) discovered.push(file);
      }
      const firstRun=observed===null;
      const changed=firstRun
        || Object.keys(live).length!==Object.keys(observed).length
        || Object.keys(live).some(key=>observed[key]!==live[key]);
      observed=live;
      if(changed) await save();
      if(firstRun) return {ok:true,handled:false,reason:'first-run-baseline',tracked:Object.keys(live).length};
      if(!importEnabled) return {ok:true,handled:false,reason:'automatic-import-disabled',discovered:discovered.length};
      const results=[];
      for(const file of discovered) {
        try { results.push(await onDiscovered(file)); }
        catch(error) { results.push({handled:false,error:error instanceof Error?error.message:String(error)}); }
      }
      return {ok:true,handled:discovered.length>0,discovered:discovered.length,results};
    } finally {
      running=false;
    }
  }

  return Object.freeze({observeCreate,reconcile,snapshot});
}

module.exports={createEmailVaultArrivalIndex};
