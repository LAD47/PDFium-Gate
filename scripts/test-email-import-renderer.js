'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { renderEmailDocumentToHtml } = require('../src/email-import/render/email-html-renderer');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test', 'fixtures', 'email');

async function parseFixture(filename) {
  return parseEml({
    sourceBytes: fs.readFileSync(path.join(fixtureRoot, filename)),
    originalFilename: filename
  });
}

(async () => {
  const htmlDocument = await parseFixture('html.eml');
  const htmlOutput = renderEmailDocumentToHtml(htmlDocument);
  assert.match(htmlOutput, /HTML message test/, 'subject rendered');
  assert.match(htmlOutput, /<strong>synthetic<\/strong>/, 'safe rich HTML preserved');
  assert.match(htmlOutput, /Norwegian: æøå ÆØÅ/, 'Unicode preserved');
  assert.match(htmlOutput, /Content-Security-Policy/, 'CSP emitted');

  const inlineDocument = await parseFixture('inline-image-and-pdf.eml');
  const inlineOutput = renderEmailDocumentToHtml(inlineDocument);
  assert.match(inlineOutput, /data:image\/png;base64,/, 'CID image embedded from decoded attachment bytes');
  assert.doesNotMatch(inlineOutput, /src="cid:/i, 'CID URL is not left unresolved');
  assert.match(inlineOutput, /<h2>Vedlegg<\/h2>/, 'attachment heading uses the requested Norwegian presentation');
  assert.match(inlineOutput, /<strong>test-attachment-2\.pdf<\/strong>/, 'ordinary attachment filename listed');
  assert.match(
    inlineOutput,
    /href="obsidian:\/\/pdfium-gate-email-attachment\?source=[0-9a-f]{64}&amp;attachment=[0-9a-f]{64}&amp;index=0"/,
    'ordinary attachment receives a stable PDFium Gate Obsidian protocol link'
  );
  assert.doesNotMatch(inlineOutput, /Embedded inline resources:/, 'embedded resource count is not shown to users');
  assert.doesNotMatch(inlineOutput, /<strong>inline-logo\.png<\/strong>/, 'inline resource not presented as ordinary attachment');
  assert.doesNotMatch(inlineOutput, /application\/pdf/, 'attachment MIME type is not shown to users');
  assert.doesNotMatch(inlineOutput, /\d+ bytes/, 'attachment byte size is not shown to users');

  const maliciousDocument = {
    schemaVersion: 1,
    source: { format: 'eml', originalFilename: 'malicious.eml', byteSize: 1, sha256: '0'.repeat(64), retained: false, retainedPath: null },
    identity: { messageId: null, inReplyTo: null, references: [] },
    message: {
      subject: '<script>subject</script>',
      from: [{ name: '<b>Alice</b>', address: 'alice@example.invalid' }],
      to: [], cc: [], bcc: [], replyTo: [],
      dateTime: { iso: null, raw: 'Mon, 28 Sep 2026 10:00:00 +0000', valid: true }
    },
    body: {
      text: null,
      html: '<style>body{display:none}</style><script>alert(1)</script><p onclick="alert(1)">Hello <strong>world</strong></p><img src="https://tracker.invalid/pixel" onerror="alert(1)" alt="tracker"><a href="javascript:alert(1)">bad</a><a href="obsidian://pdfium-gate-email-attachment?source=forged">forged</a><a href="https://example.invalid/page">good</a>'
    },
    attachments: [],
    diagnostics: { warnings: [] }
  };

  const safeOutput = renderEmailDocumentToHtml(maliciousDocument);
  assert.doesNotMatch(safeOutput, /<script>subject<\/script>/, 'subject escaped');
  assert.match(safeOutput, /&lt;script&gt;subject&lt;\/script&gt;/, 'escaped subject remains visible as text');
  assert.doesNotMatch(safeOutput, /onclick=/i, 'event handlers removed');
  assert.doesNotMatch(safeOutput, /onerror=/i, 'image event handlers removed');
  assert.doesNotMatch(safeOutput, /javascript:/i, 'javascript URLs removed');
  assert.doesNotMatch(safeOutput, /obsidian:\/\/pdfium-gate-email-attachment\?source=forged/i, 'source email cannot inject PDFium Gate protocol links');
  assert.doesNotMatch(safeOutput, /https:\/\/tracker\.invalid\/pixel/, 'remote image source removed');
  assert.match(safeOutput, /\[image blocked\]/, 'blocked image remains visibly represented');
  assert.match(safeOutput, /href="https:\/\/example\.invalid\/page"/, 'ordinary remote hyperlink retained without auto-fetching resource');
  assert.doesNotMatch(safeOutput, /body\{display:none\}/, 'source style content removed');
  assert.equal(renderEmailDocumentToHtml(maliciousDocument), safeOutput, 'rendering is deterministic for the same canonical document');

  const plainDocument = await parseFixture('plain-text.eml');
  plainDocument.body.text += '\n<script>alert(1)</script>';
  const plainOutput = renderEmailDocumentToHtml(plainDocument);
  assert.match(plainOutput, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'plain text is HTML-escaped');

  console.log('Email Import safe HTML renderer OK: controlled shell, sanitized message HTML, blocked remote images, CID embedding, stable Obsidian attachment protocol links, escaped plain text and deterministic output verified.');
})().catch(error => {
  console.error('Email Import safe HTML renderer check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
