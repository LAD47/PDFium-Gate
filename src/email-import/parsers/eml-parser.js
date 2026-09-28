'use strict';

const { simpleParser } = require('mailparser');
const { sha256Hex, toBuffer } = require('../integrity/sha256');

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeAddressList(addressObject) {
  const result = [];
  const values = Array.isArray(addressObject?.value) ? addressObject.value : [];

  const add = entry => {
    if (!entry || typeof entry !== 'object') return;
    if (Array.isArray(entry.group)) {
      for (const child of entry.group) add(child);
      return;
    }
    const name = nullableString(entry.name);
    const address = nullableString(entry.address);
    if (name === null && address === null) return;
    result.push({ name, address });
  };

  for (const value of values) add(value);
  return result;
}

function normalizeReferences(value) {
  if (value === undefined || value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  const result = [];

  for (const item of values) {
    const text = nullableString(item);
    if (!text) continue;
    const ids = text.match(/<[^>]+>/g);
    if (ids && ids.length) result.push(...ids.map(id => id.trim()));
    else result.push(text);
  }

  return result;
}

function rawHeaderValue(parsed, headerName) {
  const target = String(headerName).toLowerCase();
  const lines = Array.isArray(parsed?.headerLines) ? parsed.headerLines : [];
  const found = lines.find(entry => String(entry?.key || '').toLowerCase() === target);
  if (!found || typeof found.line !== 'string') return null;
  return found.line.replace(new RegExp(`^${headerName}\\s*:\\s*`, 'i'), '').trim() || null;
}

function normalizeDisposition(attachment) {
  if (attachment?.related === true) return 'inline';
  const value = nullableString(attachment?.contentDisposition)?.toLowerCase();
  if (value === 'inline' || value === 'attachment') return value;
  return null;
}

function normalizeContentId(attachment) {
  const contentId = nullableString(attachment?.contentId);
  if (contentId) return contentId;
  const cid = nullableString(attachment?.cid);
  if (!cid) return null;
  return cid.startsWith('<') && cid.endsWith('>') ? cid : `<${cid}>`;
}

function normalizeAttachment(attachment, index, warnings) {
  const content = attachment?.content == null ? null : toBuffer(attachment.content);
  const filename = nullableString(attachment?.filename);
  if (!filename) warnings.push(`Attachment ${index + 1} has no filename.`);

  return {
    id: `attachment-${index + 1}`,
    filename,
    contentType: nullableString(attachment?.contentType),
    size: content ? content.length : (Number.isInteger(attachment?.size) ? attachment.size : null),
    disposition: normalizeDisposition(attachment),
    contentId: normalizeContentId(attachment),
    related: attachment?.related === true,
    sha256: content ? sha256Hex(content) : null,
    content
  };
}

async function parseEml({ sourceBytes, originalFilename }) {
  const bytes = toBuffer(sourceBytes);
  const filename = nullableString(originalFilename);
  if (!filename) throw new TypeError('originalFilename must be a non-empty string.');

  // Integrity identity is calculated before parsing or normalization.
  const sourceSha256 = sha256Hex(bytes);

  const parsed = await simpleParser(bytes, {
    skipHtmlToText: true,
    skipTextToHtml: true,
    keepCidLinks: true
  });

  const warnings = [];
  const rawDate = rawHeaderValue(parsed, 'Date');
  const validDate = parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime());
  if (rawDate && !validDate) warnings.push('Date header could not be parsed reliably.');

  const text = typeof parsed.text === 'string' ? parsed.text : null;
  const html = typeof parsed.html === 'string' ? parsed.html : null;
  if (text === null && html === null) warnings.push('No plain-text or HTML message body could be recovered.');

  const attachments = (Array.isArray(parsed.attachments) ? parsed.attachments : [])
    .map((attachment, index) => normalizeAttachment(attachment, index, warnings));

  return {
    schemaVersion: 1,

    source: {
      format: 'eml',
      originalFilename: filename,
      byteSize: bytes.length,
      sha256: sourceSha256,
      retained: false,
      retainedPath: null
    },

    identity: {
      messageId: nullableString(parsed.messageId),
      inReplyTo: nullableString(parsed.inReplyTo),
      references: normalizeReferences(parsed.references)
    },

    message: {
      subject: parsed.subject === undefined || parsed.subject === null ? null : String(parsed.subject),
      from: normalizeAddressList(parsed.from),
      to: normalizeAddressList(parsed.to),
      cc: normalizeAddressList(parsed.cc),
      bcc: normalizeAddressList(parsed.bcc),
      replyTo: normalizeAddressList(parsed.replyTo),
      dateTime: {
        iso: validDate ? parsed.date.toISOString() : null,
        raw: rawDate,
        valid: validDate
      }
    },

    body: {
      text,
      html
    },

    attachments,

    diagnostics: {
      warnings
    }
  };
}

module.exports = {
  parseEml,
  normalizeAddressList,
  normalizeReferences
};
