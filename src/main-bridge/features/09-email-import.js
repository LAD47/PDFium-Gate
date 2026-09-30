'use strict';

const EMAIL_ATTACHMENT_PROTOCOL_ACTION = 'pdfium-gate-email-attachment';
const EMAIL_ATTACHMENT_PROTOCOL_DEDUPE_MS = 750;

function parseEmailAttachmentProtocolUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'obsidian:' || parsed.hostname !== EMAIL_ATTACHMENT_PROTOCOL_ACTION) return null;
    const source = String(parsed.searchParams.get('source') || '').trim().toLowerCase();
    const attachment = String(parsed.searchParams.get('attachment') || '').trim().toLowerCase();
    const indexRaw = String(parsed.searchParams.get('index') || '').trim();
    const index = indexRaw === '' ? 0 : Number(indexRaw);
    if (!/^[0-9a-f]{64}$/.test(source)) return null;
    if (!/^[0-9a-f]{64}$/.test(attachment)) return null;
    if (!Number.isInteger(index) || index < 0) return null;
    return { url:text, source, attachment, index };
  } catch (_) {
    return null;
  }
}

function navigationUrlFromArgument(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.url === 'string') return value.url;
  return '';
}

class MainBridgeEmailImportFeature {
  emailAttachmentProtocolRuntime() {
    if (!this.runtime.emailAttachmentProtocol) {
      this.runtime.emailAttachmentProtocol = {
        listeners:new Map(),
        webContentsCreatedHandler:null,
        lastForwardedUrl:null,
        lastForwardedAt:0
      };
    }
    return this.runtime.emailAttachmentProtocol;
  }

  attachEmailAttachmentProtocolForwarder(ownerWc) {
    const runtime = this.emailAttachmentProtocolRuntime();
    if (!ownerWc || typeof ownerWc.on !== 'function' || runtime.listeners.has(ownerWc.id)) return false;

    const forward = (event, navigation) => {
      const parsed = parseEmailAttachmentProtocolUrl(navigationUrlFromArgument(navigation));
      if (!parsed) return false;
      try { event?.preventDefault?.(); } catch (_) {}

      const now = Date.now();
      if (runtime.lastForwardedUrl === parsed.url && now - runtime.lastForwardedAt < EMAIL_ATTACHMENT_PROTOCOL_DEDUPE_MS) {
        return true;
      }
      runtime.lastForwardedUrl = parsed.url;
      runtime.lastForwardedAt = now;

      try {
        const result = shell.openExternal(parsed.url);
        if (result && typeof result.catch === 'function') {
          void result.catch(error => console.error('[PDFium Gate] Could not forward email attachment Obsidian URI', error));
        }
      } catch (error) {
        console.error('[PDFium Gate] Could not forward email attachment Obsidian URI', error);
      }
      return true;
    };

    const willNavigateHandler = (event, url) => { forward(event, url); };
    const willFrameNavigateHandler = (event, details) => { forward(event, details); };

    try {
      ownerWc.on('will-navigate', willNavigateHandler);
      ownerWc.on('will-frame-navigate', willFrameNavigateHandler);
      runtime.listeners.set(ownerWc.id, { wc:ownerWc, willNavigateHandler, willFrameNavigateHandler });
      return true;
    } catch (error) {
      try { ownerWc.removeListener?.('will-navigate', willNavigateHandler); } catch (_) {}
      try { ownerWc.removeListener?.('will-frame-navigate', willFrameNavigateHandler); } catch (_) {}
      console.error('[PDFium Gate] Could not install email attachment protocol forwarding', error);
      return false;
    }
  }

  installEmailAttachmentProtocolForwarder() {
    const runtime = this.emailAttachmentProtocolRuntime();
    if (runtime.webContentsCreatedHandler) return { ok:true, already:true, listenerCount:runtime.listeners.size };

    let existing = [];
    try { existing = webContents.getAllWebContents() || []; } catch (_) { existing = []; }
    for (const wc of existing) this.attachEmailAttachmentProtocolForwarder(wc);

    runtime.webContentsCreatedHandler = (_event, wc) => {
      this.attachEmailAttachmentProtocolForwarder(wc);
    };
    app.on('web-contents-created', runtime.webContentsCreatedHandler);
    return { ok:true, already:false, listenerCount:runtime.listeners.size };
  }

  uninstallEmailAttachmentProtocolForwarder() {
    const runtime = this.emailAttachmentProtocolRuntime();
    if (runtime.webContentsCreatedHandler) {
      try { app.removeListener('web-contents-created', runtime.webContentsCreatedHandler); } catch (_) {}
      runtime.webContentsCreatedHandler = null;
    }
    for (const { wc, willNavigateHandler, willFrameNavigateHandler } of runtime.listeners.values()) {
      try { wc.removeListener('will-navigate', willNavigateHandler); } catch (_) { try { wc.off?.('will-navigate', willNavigateHandler); } catch (_) {} }
      try { wc.removeListener('will-frame-navigate', willFrameNavigateHandler); } catch (_) { try { wc.off?.('will-frame-navigate', willFrameNavigateHandler); } catch (_) {} }
    }
    runtime.listeners.clear();
    runtime.lastForwardedUrl = null;
    runtime.lastForwardedAt = 0;
    return { ok:true, listenerCount:0 };
  }

  async chooseEmailImportSource(options = {}) {
    const __bridgeRuntime = this;
    return await __bridgeRuntime.emailImportMainProcessAdapter.chooseSource(options);
  }

  async printControlledEmailHtmlToPdf(options = {}) {
    const __bridgeRuntime = this;
    return await __bridgeRuntime.emailImportMainProcessAdapter.printControlledHtmlToPdf(options);
  }
}

module.exports = {
  MainBridgeEmailImportFeature,
  EMAIL_ATTACHMENT_PROTOCOL_ACTION,
  parseEmailAttachmentProtocolUrl,
  navigationUrlFromArgument
};
