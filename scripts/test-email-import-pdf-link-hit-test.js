'use strict';

const assert = require('assert/strict');
const {
  parseEmailAttachmentProtocolUri,
  pointInsideAnnotationRect,
  resolveEmailAttachmentPdfLink
} = require('../src/email-import/attachments/pdf-link-hit-test');

async function run() {
  const action = 'pdfium-gate-email-attachment';
  const source = 'a'.repeat(64);
  const attachment = 'b'.repeat(64);
  const uri = `obsidian://${action}?source=${source}&attachment=${attachment}&index=2`;

  assert.deepEqual(parseEmailAttachmentProtocolUri(uri, action), {
    uri, source, attachment, index:2
  });
  assert.equal(parseEmailAttachmentProtocolUri('https://example.invalid/', action), null);
  assert.equal(parseEmailAttachmentProtocolUri(`obsidian://${action}?source=bad&attachment=${attachment}&index=0`, action), null);

  assert.equal(pointInsideAnnotationRect({pageX:15,pageY:25}, [10,20,30,40]), true);
  assert.equal(pointInsideAnnotationRect({pageX:50,pageY:25}, [10,20,30,40]), false);

  const pdfDocument = {
    numPages:1,
    async getPage(pageNumber) {
      assert.equal(pageNumber, 1);
      return {
        async getAnnotations(options) {
          assert.deepEqual(options, {intent:'display'});
          return [
            { subtype:'Link', rect:[10,20,30,40], unsafeUrl:uri },
            { subtype:'Link', rect:[50,20,70,40], url:'https://example.invalid/' }
          ];
        }
      };
    }
  };

  const hit = await resolveEmailAttachmentPdfLink({
    pdfDocument,
    candidates:[{pageIndex:0,pageX:15,pageY:25}],
    protocolAction:action
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.handled, true);
  assert.equal(hit.reason, 'owned-link-hit');
  assert.equal(hit.hit.uri, uri);
  assert.deepEqual(hit.params, {uri,source,attachment,index:2});

  const ordinary = await resolveEmailAttachmentPdfLink({
    pdfDocument,
    candidates:[{pageIndex:0,pageX:55,pageY:25}],
    protocolAction:action
  });
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.handled, false);
  assert.equal(ordinary.reason, 'no-owned-link-hit');

  const ambiguousPdf = {
    numPages:1,
    async getPage() {
      return {
        async getAnnotations() {
          return [
            {subtype:'Link',rect:[10,20,30,40],unsafeUrl:uri},
            {subtype:'Link',rect:[10,20,30,40],unsafeUrl:`obsidian://${action}?source=${source}&attachment=${'c'.repeat(64)}&index=3`}
          ];
        }
      };
    }
  };
  const ambiguous = await resolveEmailAttachmentPdfLink({
    pdfDocument:ambiguousPdf,
    candidates:[{pageIndex:0,pageX:15,pageY:25}],
    protocolAction:action
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.handled, false);
  assert.equal(ambiguous.reason, 'owned-link-hit-ambiguous');
  assert.equal(ambiguous.hits.length, 2);

  console.log('Email Import PDF link hit-test OK: owned attachment links resolve, ordinary links pass through, ambiguous hits fail closed.');
}

run().catch(error => {
  console.error('Email Import PDF link hit-test failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
