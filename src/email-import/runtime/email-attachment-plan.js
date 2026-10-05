'use strict';

const path=require('path');
const {analyzeEmailAttachments}=require('../attachments/attachment-policy');
const {
  sanitizeAttachmentFilename,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes
}=require('../attachments/attachment-extraction');
const {
  isZipAttachment,
  inspectZipAttachment,
  extractZipAttachment
}=require('../../archive-import/zip-archive');

function normalizeVaultPath(value){
  return String(value||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').trim();
}

function attachmentFolderPath(parentPdfPath){
  const parent=normalizeVaultPath(parentPdfPath);
  if(!/\.pdf$/i.test(parent)) throw new Error('Parent email PDF path must end in .pdf.');
  return parent.replace(/\.pdf$/i,'');
}

function uniqueRelativePath(candidate,used){
  let rel=normalizeVaultPath(candidate);
  if(!rel) rel='attachment';
  if(!used.has(rel)){ used.add(rel); return rel; }
  const slash=rel.lastIndexOf('/');
  const folder=slash>=0?rel.slice(0,slash+1):'';
  const name=slash>=0?rel.slice(slash+1):rel;
  const ext=path.posix.extname(name);
  const stem=ext?name.slice(0,-ext.length):name;
  for(let index=2;index<10000;index++){
    const next=`${folder}${stem} (${index})${ext}`;
    if(!used.has(next)){ used.add(next); return next; }
  }
  throw new Error('Could not allocate a unique attachment path.');
}

function outputEntry({
  relationIndex,
  relativePath,
  bytes,
  sha256,
  contentType,
  support,
  sourceAttachmentIndex,
  sourceAttachmentSha256,
  sourceAttachmentFilename,
  archiveName=null,
  archiveSha256=null,
  archiveMemberPath=null,
  attachmentId=null
}){
  return {
    relationIndex,
    relativePath,
    displayName:relativePath.split('/').pop()||relativePath,
    bytes:Buffer.from(bytes||[]),
    sha256:String(sha256||'').toLowerCase(),
    contentType:String(contentType||'application/octet-stream'),
    support:String(support||'native'),
    sourceAttachmentIndex,
    sourceAttachmentSha256:String(sourceAttachmentSha256||'').toLowerCase(),
    sourceAttachmentFilename:String(sourceAttachmentFilename||''),
    archiveName:archiveName?String(archiveName):null,
    archiveSha256:archiveSha256?String(archiveSha256).toLowerCase():null,
    archiveMemberPath:archiveMemberPath?String(archiveMemberPath):null,
    attachmentId:attachmentId?String(attachmentId):null
  };
}

function manifestFromPlan(plan){
  return {
    folderPath:plan.folderPath,
    groups:plan.groups.map(group=>({
      type:group.type,
      label:group.label,
      entries:group.entries.map(entry=>({
        relationIndex:entry.relationIndex,
        relativePath:entry.relativePath,
        displayName:entry.displayName,
        sourceAttachmentSha256:entry.sourceAttachmentSha256
      }))
    }))
  };
}

function buildEmailAttachmentPlan({document,parentPdfPath}){
  const folderPath=attachmentFolderPath(parentPdfPath);
  const analysis=analyzeEmailAttachments(document);
  const items=(analysis.attachments||[]).filter(item=>item?.extractable===true && item?.attachment);
  const used=new Set();
  const entries=[];
  const groups=[];
  let relationIndex=0;
  let archiveCount=0;

  for(let sourceAttachmentIndex=0;sourceAttachmentIndex<items.length;sourceAttachmentIndex++){
    const item=items[sourceAttachmentIndex];
    const attachment=item.attachment;
    const sourceFilename=sanitizeAttachmentFilename(attachment?.filename,attachment);
    const sourceSha256=String(attachment?.sha256||'').toLowerCase();

    if(isZipAttachment(attachment)){
      archiveCount++;
      const inspection=inspectZipAttachment(attachment);
      if(inspection.blockedEntries.length){
        const error=new Error(`ZIP attachment ${sourceFilename} contains blocked or unsafe entries.`);
        error.code='EMAIL_ZIP_PREFLIGHT_FAILED';
        error.archiveName=sourceFilename;
        error.blockedEntries=inspection.blockedEntries;
        throw error;
      }
      const nestedZip=inspection.fileEntries.find(entry=>/\.zip$/i.test(String(entry?.safePath||entry?.originalPath||'')));
      if(nestedZip){
        const error=new Error(`ZIP attachment ${sourceFilename} contains a nested ZIP, which is not supported.`);
        error.code='EMAIL_ZIP_NESTED_UNSUPPORTED';
        error.archiveName=sourceFilename;
        throw error;
      }
      const extracted=extractZipAttachment(attachment,inspection,{includeUnsupported:true});
      const group={type:'archive',label:sourceFilename,entries:[]};
      for(const member of extracted){
        const relativePath=uniqueRelativePath(member.safePath,used);
        const entry=outputEntry({
          relationIndex:relationIndex++,
          relativePath,
          bytes:member.bytes,
          sha256:member.sha256,
          contentType:member.contentType,
          support:member.support,
          sourceAttachmentIndex,
          sourceAttachmentSha256:sourceSha256,
          sourceAttachmentFilename:sourceFilename,
          archiveName:sourceFilename,
          archiveSha256:sourceSha256,
          archiveMemberPath:member.originalPath,
          attachmentId:attachment?.id
        });
        entries.push(entry);
        group.entries.push(entry);
      }
      groups.push(group);
      continue;
    }

    const verified=verifiedAttachmentBytes(attachment);
    let support='native';
    if(item.pdfCandidate===true && Array.isArray(item.pdfEvidence) && item.pdfEvidence.includes('payload')){
      try{
        verifiedPdfAttachmentBytes(attachment);
        support='pdf';
      }catch(_){}
    }
    const relativePath=uniqueRelativePath(sourceFilename,used);
    const entry=outputEntry({
      relationIndex:relationIndex++,
      relativePath,
      bytes:verified.bytes,
      sha256:verified.sha256,
      contentType:attachment?.contentType,
      support,
      sourceAttachmentIndex,
      sourceAttachmentSha256:sourceSha256,
      sourceAttachmentFilename:sourceFilename,
      attachmentId:attachment?.id
    });
    entries.push(entry);
    groups.push({type:'direct',label:sourceFilename,entries:[entry]});
  }

  return {
    ok:true,
    parentPdfPath:normalizeVaultPath(parentPdfPath),
    folderPath,
    entries,
    groups,
    archiveCount,
    attachmentCount:items.length,
    outputCount:entries.length,
    manifest:null
  };
}

function finalizeEmailAttachmentPlan(plan){
  const finalized={...plan};
  finalized.manifest=manifestFromPlan(finalized);
  return finalized;
}

module.exports={
  normalizeVaultPath,
  attachmentFolderPath,
  uniqueRelativePath,
  buildEmailAttachmentPlan,
  finalizeEmailAttachmentPlan,
  manifestFromPlan
};
