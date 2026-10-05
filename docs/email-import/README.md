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
   +--> create one localized sibling attachment folder
   +--> import direct attachments + flattened ZIP members
   +--> register PDFs and persist provenance/relationships
   +--> verify durable writes
   +--> remove staging EML/MSG when safe
```

The generated PDF is the user-facing email document. Its attachment section lists the actual imported files. ZIP filenames may appear as provenance/group headings, but ZIP is a transport container rather than a normal retained vault document.

Norwegian Bokmål uses a sibling folder suffix such as:

```text
2026-10-05 - Subject.pdf
2026-10-05 - Subject Vedlegg/
```

Other supported UI languages use their localized equivalent.

Email ZIP members are flattened into the one email attachment folder. Original archive member paths, archive filename and archive SHA-256 remain technical provenance. Manual Archive Import is intentionally different: it preserves the ZIP directory structure.

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
- one localized email attachment folder;
- source ZIP removal for successful email imports;
- complete attachment lists in generated email PDFs;
- direct links from the email PDF to imported PDFs;
- DocumentInfo provenance back to the parent email and original ZIP identity.

A final practical confirmation is still required for the latest **flat email attachment layout** after the most recent refinement that removes ZIP-derived subfolders. Manual Archive Import startup/focus reconciliation and failed-ZIP keep/delete UX also remain release-gate practical checks.

## Verification

Run the complete repository check with:

```bash
npm run check
```

The Email Import workflow additionally runs parser, renderer, duplicate, attachment, ZIP, link, Electron PDF generation and runtime-integration checks in GitHub Actions.
