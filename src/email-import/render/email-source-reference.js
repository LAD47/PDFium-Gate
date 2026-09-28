'use strict';

const { escapeHtml } = require('./email-html-renderer');

function safeSourceOpenUri(value) {
  const text = String(value == null ? '' : value).trim();
  return /^obsidian:\/\/open\?/i.test(text) ? text : null;
}

function renderRetainedSourceReference(document, { sourceOpenUri = null } = {}) {
  const source = document?.source || {};
  if (source.retained !== true || !source.retainedPath) return '';

  const originalFilename = source.originalFilename || '(unknown source filename)';
  const sha256 = source.sha256 || '';
  const retainedPath = source.retainedPath || '';
  const href = safeSourceOpenUri(sourceOpenUri);
  const openLink = href
    ? `<p><a class="retained-source-link" href="${escapeHtml(href)}">Open retained original</a></p>`
    : '';

  return `<section class="email-source-reference">
<hr>
<h2>Original source</h2>
<dl>
<dt>Filename</dt><dd>${escapeHtml(originalFilename)}</dd>
<dt>SHA-256</dt><dd><code>${escapeHtml(sha256)}</code></dd>
<dt>Stored path</dt><dd><code>${escapeHtml(retainedPath)}</code></dd>
</dl>
${openLink}
</section>`;
}

function appendRetainedSourceReference(html, document, options = {}) {
  const sourceReference = renderRetainedSourceReference(document, options);
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
  safeSourceOpenUri,
  renderRetainedSourceReference,
  appendRetainedSourceReference
};
