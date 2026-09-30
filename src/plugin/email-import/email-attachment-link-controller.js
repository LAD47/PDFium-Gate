'use strict';

async function handleEmailAttachmentPdfMouseActivation(plugin, eventRecord) {
  const token = String(eventRecord?.token || '').trim();
  const x = Number(eventRecord?.point?.x);
  const y = Number(eventRecord?.point?.y);
  if (!token || ![x,y].every(Number.isFinite)) {
    return { ok:true, handled:false, reason:'missing-click-identity' };
  }

  const transport = plugin?.mainProcessTransport;
  if (!transport?.getCapabilities?.().loaded || typeof transport.resolveEmailAttachmentPdfPoint !== 'function') {
    return { ok:true, handled:false, reason:'point-resolver-unavailable' };
  }

  const resolvedLeaf = plugin.pdfLeafAdapter?.resolveExactToken?.(token);
  const file = resolvedLeaf?.ok ? resolvedLeaf.leaf?.view?.file : null;
  if (!file || String(file.extension || '').toLowerCase() !== 'pdf') {
    return { ok:true, handled:false, reason:'pdf-file-not-found' };
  }

  let loadingTask = null;
  let pdfDoc = null;
  try {
    const pointResult = await Promise.resolve(transport.resolveEmailAttachmentPdfPoint({ token, x, y }));
    const candidates = Array.isArray(pointResult?.candidates) ? pointResult.candidates : [];
    if (!pointResult?.ok || !candidates.length) {
      return { ok:true, handled:false, reason:'no-pdf-point', pointResult };
    }

    const bytes = await plugin.obsidianVaultReadAdapter.readBinary(file);
    const pdfjsLib = await loadPdfJs();
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
      return { ok:false, handled:false, reason:'pdfjs-unavailable' };
    }

    loadingTask = pdfjsLib.getDocument({ data:new Uint8Array(bytes.slice(0)) });
    pdfDoc = await loadingTask.promise;
    const resolved = await EMAIL_IMPORT_RUNTIME.resolveEmailAttachmentPdfLink({
      pdfDocument:pdfDoc,
      candidates,
      protocolAction:EMAIL_IMPORT_RUNTIME.EMAIL_ATTACHMENT_PROTOCOL_ACTION
    });
    if (!resolved?.handled) return { ...resolved, pointResult };

    const opened = await plugin.ports.openEmailAttachmentFromProtocol(resolved.params);
    return {
      ok:opened?.ok === true,
      handled:true,
      opened,
      hit:resolved.hit,
      pointResult
    };
  } catch (error) {
    console.warn('[PDFium Gate] Email attachment PDF-link hit-test failed', error);
    return {
      ok:false,
      handled:false,
      reason:'pdf-link-hit-test-failed',
      error:error instanceof Error ? error.message : String(error)
    };
  } finally {
    try {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') await pdfDoc.destroy();
    } catch (_) {
      try {
        if (loadingTask && typeof loadingTask.destroy === 'function') await loadingTask.destroy();
      } catch (_) {}
    }
  }
}

module.exports = { handleEmailAttachmentPdfMouseActivation };
