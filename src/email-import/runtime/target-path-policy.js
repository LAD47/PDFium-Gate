'use strict';

function normalizeVaultPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function safeFilenamePart(value, fallback = 'email') {
  let text = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/[. ]+$/g, '').trim();
  if (!text) text = fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(text)) text = `_${text}`;
  return text.slice(0, 120).trim() || fallback;
}

function requirePathExistsProbe(pathExists) {
  if (typeof pathExists !== 'function') {
    throw new TypeError('pathExists must be a function.');
  }
  return pathExists;
}

function suggestedEmailPdfPath(document, pathExists) {
  const exists = requirePathExistsProbe(pathExists);
  const subject = safeFilenamePart(document?.message?.subject, 'email');
  const iso = String(document?.message?.dateTime?.iso || '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
  const base = safeFilenamePart(`${date ? `${date} - ` : ''}${subject}`, 'email');
  const folder = 'Email Imports';

  for (let index = 1; index < 10000; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const candidate = `${folder}/${base}${suffix}.pdf`;
    if (!exists(candidate)) return candidate;
  }

  throw new Error('Could not allocate a unique Email Import PDF path.');
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

function validateTargetPdfPath(value, pathExists) {
  const exists = requirePathExistsProbe(pathExists);
  const target = normalizeVaultPath(value);
  if (!target || !/\.pdf$/i.test(target)) {
    return { ok: false, error: 'Target must be a vault-relative .pdf path.' };
  }

  const parts = target.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    return { ok: false, error: 'Target path contains an unsafe segment.' };
  }

  const lower = target.toLowerCase();
  if (lower === '.pdf-metadata'
    || lower.startsWith('.pdf-metadata/')
    || lower === 'file metadata'
    || lower.startsWith('file metadata/')) {
    return { ok: false, error: 'Target PDF cannot be stored in plugin metadata areas.' };
  }

  if (exists(target)) return { ok: false, error: 'Target path already exists.' };
  return { ok: true, path: target };
}

module.exports = {
  normalizeVaultPath,
  safeFilenamePart,
  suggestedEmailPdfPath,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath
};
