'use strict';

const schemaApi = require('../../metadata/schema-contract');
const { analyzeEmailAttachments } = require('../attachments/attachment-policy');

const EMAIL_IMPORT_METADATA_VERSION = 1;
const EMAIL_IMPORT_ATTACHMENT_METADATA_VERSION = 1;
const EMAIL_IMPORT_TECHNICAL_PREFIX = 'email_import_';

const FACTORY_FIELD_IDS = Object.freeze({
  documentDate: '7ec7d2be-62c8-4a21-83fd-66f2522d7301',
  documentTime: 'c0e66ac0-5228-4b43-82e0-0266cf2cf89a',
  sender: '4a5982ae-f142-42d4-8b7e-77332956953f'
});

const EMAIL_IMPORT_TECHNICAL_PROPERTIES = Object.freeze([
  'email_import_version',
  'email_import_source_format',
  'email_import_source_sha256',
  'email_import_source_byte_size',
  'email_import_original_filename',
  'email_import_source_retained',
  'email_import_retained_path',
  'email_import_message_id',
  'email_import_in_reply_to',
  'email_import_references',
  'email_import_attachment_count',
  'email_import_user_attachment_count',
  'email_import_inline_resource_count',
  'email_import_pdf_candidate_count',
  'email_import_attachment_version',
  'email_import_attachment_parent_record_id',
  'email_import_attachment_source_sha256',
  'email_import_attachment_sha256',
  'email_import_attachment_id',
  'email_import_attachment_original_filename',
  'email_import_attachment_content_type',
  'email_import_attachment_archive_name',
  'email_import_attachment_archive_sha256',
  'email_import_attachment_archive_member_path'
]);

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function formatAddress(address) {
  const name = nullableString(address?.name);
  const email = nullableString(address?.address);
  if (name && email) return `${name} <${email}>`;
  return name || email || '';
}

function formatAddressList(addresses) {
  const list = Array.isArray(addresses) ? addresses : [];
  return list.map(formatAddress).filter(Boolean).join(', ');
}

function sourceWallClock(dateTime) {
  const raw = nullableString(dateTime?.raw);
  if (raw) {
    const match = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/i.exec(raw);
    if (match) {
      const monthMap = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
      const day = Number(match[1]);
      const month = monthMap[String(match[2]).toLowerCase()];
      const year = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = match[6] === undefined ? 0 : Number(match[6]);
      const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      const valid = probe.getUTCFullYear() === year
        && probe.getUTCMonth() === month - 1
        && probe.getUTCDate() === day
        && hour >= 0 && hour <= 23
        && minute >= 0 && minute <= 59
        && second >= 0 && second <= 59;
      if (valid) {
        const pad = value => String(value).padStart(2, '0');
        return {
          date: `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`,
          timeMinute: `${pad(hour)}:${pad(minute)}`,
          timeSecond: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
          source: 'raw-source-wall-clock'
        };
      }
    }
  }

  const iso = nullableString(dateTime?.iso);
  if (iso) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      const canonical = date.toISOString();
      return {
        date: canonical.slice(0, 10),
        timeMinute: canonical.slice(11, 16),
        timeSecond: canonical.slice(11, 19),
        source: 'canonical-iso-utc'
      };
    }
  }

  return null;
}

function activeFields(schema) {
  return (Array.isArray(schema?.fields) ? schema.fields : []).filter(field => field && field.active !== false);
}

function findSemanticField(schema, { factoryId, property, type }) {
  const fields = activeFields(schema).filter(field => field.type === type);
  return fields.find(field => String(field.id || '').toLowerCase() === factoryId)
    || fields.find(field => String(field.property || '') === property)
    || null;
}

function canonicalValueAccepted(field, value) {
  const errors = [];
  schemaApi.metadataValidateCanonicalValue(field, value, `email import ${field?.property || 'field'}`, errors);
  return errors.length === 0;
}

function technicalPropertyCollision(schema) {
  return activeFields(schema)
    .map(field => String(field.property || ''))
    .find(property => property.startsWith(EMAIL_IMPORT_TECHNICAL_PREFIX)) || null;
}

function assertTechnicalNamespaceAvailable(schema) {
  const collision = technicalPropertyCollision(schema);
  if (collision) {
    throw new Error(`Metadata schema uses reserved Email Import property namespace: ${collision}`);
  }
}

function buildTechnicalValues(document) {
  if (!document || typeof document !== 'object' || document.schemaVersion !== 1) {
    throw new TypeError('Canonical Email Document schemaVersion 1 is required.');
  }

  const source = document.source || {};
  const format = nullableString(source.format)?.toLowerCase();
  if (!['eml', 'msg'].includes(format)) throw new TypeError('Email source format must be eml or msg.');

  const sourceSha256 = nullableString(source.sha256)?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceSha256 || '')) throw new TypeError('Email source SHA-256 is required.');

  const originalFilename = nullableString(source.originalFilename);
  if (!originalFilename) throw new TypeError('Email source original filename is required.');

  const analysis = analyzeEmailAttachments(document);
  const allAttachments = Array.isArray(document.attachments) ? document.attachments : [];
  const technical = {
    email_import_version: EMAIL_IMPORT_METADATA_VERSION,
    email_import_source_format: format,
    email_import_source_sha256: sourceSha256,
    email_import_source_byte_size: Number.isInteger(source.byteSize) ? source.byteSize : null,
    email_import_original_filename: originalFilename,
    email_import_source_retained: source.retained === true,
    email_import_attachment_count: allAttachments.length,
    email_import_user_attachment_count: analysis.attachments.length,
    email_import_inline_resource_count: analysis.inlineResources.length,
    email_import_pdf_candidate_count: analysis.pdfCandidates.length
  };

  const retainedPath = nullableString(source.retainedPath);
  if (source.retained === true && retainedPath) technical.email_import_retained_path = retainedPath;

  const messageId = nullableString(document.identity?.messageId);
  if (messageId) technical.email_import_message_id = messageId;

  const inReplyTo = nullableString(document.identity?.inReplyTo);
  if (inReplyTo) technical.email_import_in_reply_to = inReplyTo;

  const references = (Array.isArray(document.identity?.references) ? document.identity.references : [])
    .map(nullableString)
    .filter(Boolean);
  if (references.length) technical.email_import_references = references;

  for (const [key, value] of Object.entries(technical)) {
    if (value === null || value === undefined) delete technical[key];
  }

  return technical;
}

function buildUserFieldSuggestions(document, schema) {
  const suggestions = {};
  const mappedFields = {};
  const wallClock = sourceWallClock(document?.message?.dateTime);

  const dateField = findSemanticField(schema, {
    factoryId: FACTORY_FIELD_IDS.documentDate,
    property: 'document_date',
    type: 'date'
  });
  if (dateField && wallClock?.date && canonicalValueAccepted(dateField, wallClock.date)) {
    suggestions[dateField.property] = wallClock.date;
    mappedFields.documentDate = dateField.property;
  }

  const timeField = findSemanticField(schema, {
    factoryId: FACTORY_FIELD_IDS.documentTime,
    property: 'document_time',
    type: 'time'
  });
  if (timeField && wallClock) {
    const precision = timeField.config?.precision === 'second' ? 'second' : 'minute';
    const value = precision === 'second' ? wallClock.timeSecond : wallClock.timeMinute;
    if (canonicalValueAccepted(timeField, value)) {
      suggestions[timeField.property] = value;
      mappedFields.documentTime = timeField.property;
    }
  }

  const senderField = findSemanticField(schema, {
    factoryId: FACTORY_FIELD_IDS.sender,
    property: 'sender',
    type: 'text'
  });
  const sender = formatAddressList(document?.message?.from);
  if (senderField && sender && canonicalValueAccepted(senderField, sender)) {
    suggestions[senderField.property] = sender;
    mappedFields.sender = senderField.property;
  }

  return {
    suggestions,
    mappedFields,
    dateTimeProjection: wallClock ? { source: wallClock.source } : null
  };
}

function buildEmailImportRecordValues({ document, schema }) {
  assertTechnicalNamespaceAvailable(schema);

  const technicalValues = buildTechnicalValues(document);
  const userProjection = buildUserFieldSuggestions(document, schema);

  return {
    values: { ...technicalValues, ...userProjection.suggestions },
    technicalValues,
    userFieldSuggestions: userProjection.suggestions,
    mappedFields: userProjection.mappedFields,
    dateTimeProjection: userProjection.dateTimeProjection
  };
}

function buildEmailAttachmentImportRecordValues({ schema, parentRecordId, sourceSha256, attachment }) {
  assertTechnicalNamespaceAvailable(schema);
  const parentId = nullableString(parentRecordId);
  if (!parentId) throw new TypeError('Parent email document record ID is required.');
  const sourceHash = nullableString(sourceSha256)?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceHash || '')) throw new TypeError('Parent email source SHA-256 is required.');
  const attachmentHash = nullableString(attachment?.sha256)?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(attachmentHash || '')) throw new TypeError('Attachment SHA-256 is required.');

  const values = {
    email_import_attachment_version: EMAIL_IMPORT_ATTACHMENT_METADATA_VERSION,
    email_import_attachment_parent_record_id: parentId,
    email_import_attachment_source_sha256: sourceHash,
    email_import_attachment_sha256: attachmentHash
  };
  const attachmentId = nullableString(attachment?.id);
  if (attachmentId) values.email_import_attachment_id = attachmentId;
  const filename = nullableString(attachment?.filename);
  if (filename) values.email_import_attachment_original_filename = filename;
  const contentType = nullableString(attachment?.contentType);
  if (contentType) values.email_import_attachment_content_type = contentType;
  const archiveName=nullableString(attachment?.archiveName);
  if(archiveName) values.email_import_attachment_archive_name=archiveName;
  const archiveSha256=nullableString(attachment?.archiveSha256)?.toLowerCase();
  if(archiveSha256 && /^[0-9a-f]{64}$/.test(archiveSha256)) values.email_import_attachment_archive_sha256=archiveSha256;
  const archiveMemberPath=nullableString(attachment?.archiveMemberPath);
  if(archiveMemberPath) values.email_import_attachment_archive_member_path=archiveMemberPath;

  return { values, technicalValues: { ...values }, userFieldSuggestions: {} };
}

function buildEmailImportRegistrationPlan({ document, schema, documentRecordState = null }) {
  if (documentRecordState?.registered === true) {
    return {
      ok: false,
      reason: 'existing-document-record',
      error: 'Email Import will not attach source provenance to an already-registered PDF automatically.'
    };
  }
  if (documentRecordState && documentRecordState.ok === false) {
    return {
      ok: false,
      reason: documentRecordState.reason || 'unsafe-document-record-state',
      error: documentRecordState.error || 'Document metadata state cannot be identified safely.'
    };
  }

  try {
    const projection = buildEmailImportRecordValues({ document, schema });
    return {
      ok: true,
      fileType: 'pdf',
      profile: 'document',
      requiresFreshRecord: true,
      savePort: 'saveDocumentMetadataRecordValues',
      ...projection
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'metadata-projection-failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

module.exports = {
  EMAIL_IMPORT_METADATA_VERSION,
  EMAIL_IMPORT_ATTACHMENT_METADATA_VERSION,
  EMAIL_IMPORT_TECHNICAL_PREFIX,
  EMAIL_IMPORT_TECHNICAL_PROPERTIES,
  FACTORY_FIELD_IDS,
  formatAddress,
  formatAddressList,
  sourceWallClock,
  technicalPropertyCollision,
  buildTechnicalValues,
  buildUserFieldSuggestions,
  buildEmailImportRecordValues,
  buildEmailAttachmentImportRecordValues,
  buildEmailImportRegistrationPlan
};
