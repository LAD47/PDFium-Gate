'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseEml } = require('../src/email-import/parsers/eml-parser');
const {
  SOURCE_STORAGE_ROOT,
  retainedSourceRelativePath,
  retainOriginalSource,
  buildObsidianRetainedSourceUri
} = require('../src/email-import/storage/source-retention');
const { renderEmailDocumentToHtml, sanitizeMessageHtml } = require('../src/email-import/render/email-html-renderer');
const { appendRetainedSourceReference } = require('../src/email-import/render/email-source-reference');

const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'test', 'fixtures', 'email', 'plain-text.eml');

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
  assert.equal(second.retainedPath, first.retainedPath, 'same exact source has stable retained path');

  const openUri = buildObsidianRetainedSourceUri({
    vault: 'Test Vault æøå',
    retainedPath: first.retainedPath
  });
  assert.match(openUri, /^obsidian:\/\/open\?vault=/, 'retained source link uses Obsidian open URI');
  assert.match(openUri, /Test%20Vault%20%C3%A6%C3%B8%C3%A5/, 'vault reference is URI encoded');
  assert.match(openUri, /file=\.pdf-metadata%2Femail-sources%2F/, 'vault-relative retained path is URI encoded');

  const baseHtml = renderEmailDocumentToHtml(first.document);
  const linkedHtml = appendRetainedSourceReference(baseHtml, first.document, { sourceOpenUri: openUri });
  assert.match(linkedHtml, /Original source/, 'retained source section appears');
  assert.match(linkedHtml, /Original message æøå\.eml/, 'original source filename appears in PDF HTML');
  assert.match(linkedHtml, new RegExp(parsed.source.sha256), 'source SHA-256 appears in PDF HTML');
  assert.match(linkedHtml, /href="obsidian:\/\/open\?vault=/, 'retained source section contains clickable Obsidian URI');

  const unretainedHtml = appendRetainedSourceReference(renderEmailDocumentToHtml(parsed), parsed, { sourceOpenUri: openUri });
  assert.doesNotMatch(unretainedHtml, /email-source-reference/, 'unretained source does not get a source-reference section');

  const hostileBody = sanitizeMessageHtml('<a href="obsidian://open?vault=Wrong&file=secret">source supplied link</a>', []);
  assert.doesNotMatch(hostileBody, /href="obsidian:/i, 'source email HTML cannot inject an Obsidian URI');

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
  fs.rmSync(corruptRoot, { recursive: true, force: true });
  fs.rmSync(mismatchRoot, { recursive: true, force: true });

  console.log('Email Import retained source storage OK: optional no-write mode, byte-identical hidden storage, stable SHA path, exact-source reuse, fail-closed collision handling and controlled Obsidian source link verified.');
}

main().catch(error => {
  console.error('Email Import retained source storage check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
