# Active roadmap

**Purpose:** one active index for deferred work, release follow-ups and product decisions that still matter.

This file is the entry point for current planning. Historical handoffs, superseded experiments and completed release checklists must not be treated as active TODO items.

## Current release baseline

**0.1.226** is the current user-confirmed Obsidian Community Plugins baseline.

Confirmed on 2026-10-06:

- exact release candidate merged to `main`;
- **Build generated runtime** succeeded on the merge commit;
- immutable `archive/0.1.226` created from the verified commit;
- ordinary GitHub Release `0.1.226` published, not marked Pre-release;
- release assets contain `main.js`, `manifest.json` and `styles.css`;
- tag, archive branch and release-time `main` all pointed to commit `e57192fa376e0e9d89c60676cd668e9b852944f8`;
- Obsidian Community Plugins offered and installed 0.1.226 successfully.

The completed cleanup record is [0.1.226 Community release cleanup](0.1.226-COMMUNITY-RELEASE-CLEANUP.md).

## Next development line: 0.1.227

No single feature scope is frozen yet. Start from the open items below and choose one contained task at a time. Do not reopen resolved 0.1.226 release work unless a regression is demonstrated.

### DocumentInfo

- **DocumentInfo actions top + bottom:** complete and practically verified on `fix/0.1.227-localized-defaults`. Read mode has **Edit** at top and bottom; edit mode has **Cancel** and **Save** at top and bottom. Practical tests confirmed both save paths persist and both cancel paths discard changes. Automated verification is green in runs `37501182896` and `37505514681`.
- **0.1.227 localized factory defaults:** implementation is complete and practically verified on `fix/0.1.227-localized-defaults`.
  - New/reset defaults use the active language while stable UUIDs, properties and machine values remain unchanged.
  - Standard categories have a stable hidden canonical machine `value` plus a localized display `name`; existing category configs are migrated by permanent UUID.
  - Existing untouched standard display names follow language changes; user-customized and user-created names are preserved.
  - Practical verification passed on 2026-10-06 for Bokmål → English → Bokmål.
  - Category verification preserved a renamed standard category (`Budsjett`).
  - Metadata verification preserved a renamed standard field (`Avsender / organisasjon`) and a renamed standard document-type option (`Avgjørelse`) while their stable machine identities remained unchanged; untouched metadata fields/options continued to follow the active UI language.
  - Automated verification and dependency audit are green. This item is ready for an explicit merge decision; do not merge to `main` implicitly.

### PDF Document Register

This is the largest confirmed UX backlog item.

- **Preparation complete (0.1.227):** native example Bases versus the real PDFium Gate register are explicitly separated, the synthetic example package is expanded, and Settings is reorganized into collapsible groups. Automated verification is green (run `37510815842`) and practical test 1–9 passed on 2026-10-07.

- Redesign the current Document Register UI/interaction model; practical testing judged the current interface poor enough that this is a redesign task rather than cosmetic polish.
- **First redesign slice complete (0.1.227):** PDF is the first column and the filename itself is the clickable link; per-Base **Velg Kolonner** controls visible columns without changing metadata. New standard registers start compact; existing user-owned Base files are not rewritten. Automated verification is green (runs `37601435010`, `37603506103`, `37605344254`) and the complete practical verification passed on 2026-10-07.
- **Second redesign slice in progress (0.1.227):** add a read-only status overview for Active, Missing, Errors and Unregistered. Counts are sourced from the canonical document-record index and the existing PDF registration policy. Automated verification is green (run `37606821050`); practical verification remains.
- Implement a clear maintenance/report surface for:
  - active records;
  - missing records;
  - invalid/corrupt records;
  - PDFs without an active metadata record.
- Preserve the current simple lifecycle: `active` / `missing`.
- Preserve permanent UUID identity and trusted rename/move continuity.
- Do not reintroduce ordinary-PDF SHA recovery, manual relink or the experimental `trashed` state.

Already resolved — do not reopen as planning questions:

- automatic minimal records for newly detected PDFs;
- explicit **Register existing PDFs**;
- fresh identity for a new PDF that appears at a path previously owned by a missing historical record;
- explicit **Missing documents** review and optional **Delete metadata**.

### Backup and destructive maintenance

Authoritative PDFium Gate-side requirements:

- [Document metadata backup and maintenance plan](DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md)
- [PDFium Backup handoff](PDFIUM-BACKUP-HANDOFF.md)

Keep these boundaries:

- the generic backup engine remains an independent project;
- PDFium Gate must not acquire an unconditional runtime dependency on the backup project;
- define an integration boundary only after the generic backup design is stable;
- broader/permanent destructive maintenance of durable metadata must remain gated behind validated backup/rollback;
- destructive-maintenance + restore must be practically tested on a clean test vault before that workflow is exposed to normal users;
- reassess the existing per-PDF `.pdfium-backup` / `backupOriginalPdf` safeguard only after the independent backup solution exists and its protection scope can be compared properly;
- a future **Restore from backup** action belongs naturally in the missing-document review once a validated restore path exists.

### Email Import / Archive Import deferred product decisions

The 0.1.226 transport-source/attachment model is confirmed. Do not reopen its flat attachment layout, source-ZIP cleanup, direct PDF links or external-ZIP focus reconciliation without a demonstrated regression.

Legitimate future questions remain:

- exact visual design of generated email PDFs;
- whether `Message-ID` should be visible or remain technical metadata;
- naming policy beyond the current date/subject suggestion;
- batch-import UX and duplicate summaries;
- additional drag-and-drop/import surfaces;
- user-facing behavior for malformed or partially parseable EML/MSG;
- configurable semantic mapping from email fields to arbitrary custom metadata fields;
- parent email-PDF rollback for failures occurring after PDF creation;
- future vault-wide byte-identical duplicate finding;
- a future **Open original email** action only if practical use demonstrates a real need;
- broader real-world testing of malformed, corrupt or password-protected ZIP files.

Current source-of-truth documents:

- [Email Import decisions](../email-import/DECISIONS.md)
- [Email Import documentation index](../email-import/README.md)

## Release-process safeguards to preserve

These were established while preparing 0.1.226 and are now part of the normal release contract:

- `package-lock.json` is committed;
- local/CI dependency installation uses `npm ci`;
- generated runtime is built from canonical `src/`;
- normal Community publishing is manual-only;
- freeze `archive/<version>` only after the final `main` build workflow is green;
- publish an ordinary GitHub Release from the frozen archive;
- required assets are `main.js`, `manifest.json`, and `styles.css`;
- treat a release as user-confirmed runtime baseline only after installation/runtime confirmation in Obsidian.

## Test-observation triage

`docs/testing/TEST-OBSERVATIONS.md` is the detailed practical-testing notebook.

Before each release:

1. check its **Open items** section;
2. move genuine product work into this roadmap or a focused planning document;
3. move confirmed/resolved observations to Completed;
4. do not treat old diagnostic trails as current implementation instructions.

## Historical material — not active backlog

These files preserve reasoning but are not active TODO lists:

- dated Email Import handoffs and dated decision snapshots;
- `docs/history/**`;
- superseded SHA-recovery/relink/Trash experiments;
- the old visible-ZIP Archive Import prototype;
- BRAT-era release material;
- the completed 0.1.226 cleanup checklist.

When historical material conflicts with current architecture, current decisions, this roadmap, source code or automated verification, the current material wins.
