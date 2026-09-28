'use strict';

const MsgReaderModule = require('@kenjiuno/msgreader');
const { simpleParser } = require('mailparser');
const { sha256Hex, toBuffer } = require('../integrity/sha256');

const MsgReader = MsgReaderModule.default || MsgReaderModule;

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

function normalizeNativeRecipient(recipient) {
  if (!recipient || typeof recipient !== 'object') return null;
  const name = nullableString(recipient.name);
  const address = nullableString(recipient.smtpAddress) || nullableString(recipient.email);
  if (name === null && address === null) return null;
  return { name, address };
}

function nativeRecipients(fields, recipType) {
  const recipients = Array.isArray(fields?.recipients) ? fields.recipients : [];
  return recipients
    .filter(recipient => String(recipient?.recipType || '').toLowerCase() === recipType)
    .map(normalizeNativeRecipient)
    .filter(Boolean);
}

function nativeSender(fields) {
  const name = nullableString(fields?.senderName);
  const address = nullableString(fields?.senderSmtpAddress)
    || nullableString(fields?.senderEmail)
    || nullableString(fields?.sentRepresentingSmtpAddress)
    || nullableString(fields?.creatorSMTPAddress);
  if (name === null && address === null) return [];
  return [{ name, address }];
}

function normalizeContentId(value) {
  const text = nullableString(value);
  if (!text) return null;
  return text.startsWith('<') && text.endsWith('>') ? text : `<${text}>`;
}

function htmlReferencesContentId(html, contentId) {
  const htmlText = String(html == null ? '' : html);
  const cid = String(contentId == null ? '' : contentId).replace(/^<|>$/g, '');
  if (!cid) return false;
  const escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`cid:${escaped}(?:[\\s\"'<>)]|$)`, 'i').test(htmlText);
}

function decodeHtml(fields, warnings) {
  if (typeof fields?.bodyHtml === 'string') return fields.bodyHtml;
  if (typeof fields?.html === 'string') return fields.html;
  if (fields?.html instanceof Uint8Array || Buffer.isBuffer(fields?.html)) {
    const decoded = Buffer.from(fields.html).toString('utf8').replace(/\0+$/, '');
    if (decoded.includes('\uFFFD')) {
      warnings.push('Binary MSG HTML contained invalid UTF-8 replacement characters.');
    }
    return decoded;
  }
  return null;
}

async function parseTransportHeaders(headers, warnings) {
  const text = nullableString(headers);
  if (!text) return null;

  try {
    return await simpleParser(Buffer.from(`${text.replace(/\s+$/, '')}\r\n\r\n`, 'utf8'), {
      skipHtmlToText: true,
      skipTextToHtml: true
    });
  } catch (error) {
    warnings.push(`MSG transport headers could not be parsed: ${error.message || String(error)}`);
    return null;
  }
}

function normalizeDateTime(fields, headerParsed, warnings) {
  const rawHeaderDate = rawHeaderValue(headerParsed, 'Date');
  if (headerParsed?.date instanceof Date && !Number.isNaN(headerParsed.date.getTime())) {
    return {
      iso: headerParsed.date.toISOString(),
      raw: rawHeaderDate,
      valid: true
    };
  }

  const fallbackRaw = nullableString(fields?.clientSubmitTime)
    || nullableString(fields?.messageDeliveryTime)
    || nullableString(fields?.creationTime);

  if (!fallbackRaw) {
    if (rawHeaderDate) warnings.push('MSG Date header could not be parsed reliably.');
    return { iso: null, raw: rawHeaderDate, valid: false };
  }

  const fallbackDate = new Date(fallbackRaw);
  const valid = !Number.isNaN(fallbackDate.getTime());
  if (!valid) warnings.push('MSG date/time could not be parsed reliably.');

  return {
    iso: valid ? fallbackDate.toISOString() : null,
    raw: rawHeaderDate || fallbackRaw,
    valid
  };
}

function normalizeAttachment(reader, attachment, index, html, warnings) {
  let content = null;
  let readerFilename = null;

  try {
    const extracted = reader.getAttachment(attachment);
    if (extracted?.content != null) content = Buffer.from(toBuffer(extracted.content));
    readerFilename = nullableString(extracted?.fileName);
  } catch (error) {
    warnings.push(`MSG attachment ${index + 1} payload could not be read: ${error.message || String(error)}`);
  }

  const filename = nullableString(attachment?.fileName)
    || nullableString(attachment?.fileNameShort)
    || readerFilename
    || nullableString(attachment?.name);
  if (!filename) warnings.push(`Attachment ${index + 1} has no filename.`);

  const contentId = normalizeContentId(attachment?.pidContentId);
  const related = Boolean(contentId && htmlReferencesContentId(html, contentId));
  const inline = related || Boolean(contentId) || attachment?.attachmentHidden === true;

  return {
    id: `attachment-${index + 1}`,
    filename,
    contentType: nullableString(attachment?.attachMimeTag),
    size: content ? content.length : (Number.isInteger(attachment?.contentLength) ? attachment.contentLength : null),
    disposition: inline ? 'inline' : 'attachment',
    contentId,
    related,
    sha256: content ? sha256Hex(content) : null,
    content
  };
}

async function parseMsg({ sourceBytes, originalFilename }) {
  const bytes = Buffer.from(toBuffer(sourceBytes));
  const filename = nullableString(originalFilename);
  if (!filename) throw new TypeError('originalFilename must be a non-empty string.');

  const sourceSha256 = sha256Hex(bytes);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const reader = new MsgReader(arrayBuffer);
  const fields = reader.getFileData();

  if (!fields || fields.error || fields.dataType !== 'msg') {
    throw new Error(`MSG parser rejected source: ${fields?.error || 'unsupported or malformed MSG data'}`);
  }

  const warnings = [];
  const headerParsed = await parseTransportHeaders(fields.headers, warnings);
  const html = decodeHtml(fields, warnings);
  const text = typeof fields.body === 'string' ? fields.body : null;
  if (text === null && html === null) warnings.push('No plain-text or HTML message body could be recovered.');

  const headerFrom = normalizeAddressList(headerParsed?.from);
  const headerTo = normalizeAddressList(headerParsed?.to);
  const headerCc = normalizeAddressList(headerParsed?.cc);
  const headerBcc = normalizeAddressList(headerParsed?.bcc);

  const from = nativeSender(fields);
  const to = nativeRecipients(fields, 'to');
  const cc = nativeRecipients(fields, 'cc');
  const bcc = nativeRecipients(fields, 'bcc');

  const attachments = (Array.isArray(fields.attachments) ? fields.attachments : [])
    .map((attachment, index) => normalizeAttachment(reader, attachment, index, html, warnings));

  return {
    schemaVersion: 1,

    source: {
      format: 'msg',
      originalFilename: filename,
      byteSize: bytes.length,
      sha256: sourceSha256,
      retained: false,
      retainedPath: null
    },

    identity: {
      messageId: nullableString(fields.messageId) || nullableString(headerParsed?.messageId),
      inReplyTo: nullableString(headerParsed?.inReplyTo),
      references: normalizeReferences(headerParsed?.references)
    },

    message: {
      subject: fields.subject === undefined || fields.subject === null
        ? (headerParsed?.subject === undefined || headerParsed?.subject === null ? null : String(headerParsed.subject))
        : String(fields.subject),
      from: from.length ? from : headerFrom,
      to: to.length ? to : headerTo,
      cc: cc.length ? cc : headerCc,
      bcc: bcc.length ? bcc : headerBcc,
      replyTo: normalizeAddressList(headerParsed?.replyTo),
      dateTime: normalizeDateTime(fields, headerParsed, warnings)
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
  parseMsg,
  normalizeNativeRecipient,
  normalizeContentId,
  htmlReferencesContentId
};
