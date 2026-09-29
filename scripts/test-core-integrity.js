'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const { sha256Hex, toBuffer } = require('../src/core/integrity/sha256');

const textBytes = Buffer.from('PDFium Gate shared integrity\n', 'utf8');
const expected = crypto.createHash('sha256').update(textBytes).digest('hex');

assert.equal(sha256Hex(textBytes), expected, 'Buffer hashing is deterministic and byte-exact');

const typed = new Uint8Array(textBytes.buffer, textBytes.byteOffset, textBytes.byteLength);
assert.equal(sha256Hex(typed), expected, 'Uint8Array hashing preserves the exact byte range');

const slicedBacking = new Uint8Array(textBytes.length + 6);
slicedBacking.set(textBytes, 3);
const sliced = slicedBacking.subarray(3, 3 + textBytes.length);
assert.equal(sha256Hex(sliced), expected, 'Uint8Array byteOffset/byteLength are respected');

assert.ok(Buffer.isBuffer(toBuffer(textBytes)), 'Buffer input remains Buffer-compatible');
assert.ok(Buffer.isBuffer(toBuffer(typed)), 'Uint8Array normalizes to Buffer');
assert.throws(() => sha256Hex('not bytes'), /Buffer or Uint8Array/, 'non-byte input fails closed');

console.log('Shared integrity core OK: exact Buffer/Uint8Array SHA-256 identity is deterministic, range-safe and format-independent.');
