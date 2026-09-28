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

  const probeHtml = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"></head><body>
    <p><a href="obsidian://open?vault=ProbeVault&file=.pdf-metadata%2Femail-sources%2Faa%2Fprobe.eml">Obsidian probe</a></p>
    <p><a href="https://pdfium-gate.invalid/open-retained-source?file=.pdf-metadata%2Femail-sources%2Faa%2Fprobe.eml">HTTPS probe</a></p>
  </body></html>`;
  const probePdf = await printHtmlToPdfWithElectron({ html: probeHtml, electronModule: electron });
  assertChromiumPdf(probePdf, 'link annotation probe');
  const probeLinks = await readPdfLinks(probePdf);
  console.log(`Email Import Chromium link annotation probe: ${JSON.stringify(probeLinks)}`);
  assert.ok(
    probeLinks.some(link => String(link.url || link.unsafeUrl || '').startsWith('https://pdfium-gate.invalid/open-retained-source?')),
    'Chromium PDF must preserve ordinary HTTPS link annotations'
  );

  console.log(`Email Import Electron PDF generation OK: Electron ${process.versions.electron}, Chromium ${process.versions.chrome}; real printToPDF output validated for HTML, CID image, hostile-source fixtures and link annotations.`);
}

run().then(() => {
  electron.app.exit(0);
}).catch(error => {
  console.error('Email Import Electron PDF generation check failed.');
  console.error(error && error.stack ? error.stack : error);
  electron.app.exit(1);
});
