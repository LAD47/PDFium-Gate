'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { generateEmailPdf, validateGeneratedPdf } = require('../src/email-import/render/email-pdf-generator');
const { printHtmlToPdfWithElectron } = require('../src/email-import/render/electron-pdf-printer');
const { buildEmailImportRetainedSourcePdfLink } = require('../src/bridge/renderer-events');

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

async function readPdfLinks(pdf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useWorkerFetch: false,
    isEvalSupported: false
  });
  const doc = await loadingTask.promise;
  const links = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const annotations = await page.getAnnotations({ intent: 'display' });
      for (const annotation of annotations || []) {
        if (annotation?.subtype !== 'Link') continue;
        links.push({
          pageNumber,
          url: annotation.url || null,
          unsafeUrl: annotation.unsafeUrl || null,
          dest: annotation.dest || null
        });
      }
    }
  } finally {
    await doc.destroy();
  }
  return links;
}

async function generate(document, capture, renderOptions = {}) {
  return generateEmailPdf({
    document,
    renderOptions,
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

  const retainedPath = `.pdf-metadata/email-sources/${htmlDocument.source.sha256.slice(0,2)}/${htmlDocument.source.sha256}.eml`;
  const retainedDocument = {
    ...htmlDocument,
    source:{...htmlDocument.source,retained:true,retainedPath}
  };
  const retainedLink = buildEmailImportRetainedSourcePdfLink({sha256:htmlDocument.source.sha256,retainedPath});
  const retainedCapture = {};
  const retainedPdf = await generate(retainedDocument,retainedCapture,{sourceOpenUri:retainedLink});
  assertChromiumPdf(retainedPdf,'retained-source fixture');
  assert.match(retainedCapture.html,/https:\/\/pdfium-gate\.invalid\/retained-source\?/, 'controlled HTML contains portable retained-source link');
  const retainedLinks = await readPdfLinks(retainedPdf);
  const retainedUrls = retainedLinks.map(link=>String(link.url || link.unsafeUrl || ''));
  assert.ok(retainedUrls.includes(retainedLink), `finished Chromium PDF must preserve exact retained-source link; got ${JSON.stringify(retainedUrls)}`);

  process.stderr.write(`Email Import Electron PDF generation OK: Electron ${process.versions.electron}, Chromium ${process.versions.chrome}; real printToPDF output validated for HTML, CID image, hostile-source fixtures and exact retained-source PDF annotation.\n`);
}

run().then(() => {
  electron.app.exit(0);
}).catch(error => {
  console.error('Email Import Electron PDF generation check failed.');
  console.error(error && error.stack ? error.stack : error);
  electron.app.exit(1);
});
