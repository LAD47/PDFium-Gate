> [!IMPORTANT]
> **Historical document — partially superseded.**
> This file preserves the 2026-09-30 attachment-link experiment and practical evidence. The physical click / owned-protocol architecture remains relevant, but current resolution is scoped to the clicked parent email PDF and does not rehash mutable exported attachments before opening. New email imports link directly to actual imported ZIP members rather than a visible source ZIP. See `ATTACHMENT-PDF-LINKS.md` and `RUNTIME-INTEGRATION.md` for the current contract.

# Email Import decisions - 2026-09-30

This note records the attachment-PDF-link decisions reached through practical Obsidian testing on 2026-09-30.

## D-031 - Generated email PDFs use stable attachment identity, not current vault paths

Accepted.

A generated email PDF may contain a clickable PDF link annotation for each ordinary attachment. The link carries stable source-email SHA-256, attachment SHA-256 and attachment ordinal. It does not embed the attachment's current vault path.

Reason: the generated PDF is archival/static while Obsidian files may later be renamed or moved.

## D-032 - Current attachment location remains authoritative in native Markdown relationships

Accepted.

The parent email document's plugin-owned Markdown wikilink block remains the live relationship layer. On click, PDFium Gate resolves those links through Obsidian and verifies the target bytes against the attachment SHA-256 before opening.

Practical testing confirmed that moving the target attachment to another Obsidian folder did not break the PDF link.

## D-033 - Chromium navigation forwarding is rejected for embedded PDF attachment clicks

Accepted.

The `will-navigate` / `will-frame-navigate` Main Bridge prototype is rejected. Practical testing showed that the custom PDF link worked when the same PDF was opened in ordinary Chrome, but the embedded Chromium PDF viewer did not deliver the click through the expected navigation event path inside PDFium Gate.

The canonical route starts from PDFium Gate's existing physical wrapper click signal instead.

## D-034 - Attachment PDF click handling is split across explicit layers

Accepted.

Responsibilities are separated as follows:

- controlled email rendering owns URI creation;
- the Chromium platform adapter owns wrapper/scroller/PDF coordinate translation;
- the Email Import attachment module owns PDF.js annotation hit-testing and protocol parsing;
- the plugin controller owns orchestration;
- the existing Email Import feature owns durable metadata/SHA target resolution and opening;
- Main Bridge exposes only the narrow point-resolution operation through the existing transport boundary.

This follows the same maintainability principle as the rest of PDFium Gate: small source modules, explicit boundaries, and dedicated regression scripts.

## D-035 - Ordinary PDF click behavior must remain untouched

Accepted and practically verified.

The attachment-link path claims a click only when the actual PDF annotation under the click parses as PDFium Gate's own `obsidian://pdfium-gate-email-attachment` URI. Ordinary PDF interaction and non-owned links remain outside this feature.

Practical testing confirmed normal PDFium Gate click behavior still worked after the attachment link succeeded.

## Verification status

User-verified in Obsidian 1.13.7 / Electron 43 on 2026-09-30:

1. attachment filename click opens the intended vault attachment;
2. moving the target attachment to another folder preserves the link behavior;
3. ordinary PDFium Gate click behavior remains functional.

Automated tests supplement but do not replace this practical embedded-viewer verification.
