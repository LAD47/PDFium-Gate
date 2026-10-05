'use strict';

const sanitizeHtml = require('sanitize-html');
const { toBuffer } = require('../../core/integrity/sha256');
const { normalizeContentId, decodeCidReference, analyzeEmailAttachments } = require('../attachments/attachment-policy');

const EMAIL_ATTACHMENT_PROTOCOL_ACTION = 'pdfium-gate-email-attachment';

const ALLOWED_MESSAGE_TAGS = [
  'p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'a', 'img'
];

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attachmentDataUrlForCid(attachments, src) {
  const cid = decodeCidReference(src);
  if (!cid) return null;
  const list = Array.isArray(attachments) ? attachments : [];
  const attachment = list.find(item => normalizeContentId(item?.contentId) === cid);
  if (!attachment) return null;

  const contentType = String(attachment.contentType || '').trim().toLowerCase();
  if (!contentType.startsWith('image/')) return null;
  if (attachment.content == null) return null;

  const content = toBuffer(attachment.content);
  return `data:${contentType};base64,${content.toString('base64')}`;
}

function sanitizeMessageHtml(sourceHtml, attachments) {
  const html = String(sourceHtml == null ? '' : sourceHtml);

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_MESSAGE_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['data']
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => {
        const href = String(attribs.href || '').trim();
        const safeHref = /^(?:https?:|mailto:)/i.test(href) ? href : null;
        const next = {};
        if (safeHref) next.href = safeHref;
        if (attribs.title) next.title = attribs.title;
        return { tagName, attribs: next };
      },
      img: (tagName, attribs) => {
        const next = {};
        const dataUrl = attachmentDataUrlForCid(attachments, attribs.src);
        if (dataUrl) next.src = dataUrl;
        next.alt = attribs.alt ? `${attribs.alt}${dataUrl ? '' : ' [image blocked]'}` : (dataUrl ? '' : '[image blocked]');
        if (attribs.title) next.title = attribs.title;
        return { tagName, attribs: next };
      }
    }
  });
}

function formatAddress(address) {
  const name = String(address?.name || '').trim();
  const email = String(address?.address || '').trim();
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

function formatAddressList(addresses) {
  const list = Array.isArray(addresses) ? addresses : [];
  return list.map(formatAddress).filter(Boolean).join(', ');
}

function formatDateTime(dateTime) {
  if (!dateTime || typeof dateTime !== 'object') return '';
  if (dateTime.raw) return String(dateTime.raw);
  if (dateTime.iso) return String(dateTime.iso);
  return '';
}

function renderPlainTextBody(text) {
  return `<pre class="email-plain-text">${escapeHtml(text == null ? '' : text)}</pre>`;
}

function renderBody(document) {
  if (typeof document?.body?.html === 'string' && document.body.html.trim() !== '') {
    return `<div class="email-html-body">${sanitizeMessageHtml(document.body.html, document.attachments)}</div>`;
  }
  return renderPlainTextBody(document?.body?.text);
}

function emailAttachmentProtocolUri(document, attachment, index) {
  const sourceSha256 = String(document?.source?.sha256 || '').trim().toLowerCase();
  const attachmentSha256 = String(attachment?.sha256 || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceSha256) || !/^[0-9a-f]{64}$/.test(attachmentSha256)) return null;
  const ordinal = Number.isInteger(index) && index >= 0 ? index : 0;
  return `obsidian://${EMAIL_ATTACHMENT_PROTOCOL_ACTION}?source=${encodeURIComponent(sourceSha256)}&attachment=${encodeURIComponent(attachmentSha256)}&index=${ordinal}`;
}

function renderManifestEntry(document, entry) {
  const attachment={sha256:entry?.sourceAttachmentSha256};
  const uri=emailAttachmentProtocolUri(document,attachment,Number(entry?.relationIndex));
  const label=`<strong>${escapeHtml(entry?.displayName || entry?.relativePath || '(unnamed attachment)')}</strong>`;
  return `<li>${uri ? `<a href="${escapeHtml(uri)}">${label}</a>` : label}</li>`;
}

function renderAttachmentManifest(document, manifest) {
  const groups=Array.isArray(manifest?.groups)?manifest.groups:[];
  if(!groups.length) return '<p class="email-no-attachments">Ingen vedlegg</p>';
  return `<ul class="email-attachments">${groups.map(group=>{
    const entries=Array.isArray(group?.entries)?group.entries:[];
    if(group?.type==='archive') {
      return `<li><strong>${escapeHtml(group.label || 'ZIP')}</strong><ul>${entries.map(entry=>renderManifestEntry(document,entry)).join('')}</ul></li>`;
    }
    return entries.map(entry=>renderManifestEntry(document,entry)).join('');
  }).join('')}</ul>`;
}

function renderAttachmentList(document, attachmentManifest = null) {
  if(attachmentManifest) return renderAttachmentManifest(document,attachmentManifest);
  const analysis = analyzeEmailAttachments(document);
  const list = analysis.attachments;

  return list.length
    ? `<ul class="email-attachments">${list.map((item, index) => {
      const attachment = item.attachment || {};
      const filename = attachment.filename || '(unnamed attachment)';
      const uri = emailAttachmentProtocolUri(document, attachment, index);
      const label = `<strong>${escapeHtml(filename)}</strong>`;
      return `<li>${uri ? `<a href="${escapeHtml(uri)}">${label}</a>` : label}</li>`;
    }).join('')}</ul>`
    : '<p class="email-no-attachments">Ingen vedlegg</p>';
}

function renderHeaderRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function renderEmailDocumentToHtml(document, options = {}) {
  if (!document || typeof document !== 'object') {
    throw new TypeError('Canonical Email Document must be an object.');
  }
  if (document.schemaVersion !== 1) {
    throw new TypeError('Canonical Email Document schemaVersion 1 is required.');
  }

  const subject = document.message?.subject == null ? '' : String(document.message.subject);
  const rows = [
    renderHeaderRow('From', formatAddressList(document.message?.from)),
    renderHeaderRow('To', formatAddressList(document.message?.to)),
    renderHeaderRow('Cc', formatAddressList(document.message?.cc)),
    renderHeaderRow('Date', formatDateTime(document.message?.dateTime))
  ].join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(CONTENT_SECURITY_POLICY)}">
<title>${escapeHtml(subject)}</title>
<style>
  html { background: #fff; color: #111; }
  body { font-family: Arial, sans-serif; margin: 32px; line-height: 1.45; }
  h1 { font-size: 1.5rem; margin: 0 0 20px; }
  .email-header { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  .email-header th { text-align: left; vertical-align: top; width: 72px; padding: 3px 12px 3px 0; }
  .email-header td { padding: 3px 0; overflow-wrap: anywhere; }
  .email-body { margin: 24px 0; overflow-wrap: anywhere; }
  .email-plain-text { white-space: pre-wrap; font: inherit; }
  .email-html-body img { max-width: 100%; height: auto; }
  .email-html-body table { border-collapse: collapse; max-width: 100%; }
  .email-html-body th, .email-html-body td { border: 1px solid #bbb; padding: 4px 6px; }
  .attachments { margin-top: 28px; border-top: 1px solid #ccc; padding-top: 16px; }
  .email-attachments a { color: inherit; text-decoration: underline; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(subject)}</h1>
<table class="email-header"><tbody>${rows}</tbody></table>
<section class="email-body">${renderBody(document)}</section>
<section class="attachments"><h2>Vedlegg</h2>${renderAttachmentList(document,options.attachmentManifest || null)}</section>
</main>
</body>
</html>
`;
}

module.exports = {
  EMAIL_ATTACHMENT_PROTOCOL_ACTION,
  CONTENT_SECURITY_POLICY,
  escapeHtml,
  sanitizeMessageHtml,
  renderEmailDocumentToHtml,
  renderAttachmentList,
  renderAttachmentManifest,
  emailAttachmentProtocolUri,
  attachmentDataUrlForCid,
  formatAddress,
  formatAddressList
};
