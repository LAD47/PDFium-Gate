#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {zipSync,strToU8}=require('fflate');

const target=path.resolve(process.argv[2] || 'C:\\Obsidian\\Vault\\05 test');
const selector=String(process.argv[3] || '').trim().toLowerCase();

function wrapBase64(buffer) {
  return Buffer.from(buffer).toString('base64').match(/.{1,76}/g).join('\r\n');
}

function makePdf(label) {
  const safe=String(label||'PDF').replace(/[()\\]/g,' ');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const stream=`BT /F1 18 Tf 72 760 Td (${safe}) Tj ET\n`;
  objects[3]=`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}endstream`;
  let text='%PDF-1.4\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(text,'ascii'));
    text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=Buffer.byteLength(text,'ascii');
  text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) text+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  text+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text,'ascii');
}

function zip(files) {
  const input={};
  for(const [name,value] of Object.entries(files)) input[name]=value instanceof Uint8Array?value:new Uint8Array(value);
  return Buffer.from(zipSync(input,{level:6}));
}

function eml({subject,zipName,zipBytes,date}) {
  const boundary='pdfium-gate-zip-fixture-boundary';
  return [
    'From: Test Sender <sender@example.invalid>',
    'To: Test Recipient <recipient@example.invalid>',
    `Date: ${date}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    'Syntetisk testmail for PDFium Gate ZIP-import.',
    '',
    `--${boundary}`,
    `Content-Type: application/zip; name="${zipName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${zipName}"`,
    '',
    wrapBase64(zipBytes),
    '',
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

const tinyPng=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64'
);

const fixtures=[
  {
    file:'zip-01-pdf-only.eml',
    subject:'ZIP test 01 - bare PDF-filer',
    zipName:'Saksdokumenter.zip',
    date:'Mon, 5 Oct 2026 08:01:00 +0200',
    files:{
      'rapport.pdf':makePdf('Rapport fra ZIP'),
      'underkatalog/vedtak.pdf':makePdf('Vedtak i underkatalog')
    }
  },
  {
    file:'zip-02-supported-mixed.eml',
    subject:'ZIP test 02 - støttede blandede filer',
    zipName:'Materiale.zip',
    date:'Mon, 5 Oct 2026 08:02:00 +0200',
    files:{
      'dokument.pdf':makePdf('PDF i blandet ZIP'),
      'notater/lesmeg.txt':strToU8('Dette er en syntetisk tekstfil.'),
      'bilder/pixel.png':tinyPng
    }
  },
  {
    file:'zip-03-unsupported.eml',
    subject:'ZIP test 03 - ikke støttede formater',
    zipName:'Arkiv-med-ukjente-filer.zip',
    date:'Mon, 5 Oct 2026 08:03:00 +0200',
    files:{
      'støttet/vedlegg.pdf':makePdf('Støttet PDF'),
      'støttet/notat.txt':strToU8('Støttet tekstfil'),
      'andre/brev.docx':strToU8('synthetic DOCX placeholder - not an Office document'),
      'andre/regneark.xlsx':strToU8('synthetic XLSX placeholder - not an Office document'),
      'andre/tegning.dwg':strToU8('synthetic DWG placeholder'),
      'andre/program.exe':strToU8('synthetic EXE placeholder - NOT EXECUTABLE')
    }
  },
  {
    file:'zip-04-many-files.eml',
    subject:'ZIP test 04 - mange filer',
    zipName:'Mange-filer.zip',
    date:'Mon, 5 Oct 2026 08:04:00 +0200',
    files:Object.fromEntries([
      ...Array.from({length:15},(_,i)=>[`PDF/dokument-${String(i+1).padStart(2,'0')}.pdf`,makePdf(`Dokument ${i+1}`)]),
      ...Array.from({length:20},(_,i)=>[`Tekst/notat-${String(i+1).padStart(2,'0')}.txt`,strToU8(`Notat ${i+1}`)])
    ])
  }
];

const selected=selector
  ? fixtures.filter(fixture=>fixture.file.toLowerCase().includes(selector) || fixture.subject.toLowerCase().includes(selector))
  : fixtures;
if(!selected.length) {
  console.error(`No ZIP fixture matched selector: ${selector}`);
  process.exit(2);
}

fs.mkdirSync(target,{recursive:true});
for(const fixture of selected){
  const zipBytes=zip(fixture.files);
  const source=eml({...fixture,zipBytes});
  const out=path.join(target,fixture.file);
  fs.writeFileSync(out,source,'utf8');
  console.log(out);
}
console.log(`Created ${selected.length} synthetic Email Import ZIP fixture(s) in ${target}`);
