# PDFium Backup — project handoff

**Created:** 2026-10-04  
**Target repository:** `LAD47/PDFium-Backup`  
**Status:** Independent repository created and bootstrapped at `LAD47/PDFium-Backup`; this file remains as PDFium Gate-side provenance/handoff history.

This document captures reusable backup/restore decisions discovered during PDFium Gate development. The independent project has now been created and its clean documentation baseline lives in `LAD47/PDFium-Backup`. This copy remains as provenance and as the PDFium Gate-side handoff record.

The backup project is not a continuation of the abandoned ordinary-PDF SHA recovery experiment. SHA-256 remains rejected as durable identity for editable PDFs. In this project SHA-256 is used only as file/snapshot integrity data.

## Project purpose

Build a general Obsidian backup/restore capability that can protect:

- an entire vault;
- selected folders/files;
- named backup profiles;
- data sets belonging to another plugin without understanding that plugin's domain model.

The project should be useful independently of PDFium Gate.

## Architectural boundary

The backup project owns:

- protected-set/path selection;
- snapshot creation;
- manifest format;
- byte/file integrity;
- validation;
- retention;
- restore staging;
- restore journal;
- rollback;
- backup destination handling.

A client such as PDFium Gate owns:

- which of its data is durable;
- which files belong in its protected set;
- semantic/domain validation;
- post-restore domain-specific cache invalidation or rebuild;
- whether a destructive client operation is allowed.

The generic backup engine must not need to understand `filemeta_id`, PDF status values, highlight categories or any other PDFium Gate-specific schema.

## Initial snapshot decision

Preferred v1 format:

- one standard ZIP file per snapshot;
- `backup-manifest.json` at archive root;
- payload stored with vault-relative paths;
- no absolute machine/vault paths;
- build under a temporary name;
- publish only after complete read-back validation.

Example:

```text
backup-manifest.json
payload/
  Notes/
  Attachments/
  .some-plugin/
```

The snapshot filename is presentation/convenience only. Ownership must never be inferred from filename alone.

## Manifest v1 requirements

The manifest should contain at least:

- format identifier;
- format version;
- random snapshot UUID;
- creation timestamp;
- creation reason (`manual`, `scheduled`, `pre_restore`, `pre_maintenance` or later equivalents);
- producer/plugin version where relevant;
- protected-set/profile identity where relevant;
- file count and useful summary counts;
- one entry per payload file with:
  - vault-relative path;
  - logical kind when supplied by the client/profile;
  - byte size;
  - SHA-256;
- a canonical payload-index SHA-256.

The manifest must be sufficient to prove that a snapshot belongs to this backup system. Retention must never delete an archive merely because its filename resembles a backup.

## Integrity

Use SHA-256 for exact file-byte integrity.

This is deliberately separate from document identity.

Validation must reject at least:

- missing manifest;
- unsupported required format version;
- missing payload entry;
- size mismatch;
- SHA-256 mismatch;
- duplicate archive paths;
- absolute paths;
- `..` traversal;
- path normalization collisions;
- unexpected archive structure when the format requires a closed set.

Cryptographic signing/HMAC is not required for v1 unless the threat model changes from corruption/interruption to active malicious tampering.

## Retention

Initial policy to evaluate:

- 7 daily;
- 4 weekly;
- 12 monthly.

All values configurable.

Use deterministic calendar buckets:

- newest valid scheduled snapshot for each retained calendar day;
- newest valid scheduled snapshot for each retained ISO week;
- newest valid scheduled snapshot for each retained calendar month;
- keep the union.

A snapshot may satisfy multiple buckets.

Initial safety rule:

- automatic pruning applies to `scheduled` snapshots;
- `manual`, `pre_restore` and `pre_maintenance` snapshots are not automatically pruned until a later explicit product decision.

Pruning runs only after the newly created snapshot has passed full validation.

## Restore model

Restore is a logical transaction, not a claim of filesystem-wide atomicity.

Required high-level phases:

1. validate selected snapshot without changing live data;
2. create and validate a safety snapshot of current live state;
3. build the complete restore plan;
4. stage restored payload in isolation;
5. validate staged payload;
6. detect live-data changes that occurred after the safety snapshot and abort on conflict;
7. create a restore journal in `prepared` state;
8. commit changes using temporary files/rename where possible;
9. validate the resulting live protected set;
10. mark journal complete;
11. run client-specific derived-state rebuild/invalidation.

If commit or validation fails:

- rollback to the validated pre-restore state;
- validate rollback;
- fail closed if a safe state cannot be proven.

If the process/application stops during restore, the journal must allow deterministic recovery at next startup.

## Backup destination

A vault-local destination is acceptable as the simplest first implementation but protects only against application/user mistakes, not total vault/disk loss.

The storage boundary should therefore be abstract enough to support a later user-selected external destination without changing snapshot semantics.

## Positive protected-set rule

Prefer explicit include rules/profiles over "copy a technical directory and exclude some known files".

This prevents new caches/runtime artifacts from silently becoming backup data in the future.

Unknown files inside a client-owned closed protected root should be handled explicitly according to that profile's policy rather than silently ignored.

## Planned repository structure

```text
LAD47/PDFium-Backup/
├── README.md
└── docs/
    ├── architecture/
    │   ├── BACKUP-PRINCIPLES.md
    │   ├── SNAPSHOT-FORMAT.md
    │   ├── MANIFEST.md
    │   ├── RETENTION.md
    │   └── RESTORE-AND-ROLLBACK.md
    ├── decisions/
    │   ├── 001-independent-from-pdfium-gate.md
    │   ├── 002-zip-snapshots.md
    │   └── 003-sha256-integrity.md
    └── research/
        └── PDFIUM-GATE-ORIGIN.md
```

The first repository history should be clean. Do not import/cherry-pick the experimental PDFium Gate SHA branch history.

Suggested first commit:

```text
Initial architecture for independent Obsidian backup project
```

No implementation code is required in the bootstrap commit.

## PDFium Gate as an eventual client/profile

PDFium Gate provides a useful integration test but must not define the generic architecture.

Its initial protected-data requirements currently include:

```text
File Metadata/**
.pdf-metadata/document-metadata-schema.json
.pdf-metadata/highlight-categories.yaml
**/.pdf-metadata/highlight-categories.yaml
```

Explicit PDFium Gate exclusions include:

- PDF files themselves;
- document-record index cache;
- generated runtime files;
- `.pdfium-backup` annotation backups;
- user-owned `PDF Dokumentregister.base`;
- Email Import retained EML/MSG sources unless a separate future decision includes them.

PDFium Gate semantic validation remains PDFium Gate's responsibility.

## Integration policy

Do not make PDFium Gate unconditionally dependent on the backup plugin.

Possible later integration models should be evaluated only after the generic backup project is stable, for example:

- a named backup profile configured by the user;
- an optional operation/API that creates and validates a snapshot;
- no direct integration at all, with PDFium Gate merely documenting the required profile.

The integration decision is intentionally deferred.

## Development priority

Do not start implementing this backup project merely because the repository is created.

PDFium Gate currently uses test data. Its deferred core functions, fixes, metadata lifecycle decisions and Document Register redesign should be completed first.

This repository/handoff exists now so the backup architecture and lessons are preserved without expanding PDFium Gate's immediate scope.
