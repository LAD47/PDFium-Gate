'use strict';

const crypto=require('crypto');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const recordApi=require(path.join(ROOT,'src/metadata/record-contract.js'));
const schemaApi=require(path.join(ROOT,'src/metadata/schema-contract.js'));
const repositoryApi=require(path.join(ROOT,'src/metadata/record-repository.js'));
const recoveryApi=require(path.join(ROOT,'src/metadata/missing-recovery.js'));

const fail=message=>{ throw new Error(`Document record SHA-256 test failed: ${message}`); };
const schema=schemaApi.metadataDefaultSchema();
const id='123e4567-e89b-42d3-a456-426614174000';
const pdfBytes=new Map([
  ['Docs/a.pdf',Buffer.from('%PDF-a-original\n','utf8')],
  ['Copies/a.pdf',Buffer.from('%PDF-a-original\n','utf8')],
  ['Docs/b.pdf',Buffer.from('%PDF-b-other\n','utf8')]
]);
const files=new Map();
for(const pdfPath of pdfBytes.keys()) files.set(pdfPath,{path:pdfPath,extension:'pdf'});
const markdown=new Map();

function parseScalar(text){
  const value=String(text||'').trim();
  if(value==='null') return null;
  if(value==='true') return true;
  if(value==='false') return false;
  if(/^[-+]?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if(value.startsWith('"')) return JSON.parse(value);
  return value;
}
function parseYamlSimple(source){
  const out={};
  for(const rawLine of String(source||'').split(/\r?\n/)){
    if(!rawLine || /^\s/.test(rawLine)) continue;
    const match=/^([^:]+):\s*(.*)$/.exec(rawLine);
    if(!match) continue;
    out[String(match[1]).trim()]=parseScalar(match[2]);
  }
  return out;
}
function frontmatterFromMarkdown(text){
  const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(String(text||''));
  return match ? parseYamlSimple(match[1]) : {};
}
function serializeFrontmatter(frontmatter){
  const lines=['---'];
  for(const [key,value] of Object.entries(frontmatter)){
    if(value===undefined || value===null) continue;
    if(typeof value==='boolean' || typeof value==='number') lines.push(`${key}: ${String(value)}`);
    else lines.push(`${key}: ${JSON.stringify(String(value))}`);
  }
  lines.push('---','');
  return `${lines.join('\n')}\n`;
}

const vaultReadAdapter={
  async readBinary(file){
    const value=pdfBytes.get(String(file?.path||''));
    if(!value) throw new Error(`missing binary ${file?.path||''}`);
    return value;
  },
  async readText(file){ return markdown.get(String(file?.path||'')) || ''; },
  getAbstractFileByPath(p){ return files.get(String(p||'')) || null; },
  listFiles(){ return [...files.values()].filter(file=>file.extension==='pdf'); }
};
const vaultWriteAdapter={
  async ensureFolder(){ return null; },
  async createText(p,data){
    const file={path:String(p),extension:'md'};
    files.set(file.path,file);
    markdown.set(file.path,String(data));
    return file;
  }
};
const frontmatterAdapter={
  async processFrontMatter(file,callback){
    const current=frontmatterFromMarkdown(markdown.get(file.path)||'');
    callback(current);
    markdown.set(file.path,serializeFrontmatter(current));
  }
};

(async()=>{
  const repository=repositoryApi.createMetadataRecordRepository({
    vaultReadAdapter,
    vaultWriteAdapter,
    frontmatterAdapter,
    parseYamlFn:parseYamlSimple,
    recordApi
  });

  const expected=crypto.createHash('sha256').update(pdfBytes.get('Docs/a.pdf')).digest('hex');
  const computed=await repository.computeFileSha256('Docs/a.pdf');
  if(computed!==expected) fail('repository hash differs from PDF bytes');

  const created=await repository.createRecord({
    id,
    pdfPath:'Docs/a.pdf',
    status:recordApi.METADATA_RECORD_STATUS_ACTIVE,
    values:{}
  },schema);
  if(!created.ok || created.record.sha256!==expected) fail('active record did not persist computed SHA-256');
  if(!markdown.get(created.recordPath).includes(`filemeta_sha256: "${expected}"`)) fail('Markdown record omitted SHA-256');

  const missing=await repository.updateRecord(created.file,{
    id,
    pdfPath:'Docs/a.pdf',
    status:recordApi.METADATA_RECORD_STATUS_MISSING,
    values:{}
  },schema);
  if(!missing.ok || missing.record.sha256!==expected) fail('missing transition did not preserve SHA-256 identity');

  let recovery=await recoveryApi.metadataFindExactMissingPdfMatches({vaultReadAdapter,sha256:expected});
  if(!recovery.ok || recovery.reason!=='multiple-exact-matches' || recovery.matches.length!==2) fail('multiple identical PDFs did not fail closed');

  files.delete('Copies/a.pdf');
  pdfBytes.delete('Copies/a.pdf');
  recovery=await recoveryApi.metadataFindExactMissingPdfMatches({vaultReadAdapter,sha256:expected});
  if(!recovery.ok || !recovery.matched || recovery.reason!=='exact-match' || recovery.match?.path!=='Docs/a.pdf') fail('single exact SHA-256 match was not identified');

  recovery=await recoveryApi.metadataFindExactMissingPdfMatches({vaultReadAdapter,sha256:'f'.repeat(64)});
  if(!recovery.ok || recovery.matched || recovery.reason!=='no-exact-match') fail('no-match case did not remain fail closed');

  recovery=await recoveryApi.metadataFindExactMissingPdfMatches({vaultReadAdapter,sha256:null});
  if(recovery.ok || recovery.reason!=='missing-sha256') fail('record without SHA-256 was treated as recoverable');

  console.log('Document record SHA-256 recovery OK: persisted byte identity, preserved missing identity, exact-only matching, ambiguity fail closed.');
})().catch(error=>{
  console.error(error?.stack || error);
  process.exit(1);
});
