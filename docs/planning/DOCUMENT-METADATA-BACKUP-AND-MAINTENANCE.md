# Document metadata backup and maintenance plan

**Decision date:** 2026-10-02  
**Status:** Approved product direction; implementation not started.

This plan replaces the abandoned ordinary-PDF SHA recovery, manual relink and logical Trash experiments with a simpler backup-backed maintenance model.

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

PDFium Gate backup protects metadata/configuration owned by PDFium Gate. It is not intended to replace the user's normal backup of the PDF/document collection.

The first implementation should protect durable metadata/configuration needed to reconstruct the document register, while excluding disposable caches and generated/runtime files.

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

Exact archive format and configurable backup destination are implementation decisions to finalize before coding.

## Backup operations

The product should provide:

- **Back up now** — explicit on-demand snapshot;
- **automatic scheduled backup** — optional;
- **retention policy** — keep a configurable set of recent daily, weekly and monthly snapshots;
- **backup list/status** — timestamp, PDFium Gate version, record count and validation state;
- **validate backup** — verify manifest/content integrity before a snapshot is considered restorable.

Retention must delete only backups that belong to the PDFium Gate backup set and must never infer ownership from a filename alone.

A practical initial retention policy to evaluate is 7 daily, 4 weekly and 12 monthly snapshots, all user-configurable.

## Restore operations

Full snapshot restore is the first supported restore mode.

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

Before any maintenance operation that permanently removes durable metadata, PDFium Gate must create and validate a current backup. If backup fails, destructive maintenance does not proceed.

There is no automatic age-based deletion of missing records in the initial design.

## Implementation checklist

- [ ] Remove abandoned ordinary-PDF `filemeta_sha256` persistence and recovery code.
- [ ] Remove manual missing-PDF relink UI and operation ports.
- [ ] Remove the experimental `trashed` document-record state; retain only `active` and `missing`.
- [ ] Update verifiers so SHA/relink/Trash cannot silently return to the ordinary PDF record contract.
- [ ] Define the backup manifest/version contract.
- [ ] Finalize snapshot archive format and default/configurable destination.
- [ ] Implement protected-set discovery without including disposable caches or Email Import source archives.
- [ ] Implement **Back up now** and read-back/integrity validation.
- [ ] Implement retention policy and safe pruning.
- [ ] Implement backup browser/status UI.
- [ ] Implement full restore with mandatory pre-restore safety backup.
- [ ] Rebuild/invalidate document-record cache after restore.
- [ ] Implement Document register maintenance report.
- [ ] Implement backup-gated permanent removal of missing records.
- [ ] Add focused automated tests for backup corruption, interrupted restore, retention pruning and destructive-maintenance backup failure.
- [ ] Perform practical restore tests on a clean test vault before public release.

## Explicitly rejected directions

For ordinary editable PDFs, do not reintroduce without a new architectural decision:

- SHA-256 as durable document identity;
- automatic recovery of missing records by content hash;
- filename/path guessing after continuity has been lost;
- arbitrary manual PDF selection/relink;
- an internal `trashed` lifecycle solely to emulate a second recycle bin.

SHA-256 remains appropriate in other bounded contexts where exact byte identity is the requirement, including Email Import integrity/duplicate handling.
