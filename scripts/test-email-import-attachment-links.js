'use strict';

const assert = require('assert/strict');
const {
  attachmentWikilink,
  renderEmailAttachmentLinkBlock,
  upsertEmailAttachmentLinkBlock,
  extractEmailAttachmentLinkPaths
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

const renamedByObsidian = withLinks.replace('[[Cases/brev.docx]]','[[Cases/Vedlegg/brev.docx]]');
assert.deepEqual(extractEmailAttachmentLinkPaths(renamedByObsidian),[
  'Cases/report.pdf',
  'Cases/photo.jpg',
  'Cases/Vedlegg/brev.docx'
]);

const replaced = upsertEmailAttachmentLinkBlock(renamedByObsidian,['Cases/report.pdf']);
assert.deepEqual(extractEmailAttachmentLinkPaths(replaced),['Cases/report.pdf']);
assert.equal((replaced.match(/pdfium-gate:email-attachments:start/g) || []).length,1);
assert.ok(replaced.includes('Existing body text.'));

const removed = upsertEmailAttachmentLinkBlock(replaced,[]);
assert.deepEqual(extractEmailAttachmentLinkPaths(removed),[]);
assert.ok(!removed.includes('pdfium-gate:email-attachments:start'));
assert.ok(removed.includes('Existing body text.'));

console.log('Email Import attachment wikilink block OK: native links are deterministic, deduplicated, replaceable, removable, and remain parseable after an Obsidian-style path rewrite.');
