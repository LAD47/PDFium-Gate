'use strict';

const assert=require('node:assert/strict');
const {createEmailVaultArrivalIndex}=require('../src/plugin/email-import/vault-email-arrival-index');
const {isEmailStagingFile,createVaultEmailCreateTrigger}=require('../src/plugin/email-import/vault-email-create-trigger');

function mail(path,size=100,mtime=1) {
  return {path,extension:path.split('.').pop().toLowerCase(),stat:{size,mtime}};
}
function harness(savedIndex=null) {
  let stored=savedIndex;
  const arrivals=[];
  const persistHistory=[];
  const queued=createVaultEmailCreateTrigger({
    onEmailFile:async file=>{
      arrivals.push(file.path);
      return {ok:false,reason:'synthetic-broken-email'};
    }
  });
  const index=createEmailVaultArrivalIndex({
    savedIndex,
    isEligible:isEmailStagingFile,
    onDiscovered:file=>queued.handleCreate(file),
    persistIndex:async state=>{
      stored=JSON.parse(JSON.stringify(state));
      persistHistory.push(stored);
    }
  });
  return {index,arrivals,persistHistory,getStored:()=>stored,queued};
}

async function run() {
  {
    const h=harness();
    const existing=[mail('Old/legacy.eml'),mail('Old/old.MSG'),mail('Old/a.pdf')];
    const first=await h.index.reconcile(existing);
    assert.equal(first.reason,'first-run-baseline');
    assert.equal(first.tracked,2);
    assert.deepEqual(h.arrivals,[],'first run must not import historical email collection');
    assert.equal(h.getStored().version,1);
    assert.deepEqual(Object.keys(h.getStored().files),['Old/legacy.eml','Old/old.MSG']);

    const unchanged=await h.index.reconcile(existing);
    assert.equal(unchanged.handled,false);
    assert.deepEqual(h.arrivals,[]);
    const newCopy=mail('00_Innboks/new.eml',345,10);
    const imported=await h.index.reconcile([...existing,newCopy]);
    assert.equal(imported.discovered,1);
    assert.deepEqual(h.arrivals,['00_Innboks/new.eml']);
    await h.index.reconcile([...existing,newCopy]);
    assert.equal(h.arrivals.length,1,'failed import must not reappear after every focus');

    const modified=mail('00_Innboks/new.eml',448,20);
    await h.index.reconcile([...existing,modified]);
    assert.equal(h.arrivals.length,2,'a completed Windows copy with changed stat is retryable');
    await h.index.reconcile([...existing,modified]);
    assert.equal(h.arrivals.length,2,'unchanged failed import must not be retried');
    await h.index.reconcile(existing);
    await h.index.reconcile([...existing,mail('00_Innboks/new.eml',448,21)]);
    assert.equal(h.arrivals.length,3,'remove and recreate same path can be reimported');

    const reboot=harness(h.getStored());
    await reboot.index.reconcile([...existing,mail('00_Innboks/new.eml',448,21)]);
    assert.equal(reboot.arrivals.length,0,'restart must not repeatedly import a prior failure');
    await reboot.index.reconcile([...existing,mail('00_Innboks/new.eml',448,21),mail('00_Innboks/offline.msg',1000,90)]);
    assert.deepEqual(reboot.arrivals,['00_Innboks/offline.msg'],'offline Explorer copy is imported on startup or focus');
  }

  {
    const h=harness({version:1,files:{}});
    const imported=await h.index.reconcile([mail('Inbox/disabled.eml')],{importEnabled:false});
    assert.equal(imported.reason,'automatic-import-disabled');
    assert.equal(h.arrivals.length,0);
    await h.index.reconcile([mail('Inbox/disabled.eml')],{importEnabled:true});
    assert.equal(h.arrivals.length,0,'enabling setting must not mass-import files seen while disabled');
    await h.index.reconcile([mail('Inbox/disabled.eml'),mail('Inbox/enabled.msg')],{importEnabled:true});
    assert.deepEqual(h.arrivals,['Inbox/enabled.msg']);
  }

  {
    const h=harness({version:1,files:{}});
    h.index.observeCreate(mail('Cases/live.eml',150,11));
    await h.index.reconcile([mail('Cases/live.eml',150,11)]);
    assert.equal(h.arrivals.length,0,'onCreate arrival tracked so focus scan does not double-import');
    assert.equal(h.index.snapshot().files['Cases/live.eml'],'150:11');
    const same=h.index.observeCreate(mail('Cases/live.eml',150,11));
    assert.equal(same.reason,'already-observed');
    const changed=h.index.observeCreate(mail('Cases/live.eml',200,12));
    assert.equal(changed.handled,true,'new version gets new identity');
    const nonEmail=h.index.observeCreate(mail('.pdf-metadata/email-sources/aa/hidden.eml'));
    assert.equal(nonEmail.handled,false,'hidden retained source never triggers');
    assert.equal(h.index.observeCreate(mail('Cases/file.pdf')).handled,false);
  }

  {
    const h=harness();
    const history=[mail('Old/legacy.eml')];
    await h.index.reconcile(history);
    const subsequent=harness(h.getStored());
    await subsequent.index.reconcile([...history,mail('Inbox/copied-while-closed.EML',170,91)]);
    assert.deepEqual(subsequent.arrivals,['Inbox/copied-while-closed.EML']);
  }

  // Verify the actual plugin feature wires a startup scan and real Vault
  // create callbacks into the same serialized import queue.
  {
    global.createVaultEmailCreateTrigger=createVaultEmailCreateTrigger;
    global.createEmailVaultArrivalIndex=createEmailVaultArrivalIndex;
    global.isEmailStagingFile=isEmailStagingFile;
    const {EmailImportFeature}=require('../src/plugin/features/20-email-import');
    let files=[mail('Old/keep.eml')];
    let saved=null;
    const processed=[];
    let createCallback=null;
    const makeFeature=()=>{
      const feature=new EmailImportFeature();
      feature.settings={
        emailDragDropAutomaticImport:true,
        emailImportObservedStagingIndex:saved
      };
      feature.startEmailImportFromVaultFile=async file=>{
        processed.push(file.path);
        return {ok:true};
      };
      feature.obsidianPluginRegistrationAdapter={registerEvent:()=>{}};
      feature.obsidianVaultLifecycleAdapter={
        onCreate:callback=>{createCallback=callback;return {};},
        onModify:()=>({})
      };
      feature.obsidianVaultReadAdapter={listFiles:()=>files.slice()};
      feature.obsidianPluginDataAdapter={
        saveData:async data=>{saved=JSON.parse(JSON.stringify(data.emailImportObservedStagingIndex));}
      };
      return feature;
    };
    const start=makeFeature();
    start.installEmailImportVaultTrigger();
    await start.reconcileEmailImportVaultFiles();
    assert.deepEqual(processed,[],'startup baseline leaves existing vault mail untouched');
    assert.ok(saved?.files?.['Old/keep.eml']);
    const direct=mail('Inbox/from-explorer.eml',560,102);
    files.push(direct);
    createCallback(direct);
    await start.reconcileEmailImportVaultFiles();
    assert.deepEqual(processed,['Inbox/from-explorer.eml']);
    await start.reconcileEmailImportVaultFiles();
    assert.equal(processed.length,1,'onCreate and focus cannot duplicate a staging import');

    const offline=mail('Inbox/offline-copied.msg',800,130);
    files.push(offline);
    const restarted=makeFeature();
    restarted.installEmailImportVaultTrigger();
    await restarted.reconcileEmailImportVaultFiles();
    assert.equal(processed.filter(v=>v===offline.path).length,1,
      'plugin restart processes previously unseen offline-copied MSG');
    await restarted.reconcileEmailImportVaultFiles();
    assert.equal(processed.filter(v=>v===offline.path).length,1,
      'focus after restart does not process unchanged source again');
    assert.ok(saved.files[offline.path]);
  }

  console.log('Email Vault arrival index OK: safe first-run baseline, offline startup import, focus detection, changed-file retries, no repeated failed dialogs, disabled policy, create dedup and preserved historical EML/MSG.');
}

run().catch(error=>{console.error(error);process.exitCode=1;});
