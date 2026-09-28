'use strict';

class MainBridgeEmailImportFeature {
  async chooseEmailImportSource({ title = '', emailFilterName = '', allFilesFilterName = '' } = {}) {
    await app.whenReady();
    const options = {
      title:String(title || 'Email Import'),
      properties:['openFile'],
      filters:[
        { name:String(emailFilterName || 'Email'), extensions:['eml','msg'] },
        { name:String(allFilesFilterName || 'Files'), extensions:['*'] }
      ]
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

  async printControlledEmailHtmlToPdf({ html, printOptions = {} } = {}) {
    await app.whenReady();
    const source = String(html || '');
    if (!/^<!doctype html>/i.test(source.trimStart())) {
      throw new Error('Email PDF printer requires the controlled HTML document shell.');
    }
    if (!/Content-Security-Policy/i.test(source)) {
      throw new Error('Email PDF printer requires a Content Security Policy.');
    }

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
      if (pdf.length < 8 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error('Electron did not return a PDF document.');
      }
      const tail = pdf.subarray(Math.max(0, pdf.length - 2048)).toString('latin1');
      if (!tail.includes('%%EOF')) throw new Error('Generated PDF is missing the end-of-file marker.');
      return pdf;
    } finally {
      try { window.webContents.removeListener('will-navigate', navigationGuard); } catch (_) {}
      if (!window.isDestroyed()) window.destroy();
    }
  }
}

module.exports = { MainBridgeEmailImportFeature };
