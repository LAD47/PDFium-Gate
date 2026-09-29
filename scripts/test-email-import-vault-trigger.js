'use strict';

const assert = require('assert/strict');
const {
  normalizeTriggerPath,
  isEmailStagingFile,
  createVaultEmailCreateTrigger
} = require('../src/plugin/email-import/vault-email-create-trigger');

assert.equal(normalizeTriggerPath('\\Cases\\mail.eml'), 'Cases/mail.eml');
assert.equal(isEmailStagingFile({ path:'Cases/mail.eml', extension:'eml' }), true);
assert.equal(isEmailStagingFile({ path:'Cases/mail.MSG', extension:'MSG' }), true);
assert.equal(isEmailStagingFile({ path:'Cases/file.pdf', extension:'pdf' }), false);
assert.equal(isEmailStagingFile({ path:'.pdf-metadata/email-sources/aa/hash.eml', extension:'eml' }), false);

async function run() {
  const seen = [];
  let release;
  const blocker = new Promise(resolve => { release = resolve; });
  const trigger = createVaultEmailCreateTrigger({
    onEmailFile: async file => {
      seen.push(file.path);
      await blocker;
      return { ok:true };
    }
  });

  const file = { path:'Cases/mail.eml', extension:'eml' };
  const first = trigger.handleCreate(file);
  const second = await trigger.handleCreate(file);
  assert.equal(second.handled, false);
  assert.equal(second.reason, 'already-pending');
  assert.deepEqual(seen, ['Cases/mail.eml']);
  release();
  const completed = await first;
  assert.equal(completed.handled, true);
  assert.equal(completed.result.ok, true);

  const ignored = await trigger.handleCreate({ path:'.pdf-metadata/email-sources/aa/source.eml', extension:'eml' });
  assert.equal(ignored.handled, false);
  assert.equal(ignored.reason, 'not-email-source');

  console.log('Email Import vault staging trigger OK: EML/MSG detection, metadata-area exclusion and duplicate in-flight suppression verified.');
}

run().catch(error => {
  console.error('Email Import vault staging trigger check failed.');
  console.error(error);
  process.exitCode = 1;
});
