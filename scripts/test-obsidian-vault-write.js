'use strict';

const assert=require('assert/strict');
const {vaultBinaryArrayBuffer,createObsidianVaultWriteAdapter}=require('../src/platform/obsidian-vault-write');

(async()=>{
  const calls=[];
  const vault={
    async createBinary(path,data){
      calls.push({kind:'create',path,data});
      return {path,extension:(path.split('.').pop()||'').toLowerCase()};
    },
    async modifyBinary(file,data){
      calls.push({kind:'modify',path:file.path,data});
    },
    getAbstractFileByPath(){ return null; },
    async createFolder(path){ return {path,children:[]}; },
    async create(path,data){ return {path,extension:(path.split('.').pop()||'').toLowerCase(),data}; },
    async modify(){},
    async delete(){}
  };
  const trashed=[];
  const fileManager={
    async trashFile(file){ trashed.push(file?.path || ''); }
  };
  const adapter=createObsidianVaultWriteAdapter({vault,fileManager});
  const source=Buffer.from([1,2,3,4,5]);
  const created=await adapter.createBinary('05 test/a.bin',source);
  assert.equal(created.path,'05 test/a.bin');
  assert.equal(calls.length,1);
  assert.ok(calls[0].data instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(calls[0].data)],[1,2,3,4,5]);

  const view=new Uint8Array([9,8,7]);
  await adapter.modifyBinary(created,view);
  assert.equal(calls.length,2);
  assert.ok(calls[1].data instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(calls[1].data)],[9,8,7]);

  const direct=vaultBinaryArrayBuffer(new Uint8Array([6,5,4]));
  assert.ok(direct instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(direct)],[6,5,4]);

  await adapter.trashFile({path:'File Metadata/aa/test.md',extension:'md'});
  assert.deepEqual(trashed,['File Metadata/aa/test.md']);

  console.log('Obsidian vault write adapter OK: binary payloads are normalized and user-facing removal routes through FileManager.trashFile.');
})().catch(error=>{
  console.error('Obsidian vault binary write adapter check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
