'use strict';

function normalizeTriggerPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function isEmailStagingFile(file) {
  const vaultPath = normalizeTriggerPath(file?.path);
  if (!vaultPath) return false;
  const lower = vaultPath.toLowerCase();
  if (lower === '.pdf-metadata' || lower.startsWith('.pdf-metadata/')) return false;
  const extension = String(file?.extension || '').toLowerCase();
  return extension === 'eml' || extension === 'msg' || /\.(?:eml|msg)$/i.test(vaultPath);
}

function createVaultEmailCreateTrigger({ onEmailFile, onError } = {}) {
  if (typeof onEmailFile !== 'function') throw new TypeError('onEmailFile must be a function.');
  const pending = new Set();
  const suppressed = new Set();
  let queueTail = Promise.resolve();

  function suppressPathOnce(value) {
    const vaultPath = normalizeTriggerPath(value);
    if (vaultPath) suppressed.add(vaultPath);
  }

  async function runQueued(file, vaultPath) {
    try {
      const result = await onEmailFile(file);
      return { handled:true, vaultPath, result };
    } catch (error) {
      if (typeof onError === 'function') onError(error, file);
      return { handled:true, vaultPath, error };
    } finally {
      pending.delete(vaultPath);
    }
  }

  function handleCreate(file) {
    if (!isEmailStagingFile(file)) return Promise.resolve({ handled:false, reason:'not-email-source' });
    const vaultPath = normalizeTriggerPath(file.path);
    if (suppressed.delete(vaultPath)) {
      return Promise.resolve({ handled:false, reason:'suppressed', vaultPath });
    }
    if (pending.has(vaultPath)) return Promise.resolve({ handled:false, reason:'already-pending', vaultPath });

    pending.add(vaultPath);
    const task = queueTail.then(
      () => runQueued(file, vaultPath),
      () => runQueued(file, vaultPath)
    );
    queueTail = task.then(() => undefined, () => undefined);
    return task;
  }

  return Object.freeze({ handleCreate, isEmailStagingFile, suppressPathOnce });
}

module.exports = { normalizeTriggerPath, isEmailStagingFile, createVaultEmailCreateTrigger };
