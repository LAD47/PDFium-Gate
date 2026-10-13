# PDFium Gate — Email Import

This directory contains the active design, architecture, integrity, metadata and historical decision material for **Email Import** and its integration with generic **Archive Import**.

## Current product model

Email is an **import source**, not a permanent working document type.

For a normal successful import:

```text
EML / MSG
   |
   +--> exact source SHA-256 / duplicate lookup
   +--> parse canonical email document
   +--> preflight complete attachment plan
   +--> generate email PDF
   +--> create one dedicated EPOST bundle folder for parent PDF and attachments
   +--> import direct attachments + flattened ZIP members
   +--> register PDFs and persist provenance/relationships
   +--> verify durable writes
   +--> remove staging EML/MSG when safe
```

The generated PDF is the user-facing email document. Its attachment section lists the actual imported files. ZIP filenames may appear as provenance/group headings, but ZIP is a transport container rather than a normal retained vault document.

New EML/MSG imports use a **single self-contained email folder**, named with date, `EPOST-` and subject:

```text
00_Innboks/
└── 2026-10-08 - EPOST- Innsyn juridisk vurdering Fredrikstad kommune/
    ├── 2026-10-08 - EPOST- Innsyn juridisk vurdering Fredrikstad kommune.pdf
    ├── vedtak.pdf
    ├── rapport.pdf
    └── notat.txt
```

The example is Norwegian, but the literal `EPOST-` folder marker is intentionally stable across UI languages. Other field labels remain localized. If a bundle folder already exists, both the folder name and PDF name receive the same suffix, such as ` (2)`.

Email ZIP members are flattened into the same EPOST folder as the email PDF. Original archive member paths, archive filename and archive SHA-256 remain technical provenance. Manual Archive Import is intentionally different: it preserves the ZIP directory structure.

Exact EML/MSG retention remains available as an advanced opt-in setting and is off by default.

## Current source-of-truth documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — current Email Import / Archive Import architecture and transaction boundaries.
- [DECISIONS.md](DECISIONS.md) — accepted decisions, superseding notes and remaining open questions.
- [ATTACHMENT-RELATIONSHIPS.md](ATTACHMENT-RELATIONSHIPS.md) — current parent/child/archive relationship model and transport-source policy.
- [ATTACHMENT-INTEGRITY.md](ATTACHMENT-INTEGRITY.md) — attachment byte-integrity and safety boundary.
- [ATTACHMENT-PDF-LINKS.md](ATTACHMENT-PDF-LINKS.md) — current link model inside generated email PDFs.
- [EMAIL-DOCUMENT-MODEL.md](EMAIL-DOCUMENT-MODEL.md) — Canonical Email Document v1 runtime contract.
- [METADATA-INTEGRATION.md](METADATA-INTEGRATION.md) — document-record/provenance integration.
- [RUNTIME-INTEGRATION.md](RUNTIME-INTEGRATION.md) — current Obsidian/runtime integration flow.
- [REFACTORING-AND-SHARED-SERVICES.md](REFACTORING-AND-SHARED-SERVICES.md) — earlier refactor rationale; retained for architectural history and reusable-service reasoning.

## Historical documents

These files preserve why earlier designs were tried and rejected. They are **not current implementation instructions**:

- [HANDOFF-2026-09-29.md](HANDOFF-2026-09-29.md)
- [DECISIONS-2026-09-29.md](DECISIONS-2026-09-29.md)
- [DECISIONS-2026-09-30.md](DECISIONS-2026-09-30.md)

When a historical note conflicts with the current documents above, the current architecture, current `DECISIONS.md`, source code and automated verification win.

## Practical status

The replacement transport-source model has been practically verified for:

- automatic EML import and safe staging cleanup;
- direct PDF attachments;
- multiple ZIP attachments in one email;
- one self-contained EPOST folder containing the email PDF and attachments;
- source ZIP removal for successful email imports;
- complete attachment lists in generated email PDFs;
- direct links from the email PDF to imported PDFs;
- DocumentInfo provenance back to the parent email and original ZIP identity.

The earlier **flat sibling attachment layout** was practically confirmed on 2026-10-06, including direct PDF links and preserved ZIP provenance without ZIP-derived user-facing subfolders. Manual Archive Import startup/focus reconciliation for ZIPs copied with the operating-system file manager was also practically confirmed on 2026-10-06. Failed-ZIP keep/delete behavior remains covered by automated regression; broader real-world malformed/corrupt/password-protected ZIP testing remains useful but is not an unresolved 0.1.226 release gate.

## Verification

Run the complete repository check with:

```bash
npm run check
```

The Email Import workflow additionally runs parser, renderer, duplicate, attachment, ZIP, link, Electron PDF generation and runtime-integration checks in GitHub Actions.

## Current layout test status (October 12, 2026)

The source ZIP relationship and parent-link read-back fixes were practically confirmed against a previously failing 12-file EML/ZIP import. The consolidated EPOST folder layout is a **new, unmerged test-branch candidate** (`feature/0.1.228-email-bundles`) with functionality previously confirmed by the owner and covered by passing automated controls. Whole-candidate practical testing is not exhaustive; no additional manual repetition is required in this preparation. Existing imports retain their old file paths; no automatic migration or moves are performed.

## Windows File Explorer / offline import (October 12, 2026 candidate)

New EML/MSG files copied into the vault through Windows File Explorer are handled in three ways:

1. Vault `create` events while Obsidian is running, including drag/drop.
2. A startup reconciliation after Obsidian loads, for files added while the application was closed.
3. Reconciliation when the Obsidian window regains focus, for files missed by vault create events.

The plugin keeps a **local-only** per-path size/mtime inventory in its existing plugin settings data. The **first run** seeds that inventory with existing EML/MSG files without importing them, to avoid unexpected mass import of historical emails. Subsequent appearances or changed file signatures are processed through the existing serialized staging queue. Failed or cancelled files are not retried at every focus event; a changed file signature or a new create event permits a new attempt. Disabling automatic email import prevents reconciliation imports as well.

The source EML/MSG is removed only after all required attachment/link operations succeed and the staging bytes still match the original. The new EPOST bundle naming is the same regardless of whether the source arrived via drag/drop or Explorer. No automatic migration of older imported PDFs or folders takes place.

**Practical tests:** run a direct drag/drop import; copy a new EML while Obsidian runs, then return focus; close Obsidian, copy a new MSG/EML to `00_Innboks`, restart; repeat with a broken source and verify no repeated dialog on focus; confirm old unrelated EML/MSG files remain untouched. Do not publish until verified in Obsidian.
