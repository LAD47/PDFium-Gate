'use strict';

const assert = require('assert/strict');
const { EventEmitter } = require('events');

const opened = [];
global.shell = { openExternal: async url => { opened.push(url); } };
global.webContents = { getAllWebContents: () => [ownerWc] };
global.app = new EventEmitter();

const ownerWc = new EventEmitter();
ownerWc.id = 42;

const {
  MainBridgeEmailImportFeature,
  parseEmailAttachmentProtocolUrl,
  navigationUrlFromArgument
} = require('../src/main-bridge/features/09-email-import');

function createHost() {
  const host = { runtime:{} };
  for (const name of Object.getOwnPropertyNames(MainBridgeEmailImportFeature.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(MainBridgeEmailImportFeature.prototype, name);
    if (descriptor && typeof descriptor.value === 'function') host[name] = descriptor.value.bind(host);
  }
  return host;
}

async function run() {
  const source = 'a'.repeat(64);
  const attachment = 'b'.repeat(64);
  const uri = `obsidian://pdfium-gate-email-attachment?source=${source}&attachment=${attachment}&index=2`;

  assert.deepEqual(parseEmailAttachmentProtocolUrl(uri), { url:uri, source, attachment, index:2 });
  assert.equal(parseEmailAttachmentProtocolUrl('https://example.invalid/'), null);
  assert.equal(parseEmailAttachmentProtocolUrl('obsidian://pdfium-gate-email-attachment?source=bad&attachment=' + attachment + '&index=0'), null);
  assert.equal(navigationUrlFromArgument({url:uri}), uri);
  assert.equal(navigationUrlFromArgument(uri), uri);

  const host = createHost();
  const installed = host.installEmailAttachmentProtocolForwarder();
  assert.equal(installed.ok, true);
  assert.equal(ownerWc.listenerCount('will-navigate'), 1);
  assert.equal(ownerWc.listenerCount('will-frame-navigate'), 1);

  let prevented = 0;
  const event = { preventDefault(){ prevented += 1; } };
  ownerWc.emit('will-frame-navigate', event, {url:uri});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, 1, 'own Obsidian URI navigation is prevented inside embedded PDF');
  assert.deepEqual(opened, [uri], 'own Obsidian URI is forwarded exactly once');

  ownerWc.emit('will-navigate', event, uri);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, 2, 'duplicate event is still prevented');
  assert.deepEqual(opened, [uri], 'will-navigate/will-frame-navigate duplicate is deduplicated');

  const ordinary = { preventDefault(){ throw new Error('ordinary navigation must not be intercepted'); } };
  ownerWc.emit('will-frame-navigate', ordinary, {url:'https://example.invalid/'});
  assert.deepEqual(opened, [uri], 'ordinary web links are untouched');

  const uninstalled = host.uninstallEmailAttachmentProtocolForwarder();
  assert.equal(uninstalled.ok, true);
  assert.equal(ownerWc.listenerCount('will-navigate'), 0);
  assert.equal(ownerWc.listenerCount('will-frame-navigate'), 0);

  console.log('Email Import Main Bridge protocol forwarding OK: own obsidian:// attachment URI is intercepted, deduplicated and forwarded while ordinary navigation is untouched.');
}

run().catch(error => {
  console.error('Email Import Main Bridge protocol forwarding check failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
