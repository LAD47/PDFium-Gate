# Documentation

This directory contains active architecture documentation, focused test notes, canonical examples, and preserved project history.

## Current technical documentation

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — stable architecture entry point.
- [`architecture/`](architecture/) — detailed architecture contracts by domain.
- [`../TRANSLATING.md`](../TRANSLATING.md) — translation contribution guide and locale policy.
- [`email-import/README.md`](email-import/README.md) — current Email Import / Archive Import documentation index, transport-source model, transaction boundaries and historical-decision map.

## Active planning

- [`planning/ACTIVE-ROADMAP.md`](planning/ACTIVE-ROADMAP.md) — single entry point for current release follow-ups, product backlog and deferred decisions; use this before reading historical handoffs.
- [`planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md`](planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md) — approved backup/restore and document-register maintenance direction, including the active/missing-only lifecycle and rejected relink/SHA-recovery experiments.
- [`planning/0.1.226-COMMUNITY-RELEASE-CLEANUP.md`](planning/0.1.226-COMMUNITY-RELEASE-CLEANUP.md) — completed 0.1.226 Community release cleanup and release evidence; historical/completed, not an active TODO list.
- [`planning/HANDOFF-2026-10-07-0.1.227-DOCUMENT-REGISTER.md`](planning/HANDOFF-2026-10-07-0.1.227-DOCUMENT-REGISTER.md) — current handoff for continuing the 0.1.227 candidate after the practically verified Document Register redesign/maintenance work.
- [`planning/HANDOFF-2026-10-06-POST-0.1.226.md`](planning/HANDOFF-2026-10-06-POST-0.1.226.md) — historical handoff immediately after the user-confirmed 0.1.226 release; superseded for current 0.1.227 work by the 2026-10-07 handoff.

The architecture documents and automated verification describe the current intended contracts. Historical notes may contain experiments or policies that have since been superseded.

## Examples

- [`examples/`](examples/) — canonical Markdown/YAML document-record examples and a native Obsidian Bases example. The plugin copies the same example set once into `Examples-Obsidian-PDFium-Gate/` in a user's Vault.

## Releases

- [`releases/0.1.226.md`](releases/0.1.226.md) — current user-confirmed Community Plugins release baseline.
- [`releases/0.1.225.md`](releases/0.1.225.md) — historical release notes and practical verification scope for 0.1.225.

## Testing

- [`testing/TEST-OBSERVATIONS.md`](testing/TEST-OBSERVATIONS.md) — current practical observations, deferred fixes and completed diagnostic trails.
- [`testing/BENCHMARK-TEST-0.1.203.md`](testing/BENCHMARK-TEST-0.1.203.md) — preserved benchmark procedure from the metadata startup/cache work.\n- [`testing/IDENTITY-TRANSITION-0.1.224.md`](testing/IDENTITY-TRANSITION-0.1.224.md) — one-time plugin identity transition and regression test.

## Historical development material

- [`history/DEVELOPMENT-NOTES.md`](history/DEVELOPMENT-NOTES.md) — the former root README, preserved because it contains detailed version-by-version development notes.
- [`history/MILESTONE.md`](history/MILESTONE.md) — milestone and baseline history from the metadata/document-register/i18n development sequence.
- [`history/i18n/I18N-AUDIT.md`](history/i18n/I18N-AUDIT.md) — historical i18n migration inventory.
- [`history/i18n/I18N-BUTTON-COMMAND-AUDIT-0.1.216.md`](history/i18n/I18N-BUTTON-COMMAND-AUDIT-0.1.216.md) — preserved command/button audit from 0.1.216.

## Reading historical files

Historical files are retained to preserve design reasoning and regression context. They are not automatically updated when later builds supersede an experiment or policy. When historical text conflicts with current architecture documentation, current source contracts, or automated verification, the current material wins.
