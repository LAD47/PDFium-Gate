# Active roadmap

**Purpose:** one active index for deferred work, release follow-ups and product decisions that still matter.

This file is the entry point for current planning. Historical handoffs, superseded experiments and completed release checklists must not be treated as active TODO items.

## Current published release: 0.1.230

[0.1.230](https://github.com/LAD47/PDFium-Gate/releases/tag/0.1.230) was published
as an ordinary GitHub Release on 19 October 2026. Required assets
`main.js`, `manifest.json` and `styles.css` are present.

- Immutable `archive/0.1.230` and tag `0.1.230` point to
  `ee5b7950a08477c1ad65cd1d474325e4b6b6b50b`.
- [Build generated runtime 39298734216](https://github.com/LAD47/PDFium-Gate/actions/runs/39298734216)
  and [publication 39305773758](https://github.com/LAD47/PDFium-Gate/actions/runs/39305773758)
  succeeded for that release commit.
- Reviewed `main` is `92c1f4ce2632f80b281ed8adc770308b6098fe33`, which adds
  only the later `AGENTS.md` synchronization. Do not move the release archive
  or tag to include this later documentation commit.
- The published version's installation through Obsidian Community Plugins is
  **not yet separately user-confirmed**. Keep that distribution confirmation
  separate from the final local candidate's practical results below.

### Practical evidence for the released candidate

On 19 October 2026, the user confirmed **all seven practical tests passed**
for the final local 0.1.230 candidate:

1. Obsidian displays PDFium Gate **0.1.230**.
2. The Vault-root Document Register opens normally.
3. Obsidian's general **Properties** (**Egenskaper**) chooser is hidden in the register.
4. PDFium Gate's **Choose columns** (**Velg Kolonner**) works.
5. **Copy UI diagnostics** (**Kopier UI-diagnose**) has been removed.
6. Other Bases views retain their **Properties** button.
7. The register works after switching between Bases views.

The earlier six checks of the local 0.1.229 cleanup build remain separate
historical evidence in [test observations](../testing/TEST-OBSERVATIONS.md).
Previously reported local automated verification passed **21/21** with exit 0;
this maintenance task does not rerun it. GitHub verification is now recorded above.

The release preserves local view-content/header ownership, observer/marker
cleanup, schema-aware localized columns and one root-only standard register.
Historical register copies/legacy files are not automatically migrated or deleted.
The [regression contract](../architecture/13-testing-and-verification.md) remains
applicable; synthetic DOM checks do not replace practical Obsidian testing.
The old local patch script has been removed, and `AGENTS.md` was subsequently
synced to `main`; earlier staging instructions for those files are historical.

### Current maintenance follow-up

- Record a separate user confirmation when published 0.1.230 has been installed
  through Community Plugins.
- Retarget/preserve the additional Email Import Node, runtime-integration and
  real Electron PDF coverage before retiring old development-branch CI.
- The five reviewed development branches have no commits outside `main`.
  See [GitHub maintenance review](GITHUB-MAINTENANCE-0.1.230.md) for exact tips,
  recommendations and conditional cleanup order. No branch/workflow/settings
  change is performed by this documentation update.
- Community preview is optional under [RELEASE.md](../../RELEASE.md).
  No release/publication task remains open merely because an old handoff says so.

## Historical 0.1.226 Community installation confirmation

**0.1.226** is the earlier user-confirmed Obsidian Community Plugins installation, not the latest published release.

Confirmed on 2026-10-06:

- exact release candidate merged to `main`;
- **Build generated runtime** succeeded on the merge commit;
- immutable `archive/0.1.226` created from the verified commit;
- ordinary GitHub Release `0.1.226` published, not marked Pre-release;
- release assets contain `main.js`, `manifest.json` and `styles.css`;
- tag, archive branch and release-time `main` all pointed to commit `e57192fa376e0e9d89c60676cd668e9b852944f8`;
- Obsidian Community Plugins offered and installed 0.1.226 successfully.

The completed cleanup record is [0.1.226 Community release cleanup](0.1.226-COMMUNITY-RELEASE-CLEANUP.md).

## Earlier 0.1.228 candidate preparation (historical)

Branch: `feature/0.1.228-email-bundles`. Manifest, package, lockfile, versions register and canonical runtime version are aligned on **0.1.228**. See [release notes](../releases/0.1.228.md).

- **Previously completed automated verification:** 19/19 passed, including deterministic build; integrated disk migration regression: 10/10 scenarios passed. These are earlier results, not a new run in this documentation update.
- **Practical confirmation (2026-10-13):** isolated candidate test points 1–6 are user-confirmed OK. `author` / Forfatter and `source_url` / Publisert på nettet are practically approved. Whole-candidate practical testing is not exhaustive.
- **Email/ZIP and other approved functions:** previously confirmed and covered by passing automated controls. No further manual repetition tests are planned for this candidate.
- **Email bundle layout:** new EML/MSG imports create one `YYYY-MM-DD - EPOST- Subject` folder containing its namesake PDF, direct attachments and flattened email ZIP members. Folder/PDF collisions share the same suffix. Existing imports are not migrated; manual ZIP import still preserves archive directories.
- **Metadata:** controlled `migrations.author_source_url_v1` upgrade; stable UUIDs and disabled states; no resurrection after marked deletion; factory/user label ownership; localized URL validation and preservation of unchanged legacy URLs.
- **Test integration:** author/source URL and disk migration tests remain in check alongside every previous gate. Disk tests use the frozen checksummed 0.1.227 contract and fresh retained OS-temp workspaces.
- **Compatibility:** returning to 0.1.227 after schema migration is not guaranteed and may require a compatible schema backup plus separate preservation of later edits. Synthetic schema restore passed; whole-plugin downgrade, process crashes, concurrent faults and recovery failure are not tested.
- **Final post-version check (2026-10-13):** 19/19 passed, disk migration 10/10, deterministic build passed; exit 0. **Remaining release gates:** candidate commit/push, then mandatory Community Review branch / preview scan of the exact pushed SHA before any explicit merge decision. Preserve local checkpoints and test workspaces. No merge or publication is authorized in this preparation task.

## Earlier 0.1.227 candidate work

The following records preserve earlier completed candidate work incorporated into 0.1.228. Candidate/merge/preview wording in these historical records describes its then-current state; current [RELEASE.md](../../RELEASE.md) governs. Do not reopen resolved 0.1.226 release work unless a regression is demonstrated.

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

The register redesign below is completed and practically confirmed.

- **Preparation complete (0.1.227):** native example Bases versus the real PDFium Gate register are explicitly separated, the synthetic example package is expanded, and Settings is reorganized into collapsible groups. Automated verification is green (run `37510815842`) and practical test 1–9 passed on 2026-10-07.

- **Document Register redesign complete and practically verified (0.1.227):** PDF-first layout, filename links, **Velg Kolonner**, compact factory defaults, quick filters Active/Missing/Errors/Unregistered/All, concrete invalid-record diagnostics, selectable/copyable table text, duplicate-record comparison and guarded **Delete metadata** are all confirmed.
- **Final Unregistered closure passed:** with automatic registration disabled, two new test PDFs appeared under **Unregistered**; **Register all** registered both through the canonical `registerExistingPdfRecords()` flow, Unregistered returned to 0, both moved to **Active** with ordinary metadata records/new UUIDs, and **Missing** remained unchanged/read-only. Practical closure test 1–6 passed on 2026-10-07. Final closure CI run `37641023959` was green.
- Preserve the confirmed register behavior and do not reopen Active/Missing/Error/duplicate/Unregistered flows without a demonstrated regression.
- Preserve the current simple lifecycle: `active` / `missing`.
- Preserve permanent UUID identity and trusted rename/move continuity.
- Do not reintroduce ordinary-PDF SHA recovery, manual relink or the experimental `trashed` state.

Already resolved — do not reopen as planning questions:

- automatic minimal records for newly detected PDFs;
- explicit **Register existing PDFs**;
- fresh identity for a new PDF that appears at a path previously owned by a missing historical record;
- explicit **Missing documents** review and optional **Delete metadata**.

### Community Plugin review follow-up

- **0.1.226 scanner failure addressed for 0.1.227:** the manifest description no longer contains the redundant word “Obsidian”.
- **Release-size warning addressed:** generated Email/Archive runtime bundles now use esbuild whitespace/syntax minification without identifier minification. Verified `main.js` size is **4,570,242 bytes**, below the 5 MB Community/Sync target. A permanent `check:community` gate prevents regressions.
- **Artifact provenance added:** the Community release workflow now rebuilds/verifies the frozen archive and generates GitHub artifact attestations for `main.js`, `manifest.json` and `styles.css` before publishing.
- **CSS review warnings addressed:** active `styles.css` contains no `!important`, `:has()` or `text-decoration-style`; the visibility verifier was updated to the new exact-root selectors.
- **Privileged desktop behavior documented:** README now explains filesystem access, vault enumeration, clipboard use and the bundled dynamic-code dependency.
- Full source/runtime verification, dependency audit and the complete Email Import test suite are green in runs `37656502583` and `37656591061`.
- **0.1.227 is now a versioned release candidate:** `manifest.json`, `package.json`, `package-lock.json`, `versions.json` and the runtime version constant are aligned on `0.1.227`; release-candidate notes exist at `docs/releases/0.1.227.md`. Run `37659496179` is green and generated the matching 0.1.227 runtime; `main.js` remains **4,570,242 bytes**.
- Remaining scanner recommendations for vault enumeration and clipboard access are intentional product behavior. The `new Function(...)` finding comes from `source-map-js` via `sanitize-html -> postcss -> source-map-js`; dependency replacement can be reviewed later, but there is no current vulnerable-dependency finding.
- Before any 0.1.227 merge/release decision, run the Community **Review branch / preview scan** against the candidate branch if available.

## Backup and destructive maintenance

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

## Email Import / Archive Import deferred product decisions

The transport-source/attachment model is confirmed. In 0.1.228, the EPOST bundle supersedes the older sibling attachment-folder placement; ZIP members remain flat within the bundle. Preserve source-ZIP cleanup, direct PDF links and external-ZIP focus reconciliation without a demonstrated regression.

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
- Community **Review branch / preview scan** is optional under the owner decision recorded in [RELEASE.md](../../RELEASE.md). If chosen, scan the exact candidate, record date/SHA/findings and repeat after relevant candidate changes; all automated quality gates remain required;
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
