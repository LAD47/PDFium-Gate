'use strict';

const path = require('path');
const { unzipSync } = require('fflate');
const { sha256Hex, toBuffer } = require('../../core/integrity/sha256');

const ZIP_LIMITS = Object.freeze({
  maxEntries: 500,
  maxEntryUncompressedBytes: 100 * 1024 * 1024,
  maxTotalUncompressedBytes: 500 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxPathLength: 512,
  maxPathDepth: 20
});

const NATIVE_VAULT_EXTENSIONS = new Set([
  '.md','.txt','.csv','.json','.yaml','.yml',
  '.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg',
  '.mp3','.wav','.m4a','.ogg','.flac',
  '.mp4','.webm','.mov'
]);

const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function zipEvidence(attachment) {
  const evidence = [];
  const filename = String(attachment?.filename || '').trim().toLowerCase();
  const contentType = String(attachment?.contentType || '').trim().toLowerCase();
  if (/\.zip$/.test(filename)) evidence.push('filename');
  if (contentType === 'application/zip' || contentType === 'application/x-zip-compressed') evidence.push('mime');
  if (attachment?.content != null) {
    const bytes = toBuffer(attachment.content);
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
       (bytes[2] === 0x05 && bytes[3] === 0x06) ||
       (bytes[2] === 0x07 && bytes[3] === 0x08))) {
      evidence.push('payload');
    }
  }
  return evidence;
}

function isZipAttachment(attachment) {
  return zipEvidence(attachment).length > 0;
}

function sanitizeArchiveSegment(value) {
  let segment = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/[ .]+$/g, '')
    .trim();
  if (!segment) segment = '_';
  if (WINDOWS_RESERVED_RE.test(segment)) segment = `_${segment}`;
  if (segment.length > 120) {
    const ext = path.posix.extname(segment).slice(0, 20);
    segment = `${segment.slice(0, Math.max(1, 120 - ext.length))}${ext}`;
  }
  return segment;
}

function safeArchiveEntryPath(value, limits = ZIP_LIMITS) {
  const raw = String(value || '').replace(/\\/g, '/');
  if (!raw || raw.includes('\0')) return { ok:false, reason:'empty-or-null-path' };
  if (/^(?:\/|[A-Za-z]:\/)/.test(raw)) return { ok:false, reason:'absolute-path' };
  const directory = raw.endsWith('/');
  const originalParts = raw.split('/').filter(part => part !== '');
  if (!originalParts.length) return { ok:false, reason:'empty-path' };
  if (originalParts.some(part => part === '..')) return { ok:false, reason:'path-traversal' };
  const parts = originalParts.filter(part => part !== '.').map(sanitizeArchiveSegment);
  if (!parts.length) return { ok:false, reason:'empty-path' };
  if (parts.length > limits.maxPathDepth) return { ok:false, reason:'path-depth-limit' };
  const safePath = parts.join('/');
  if (safePath.length > limits.maxPathLength) return { ok:false, reason:'path-length-limit' };
  return { ok:true, path:safePath, directory };
}

function classifyArchiveEntry(entryPath) {
  const ext = path.posix.extname(String(entryPath || '')).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (NATIVE_VAULT_EXTENSIONS.has(ext)) return 'native';
  return 'unsupported';
}

function contentTypeForArchivePath(entryPath) {
  switch (path.posix.extname(String(entryPath || '')).toLowerCase()) {
    case '.pdf': return 'application/pdf';
    case '.md': return 'text/markdown';
    case '.txt': return 'text/plain';
    case '.csv': return 'text/csv';
    case '.json': return 'application/json';
    case '.yaml':
    case '.yml': return 'application/yaml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    case '.svg': return 'image/svg+xml';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.ogg': return 'audio/ogg';
    case '.flac': return 'audio/flac';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
}

function uniqueSafePath(candidate, used) {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  const slash = candidate.lastIndexOf('/');
  const folder = slash >= 0 ? candidate.slice(0, slash + 1) : '';
  const name = slash >= 0 ? candidate.slice(slash + 1) : candidate;
  const ext = path.posix.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let index = 2; index < 10000; index++) {
    const next = `${folder}${stem} (${index})${ext}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  throw new Error('ZIP entry path collision could not be resolved safely.');
}

function inspectZipAttachment(attachment, options = {}) {
  if (!attachment || attachment.content == null) throw new Error('ZIP attachment payload is unavailable.');
  const limits = { ...ZIP_LIMITS, ...(options.limits || {}) };
  const bytes = Buffer.from(toBuffer(attachment.content));
  const entries = [];
  const usedSafePaths = new Set();
  const rawNames = new Set();
  let totalUncompressedBytes = 0;
  let fileCount = 0;

  unzipSync(bytes, {
    filter(info) {
      const rawName = String(info?.name || '');
      if (rawNames.has(rawName)) throw new Error(`ZIP contains a duplicate entry name: ${rawName}`);
      rawNames.add(rawName);

      const safe = safeArchiveEntryPath(rawName, limits);
      const directory = safe.ok ? safe.directory : rawName.endsWith('/');
      if (directory) {
        entries.push({
          originalPath: rawName,
          safePath: safe.ok ? safe.path : null,
          directory: true,
          support:'directory',
          extractable:false,
          blockedReason:safe.ok ? null : safe.reason,
          compressedSize:Number(info?.size || 0),
          uncompressedSize:Number(info?.originalSize || 0),
          compression:Number(info?.compression || 0)
        });
        return false;
      }

      fileCount++;
      if (fileCount > limits.maxEntries) throw new Error(`ZIP contains more than ${limits.maxEntries} files.`);
      const compressedSize = Number(info?.size || 0);
      const uncompressedSize = Number(info?.originalSize || 0);
      if (!Number.isFinite(uncompressedSize) || uncompressedSize < 0 || uncompressedSize > limits.maxEntryUncompressedBytes) {
        throw new Error(`ZIP entry exceeds the per-file size limit: ${rawName}`);
      }
      totalUncompressedBytes += uncompressedSize;
      if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
        throw new Error('ZIP exceeds the total uncompressed size limit.');
      }
      const ratio = compressedSize > 0 ? uncompressedSize / compressedSize : (uncompressedSize > 0 ? Infinity : 1);
      if (uncompressedSize > 1024 * 1024 && ratio > limits.maxCompressionRatio) {
        throw new Error(`ZIP entry exceeds the compression-ratio safety limit: ${rawName}`);
      }

      const supportedCompression = Number(info?.compression || 0) === 0 || Number(info?.compression || 0) === 8;
      const support = safe.ok ? classifyArchiveEntry(safe.path) : 'blocked';
      const safePath = safe.ok ? uniqueSafePath(safe.path, usedSafePaths) : null;
      entries.push({
        originalPath: rawName,
        safePath,
        directory:false,
        support,
        extractable:Boolean(safe.ok && supportedCompression),
        blockedReason:!safe.ok ? safe.reason : (!supportedCompression ? `unsupported-compression-${info.compression}` : null),
        compressedSize,
        uncompressedSize,
        compression:Number(info?.compression || 0)
      });
      return false;
    }
  });

  const fileEntries = entries.filter(entry => !entry.directory);
  return {
    entries,
    fileEntries,
    pdfEntries:fileEntries.filter(entry => entry.support === 'pdf' && entry.extractable),
    nativeEntries:fileEntries.filter(entry => entry.support === 'native' && entry.extractable),
    unsupportedEntries:fileEntries.filter(entry => entry.support === 'unsupported' && entry.extractable),
    blockedEntries:fileEntries.filter(entry => !entry.extractable),
    totalUncompressedBytes,
    fileCount
  };
}

function extractZipAttachment(attachment, inspection, { includeUnsupported = false } = {}) {
  if (!inspection || !Array.isArray(inspection.fileEntries)) throw new TypeError('ZIP inspection is required.');
  const bytes = Buffer.from(toBuffer(attachment.content));
  const accepted = new Map();
  for (const entry of inspection.fileEntries) {
    if (!entry.extractable || !entry.safePath) continue;
    if (entry.support === 'unsupported' && !includeUnsupported) continue;
    accepted.set(entry.originalPath, entry);
  }

  const extracted = unzipSync(bytes, {
    filter(info) {
      return accepted.has(String(info?.name || ''));
    }
  });

  const result = [];
  for (const [originalPath, entry] of accepted) {
    const payload = extracted[originalPath];
    if (!payload) throw new Error(`ZIP entry was selected but not extracted: ${originalPath}`);
    const buffer = Buffer.from(payload);
    if (buffer.length !== entry.uncompressedSize) {
      throw new Error(`ZIP entry size mismatch after extraction: ${originalPath}`);
    }
    result.push({
      ...entry,
      bytes:buffer,
      sha256:sha256Hex(buffer),
      contentType:contentTypeForArchivePath(entry.safePath)
    });
  }
  return result;
}

module.exports = {
  ZIP_LIMITS,
  NATIVE_VAULT_EXTENSIONS,
  zipEvidence,
  isZipAttachment,
  sanitizeArchiveSegment,
  safeArchiveEntryPath,
  classifyArchiveEntry,
  contentTypeForArchivePath,
  inspectZipAttachment,
  extractZipAttachment
};
