'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const { sha256Hex } = require('../src/core/integrity/sha256');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test', 'fixtures', 'email');
const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'expected.json'), 'utf8'));
const sha256Pattern = /^[0-9a-f]{64}$/;

function assertAddressList(actual, expectedValue, label) {
  assert.deepEqual(actual, expectedValue, label);
}

function assertCanonicalInvariants(document, filename, sourceBytes) {
  assert.equal(document.schemaVersion, 1, `${filename}: schemaVersion`);
  assert.equal(document.source.format, 'eml', `${filename}: source.format`);
  assert.equal(document.source.originalFilename, filename, `${filename}: source.originalFilename`);
  assert.equal(document.source.byteSize, sourceBytes.length, `${filename}: source.byteSize`);
  assert.match(document.source.sha256, sha256Pattern, `${filename}: source.sha256 format`);
  assert.equal(document.source.retained, false, `${filename}: source.retained`);
  assert.equal(document.source.retainedPath, null, `${filename}: source.retainedPath`);

  assert.ok(Array.isArray(document.identity.references), `${filename}: identity.references array`);
  for (const key of ['from', 'to', 'cc', 'bcc', 'replyTo']) {
    assert.ok(Array.isArray(document.message[key]), `${filename}: message.${key} array`);
  }
  assert.ok(document.message.dateTime && typeof document.message.dateTime === 'object', `${filename}: message.dateTime`);
  assert.ok(Array.isArray(document.attachments), `${filename}: attachments array`);
  assert.ok(Array.isArray(document.diagnostics.warnings), `${filename}: diagnostics.warnings array`);

  for (const attachment of document.attachments) {
    assert.equal(typeof attachment.id, 'string', `${filename}: attachment.id`);
    assert.ok(attachment.id.length > 0, `${filename}: non-empty attachment.id`);
    assert.ok(Buffer.isBuffer(attachment.content), `${filename}: attachment.content is Buffer`);
    assert.equal(attachment.size, attachment.content.length, `${filename}: attachment payload size`);
    assert.match(attachment.sha256, sha256Pattern, `${filename}: attachment.sha256 format`);
  }

  assert.ok(document.body.text !== null || document.body.html !== null || document.diagnostics.warnings.length > 0,
    `${filename}: body or diagnostic warning`);
}

function expectedField(messageExpected, field) {
  if (Object.prototype.hasOwnProperty.call(messageExpected, field)) return messageExpected[field];
  return expected.defaultMessageFields[field];
}

async function checkMessage(filename, messageExpected) {
  const sourceBytes = fs.readFileSync(path.join(fixtureRoot, filename));
  const document = await parseEml({ sourceBytes, originalFilename: filename });

  assertCanonicalInvariants(document, filename, sourceBytes);
  assert.equal(document.source.sha256, expected.sourceHashes[filename], `${filename}: source SHA-256`);
  assert.equal(document.identity.messageId, messageExpected.messageId, `${filename}: Message-ID`);
  assert.equal(document.identity.inReplyTo, expectedField(messageExpected, 'inReplyTo'), `${filename}: In-Reply-To`);
  assert.deepEqual(document.identity.references, expectedField(messageExpected, 'references'), `${filename}: References`);
  assert.equal(document.message.subject, messageExpected.subject, `${filename}: Subject`);

  assertAddressList(document.message.from, expectedField(messageExpected, 'from'), `${filename}: From`);
  assertAddressList(document.message.to, expectedField(messageExpected, 'to'), `${filename}: To`);
  assertAddressList(document.message.cc, expectedField(messageExpected, 'cc'), `${filename}: Cc`);
  assertAddressList(document.message.bcc, expectedField(messageExpected, 'bcc'), `${filename}: Bcc`);
  assertAddressList(document.message.replyTo, expectedField(messageExpected, 'replyTo'), `${filename}: Reply-To`);
  assert.deepEqual(document.message.dateTime, expectedField(messageExpected, 'dateTime'), `${filename}: date/time`);

  if (messageExpected.hasText !== undefined) {
    assert.equal(document.body.text !== null, messageExpected.hasText, `${filename}: text body presence`);
  }
  if (messageExpected.hasHtml !== undefined) {
    assert.equal(document.body.html !== null, messageExpected.hasHtml, `${filename}: HTML body presence`);
  }
  if (messageExpected.bodyContains) {
    assert.ok((document.body.text || '').includes(messageExpected.bodyContains), `${filename}: expected Unicode body text`);
  }
  if (messageExpected.htmlContains) {
    assert.ok((document.body.html || '').includes(messageExpected.htmlContains), `${filename}: expected HTML content`);
  }

  assert.equal(document.attachments.length, messageExpected.attachmentCount, `${filename}: attachment count`);
  const attachmentExpectations = messageExpected.attachments || [];
  assert.equal(attachmentExpectations.length, document.attachments.length, `${filename}: attachment expectation coverage`);

  for (let index = 0; index < attachmentExpectations.length; index += 1) {
    const attachmentExpected = attachmentExpectations[index];
    const attachment = document.attachments[index];
    const fixtureExpected = expected.attachments[attachmentExpected.filename];
    const referenceBytes = fs.readFileSync(path.join(fixtureRoot, 'attachments', attachmentExpected.filename));

    assert.ok(fixtureExpected, `${filename}: expected fixture metadata for ${attachmentExpected.filename}`);
    assert.equal(sha256Hex(referenceBytes), fixtureExpected.sha256, `${filename}: reference ${attachmentExpected.filename} SHA-256`);
    assert.equal(referenceBytes.length, fixtureExpected.size, `${filename}: reference ${attachmentExpected.filename} size`);
    assert.equal(attachment.filename, attachmentExpected.filename, `${filename}: attachment ${index + 1} filename`);
    assert.equal(attachment.contentType, attachmentExpected.contentType, `${filename}: attachment ${index + 1} content type`);
    assert.equal(attachment.sha256, attachmentExpected.sha256, `${filename}: attachment ${index + 1} SHA-256`);
    assert.equal(attachment.sha256, fixtureExpected.sha256, `${filename}: attachment ${index + 1} reference SHA-256`);
    assert.equal(attachment.size, fixtureExpected.size, `${filename}: attachment ${index + 1} reference size`);
    assert.equal(attachment.content.equals(referenceBytes), true, `${filename}: attachment ${index + 1} byte-identical to reference file`);
    assert.equal(attachment.disposition, attachmentExpected.disposition, `${filename}: attachment ${index + 1} disposition`);
    assert.equal(attachment.related, attachmentExpected.related, `${filename}: attachment ${index + 1} related`);
  }

  if (messageExpected.inlineContentId) {
    const inline = document.attachments.find(attachment => attachment.related);
    assert.ok(inline, `${filename}: related inline attachment`);
    assert.equal(inline.contentId, messageExpected.inlineContentId, `${filename}: inline Content-ID`);
  }

  return document;
}

(async () => {
  const filenames = Object.keys(expected.messages).sort();
  for (const filename of filenames) {
    await checkMessage(filename, expected.messages[filename]);
  }
  console.log(`Email Import EML parser OK: ${filenames.length} synthetic messages, canonical v1 fields, source hashes and byte-identical decoded attachments verified.`);
})().catch(error => {
  console.error('Email Import EML parser check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
