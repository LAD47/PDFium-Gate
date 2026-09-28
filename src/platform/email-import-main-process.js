'use strict';

const emailImportFs = require('fs');
const emailImportPath = require('path');
const emailImportCrypto = require('crypto');

const EMAIL_IMPORT_MAIN_PROCESS_CONTRACT_VERSION = '0.4';

function createEmailImportMainProcessAdapter({ app, BrowserWindow, dialog, shell, webContents, rendererEventDispatchAdapter, resolvePdfContext }) {
  const routedWebContents = new Map();
  let webContentsCreatedHandler = null;

  function requireAppReady() {
    if (!app || typeof app.whenReady !== 'function') throw new Error('Email Import requires Electron app.whenReady().');
    return app.whenReady();
  }

  function attachRetainedSourceRouting(ownerWc) {
    const id = Number(ownerWc?.id);
    if (!Number.isFinite(id) || typeof ownerWc?.on !== 'function' || routedWebContents.has(id)) return false;

    const willFrameNavigateHandler = (event, details = {}) => {
      const targetUrl = String(details?.url || event?.url || '').trim();
      const parsed = parseEmailImportRetainedSourcePdfLink(targetUrl);
      if (!parsed.ok) return;
      try { event?.preventDefault?.(); } catch (_) {}

      let context = null;
      try { context = resolvePdfContext?.({ ownerWc, details }) || null; } catch (_) {}
      const token = String(context?.token || '').trim();
      const filePath = String(context?.filePath || '').trim();
      if (!token || !filePath) return;

      const detail = {
        token,
        filePath,
        url:parsed.url,
        sha256:parsed.sha256,
        retainedPath:parsed.retainedPath
      };
      void rendererEventDispatchAdapter?.dispatchExact?.(
        ownerWc,
        RENDERER_BRIDGE_EVENTS.EMAIL_RETAINED_SOURCE_OPEN,
        detail
      );
    };

    const destroyedHandler = () => detachRetainedSourceRouting(ownerWc);
    ownerWc.on('will-frame-navigate', willFrameNavigateHandler);
    ownerWc.on('destroyed', destroyedHandler);
    routedWebContents.set(id, { ownerWc, willFrameNavigateHandler, destroyedHandler });
    return true;
  }

  function detachRetainedSourceRouting(ownerWc) {
    const id = Number(ownerWc?.id);
    const rec = routedWebContents.get(id);
    if (!rec) return false;
    try { rec.ownerWc.removeListener?.('will-frame-navigate', rec.willFrameNavigateHandler); } catch (_) {}
    try { rec.ownerWc.removeListener?.('destroyed', rec.destroyedHandler); } catch (_) {}
    routedWebContents.delete(id);
    return true;
  }

  function installRetainedSourceRouting() {
    if (webContentsCreatedHandler) return { ok:true, already:true, webContentsCount:routedWebContents.size };
    if (!app || typeof app.on !== 'function') return { ok:false, error:'Electron app event routing is unavailable.' };
    if (!webContents || typeof webContents.getAllWebContents !== 'function') return { ok:false, error:'Electron webContents routing is unavailable.' };

    webContentsCreatedHandler = (_event, contents) => { attachRetainedSourceRouting(contents); };
    app.on('web-contents-created', webContentsCreatedHandler);
    for (const contents of webContents.getAllWebContents() || []) attachRetainedSourceRouting(contents);
    return { ok:true, already:false, webContentsCount:routedWebContents.size };
  }

  function uninstallRetainedSourceRouting() {
    if (webContentsCreatedHandler) {
      try { app?.removeListener?.('web-contents-created', webContentsCreatedHandler); } catch (_) {}
      webContentsCreatedHandler = null;
    }
    for (const rec of [...routedWebContents.values()]) detachRetainedSourceRouting(rec.ownerWc);
    return { ok:true, webContentsCount:0 };
  }

  async function chooseSource({ title = '', emailFilterName = '' } = {}) {
    await requireAppReady();
    if (!dialog || typeof dialog.showOpenDialog !== 'function') throw new Error('Email Import source picker requires Electron dialog.showOpenDialog().');
    if (!BrowserWindow || typeof BrowserWindow.getFocusedWindow !== 'function') throw new Error('Email Import source picker requires BrowserWindow.getFocusedWindow().');
    const options = {
      title:String(title || 'Email Import'),
      properties:['openFile'],
      filters:[{ name:String(emailFilterName || 'Email'), extensions:['eml','msg'] }]
    };
    const owner = BrowserWindow.getFocusedWindow();
    const result = owner && !owner.isDestroyed()
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    const filePath = Array.isArray(result?.filePaths) && result.filePaths.length === 1
      ? String(result.filePaths[0] || '')
      : '';
    return {
      canceled:result?.canceled === true || !filePath,
      filePath:filePath || null
    };
  }

  async function printControlledHtmlToPdf({ html, printOptions = {} } = {}) {
    await requireAppReady();
    if (typeof BrowserWindow !== 'function') throw new Error('Email Import PDF printing requires the Electron BrowserWindow constructor.');
    const source = String(html || '');
    if (!/^<!doctype html>/i.test(source.trimStart())) throw new Error('Email PDF printer requires the controlled HTML document shell.');
    if (!/Content-Security-Policy/i.test(source)) throw new Error('Email PDF printer requires a Content Security Policy.');

    const window = new BrowserWindow({
      show:false,
      width:1200,
      height:1600,
      useContentSize:true,
      webPreferences:{
        javascript:false,
        nodeIntegration:false,
        contextIsolation:true,
        sandbox:true,
        webSecurity:true,
        allowRunningInsecureContent:false
      }
    });
    const navigationGuard = event => {
      const url = String(event?.url || '');
      if (!url.startsWith('data:text/html')) event?.preventDefault?.();
    };

    try {
      window.webContents.on('will-navigate', navigationGuard);
      window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(source)}`);
      const bytes = await window.webContents.printToPDF({
        printBackground:true,
        preferCSSPageSize:true,
        ...(printOptions && typeof printOptions === 'object' ? printOptions : {})
      });
      const pdf = Buffer.from(bytes || []);
      if (pdf.length < 8 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Electron did not return a PDF document.');
      const tail = pdf.subarray(Math.max(0, pdf.length - 2048)).toString('latin1');
      if (!tail.includes('%%EOF')) throw new Error('Generated PDF is missing the end-of-file marker.');
      return pdf;
    } finally {
      try { window.webContents.removeListener('will-navigate', navigationGuard); } catch (_) {}
      if (!window.isDestroyed()) window.destroy();
    }
  }

  async function openRetainedSource({ vaultRootPath, retainedPath, sha256 } = {}) {
    await requireAppReady();
    if (!shell || typeof shell.openPath !== 'function') throw new Error('Email Import retained-source opening requires Electron shell.openPath().');
    const normalized = normalizeEmailImportRetainedSourceTarget({ sha256, retainedPath });
    if (!normalized.ok) throw new Error(normalized.error);

    const rootText = String(vaultRootPath || '').trim();
    if (!rootText) throw new Error('Vault root path is required.');
    const root = emailImportPath.resolve(rootText);
    const target = emailImportPath.resolve(root, ...normalized.retainedPath.split('/'));
    const relative = emailImportPath.relative(root, target);
    if (!relative || relative === '.' || relative.startsWith('..') || emailImportPath.isAbsolute(relative)) {
      throw new Error('Retained source path escapes or does not identify a file inside the vault.');
    }

    const stat = await emailImportFs.promises.stat(target);
    if (!stat.isFile()) throw new Error('Retained source target is not a regular file.');
    const bytes = await emailImportFs.promises.readFile(target);
    const actualSha = emailImportCrypto.createHash('sha256').update(bytes).digest('hex');
    if (actualSha !== normalized.sha256) throw new Error('Retained source SHA-256 no longer matches metadata.');

    const errorText = await shell.openPath(target);
    if (String(errorText || '').trim()) throw new Error(`Operating system could not open retained source: ${String(errorText).trim()}`);
    return { ok:true, retainedPath:normalized.retainedPath, sha256:normalized.sha256 };
  }

  return Object.freeze({
    contractVersion:EMAIL_IMPORT_MAIN_PROCESS_CONTRACT_VERSION,
    installRetainedSourceRouting,
    uninstallRetainedSourceRouting,
    chooseSource,
    printControlledHtmlToPdf,
    openRetainedSource
  });
}

module.exports={EMAIL_IMPORT_MAIN_PROCESS_CONTRACT_VERSION,createEmailImportMainProcessAdapter};
