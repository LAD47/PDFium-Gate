'use strict';

const PDFIUM_EXAMPLES_ROOT = 'Examples-Obsidian-PDFium-Gate';
const PDFIUM_EXAMPLE_ACTIVE_RECORD_ID = '11111111-1111-4111-8111-111111111111';
const PDFIUM_EXAMPLE_MISSING_RECORD_ID = '22222222-2222-4222-8222-222222222222';
const PDFIUM_EXAMPLE_DECISION_RECORD_ID = '33333333-3333-4333-8333-333333333333';
const PDFIUM_EXAMPLE_REPORT_RECORD_ID = '44444444-4444-4444-8444-444444444444';
const PDFIUM_EXAMPLE_MEMO_RECORD_ID = '55555555-5555-4555-8555-555555555555';
const PDFIUM_EXAMPLE_AWAITING_RECORD_ID = '66666666-6666-4666-8666-666666666666';
const PDFIUM_EXAMPLE_INSTALLER_LOCALES = Object.freeze(['en','nb','de','es','sv','da','fr']);
const PDFIUM_EXAMPLE_INSTALLER_TEXT = Object.freeze({
  en:Object.freeze({
    section:'Examples and learning',
    name:'Install PDFium Gate example package',
    description:"Installs synthetic metadata examples and two native Bases in {{path}}. Creates PDF Dokumentregister.base only at the Vault root if missing; existing registers are preserved.",
    button:'Install example files…',
    confirm:"Install the canonical example package in {{path}}? Existing canonical synthetic example files will be overwritten. Existing root registers, historical register copies and other files are left untouched.",
    success:"Installed {{count}} example files in {{path}}. {{overwritten}} canonical file(s) were overwritten and {{legacyPreserved}} historical register/example file(s) were preserved.",
    registerCreated:"Created PDF Dokumentregister.base at the Vault root.",
    registerPreserved:"Existing Vault-root PDF Dokumentregister.base was preserved unchanged.",
    failed:'Could not install example files: {{error}}'
  }),
  nb:Object.freeze({
    section:'Eksempler og læring',
    name:'Installer PDFium Gate-eksempelpakke',
    description:"Installerer syntetiske metadataeksempler og to vanlige Bases i {{path}}. Oppretter PDF Dokumentregister.base bare i Vault-roten hvis det mangler; eksisterende registre beholdes.",
    button:'Installer eksempelfiler…',
    confirm:"Installere den kanoniske eksempelpakken i {{path}}? Eksisterende kanoniske syntetiske eksempelfiler blir overskrevet. Eksisterende rotregistre, historiske registerkopier og andre filer beholdes urørt.",
    success:"Installerte {{count}} eksempelfiler i {{path}}. {{overwritten}} kanoniske fil(er) ble overskrevet og {{legacyPreserved}} historiske register-/eksempelfil(er) ble beholdt.",
    registerCreated:"Opprettet PDF Dokumentregister.base i Vault-roten.",
    registerPreserved:"Eksisterende PDF Dokumentregister.base i Vault-roten ble beholdt uendret.",
    failed:'Kunne ikke installere eksempelfiler: {{error}}'
  }),
  de:Object.freeze({
    section:'Beispiele und Lernen',
    name:'PDFium-Gate-Beispielpaket installieren',
    description:"Installiert synthetische Metadatenbeispiele und zwei native Bases in {{path}}. PDF Dokumentregister.base wird nur im Vault-Stammverzeichnis erstellt, wenn es fehlt; vorhandene Register bleiben erhalten.",
    button:'Beispieldateien installieren…',
    confirm:"Das kanonische Beispielpaket in {{path}} installieren? Vorhandene kanonische synthetische Beispieldateien werden überschrieben. Bestehende Stammregister, frühere Registerkopien und andere Dateien bleiben unverändert.",
    success:"{{count}} Beispieldateien in {{path}} installiert. {{overwritten}} kanonische Datei(en) wurden überschrieben und {{legacyPreserved}} frühere Register-/Beispieldatei(en) blieben erhalten.",
    registerCreated:"PDF Dokumentregister.base wurde im Vault-Stammverzeichnis erstellt.",
    registerPreserved:"Die bestehende PDF Dokumentregister.base im Vault-Stammverzeichnis blieb unverändert.",
    failed:'Beispieldateien konnten nicht installiert werden: {{error}}'
  }),
  es:Object.freeze({
    section:'Ejemplos y aprendizaje',
    name:'Instalar paquete de ejemplos de PDFium Gate',
    description:"Instala metadatos sintéticos y dos Bases nativas en {{path}}. Crea PDF Dokumentregister.base solo en la raíz del Vault si no existe; conserva los registros existentes.",
    button:'Instalar archivos de ejemplo…',
    confirm:"¿Instalar el paquete de ejemplos canónico en {{path}}? Se sobrescribirán los archivos de ejemplo sintéticos canónicos existentes. Los registros de la raíz, las copias históricas del registro y los demás archivos se conservarán sin cambios.",
    success:"Se instalaron {{count}} archivos de ejemplo en {{path}}. Se sobrescribieron {{overwritten}} archivo(s) canónico(s) y se conservaron {{legacyPreserved}} archivo(s) histórico(s) de registro o ejemplo.",
    registerCreated:"Se creó PDF Dokumentregister.base en la raíz del Vault.",
    registerPreserved:"Se conservó sin cambios el PDF Dokumentregister.base existente en la raíz del Vault.",
    failed:'No se pudieron instalar los archivos de ejemplo: {{error}}'
  }),
  sv:Object.freeze({
    section:'Exempel och lärande',
    name:'Installera PDFium Gate-exempelpaket',
    description:"Installerar syntetiska metadataexempel och två vanliga Bases i {{path}}. Skapar PDF Dokumentregister.base endast i valvets rot om det saknas; befintliga register bevaras.",
    button:'Installera exempelfiler…',
    confirm:"Installera det kanoniska exempelpaketet i {{path}}? Befintliga kanoniska syntetiska exempelfiler skrivs över. Befintliga rotregister, äldre registerkopior och andra filer lämnas orörda.",
    success:"Installerade {{count}} exempelfiler i {{path}}. {{overwritten}} kanoniska fil(er) skrevs över och {{legacyPreserved}} äldre register-/exempelfil(er) bevarades.",
    registerCreated:"PDF Dokumentregister.base skapades i valvets rot.",
    registerPreserved:"Befintlig PDF Dokumentregister.base i valvets rot bevarades oförändrad.",
    failed:'Det gick inte att installera exempelfilerna: {{error}}'
  }),
  da:Object.freeze({
    section:'Eksempler og læring',
    name:'Installer PDFium Gate-eksempelpakke',
    description:"Installerer syntetiske metadataeksempler og to almindelige Bases i {{path}}. Opretter kun PDF Dokumentregister.base i Vault-roden, hvis det mangler; eksisterende registre bevares.",
    button:'Installer eksempelfiler…',
    confirm:"Installere den kanoniske eksempelpakke i {{path}}? Eksisterende kanoniske syntetiske eksempelfiler overskrives. Eksisterende rodregistre, historiske registerkopier og andre filer bevares urørt.",
    success:"Installerede {{count}} eksempelfiler i {{path}}. {{overwritten}} kanoniske fil(er) blev overskrevet, og {{legacyPreserved}} historiske register-/eksempelfil(er) blev bevaret.",
    registerCreated:"PDF Dokumentregister.base blev oprettet i Vault-roden.",
    registerPreserved:"Eksisterende PDF Dokumentregister.base i Vault-roden blev bevaret uændret.",
    failed:'Eksempelfilerne kunne ikke installeres: {{error}}'
  }),
  fr:Object.freeze({
    section:'Exemples et apprentissage',
    name:'Installer le paquet d’exemples PDFium Gate',
    description:"Installe des exemples de métadonnées synthétiques et deux Bases natives dans {{path}}. Crée PDF Dokumentregister.base uniquement à la racine du Vault s’il manque ; les registres existants sont conservés.",
    button:'Installer les fichiers d’exemple…',
    confirm:"Installer le paquet d’exemples canonique dans {{path}} ? Les fichiers d’exemple synthétiques canoniques existants seront remplacés. Les registres à la racine, les copies historiques du registre et les autres fichiers restent inchangés.",
    success:"{{count}} fichiers d’exemple installés dans {{path}}. {{overwritten}} fichier(s) canonique(s) remplacé(s) et {{legacyPreserved}} fichier(s) historique(s) de registre ou d’exemple conservé(s).",
    registerCreated:"PDF Dokumentregister.base a été créé à la racine du Vault.",
    registerPreserved:"Le fichier PDF Dokumentregister.base existant à la racine du Vault a été préservé.",
    failed:'Impossible d’installer les fichiers d’exemple : {{error}}'
  })
});

function metadataExampleUiText(i18n, key, params = {}) {
  const locale = i18n?.getResolvedLanguage?.() || 'en';
  const dictionary = PDFIUM_EXAMPLE_INSTALLER_TEXT[locale] || PDFIUM_EXAMPLE_INSTALLER_TEXT.en;
  const template = dictionary[key] || PDFIUM_EXAMPLE_INSTALLER_TEXT.en[key] || key;
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match,name) => {
    return Object.prototype.hasOwnProperty.call(params,name) ? String(params[name]) : `{{${name}}}`;
  });
}

function metadataExampleReadmeMarkdown() {
  const tick=String.fromCharCode(96);
  return [
    '# PDFium Gate examples',
    '',
    'This folder contains synthetic example data for learning how PDFium Gate metadata works with ordinary Obsidian Bases.',
    '',
    'These files are examples only. They live outside ' + tick + 'File Metadata/' + tick + ', so PDFium Gate does not index them as real document records and they never use your real registered PDFs.',
    '',
    '## Two different Base concepts',
    '',
    '- The Base files in this folder use Obsidian\'s built-in ' + tick + 'table' + tick + ' view. They demonstrate that PDFium Gate metadata remains ordinary Markdown/YAML that you can reuse in your own Bases.',
    '- The real PDFium Gate document register is different: ' + tick + 'PDF Dokumentregister.base' + tick + ' reads real records from ' + tick + 'File Metadata/' + tick + ' and uses PDFium Gate\'s dedicated ' + tick + 'pdfium-document-register' + tick + ' view.',
    '- Installing examples creates ' + tick + 'PDF Dokumentregister.base' + tick + ' only at the Vault root if missing. No register copy is installed in this folder; existing registers and historical copies remain untouched.',
    '',
    '## Included files',
    '',
    '- ' + tick + 'Example - Active PDF record.md' + tick + ' — complete example using all current factory metadata fields.',
    '- ' + tick + 'Example - Decision.md' + tick + ' — active decision with a received response.',
    '- ' + tick + 'Example - Report.md' + tick + ' — active report with no response workflow completed.',
    '- ' + tick + 'Example - Memo.md' + tick + ' — active memo with both received and sent response data.',
    '- ' + tick + 'Example - Awaiting response.md' + tick + ' — active letter where a response was sent but no response has been received yet.',
    '- ' + tick + 'Example - Missing PDF record.md' + tick + ' — preserved metadata whose PDF is missing; missing records remain historical/read-only until explicitly deleted or a future backup restore path is used.',
    '- ' + tick + 'Example - Native Obsidian Base - All documents.base' + tick + ' — native table showing the whole synthetic example set.',
    '- ' + tick + 'Example - Native Obsidian Base - Awaiting response.base' + tick + ' — native filtered table showing one practical workflow.',
    '',
    '## Important',
    '',
    'Do not move these example Markdown files unchanged into ' + tick + 'File Metadata/' + tick + '. They contain fixed sample UUIDs and placeholder PDF links.',
    '',
    'The examples are installed only when you choose the example-package action in PDFium Gate Settings. Running the action again restores the current canonical example files after an explicit warning. Existing root registers, historical register copies, legacy Bases and unrelated files are never overwritten, moved or deleted.',
    ''
  ].join('\n');
}

function metadataExampleRecordMarkdown({id,filePath,status=METADATA_RECORD_STATUS_ACTIVE,values,title,body}) {
  const schema=metadataUpgradeAuthorSourceUrl(metadataDefaultSchema()).schema;
  return metadataRecordSerializeMarkdown({id,filePath,status,values},schema)
    + '# ' + title + '\n\n'
    + body + '\n';
}

function metadataExampleActiveRecordMarkdown() {
  return metadataExampleRecordMarkdown({
    id:PDFIUM_EXAMPLE_ACTIVE_RECORD_ID,
    filePath:'Example Documents/example-letter.pdf',
    values:{
      document_date:'2016-03-17',
      document_time:'14:35',
      sender:'Example Municipality',
      author:'A. Example',
      source_url:'https://example.org/publications/example-letter',
      document_type:'letter',
      response_received:true,
      response_received_date:'2016-03-24',
      response_sent:true,
      response_sent_date:'2016-03-25',
      response_sent_link:'[[Example Documents/example-response.md]]'
    },
    title:'Example active PDF metadata record',
    body:'This example uses the nine original fields plus Author and Published online.'
  });
}

function metadataExampleDecisionRecordMarkdown() {
  return metadataExampleRecordMarkdown({
    id:PDFIUM_EXAMPLE_DECISION_RECORD_ID,
    filePath:'Example Documents/example-decision.pdf',
    values:{document_date:'2026-09-12',sender:'Fjordvik Municipality',document_type:'decision',response_received:true,response_received_date:'2026-09-14',response_sent:false},
    title:'Example decision',
    body:'An active decision record with a received response.'
  });
}

function metadataExampleReportRecordMarkdown() {
  return metadataExampleRecordMarkdown({
    id:PDFIUM_EXAMPLE_REPORT_RECORD_ID,
    filePath:'Example Documents/example-report.pdf',
    values:{document_date:'2026-08-28',sender:'Regional Audit Office',document_type:'report',response_received:false,response_sent:false},
    title:'Example report',
    body:'An active report record that demonstrates empty response dates and links.'
  });
}

function metadataExampleMemoRecordMarkdown() {
  return metadataExampleRecordMarkdown({
    id:PDFIUM_EXAMPLE_MEMO_RECORD_ID,
    filePath:'Example Documents/example-memo.pdf',
    values:{document_date:'2026-07-03',document_time:'09:10',sender:'Project Aurora',document_type:'memo',response_received:true,response_received_date:'2026-07-03',response_sent:true,response_sent_date:'2026-07-04',response_sent_link:'[[Example Documents/aurora-response.md]]'},
    title:'Example memo',
    body:'An active memo with both received and sent response data.'
  });
}

function metadataExampleAwaitingRecordMarkdown() {
  return metadataExampleRecordMarkdown({
    id:PDFIUM_EXAMPLE_AWAITING_RECORD_ID,
    filePath:'Example Documents/example-awaiting-response.pdf',
    values:{document_date:'2026-09-30',sender:'North Harbour Agency',document_type:'letter',response_received:false,response_sent:true,response_sent_date:'2026-10-01'},
    title:'Example awaiting response',
    body:'A letter where a response has been sent but no response has been received yet.'
  });
}

function metadataExampleMissingRecordMarkdown() {
  return metadataExampleRecordMarkdown({
    id:PDFIUM_EXAMPLE_MISSING_RECORD_ID,
    filePath:'Example Documents/missing-example-decision.pdf',
    status:METADATA_RECORD_STATUS_MISSING,
    values:{document_date:'2015-11-02',sender:'Example Public Office',document_type:'decision',response_received:false,response_sent:false},
    title:'Example missing-PDF metadata record',
    body:'The metadata survives when the linked PDF is missing. Missing records remain historical/read-only until the user explicitly deletes the metadata or a future validated backup restore path is available.'
  });
}

function metadataExampleNativeBaseProperties(lines,fields,q) {
  lines.push('properties:');
  for(const field of fields) {
    lines.push('  ' + field.property + ':');
    lines.push('    displayName: ' + q(field.label));
  }
  lines.push('  filemeta_status:');
  lines.push('    displayName: ' + q('Status'));
  lines.push('  filemeta_file:');
  lines.push('    displayName: ' + q('PDF'));
  lines.push('  filemeta_id:');
  lines.push('    displayName: ' + q('Metadata ID'));
}

function metadataExampleNativeBaseOrder(lines,fields) {
  lines.push('    order:');
  for(const field of fields) lines.push('      - ' + field.property);
  lines.push('      - filemeta_status');
  lines.push('      - filemeta_file');
  lines.push('      - filemeta_id');
}

function metadataExampleNativeAllBaseYaml() {
  const schema=metadataUpgradeAuthorSourceUrl(metadataDefaultSchema()).schema;
  const fields=metadataDocumentRegisterBaseFields(schema);
  const q=value=>JSON.stringify(String(value));
  const lines=[
    '# PDFium Gate example — native Obsidian Base',
    '# This uses Obsidian\'s built-in table view, not the PDFium Gate document-register view.',
    'filters:',
    '  and:',
    '    - ' + q('file.inFolder("' + PDFIUM_EXAMPLES_ROOT + '")'),
    '    - ' + q('filemeta_type == "pdf"'),
    '    - ' + q('filemeta_profile == "document"')
  ];
  metadataExampleNativeBaseProperties(lines,fields,q);
  lines.push('views:');
  lines.push('  - type: table');
  lines.push('    name: ' + q('Native Base example — all documents'));
  metadataExampleNativeBaseOrder(lines,fields);
  lines.push('    sort:');
  lines.push('      - property: document_date');
  lines.push('        direction: DESC');
  return lines.join('\n') + '\n';
}

function metadataExampleNativeAwaitingResponseBaseYaml() {
  const schema=metadataUpgradeAuthorSourceUrl(metadataDefaultSchema()).schema;
  const fields=metadataDocumentRegisterBaseFields(schema);
  const q=value=>JSON.stringify(String(value));
  const lines=[
    '# PDFium Gate example — native Obsidian Base',
    '# Practical filter example: active documents where no response has been received.',
    'filters:',
    '  and:',
    '    - ' + q('file.inFolder("' + PDFIUM_EXAMPLES_ROOT + '")'),
    '    - ' + q('filemeta_type == "pdf"'),
    '    - ' + q('filemeta_profile == "document"'),
    '    - ' + q('filemeta_status == "active"'),
    '    - ' + q('response_received == false')
  ];
  metadataExampleNativeBaseProperties(lines,fields,q);
  lines.push('views:');
  lines.push('  - type: table');
  lines.push('    name: ' + q('Native Base example — awaiting response'));
  lines.push('    order:');
  for(const property of ['document_date','sender','document_type','response_sent','response_sent_date','filemeta_file']) lines.push('      - ' + property);
  lines.push('    sort:');
  lines.push('      - property: document_date');
  lines.push('        direction: DESC');
  return lines.join('\n') + '\n';
}

function metadataExampleLegacyNativeBaseYaml() {
  const schema=metadataDefaultSchema();
  const fields=metadataDocumentRegisterBaseFields(schema);
  const q=value=>JSON.stringify(String(value));
  const lines=[
    '# PDFium Gate examples — native Obsidian Bases view',
    '# This Base intentionally uses the built-in table view, not the PDFium Gate custom view.',
    'filters:',
    '  and:',
    '    - ' + q('file.inFolder("' + PDFIUM_EXAMPLES_ROOT + '")'),
    '    - ' + q('filemeta_type == "pdf"'),
    '    - ' + q('filemeta_profile == "document"')
  ];
  metadataExampleNativeBaseProperties(lines,fields,q);
  lines.push('views:');
  lines.push('  - type: table');
  lines.push('    name: ' + q('PDF metadata examples'));
  metadataExampleNativeBaseOrder(lines,fields);
  lines.push('    sort:');
  lines.push('      - property: document_date');
  lines.push('        direction: DESC');
  return lines.join('\n') + '\n';
}

function metadataExampleFiles(schema = metadataUpgradeAuthorSourceUrl(metadataDefaultSchema()).schema, viewName = PDF_DOCUMENT_REGISTER_STANDARD_VIEW_NAME) {
  return Object.freeze([
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/README.md',content:metadataExampleReadmeMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Active PDF record.md',content:metadataExampleActiveRecordMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Decision.md',content:metadataExampleDecisionRecordMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Report.md',content:metadataExampleReportRecordMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Memo.md',content:metadataExampleMemoRecordMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Awaiting response.md',content:metadataExampleAwaitingRecordMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Missing PDF record.md',content:metadataExampleMissingRecordMarkdown()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Native Obsidian Base - All documents.base',content:metadataExampleNativeAllBaseYaml()}),
    Object.freeze({path:PDFIUM_EXAMPLES_ROOT + '/Example - Native Obsidian Base - Awaiting response.base',content:metadataExampleNativeAwaitingResponseBaseYaml()})
  ]);
}

module.exports = {
  PDFIUM_EXAMPLES_ROOT,
  PDFIUM_EXAMPLE_ACTIVE_RECORD_ID,
  PDFIUM_EXAMPLE_MISSING_RECORD_ID,
  PDFIUM_EXAMPLE_DECISION_RECORD_ID,
  PDFIUM_EXAMPLE_REPORT_RECORD_ID,
  PDFIUM_EXAMPLE_MEMO_RECORD_ID,
  PDFIUM_EXAMPLE_AWAITING_RECORD_ID,
  PDFIUM_EXAMPLE_INSTALLER_LOCALES,
  PDFIUM_EXAMPLE_INSTALLER_TEXT,
  metadataExampleUiText,
  metadataExampleReadmeMarkdown,
  metadataExampleActiveRecordMarkdown,
  metadataExampleDecisionRecordMarkdown,
  metadataExampleReportRecordMarkdown,
  metadataExampleMemoRecordMarkdown,
  metadataExampleAwaitingRecordMarkdown,
  metadataExampleMissingRecordMarkdown,
  metadataExampleNativeAllBaseYaml,
  metadataExampleNativeAwaitingResponseBaseYaml,
  metadataExampleLegacyNativeBaseYaml,
  metadataExampleFiles
};
