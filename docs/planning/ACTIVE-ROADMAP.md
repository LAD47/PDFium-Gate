# Active roadmap

**Purpose:** one active index for deferred work, release follow-ups and product decisions that still matter.

This file is the entry point for current planning. It does not replace detailed architecture or decision documents. Historical handoffs and superseded experiments should stay in their historical files instead of becoming active TODO items again.

## Next release: 0.1.226

Primary plan:

- [0.1.226 Community release cleanup and README review](0.1.226-COMMUNITY-RELEASE-CLEANUP.md)

Current 0.1.226 cleanup status on `chore/0.1.226-community-cleanup`:

- [x] remove obsolete BRAT terminology from the active release workflow and release procedure;
- [x] rename the publisher workflow for the real **Obsidian Community Plugins** distribution path;
- [x] stop marking normal Community releases as GitHub prereleases;
- [x] update `RELEASE.md`;
- [x] update `docs/architecture/14-release-readiness.md`;
- [x] optimize the root `README.md` for ordinary Community Plugins users;
- [x] remove outdated “Community Plugins is still future” wording from active release documentation;
- [x] move already-confirmed registration/missing-document observations out of the open test list;
- [x] replace the public `manifest.json` development placeholder with author `LAD47`;
- [ ] practically verify the two remaining Email/Archive Import observations before clearing their “pending” wording;
- [ ] run the full repository verification pipeline after the cleanup is complete.

## Product UX backlog

### PDF Document Register

Still active:

- redesign the current PDF Document Register UI/interaction model; practical testing judged the current interface poor enough that this is a redesign task rather than cosmetic polish;
- implement a clear maintenance/report surface for active, missing, invalid/corrupt and unregistered documents;
- keep destructive metadata cleanup gated behind a validated backup/rollback capability.

Already resolved — do not reopen as a planning question:

- automatic minimal system records for newly detected PDFs are implemented and practically confirmed;
- **Register existing PDFs** is implemented and practically confirmed;
- ordinary PDF identity uses the permanent record UUID and trusted rename/move continuity, not SHA-256 recovery;
- the ordinary lifecycle is `active` / `missing`; manual relink and the experimental `trashed` state were rejected.

### DocumentInfo

Review/verify these older observations:

- consider showing the **Edit** action both near the top and bottom of a long DocumentInfo panel;
- verify whether the old observation that metadata field labels ignored Norwegian Bokmål is still reproducible on the current build; close it if later i18n work already resolved it.

### Missing documents

Current accepted flow is delete PDF -> record becomes `missing` -> explicit review -> optional **Delete metadata**.

Deferred:

- add **Restore from backup** to the missing-document review only after a validated backup/restore path exists;
- reconsider a one-step “delete document and metadata” command only if real use shows a clear need.

## Backup and destructive-maintenance boundary

Authoritative PDFium Gate-side plan:

- [Document metadata backup and maintenance plan](DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md)

Independent project handoff/provenance:

- [PDFium Backup handoff](PDFIUM-BACKUP-HANDOFF.md)

Active requirements:

- keep the generic backup engine independent from PDFium Gate;
- do not introduce an unconditional runtime dependency on the backup project;
- define an integration boundary only after the generic backup design is stable;
- require validated backup/rollback before permanent destructive maintenance of durable PDFium Gate metadata;
- practically test destructive maintenance + restore on a clean test vault before enabling such workflows for normal use;
- reassess the existing per-PDF `.pdfium-backup` / `backupOriginalPdf` safety mechanism only after the independent backup solution exists and its protection scope can be compared properly.

## Email Import / Archive Import deferred product decisions

Current decisions and open questions remain in:

- [Email Import decisions](../email-import/DECISIONS.md)
- [Email Import documentation index](../email-import/README.md)

The following are legitimate future product questions, but are **not automatically 0.1.226 blockers**:

- exact visual design of generated email PDFs;
- whether `Message-ID` should be visible or remain technical metadata;
- naming policy beyond the current date/subject suggestion;
- batch-import UX and duplicate summaries;
- additional drag-and-drop/import surfaces;
- user-facing behavior for malformed or partially parseable EML/MSG;
- configurable semantic mapping from email fields to arbitrary custom metadata fields;
- parent email-PDF rollback for failures occurring after PDF creation;
- future vault-wide byte-identical duplicate finding;
- a future **Open original email** action only if practical use demonstrates a real need.

Do not re-open already resolved attachment transaction/output policy merely because older decision text discusses earlier prototypes.

## Test-observation triage

`docs/testing/TEST-OBSERVATIONS.md` contains both active observations and historical diagnostic trails.

Before each release:

1. check its **Open items** section;
2. move genuinely active work into this roadmap or a focused planning document;
3. mark practically confirmed/resolved items as completed;
4. do not treat historical diagnostic paragraphs as current implementation instructions.

Two status statements particularly deserve re-checking after 0.1.225:

- “final flat email attachment layout remains pending”;
- “manual Archive Import startup/focus reconciliation practical confirmation is pending”.

If current practical testing already covers them, update the status documents rather than carrying those reminders forward indefinitely.

## Historical material — not active backlog

These files preserve reasoning but should not be treated as current TODO lists:

- dated Email Import handoffs and dated decision snapshots;
- `docs/history/**`;
- superseded SHA-recovery/relink/Trash experiments;
- the old visible-ZIP Archive Import prototype;
- BRAT-era release instructions once the 0.1.226 cleanup is complete.

When historical material conflicts with current architecture, current decisions, this roadmap, source code or automated verification, the current material wins.
