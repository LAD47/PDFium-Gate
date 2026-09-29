'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { sha256Hex } = require('../src/core/integrity/sha256');
const { analyzeEmailAttachments } = require('../src/email-import/attachments/attachment-policy');
const {
  sanitizeAttachmentFilename,
  verifiedAttachmentBytes,
  verifiedPdfAttachmentBytes,
  extractAttachment
} = require('../src/email-import/attachments/attachment-extraction');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test', 'fixtures', 'email');
const attachmentRoot = path.join(fixtureRoot, 'attachments');

async function parseFixture(filename) {
  return parseEml({
    sourceBytes: fs.readFileSync(path.join(fixtureRoot, filename)),
    originalFilename: filename
  });
}

(async () => {
  const inlineDocument = await parseFixture('inline-image-and-pdf.eml');
  const inlineAnalysis = analyzeEmailAttachments(inlineDocument);
  assert.equal(inlineAnalysis.items.length, 2, 'all canonical attachments remain represented');
  assert.equal(inlineAnalysis.inlineResources.length, 1, 'CID image classified as inline resource');
  assert.equal(inlineAnalysis.inlineResources[0].attachment.filename, 'inline-logo.png');
  assert.equal(inlineAnalysis.inlineResources[0].referencedInline, true, 'CID image is referenced by message HTML');
  assert.equal(inlineAnalysis.attachments.length, 1, 'ordinary attachment kept separate from inline resource');
  assert.equal(inlineAnalysis.attachments[0].attachment.filename, 'test-attachment-2.pdf');
  assert.equal(inlineAnalysis.pdfCandidates.length, 1, 'PDF attachment is an independent-PDF candidate');
  assert.deepEqual(inlineAnalysis.pdfCandidates[0].pdfEvidence.sort(), ['filename', 'mime', 'payload']);

  const multipleDocument = await parseFixture('multiple-attachments.eml');
  const multipleAnalysis = analyzeEmailAttachments(multipleDocument);
  assert.equal(multipleAnalysis.attachments.length, 3, 'all ordinary attachments remain user attachments');
  assert.equal(multipleAnalysis.inlineResources.length, 0, 'ordinary attachments are not misclassified as inline');
  assert.equal(multipleAnalysis.pdfCandidates.length, 2, 'both PDF attachments are PDF candidates');
  assert.equal(multipleAnalysis.extractable.length, 3, 'decoded payloads are extractable');

  const pdfAttachment = multipleDocument.attachments[0];
  const verified = verifiedAttachmentBytes(pdfAttachment);
  assert.equal(verified.sha256, pdfAttachment.sha256, 'decoded payload hash verified before extraction');
  assert.ok(verified.bytes.equals(fs.readFileSync(path.join(attachmentRoot, 'test-attachment-1.pdf'))), 'decoded PDF bytes match reference fixture');

  const verifiedPdf = verifiedPdfAttachmentBytes(pdfAttachment);
  assert.equal(verifiedPdf.sha256, pdfAttachment.sha256, 'PDF attachment hash verified before document import');
  assert.equal(verifiedPdf.bytes.subarray(0,5).toString('ascii'), '%PDF-', 'PDF document import requires real PDF payload signature');

  const fakePdfBytes = Buffer.from('this is not actually a PDF');
  const fakePdf = {
    ...pdfAttachment,
    filename:'looks-like.pdf',
    contentType:'application/pdf',
    content:fakePdfBytes,
    size:fakePdfBytes.length,
    sha256:sha256Hex(fakePdfBytes)
  };
  await assert.rejects(
    async () => verifiedPdfAttachmentBytes(fakePdf),
    /not a PDF payload/i,
    'filename and MIME evidence alone cannot be imported as a PDF document without PDF payload bytes'
  );

  const truncatedPdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
  const truncatedPdf = {
    ...pdfAttachment,
    content:truncatedPdfBytes,
    size:truncatedPdfBytes.length,
    sha256:sha256Hex(truncatedPdfBytes)
  };
  await assert.rejects(
    async () => verifiedPdfAttachmentBytes(truncatedPdf),
    /end-of-file marker/i,
    'truncated PDF payload is refused before document import'
  );

  assert.equal(sanitizeAttachmentFilename('../outside.pdf', pdfAttachment), 'outside.pdf', 'path traversal components removed from filename');
  assert.equal(sanitizeAttachmentFilename('folder\\nested\\report.pdf', pdfAttachment), 'report.pdf', 'Windows path components removed from filename');
  assert.equal(sanitizeAttachmentFilename('CON.pdf', pdfAttachment), '_CON.pdf', 'Windows reserved name neutralized');
  assert.equal(sanitizeAttachmentFilename('bad:name?.pdf', pdfAttachment), 'bad_name_.pdf', 'cross-platform forbidden filename characters neutralized');

  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfium-email-attachments-'));
  try {
    const first = await extractAttachment({ attachment: pdfAttachment, destinationRoot: tempRoot });
    assert.equal(first.reused, false, 'first extraction creates file');
    assert.equal(first.filename, 'test-attachment-1.pdf');
    assert.equal(first.sha256, pdfAttachment.sha256);
    assert.ok(first.targetPath.startsWith(path.resolve(tempRoot) + path.sep), 'extraction stays inside destination root');
    assert.ok(fs.readFileSync(first.targetPath).equals(pdfAttachment.content), 'extracted bytes are byte-identical');

    const second = await extractAttachment({ attachment: pdfAttachment, destinationRoot: tempRoot });
    assert.equal(second.reused, true, 'same filename and same bytes are reused safely');
    assert.equal(second.targetPath, first.targetPath);

    await fs.promises.writeFile(first.targetPath, Buffer.from('different bytes'));
    await assert.rejects(
      () => extractAttachment({ attachment: pdfAttachment, destinationRoot: tempRoot }),
      /collision/i,
      'different existing bytes fail closed instead of being overwritten'
    );

    const tampered = { ...pdfAttachment, content: Buffer.concat([pdfAttachment.content, Buffer.from('x')]) };
    await assert.rejects(
      () => extractAttachment({ attachment: tampered, destinationRoot: tempRoot, filename: 'tampered.pdf' }),
      /size mismatch|SHA-256 mismatch/i,
      'tampered runtime payload fails integrity validation'
    );
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }

  console.log('Email Import attachment handling OK: inline/CID resources separated from user attachments, PDF candidates identified, actual PDF payload verified before document import, safe filenames enforced, and explicit extraction preserves exact bytes with fail-closed collisions.');
})().catch(error => {
  console.error('Email Import attachment handling check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
