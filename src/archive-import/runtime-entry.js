'use strict';

const { sha256Hex } = require('../core/integrity/sha256');

const {
  BLOCK_START: ARCHIVE_RELATIONSHIP_BLOCK_START,
  BLOCK_END: ARCHIVE_RELATIONSHIP_BLOCK_END,
  normalizeVaultPath: normalizeArchiveRelationshipVaultPath,
  archiveWikilink,
  normalizeUniquePaths: normalizeArchiveRelationshipPaths,
  renderArchiveRelationshipBlock,
  upsertArchiveRelationshipBlock,
  extractArchiveRelationship
} = require('./archive-relationships');

const {
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
} = require('./zip-archive');

module.exports = {
  sha256Hex,
  ZIP_LIMITS,
  NATIVE_VAULT_EXTENSIONS,
  zipEvidence,
  isZipAttachment,
  sanitizeArchiveSegment,
  safeArchiveEntryPath,
  classifyArchiveEntry,
  contentTypeForArchivePath,
  inspectZipAttachment,
  extractZipAttachment,
  ARCHIVE_RELATIONSHIP_BLOCK_START,
  ARCHIVE_RELATIONSHIP_BLOCK_END,
  normalizeArchiveRelationshipVaultPath,
  archiveWikilink,
  normalizeArchiveRelationshipPaths,
  renderArchiveRelationshipBlock,
  upsertArchiveRelationshipBlock,
  extractArchiveRelationship
};
