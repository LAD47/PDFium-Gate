# Email Import — runtime integration

## Status

This document describes the **current** integrated Email Import runtime.

Earlier flows that reread a permanently retained EML/MSG source after PDF creation, exported a visible ZIP and then delegated that ZIP to Archive Import are superseded for new imports.

## Main runtime flow

```text
EML / MSG source bytes
        |
        v
exact SHA-256 + exact-source duplicate lookup
        |
        v
parse Canonical Email Document v1
        |
        v
allocate email PDF + localized sibling attachment folder
        |
        v
preflight complete attachment plan
        |
        +--> direct user-facing attachments
        |
        +--> every ZIP attachment
               - inspect safety before durable attachment writes
               - reject blocked/unsafe entries
               - reject nested ZIP in current implementation
               - flatten member basenames for email attachment UX
               - preserve original member path as provenance
        |
        v
render generated email PDF from the same attachment manifest
        |
        v
create/register email PDF
        |
        v
atomic attachment transaction
        |
        +--> write every planned file
        +--> read back and byte-verify
        +--> register every PDF
        +--> persist parent/archive provenance and relationships
        +--> persist ordered parent attachment links
        |
        v
success boundary
        |
        +--> automatic vault-staging EML/MSG may be deleted
        |    only when its current bytes still match imported bytes
        |
        +--> optional exact source retention only when advanced
             source-retention setting is enabled
```

Attachment output is a required part of a successful new Email Import. The old user setting that could disable attachment extraction was removed because combining disabled attachment output with source retention off could lose attachment content.

## Target naming

The email PDF uses the normal date/subject suggestion and collision allocator.

The paired attachment folder is the PDF path without `.pdf`, plus a localized attachment suffix.

Norwegian Bokmål example:

```text
Cases/2026-10-05 - Subject.pdf
Cases/2026-10-05 - Subject Vedlegg/
```

English uses `Attachments`; the other supported UI locales use their corresponding translation.

The allocator treats both the candidate PDF path and paired localized folder path as reserved targets.

## Attachment layout

Direct attachments and ZIP members from all ZIP attachments are placed in the same email attachment folder.

Email ZIP members are flattened to their basename:

```text
ZIP member: Intern/Dokumenter/rapport.pdf
Vault file: 2026-10-05 - Subject Vedlegg/rapport.pdf
```

The original member path remains technical provenance.

A single allocator resolves filename collisions across direct attachments and all ZIPs:

```text
notat.txt
notat (2).txt
notat (3).txt
```

Manual Archive Import intentionally keeps the archive's internal directory structure and is not governed by this email-specific flattening rule.

## Duplicate behavior

Exact duplicate identity is the SHA-256 of the exact EML/MSG source bytes.

When the same source is intentionally imported more than once, attachment-link activation is scoped to the **clicked parent email PDF**. This prevents two email PDFs with the same source SHA from making their attachment targets ambiguous.

An exact duplicate can open the already imported email PDF without regenerating outputs. Automatic staging cleanup is allowed only after the duplicate resolution is positively identified and the staging bytes still match the imported source bytes.

## Source retention

Permanent EML/MSG retention is **not required** by the normal runtime.

Default:

```text
Keep original EML/MSG after successful import = OFF
```

When enabled, the exact source is stored in the existing hidden SHA-addressed source area and verified byte-for-byte.

When disabled, documentary provenance remains in technical metadata, including exact source SHA-256, source format, original filename and message identity where available.

## PDF auto-registration race

PDFium Gate may auto-register a newly created PDF immediately in response to the vault create event.

For PDFs created by the current attachment transaction, a minimal record created by this auto-registration belongs to the same transaction. Email Import therefore **upgrades** that record with attachment provenance rather than treating it as an external collision.

Rollback owns every PDF path created by the transaction, including minimal records created by auto-registration before attachment metadata processing reaches that PDF.

A genuinely pre-existing target path/record is still a fail-closed collision.

## Transaction and rollback

For a new email attachment transaction:

1. preflight is completed before durable attachment writes;
2. all output files are created;
3. every output is read back and byte-compared;
4. PDFs receive ordinary document records/provenance;
5. archive/member relationships are persisted;
6. the parent email attachment-link block is persisted.

If a downstream step fails, all transaction-owned attachment files/folders and fresh PDF metadata records are removed.

The staging EML/MSG is not considered successfully consumed when the mandatory attachment transaction fails.

## Manual Archive Import integration

Manual ZIP import uses the generic Archive Import feature rather than Email Import.

It performs preflight, extraction, read-back verification, PDF registration and relationship persistence, then deletes the source ZIP only after the complete transaction succeeds.

If a failure occurs after writes begin, Archive Import rolls back its outputs and asks whether the failed ZIP should be kept or deleted. Keep is the safe/default action.

ZIP files copied with Windows File Explorer are detected through startup/focus reconciliation rather than continuous polling.

## Link activation inside generated email PDF

The generated email PDF contains stable plugin-owned link annotations for user-facing attachments. The current resolver:

1. identifies the clicked parent email PDF;
2. resolves that parent's managed attachment-link block;
3. selects the attachment by stable manifest ordinal;
4. opens the current vault file through normal Obsidian handling.

The normal path does **not** require reopening retained EML/MSG bytes and does not require a visible source ZIP.

Legacy ZIP-link resolution remains only for PDFs produced by the earlier visible-ZIP prototype.

## Practical status

The complete email path through multiple ZIPs, generated PDF attachment list, direct PDF opening and DocumentInfo provenance has been practically verified.

The latest localized folder suffix is practically verified. The final flat-layout refinement that removes ZIP-derived subfolders still requires one explicit practical confirmation before release.

Manual Archive Import's new transient-source/reconciliation failure UX remains a separate release-gate practical test.
