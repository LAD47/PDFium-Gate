# Email attachment links inside generated PDFs

Status: **current attachment-link contract**

## Purpose

The generated email PDF shows the complete user-facing attachment list and makes each imported attachment directly clickable.

The PDF must not embed the attachment's current vault path because that path can change after an Obsidian rename or move. It therefore stores a stable plugin-owned protocol identity:

```text
obsidian://pdfium-gate-email-attachment?source=<email-sha256>&attachment=<source-attachment-sha256>&index=<manifest-ordinal>
```

For ZIP members, the visible/clickable item is the actual imported member file. The original ZIP filename may be shown as a non-target group/provenance heading.

## Current click flow

1. Chromium renders the generated email PDF and its link annotation.
2. PDFium Gate records the physical wrapper click and resolves the owned PDF annotation under that click.
3. The email attachment link controller passes the stable protocol identity **plus the clicked parent email PDF path** to the resolver.
4. The resolver finds the managed attachment-link block belonging to that exact parent email PDF.
5. The stable manifest ordinal selects the current attachment relationship.
6. Obsidian resolves the current vault target and PDFium Gate opens that file through normal vault handling.

The parent-PDF identity is important when the same exact EML/MSG source has intentionally been imported more than once. Source SHA alone would not distinguish which imported attachment folder the user clicked from.

## Current identity rule

The SHA values in the PDF link identify the immutable import facts and protect the protocol namespace. They are **not** used to require the current exported attachment bytes to remain identical forever before opening.

This is deliberate: an exported PDF may later be annotated or otherwise legitimately modified inside the vault. Rehashing it against its import-time attachment SHA would incorrectly break a valid relationship.

The live managed Obsidian relationship is therefore the current-path authority after import.

## Why Chromium navigation forwarding is not used

An earlier prototype listened for Electron `will-navigate` / `will-frame-navigate` events and attempted to forward the `obsidian://` URI externally.

Practical testing showed that clicks inside Chromium's embedded PDF viewer did not reliably reach that route. The approach was rejected.

The canonical implementation starts from PDFium Gate's already-observed physical PDF wrapper click and performs bounded PDF-annotation hit testing.

## Safety properties

The resolver is intentionally narrow:

- ordinary PDF clicks remain ordinary PDF clicks;
- ordinary HTTP/HTTPS PDF links are not claimed;
- only PDFium Gate's owned email-attachment protocol is accepted;
- source and attachment identities must be syntactically valid SHA-256 values;
- hit testing is bounded to the clicked PDF annotation;
- ambiguous owned-link hits fail closed;
- duplicate source imports are disambiguated by the clicked parent email PDF;
- missing or ambiguous live attachment relationships fail closed;
- the resolver does not guess a target from a basename.

## ZIP behavior

For the current transport-source model, email ZIP files are not persisted as normal attachment targets.

The email PDF is rendered from the attachment preflight manifest and contains links directly to flattened imported ZIP members.

Legacy email PDFs produced by the earlier visible-ZIP prototype remain supported by a compatibility path that can resolve an old ZIP target to its extracted PDF members. That legacy chooser is not part of the normal new-import UX.

## Practical verification

The current link architecture has practical coverage for:

- opening direct PDF attachments from the generated email PDF;
- opening PDFs originating inside multiple ZIP attachments;
- avoiding the old ZIP chooser in new imports;
- preserving link behavior through the parent managed relationship;
- DocumentInfo provenance for PDFs originating in ZIP attachments.

The newest flat attachment-folder refinement still requires one explicit practical confirmation after the latest code change.

## Source layout

Current responsibilities are split across:

- `src/email-import/render/email-html-renderer.js` — stable link URI and complete attachment manifest rendering;
- `src/email-import/attachments/pdf-link-hit-test.js` — owned protocol parsing and PDF annotation hit testing;
- `src/platform/email-attachment-pdf-point.js` — Chromium embedded-PDF click coordinate translation;
- `src/plugin/email-import/email-attachment-link-controller.js` — renderer-side orchestration and parent-PDF identity;
- `src/plugin/features/20-email-import.js` — current managed relationship resolution and opening;
- `src/email-import/metadata/email-attachment-links.js` — parent email managed attachment relationship block.

## Regression tests

Relevant automated checks include:

- `test-email-import-renderer.js`;
- `test-email-import-pdf-electron.js`;
- `test-email-import-pdf-point-adapter.js`;
- `test-email-import-pdf-link-hit-test.js`;
- `test-email-import-attachment-links.js`;
- `test-email-import-zip-link-routing.js`;
- `test-email-import-obsidian-adapter.js`.
