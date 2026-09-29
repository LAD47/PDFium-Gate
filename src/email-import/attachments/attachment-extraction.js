'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { sha256Hex, toBuffer } = require('../integrity/sha256');

const SHA256_RE = /^[0-9a-f]{64}$/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function extensionForContentType(contentType) {
  switch (String(contentType || '').trim().toLowerCase()) {
    case 'application/pdf': return '.pdf';
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/gif': return '.gif';
    case 'text/plain': return '.txt';
    default: return '.bin';
  }
}

function sanitizeAttachmentFilename(filename, attachment) {
  let name = String(filename == null ? '' : filename).replace(/\\/g, '/').split('/').pop().trim();

  if (!name) {
    const id = String(attachment?.id || 'attachment').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
    name = `${id}${extensionForContentType(attachment?.contentType)}`;
  }

  name = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[ .]+$/g, '')
    .trim();

  if (!name) name = `attachment${extensionForContentType(attachment?.contentType)}`;
  if (WINDOWS_RESERVED_RE.test(name)) name = `_${name}`;

  if (name.length > 180) {
    const ext = path.extname(name).slice(0, 20);
    const stemLimit = Math.max(1, 180 - ext.length);
    name = `${name.slice(0, stemLimit)}${ext}`;
  }

  return name;
}

function verifiedAttachmentBytes(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    throw new TypeError('attachment must be an object.');
  }
  if (attachment.content == null) {
    throw new Error('Attachment payload bytes are not available for extraction.');
  }

  const bytes = Buffer.from(toBuffer(attachment.content));

  if (Number.isInteger(attachment.size) && attachment.size !== bytes.length) {
    throw new Error(`Attachment size mismatch: canonical=${attachment.size}, actual=${bytes.length}.`);
  }

  const actualSha256 = sha256Hex(bytes);
  const expectedSha256 = String(attachment.sha256 || '').toLowerCase();
  if (expectedSha256) {
    if (!SHA256_RE.test(expectedSha256)) {
      throw new Error('Attachment SHA-256 is not a lowercase hexadecimal SHA-256 value.');
    }
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Attachment SHA-256 mismatch: canonical=${expectedSha256}, actual=${actualSha256}.`);
    }
  }

  return { bytes, sha256: actualSha256 };
}

function verifiedPdfAttachmentBytes(attachment) {
  const verified = verifiedAttachmentBytes(attachment);
  if (verified.bytes.length < 8 || verified.bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Selected attachment is not a PDF payload.');
  }
  const tail = verified.bytes.subarray(Math.max(0, verified.bytes.length - 8192)).toString('latin1');
  if (!tail.includes('%%EOF')) {
    throw new Error('Selected PDF attachment is missing the PDF end-of-file marker.');
  }
  return verified;
}

function resolveInsideRoot(destinationRoot, filename) {
  if (!destinationRoot) throw new TypeError('destinationRoot is required.');
  const root = path.resolve(String(destinationRoot));
  const target = path.resolve(root, filename);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Attachment extraction path escaped the destination root.');
  }
  return target;
}

async function readExistingExact(targetPath, expectedBytes) {
  try {
    const existing = await fs.promises.readFile(targetPath);
    if (!existing.equals(expectedBytes)) {
      throw new Error('Attachment extraction collision: target exists with different bytes.');
    }
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function extractAttachment({ attachment, destinationRoot, filename }) {
  const { bytes, sha256 } = verifiedAttachmentBytes(attachment);
  const safeFilename = sanitizeAttachmentFilename(filename ?? attachment.filename, attachment);
  const targetPath = resolveInsideRoot(destinationRoot, safeFilename);

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  if (await readExistingExact(targetPath, bytes)) {
    return { targetPath, filename: safeFilename, sha256, reused: true };
  }

  const tempPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  let installed = false;

  try {
    await fs.promises.writeFile(tempPath, bytes, { flag: 'wx' });
    const tempBytes = await fs.promises.readFile(tempPath);
    if (!tempBytes.equals(bytes) || sha256Hex(tempBytes) !== sha256) {
      throw new Error('Attachment temporary write failed byte-for-byte verification.');
    }

    try {
      await fs.promises.copyFile(tempPath, targetPath, fs.constants.COPYFILE_EXCL);
      installed = true;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
    }

    const finalBytes = await fs.promises.readFile(targetPath);
    if (!finalBytes.equals(bytes) || sha256Hex(finalBytes) !== sha256) {
      throw new Error('Extracted attachment failed byte-for-byte verification.');
    }
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
  }

  if (!installed && !(await readExistingExact(targetPath, bytes))) {
    throw new Error('Attachment extraction target could not be verified after a concurrent write.');
  }

  return { targetPath, filename: safeFilename, sha256, reused: !installed };
}

module.exports = {
  extensionForContentType,
  sanitizeAttachmentFilename,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes,
  extractAttachment
};
