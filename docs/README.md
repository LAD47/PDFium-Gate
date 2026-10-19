# Documentation

This directory contains active architecture documentation, focused test notes, canonical examples, and preserved project history.

## Current release status (19 October 2026)

**0.1.230** is the latest published ordinary
[GitHub Release](https://github.com/LAD47/PDFium-Gate/releases/tag/0.1.230),
not a prerelease. Tag `0.1.230` and immutable `archive/0.1.230` both point to
`ee5b7950a08477c1ad65cd1d474325e4b6b6b50b`. Reviewed `main` additionally contains
the instructions-only commit `92c1f4ce2632f80b281ed8adc770308b6098fe33`.

[Build generated runtime](https://github.com/LAD47/PDFium-Gate/actions/runs/39298734216)
and [Publish Community Plugin release](https://github.com/LAD47/PDFium-Gate/actions/runs/39305773758)
succeeded for the release commit. All seven practical tests of the final local
0.1.230 candidate were user-confirmed. Installation of the published 0.1.230
version through Obsidian Community Plugins has **not yet been separately
user-confirmed**. The recorded 0.1.226 Community installation remains historical
evidence; it is not the latest published version.

See [RELEASE.md](../RELEASE.md) for the authoritative procedure and
[the maintenance review](planning/GITHUB-MAINTENANCE-0.1.230.md) for branch/CI
recommendations. Preparation wording in older release notes, handoffs and test
records describes their recording date, not an active unpublished candidate.

## Current technical documentation

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — stable architecture entry point.
- [`architecture/`](architecture/) — detailed architecture contracts by domain.
- [`../TRANSLATING.md`](../TRANSLATING.md) — translation contribution guide and locale policy.
- [`email-import/README.md`](email-import/README.md) — current Email Import / Archive Import documentation index, transport-source model, transaction boundaries and historical-decision map.

## Active planning

- [`planning/ACTIVE-ROADMAP.md`](planning/ACTIVE-ROADMAP.md) — single entry point for current release follow-ups, product backlog and deferred decisions; use this before reading historical handoffs.
- [`planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md`](planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md) — approved backup/restore and document-register maintenance direction, including the active/missing-only lifecycle and rejected relink/SHA-recovery experiments.
- [`planning/GITHUB-MAINTENANCE-0.1.230.md`](planning/GITHUB-MAINTENANCE-0.1.230.md) — reviewed branch ancestry, workflow coverage and proposed GitHub presentation; recommendations require separate execution approval.

The architecture documents and automated verification describe the current intended contracts. Historical notes may contain experiments or policies that have since been superseded.

## Examples

- [`examples/`](examples/) — six synthetic records, two pedagogical native Bases and their README, installed/restored only through the explicit Settings action. The working `PDF Dokumentregister.base` is created only at the Vault root if missing; no register copy is installed in the example folder. Existing registers and historical copies remain user-owned.

## Releases

- [`releases/0.1.230.md`](releases/0.1.230.md) — latest published release notes, including retained local preparation/test evidence.
- [`releases/0.1.229.md`](releases/0.1.229.md), [`0.1.228`](releases/0.1.228.md) and [`0.1.227`](releases/0.1.227.md) — earlier release records.
- [`releases/0.1.226.md`](releases/0.1.226.md) — historical user-confirmed Community installation on 6 October 2026.
- [`releases/0.1.225.md`](releases/0.1.225.md) — historical release notes and practical verification scope.

## Testing

- [`testing/TEST-OBSERVATIONS.md`](testing/TEST-OBSERVATIONS.md) — current practical observations, deferred fixes and completed diagnostic trails.
- [`testing/BENCHMARK-TEST-0.1.203.md`](testing/BENCHMARK-TEST-0.1.203.md) — preserved benchmark procedure from the metadata startup/cache work.
- [`testing/IDENTITY-TRANSITION-0.1.224.md`](testing/IDENTITY-TRANSITION-0.1.224.md) — one-time plugin identity transition and regression test.

## Historical development material

- [`planning/0.1.226-COMMUNITY-RELEASE-CLEANUP.md`](planning/0.1.226-COMMUNITY-RELEASE-CLEANUP.md) — completed historical cleanup/release record.
- [`planning/HANDOFF-2026-10-07-0.1.227-DOCUMENT-REGISTER.md`](planning/HANDOFF-2026-10-07-0.1.227-DOCUMENT-REGISTER.md) — historical 0.1.227 handoff, superseded by the active roadmap and later releases.
- [`planning/HANDOFF-2026-10-06-POST-0.1.226.md`](planning/HANDOFF-2026-10-06-POST-0.1.226.md) — historical post-0.1.226 handoff, not current work instructions.
- [`history/DEVELOPMENT-NOTES.md`](history/DEVELOPMENT-NOTES.md) — the former root README, preserved because it contains detailed version-by-version development notes.
- [`history/MILESTONE.md`](history/MILESTONE.md) — milestone and baseline history from the metadata/document-register/i18n development sequence.
- [`history/i18n/I18N-AUDIT.md`](history/i18n/I18N-AUDIT.md) — historical i18n migration inventory.
- [`history/i18n/I18N-BUTTON-COMMAND-AUDIT-0.1.216.md`](history/i18n/I18N-BUTTON-COMMAND-AUDIT-0.1.216.md) — preserved command/button audit from 0.1.216.

## Reading historical files

Historical files are retained to preserve design reasoning and regression context. They are not automatically updated when later builds supersede an experiment or policy. When historical text conflicts with current architecture documentation, current source contracts, or automated verification, the current material wins.
