'use strict';

const crypto = require('crypto');

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  throw new TypeError('Expected source bytes as Buffer or Uint8Array.');
}

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(toBuffer(bytes)).digest('hex');
}

module.exports = {
  sha256Hex,
  toBuffer
};
