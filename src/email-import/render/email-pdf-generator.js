'use strict';

const { renderEmailDocumentToHtml } = require('./email-html-renderer');
const { toBuffer } = require('../integrity/sha256');

function validateGeneratedPdf(pdfBytes) {
  const pdf = Buffer.from(toBuffer(pdfBytes));
  if (pdf.length < 8 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Electron PDF printer did not return a PDF document.');
  }

  const tail = pdf.subarray(Math.max(0, pdf.length - 2048)).toString('latin1');
  if (!tail.includes('%%EOF')) {
    throw new Error('Generated PDF is missing the PDF end-of-file marker.');
  }

  return pdf;
}

async function generateEmailPdf({ document, printHtmlToPdf }) {
  if (typeof printHtmlToPdf !== 'function') {
    throw new TypeError('printHtmlToPdf must be a function.');
  }

  // The printer never receives source email HTML directly. It receives only the
  // controlled document emitted by the safe renderer.
  const html = renderEmailDocumentToHtml(document);
  const pdfBytes = await printHtmlToPdf({ html });
  return validateGeneratedPdf(pdfBytes);
}

module.exports = {
  generateEmailPdf,
  validateGeneratedPdf
};
