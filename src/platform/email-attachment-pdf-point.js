'use strict';

const EMAIL_ATTACHMENT_PDF_POINT_CONTRACT_VERSION = '0.1';

function createEmailAttachmentPdfPointAdapter({ resolvePdfTarget, capturePdfViewerPoint }) {
  if (typeof resolvePdfTarget !== 'function') throw new TypeError('resolvePdfTarget must be a function');
  if (typeof capturePdfViewerPoint !== 'function') throw new TypeError('capturePdfViewerPoint must be a function');

  async function resolve({ token, x, y } = {}) {
    const safeToken = String(token || '').trim();
    const wrapperX = Number(x);
    const wrapperY = Number(y);
    const out = {
      ok:false,
      token:safeToken || null,
      wrapperPoint:{ x:wrapperX, y:wrapperY },
      scrollerRect:null,
      viewerRootPoint:null,
      candidates:[],
      viewerPoint:null,
      error:null
    };

    if (!safeToken || ![wrapperX, wrapperY].every(Number.isFinite)) {
      out.error = 'PDF token/klikkpunkt mangler';
      return out;
    }

    try {
      const pdfTarget = resolvePdfTarget(safeToken);
      if (!pdfTarget?.runtimeFrame || typeof pdfTarget.runtimeFrame.executeJavaScript !== 'function') {
        throw new Error('Eksakt embedded PDF-target ikke funnet');
      }

      const scroller = await pdfTarget.runtimeFrame.executeJavaScript(`(() => {
        try {
          const viewer=document.querySelector('pdf-viewer');
          const el=viewer?.shadowRoot?.querySelector('#scroller')||null;
          if(!el||typeof el.getBoundingClientRect!=='function') return {ok:false,error:'PDF scroller ikke funnet'};
          const r=el.getBoundingClientRect();
          return {ok:true,left:Number(r.left||0),top:Number(r.top||0),width:Number(r.width||0),height:Number(r.height||0)};
        } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
      })()`, true);
      if (!scroller?.ok) throw new Error(scroller?.error || 'PDF scroller-geometri mangler');

      out.scrollerRect = {
        left:Number(scroller.left || 0),
        top:Number(scroller.top || 0),
        width:Number(scroller.width || 0),
        height:Number(scroller.height || 0)
      };
      const rootX = wrapperX + out.scrollerRect.left;
      const rootY = wrapperY + out.scrollerRect.top;
      out.viewerRootPoint = { x:rootX, y:rootY };

      const hit = await capturePdfViewerPoint(pdfTarget.runtimeFrame, rootX, rootY);
      out.candidates = Array.isArray(hit?.candidates) ? hit.candidates : [];
      out.viewerPoint = hit || null;
      out.ok = hit?.ok === true && out.candidates.length > 0;
      if (!out.ok) out.error = hit?.error || 'Ingen PDF-sidekoordinat for klikket';
      return out;
    } catch (error) {
      out.error = error instanceof Error ? error.message : String(error);
      return out;
    }
  }

  return Object.freeze({
    contractVersion:EMAIL_ATTACHMENT_PDF_POINT_CONTRACT_VERSION,
    resolve
  });
}

module.exports = {
  EMAIL_ATTACHMENT_PDF_POINT_CONTRACT_VERSION,
  createEmailAttachmentPdfPointAdapter
};
