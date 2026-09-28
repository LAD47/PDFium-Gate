# Email Import — Decisions

This file records accepted design decisions for the PDFium Gate Email Import subproject.

The purpose is to keep the reasoning stable while still allowing deliberate revision when testing reveals a better solution.

## Accepted decisions

### D-001 — Email is an import source, not a permanent working document type

`.eml` and `.msg` are treated as source formats for import.

The normal user-facing working document is the generated PDF, which then uses the existing PDFium Gate feature set.

### D-002 — PDF is the primary visible archive document

After import, the PDF is the document the user normally reads, searches, copies from, highlights, categorizes, links to, and enriches with metadata.

### D-003 — Required visible PDF content

The generated PDF must include at least:

- Subject
- From
- To
- Cc
- Date and time
- Message body
- Attachment list

The exact visual layout is not yet frozen.

### D-004 — Original EML/MSG retention is optional

The user may choose whether the original source file is retained by PDFium Gate.

A retained source must not be placed in the normal visible document area of the vault.

The exact storage path is not yet frozen.

### D-005 — A retained original must be referenced by the PDF

If the original source is retained, the generated PDF must include source information that identifies the original source filename and provides a link back to the retained source.

The source SHA-256 should be included in the source-information relationship.

### D-006 — SHA-256 is calculated before conversion

SHA-256 is calculated over the original imported bytes before parsing, normalization, renaming, rendering, or PDF generation.

The hash identifies the imported source bytes, not the generated PDF.

### D-007 — SHA-256 is used for exact duplicate detection

Before completing a new import, PDFium Gate should check whether the same source SHA-256 is already registered.

A duplicate match should warn the user and identify the existing document when possible.

The duplicate warning should not automatically block a deliberate second import. The user should be able to open the existing document, cancel, or continue with another import.

### D-008 — Message-ID is retained when available

When an email contains a `Message-ID`, PDFium Gate should retain it as technical metadata.

This may later support softer duplicate detection for the same logical email when two source exports are not byte-identical.

A Message-ID match is not initially treated as proof that source bytes are identical.

### D-009 — EML comes before MSG

The first parser implementation should target EML.

MSG support is added later against the same canonical model so Outlook-specific complexity remains isolated.

### D-010 — Both source formats produce one canonical internal model

EML and MSG parser-specific structures must be normalized into a shared internal Email Document representation.

Downstream rendering, integrity, storage, PDF generation, and integration code must not depend on the source parser's native object shape.

### D-011 — Do not reimplement MIME parsing unnecessarily

EML parsing should use a mature parser library rather than implementing MIME, transfer encoding, multipart handling, character decoding, and attachment parsing directly in PDFium Gate.

The current likely foundation is `mailparser`.

### D-012 — PDF generation should use Chromium/Electron

The preferred conversion path is controlled HTML rendered through the Chromium/Electron environment already available in Obsidian Desktop.

The legacy `html-pdf` / PhantomJS-style conversion path from the reference Eml-Parser project is not part of the intended architecture.

### D-013 — Rendering is a separate module from parsing

Parsers extract and normalize information.

A dedicated renderer decides how the email appears in the PDF.

This allows layout and security policy to evolve without changing source parsing.

### D-014 — Source HTML is not trusted as-is

HTML email must pass through a controlled rendering/sanitization policy before it is displayed or converted to PDF.

External resources must not be contacted merely because an archived email is opened or converted. Remote images/tracking resources should therefore be blocked or neutralized by default unless a later explicit policy says otherwise.

### D-015 — Attachments are listed in the email PDF

The email PDF includes a list of attachments.

Attachments are not automatically flattened into the message PDF as document pages without a separate explicit decision.

### D-016 — Existing PDFium Gate features are reused

Email Import must remain additive.

Once generated, the PDF should use the existing PDFium Gate workflow rather than creating parallel implementations for selection, copy, highlighting, categories, metadata, DocumentInfo, document register, links, and related PDF behavior.

### D-017 — Email Import is modular from the start

The feature should be implemented as a main module with bounded submodules for orchestration, parsers, canonical model, integrity/duplicate detection, rendering/PDF generation, optional source retention, and attachments.

Avoid one large `email-import.js` implementation.

### D-018 — Existing PDF behavior is a regression boundary

No Email Import milestone is accepted if it breaks existing PDF behavior.

Practical Obsidian regression testing remains required in addition to automated checks.

### D-019 — Permanent test fixtures must be synthetic

Repository test messages should use synthetic/non-private data.

Private real-world email may be used locally for exploratory testing when appropriate but should not become permanent repository fixtures.

### D-020 — Email HTML is sanitized into a controlled document shell

The renderer must never use source email HTML as the outer document.

PDFium Gate generates its own HTML shell and sanitizes the message-body fragment with a mature allowlist-based sanitizer. The initial implementation uses `sanitize-html` rather than implementing an HTML sanitizer from scratch.

Source scripts, styles, event-handler attributes, forms, frames, and other active/unsafe constructs are not retained as executable content.

Remote image URLs are not loaded. CID images may be embedded only when they resolve to already-decoded canonical attachment bytes, in which case the renderer creates an internal `data:` URL itself.

The generated document also carries a restrictive Content Security Policy as defense in depth so rendering/PDF generation does not contact external resources merely because an archived message contains remote content.

Ordinary `http`, `https`, and `mailto` hyperlinks may remain as links because they do not need to be fetched during rendering. This does not permit remote images or other automatic subresource loading.

### D-021 — Chromium PDF generation crosses an explicit Electron main-process boundary

The safe HTML renderer and canonical email model must not depend directly on Electron window APIs.

Email Import uses a small printer adapter around Electron's main-process `BrowserWindow` / `webContents.printToPDF()` APIs. The core PDF generator accepts only the controlled HTML produced by the safe renderer and delegates printing through that adapter.

The hidden print window is created with JavaScript disabled, Node integration disabled, context isolation enabled, sandbox enabled, web security enabled, insecure content disabled, and new-window creation denied.

This boundary allows the later Obsidian integration to connect PDF generation through PDFium Gate's existing main-process bridge without moving parser, duplicate-detection, or renderer responsibilities into the bridge.

Generated printer output is validated as PDF bytes before it is returned to the import workflow.

The exact PDF page format and visual layout remain configurable implementation details rather than being frozen by this decision.

### D-022 — Retained original sources use SHA-addressed hidden vault storage

When source retention is enabled, the exact original source bytes are stored under the hidden plugin-owned root `.pdf-metadata/email-sources/`.

The canonical retained path is:

```text
.pdf-metadata/email-sources/<first-two-sha-chars>/<full-sha256>.<eml|msg>
```

The physical storage name therefore derives from the already-calculated exact-source SHA-256 rather than from the user-provided filename. The original filename remains preserved separately as documentary metadata and is shown in the generated PDF source-reference section.

The retained file must be verified byte-for-byte against the imported source after writing. If the canonical SHA-addressed file already exists, it is reused only when its bytes are exactly identical. Any mismatch at that path is treated as an integrity/collision error and fails closed rather than overwriting the existing file.

When retention is disabled, Email Import does not create a retained-source file and the canonical model remains `retained: false` with `retainedPath: null`.

A retained-source PDF section shows the original filename, source SHA-256, and retained vault-relative path. The clickable link is generated by PDFium Gate, not accepted from source email HTML.

The initial link mechanism uses Obsidian's `obsidian://open` URI with an explicit vault name/ID plus the vault-relative retained path. This avoids embedding machine-specific absolute filesystem paths in the generated PDF. Source-supplied HTML is not allowed to inject `obsidian:` links.

The source SHA-256 is shown visibly in the PDF only when an original source is retained; exact-source identity may still be persisted as technical metadata when retention is disabled.

### D-023 — Attachment policy separates inline resources, user attachments, and PDF candidates

Attachment classification is derived from the Canonical Email Document and does not add parser-specific fields to the canonical schema.

Inline/CID resources remain in `document.attachments` with their decoded bytes, SHA-256, MIME metadata, disposition, and Content-ID, but they are treated as supporting message resources rather than ordinary user attachments when they are marked inline/related or referenced through a `cid:` URL in the HTML body.

The generated email PDF lists ordinary user attachments separately. Inline resources used to render the message are not repeated as normal attachments; the PDF records the number of embedded inline resources so their presence is not silently hidden.

PDF attachments are identified as candidates for later independent PDFium Gate import when PDF evidence exists in the MIME type, decoded payload signature, or filename. This classification does **not** automatically import, flatten, or create separate vault documents.

Attachment extraction is explicit rather than automatic. Before an attachment is written, its available decoded payload bytes are checked against canonical size and SHA-256. The destination filename is sanitized for cross-platform filesystem safety and cannot escape the caller-provided destination root.

Extraction never silently overwrites a different existing file. If the target already contains exactly the same bytes, it may be reused. If the target contains different bytes, extraction fails closed so the future UI/import controller can ask the user what to do.

This preserves attachment integrity while postponing user-facing choices such as where extracted files should live, whether a PDF attachment should become a separately registered PDFium Gate document, and how relationships between the email PDF and extracted/imported attachments should be represented.

### D-024 — MSG parsing uses a dedicated Outlook parser but preserves the same canonical boundary

MSG parsing uses the pinned `@kenjiuno/msgreader` 1.28.0 package for Outlook Compound File Binary Format / MAPI decoding rather than implementing the MSG container and property system directly in PDFium Gate.

The MSG parser calculates `source.sha256` over the exact original MSG bytes before normalization and emits the same Canonical Email Document v1 used by EML. Downstream duplicate detection, attachment policy, rendering, source retention, and PDF generation therefore remain source-format independent.

Native MSG properties are preferred for sender and recipient information when available. Outlook transport headers may be parsed through the existing mature RFC-mail parser to recover or supplement fields such as `Reply-To`, `In-Reply-To`, `References`, raw Date, Message-ID, or addressing fallback. Outlook-specific MAPI/property details do not leave the MSG parser boundary.

MSG attachment payloads are recovered through the MSG reader API and receive the same decoded-payload size and SHA-256 treatment as EML attachments. CID/inline resources and PDF candidates are classified later by the common attachment-policy module rather than by MSG-specific downstream logic.

Unsupported or malformed MSG bytes fail closed instead of producing a guessed canonical document.

Permanent MSG verification does not rely on private or third-party real-world mail. Test code deterministically builds genuine synthetic CFBF/MSG byte streams with Unicode, recipients, transport headers, dates, a PDF attachment, and a CID image, then sends those bytes through the real third-party parser. The synthetic fixture builder may use the pinned library's CFBF burner as test-only infrastructure; production parsing does not depend on the burner.

### D-025 — Email provenance lives in the existing pdf/document metadata record

A generated email PDF is registered as an ordinary PDFium Gate document with `filemeta_type: pdf` and `filemeta_profile: document`. Email origin does not create a separate document type, profile, metadata database, or Document Register.

Technical email provenance is stored as additional properties in the same Markdown record under the plugin-owned `email_import_*` namespace. The initial technical projection includes exact source format and SHA-256, original filename and byte size, source-retention state/path, message identity when available, and attachment counts.

Technical provenance is deliberately separate from user-editable schema fields. Standard DocumentInfo and the standard Document Register remain schema-driven, so `email_import_*` properties do not become default visible/editable columns. A future advanced/custom Base may query them explicitly without changing the normal register.

Email Import may suggest initial values only for compatible user fields that already exist. Initial semantic mappings are document date, document time, and sender. Stable factory field UUIDs are preferred so a user can rename the property without breaking the mapping; canonical factory property names are fallback identifiers. Email Import never creates missing user fields, never guesses unrelated custom-field mappings, and does not automatically set `document_type`.

Suggested values must satisfy the active field's current type and constraints. For date/time, a parseable raw source `Date` header preserves the source wall-clock value rather than silently converting the displayed time to UTC. Canonical ISO/UTC is used only as fallback when no reliable raw wall clock is available.

The `email_import_*` namespace is reserved by Email Import policy. If the user schema already uses that namespace, metadata projection fails closed rather than overwriting a user-owned field.

Email provenance is attached only when the generated PDF has no existing document record. If the target path is already registered, Email Import fails closed instead of silently repurposing an existing record. Generated-PDF naming and path-collision handling must therefore be resolved before metadata registration.

The intended write boundary is the existing `saveDocumentMetadataRecordValues` operation. On a fresh generated PDF, its current lazy-create behavior can persist both technical provenance and compatible initial user values in the ordinary Markdown record. Later normal DocumentInfo edits preserve the extra provenance because schema-field updates do not rewrite unrelated frontmatter properties.

## Open questions

The following are intentionally not yet frozen:

1. Default user setting for retaining or discarding the original source.
2. Exact visual design of the email PDF.
3. Whether `Message-ID` should also be visible in the PDF or remain technical metadata only by default.
4. User-facing destination rules and relationship metadata for explicitly extracted/imported attachments.
5. Naming rules for generated PDF files.
6. Collision behavior when a generated PDF filename already exists.
7. Batch-import UX and duplicate summary behavior.
8. How malformed or partially parseable EML/MSG files should be represented to the user.
9. Whether users should be able to configure semantic mappings from email fields to arbitrary custom metadata fields beyond the initial factory-UUID/property fallback mapping.

## Change rule

When an accepted decision changes, do not silently rewrite history.

Update the relevant decision with a clear superseding note or add a new decision that records what changed and why. This file is intended to preserve the project's architectural memory as implementation and testing reveal new possibilities.
