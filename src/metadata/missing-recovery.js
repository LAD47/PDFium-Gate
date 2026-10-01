'use strict';

const metadataMissingRecoveryCrypto=require('crypto');
const METADATA_MISSING_RECOVERY_CONTRACT_VERSION='0.1';

function metadataMissingRecoveryNormalizeSha256(value) {
  const text=String(value == null ? '' : value).trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? text : '';
}

async function metadataMissingRecoveryFileSha256(vaultReadAdapter,file) {
  if(!vaultReadAdapter || typeof vaultReadAdapter.readBinary!=='function') throw new Error('vault readBinary mangler');
  if(!file || String(file.extension || '').toLowerCase()!=='pdf') throw new Error('filen er ikke PDF');
  const bytes=await vaultReadAdapter.readBinary(file);
  const buffer=Buffer.isBuffer(bytes)
    ? bytes
    : bytes instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(bytes))
      : Buffer.from(bytes);
  return metadataMissingRecoveryCrypto.createHash('sha256').update(buffer).digest('hex');
}

async function metadataFindExactMissingPdfMatches({vaultReadAdapter,sha256}) {
  if(!vaultReadAdapter || typeof vaultReadAdapter.listFiles!=='function') return {ok:false,reason:'vault-list-unavailable',matches:[]};
  const wanted=metadataMissingRecoveryNormalizeSha256(sha256);
  if(!wanted) return {ok:false,reason:'missing-sha256',matches:[]};

  const files=(vaultReadAdapter.listFiles() || [])
    .filter(file=>String(file?.extension || '').toLowerCase()==='pdf' && String(file?.path || ''));
  const matches=[];
  const unreadable=[];
  let scanned=0;

  for(const file of files) {
    try {
      const actual=await metadataMissingRecoveryFileSha256(vaultReadAdapter,file);
      scanned++;
      if(actual===wanted) matches.push({path:String(file.path),file});
    } catch(error) {
      unreadable.push({path:String(file?.path || ''),error:error instanceof Error?error.message:String(error)});
    }
  }

  if(matches.length===0) return {ok:true,matched:false,reason:'no-exact-match',sha256:wanted,matches:[],scanned,unreadable};
  if(matches.length===1) return {ok:true,matched:true,reason:'exact-match',sha256:wanted,matches,match:matches[0],scanned,unreadable};
  return {ok:true,matched:false,reason:'multiple-exact-matches',sha256:wanted,matches,scanned,unreadable};
}

module.exports={
  METADATA_MISSING_RECOVERY_CONTRACT_VERSION,
  metadataMissingRecoveryNormalizeSha256,
  metadataMissingRecoveryFileSha256,
  metadataFindExactMissingPdfMatches
};
