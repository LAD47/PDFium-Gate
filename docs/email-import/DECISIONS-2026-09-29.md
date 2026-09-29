# Email Import - decisions addendum 2026-09-29

This file extends `DECISIONS.md` with decisions reached after the modular refactor and practical drag-and-drop work. It does not rewrite earlier decision history.

## D-031 - Ordinary non-PDF attachments are exported as normal vault files

The former D-031 placeholder is now resolved for the current Email Import direction.

When automatic attachment extraction is enabled, ordinary real attachments are exported from the verified retained email source into the same vault folder as the generated email PDF.

Rules:

- inline/CID resources remain supporting message resources and are not exported as ordinary visible files;
- decoded attachment bytes are verified against canonical size/SHA information before writing;
- filenames are sanitized and collisions receive deterministic suffixes rather than overwriting an existing different file;
- ordinary non-PDF attachments such as JPG, DOCX and XLSX remain normal vault files and do not automatically receive a PDFium Gate document metadata record;
- verified PDF attachments become normal registered PDFium Gate PDF documents with their existing technical parent/source/attachment provenance;
- a failure for one attachment does not require successful unrelated attachment exports to be deleted;
- the retained original EML/MSG remains the authoritative immutable source from which attachments can be reconstructed later.

This behavior was practically verified in Obsidian as part of the automatic drag-and-drop test on 2026-09-29.

## D-032 - Drag-and-drop import is automatic and settings-driven

For normal Thunderbird-to-Obsidian drag-and-drop, the intended UX is automatic rather than modal.

Current settings:

- automatic email import on drag-and-drop, default enabled;
- automatic extraction of ordinary email attachments, default enabled.

The dropped `.eml`/`.msg` file is treated as a temporary staging file. A unique import retains the exact original in hidden SHA-addressed storage, creates/registers the email PDF, optionally exports attachments, verifies staging cleanup safety, and removes the staging file.

An exact duplicate opens the existing email PDF, does not regenerate the PDF, does not re-export attachments, and removes the staging file only after the existing retained source is loaded and verified to be byte-identical.

Multiple create events are serialized by a queue so several emails can be dropped together without multiple modal dialogs or overlapping import writes. The current simple sequential queue is sufficient for the verified prototype; a separate batch abstraction is deferred until practical evidence requires it.

The old Command Palette import remains available as an explicit/manual fallback and may keep its review modal.

Practical test points 1-11, including the first multi-email test, were reported OK on 2026-09-29.

## D-033 - Attachment relationships should use native Obsidian wikilinks

The parent email PDF's existing Markdown File Metadata record is the preferred home for links to exported attachments.

PDFium Gate should not create a parallel attachment-path database solely to track rename/move operations that Obsidian can already maintain through native links.

The current prototype writes a bounded plugin-managed Markdown body block:

```markdown
<!-- pdfium-gate:email-attachments:start -->
- [[Cases/Email/report.pdf]]
- [[Cases/Email/photo.jpg]]
- [[Cases/Email/letter.docx]]
<!-- pdfium-gate:email-attachments:end -->
```

The relationship block is technical plugin-owned content, not a user metadata-schema field.

Practical testing confirmed that renaming an extracted attachment inside Obsidian causes Obsidian to update the wikilink automatically.

### Full-path visibility remains the next implementation problem

The prototype already writes a full vault-relative target path when the block is first created. Practical testing then showed that Obsidian may rewrite the textual wikilink to the shortest unambiguous form during automatic link maintenance, for example:

```markdown
[[Ekte Ratt Ungt 1.docx]]
```

This may still resolve correctly, but it is less transparent to a user inspecting the relationship record.

The accepted design goal is therefore:

- keep Obsidian as the authoritative native link resolver;
- make the intended target visibly unambiguous to the user, preferably with full vault-relative path information;
- do not change global Obsidian link-format settings silently;
- do not introduce a parallel relationship database merely to display a path;
- if PDFium Gate must normalize its own generated link block after rename/move, that behavior must be narrowly scoped to the plugin-managed block.

The exact implementation for preserving/representing full-path visibility is intentionally not frozen until the next focused experiment determines what Obsidian's current link APIs and rewrite behavior allow.

## Remaining focused tests

After the full-path visibility prototype is chosen, practical testing must cover:

1. move a DOCX/JPG/PDF attachment between folders inside Obsidian;
2. confirm the native relationship still opens the correct target after the move;
3. create two files with the same basename in different folders and verify ambiguity is handled safely;
4. delete a linked attachment and record the exact Obsidian warning/behavior;
5. inspect backlinks/linked mentions for non-PDF binary attachments where supported.

## Boundary that remains unchanged

The retained EML/MSG source continues to own documentary/original attachment facts and exact bytes. Native Obsidian links represent the current vault relationship to an exported attachment. PDF attachment child records retain their separate technical provenance as normal PDFium Gate documents.
