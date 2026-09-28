'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { sha256Hex, toBuffer } = require('../integrity/sha256');

const SOURCE_STORAGE_ROOT = '.pdf-metadata/email-sources';
const SHA256_RE = /^[0-9a-f]{64}$/;
const ALLOWED_SOURCE_FORMATS = new Set(['eml', 'msg']);

function assertCanonicalSource(document) {
  if (!document || typeof document !== 'object' || document.schemaVersion !== 1) {
    throw new TypeError('Canonical Email Document schemaVersion 1 is required.');
  }

  const source = document.source || {};
  const format = String(source.format || '').toLowerCase();
  const sha256 = String(source.sha256 || '').toLowerCase();

  if (!ALLOWED_SOURCE_FORMATS.has(format)) {
    throw new TypeError(`Unsupported retained email source format: ${format || '(missing)'}.`);
  }
  if (!SHA256_RE.test(sha256)) {
    throw new TypeError('Canonical Email Document source.sha256 must be a lowercase SHA-256 hex string.');
  }
  if (!Number.isInteger(source.byteSize) || source.byteSize < 0) {
    throw new TypeError('Canonical Email Document source.byteSize must be a non-negative integer.');
  }

  return { source, format, sha256 };
}

function retainedSourceRelativePath(document) {
  const { format, sha256 } = assertCanonicalSource(document);
  return `${SOURCE_STORAGE_ROOT}/${sha256.slice(0, 2)}/${sha256}.${format}`;
}

function verifySourceBytes(document, sourceBytes) {
  const { source, sha256 } = assertCanonicalSource(document);
  const bytes = Buffer.from(toBuffer(sourceBytes));

  if (bytes.length !== source.byteSize) {
    throw new Error(`Source byte length mismatch: canonical=${source.byteSize}, actual=${bytes.length}.`);
  }

  const actualSha256 = sha256Hex(bytes);
  if (actualSha256 !== sha256) {
    throw new Error(`Source SHA-256 mismatch: canonical=${sha256}, actual=${actualSha256}.`);
  }

  return bytes;
}

function withRetentionState(document, retained, retainedPath) {
  return {
    ...document,
    source: {
      ...document.source,
      retained: retained === true,
      retainedPath: retained === true ? retainedPath : null
    }
  };
}

function absolutePathForVaultRelative(vaultRootPath, vaultRelativePath) {
  const root = path.resolve(String(vaultRootPath || ''));
  if (!vaultRootPath || !root) {
    throw new TypeError('vaultRootPath is required when source retention is enabled.');
  }

  const parts = String(vaultRelativePath || '').split('/').filter(Boolean);
  const target = path.resolve(root, ...parts);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Retained source path escaped the vault root.');
  }
  return target;
}

async function readExistingExact(targetPath, expectedBytes) {
  try {
    const existing = await fs.promises.readFile(targetPath);
    if (!existing.equals(expectedBytes)) {
      throw new Error('Retained source collision: existing file does not match the expected source bytes.');
    }
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function retainOriginalSource({ document, sourceBytes, vaultRootPath, enabled }) {
  assertCanonicalSource(document);

  if (enabled !== true) {
    return {
      document: withRetentionState(document, false, null),
      retainedPath: null,
      reused: false,
      created: false
    };
  }

  const bytes = verifySourceBytes(document, sourceBytes);
  const retainedPath = retainedSourceRelativePath(document);
  const targetPath = absolutePathForVaultRelative(vaultRootPath, retainedPath);
  const directory = path.dirname(targetPath);

  await fs.promises.mkdir(directory, { recursive: true });

  if (await readExistingExact(targetPath, bytes)) {
    return {
      document: withRetentionState(document, true, retainedPath),
      retainedPath,
      reused: true,
      created: false
    };
  }

  const tempPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  let installed = false;

  try {
    await fs.promises.writeFile(tempPath, bytes, { flag: 'wx' });
    const tempBytes = await fs.promises.readFile(tempPath);
    if (!tempBytes.equals(bytes) || sha256Hex(tempBytes) !== document.source.sha256) {
      throw new Error('Retained source temporary write failed byte-for-byte verification.');
    }

    try {
      await fs.promises.copyFile(tempPath, targetPath, fs.constants.COPYFILE_EXCL);
      installed = true;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
    }

    const finalBytes = await fs.promises.readFile(targetPath);
    if (!finalBytes.equals(bytes) || sha256Hex(finalBytes) !== document.source.sha256) {
      throw new Error('Retained source final file failed byte-for-byte verification.');
    }
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
  }

  return {
    document: withRetentionState(document, true, retainedPath),
    retainedPath,
    reused: !installed,
    created: installed
  };
}

async function removeRetainedSourceIfExact({ document, sourceBytes, vaultRootPath }) {
  const source = document?.source || {};
  if (source.retained !== true || !source.retainedPath) return { removed:false, reason:'not-retained' };

  const bytes = verifySourceBytes(document, sourceBytes);
  const canonicalPath = retainedSourceRelativePath(document);
  if (String(source.retainedPath) !== canonicalPath) {
    throw new Error('Retained source rollback refused a non-canonical retainedPath.');
  }

  const targetPath = absolutePathForVaultRelative(vaultRootPath, canonicalPath);
  let existing;
  try {
    existing = await fs.promises.readFile(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return { removed:false, reason:'missing' };
    throw error;
  }

  if (!existing.equals(bytes) || sha256Hex(existing) !== document.source.sha256) {
    throw new Error('Retained source rollback refused to delete bytes that no longer match the imported source.');
  }

  await fs.promises.unlink(targetPath);
  return { removed:true, reason:'exact-source-removed', retainedPath:canonicalPath };
}

function buildObsidianRetainedSourceUri({ vault, retainedPath }) {
  const vaultValue = String(vault || '').trim();
  const fileValue = String(retainedPath || '').trim();

  if (!vaultValue) throw new TypeError('vault is required to build an Obsidian retained-source URI.');
  if (!fileValue || fileValue.startsWith('/') || fileValue.includes('\\')) {
    throw new TypeError('retainedPath must be a vault-relative forward-slash path.');
  }

  return `obsidian://open?vault=${encodeURIComponent(vaultValue)}&file=${encodeURIComponent(fileValue)}`;
}

module.exports = {
  SOURCE_STORAGE_ROOT,
  retainedSourceRelativePath,
  verifySourceBytes,
  retainOriginalSource,
  removeRetainedSourceIfExact,
  buildObsidianRetainedSourceUri,
  withRetentionState
};
