'use strict';

const EMAIL_IMPORT_MAIN_PROCESS_CONTRACT_VERSION = '0.1';

function createEmailImportMainProcessAdapter({ app, BrowserWindow, dialog }) {
  function requireAppReady() {
    if (!app || typeof app.whenReady !== 'function') throw new Error('Email Import requires Electron app.whenReady().');
    return app.whenReady();
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

  return Object.freeze({
    contractVersion:EMAIL_IMPORT_MAIN_PROCESS_CONTRACT_VERSION,
    chooseSource,
    printControlledHtmlToPdf
  });
}

module.exports={EMAIL_IMPORT_MAIN_PROCESS_CONTRACT_VERSION,createEmailImportMainProcessAdapter};
