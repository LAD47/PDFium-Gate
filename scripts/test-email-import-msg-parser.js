'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { parseMsg } = require('../src/email-import/parsers/msg-parser');
const { sha256Hex } = require('../src/core/integrity/sha256');
const { analyzeEmailAttachments } = require('../src/email-import/attachments/attachment-policy');
const { renderEmailDocumentToHtml } = require('../src/email-import/render/email-html-renderer');
const { buildSyntheticMsg } = require('../test/fixtures/email/synthetic-msg-builder');

const root = path.resolve(__dirname, '..');
const attachmentRoot = path.join(root, 'test', 'fixtures', 'email', 'attachments');

(async () => {
  const basicBytes = buildSyntheticMsg();
  const basicBytesAgain = buildSyntheticMsg();
  assert.ok(basicBytes.equals(basicBytesAgain), 'synthetic MSG fixture generation is deterministic');
  assert.equal(basicBytes.subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1', 'fixture is a real CFBF/MSG container');

  const basic = await parseMsg({
    sourceBytes: basicBytes,
    originalFilename: 'synthetic-basic.msg'
  });

  assert.equal(basic.schemaVersion, 1);
  assert.equal(basic.source.format, 'msg');
  assert.equal(basic.source.originalFilename, 'synthetic-basic.msg');
  assert.equal(basic.source.byteSize, basicBytes.length);
  assert.equal(basic.source.sha256, sha256Hex(basicBytes), 'source hash calculated over exact original MSG bytes');
  assert.equal(basic.source.retained, false);
  assert.equal(basic.source.retainedPath, null);

  assert.equal(basic.message.subject, 'Synthetic MSG – æøå');
  assert.deepEqual(basic.message.from, [{ name: 'Kari Ødegård', address: 'kari.msg@example.invalid' }]);
  assert.deepEqual(basic.message.to, [{ name: 'Ola Nordmann', address: 'ola.msg@example.invalid' }]);
  assert.deepEqual(basic.message.cc, [{ name: 'Test Kopi', address: 'cc.msg@example.invalid' }]);
  assert.deepEqual(basic.message.bcc, []);
  assert.deepEqual(basic.message.replyTo, [{ name: 'Arkiv', address: 'reply.msg@example.invalid' }]);
  assert.equal(basic.message.dateTime.iso, '2026-09-28T13:30:00.000Z');
  assert.equal(basic.message.dateTime.raw, 'Mon, 28 Sep 2026 15:30:00 +0200');
  assert.equal(basic.message.dateTime.valid, true);

  assert.equal(basic.identity.messageId, '<synthetic-msg-20260928@example.invalid>');
  assert.equal(basic.identity.inReplyTo, '<synthetic-parent@example.invalid>');
  assert.deepEqual(basic.identity.references, [
    '<synthetic-root@example.invalid>',
    '<synthetic-parent@example.invalid>'
  ]);

  assert.match(basic.body.text, /syntetisk MSG-melding/);
  assert.match(basic.body.html, /<strong>syntetisk MSG<\/strong>/);
  assert.equal(basic.attachments.length, 0);
  assert.deepEqual(basic.diagnostics.warnings, []);

  const pdfBytes = fs.readFileSync(path.join(attachmentRoot, 'test-attachment-1.pdf'));
  const pngBytes = fs.readFileSync(path.join(attachmentRoot, 'inline-logo.png'));
  const attachmentBytes = buildSyntheticMsg({
    subject: 'Synthetic MSG with attachments',
    bodyHtml: '<p>MSG with inline image <img src="cid:synthetic-logo@example.invalid" alt="logo"></p>',
    attachments: [
      {
        filename: 'test-attachment-1.pdf',
        contentType: 'application/pdf',
        content: pdfBytes
      },
      {
        filename: 'inline-logo.png',
        contentType: 'image/png',
        contentId: 'synthetic-logo@example.invalid',
        hidden: true,
        content: pngBytes
      }
    ]
  });

  const withAttachments = await parseMsg({
    sourceBytes: attachmentBytes,
    originalFilename: 'synthetic-attachments.msg'
  });

  assert.equal(withAttachments.attachments.length, 2);
  const pdf = withAttachments.attachments[0];
  assert.equal(pdf.filename, 'test-attachment-1.pdf');
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(pdf.disposition, 'attachment');
  assert.equal(pdf.related, false);
  assert.equal(pdf.size, pdfBytes.length);
  assert.equal(pdf.sha256, sha256Hex(pdfBytes));
  assert.ok(pdf.content.equals(pdfBytes), 'MSG PDF attachment payload remains byte-identical');

  const inline = withAttachments.attachments[1];
  assert.equal(inline.filename, 'inline-logo.png');
  assert.equal(inline.contentType, 'image/png');
  assert.equal(inline.contentId, '<synthetic-logo@example.invalid>');
  assert.equal(inline.disposition, 'inline');
  assert.equal(inline.related, true);
  assert.equal(inline.size, pngBytes.length);
  assert.equal(inline.sha256, sha256Hex(pngBytes));
  assert.ok(inline.content.equals(pngBytes), 'MSG CID image payload remains byte-identical');

  const attachmentAnalysis = analyzeEmailAttachments(withAttachments);
  assert.equal(attachmentAnalysis.attachments.length, 1, 'MSG ordinary attachment uses common attachment policy');
  assert.equal(attachmentAnalysis.inlineResources.length, 1, 'MSG CID image uses common inline-resource policy');
  assert.equal(attachmentAnalysis.pdfCandidates.length, 1, 'MSG PDF attachment becomes common PDF candidate');

  const rendered = renderEmailDocumentToHtml(withAttachments);
  assert.match(rendered, /Synthetic MSG with attachments/);
  assert.match(rendered, /data:image\/png;base64,/, 'MSG CID image reaches common safe renderer');
  assert.match(rendered, /test-attachment-1\.pdf/, 'MSG PDF attachment reaches common attachment list');
  assert.match(rendered, /Embedded inline resources: 1/, 'MSG inline resource presentation matches EML behavior');

  await assert.rejects(
    () => parseMsg({ sourceBytes: Buffer.from('not an msg'), originalFilename: 'broken.msg' }),
    /MSG parser rejected source/i,
    'non-MSG bytes fail closed'
  );

  console.log('Email Import MSG parser OK: real deterministic synthetic CFBF/MSG sources normalize to Canonical Email Document v1, preserve Unicode/identity/recipients/dates, and keep PDF/CID attachment bytes intact.');
})().catch(error => {
  console.error('Email Import MSG parser check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
