# Email Import attachment relationships

## Purpose

This document records the current architecture and practical findings for relationships between an imported email PDF and attachments extracted from the retained email source.

The goal is to use Obsidian's native link system wherever possible instead of building a parallel path-tracking database in PDFium Gate.

## Current practical behavior

Automatic drag-and-drop email import is practically verified for the current prototype:

- a dropped EML/MSG staging file is processed automatically when the setting is enabled;
- the exact original source is retained in hidden SHA-addressed storage;
- the email PDF is created in the chosen folder;
- ordinary real attachments are extracted to the same folder when attachment extraction is enabled;
- inline/CID resources are not exported as ordinary visible attachments;
- verified PDF attachments become normal registered PDFium Gate documents;
- ordinary non-PDF attachments such as JPG and DOCX remain normal vault files and do not receive their own PDFium Gate document record;
- multiple dropped emails are processed sequentially without a modal;
- exact duplicate drag/drop opens the existing email PDF and does not export duplicate attachment copies.

Practical test 1-11 for this automatic flow was reported OK on 2026-09-29.

## ZIP attachment relationship rule

A ZIP source attachment remains a single source-level attachment in the immutable email PDF and in the parent metadata relationship block. Email Import exports and links the original ZIP only.

ZIP inspection, user policy, extraction, PDF registration and archive-member relationships are owned by the generic Archive Import module. Email Import does not unpack ZIP files itself.

Expanded ZIP members are placed below a dedicated ZIP-named subfolder. They are not appended to the parent email's source-attachment link block, because doing so would destroy the one-to-one correspondence between the source email attachment list and the live relationship block.

PDF files found inside the ZIP become normal PDFium Gate documents through Archive Import. They receive generic PDF records plus Archive Relationship links to the source ZIP and the other members of the same archive. They are not represented as direct email attachments and therefore do not receive direct `email_import_attachment_*` provenance merely because they were nested inside a ZIP.

The relationship chain is intentionally explicit:

```text
email PDF -> original ZIP -> extracted archive members
```

For PDFs, Archive Relationship data is presented in DocumentInfo so users do not need to inspect the technical File Metadata Markdown record.

Nested ZIP files are still non-recursive in this first implementation.

## Native Obsidian relationship prototype

The prototype at branch commit `bb7eea33235127754ec393d1f1f4ebe328e4f51c` writes a plugin-managed block into the existing Markdown File Metadata record for the parent email PDF:

```markdown
<!-- pdfium-gate:email-attachments:start -->
- [[Cases/Email/rapport.pdf]]
- [[Cases/Email/bilde.jpg]]
- [[Cases/Email/brev.docx]]
<!-- pdfium-gate:email-attachments:end -->
```

The block is deliberately stored in the Markdown body rather than in the user metadata schema or a new database.

Reasons:

- the links are genuine Obsidian wikilinks;
- Obsidian can resolve and maintain the relationship;
- PDFium Gate does not need a separate attachment-path database;
- technical attachment relationships stay separate from user-editable metadata fields;
- the existing File Metadata record remains the parent email PDF's technical relationship document.

The block is bounded by stable HTML comments so PDFium Gate can replace only its own generated relationship block without rewriting unrelated Markdown content.

## Practical evidence

The first practical test confirmed that when an extracted attachment is renamed inside Obsidian, the link in the parent email PDF's metadata record is updated automatically.

This is strong evidence that Obsidian can own the rename relationship and that PDFium Gate does not need its own rename synchronization for ordinary attachment links.

## Important finding: Obsidian may shorten the textual link

The prototype already writes the full vault-relative target path when it creates the relationship block.

However, after Obsidian maintained a renamed link, the user observed links such as:

```markdown
- [[Ekte Rått Ungt 1.docx]]
- [[Howard Moskowitz3.jpg]]
```

instead of a visible full path.

Therefore the next problem is not simply to make PDFium Gate write a full path initially. PDFium Gate already does that. Obsidian's own automatic link maintenance may rewrite the textual representation according to its link-format rules and reduce an unambiguous target to a basename.

A short wikilink may still resolve correctly after a move, but it is less transparent to a user inspecting the relationship record. The project now prefers a representation where the user can tell which physical vault document is intended without ambiguity.

## Next design goal

Preserve the advantages of native Obsidian links while making the relationship visibly unambiguous.

The next prototype should investigate a narrow solution with these constraints:

1. Obsidian remains the authoritative link resolver and should continue to update relationships on rename/move.
2. PDFium Gate must not introduce a parallel path database merely to mirror the link target.
3. The user should be able to inspect the relationship and identify the intended attachment unambiguously, preferably with a full vault-relative path.
4. Duplicate filenames in different folders must not create silent ambiguity.
5. The solution must not change global Obsidian link-format settings without explicit user action.
6. Any PDFium Gate rewrite performed after rename/move must be narrowly scoped to the plugin-managed attachment block and must not interfere with unrelated user links.

Before implementing a custom rewrite hook, test whether an Obsidian-supported link representation or API can preserve an explicit full-path target while retaining automatic link maintenance.

## Move and delete tests still required

Rename has been practically confirmed.

The following still require explicit practical verification after the full-path/visibility question is resolved:

- moving DOCX/JPG/PDF attachments between folders inside Obsidian;
- clicking the relationship after a move and confirming it resolves to the intended file;
- duplicate filename behavior across two folders;
- the exact Obsidian warning/UX when a linked attachment is deleted;
- backlink visibility for non-PDF binary attachments when `Show all file types` is enabled.

## Source-of-truth boundary

The retained `.eml`/`.msg` remains the authoritative immutable source for original attachment bytes, original filename, MIME metadata and attachment SHA-256.

The native Obsidian wikilink relationship answers a different question: where is the exported attachment in the vault now?

PDF attachments additionally keep their existing PDFium Gate child-record provenance. Ordinary non-PDF attachments remain normal vault files unless a later separate document-type decision changes that policy.
