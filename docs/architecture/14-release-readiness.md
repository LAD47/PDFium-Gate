# Release readiness and public versioning

This document records release-governance decisions that must be stable before the first public beta. It does not change runtime behavior.

## Public version sequence

Internal `0.1.x` builds remain development history. The planned public sequence is:

- `0.9.0`, `0.9.1`, ... — Beta releases;
- `0.99.0`, `0.99.1`, ... — Release Candidate phase;
- `1.0.0` — first stable release;
- after 1.0: patch for compatible bug fixes, minor for compatible features, major for intentionally incompatible changes.

`manifest.json` and the GitHub release/tag use the same plain `x.y.z` version. Beta/Release Candidate is expressed as release status/name rather than adding a prerelease suffix to the manifest version.

## Persisted-format review before public release

Before public/live release, any change to persisted formats, file layouts, configuration structures, IDs, or other user-data representations requires an explicit migration/backward-compatibility review. Pre-release test data may be destructively changed only while that test-phase policy remains explicitly in force.

## Backup/rollback readiness before destructive public use

The generic backup engine is planned as an independent Obsidian project rather than a large subsystem inside PDFium Gate. PDFium Gate core development may continue with test data before that project is implemented.

Before PDFium Gate exposes permanent/destructive maintenance of durable user metadata for public/live use, an adequate backup/rollback path must be implemented and practically tested. At minimum:

- destructive document-register maintenance must be gated by a validated current safety snapshot;
- a restore operation must validate its selected snapshot before mutation;
- restore must create and validate a pre-restore safety snapshot;
- interrupted/failed restore must have a defined fail-closed rollback path;
- disposable indexes/caches must be invalidated or rebuilt after successful restore.

The backup engine may be provided by the planned independent `LAD47/PDFium-Backup` project, but PDFium Gate must not silently acquire an unconditional runtime dependency on another plugin. Any integration contract must be reviewed separately.

The PDFium Gate-specific protected-data and maintenance requirements are tracked in [Document metadata backup and maintenance plan](../planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md).

## Distribution direction

GitHub Releases are the intended test/public artifact channel. During private beta, BRAT may be used for test installation/update workflows.

The public product name and plugin ID were frozen in 0.1.224 as **PDFium Gate** / `pdfium-gate`, and the active GitHub repository is `LAD47/PDFium-Gate`. Author metadata and final Community Plugins submission/release details still require an explicit release decision before the first public beta.
