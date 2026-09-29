'use strict';

const BLOCK_START = '<!-- pdfium-gate:email-attachments:start -->';
const BLOCK_END = '<!-- pdfium-gate:email-attachments:end -->';

function normalizeVaultPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function attachmentWikilink(vaultPath) {
  const path = normalizeVaultPath(vaultPath);
  if (!path) throw new Error('Attachment vault path is empty.');
  if(/[\r\n]/.test(path) || path.includes(']]')) throw new Error('Attachment vault path cannot be represented safely as an Obsidian wikilink.');
  return `[[${path}]]`;
}

function normalizeAttachmentPaths(paths) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(paths) ? paths : []) {
    const path = normalizeVaultPath(value);
    if (!path || seen.has(path)) continue;
    attachmentWikilink(path);
    seen.add(path);
    result.push(path);
  }
  return result;
}

function renderEmailAttachmentLinkBlock(paths) {
  const normalized = normalizeAttachmentPaths(paths);
  if (!normalized.length) return '';
  return [
    BLOCK_START,
    ...normalized.map(path => `- ${attachmentWikilink(path)}`),
    BLOCK_END
  ].join('\n');
}

function attachmentBlockPattern() {
  return new RegExp(`${BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
}

function upsertEmailAttachmentLinkBlock(markdown, paths) {
  const source = String(markdown == null ? '' : markdown);
  const block = renderEmailAttachmentLinkBlock(paths);
  const without = source.replace(attachmentBlockPattern(), '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  if (!block) return without ? `${without}\n` : '';
  return `${without}${without ? '\n\n' : ''}${block}\n`;
}

function extractEmailAttachmentLinkPaths(markdown) {
  const source = String(markdown == null ? '' : markdown);
  const match = attachmentBlockPattern().exec(source);
  if (!match) return [];
  const result = [];
  const seen = new Set();
  const re = /\[\[([^\]\r\n]+)\]\]/g;
  let link;
  while ((link = re.exec(match[0])) !== null) {
    const path = normalizeVaultPath(String(link[1] || '').split('|', 1)[0]);
    if (path && !seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

module.exports = {
  BLOCK_START,
  BLOCK_END,
  normalizeVaultPath,
  attachmentWikilink,
  normalizeAttachmentPaths,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths
};
