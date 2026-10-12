'use strict';

function normalizeVaultPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function safeFilenamePart(value, fallback = 'email') {
  let text = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Double closing brackets cannot be represented as an Obsidian wikilink target.
  text = text.replace(/\]\]/g, '] ]');
  text = text.replace(/[. ]+$/g, '').trim();
  if (!text) text = fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(text)) text = `_${text}`;
  return text.slice(0, 120).trim() || fallback;
}

// Every NEW imported email lives in its own self-contained folder.
// The parent PDF and every extracted attachment are siblings.
function emailBundleFolderPath(parentPdfPath) {
  const parent=normalizeVaultPath(parentPdfPath);
  if(!/\.pdf$/i.test(parent)) throw new Error('Parent email PDF path must end in .pdf.');
  const slash=parent.lastIndexOf('/');
  if(slash<0) throw new Error('Imported email PDF needs a dedicated parent folder.');
  return parent.slice(0,slash);
}

function requirePathExistsProbe(pathExists) {
  if (typeof pathExists !== 'function') {
    throw new TypeError('pathExists must be a function.');
  }
  return pathExists;
}

function suggestedEmailPdfPathInFolder(document, folderPath, pathExists, attachmentFolderLabel = '') {
  const exists=requirePathExistsProbe(pathExists);
  const subject=safeFilenamePart(document?.message?.subject,'email');
  const iso=String(document?.message?.dateTime?.iso || '');
  const date=/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0,10) : '';
  const base=safeFilenamePart(`${date ? `${date} - ` : ''}EPOST- ${subject}`,'EPOST- email');
  const root=normalizeVaultPath(folderPath);

  for(let index=1;index<10000;index++){
    const suffix=index===1 ? '' : ` (${index})`;
    const name=`${base}${suffix}`;
    const bundleFolder=root ? `${root}/${name}` : name;
    const candidate=`${bundleFolder}/${name}.pdf`;
    // Never reuse an existing folder: it might contain unrelated files.
    if(!exists(bundleFolder) && !exists(candidate)) return candidate;
  }
  throw new Error('Could not allocate a unique email bundle folder.');
}

function suggestedEmailPdfPath(document, pathExists, attachmentFolderLabel = '') {
  return suggestedEmailPdfPathInFolder(document, 'Email Imports', pathExists, attachmentFolderLabel);
}

function suggestedAttachmentPdfPath(parentPdfPath, attachment, pathExists) {
  const exists = requirePathExistsProbe(pathExists);
  const parent = normalizeVaultPath(parentPdfPath);
  const slash = parent.lastIndexOf('/');
  const folder = slash >= 0 ? parent.slice(0, slash) : '';
  let filename = safeFilenamePart(attachment?.filename || attachment?.id || 'attachment', 'attachment');
  if (!/\.pdf$/i.test(filename)) filename = `${filename}.pdf`;
  const stem = filename.replace(/\.pdf$/i, '');

  for (let index = 1; index < 10000; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const name = `${stem}${suffix}.pdf`;
    const candidate = folder ? `${folder}/${name}` : name;
    if (!exists(candidate)) return candidate;
  }

  throw new Error('Could not allocate a unique attachment PDF path.');
}

function validateTargetPdfPath(value,pathExists,attachmentFolderLabel='') {
  const exists=requirePathExistsProbe(pathExists);
  const target=normalizeVaultPath(value);
  if(!target || !/\.pdf$/i.test(target)) {
    return {ok:false,error:'Target must be a vault-relative .pdf path.'};
  }
  const parts=target.split('/');
  if(parts.some(part=>!part || part==='.' || part==='..')) {
    return {ok:false,error:'Target path contains an unsafe segment.'};
  }
  const lower=target.toLowerCase();
  if(lower==='.pdf-metadata' || lower.startsWith('.pdf-metadata/')
    || lower==='file metadata' || lower.startsWith('file metadata/')) {
    return {ok:false,error:'Target PDF cannot be stored in plugin metadata areas.'};
  }
  if(parts.length<2) {
    return {ok:false,error:'Email PDF must be stored inside its own folder.'};
  }
  const bundleFolder=emailBundleFolderPath(target);
  const folderName=parts[parts.length-2];
  const pdfName=parts[parts.length-1].slice(0,-4);
  if(folderName!==pdfName) {
    return {ok:false,error:'Email PDF filename must match its dedicated folder name.'};
  }
  if(exists(target)) return {ok:false,error:'Target path already exists.'};
  if(exists(bundleFolder)) {
    return {ok:false,error:'The email bundle folder already exists. Choose a new name.'};
  }
  return {ok:true,path:target,bundleFolder,attachmentFolder:bundleFolder};
}

module.exports = {
  normalizeVaultPath,
  safeFilenamePart,
  emailBundleFolderPath,
  suggestedEmailPdfPath,
  suggestedEmailPdfPathInFolder,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath
};
