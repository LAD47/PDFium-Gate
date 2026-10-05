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
  const adapter=createObsidianVaultWriteAdapter({vault});
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

  console.log('Obsidian vault binary write adapter OK: Buffer and typed-array payloads are normalized to exact ArrayBuffer slices before Vault.createBinary/modifyBinary.');
})().catch(error=>{
  console.error('Obsidian vault binary write adapter check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
