# Document metadata backup and maintenance plan

**Decision date:** 2026-10-02  
**Separation decision:** 2026-10-04  
**Status:** Approved PDFium Gate safety requirements; backup-engine implementation deferred to an independent project.

This plan replaces the abandoned ordinary-PDF SHA recovery, manual relink and logical Trash experiments with a simpler backup-backed maintenance model.

## Implementation ownership decision

Backup/restore is no longer planned as a large subsystem inside PDFium Gate.

PDFium Gate is now publicly distributed through Obsidian Community Plugins, but destructive durable-metadata maintenance remains deliberately constrained. The priority is to stabilize deferred core UX and the document-register design while the independent backup/restore capability is developed and validated.

The reusable backup engine is planned as a separate project:

`LAD47/PDFium-Backup`

The independent project should provide general Obsidian snapshot, manifest, integrity, retention, restore and rollback capabilities without understanding PDFium Gate-specific record semantics.

This document remains in PDFium Gate as the authoritative record of:

- why backup/rollback is required for destructive PDFium Gate maintenance;
- which PDFium Gate-owned durable data must eventually be protectable;
- which PDFium Gate-specific data must not be confused with disposable cache or unrelated retained sources;
- the safety boundary that destructive maintenance must fail closed when an adequate validated backup/rollback path is unavailable.

PDFium Gate must not become unconditionally dependent on another plugin merely because the backup engine is developed independently. Any future integration contract is a separate architectural decision.

## Product decision

Ordinary PDF document records have only two lifecycle states:

- `active` — the registered PDF exists and is bound through the normal vault lifecycle;
- `missing` — the registered PDF can no longer be found with reliable continuity.

The permanent `filemeta_id` UUID is the document-record identity. A content hash is not a durable identity for editable PDFs: adding, changing or removing PDF annotations rewrites bytes and changes SHA-256, and removing an annotation does not reproduce the previous byte stream.

Therefore ordinary PDF document records must not use `filemeta_sha256` for identity or recovery.

## Missing-document policy

- A trusted Obsidian rename/move event may update the existing active record and preserve its UUID.
- An unexpected disappearance changes the existing record to `missing`.
- A PDF that later appears at the same path is not automatically rebound to the missing record.
- PDFium Gate does not offer a manual PDF picker/relink workflow.
- PDFium Gate does not offer SHA-based recovery for ordinary PDFs.
- A PDF without an active record is treated as unregistered and may receive a new metadata record through the normal create/save workflow.
- Missing records remain historical metadata until the user explicitly removes them through a future maintenance action.

This deliberately avoids asking users to choose among potentially hundreds of PDFs and avoids creating silent false document associations.

## Backup purpose

The future backup capability used by PDFium Gate must protect metadata/configuration owned by PDFium Gate. It is not intended to replace the user's normal backup of the PDF/document collection.

The protected set must cover durable metadata/configuration needed to reconstruct the document register, while excluding disposable caches and generated/runtime files.

### Initial protected set

Include:

- `File Metadata/**` document records;
- the canonical document metadata schema;
- highlight category configuration files owned by PDFium Gate, including folder-level category owners;
- a backup manifest containing format version, PDFium Gate version, timestamp, counts and integrity information.

Do not include as part of the document-metadata backup:

- the user's PDF files;
- `.pdf-metadata/document-record-index-cache.json` or other disposable caches;
- generated plugin runtime files;
- `.pdfium-backup` PDF annotation backups;
- the user-owned `PDF Dokumentregister.base`;
- retained Email Import source archives merely because they live below a technical PDFium Gate folder. Email source retention/backups remain a separate concern.

The independent backup project owns the generic archive/manifest/restore design. PDFium Gate owns the semantic definition of its protected durable data.

## Backup operations required by PDFium Gate

The eventual backup solution should be able to provide:

- **Back up now** — explicit on-demand snapshot;
- **automatic scheduled backup** — optional;
- **retention policy** — keep a configurable set of recent daily, weekly and monthly snapshots;
- **backup list/status** — timestamp, version/context, protected-data counts and validation state;
- **validate backup** — verify manifest/content integrity before a snapshot is considered restorable.

Retention must delete only backups that provably belong to the managed backup set and must never infer ownership from a filename alone.

A practical initial retention policy to evaluate remains 7 daily, 4 weekly and 12 monthly snapshots, all user-configurable.

## Restore safety requirements

Full snapshot restore is the first restore mode PDFium Gate needs.

Before restoring an older snapshot:

1. validate the selected backup;
2. create and validate a new safety backup of the current state;
3. restore the selected durable metadata/configuration;
4. validate the restored set;
5. invalidate/rebuild disposable indexes and caches;
6. report the restore result clearly.

Restore must fail closed if the selected backup is incomplete, invalid or incompatible.

Restoring one individual record from an older backup may be considered later, but it is not required for the first implementation.

## Maintenance workflow

Provide one understandable **Document register maintenance** surface rather than many unrelated cleanup commands.

Initial maintenance report should cover at least:

- active document records;
- missing document records;
- invalid/corrupt document records;
- PDFs without an active metadata record.

Planned safe actions:

- inspect missing records;
- explicitly remove selected/all missing records;
- create new metadata for an unregistered PDF through the normal metadata workflow;
- run register consistency validation.

Permanent destructive maintenance is deferred until an adequate validated backup/rollback path is available. If the required backup step fails, destructive maintenance must not proceed.

There is no automatic age-based deletion of missing records in the initial design.

## PDFium Gate implementation checklist

Completed ordinary-PDF cleanup:

- [x] Remove abandoned ordinary-PDF `filemeta_sha256` persistence and recovery code.
- [x] Remove manual missing-PDF relink UI and operation ports.
- [x] Remove the experimental `trashed` document-record state; retain only `active` and `missing`.
- [x] Update verifiers so SHA/relink/Trash cannot silently return to the ordinary PDF record contract.

Deferred while core PDFium Gate functionality is completed:

- [ ] Complete and stabilize deferred core functions and practical test observations.
- [x] Automatic minimal system records for newly detected PDFs and the explicit **Register existing PDFs** flow are implemented and practically confirmed; preserve this as the current registration model.
- [x] Redesign the PDF Document Register UI/interaction model. Final **Unregistered → Register all** closure test 1–6 passed on 2026-10-07; the overall 0.1.227 Document Register redesign is complete.
- [ ] Implement the Document register maintenance report without enabling unsafe destructive cleanup prematurely.
- [ ] Define any future integration boundary with the independent backup project only after the generic backup design is stable.
- [ ] Gate any broader/permanent destructive maintenance of durable metadata behind a validated backup/rollback capability before exposing that maintenance to normal users.
- [ ] Perform practical destructive-maintenance and restore tests on a clean test vault before enabling the backup-dependent maintenance workflow for normal users.

Generic backup-engine work such as snapshot format, manifest, SHA-256 integrity, retention, staging, journal and rollback belongs in the independent backup project rather than being implemented here.

## Explicitly rejected directions

For ordinary editable PDFs, do not reintroduce without a new architectural decision:

- SHA-256 as durable document identity;
- automatic recovery of missing records by content hash;
- filename/path guessing after continuity has been lost;
- arbitrary manual PDF selection/relink;
- an internal `trashed` lifecycle solely to emulate a second recycle bin.

SHA-256 remains appropriate in other bounded contexts where exact byte identity is the requirement, including Email Import integrity/duplicate handling and generic backup-file integrity.
