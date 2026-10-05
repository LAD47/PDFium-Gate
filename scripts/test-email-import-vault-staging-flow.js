'use strict';

const assert = require('assert/strict');

let duplicateDecisionFactory=model=>({action:'open-existing',match:model.duplicates[0]});
global.EmailImportReviewModal = class EmailImportReviewModal {
  constructor(app,plugin,model) {
    this.model=model;
  }
  async openForDecision() {
    return duplicateDecisionFactory(this.model);
  }
};

global.EMAIL_IMPORT_RUNTIME = {
  normalizeVaultPath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  },
  suggestedEmailPdfPathInFolder(document, folder) {
    return `${folder ? `${folder}/` : ''}mail.pdf`;
  }
};
global.Notice = class Notice {};

const { EmailImportFeature } = require('../src/plugin/features/20-email-import');

function createFeature({ result, reads, existingMatches = false, duplicateDecision = null }) {
  const feature = Object.create(EmailImportFeature.prototype);
  const deleted = [];
  const file = { path:'Cases/mail.eml', extension:'eml' };
  let readIndex = 0;
  const duplicateModels=[];

  duplicateDecisionFactory=typeof duplicateDecision==='function'
    ? duplicateDecision
    : model=>({action:'open-existing',match:model.duplicates[0]});

  feature.settings = {
    emailDragDropAutomaticImport:true,
    emailDragDropExtractAttachments:false,
    emailImportRetainSourceAfterSuccess:false
  };
  feature.i18n = { t:key=>key };
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
  feature.emailImportExistingRetainedSourceMatches = async () => existingMatches;
  feature.runEmailImportFlow = async options => {
    const bytes = Buffer.from(await options.readSourceBytes(file.path));
    assert.equal(bytes.toString('utf8'), String(reads[0]));
    assert.equal(options.notifySuccess,false);
    assert.equal(
      options.services.suggestedEmailPdfPath({}, () => false),
      'Cases/mail.pdf'
    );

    const normalDecision = await options.chooseReview({suggestedPdfPath:'Cases/mail.pdf',duplicates:[]});
    assert.deepEqual(normalDecision,{action:'import',retainSource:false,pdfPath:'Cases/mail.pdf'});

    const duplicateModel={
      suggestedPdfPath:'Cases/mail (2).pdf',
      duplicates:[{pdfPath:'Cases/existing.pdf'}],
      summary:{sourceFilename:'mail.eml',subject:'Mail',sender:'Sender',date:'2026-09-29'}
    };
    const duplicateChoice = await options.chooseReview(duplicateModel);
    duplicateModels.push(duplicateModel);
    assert.equal(duplicateChoice.action,duplicateDecisionFactory(duplicateModel).action);
    if(duplicateChoice.action==='open-existing') assert.equal(duplicateChoice.match.pdfPath,'Cases/existing.pdf');
    if(duplicateChoice.action==='import') {
      assert.equal(typeof duplicateChoice.retainSource,'boolean');
      assert.equal(duplicateChoice.pdfPath,'Cases/mail (2).pdf');
    }
    return result;
  };
  feature.app = {};

  return { feature, file, deleted, duplicateModels, getReadCount:() => readIndex };
}

async function run() {
  {
    const { feature, file, deleted, getReadCount } = createFeature({
      result:{ ok:true, pdfPath:'Cases/mail.pdf', sourceRetained:false, retainedPath:null },
      reads:['original-bytes','original-bytes']
    });
    const result = await feature.startEmailImportFromVaultFile(file);
    assert.equal(result.ok, true);
    assert.equal(result.stagingRemoved,true);
    assert.deepEqual(deleted, [{ path:'Cases/mail.eml', force:true }]);
    assert.equal(getReadCount(), 2);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ ok:true, pdfPath:'Cases/mail.pdf', sourceRetained:false, retainedPath:null },
      reads:['original-bytes','changed-after-import']
    });
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(result.stagingRemoved,false);
    assert.deepEqual(deleted, []);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ ok:false, reason:'import-failed' },
      reads:['original-bytes']
    });
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(result.stagingRemoved,false);
    assert.deepEqual(deleted, []);
  }

  {
    const { feature, file, deleted, duplicateModels } = createFeature({
      result:{ ok:true, openedExisting:true, duplicate:true, pdfPath:'Cases/existing.pdf' },
      reads:['original-bytes','original-bytes'],
      existingMatches:true,
      duplicateDecision:model=>({action:'open-existing',match:model.duplicates[0]})
    });
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(duplicateModels.length,1);
    assert.equal(result.stagingRemoved,true);
    assert.deepEqual(deleted,[{path:'Cases/mail.eml',force:true}]);
  }

  {
    const { feature, file, deleted, duplicateModels } = createFeature({
      result:{ ok:true, pdfPath:'Cases/mail (2).pdf', sourceRetained:true, retainedPath:'.pdf-metadata/email-sources/aa/hash.eml' },
      reads:['original-bytes','original-bytes'],
      duplicateDecision:model=>({action:'import',retainSource:true,pdfPath:model.suggestedPdfPath})
    });
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(duplicateModels.length,1);
    assert.equal(result.pdfPath,'Cases/mail (2).pdf');
    assert.equal(result.stagingRemoved,true);
    assert.deepEqual(deleted,[{path:'Cases/mail.eml',force:true}]);
  }

  {
    const { feature, file, deleted, duplicateModels } = createFeature({
      result:{ ok:true, canceled:true },
      reads:['original-bytes'],
      duplicateDecision:()=>({action:'cancel'})
    });
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(duplicateModels.length,1);
    assert.equal(result.canceled,true);
    assert.equal(result.stagingRemoved,false);
    assert.deepEqual(deleted,[]);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ ok:true, openedExisting:true, duplicate:false, pdfPath:'Cases/existing.pdf' },
      reads:['original-bytes'],
      existingMatches:false
    });
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(result.stagingRemoved,false);
    assert.deepEqual(deleted,[]);
  }

  {
    const { feature, file, deleted } = createFeature({
      result:{ok:true,pdfPath:'Cases/mail.pdf',sourceRetained:false,retainedPath:null},
      reads:['original-bytes']
    });
    feature.settings.emailDragDropAutomaticImport=false;
    const result=await feature.startEmailImportFromVaultFile(file);
    assert.equal(result.reason,'automatic-import-disabled');
    assert.deepEqual(deleted,[]);
  }

  console.log('Email Import vault staging flow OK: same-folder import, source-retention off by default, exact-byte staging cleanup after verified success, exact-duplicate cleanup, changed-file safety, cancel preservation and disable setting verified.');
}

run().catch(error => {
  console.error('Email Import vault staging flow check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});