'use strict';
const OBSIDIAN_VAULT_WRITE_CONTRACT_VERSION = '0.5';

function vaultBinaryArrayBuffer(data) {
  if(data instanceof ArrayBuffer) return data;
  if(ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  }
  if(data==null) return new ArrayBuffer(0);
  const bytes=Buffer.from(data);
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

function createObsidianVaultWriteAdapter({ vault, fileManager = null }) {
  async function createBinary(vaultPath, data) {
    if (!vault || typeof vault.createBinary !== 'function') throw new Error('vault.createBinary er ikke tilgjengelig');
    return await vault.createBinary(vaultPath, vaultBinaryArrayBuffer(data));
  }
  async function modifyBinary(file, data) {
    if (!vault || typeof vault.modifyBinary !== 'function') throw new Error('vault.modifyBinary er ikke tilgjengelig');
    return await vault.modifyBinary(file, vaultBinaryArrayBuffer(data));
  }
  async function createText(vaultPath, data) {
    if (!vault || typeof vault.create !== 'function') throw new Error('vault.create er ikke tilgjengelig');
    return await vault.create(vaultPath, String(data));
  }
  async function modifyText(file, data) {
    if (!vault || typeof vault.modify !== 'function') throw new Error('vault.modify er ikke tilgjengelig');
    return await vault.modify(file, String(data));
  }
  async function deleteFile(file, force = false) {
    if (!file) throw new Error('vault delete mangler fil');
    if (!vault || typeof vault.delete !== 'function') throw new Error('vault.delete er ikke tilgjengelig');
    return await vault.delete(file, force === true);
  }
  async function trashFile(file) {
    if (!file) throw new Error('trashFile mangler fil');
    if (!fileManager || typeof fileManager.trashFile !== 'function') throw new Error('fileManager.trashFile er ikke tilgjengelig');
    return await fileManager.trashFile(file);
  }
  async function ensureFolder(vaultPath) {
    const target=String(vaultPath||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
    if(!target) return null;
    const existing=typeof vault?.getAbstractFileByPath==='function' ? vault.getAbstractFileByPath(target) : null;
    if(existing){
      if(Array.isArray(existing.children)) return existing;
      throw new Error(`Kan ikke opprette mappe: ${target} finnes, men er ikke en mappe.`);
    }
    if(!vault || typeof vault.createFolder!=='function') throw new Error('vault.createFolder er ikke tilgjengelig');
    return await vault.createFolder(target);
  }
  return Object.freeze({
    contractVersion:OBSIDIAN_VAULT_WRITE_CONTRACT_VERSION,
    createBinary,
    modifyBinary,
    createText,
    modifyText,
    deleteFile,
    trashFile,
    ensureFolder
  });
}
module.exports={OBSIDIAN_VAULT_WRITE_CONTRACT_VERSION,vaultBinaryArrayBuffer,createObsidianVaultWriteAdapter};
