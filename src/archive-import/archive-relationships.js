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

function renderArchiveRelationshipBlock({sourceZipPath,memberPaths,selfPath}={}){
  const source=normalizeVaultPath(sourceZipPath);
  if(!source) throw new Error('Archive source ZIP path is required.');
  archiveWikilink(source);
  const self=normalizeVaultPath(selfPath);
  const members=normalizeUniquePaths(memberPaths).filter(path=>path!==self && path!==source);
  return [
    BLOCK_START,
    '- archive: '+archiveWikilink(source),
    ...members.map(path=>'- member: '+archiveWikilink(path)),
    BLOCK_END
  ].join('\n');
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

function extractArchiveRelationship(markdown){
  const source=String(markdown==null?'':markdown);
  const match=archiveBlockPattern().exec(source);
  if(!match) return null;
  const lines=match[0].split(/\r?\n/);
  let sourceZipPath=null;
  const memberPaths=[];
  const seen=new Set();
  for(const line of lines){
    const m=/^-\s+(archive|member):\s+\[\[([^\]\r\n]+)\]\]\s*$/.exec(line.trim());
    if(!m) continue;
    const path=normalizeVaultPath(String(m[2]||'').split('|',1)[0]);
    if(!path) continue;
    if(m[1]==='archive') sourceZipPath=path;
    else if(!seen.has(path)){ seen.add(path); memberPaths.push(path); }
  }
  return {sourceZipPath,memberPaths};
}

module.exports={
  BLOCK_START,
  BLOCK_END,
  normalizeVaultPath,
  archiveWikilink,
  normalizeUniquePaths,
  renderArchiveRelationshipBlock,
  upsertArchiveRelationshipBlock,
  extractArchiveRelationship
};
