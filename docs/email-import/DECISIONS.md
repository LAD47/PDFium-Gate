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

**Superseded in part by D-027:** the retained source must still be identified in the PDF, but a clickable source-open link is no longer required or generated.

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

**Superseded in part by D-027:** the SHA-addressed storage, visible source information, and technical provenance remain authoritative, but the PDF no longer contains a retained-source open link.

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

### D-026 — The first runtime integration is explicit, self-contained, and preserves existing boundaries

The first user-facing runtime integration is an explicit Obsidian command rather than drag-and-drop or batch import. The command opens a main-process file picker restricted to `.eml` and `.msg`, performs exact SHA-256 duplicate lookup before parsing, parses to Canonical Email Document v1, and presents a review/decision modal before durable writes.

The review step shows the source/message summary, duplicate information, and an editable proposed PDF path. Source retention has no implicit default in this first integration: the user must explicitly choose either to retain or not retain the original source on each import. A later configurable default remains a separate product decision.

The initial suggested PDF location is `Email Imports/` with a filesystem-safe date/subject filename and collision suffix when necessary. Because the path is editable before import, this is an implementation default rather than a frozen long-term naming rule.

Email Import's mature parser/sanitizer dependencies are bundled into the generated `main.js` at build time. The installed plugin remains self-contained and does not require users to install or retain a separate `node_modules` tree. Runtime verification explicitly rejects external `mailparser`, `sanitize-html`, or `@kenjiuno/msgreader` package requires in the generated plugin.

Electron-only operations remain behind the existing renderer-to-main transport. Source selection and controlled HTML-to-PDF printing are implemented through a dedicated main-process Email Import adapter; the feature itself does not bypass the Main Bridge architecture to access Electron globals directly.

A successful import writes a normal PDF into the vault, creates the normal `pdf/document` File Metadata record using the existing metadata operation, and opens the generated PDF through the ordinary PDFium Gate viewer path.

Failure cleanup is ownership-aware and best-effort. A PDF newly created by the current import is removed when a later step fails. A retained source newly created by the current import may be removed only after canonical-path and exact-byte verification. A retained source that already existed and was reused is never removed by rollback from the later import.

The existing document-record subsystem remains the authoritative metadata writer; Email Import does not introduce a parallel metadata transaction layer. Practical Obsidian testing must therefore include retry/failure behavior around the integrated workflow before stronger all-or-nothing transaction guarantees are claimed.

Automated CI no longer requires `main.js` and `main-bridge.js` to remain unchanged, because runtime integration intentionally changes both. Instead, CI requires the complete existing PDFium Gate verification suite, the Email Import tests, real Electron/Chromium PDF generation, bundled-runtime verification, deterministic/scoped generated-runtime changes, and an uploaded runtime artifact for practical testing.

### D-027 — Retained original provenance is documentary text; opening the original is deferred

Practical Obsidian testing showed that the retained-source link embedded in the generated PDF did not reliably open the retained `.eml`/`.msg` source. The initial `obsidian://open` link was rendered by Chromium/PDFium as a self-reference to the generated PDF. A follow-up experiment confirmed that Chromium `printToPDF()` preserves ordinary `https://` and `file://` link annotations, but a plugin-owned interception layer would add runtime complexity solely to make the source-open shortcut work.

The current Email Import design therefore removes the clickable retained-source link entirely. When an original source is retained, the PDF continues to show the original filename, exact source SHA-256, and canonical vault-relative retained path. The same provenance remains in `email_import_*` metadata. Source retention, duplicate detection, integrity verification, rollback ownership, and SHA-addressed storage are unchanged.

No absolute `file://` path is embedded as a replacement because that would make the archive machine-specific and weaken vault portability.

This decision supersedes the clickable-link requirement in D-005 and the link-mechanism portion of D-022. A future user-facing **Open original email** function, if a real need emerges, should be treated as a separate project and may be implemented as an Obsidian command or DocumentInfo action rather than as a PDF hyperlink.

The failed link experiment remains useful architectural evidence: custom application URI schemes should not be assumed to survive Chromium `printToPDF()` as usable external PDF link annotations merely because they exist correctly in the pre-print HTML.

### D-028 — Retained PDF attachments may be imported as independent PDFium Gate documents

A PDF attachment is imported only through an explicit user action on an already-imported email PDF. The first runtime UX uses the command **Import PDF attachment from email** and imports one selected PDF attachment at a time; PDF attachments are never auto-created as separate documents during initial email import.

Later attachment import requires that the original `.eml` or `.msg` source was retained. The attachment is reconstructed by re-reading that canonical retained source, verifying its exact source SHA-256 against the parent email document metadata, parsing it again into Canonical Email Document v1, and locating the selected PDF attachment in the freshly parsed canonical attachment list. If the original source was not retained, is missing, or no longer matches its recorded SHA-256, attachment import fails closed.

A candidate must contain a decoded payload that is actually PDF bytes; filename or MIME type alone is not sufficient for runtime import. The decoded attachment payload is validated against its canonical byte size and SHA-256 before it is written.

The initial suggested destination is the parent email PDF's folder using a filesystem-safe attachment filename. The path is editable before import and must be a fresh vault-relative `.pdf` path outside plugin metadata areas. Existing files or already-registered document paths are never silently overwritten or repurposed.

A successfully imported attachment becomes a normal PDFium Gate `pdf/document` with its own ordinary File Metadata record and opens through the normal PDF viewer path. It does not automatically inherit the parent email's user-editable metadata such as date, sender, or document type, because those fields may describe the attachment document differently from the email that carried it.

The attachment record stores technical relationship provenance under the reserved `email_import_*` namespace: a stable parent document-record ID, the parent email source SHA-256, the attachment's canonical ID, original attachment filename, MIME type, byte size, and attachment SHA-256. The relationship therefore does not depend on either document's current filename or vault path and survives later PDF rename/move handling through the existing document-record subsystem.

If PDF creation succeeds but metadata registration fails, the newly created attachment PDF is removed best-effort. The retained email source is never modified or removed by attachment import.

This workflow was practically verified in Obsidian on Windows: attachment selection, editable destination, PDF creation/opening, normal PDF behavior, DocumentInfo, document-register registration, and intentionally empty user metadata fields all worked as designed.

### D-029 — Refactor Email Import before adding further attachment features

Before non-PDF attachment behavior or other substantial Email Import features are added, Email Import will undergo a behavior-preserving modular refactor.

The purpose is to keep the already working feature maintainable as new ideas emerge. The current practical behavior is the regression boundary; the refactor must not deliberately change EML/MSG import, retained-source handling, PDF generation, duplicate behavior, inline/CID rendering, metadata integration, or the user-confirmed PDF-attachment import flow.

The target direction follows the main PDFium Gate architecture: small logical modules, narrow orchestration, explicit ports/adapters, and no peer-feature implementation coupling.

`src/plugin/features/20-email-import.js` should become a thin integration/facade layer responsible mainly for command registration, active-document/context acquisition, port wiring, controller invocation and high-level user feedback. Multi-step import workflows, retained-source verification, attachment policy, metadata construction, hashing and storage policy should live in bounded modules/controllers instead of accumulating in the plugin feature.

Reusable workflow operations should exist once. In particular, reading a retained EML/MSG source, verifying its expected source SHA-256, parsing it, and reconstructing Canonical Email Document v1 should be a shared Email Import service used by PDF and future non-PDF attachment actions rather than copied per feature.

Modals remain passive decision surfaces: they display information, collect user choices and return decisions; they do not own parsing, hashing, durable writes, metadata registration or rollback.

The detailed refactoring direction and suggested implementation order are documented in `REFACTORING-AND-SHARED-SERVICES.md`.

### D-030 — Generic integrity and content identity belong to shared PDFium Gate core

SHA-256 over exact bytes is a general content-integrity/content-identity primitive, not an Email Import responsibility.

The refactor should therefore promote the mature generic SHA-256/integrity primitive out of `src/email-import/` into a shared project-level core service. Email Import becomes a consumer of that service.

Keep the boundary explicit:

- generic shared code may calculate fingerprints, verify bytes against a fingerprint, compare fingerprints and later support grouping of byte-identical content;
- Email Import retains email-specific policy such as looking up `email_import_source_sha256`, interpreting a match as an imported-email source duplicate, and deciding what the Email Import UI offers the user.

Shared integrity code must not depend on EML/MSG parsing, Email Import metadata fields, Email Import UI, or attachment semantics.

This architecture deliberately leaves room for a future vault-wide **find byte-identical duplicates** feature. Such a feature could hash relevant vault files, group equal fingerprints, and later use a cache based on cheap file facts such as path, size and modification state to avoid rehashing unchanged files. It must not be implemented as part of the current refactor merely because the shared primitive makes it possible.

The principle is reuse without premature abstraction: promote mechanisms when their responsibility is genuinely general, while keeping feature-specific policy in the feature that owns it.

### D-031 — Non-PDF attachments follow the same email attachment-folder model

The previous D-031 placeholder is resolved by the October 5 practical design review.

Ordinary user-facing attachments are imported automatically when attachment extraction is enabled. PDFium Gate creates one sibling attachment folder whose vault path is the generated email PDF path without the final `.pdf` extension.

For example:

```text
Cases/2026-10-05 - Subject.pdf
Cases/2026-10-05 - Subject/
```

Direct PDF and non-PDF attachments are placed in that folder. Non-PDF attachments remain ordinary vault files; PDFs enter the normal PDFium Gate document-registration flow.

The generated email PDF lists the actual imported files rather than transport containers.

### D-032 — EML/MSG and ZIP are transport sources, not normal vault documents

EML, MSG and ZIP are import/transport formats.

For EML/MSG, exact source SHA-256, source format, original filename, message identity and other required technical provenance remain in the generated email PDF's metadata record. Retaining the exact original EML/MSG after a successful import is an advanced opt-in setting and is **off by default**.

Automatic vault-staging import deletes the staged EML/MSG only after the import has completed successfully and the exact staging bytes still match the bytes that were imported. Failed or cancelled imports leave the source in place.

For ZIP, a successfully imported source ZIP is deleted from the visible vault after extraction, read-back verification, PDF registration and relationship persistence all succeed. New archive provenance therefore does not depend on a live ZIP path.

This supersedes earlier assumptions in D-004, D-022, D-023 and D-026 where source retention or source-backed attachment workflows were treated as a stronger default.

### D-033 — Email attachment import is preflighted and transactional

Email Import builds a complete attachment plan while the parsed canonical email and decoded source bytes are still in memory, before durable attachment writes begin.

The plan includes direct attachments and the extractable members of every ZIP attachment. ZIP safety checks run during this preflight. Unsafe paths, blocked entries and nested ZIPs fail before attachment extraction begins.

All user-facing attachment outputs are written into the single sibling email attachment folder. Filename/path collisions across direct attachments and multiple ZIPs are resolved deterministically with suffixes such as ` (2)`.

After each file write, the bytes are read back and compared with the planned bytes. PDF metadata registration and attachment/Archive Relationship persistence happen only within the same controlled transaction. If a downstream attachment step fails, PDFium Gate removes metadata records created by that attempt and removes files/folders created by that attempt.

The generated email PDF is rendered from the same preflight plan. Its attachment section therefore lists the actual files that the successful import intends to create, including members of ZIP attachments. A ZIP filename may be shown as a non-target group heading, but users click the actual member files directly.

### D-034 — Multiple ZIP attachments share the email attachment folder

Multiple ZIP attachments in one email are not expanded into separate top-level ZIP-named folders.

Their members are merged into the one sibling attachment folder belonging to the email PDF while each ZIP's internal directory structure is preserved where possible. A single global collision allocator prevents silent overwrites across direct attachments and all ZIP members.

Nested PDF records retain source provenance through the parent email document plus the original archive filename, archive SHA-256 and member path. The source ZIP itself does not need to remain in the vault.

### D-035 — Manual Archive Import is atomic and deletes a successful source ZIP

A ZIP added manually to the vault is imported into a sibling folder with the ZIP's base name.

Archive Import performs full inspection before extraction, then writes and read-back verifies members, creates normal PDF registrations and persists archive relationships. Only after all these steps succeed is the source ZIP deleted.

If a failure occurs after writes have started, all files/folders and fresh PDF metadata records created by that attempt are rolled back. The source ZIP remains.

Because Obsidian normally hides ZIP files in the file explorer, a failed import explicitly warns the user and asks whether the failed source ZIP should be **kept** or **deleted**. Keeping it is the safe/default outcome.

ZIP files that arrive through external filesystem operations are reconciled on Obsidian startup and when the Obsidian window regains focus. Continuous polling is not required.

## Open questions

The following are intentionally not yet frozen:

1. ~~Default source-retention behavior.~~ Resolved by D-032: retain exact EML/MSG is an advanced opt-in and defaults to off.
2. Exact visual design of the email PDF.
3. Whether `Message-ID` should also be visible in the PDF or remain technical metadata only by default.
4. ~~User-facing behavior and storage rules for non-PDF attachments.~~ Resolved by D-031/D-033.
5. Exact naming policy beyond the current date/subject PDF suggestion; the attachment-folder pairing itself is frozen by D-031.
6. Batch-import UX and duplicate summary behavior.
7. Additional drag-and-drop surfaces beyond the currently implemented vault staging flow.
8. How malformed or partially parseable EML/MSG files should be represented to the user.
9. Whether users should be able to configure semantic mappings from email fields to arbitrary custom metadata fields beyond the initial factory-UUID/property fallback mapping.
10. ~~Stronger attachment transaction rollback.~~ Resolved for attachment output by D-033; parent email-PDF rollback on post-PDF runtime failures remains a separate future decision.
11. Exact scope and UX of a future vault-wide byte-identical duplicate finder; this is intentionally outside the current Email Import refactor.

## Change rule

When an accepted decision changes, do not silently rewrite history.

Update the relevant decision with a clear superseding note or add a new decision that records what changed and why. This file is intended to preserve the project's architectural memory as implementation and testing reveal new possibilities.