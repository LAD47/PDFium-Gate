'use strict';

const { escapeHtml } = require('./email-html-renderer');

function renderRetainedSourceReference(document) {
  const source = document?.source || {};
  if (source.retained !== true || !source.retainedPath) return '';

  const originalFilename = source.originalFilename || '(unknown source filename)';
  const sha256 = source.sha256 || '';
  const retainedPath = source.retainedPath || '';

  return `<section class="email-source-reference">
<hr>
<h2>Original source</h2>
<dl>
<dt>Filename</dt><dd>${escapeHtml(originalFilename)}</dd>
<dt>SHA-256</dt><dd><code>${escapeHtml(sha256)}</code></dd>
<dt>Stored path</dt><dd><code>${escapeHtml(retainedPath)}</code></dd>
</dl>
</section>`;
}

function appendRetainedSourceReference(html, document) {
  const sourceReference = renderRetainedSourceReference(document);
  if (!sourceReference) return String(html == null ? '' : html);

  const shell = String(html == null ? '' : html);
  const marker = '</main>';
  const index = shell.lastIndexOf(marker);
  if (index < 0) {
    throw new Error('Controlled email HTML shell is missing </main>.');
  }

  return `${shell.slice(0, index)}${sourceReference}\n${shell.slice(index)}`;
}

module.exports = {
  renderRetainedSourceReference,
  appendRetainedSourceReference
};
