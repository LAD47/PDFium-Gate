# Email Import attachment relationships

## Purpose

This document records the current relationship model between an imported email PDF and its user-facing attachments.

The design uses ordinary vault files and Obsidian links wherever possible. EML, MSG and ZIP are treated as import/transport sources rather than normal documents users must manage after a successful import.

## Current attachment layout — EPOST bundle (test candidate)

All newly imported EML/MSG documents live in a **dedicated email folder**, not alongside unrelated vault files. The email PDF and all extracted ordinary attachments are siblings:

```text
00_Innboks/
└── 2026-10-08 - EPOST- Innsyn juridisk vurdering Fredrikstad kommune/
    ├── 2026-10-08 - EPOST- Innsyn juridisk vurdering Fredrikstad kommune.pdf
    ├── cover.pdf
    ├── rapport.pdf
    ├── vedtak.pdf
    ├── notat.txt
    └── notat (2).txt
```

The naming policy is `[date] - EPOST- [subject]`, with filesystem-safe normalization of the subject. The PDF has the exact folder name plus `.pdf`. Duplicate/colliding imports allocate ` (2)`, ` (3)`, etc. to **both** names, leaving existing folders untouched. Even email without attachments gets its own bundle folder.

ZIP member directories are flattened only for **email import**, with the original member path retained as provenance. All ordinary attachments from direct MIME parts and all ZIPs share a single collision allocator, which also reserves the email PDF's own filename to avoid accidental overwrite. The ZIP transport itself is not a visible file in the bundle.

This supersedes the earlier layout with an email PDF beside a separate localized ` Vedlegg`/` Attachments` folder. The previous files and their references continue to work: **this change does not migrate existing imports**.

## Email PDF attachment presentation

The generated email PDF is rendered from the same preflight attachment plan that drives durable attachment creation.

Therefore the PDF shows the complete user-facing attachment list, not merely the original transport containers.

A ZIP filename may be shown as a group heading:

```text
Attachments

cover.pdf

From Dokumenter.zip:
    rapport.pdf
    notat.txt

From Saksvedlegg.zip:
    vedtak.pdf
    notat (2).txt
```

The clickable targets are the actual imported files. New imports do not require the user to click a ZIP and then choose a member.

Inline/CID resources used by message rendering are not repeated as ordinary attachments.

## Parent email relationship block

After attachment creation succeeds, the parent email PDF's existing File Metadata Markdown record receives the plugin-managed email attachment block.

It contains the actual imported attachment paths in the same stable order used by the email-PDF attachment manifest:

```markdown
<!-- pdfium-gate:email-attachments:start -->
- [[Cases/2026-10-05 - EPOST- Subject/cover.pdf]]
- [[Cases/2026-10-05 - EPOST- Subject/rapport.pdf]]
- [[Cases/2026-10-05 - EPOST- Subject/notat.txt]]
- [[Cases/2026-10-05 - EPOST- Subject/vedtak.pdf]]
- [[Cases/2026-10-05 - EPOST- Subject/notat (2).txt]]
<!-- pdfium-gate:email-attachments:end -->
```

The block remains technical storage. Users work through the email PDF and DocumentInfo rather than editing the relationship block.

Obsidian remains the live path resolver for normal attachment moves/renames. PDFium Gate does not maintain a parallel path database.

## ZIP provenance without a retained ZIP file

A ZIP is a transport source. New email imports do not create the ZIP as a visible vault attachment file.

For a PDF originating inside a ZIP, PDFium Gate stores archive provenance in that PDF's technical metadata/relationship state:

- parent email document;
- original archive filename;
- archive SHA-256;
- original archive-member path;
- other imported members originating from the same source archive.

The Archive Relationship block can represent both the new source-identity model and the older live-ZIP-path model for backwards compatibility.

For a new email import, the conceptual relationship is:

```text
email PDF
   |
   +--> actual imported attachment
   |
   +--> archive member PDF
          provenance:
          - original ZIP filename
          - original ZIP SHA-256
          - parent email
          - sibling archive members
```

The ZIP itself is not a required link target.

## DocumentInfo presentation

For a PDF extracted from an email ZIP, DocumentInfo identifies the parent email as the clickable source and shows the original ZIP filename as provenance.

Related files imported from the same archive remain directly clickable.

For a manually imported ZIP, there is no parent email. DocumentInfo shows the original archive name as provenance and related extracted files as links.

This preserves the preferred UX boundary: users work with relationships in DocumentInfo; File Metadata Markdown remains an implementation detail.

## Transport-source policy

### EML/MSG

The normal successful workflow does not require permanent source retention.

The exact EML/MSG SHA-256, original filename, source format and relevant message identity remain technical provenance on the generated email PDF.

Exact source retention is an advanced opt-in setting and defaults to off. When enabled, the existing hidden SHA-addressed source storage remains available and byte-verified.

For automatic vault staging, the EML/MSG staging file is removed only after the import has completed successfully and its current bytes still equal the imported bytes.

A failed or cancelled import keeps the source.

### ZIP

For a successful manual Archive Import, the ZIP is deleted only after extraction, read-back verification, PDF registration and relationship persistence succeed.

If the archive cannot pass preflight, extraction does not begin.

If a failure happens after output creation begins, all files/folders and fresh PDF metadata records created by that attempt are rolled back.

The failed ZIP remains and the user is explicitly asked whether to keep or delete it. Keeping is the safe/default choice because Obsidian may hide ZIP files from the normal file explorer.

## External filesystem ZIP arrival

Manual ZIP import is not limited to drag/drop inside Obsidian.

Archive Import scans for eligible ZIP files:

- on plugin/startup reconciliation;
- when the Obsidian window regains focus.

This covers common Windows Explorer copy/move workflows without continuous polling.

A failed ZIP that the user chooses to keep is deferred for the rest of the current plugin session so focus changes do not repeatedly show the same failure dialog.

## Atomic attachment behavior

Email attachment output is transactional for the files created by that attachment phase.

The sequence is:

1. preflight all direct and ZIP attachments;
2. create all planned files;
3. read back and byte-verify all created files;
4. register PDFs;
5. persist Archive Relationships;
6. persist parent email attachment links.

If a downstream step fails, the attachment exporter rolls back newly registered attachment metadata and files it created. It never recursively deletes the EPOST bundle folder: partial output or unrelated files could be present, so the folder is safe to leave behind.

If the parent email attachment-link writer has already modified its managed block before a read-back failure, rollback also attempts to clear those incomplete links. Rollback failures are reported explicitly.

This prevents partially imported ZIP contents from remaining as apparently valid documents while preserving unrelated vault content.

## Legacy compatibility

The earlier practical prototype used a different chain:

```text
email PDF -> visible original ZIP -> extracted ZIP folder
```

That prototype was practically verified on 2026-10-05 and was useful for proving ZIP extraction, PDF registration, archive relationships and DocumentInfo navigation.

Subsequent practical UX review rejected the visible-ZIP model. The current transport-source model supersedes it for new imports.

Legacy generated email PDFs and metadata records that still reference a live ZIP path remain readable through the backwards-compatible archive relationship parser and legacy ZIP-link resolver.

## Remaining practical verification

The new model has complete automated regression coverage, including:

- multiple ZIP attachments in one email;
- one shared EPOST bundle folder containing the parent PDF and attachments;
- cross-ZIP path collision suffixes;
- no persisted email ZIP transport files;
- direct and nested PDF registration;
- archive-name/SHA/parent-email provenance;
- full attachment rollback on downstream failure;
- manual ZIP source deletion after success;
- manual ZIP rollback and keep/delete source policy;
- external ZIP reconciliation.

Practical Obsidian verification of this replacement model is still required before release.

## Practical diagnostic: October 12, 2026 (candidate 0.1.228)

A real user EML import with one ZIP attachment failed in two successive stages; neither report by itself proves that ZIP decompression failed:

1. On 0.1.227, `Archive relationship block failed read-back verification`. The archive member Markdown parser rejected legitimate paths containing a single closing bracket (e.g. `Vedtak [1].pdf`).
2. After the first test-branch patch, the same import proceeded to `failureStage: update-parent-links` and failed with `Attachment wikilink block failed read-back verification.` The email parent-link parser and its normalization routine had the same bracket-handling defect.

Candidate `fix/0.1.228-email-zip-relations` corrects both managed-block parsers, adds a synthetic twelve-PDF ZIP regression, makes rollback file-scoped rather than recursive-folder-scoped, restores/clears a partially written parent link block on rollback, and reports the first mismatched parent link on future read-back failures.

Important: These are *identified code defects* and regression tests, not yet confirmation that the user's original archive succeeds. A fresh practical Obsidian EML import is required. If it fails again, inspect `lastEmailAttachmentExport.result.failureStage`, `failedPath`, `error`, `rollbackComplete`, and `rollbackErrors`. Preserve the original EML and unrelated vault files. Do not merge to main without explicit approval.

## New layout decision — October 12, 2026

The owner requested one self-contained directory per email, named `YYYY-MM-DD - EPOST- Subject` and containing a namesake PDF plus all attachments. This improves discoverability, folder-level movement and sharing. Implemented on `feature/0.1.228-email-bundles` for EML and MSG, with collision-safe names and parent/attachment metadata relations unchanged. Existing imported email documents are deliberately **not migrated**. The layout must be verified practically before merging.

## Email staging source arrival channels (October 12, 2026 candidate)

Automatic EML/MSG import now handles vault `create`, startup scan and window-focus scan through a shared serialized staging queue. A local-only per-file size/mtime inventory records previously seen staging sources and is stored with plugin settings. The first run seeds existing files without importing them. A failed import is not retried repeatedly until the source changes; the original source is kept upon failure. User disabling of automatic import also disables reconciliation imports. The new EPOST bundle structure and existing archive relationships are unchanged.

Practical validation remains required for Explorer copy while Obsidian is running and while it is closed, as well as failed-import retention. Older email PDFs are not migrated.
