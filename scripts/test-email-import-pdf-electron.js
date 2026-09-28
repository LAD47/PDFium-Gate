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
  const htmlPdf = await generate(htmlDocument);
  assertChromiumPdf(htmlPdf, 'HTML fixture');

  const inlineDocument = await parseFixture('inline-image-and-pdf.eml');
  const inlineCapture = {};
  const inlinePdf = await generate(inlineDocument, inlineCapture);
  assertChromiumPdf(inlinePdf, 'CID image fixture');
  assert.match(inlineCapture.html, /data:image\/png;base64,/, 'CID image reaches printer only as internal data URL');
  assert.doesNotMatch(inlineCapture.html, /src="cid:/i, 'printer does not receive unresolved CID URLs');

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

  console.log(`Email Import Electron PDF generation OK: Electron ${process.versions.electron}, Chromium ${process.versions.chrome}; real printToPDF output validated for HTML, CID image and hostile-source fixtures.`);
}

run().then(() => {
  electron.app.exit(0);
}).catch(error => {
  console.error('Email Import Electron PDF generation check failed.');
  console.error(error && error.stack ? error.stack : error);
  electron.app.exit(1);
});
