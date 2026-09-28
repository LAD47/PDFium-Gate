'use strict';

const { burn } = require('@kenjiuno/msgreader/lib/Burner');
const { TypeEnum } = require('@kenjiuno/msgreader/lib/Reader');

function unicodeBytes(value) {
  return Buffer.from(`${String(value == null ? '' : value)}\0`, 'utf16le');
}

function uint32Bytes(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(Number(value) >>> 0, 0);
  return buffer;
}

function booleanBytes(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value ? 1 : 0, 0);
  return buffer;
}

function fileTimeBytes(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Synthetic MSG date must be valid.');
  const fileTime = BigInt(date.getTime()) * 10000n + 116444736000000000n;
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32LE(Number(fileTime & 0xffffffffn), 0);
  buffer.writeUInt32LE(Number((fileTime >> 32n) & 0xffffffffn), 4);
  return buffer;
}

function buildSyntheticMsg(options = {}) {
  const entries = [{
    name: 'Root Entry',
    type: TypeEnum.ROOT,
    children: [],
    length: 0
  }];

  const addDirectory = (parentIndex, name) => {
    const index = entries.length;
    entries.push({ name, type: TypeEnum.DIRECTORY, children: [], length: 0 });
    entries[parentIndex].children.push(index);
    return index;
  };

  const addDocument = (parentIndex, name, bytes) => {
    const content = Buffer.from(bytes);
    const index = entries.length;
    entries.push({
      name,
      type: TypeEnum.DOCUMENT,
      binaryProvider: () => content,
      length: content.length
    });
    entries[parentIndex].children.push(index);
    return index;
  };

  const addUnicodeProperty = (parentIndex, tag, value) => {
    if (value === undefined || value === null) return;
    addDocument(parentIndex, `__substg1.0_${tag}001F`, unicodeBytes(value));
  };

  const addIntegerProperty = (parentIndex, tag, value) => {
    if (value === undefined || value === null) return;
    addDocument(parentIndex, `__substg1.0_${tag}0003`, uint32Bytes(value));
  };

  const addBooleanProperty = (parentIndex, tag, value) => {
    if (value === undefined || value === null) return;
    addDocument(parentIndex, `__substg1.0_${tag}000B`, booleanBytes(value));
  };

  const addTimeProperty = (parentIndex, tag, value) => {
    if (value === undefined || value === null) return;
    addDocument(parentIndex, `__substg1.0_${tag}0040`, fileTimeBytes(value));
  };

  const subject = options.subject || 'Synthetic MSG – æøå';
  const senderName = options.senderName || 'Kari Ødegård';
  const senderEmail = options.senderEmail || 'kari.msg@example.invalid';
  const date = options.date || '2026-09-28T13:30:00.000Z';
  const messageId = options.messageId || '<synthetic-msg-20260928@example.invalid>';
  const bodyText = options.bodyText || 'Dette er en syntetisk MSG-melding med æ ø å.';
  const bodyHtml = options.bodyHtml || '<p>Dette er en <strong>syntetisk MSG</strong>-melding med æ ø å.</p>';
  const recipients = Array.isArray(options.recipients) ? options.recipients : [
    { type: 'to', name: 'Ola Nordmann', email: 'ola.msg@example.invalid' },
    { type: 'cc', name: 'Test Kopi', email: 'cc.msg@example.invalid' }
  ];
  const references = options.references || '<synthetic-root@example.invalid> <synthetic-parent@example.invalid>';
  const inReplyTo = options.inReplyTo || '<synthetic-parent@example.invalid>';
  const replyTo = options.replyTo || 'Arkiv <reply.msg@example.invalid>';
  const headers = options.headers || [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${recipients.filter(item => item.type === 'to').map(item => `${item.name} <${item.email}>`).join(', ')}`,
    `Cc: ${recipients.filter(item => item.type === 'cc').map(item => `${item.name} <${item.email}>`).join(', ')}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    'Date: Mon, 28 Sep 2026 15:30:00 +0200',
    `Message-ID: ${messageId}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${references}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8'
  ].join('\r\n');

  addUnicodeProperty(0, '001A', 'IPM.Note');
  addUnicodeProperty(0, '0037', subject);
  addUnicodeProperty(0, '0C1A', senderName);
  addUnicodeProperty(0, '0C1F', senderEmail);
  addUnicodeProperty(0, '5D01', senderEmail);
  addUnicodeProperty(0, '1000', bodyText);
  addUnicodeProperty(0, '1013', bodyHtml);
  addUnicodeProperty(0, '007D', headers);
  addUnicodeProperty(0, '1035', messageId);
  addTimeProperty(0, '0039', date);

  const recipTypeValue = { to: 1, cc: 2, bcc: 3 };
  recipients.forEach((recipient, index) => {
    const dir = addDirectory(0, `__recip_version1.0_#${index.toString(16).padStart(8, '0').toUpperCase()}`);
    addUnicodeProperty(dir, '3001', recipient.name || recipient.email);
    addUnicodeProperty(dir, '3002', 'SMTP');
    addUnicodeProperty(dir, '3003', recipient.email);
    addUnicodeProperty(dir, '39FE', recipient.email);
    addIntegerProperty(dir, '0C15', recipTypeValue[recipient.type] || 1);
  });

  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  attachments.forEach((attachment, index) => {
    const dir = addDirectory(0, `__attach_version1.0_#${index.toString(16).padStart(8, '0').toUpperCase()}`);
    const filename = attachment.filename || `attachment-${index + 1}.bin`;
    const content = Buffer.from(attachment.content || []);
    const extensionMatch = /(?:^|\.)([^.]+)$/.exec(filename);
    const extension = extensionMatch ? `.${extensionMatch[1]}` : '';

    addUnicodeProperty(dir, '3001', filename);
    addUnicodeProperty(dir, '3703', extension);
    addUnicodeProperty(dir, '3704', filename);
    addUnicodeProperty(dir, '3707', filename);
    addUnicodeProperty(dir, '370E', attachment.contentType || 'application/octet-stream');
    if (attachment.contentId) addUnicodeProperty(dir, '3712', attachment.contentId);
    if (attachment.hidden !== undefined) addBooleanProperty(dir, '7FFE', attachment.hidden === true);
    addDocument(dir, '__substg1.0_37010102', content);
  });

  return Buffer.from(burn(entries));
}

module.exports = {
  buildSyntheticMsg,
  unicodeBytes,
  fileTimeBytes
};
