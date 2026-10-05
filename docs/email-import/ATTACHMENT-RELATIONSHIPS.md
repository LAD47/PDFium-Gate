# Email Import attachment relationships

## Purpose

This document records the current relationship model between an imported email PDF and its user-facing attachments.

The design uses ordinary vault files and Obsidian links wherever possible. EML, MSG and ZIP are treated as import/transport sources rather than normal documents users must manage after a successful import.

## Current attachment layout

A generated email PDF and its attachment folder share the same base name:

```text
Cases/2026-10-05 - Subject.pdf
Cases/2026-10-05 - Subject/
```

All ordinary user-facing attachments belong below that one folder.

Direct attachments are placed there directly. Members of every ZIP attachment in the same email are also placed below that same folder while preserving the ZIP's internal relative structure where possible.

One collision allocator covers the complete attachment plan. It prevents silent overwrite across direct attachments and across multiple ZIPs.

Example:

```text
2026-10-05 - Subject.pdf
2026-10-05 - Subject/
├── cover.pdf
├── rapport.pdf
├── vedtak.pdf
└── Vedlegg/
    ├── notat.txt
    └── notat (2).txt
```

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
- [[Cases/2026-10-05 - Subject/cover.pdf]]
- [[Cases/2026-10-05 - Subject/rapport.pdf]]
- [[Cases/2026-10-05 - Subject/Vedlegg/notat.txt]]
- [[Cases/2026-10-05 - Subject/vedtak.pdf]]
- [[Cases/2026-10-05 - Subject/Vedlegg/notat (2).txt]]
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

If a downstream step fails, newly registered attachment metadata and newly created attachment files/folders are removed.

This prevents partially imported ZIP contents from remaining as apparently valid documents.

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
- one sibling attachment folder;
- cross-ZIP path collision suffixes;
- no persisted email ZIP transport files;
- direct and nested PDF registration;
- archive-name/SHA/parent-email provenance;
- full attachment rollback on downstream failure;
- manual ZIP source deletion after success;
- manual ZIP rollback and keep/delete source policy;
- external ZIP reconciliation.

Practical Obsidian verification of this replacement model is still required before release.
