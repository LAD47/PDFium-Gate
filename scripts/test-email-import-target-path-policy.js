'use strict';

const assert=require('assert/strict');
const {
  normalizeVaultPath,
  safeFilenamePart,
  emailBundleFolderPath,
  suggestedEmailPdfPath,
  suggestedEmailPdfPathInFolder,
  suggestedAttachmentPdfPath,
  validateTargetPdfPath
}=require('../src/email-import/runtime/target-path-policy');

const existingSet=values=>{
  const entries=new Set(values||[]);
  return path=>entries.has(path);
};

assert.equal(normalizeVaultPath('\\Folder\\Mail.pdf'),'Folder/Mail.pdf');
assert.equal(safeFilenamePart('  A:B?C  ','email'),'A B C');
assert.equal(safeFilenamePart('CON','email'),'_CON');
assert.equal(safeFilenamePart('...','fallback'),'fallback');

const document={
  message:{
    subject:'Innsyn juridisk vurdering Fredrikstad kommune',
    dateTime:{iso:'2026-10-08T07:00:00.000Z'}
  }
};
const base='2026-10-08 - EPOST- Innsyn juridisk vurdering Fredrikstad kommune';
const bundle=`00_Innboks/${base}`;
const expectedPdf=`${bundle}/${base}.pdf`;
assert.equal(
  suggestedEmailPdfPathInFolder(document,'00_Innboks',existingSet([])),
  expectedPdf
);
assert.equal(emailBundleFolderPath(expectedPdf),bundle);
assert.equal(suggestedEmailPdfPath(document,existingSet([])),`Email Imports/${base}/${base}.pdf`);
assert.equal(
  suggestedEmailPdfPathInFolder(document,'',existingSet([])),
  `${base}/${base}.pdf`
);
const next=`${base} (2)`;
assert.equal(
  suggestedEmailPdfPathInFolder(document,'00_Innboks',existingSet([bundle])),
  `00_Innboks/${next}/${next}.pdf`
);
assert.equal(
  suggestedEmailPdfPathInFolder(document,'00_Innboks',existingSet([
    bundle,`00_Innboks/${next}`
  ])),
  `00_Innboks/${base} (3)/${base} (3).pdf`
);
assert.equal(
  suggestedEmailPdfPathInFolder(document,'00_Innboks',existingSet([expectedPdf])),
  `00_Innboks/${next}/${next}.pdf`
);

assert.deepEqual(
  validateTargetPdfPath(expectedPdf,existingSet([])),
  {ok:true,path:expectedPdf,bundleFolder:bundle,attachmentFolder:bundle}
);
assert.equal(validateTargetPdfPath(expectedPdf.slice(0,-4)+'.txt',existingSet([])).ok,false);
assert.equal(validateTargetPdfPath('../mail.pdf',existingSet([])).ok,false);
assert.equal(validateTargetPdfPath('.pdf-metadata/mail/mail.pdf',existingSet([])).ok,false);
assert.equal(validateTargetPdfPath('File Metadata/mail/mail.pdf',existingSet([])).ok,false);
assert.equal(validateTargetPdfPath(expectedPdf,existingSet([expectedPdf])).ok,false);
assert.equal(validateTargetPdfPath(expectedPdf,existingSet([bundle])).ok,false);
assert.equal(validateTargetPdfPath('00_Innboks/mail.pdf',existingSet([])).ok,false,'no loose email PDF allowed');
assert.equal(validateTargetPdfPath('00_Innboks/mail/other.pdf',existingSet([])).ok,false,'PDF name must match folder');
assert.equal(validateTargetPdfPath('mail.pdf',existingSet([])).ok,false,'email needs its own folder');

// The standalone "import PDF attachment" command continues to put its target
// next to the active parent; it is not the bulk EML/MSG bundling workflow.
const attachment={filename:'supporting-document.pdf'};
assert.equal(
  suggestedAttachmentPdfPath(expectedPdf,attachment,existingSet([])),
  `${bundle}/supporting-document.pdf`
);

console.log('Email Import bundle path policy OK: one EPOST folder containing its namesake PDF, collision-safe folder numbering, no shared-folder overwrite, safe naming and legacy manual PDF attachment target policy.');
