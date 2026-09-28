'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const {
  SOURCE_STORAGE_ROOT,
  retainedSourceRelativePath,
  retainOriginalSource,
  removeRetainedSourceIfExact
} = require('../src/email-import/storage/source-retention');
const {
  RENDERER_BRIDGE_EVENTS,
  normalizeEmailImportRetainedSourceTarget,
  buildEmailImportRetainedSourcePdfLink,
  parseEmailImportRetainedSourcePdfLink
} = require('../src/bridge/renderer-events');
const { createEmailImportMainProcessAdapter } = require('../src/platform/email-import-main-process');
const { renderEmailDocumentToHtml, sanitizeMessageHtml } = require('../src/email-import/render/email-html-renderer');
const { appendRetainedSourceReference } = require('../src/email-import/render/email-source-reference');

const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'test', 'fixtures', 'email', 'plain-text.eml');

function adapterOptions(extra = {}) {
  return {
    app: Object.assign(new EventEmitter(), { whenReady: async () => {} }),
    parseRetainedSourceLink: parseEmailImportRetainedSourcePdfLink,
    normalizeRetainedSourceTarget: normalizeEmailImportRetainedSourceTarget,
    retainedSourceEventName: RENDERER_BRIDGE_EVENTS.EMAIL_RETAINED_SOURCE_OPEN,
    ...extra
  };
}

async function main() {
  const sourceBytes = fs.readFileSync(fixturePath);
  const parsed = await parseEml({ sourceBytes, originalFilename: 'Original message æøå.eml' });

  const disabledRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-disabled-'));
  const disabled = await retainOriginalSource({
    document: parsed,
    sourceBytes,
    vaultRootPath: disabledRoot,
    enabled: false
  });
  assert.equal(disabled.document.source.retained, false, 'disabled retention remains false');
  assert.equal(disabled.document.source.retainedPath, null, 'disabled retention has no path');
  assert.equal(disabled.created, false, 'disabled retention owns no file');
  assert.equal(fs.existsSync(path.join(disabledRoot, '.pdf-metadata')), false, 'disabled retention writes nothing');

  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-retained-'));
  const first = await retainOriginalSource({
    document: parsed,
    sourceBytes,
    vaultRootPath: vaultRoot,
    enabled: true
  });

  const expectedPath = retainedSourceRelativePath(parsed);
  assert.equal(first.document.source.retained, true, 'retention flag set');
  assert.equal(first.document.source.retainedPath, expectedPath, 'canonical retained path stored in document');
  assert.equal(first.retainedPath, expectedPath, 'result exposes retained path');
  assert.equal(first.reused, false, 'first write is new');
  assert.equal(first.created, true, 'first write is owned by this retention operation');
  assert.ok(expectedPath.startsWith(`${SOURCE_STORAGE_ROOT}/${parsed.source.sha256.slice(0, 2)}/`), 'path is sharded under hidden source root');
  assert.ok(expectedPath.endsWith(`/${parsed.source.sha256}.eml`), 'internal filename uses source SHA and source format');
  assert.equal(first.document.source.originalFilename, 'Original message æøå.eml', 'original filename remains documentary metadata');

  const storedAbsolute = path.join(vaultRoot, ...expectedPath.split('/'));
  const storedBytes = fs.readFileSync(storedAbsolute);
  assert.ok(storedBytes.equals(sourceBytes), 'retained source bytes are byte-identical to imported source');

  const second = await retainOriginalSource({
    document: parsed,
    sourceBytes,
    vaultRootPath: vaultRoot,
    enabled: true
  });
  assert.equal(second.reused, true, 'same exact source reuses existing retained file');
  assert.equal(second.created, false, 'reused source is not owned by the second operation');
  assert.equal(second.retainedPath, first.retainedPath, 'same exact source has stable retained path');

  const pdfLink = buildEmailImportRetainedSourcePdfLink({
    sha256: parsed.source.sha256,
    retainedPath: first.retainedPath
  });
  assert.match(pdfLink, /^https:\/\/pdfium-gate\.invalid\/retained-source\?/, 'retained source PDF link uses reserved non-resolving HTTPS origin');
  const parsedLink = parseEmailImportRetainedSourcePdfLink(pdfLink);
  assert.equal(parsedLink.ok, true, 'reserved retained-source link parses');
  assert.equal(parsedLink.sha256, parsed.source.sha256, 'link carries exact source SHA-256');
  assert.equal(parsedLink.retainedPath, first.retainedPath, 'link carries canonical vault-relative retained path');

  const baseHtml = renderEmailDocumentToHtml(first.document);
  const linkedHtml = appendRetainedSourceReference(baseHtml, first.document, { sourceOpenUri: pdfLink });
  assert.match(linkedHtml, /Original source/, 'retained source section appears');
  assert.match(linkedHtml, /Original message æøå\.eml/, 'original source filename appears in PDF HTML');
  assert.match(linkedHtml, new RegExp(parsed.source.sha256), 'source SHA-256 appears in PDF HTML');
  assert.match(linkedHtml, /href="https:\/\/pdfium-gate\.invalid\/retained-source\?/, 'retained source section contains PDF-safe reserved link');

  const unretainedHtml = appendRetainedSourceReference(renderEmailDocumentToHtml(parsed), parsed, { sourceOpenUri: pdfLink });
  assert.doesNotMatch(unretainedHtml, /email-source-reference/, 'unretained source does not get a source-reference section');

  const hostileBody = sanitizeMessageHtml(`<a href="${pdfLink}">source supplied reserved link</a>`, []);
  assert.doesNotMatch(hostileBody, /href="https:\/\/pdfium-gate\.invalid/i, 'source email HTML cannot inject the reserved retained-source link');

  let openedPath = null;
  const opener = createEmailImportMainProcessAdapter(adapterOptions({
    shell:{ openPath:async target=>{ openedPath=target; return ''; } }
  }));
  const openResult = await opener.openRetainedSource({
    vaultRootPath:vaultRoot,
    retainedPath:first.retainedPath,
    sha256:parsed.source.sha256
  });
  assert.equal(openResult.ok, true, 'main-process opener accepts verified retained source');
  assert.equal(path.resolve(openedPath), path.resolve(storedAbsolute), 'main-process opener receives exact retained file path');

  const routeOwner = new EventEmitter();
  routeOwner.id = 73;
  const routedEvents = [];
  const routeApp = Object.assign(new EventEmitter(), { whenReady:async()=>{} });
  const router = createEmailImportMainProcessAdapter(adapterOptions({
    app:routeApp,
    webContents:{ getAllWebContents:()=>[routeOwner] },
    rendererEventDispatchAdapter:{ dispatchExact:async (_owner,eventName,detail)=>{ routedEvents.push({eventName,detail}); return {ok:true}; } },
    resolvePdfContext:()=>({token:'probe-token',filePath:'Email Imports/probe.pdf'})
  }));
  const routeInstall = router.installRetainedSourceRouting();
  assert.equal(routeInstall.ok, true, 'retained-source route installs');
  let prevented = false;
  routeOwner.emit('will-frame-navigate',{preventDefault:()=>{prevented=true;}},{url:pdfLink});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(prevented, true, 'reserved retained-source navigation is prevented');
  assert.equal(routedEvents.length, 1, 'reserved navigation dispatches one renderer event');
  assert.equal(routedEvents[0].eventName, RENDERER_BRIDGE_EVENTS.EMAIL_RETAINED_SOURCE_OPEN, 'reserved navigation uses dedicated event');
  assert.equal(routedEvents[0].detail.filePath, 'Email Imports/probe.pdf', 'renderer event carries exact PDF path');
  assert.equal(routedEvents[0].detail.sha256, parsed.source.sha256, 'renderer event carries source SHA');
  router.uninstallRetainedSourceRouting();

  const integrityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-open-integrity-'));
  const integrityWrite = await retainOriginalSource({ document:parsed, sourceBytes, vaultRootPath:integrityRoot, enabled:true });
  const integrityAbsolute = path.join(integrityRoot, ...integrityWrite.retainedPath.split('/'));
  fs.writeFileSync(integrityAbsolute, Buffer.from('tampered retained source'));
  await assert.rejects(
    () => opener.openRetainedSource({vaultRootPath:integrityRoot,retainedPath:integrityWrite.retainedPath,sha256:parsed.source.sha256}),
    /SHA-256 no longer matches/i,
    'main-process opener refuses retained bytes whose SHA changed'
  );

  const rollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-rollback-'));
  const rollbackWrite = await retainOriginalSource({
    document: parsed,
    sourceBytes,
    vaultRootPath: rollbackRoot,
    enabled: true
  });
  assert.equal(rollbackWrite.created, true, 'rollback fixture creates a fresh retained source');
  const rollbackAbsolute = path.join(rollbackRoot, ...rollbackWrite.retainedPath.split('/'));
  assert.equal(fs.existsSync(rollbackAbsolute), true, 'rollback fixture exists before cleanup');
  const rollbackResult = await removeRetainedSourceIfExact({
    document: rollbackWrite.document,
    sourceBytes,
    vaultRootPath: rollbackRoot
  });
  assert.equal(rollbackResult.removed, true, 'exact owned retained source can be removed during rollback');
  assert.equal(fs.existsSync(rollbackAbsolute), false, 'rollback removes the exact retained source');

  const reuseRollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-reuse-rollback-'));
  const seeded = await retainOriginalSource({ document: parsed, sourceBytes, vaultRootPath: reuseRollbackRoot, enabled: true });
  const reused = await retainOriginalSource({ document: parsed, sourceBytes, vaultRootPath: reuseRollbackRoot, enabled: true });
  assert.equal(seeded.created, true, 'reuse rollback seed owns first write');
  assert.equal(reused.created, false, 'reuse rollback second operation does not own source file');
  const reusedAbsolute = path.join(reuseRollbackRoot, ...reused.retainedPath.split('/'));
  assert.equal(fs.existsSync(reusedAbsolute), true, 'reused retained source remains present when later operation owns nothing');

  const corruptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-corrupt-'));
  const corruptTarget = path.join(corruptRoot, ...expectedPath.split('/'));
  fs.mkdirSync(path.dirname(corruptTarget), { recursive: true });
  fs.writeFileSync(corruptTarget, Buffer.from('not the source bytes'));
  await assert.rejects(
    () => retainOriginalSource({ document: parsed, sourceBytes, vaultRootPath: corruptRoot, enabled: true }),
    /collision/i,
    'existing retained path with different bytes fails closed'
  );

  const wrongBytes = Buffer.concat([sourceBytes, Buffer.from([0])]);
  const mismatchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-email-mismatch-'));
  await assert.rejects(
    () => retainOriginalSource({ document: parsed, sourceBytes: wrongBytes, vaultRootPath: mismatchRoot, enabled: true }),
    /byte length mismatch|SHA-256 mismatch/i,
    'bytes are verified against canonical source identity before storage'
  );
  assert.equal(fs.existsSync(path.join(mismatchRoot, '.pdf-metadata')), false, 'mismatched source is rejected before storage directories are created');

  fs.rmSync(disabledRoot, { recursive: true, force: true });
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  fs.rmSync(integrityRoot, { recursive: true, force: true });
  fs.rmSync(rollbackRoot, { recursive: true, force: true });
  fs.rmSync(reuseRollbackRoot, { recursive: true, force: true });
  fs.rmSync(corruptRoot, { recursive: true, force: true });
  fs.rmSync(mismatchRoot, { recursive: true, force: true });

  console.log('Email Import retained source storage OK: exact hidden storage, portable PDF-safe source link, scoped navigation routing, SHA-verified OS opening, rollback ownership and fail-closed collision handling verified.');
}

main().catch(error => {
  console.error('Email Import retained source storage check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});