'use strict';

const assert = require('assert/strict');
const {
  attachmentWikilink,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths,
  normalizeResolvedEmailAttachmentLinkTargets
} = require('../src/email-import/metadata/email-attachment-links');

assert.equal(attachmentWikilink('Cases\\report.pdf'),'[[Cases/report.pdf]]');
assert.equal(
  renderEmailAttachmentLinkBlock(['Cases/report.pdf','Cases/photo.jpg','Cases/report.pdf']),
  '<!-- pdfium-gate:email-attachments:start -->\n- [[Cases/report.pdf]]\n- [[Cases/photo.jpg]]\n<!-- pdfium-gate:email-attachments:end -->'
);

const original = [
  '---',
  'filemeta_type: "pdf"',
  'filemeta_profile: "document"',
  'filemeta_version: 2',
  'filemeta_id: "11111111-1111-4111-8111-111111111111"',
  'filemeta_file: "[[Cases/mail.pdf]]"',
  'filemeta_status: "active"',
  'email_import_source_sha256: "' + 'a'.repeat(64) + '"',
  '---',
  '',
  'Existing body text.'
].join('\n') + '\n';

const withLinks = upsertEmailAttachmentLinkBlock(original,['Cases/report.pdf','Cases/photo.jpg','Cases/brev.docx']);
assert.ok(withLinks.startsWith(original.trimEnd()));
assert.deepEqual(extractEmailAttachmentLinkPaths(withLinks),[
  'Cases/report.pdf',
  'Cases/photo.jpg',
  'Cases/brev.docx'
]);
assert.ok(withLinks.includes('- [[Cases/brev.docx]]'));

const renamedByObsidian = withLinks.replace('[[Cases/brev.docx]]','[[brev-renamed.docx]]');
assert.deepEqual(extractEmailAttachmentLinkPaths(renamedByObsidian),[
  'Cases/report.pdf',
  'Cases/photo.jpg',
  'brev-renamed.docx'
]);

const resolvedTargets = new Map([
  ['Cases/report.pdf','Cases/report.pdf'],
  ['Cases/photo.jpg','Cases/photo.jpg'],
  ['brev-renamed.docx','Cases/Vedlegg/brev-renamed.docx']
]);
const normalizedAfterRename = normalizeResolvedEmailAttachmentLinkTargets(
  renamedByObsidian,
  'File Metadata/11/11111111-1111-4111-8111-111111111111.md',
  (linkPath,sourcePath) => {
    assert.equal(sourcePath,'File Metadata/11/11111111-1111-4111-8111-111111111111.md');
    return resolvedTargets.get(linkPath) || null;
  }
);
assert.ok(normalizedAfterRename.includes('- [[Cases/Vedlegg/brev-renamed.docx]]'));
assert.deepEqual(extractEmailAttachmentLinkPaths(normalizedAfterRename),[
  'Cases/report.pdf',
  'Cases/photo.jpg',
  'Cases/Vedlegg/brev-renamed.docx'
]);

const ambiguousShortTarget = normalizedAfterRename.replace(
  '[[Cases/Vedlegg/brev-renamed.docx]]',
  '[[brev-renamed.docx]]'
);
const disambiguated = normalizeResolvedEmailAttachmentLinkTargets(
  ambiguousShortTarget,
  'File Metadata/11/11111111-1111-4111-8111-111111111111.md',
  linkPath => linkPath==='brev-renamed.docx' ? 'Archive/Other/brev-renamed.docx' : resolvedTargets.get(linkPath) || null
);
assert.ok(disambiguated.includes('- [[Archive/Other/brev-renamed.docx]]'));

const unresolvedAfterDelete = normalizedAfterRename.replace(
  '[[Cases/photo.jpg]]',
  '[[Cases/deleted-photo.jpg]]'
);
const preservedUnresolved = normalizeResolvedEmailAttachmentLinkTargets(
  unresolvedAfterDelete,
  'File Metadata/11/11111111-1111-4111-8111-111111111111.md',
  linkPath => linkPath==='Cases/deleted-photo.jpg' ? null : resolvedTargets.get(linkPath) || null
);
assert.ok(preservedUnresolved.includes('- [[Cases/deleted-photo.jpg]]'));

const replaced = upsertEmailAttachmentLinkBlock(normalizedAfterRename,['Cases/report.pdf']);
assert.deepEqual(extractEmailAttachmentLinkPaths(replaced),['Cases/report.pdf']);
assert.equal((replaced.match(/pdfium-gate:email-attachments:start/g) || []).length,1);
assert.ok(replaced.includes('Existing body text.'));

const removed = upsertEmailAttachmentLinkBlock(replaced,[]);
assert.deepEqual(extractEmailAttachmentLinkPaths(removed),[]);
assert.ok(!removed.includes('pdfium-gate:email-attachments:start'));
assert.ok(removed.includes('Existing body text.'));

console.log('Email Import attachment wikilink block OK: native links remain deterministic and plugin-owned links can be normalized back to resolver-confirmed full vault paths after Obsidian link updates.');
