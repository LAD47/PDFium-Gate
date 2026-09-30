'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { generateEmailPdf, validateGeneratedPdf } = require('../src/email-import/render/email-pdf-generator');
const { printHtmlToPdfWithElectron } = require('../src/email-import/render/electron-pdf-printer');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test', 'fixtures', 'email');

async function parseFixture(filename) {
  return parseEml({
    sourceBytes: fs.readFileSync(path.join(fixtureRoot, filename)),
    originalFilename: filename
  });
}

function assertChromiumPdf(pdf, label) {
  const checked = validateGeneratedPdf(pdf);
  assert.ok(Buffer.isBuffer(checked), `${label}: PDF is Buffer`);
  assert.ok(checked.length > 4000, `${label}: PDF has plausible non-trivial size`);
  assert.equal(checked.subarray(0, 5).toString('ascii'), '%PDF-', `${label}: PDF header`);
}

async function generate(document, capture) {
  return generateEmailPdf({
    document,
    printHtmlToPdf: async ({ html }) => {
      if (capture) capture.html = html;
      return printHtmlToPdfWithElectron({ html, electronModule: electron });
    }
  });
}

async function run() {
  assert.ok(process.versions.electron, 'test must run inside Electron');

  const htmlDocument = await parseFixture('html.eml');
  htmlDocument.source.retained = true;
  htmlDocument.source.retainedPath = '.pdf-metadata/emailsources/aa/example.eml';
  htmlDocument.source.sha256 = 'a'.repeat(64);
  const htmlCapture = {};
  const htmlPdf = await generate(htmlDocument, htmlCapture);
  assertChromiumPdf(htmlPdf, 'HTML fixture');
  assert.doesNotMatch(htmlCapture.html, /Original source/, 'retained-source heading is not rendered into user PDF');
  assert.doesNotMatch(htmlCapture.html, /SHA-256/, 'retained-source hash is not rendered into user PDF');
  assert.doesNotMatch(htmlCapture.html, /\.pdf-metadata\/emailsources\//, 'internal retained-source path is not rendered into user PDF');

  const inlineDocument = await parseFixture('inline-image-and-pdf.eml');
  const inlineCapture = {};
  const inlinePdf = await generate(inlineDocument, inlineCapture);
  assertChromiumPdf(inlinePdf, 'CID image fixture');
  assert.match(inlineCapture.html, /data:image\/png;base64,/, 'CID image reaches printer only as internal data URL');
  assert.doesNotMatch(inlineCapture.html, /src="cid:/i, 'printer does not receive unresolved CID URLs');
  assert.match(inlineCapture.html, /<h2>Vedlegg<\/h2>/, 'Norwegian attachment heading reaches printer');
  assert.match(inlineCapture.html, /<strong>test-attachment-2\.pdf<\/strong>/, 'attachment filename reaches printer');
  assert.match(inlineCapture.html, /obsidian:\/\/pdfium-gate-email-attachment\?source=/, 'PDFium Gate attachment URI reaches Chromium printer');
  assert.match(inlinePdf.toString('latin1'), /pdfium-gate-email-attachment/, 'Chromium printToPDF preserves the attachment URI in the PDF');
  assert.doesNotMatch(inlineCapture.html, /application\/pdf/, 'attachment MIME type does not reach user PDF');
  assert.doesNotMatch(inlineCapture.html, /Embedded inline resources:/, 'inline resource count does not reach user PDF');

  const hostileDocument = {
    schemaVersion: 1,
    source: { format: 'eml', originalFilename: 'hostile.eml', byteSize: 1, sha256: '0'.repeat(64), retained: false, retainedPath: null },
    identity: { messageId: null, inReplyTo: null, references: [] },
    message: {
      subject: 'Hostile HTML test',
      from: [{ name: 'Test', address: 'test@example.invalid' }],
      to: [], cc: [], bcc: [], replyTo: [],
      dateTime: { iso: null, raw: 'Mon, 28 Sep 2026 10:00:00 +0000', valid: true }
    },
    body: {
      text: null,
      html: '<script>document.body.innerHTML="bad"</script><p onclick="alert(1)">Safe text</p><img src="https://tracker.invalid/pixel" alt="tracker">'
    },
    attachments: [],
    diagnostics: { warnings: [] }
  };

  const hostileCapture = {};
  const hostilePdf = await generate(hostileDocument, hostileCapture);
  assertChromiumPdf(hostilePdf, 'hostile HTML fixture');
  assert.doesNotMatch(hostileCapture.html, /<script/i, 'source scripts never reach Chromium printer');
  assert.doesNotMatch(hostileCapture.html, /onclick=/i, 'event handlers never reach Chromium printer');
  assert.doesNotMatch(hostileCapture.html, /https:\/\/tracker\.invalid/i, 'remote tracking resource never reaches Chromium printer');
  assert.match(hostileCapture.html, /Content-Security-Policy/, 'controlled document CSP reaches Chromium printer');

  console.log(`Email Import Electron PDF generation OK: Electron ${process.versions.electron}, Chromium ${process.versions.chrome}; real printToPDF output validated for clickable attachment URI, clean user presentation, CID image and hostile-source fixtures.`);
}

run().then(() => {
  electron.app.exit(0);
}).catch(error => {
  console.error('Email Import Electron PDF generation check failed.');
  console.error(error && error.stack ? error.stack : error);
  electron.app.exit(1);
});
