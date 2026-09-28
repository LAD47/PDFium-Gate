'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { parseMsg } = require('../src/email-import/parsers/msg-parser');
const { buildSyntheticMsg } = require('../test/fixtures/email/synthetic-msg-builder');
const metadataSchema = require('../src/metadata/schema-contract');
const metadataRecord = require('../src/metadata/record-contract');
const { metadataDocumentRegisterStandardBaseYaml } = require('../src/metadata/document-register-base-config');
const {
  FACTORY_FIELD_IDS,
  EMAIL_IMPORT_TECHNICAL_PROPERTIES,
  sourceWallClock,
  buildEmailImportRecordValues,
  buildEmailImportRegistrationPlan
} = require('../src/email-import/metadata/email-metadata-projection');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test', 'fixtures', 'email');
const attachmentRoot = path.join(fixtureRoot, 'attachments');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

(async () => {
  const defaultSchema = metadataSchema.metadataDefaultSchema();
  assert.equal(metadataSchema.metadataValidateSchema(defaultSchema).ok, true, 'factory metadata schema is valid');

  const wallClock = sourceWallClock({
    raw: 'Mon, 28 Sep 2026 15:30:45 +0200',
    iso: '2026-09-28T13:30:45.000Z',
    valid: true
  });
  assert.deepEqual(wallClock, {
    date: '2026-09-28',
    timeMinute: '15:30',
    timeSecond: '15:30:45',
    source: 'raw-source-wall-clock'
  }, 'metadata projection preserves the source Date header wall clock instead of silently converting it to UTC');

  const emlBytes = fs.readFileSync(path.join(fixtureRoot, 'inline-image-and-pdf.eml'));
  const emlDocument = await parseEml({ sourceBytes: emlBytes, originalFilename: 'inline-image-and-pdf.eml' });
  const emlProjection = buildEmailImportRecordValues({ document: emlDocument, schema: defaultSchema });

  assert.equal(emlProjection.technicalValues.email_import_source_format, 'eml');
  assert.equal(emlProjection.technicalValues.email_import_source_sha256, emlDocument.source.sha256);
  assert.equal(emlProjection.technicalValues.email_import_original_filename, 'inline-image-and-pdf.eml');
  assert.equal(emlProjection.technicalValues.email_import_source_retained, false);
  assert.equal(emlProjection.technicalValues.email_import_attachment_count, 2);
  assert.equal(emlProjection.technicalValues.email_import_user_attachment_count, 1);
  assert.equal(emlProjection.technicalValues.email_import_inline_resource_count, 1);
  assert.equal(emlProjection.technicalValues.email_import_pdf_candidate_count, 1);
  assert.ok(emlProjection.userFieldSuggestions.document_date, 'factory document date receives an initial suggestion');
  assert.ok(emlProjection.userFieldSuggestions.document_time, 'factory document time receives an initial suggestion');
  assert.ok(emlProjection.userFieldSuggestions.sender, 'factory sender receives an initial suggestion');
  assert.equal(Object.prototype.hasOwnProperty.call(emlProjection.userFieldSuggestions, 'document_type'), false, 'document type is never guessed by Email Import');

  const retainedDocument = clone({ ...emlDocument, attachments: [] });
  retainedDocument.attachments = emlDocument.attachments;
  retainedDocument.source = {
    ...emlDocument.source,
    retained: true,
    retainedPath: `.pdf-metadata/email-sources/${emlDocument.source.sha256.slice(0, 2)}/${emlDocument.source.sha256}.eml`
  };
  const retainedProjection = buildEmailImportRecordValues({ document: retainedDocument, schema: defaultSchema });
  assert.equal(retainedProjection.technicalValues.email_import_source_retained, true);
  assert.equal(retainedProjection.technicalValues.email_import_retained_path, retainedDocument.source.retainedPath);

  const renamedSchema = clone(defaultSchema);
  renamedSchema.fields.find(field => field.id === FACTORY_FIELD_IDS.documentDate).property = 'dokumentdato';
  renamedSchema.fields.find(field => field.id === FACTORY_FIELD_IDS.documentTime).property = 'dokumenttid';
  renamedSchema.fields.find(field => field.id === FACTORY_FIELD_IDS.sender).property = 'avsender';
  assert.equal(metadataSchema.metadataValidateSchema(renamedSchema).ok, true, 'renamed factory properties remain a valid user schema');
  const renamedProjection = buildEmailImportRecordValues({ document: emlDocument, schema: renamedSchema });
  assert.ok(renamedProjection.userFieldSuggestions.dokumentdato, 'stable factory field ID maps date even after property rename');
  assert.ok(renamedProjection.userFieldSuggestions.dokumenttid, 'stable factory field ID maps time even after property rename');
  assert.ok(renamedProjection.userFieldSuggestions.avsender, 'stable factory field ID maps sender even after property rename');
  assert.equal(Object.prototype.hasOwnProperty.call(renamedProjection.userFieldSuggestions, 'document_date'), false);

  const customSchema = {
    format_version: 1,
    revision: 1,
    fields: [metadataSchema.metadataMakeField({ property: 'case_topic', label: 'Case topic', type: 'text' })]
  };
  assert.equal(metadataSchema.metadataValidateSchema(customSchema).ok, true);
  const customProjection = buildEmailImportRecordValues({ document: emlDocument, schema: customSchema });
  assert.deepEqual(customProjection.userFieldSuggestions, {}, 'Email Import does not invent mappings into unrelated custom user fields');
  assert.equal(customProjection.technicalValues.email_import_source_sha256, emlDocument.source.sha256, 'technical provenance is independent of user schema');

  const collisionSchema = clone(defaultSchema);
  collisionSchema.fields.push(metadataSchema.metadataMakeField({ property: 'email_import_note', label: 'Collision', type: 'text' }));
  assert.throws(
    () => buildEmailImportRecordValues({ document: emlDocument, schema: collisionSchema }),
    /reserved Email Import property namespace/i,
    'user schema collision with technical namespace fails closed'
  );

  const freshPlan = buildEmailImportRegistrationPlan({
    document: emlDocument,
    schema: defaultSchema,
    documentRecordState: { ok: true, registered: false }
  });
  assert.equal(freshPlan.ok, true);
  assert.equal(freshPlan.fileType, 'pdf');
  assert.equal(freshPlan.profile, 'document');
  assert.equal(freshPlan.requiresFreshRecord, true);
  assert.equal(freshPlan.savePort, 'saveDocumentMetadataRecordValues');

  const existingPlan = buildEmailImportRegistrationPlan({
    document: emlDocument,
    schema: defaultSchema,
    documentRecordState: { ok: true, registered: true, id: 'existing' }
  });
  assert.equal(existingPlan.ok, false, 'provenance is not silently attached to an existing document record');
  assert.equal(existingPlan.reason, 'existing-document-record');

  const recordId = '11111111-1111-4111-8111-111111111111';
  const markdown = metadataRecord.metadataRecordSerializeMarkdown({
    id: recordId,
    pdfPath: 'Imports/Synthetic email.pdf',
    status: metadataRecord.METADATA_RECORD_STATUS_ACTIVE,
    values: freshPlan.values
  }, defaultSchema);
  assert.match(markdown, /filemeta_type: "pdf"/);
  assert.match(markdown, /filemeta_profile: "document"/);
  assert.match(markdown, /email_import_source_sha256:/, 'technical provenance serializes into the existing Markdown record');
  assert.match(markdown, /document_date:/, 'compatible user suggestion serializes into the same record');

  const frontmatter = {
    filemeta_type: 'pdf',
    filemeta_profile: 'document',
    filemeta_version: metadataRecord.METADATA_RECORD_FORMAT_VERSION,
    filemeta_id: recordId,
    filemeta_file: '[[Imports/Synthetic email.pdf]]',
    filemeta_status: metadataRecord.METADATA_RECORD_STATUS_ACTIVE,
    ...freshPlan.values
  };
  const parsedRecord = metadataRecord.metadataRecordFromFrontmatter(frontmatter, defaultSchema);
  assert.equal(parsedRecord.ok, true, 'existing record contract accepts Email Import technical properties');
  assert.equal(parsedRecord.record.values.email_import_source_sha256, emlDocument.source.sha256);
  assert.equal(parsedRecord.record.values.document_date, freshPlan.values.document_date);

  const baseYaml = metadataDocumentRegisterStandardBaseYaml(defaultSchema);
  assert.equal(baseYaml.includes('email_import_'), false, 'technical provenance is not added to the standard user-facing Document Register columns');
  assert.ok(baseYaml.includes('document_date'), 'normal user metadata fields remain in the standard Document Register');

  const msgBytes = buildSyntheticMsg({
    attachments: [
      {
        filename: 'test-attachment-1.pdf',
        contentType: 'application/pdf',
        content: fs.readFileSync(path.join(attachmentRoot, 'test-attachment-1.pdf'))
      },
      {
        filename: 'inline-logo.png',
        contentType: 'image/png',
        contentId: 'synthetic-inline-logo',
        hidden: true,
        content: fs.readFileSync(path.join(attachmentRoot, 'inline-logo.png'))
      }
    ],
    bodyHtml: '<p>Synthetic MSG <img src="cid:synthetic-inline-logo"></p>'
  });
  const msgDocument = await parseMsg({ sourceBytes: msgBytes, originalFilename: 'synthetic.msg' });
  const msgProjection = buildEmailImportRecordValues({ document: msgDocument, schema: defaultSchema });
  assert.equal(msgProjection.technicalValues.email_import_source_format, 'msg');
  assert.equal(msgProjection.technicalValues.email_import_attachment_count, 2);
  assert.equal(msgProjection.technicalValues.email_import_user_attachment_count, 1);
  assert.equal(msgProjection.technicalValues.email_import_inline_resource_count, 1);
  assert.equal(msgProjection.technicalValues.email_import_pdf_candidate_count, 1);
  assert.ok(msgProjection.userFieldSuggestions.sender, 'MSG and EML share the same user metadata projection');

  for (const property of EMAIL_IMPORT_TECHNICAL_PROPERTIES) {
    assert.ok(property.startsWith('email_import_'), `technical property stays in reserved namespace: ${property}`);
  }

  console.log('Email Import metadata integration OK: normal pdf/document records, hidden technical provenance, schema-aware user suggestions, source wall-clock preservation, fresh-record fail-closed policy and standard Document Register isolation verified for EML and MSG.');
})().catch(error => {
  console.error('Email Import metadata integration check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
