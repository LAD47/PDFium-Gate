# PDFium Gate — Email Import

This directory is the design and working documentation for the Email Import subproject in PDFium Gate.

The goal is to let a user drag or otherwise import an `.eml` or `.msg` message into Obsidian and turn it into a stable PDF document that can use the existing PDFium Gate workflow: reading, copying text, highlighting, categorization, metadata, document information, search, and links.

Email is treated as an **import source**, not as a new permanent working document type.

## Product model

The normal user-facing result of an email import is a PDF.

The PDF must include at least:

- Subject
- From
- To
- Cc
- Date and time
- Message body
- Attachment list

The original `.eml` / `.msg` file is not required to remain visible in the vault.

The import flow may optionally retain the original source file in a non-visible source area. If the original source is retained, the generated PDF must identify the source filename and provide a link back to that retained source. The source SHA-256 should also be recorded.

## Integrity and duplicate detection

Before conversion, PDFium Gate calculates SHA-256 over the original source bytes.

The SHA-256 value serves two purposes:

1. integrity evidence for a retained original source;
2. exact duplicate detection when the same source file is imported again.

An exact duplicate should produce a warning and offer the user a choice instead of silently creating another copy or unconditionally blocking the import.

When available, the email `Message-ID` should also be retained as technical metadata. It may later support detection of the same logical message when two exported files are not byte-identical.

Attachments whose decoded payload bytes are available also receive their own SHA-256. This allows tests and later extraction/import code to verify that an attachment recovered from an email is byte-identical to the embedded payload.

## Implementation direction

The Email Import feature is designed as a main module with small submodules rather than one large implementation file.

Planned responsibilities include:

- import orchestration;
- EML parsing;
- MSG parsing;
- canonical email document model;
- SHA-256 and duplicate detection;
- safe HTML normalization/rendering;
- Chromium/Electron PDF generation;
- optional source retention;
- attachment handling.

EML support should be implemented and tested before MSG support. Both formats must eventually produce the same canonical internal email model.

## Rendering and PDF generation

The intended direction is to render the normalized email using the Chromium/Electron environment already available to Obsidian Desktop and generate the PDF from that controlled representation.

The legacy `html-pdf` conversion path from the reference Eml-Parser project is not part of the intended PDFium Gate architecture.

## Development method

Development takes place on the `feature/email-import` branch until the feature reaches an explicitly tested integration point.

The project follows these principles:

- document architecture before runtime implementation;
- keep existing PDF behavior unchanged;
- add one bounded capability at a time;
- use synthetic test messages rather than private mail as permanent fixtures;
- combine automated checks with explicit practical Obsidian testing;
- record design changes in `DECISIONS.md` as the work evolves.

## Documents

- `ARCHITECTURE.md` — module boundaries, data flow, and internal model direction.
- `DECISIONS.md` — accepted decisions and deliberately open questions.
- `EMAIL-DOCUMENT-MODEL.md` — Canonical Email Document v1 contract.
- `ATTACHMENT-INTEGRITY.md` — attachment-level SHA-256 and fixture integrity policy.

Synthetic permanent parser fixtures live under `test/fixtures/email/`.
