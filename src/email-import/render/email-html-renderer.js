'use strict';

const sanitizeHtml = require('sanitize-html');
const { toBuffer } = require('../../core/integrity/sha256');
const { normalizeContentId, decodeCidReference, analyzeEmailAttachments } = require('../attachments/attachment-policy');

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

function renderAttachmentList(document) {
  const analysis = analyzeEmailAttachments(document);
  const list = analysis.attachments;

  const attachmentMarkup = list.length
    ? `<ul class="email-attachments">${list.map(item => {
      const attachment = item.attachment;
      const filename = attachment?.filename || '(unnamed attachment)';
      const contentType = attachment?.contentType || 'unknown type';
      const size = Number.isInteger(attachment?.size) ? `${attachment.size} bytes` : 'unknown size';
      const kind = item.pdfCandidate ? ', PDF' : '';
      return `<li><strong>${escapeHtml(filename)}</strong> <span class="attachment-meta">(${escapeHtml(contentType)}, ${escapeHtml(size)}${escapeHtml(kind)})</span></li>`;
    }).join('')}</ul>`
    : '<p class="email-no-attachments">None</p>';

  const inlineMarkup = analysis.inlineResources.length
    ? `<p class="inline-resource-meta">Embedded inline resources: ${analysis.inlineResources.length}</p>`
    : '';

  return `${attachmentMarkup}${inlineMarkup}`;
}

function renderHeaderRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function renderEmailDocumentToHtml(document) {
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
  .attachment-meta, .inline-resource-meta { color: #555; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(subject)}</h1>
<table class="email-header"><tbody>${rows}</tbody></table>
<section class="email-body">${renderBody(document)}</section>
<section class="attachments"><h2>Attachments</h2>${renderAttachmentList(document)}</section>
</main>
</body>
</html>
`;
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  escapeHtml,
  sanitizeMessageHtml,
  renderEmailDocumentToHtml,
  renderAttachmentList,
  attachmentDataUrlForCid,
  formatAddress,
  formatAddressList
};
