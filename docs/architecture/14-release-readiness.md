# Release readiness and public versioning

This document records the current release-governance rules for PDFium Gate, including Community Plugins distribution, public versioning and future stable/test release boundaries. It does not change runtime behavior.

## Public version sequence

The current `0.1.x` line is publicly distributed through Obsidian Community Plugins as pre-1.0 development/test releases. The planned maturity sequence remains:

- `0.9.0`, `0.9.1`, ... — Beta releases;
- `0.99.0`, `0.99.1`, ... — Release Candidate phase;
- `1.0.0` — first stable release;
- after 1.0: patch for compatible bug fixes, minor for compatible features, major for intentionally incompatible changes.

`manifest.json` and the GitHub release/tag use the same plain `x.y.z` version. Beta/Release Candidate is expressed as release status/name rather than adding a prerelease suffix to the manifest version.

## Persisted-format review before stable/destructive use

Because PDFium Gate is already publicly distributed as a pre-1.0 Community plugin, changes to persisted formats, file layouts, configuration structures, IDs, or other user-data representations require an explicit migration/backward-compatibility review whenever they could affect existing users. Experimental test-only data may be destructively changed only when that scope is explicit.

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

PDFium Gate is distributed to ordinary users through **Obsidian Community Plugins**. GitHub Releases provide the release artifacts consumed by that distribution/update flow.

The normal release path is:

```text
main
  -> Build generated runtime
  -> freeze archive/<version>
  -> GitHub Release
  -> Obsidian Community Plugins
```

Normal Community releases are ordinary GitHub Releases, not GitHub prereleases. A future explicitly designed test channel may use prereleases, but that is separate from the normal Community Plugins release path.

BRAT was used during an earlier test phase and is no longer part of the active installation or release workflow. Historical documents may retain BRAT references when they describe that earlier development period.

The public product name and plugin ID were frozen in 0.1.224 as **PDFium Gate** / `pdfium-gate`, and the active GitHub repository is `LAD47/PDFium-Gate`. The public `manifest.json` author metadata is `LAD47`.

## Current confirmed Community baseline

Version **0.1.226** was published through the normal Community Plugins release path on 2026-10-06 and was subsequently offered and installed successfully through Obsidian Community Plugins. Its frozen release evidence is `archive/0.1.226`; the release-time commit is `e57192fa376e0e9d89c60676cd668e9b852944f8`.
