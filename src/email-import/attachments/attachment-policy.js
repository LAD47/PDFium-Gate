'use strict';

const { toBuffer } = require('../../core/integrity/sha256');

function normalizeContentId(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.startsWith('<') && text.endsWith('>') ? text.slice(1, -1) : text;
}

function decodeCidReference(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^cid:/i.test(text)) return '';
  const encoded = text.slice(4);
  try {
    return normalizeContentId(decodeURIComponent(encoded));
  } catch (_error) {
    return normalizeContentId(encoded);
  }
}

function referencedContentIds(html) {
  const source = String(html == null ? '' : html);
  const result = new Set();
  const re = /cid:[^\s"'<>\)]+/gi;
  let match;
  while ((match = re.exec(source)) !== null) {
    const cid = decodeCidReference(match[0]);
    if (cid) result.add(cid);
  }
  return result;
}

function hasPdfPayloadSignature(attachment) {
  if (attachment?.content == null) return false;
  const bytes = toBuffer(attachment.content);
  return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
}

function pdfEvidence(attachment) {
  const evidence = [];
  const contentType = String(attachment?.contentType || '').trim().toLowerCase();
  const filename = String(attachment?.filename || '').trim().toLowerCase();

  if (contentType === 'application/pdf') evidence.push('mime');
  if (hasPdfPayloadSignature(attachment)) evidence.push('payload');
  if (/\.pdf$/.test(filename)) evidence.push('filename');

  return evidence;
}

function classifyAttachment(attachment, referencedCids) {
  const cid = normalizeContentId(attachment?.contentId);
  const referencedInline = Boolean(cid && referencedCids.has(cid));
  const inlineResource = attachment?.related === true || attachment?.disposition === 'inline' || referencedInline;
  const evidence = pdfEvidence(attachment);

  return {
    attachment,
    role: inlineResource ? 'inline-resource' : 'attachment',
    referencedInline,
    extractable: attachment?.content != null,
    pdfCandidate: !inlineResource && evidence.length > 0,
    pdfEvidence: evidence
  };
}

function analyzeEmailAttachments(document) {
  const attachments = Array.isArray(document?.attachments) ? document.attachments : [];
  const referencedCids = referencedContentIds(document?.body?.html);
  const items = attachments.map(attachment => classifyAttachment(attachment, referencedCids));

  return {
    items,
    attachments: items.filter(item => item.role === 'attachment'),
    inlineResources: items.filter(item => item.role === 'inline-resource'),
    pdfCandidates: items.filter(item => item.pdfCandidate),
    extractable: items.filter(item => item.extractable)
  };
}

module.exports = {
  normalizeContentId,
  decodeCidReference,
  referencedContentIds,
  hasPdfPayloadSignature,
  pdfEvidence,
  classifyAttachment,
  analyzeEmailAttachments
};
