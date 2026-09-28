'use strict';

function resolveElectron(electronModule) {
  const electron = electronModule || require('electron');
  if (!electron?.app || !electron?.BrowserWindow) {
    throw new Error('Electron main-process app and BrowserWindow APIs are required.');
  }
  return electron;
}

async function printHtmlToPdfWithElectron({ html, electronModule, printOptions = {} }) {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new TypeError('Controlled HTML must be a non-empty string.');
  }

  const electron = resolveElectron(electronModule);
  await electron.app.whenReady();

  const window = new electron.BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    useContentSize: true,
    webPreferences: {
      javascript: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  const preventUnexpectedNavigation = (event, url) => {
    if (!String(url || '').startsWith('data:text/html')) event.preventDefault();
  };

  window.webContents.on('will-navigate', preventUnexpectedNavigation);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await window.loadURL(dataUrl);

    const pdfBytes = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      ...printOptions
    });

    return Buffer.from(pdfBytes);
  } finally {
    window.webContents.removeListener('will-navigate', preventUnexpectedNavigation);
    if (!window.isDestroyed()) window.destroy();
  }
}

module.exports = {
  printHtmlToPdfWithElectron,
  resolveElectron
};
