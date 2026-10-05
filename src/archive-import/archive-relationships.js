'use strict';

const BLOCK_START='<!-- pdfium-gate:archive-relations:start -->';
const BLOCK_END='<!-- pdfium-gate:archive-relations:end -->';

function normalizeVaultPath(value){
  return String(value||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').trim();
}

function escapeRegex(value){
  return String(value||'').replace(/[.*+?^()|[\]\\]/g,'\\$&');
}

function archiveWikilink(vaultPath){
  const path=normalizeVaultPath(vaultPath);
  if(!path) throw new Error('Archive relationship path is empty.');
  if(/[\r\n]/.test(path)||path.includes(']]')) throw new Error('Archive relationship path cannot be represented safely as an Obsidian wikilink.');
  return '[['+path+']]';
}

function normalizeUniquePaths(paths){
  const out=[];
  const seen=new Set();
  for(const value of Array.isArray(paths)?paths:[]){
    const path=normalizeVaultPath(value);
    if(!path||seen.has(path)) continue;
    archiveWikilink(path);
    seen.add(path);
    out.push(path);
  }
  return out;
}

function safeArchiveName(value){
  const text=String(value||'').trim();
  if(!text) return '';
  if(/[\r\n]/.test(text)) throw new Error('Archive source name contains a newline.');
  return text;
}

function safeSha256(value){
  const sha=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(sha)?sha:'';
}

function renderArchiveRelationshipBlock({
  sourceZipPath=null,
  sourceArchiveName=null,
  sourceArchiveSha256=null,
  parentDocumentPath=null,
  memberPaths,
  selfPath
}={}){
  const legacySource=normalizeVaultPath(sourceZipPath);
  const archiveName=safeArchiveName(sourceArchiveName || (legacySource ? legacySource.split('/').pop() : ''));
  if(!legacySource && !archiveName) throw new Error('Archive source identity is required.');
  if(legacySource) archiveWikilink(legacySource);
  const parent=normalizeVaultPath(parentDocumentPath);
  if(parent) archiveWikilink(parent);
  const sha=safeSha256(sourceArchiveSha256);
  const self=normalizeVaultPath(selfPath);
  const members=normalizeUniquePaths(memberPaths).filter(path=>path!==self && path!==legacySource && path!==parent);
  const lines=[BLOCK_START];
  if(legacySource) lines.push('- archive: '+archiveWikilink(legacySource));
  if(archiveName) lines.push('- archive-name: '+JSON.stringify(archiveName));
  if(sha) lines.push('- archive-sha256: '+sha);
  if(parent) lines.push('- parent: '+archiveWikilink(parent));
  lines.push(...members.map(path=>'- member: '+archiveWikilink(path)));
  lines.push(BLOCK_END);
  return lines.join('\n');
}

function archiveBlockPattern(){
  return new RegExp(escapeRegex(BLOCK_START)+'[\\s\\S]*?'+escapeRegex(BLOCK_END),'g');
}

function upsertArchiveRelationshipBlock(markdown,model){
  const source=String(markdown==null?'':markdown);
  const block=renderArchiveRelationshipBlock(model);
  const without=source.replace(archiveBlockPattern(),'').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trimEnd();
  return without+(without?'\n\n':'')+block+'\n';
}

function parseJsonString(value){
  try{
    const parsed=JSON.parse(String(value||''));
    return typeof parsed==='string'?parsed:'';
  }catch(_){ return ''; }
}

function extractArchiveRelationship(markdown){
  const source=String(markdown==null?'':markdown);
  const match=archiveBlockPattern().exec(source);
  if(!match) return null;
  const lines=match[0].split(/\r?\n/);
  let sourceZipPath=null;
  let sourceArchiveName=null;
  let sourceArchiveSha256=null;
  let parentDocumentPath=null;
  const memberPaths=[];
  const seen=new Set();
  for(const line of lines){
    const trimmed=line.trim();
    let m=/^-\s+(archive|parent|member):\s+\[\[([^\]\r\n]+)\]\]\s*$/.exec(trimmed);
    if(m){
      const path=normalizeVaultPath(String(m[2]||'').split('|',1)[0]);
      if(!path) continue;
      if(m[1]==='archive') sourceZipPath=path;
      else if(m[1]==='parent') parentDocumentPath=path;
      else if(!seen.has(path)){ seen.add(path); memberPaths.push(path); }
      continue;
    }
    m=/^-\s+archive-name:\s+(.+)$/.exec(trimmed);
    if(m){
      sourceArchiveName=parseJsonString(m[1]) || String(m[1]||'').trim();
      continue;
    }
    m=/^-\s+archive-sha256:\s+([0-9a-fA-F]{64})\s*$/.exec(trimmed);
    if(m) sourceArchiveSha256=m[1].toLowerCase();
  }
  if(!sourceArchiveName && sourceZipPath) sourceArchiveName=sourceZipPath.split('/').pop()||sourceZipPath;
  return {sourceZipPath,sourceArchiveName,sourceArchiveSha256,parentDocumentPath,memberPaths};
}

module.exports={
  BLOCK_START,
  BLOCK_END,
  normalizeVaultPath,
  archiveWikilink,
  normalizeUniquePaths,
  safeArchiveName,
  safeSha256,
  renderArchiveRelationshipBlock,
  upsertArchiveRelationshipBlock,
  extractArchiveRelationship
};
