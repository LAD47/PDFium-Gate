'use strict';

const assert = require('assert/strict');

global.EMAIL_IMPORT_RUNTIME = {
  normalizeVaultPath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  },
  suggestedEmailPdfPathInFolder(document, folder) {
    return `${folder ? `${folder}/` : ''}mail.pdf`;
  }
};

const { EmailImportFeature } = require('../src/plugin/features/20-email-import');

function createFeature({ result, reads }) {
  const feature = Object.create(EmailImportFeature.prototype);
  const deleted = [];
  const file = { path:'Cases/mail.eml', extension:'eml' };
  let readIndex = 0;

  feature.obsidianVaultReadAdapter = {
    getAbstractFileByPath: path => path === file.path ? file : null,
    readBinary: async () => {
      const value = reads[Math.min(readIndex, reads.length - 1)];
      readIndex += 1;
      return Buffer.from(value);
    }
  };
  feature.obsidianVaultWriteAdapter = {
    deleteFile: async (target, force) => deleted.push({ path:target.path, force })
  };
  feature.runEmailImportFlow = async options => {
    const bytes = Buffer.from(await options.readSourceBytes(file.path));
    assert.equal(bytes.toString('utf8'), String(reads[0]));
    assert.equal(
      options.services.suggestedEmailPdfPath({}, () => false),
      'Cases/mail.pdf'
    );
    return result;
  };
  feature.app = {};

  return { feature, file, deleted, getReadCount:() => readIndex };
}

async function run() {
  {
    const { feature, file, deleted, getReadCount } = createFeature({
      result:{ ok:true, pdfPath:'Cases/mail.pdf', sourceRetained:true, retainedPath:'.pdf-metadata/email-sources/aa/hash.eml' },
      reads:['original-bytes','original-bytes']
    });
    const result = await feature.startEmailImportFromVaultFile(file);
    assert.equal(result.ok, true);
    assert.deepEqual(deleted, [{ path:'Cases/mail.eml', force:true }]);
    assert.equal(getReadCount(), 2);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ ok:true, pdfPath:'Cases/mail.pdf', sourceRetained:true, retainedPath:'.pdf-metadata/email-sources/aa/hash.eml' },
      reads:['original-bytes','changed-after-import']
    });
    await feature.startEmailImportFromVaultFile(file);
    assert.deepEqual(deleted, []);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ ok:true, canceled:true },
      reads:['original-bytes']
    });
    await feature.startEmailImportFromVaultFile(file);
    assert.deepEqual(deleted, []);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ ok:true, openedExisting:true, pdfPath:'Cases/existing.pdf' },
      reads:['original-bytes']
    });
    await feature.startEmailImportFromVaultFile(file);
    assert.deepEqual(deleted, []);
  }

  console.log('Email Import vault staging flow OK: same-folder target policy, exact-byte cleanup, cancel safety, changed-file safety and duplicate-open preservation verified.');
}

run().catch(error => {
  console.error('Email Import vault staging flow check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
