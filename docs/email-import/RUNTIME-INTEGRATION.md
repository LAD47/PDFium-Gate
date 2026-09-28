# Email Import — Runtime Integration

This document records the first user-facing Obsidian runtime integration for Email Import.

## Entry point

The initial integration is deliberately command-based rather than drag-and-drop based.

PDFium Gate registers one explicit command:

```text
Import email (.eml/.msg)
```

The command opens an Electron main-process file picker restricted to `.eml` and `.msg` sources. Drag-and-drop and batch import remain later UX work and are not required to validate the core import workflow.

## Runtime flow

The integrated flow is:

```text
Choose .eml/.msg source
        |
        v
Read exact source bytes
        |
        v
SHA-256 exact-duplicate lookup
        |
        v
Parse to Canonical Email Document v1
        |
        v
Review / decision modal
        |
        +--> Cancel
        |
        +--> Open existing PDF when one exact match is available
        |
        +--> Import
               |
               +--> explicit keep/discard source choice
               +--> editable target PDF path
               |
               v
Optional exact-byte retained source
               |
               v
Controlled HTML -> main-process Chromium PDF
               |
               v
Create PDF in vault
               |
               v
Create ordinary File Metadata pdf/document record
               |
               v
Open generated PDF through normal PDFium Gate workflow
```

Exact duplicate detection happens before parsing and before durable writes.

## User confirmation boundary

The review modal shows documentary source/message information before anything durable is written:

- source filename;
- subject;
- sender;
- date;
- exact-source duplicate matches;
- proposed vault-relative PDF path;
- original-source retention choice.

The initial integration intentionally has no default retention choice. The user must explicitly choose either to retain or not retain the original `.eml` / `.msg` bytes for each import.

This preserves the existing open product question about whether a later configurable default should exist.

## PDF naming and location

The initial runtime suggests a path under:

```text
Email Imports/
```

The suggested filename uses the message date when available plus a filesystem-safe subject. Existing-path collisions receive a numeric suffix.

The target path is editable in the review modal. The initial suggestion is therefore an implementation default, not a frozen long-term naming policy.

The target must remain a vault-relative `.pdf` path and cannot be placed inside `.pdf-metadata/` or `File Metadata/`.

## Bundled dependencies

Email Import uses mature parsing and sanitization dependencies, but PDFium Gate releases do not ship a separate `node_modules` tree.

The build therefore bundles the Email Import core and its required JavaScript dependencies into the generated root `main.js` at build time. The initial build-time bundler is esbuild.

The installed runtime remains self-contained:

- no runtime `require('mailparser')`;
- no runtime `require('sanitize-html')`;
- no runtime `require('@kenjiuno/msgreader')`;
- no separate dependency installation by the user.

A dedicated build verification gate checks this boundary.

## Main-process boundary

Filesystem/source parsing and orchestration remain in the renderer/plugin-side Email Import controller where appropriate.

Operations that require Electron main-process capabilities cross the existing MainProcessTransport boundary:

- native source-file selection;
- controlled HTML to PDF printing.

The main-process implementation uses a dedicated Email Import adapter rather than giving the Email Import feature direct access to Electron globals. The PDF print window retains the security constraints established earlier: JavaScript disabled, Node integration disabled, context isolation enabled, sandbox enabled, web security enabled, insecure content disabled, navigation restricted, and new-window creation denied.

## Metadata integration

The generated PDF is not registered as a special email document type.

After the PDF is created, Email Import calls the existing document-record operation and creates a normal:

```text
filemeta_type: pdf
filemeta_profile: document
```

record under `File Metadata/`.

Technical `email_import_*` provenance and compatible initial user-field suggestions follow the metadata projection rules in `METADATA-INTEGRATION.md`.

## Rollback boundary

The first integrated workflow uses ownership-aware best-effort rollback for writes owned by the current import operation.

If a failure occurs after a new PDF has been created but before the import completes, the controller attempts to remove that newly created PDF.

If source retention created a new SHA-addressed source file during the current operation, rollback removes it only after verifying that its path and bytes still match the exact imported source.

If the retained source already existed and was merely reused, the current import does not own it and rollback does not remove it.

The existing document-record API is reused rather than replaced by an Email Import-specific metadata store. Practical testing must therefore include failure/retry behavior around metadata registration before stronger transactional guarantees are claimed.

## Localization

The command, review modal, notices, and native source-picker labels participate in PDFium Gate's existing UI-language system.

Email Import owns modular locale overlays for the seven currently supported UI languages. Build-time i18n verification merges these overlays with the core dictionaries, rejects key collisions, and preserves 100% key/placeholder parity.

## Verification boundary

The runtime-integration CI gate now permits `main.js` and `main-bridge.js` to change because those changes are the intended product integration.

Instead of the former "runtime must not change" rule, CI now requires all of the following:

- existing PDFium Gate build and architecture checks remain green;
- Email Import parser/integrity/render/storage/attachment/metadata tests remain green;
- real Electron/Chromium PDF generation remains green;
- Email Import dependencies are actually bundled into `main.js`;
- no runtime package requires for the bundled dependencies remain;
- main-process source picker and secure printer are present;
- generated runtime differences are limited to `main.js` and `main-bridge.js` after the deterministic build;
- the generated plugin runtime is uploaded as an artifact for practical Obsidian testing.

Automated checks do not replace the final practical Obsidian regression test.
