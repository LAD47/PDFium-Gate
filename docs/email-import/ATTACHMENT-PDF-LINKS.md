# Email attachment links inside generated PDFs

Status: user-verified working prototype, being integrated canonically on `feature/email-import`.

## Purpose

Generated email PDFs may show ordinary attachment filenames as clickable PDF link annotations. The PDF must not embed the attachment's current vault path because a path becomes stale after an Obsidian rename or move.

The PDF therefore stores a stable protocol identity:

```text
obsidian://pdfium-gate-email-attachment?source=<email-sha256>&attachment=<attachment-sha256>&index=<ordinal>
```

The visible PDF contains only the human-facing attachment filename. Current attachment location remains a live relationship in the parent email document's plugin-managed Markdown wikilink block.

## Canonical click flow

The verified flow is:

1. Chromium renders the generated email PDF and its link annotation.
2. PDFium Gate's existing wrapper instrumentation records the physical left click and exact wrapper-local coordinates.
3. `src/platform/email-attachment-pdf-point.js` resolves the exact embedded PDF target and translates the wrapper click through Chromium's PDF scroller geometry into PDF page coordinates.
4. `src/email-import/attachments/pdf-link-hit-test.js` uses PDF.js annotations for the candidate page point and accepts only a link whose URI parses as PDFium Gate's own `pdfium-gate-email-attachment` protocol.
5. `src/plugin/email-import/email-attachment-link-controller.js` passes the parsed stable identity to the existing attachment resolver.
6. The resolver finds the parent email record by source SHA-256, reads the current managed attachment wikilinks, lets Obsidian resolve their current paths, verifies candidate bytes against the attachment SHA-256, and opens the unique matching vault file.

This means the immutable PDF does not need to know the attachment's current path.

## Why Chromium navigation forwarding is not used

An earlier prototype listened for Electron `will-navigate` / `will-frame-navigate` events and attempted to forward the `obsidian://` URI externally. Practical testing showed that a click inside Chromium's PDF viewer did not reach that route.

The approach is therefore rejected and its Main Bridge forwarder/test have been removed. The canonical implementation starts from the already-observed physical PDF wrapper click instead.

## Safety properties

The click resolver is intentionally narrow:

- ordinary PDF clicks remain ordinary PDF clicks;
- ordinary HTTP/HTTPS PDF links are not claimed by this feature;
- only `obsidian://pdfium-gate-email-attachment` is accepted;
- source and attachment identities must be valid SHA-256 values;
- link annotation hit-testing is bounded to the actual clicked PDF rectangle;
- ambiguous owned-link hits fail closed;
- attachment resolution verifies current file bytes before opening;
- ambiguous or missing attachment targets fail closed rather than opening a guessed file.

## User-verified practical results

On 2026-09-30 the following were practically confirmed in Obsidian 1.13.7 / Electron 43:

- clicking an attachment filename inside the generated email PDF opens the intended attachment;
- moving the target attachment to another Obsidian folder does not break the PDF link;
- normal PDFium Gate click behavior continues to work.

The folder-move test is especially important: it confirms that the PDF link is identity-based rather than a hidden static path link.

## Source layout

The implementation is intentionally split by responsibility:

- `src/email-import/render/email-html-renderer.js` - creates the stable PDF attachment URI while rendering controlled email HTML;
- `src/email-import/attachments/pdf-link-hit-test.js` - protocol parsing and PDF.js annotation hit-testing;
- `src/platform/email-attachment-pdf-point.js` - Chromium embedded-PDF click-coordinate translation;
- `src/plugin/email-import/email-attachment-link-controller.js` - renderer-side orchestration;
- `src/plugin/features/20-email-import.js` - existing durable SHA/metadata attachment target resolution and opening;
- `src/platform/main-process-transport.js` - explicit renderer-to-main operation boundary;
- `src/main-bridge/features/09-email-import.js` - small Main Bridge facade for email PDF generation and point resolution.

## Regression tests

Relevant automated checks live in `scripts/`:

- `test-email-import-renderer.js` - generated attachment URI;
- `test-email-import-pdf-electron.js` - Chromium print-to-PDF preserves the custom URI;
- `test-email-import-pdf-point-adapter.js` - wrapper coordinate to viewer/PDF point boundary;
- `test-email-import-pdf-link-hit-test.js` - owned-link annotation hit, ordinary-link pass-through, and ambiguity fail-closed behavior;
- `test-email-import-attachment-links.js` - managed Markdown attachment relationship behavior;
- `test-email-import-obsidian-adapter.js` - generic current-vault-file opening.

Practical Obsidian testing remains required for the full Electron/Chromium/Obsidian click chain.
