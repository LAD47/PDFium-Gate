'use strict';

function normalizeProtocolAction(value) {
  return String(value || '').trim();
}

function parseEmailAttachmentProtocolUri(value, protocolAction) {
  const text = String(value || '').trim();
  const action = normalizeProtocolAction(protocolAction);
  if (!text || !action) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'obsidian:' || parsed.hostname !== action) return null;
    const source = String(parsed.searchParams.get('source') || '').trim().toLowerCase();
    const attachment = String(parsed.searchParams.get('attachment') || '').trim().toLowerCase();
    const indexRaw = String(parsed.searchParams.get('index') || '').trim();
    const index = indexRaw === '' ? 0 : Number(indexRaw);
    if (!/^[0-9a-f]{64}$/.test(source)) return null;
    if (!/^[0-9a-f]{64}$/.test(attachment)) return null;
    if (!Number.isInteger(index) || index < 0) return null;
    return { uri:text, source, attachment, index };
  } catch (_) {
    return null;
  }
}

function pointInsideAnnotationRect(candidate, rect, margin = 1.5) {
  const px = Number(candidate?.pageX);
  const py = Number(candidate?.pageY);
  const values = Array.isArray(rect) ? rect.map(Number) : [];
  if (![px, py].every(Number.isFinite) || values.length !== 4 || !values.every(Number.isFinite)) return false;
  const minX = Math.min(values[0], values[2]);
  const maxX = Math.max(values[0], values[2]);
  const minY = Math.min(values[1], values[3]);
  const maxY = Math.max(values[1], values[3]);
  const pad = Number.isFinite(Number(margin)) ? Number(margin) : 0;
  return px >= minX - pad && px <= maxX + pad && py >= minY - pad && py <= maxY + pad;
}

async function resolveEmailAttachmentPdfLink({ pdfDocument, candidates, protocolAction, margin = 1.5 }) {
  const action = normalizeProtocolAction(protocolAction);
  const points = Array.isArray(candidates) ? candidates : [];
  const pageCount = Number(pdfDocument?.numPages || 0);
  if (!pdfDocument || typeof pdfDocument.getPage !== 'function') {
    return { ok:false, handled:false, reason:'pdf-document-unavailable', hits:[] };
  }
  if (!action) return { ok:false, handled:false, reason:'protocol-action-missing', hits:[] };

  const hits = [];
  for (const candidate of points) {
    const pageIndex = Number(candidate?.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) continue;
    const page = await pdfDocument.getPage(pageIndex + 1);
    const annotations = await page.getAnnotations({ intent:'display' });
    for (const annotation of Array.isArray(annotations) ? annotations : []) {
      if (String(annotation?.subtype || '').toLowerCase() !== 'link') continue;
      if (!pointInsideAnnotationRect(candidate, annotation?.rect, margin)) continue;
      const uri = String(annotation?.unsafeUrl || annotation?.url || '').trim();
      const params = parseEmailAttachmentProtocolUri(uri, action);
      if (!params) continue;
      const rect = annotation.rect.map(Number);
      hits.push({
        uri,
        params,
        pageIndex,
        rect:[Math.min(rect[0],rect[2]),Math.min(rect[1],rect[3]),Math.max(rect[0],rect[2]),Math.max(rect[1],rect[3])],
        point:{ x:Number(candidate.pageX), y:Number(candidate.pageY) }
      });
    }
  }

  const unique = [...new Map(hits.map(hit => [hit.uri, hit])).values()];
  if (unique.length === 0) return { ok:true, handled:false, reason:'no-owned-link-hit', hits:[] };
  if (unique.length !== 1) return { ok:false, handled:false, reason:'owned-link-hit-ambiguous', hits:unique };
  return { ok:true, handled:true, reason:'owned-link-hit', hit:unique[0], hits:unique, params:unique[0].params };
}

module.exports = {
  parseEmailAttachmentProtocolUri,
  pointInsideAnnotationRect,
  resolveEmailAttachmentPdfLink
};
