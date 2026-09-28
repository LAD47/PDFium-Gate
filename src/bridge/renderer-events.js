'use strict';

// Canonical Main Bridge -> renderer event contract. Production actions travel
// only through these explicit events; diagnostics may mirror state but must not
// be used as a production transport.
const RENDERER_BRIDGE_EVENTS = Object.freeze({
  OBSIDIAN_COMMAND: 'pdfium-gate-obsidian-command',
  KEYBOARD_SELECTION: 'pdfium-gate-pdf-keyboard-selection',
  NATIVE_COPY: 'pdfium-gate-native-copy',
  KEYBOARD_COPY: 'pdfium-gate-keyboard-copy',
  PDF_CONTEXT_MENU: 'pdfium-gate-pdf-context-menu',
  CATEGORY_SHORTCUT: 'pdfium-gate-category-shortcut',
  ESCAPE_DISMISS: 'pdfium-gate-escape-dismiss',
  PDF_MOUSE_ACTIVATION: 'pdfium-gate-pdf-mouse-activation',
  EMAIL_RETAINED_SOURCE_OPEN: 'pdfium-gate-email-retained-source-open'
});

const RENDERER_BRIDGE_EVENT_NAMES = new Set(Object.values(RENDERER_BRIDGE_EVENTS));

const EMAIL_IMPORT_RETAINED_SOURCE_LINK_ORIGIN = 'https://pdfium-gate.invalid';
const EMAIL_IMPORT_RETAINED_SOURCE_LINK_PATH = '/retained-source';
const EMAIL_IMPORT_RETAINED_PATH_RE = /^\.pdf-metadata\/email-sources\/([0-9a-f]{2})\/([0-9a-f]{64})\.(eml|msg)$/;

function normalizeEmailImportRetainedSourceTarget({ sha256, retainedPath } = {}) {
  const sha = String(sha256 || '').trim().toLowerCase();
  const path = String(retainedPath || '').trim();
  if (!/^[0-9a-f]{64}$/.test(sha)) return { ok:false, error:'retained-source SHA-256 is invalid' };
  const match = EMAIL_IMPORT_RETAINED_PATH_RE.exec(path);
  if (!match) return { ok:false, error:'retained-source path is not canonical' };
  if (match[1] !== sha.slice(0,2) || match[2] !== sha) return { ok:false, error:'retained-source path does not match SHA-256' };
  return { ok:true, sha256:sha, retainedPath:path, format:match[3] };
}

function buildEmailImportRetainedSourcePdfLink(target) {
  const normalized = normalizeEmailImportRetainedSourceTarget(target);
  if (!normalized.ok) throw new TypeError(normalized.error);
  const query = new URLSearchParams();
  query.set('sha256', normalized.sha256);
  query.set('file', normalized.retainedPath);
  return `${EMAIL_IMPORT_RETAINED_SOURCE_LINK_ORIGIN}${EMAIL_IMPORT_RETAINED_SOURCE_LINK_PATH}?${query.toString()}`;
}

function parseEmailImportRetainedSourcePdfLink(value) {
  const text = String(value || '').trim();
  if (!text) return { ok:false, error:'retained-source link is empty' };
  let url;
  try { url = new URL(text); }
  catch (_) { return { ok:false, error:'retained-source link is not a valid URL' }; }
  if (url.origin !== EMAIL_IMPORT_RETAINED_SOURCE_LINK_ORIGIN || url.pathname !== EMAIL_IMPORT_RETAINED_SOURCE_LINK_PATH) {
    return { ok:false, error:'retained-source link origin/path is not recognized' };
  }
  const normalized = normalizeEmailImportRetainedSourceTarget({
    sha256:url.searchParams.get('sha256'),
    retainedPath:url.searchParams.get('file')
  });
  if (!normalized.ok) return normalized;
  return { ok:true, url:text, ...normalized };
}

function validateRendererBridgeEventDetail(eventName, detail) {
  const name=String(eventName||'');
  if(!RENDERER_BRIDGE_EVENT_NAMES.has(name)) return {ok:false,error:`ukjent renderer bridge-event: ${name}`};
  if(!detail || typeof detail!=='object' || Array.isArray(detail)) return {ok:false,error:`${name}: detail må være et objekt`};
  const token=String(detail.token||detail.keyboardSelectionState?.token||'').trim();
  const text=String(detail.selectedText||detail.keyboardSelectionState?.text||'');
  const finite=value=>Number.isFinite(Number(value));
  if(name===RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND && !String(detail.commandId||'').trim()) return {ok:false,error:'obsidian-command: commandId mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION && (!token || !String(detail.direction||'').trim())) return {ok:false,error:'keyboard-selection: token/direction mangler'};
  if((name===RENDERER_BRIDGE_EVENTS.NATIVE_COPY || name===RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY) && (!token || !text)) return {ok:false,error:'copy-event: token/selectedText mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU && (detail.isPdfContext!==true || !String(detail.token||'').trim())) return {ok:false,error:'pdf-context-menu: isPdfContext/token mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT && (!String(detail.id||'').trim() || !finite(detail.resultSeq))) return {ok:false,error:'category-shortcut: id/resultSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS && !finite(detail.dismissSeq)) return {ok:false,error:'escape-dismiss: dismissSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION && (!String(detail.token||'').trim() || !finite(detail.activationSeq))) return {ok:false,error:'pdf-mouse-activation: token/activationSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.EMAIL_RETAINED_SOURCE_OPEN) {
    const parsed=parseEmailImportRetainedSourcePdfLink(detail.url);
    if(!parsed.ok) return {ok:false,error:`email-retained-source-open: ${parsed.error}`};
    if(String(detail.sha256||'').toLowerCase()!==parsed.sha256 || String(detail.retainedPath||'')!==parsed.retainedPath) {
      return {ok:false,error:'email-retained-source-open: event target differs from URL target'};
    }
  }
  return {ok:true,detail};
}

function readRendererBridgeEventDetail(eventName, event) {
  const detail=event && event.detail && typeof event.detail==='object' ? event.detail : null;
  return validateRendererBridgeEventDetail(eventName,detail);
}

module.exports={
  RENDERER_BRIDGE_EVENTS,
  RENDERER_BRIDGE_EVENT_NAMES,
  EMAIL_IMPORT_RETAINED_SOURCE_LINK_ORIGIN,
  EMAIL_IMPORT_RETAINED_SOURCE_LINK_PATH,
  EMAIL_IMPORT_RETAINED_PATH_RE,
  normalizeEmailImportRetainedSourceTarget,
  buildEmailImportRetainedSourcePdfLink,
  parseEmailImportRetainedSourcePdfLink,
  validateRendererBridgeEventDetail,
  readRendererBridgeEventDetail
};
