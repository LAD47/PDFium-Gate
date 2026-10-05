# Email Import Architecture

## 1. Scope

Email Import converts supported email source files into PDF documents for normal use inside PDFium Gate.

Supported source formats in the current parser layer:

- `.eml`
- `.msg`

Primary user-facing output:

- PDF

Optional advanced retained source:

- exact original `.eml` or `.msg`, stored outside the normal visible document area of the vault only when the user explicitly enables source retention;
- source retention is off by default because EML/MSG are treated as transport inputs rather than normal working documents.

The feature does not create a parallel permanent email viewer. The generated PDF enters the existing PDFium Gate document workflow.

## 2. High-level flow

```text
EML / MSG source
      |
      v
Import Controller
      |
      +--> Source Integrity
      |      - SHA-256 of original bytes
      |      - exact duplicate lookup
      |
      +--> Parser
      |      - EML parser
      |      - MSG parser
      |
      v
Canonical Email Document v1
      |
      +--> metadata / technical identity
      +--> body
      +--> attachment descriptors + decoded payloads
      |
      +--> Attachment Policy
      |      - inline/CID resources
      |      - ordinary attachments
      |      - PDF candidates
      |
      v
Review / Decision UI
      |
      +--> target PDF path
      +--> explicit retain/discard source choice
      +--> duplicate action
      |
      v
Safe Email Renderer
      |
      v
Controlled HTML representation
      |
      v
Main-process Chromium / Electron PDF generation
      |
      +--> optional retained-source provenance (filename / SHA-256 / path)
      |
      v
Vault PDF + ordinary File Metadata pdf/document record
      |
      v
Normal PDFium Gate PDF workflow

Mandatory attachment transaction
      |
      +--> complete preflight plan while source bytes are in memory
      +--> one sibling attachment folder for direct files + all ZIP members
      +--> byte/read-back verification
      +--> normal PDF registration + provenance/relationships
      +--> rollback all transaction-owned outputs on failure
```

## 3. Module boundaries

Current Email Import core implementation is organized under:

```text
src/email-import/
├── integrity/
│   ├── sha256.js
│   └── duplicate-detector.js
├── parsers/
│   ├── eml-parser.js
│   └── msg-parser.js
├── render/
│   ├── email-html-renderer.js
│   ├── email-pdf-generator.js
│   ├── electron-pdf-printer.js
│   └── email-source-reference.js
├── storage/
│   └── source-retention.js
├── attachments/
│   ├── attachment-policy.js
│   └── attachment-extraction.js
├── metadata/
│   └── email-metadata-projection.js
├── i18n/
│   └── <locale>.json
└── runtime-entry.js
```

Runtime integration is deliberately separated from the core modules:

```text
src/plugin/features/20-email-import.js
    - import orchestration in the Obsidian renderer/plugin runtime

src/main/email-import-modal.js
    - user review / explicit decision UI

src/platform/email-import-main-process.js
    - Electron main-process source picker and secure PDF printer adapter

src/main-bridge/features/09-email-import.js
    - narrow Main Bridge operation surface
```

Parser, renderer, hashing, storage, attachment extraction, metadata projection, UI, and Electron main-process responsibilities remain separate.

### Next structural milestone

Before further attachment features are added, this structure will be refined through a behavior-preserving refactor. The target is to make `20-email-import.js` a thin integration/facade layer and move multi-step workflows into bounded controllers/services.

Generic integrity mechanisms such as SHA-256 over exact bytes are not inherently Email Import responsibilities. The mature hashing/content-integrity primitive should move toward a shared project-level core service so Email Import and future unrelated PDFium Gate features can reuse it without depending on Email Import.

Email-specific duplicate policy remains Email Import-owned. For example, interpreting `email_import_source_sha256` as an imported-email source duplicate is feature policy even when the fingerprint calculation itself is generic.

The detailed accepted direction, proposed module split, regression boundary, and future vault-wide duplicate-finder opportunity are documented in `REFACTORING-AND-SHARED-SERVICES.md` and decisions D-029/D-030.

## 4. Import Controller

The Import Controller is implemented in the plugin runtime and coordinates bounded services rather than absorbing their logic.

Current responsibilities:

1. invoke the main-process source picker for `.eml` / `.msg`;
2. read exact source bytes;
3. calculate/check source SHA-256 before transformation;
4. run exact duplicate lookup against existing File Metadata records;
5. invoke the correct parser;
6. receive a Canonical Email Document;
7. show the review/decision modal;
8. let the user cancel, open one existing exact duplicate, or continue;
9. require an explicit retain/discard decision for the original source;
10. validate the editable target PDF path;
11. apply optional source retention;
12. generate controlled HTML and delegate PDF printing across MainProcessTransport;
13. create the PDF in the vault;
14. project and save technical/user metadata through the existing document-record operation;
15. open the resulting PDF through the normal PDFium Gate view path;
16. apply ownership-aware best-effort cleanup to newly created PDF/source files if a later import step fails.

Drag-and-drop, batch import, and user-facing attachment extraction/import are intentionally outside this first runtime integration.

## 5. Parsers

### 5.1 EML

The EML parser uses the mature `mailparser` MIME/email parser rather than reimplementing MIME parsing in PDFium Gate.

Parser-specific output is normalized before leaving the parser boundary.

### 5.2 MSG

The MSG parser uses `@kenjiuno/msgreader` for Outlook Compound File Binary Format / MAPI decoding.

The parser calculates the exact source SHA-256 before normalization, maps native sender/recipient/message fields into Canonical Email Document v1, and extracts attachment payload bytes through the MSG reader API. Attachment payloads receive the same independent SHA-256 treatment as EML attachments.

Where Outlook transport headers are available, they are parsed as RFC-style headers to recover information such as `Reply-To`, `In-Reply-To`, `References`, and a raw Date header. Native MSG sender/recipient fields remain preferred where available, with header data acting as a fallback or source for fields that do not have a direct normalized MSG property.

MSG body data may come from native plain-text and HTML properties. Outlook-specific container details, property tags, recipient storage, attachment storage, and character-decoding quirks remain inside the MSG parser boundary. The rest of Email Import does not need to know whether the source was EML or MSG.

Malformed or unsupported MSG bytes fail closed at the parser boundary rather than producing an invented canonical document.

Permanent automated MSG verification uses deterministic synthetic CFBF/MSG bytes generated by repository test code. This exercises the real third-party MSG parser without storing private real-world email as a fixture.

## 6. Canonical Email Document

Both parsers produce the same Canonical Email Document v1 contract documented in `EMAIL-DOCUMENT-MODEL.md`.

Important properties for downstream modules include:

- exact source identity and SHA-256;
- message identity and addressing;
- text/HTML body;
- attachment metadata;
- decoded attachment payload bytes when available;
- attachment SHA-256 independent of source SHA-256;
- parser diagnostics.

Attachment role such as "inline resource" or "PDF candidate" is deliberately derived after parsing and is not parser-specific canonical state.

## 7. Integrity and duplicate detection

SHA-256 is calculated from the original source bytes before parsing, normalization, source renaming, or conversion.

The stored hash represents the imported source, not the generated PDF.

The hashing/content-integrity primitive is planned to become shared PDFium Gate core functionality during the next modular refactor. Email Import remains responsible for email-specific interpretation and duplicate UX, not for owning the generic fingerprint mechanism.

### Exact source duplicate

Same SHA-256:

- very strong evidence that imported source bytes are identical;
- the review UI warns before durable writes;
- one unambiguous existing match can be opened directly;
- the user can cancel or deliberately continue with another import.

### Logical message duplicate

Same `Message-ID` but different source SHA-256:

- potentially the same logical email exported in a different byte representation;
- not proof of byte identity;
- may later produce a softer warning.

Exact SHA-256 duplicate detection is the implemented first-level policy.

A future vault-wide byte-identical duplicate finder may reuse the shared integrity layer, but it is explicitly not part of the Email Import refactor.

## 8. Rendering

The renderer transforms the Canonical Email Document into a controlled HTML representation suitable for both human reading and deterministic PDF generation.

The visible PDF includes at least:

- Subject
- From
- To
- Cc
- Date and time
- Message body
- ordinary attachment list

Rendering does not blindly trust source HTML.

Implemented rendering policy includes:

- allowlist sanitization of message HTML;
- blocking automatic remote resources;
- CID image resolution only from already-decoded canonical attachment bytes;
- controlled CSP;
- plain-text escaping;
- ordinary attachments separated from inline resources;
- inline-resource count retained in the document presentation;
- source-reference section when an original source is retained.

Because EML and MSG both reach the same canonical model, the renderer contains no source-format-specific branch for normal email presentation.

## 9. PDF generation and build-time bundling

PDF generation uses the Chromium/Electron environment available to Obsidian Desktop through an explicit main-process adapter around `BrowserWindow` / `webContents.printToPDF()`.

The hidden print window runs with JavaScript disabled, Node integration disabled, context isolation and sandbox enabled, web security enabled, insecure content disabled, navigation restricted, and new-window creation denied.

The generated PDF is the visible working document. It is not the byte-identical original email source.

Email Import's parser/sanitizer dependencies are bundled into generated `main.js` at build time so the installed plugin remains self-contained and does not require a separate `node_modules` tree.

The main-process picker/printer is not included in that core bundle; it is exposed through the existing generated `main-bridge.js` boundary.

## 10. Optional source retention

Source retention is optional and requires an explicit user choice in the first runtime integration.

When disabled:

- Email Import creates no retained-source file;
- technical source identity is still persisted for duplicate detection.

When enabled:

- original EML/MSG bytes are retained unchanged;
- storage is under `.pdf-metadata/email-sources/<sha-prefix>/<sha256>.<eml|msg>`;
- the retained file is verified byte-for-byte after writing;
- an existing canonical source file is reused only when bytes are identical;
- collisions fail closed rather than overwrite;
- the generated PDF identifies the original filename, SHA-256, and retained vault-relative path as documentary text;
- no source-open hyperlink is generated in the PDF. A future open-original action, if needed, is a separate feature decision.

Rollback removes a retained source only when the current import created it and exact path/byte verification still succeeds. Reused retained sources are never deleted by rollback from a later import.

## 11. Attachments

Attachment handling is planned before durable attachment writes begin.

The importer uses the already parsed Canonical Email Document and decoded attachment payloads to construct one complete attachment plan. This means normal import does not depend on rereading a permanently retained EML/MSG source after the email PDF has been created.

### Inline resources

CID/related/inline resources support the rendered message. They remain part of the canonical email model and may be embedded into the controlled message rendering, but they are not exported as ordinary user-facing attachments.

### One sibling attachment folder

Every imported email has one deterministic attachment folder paired with the email PDF:

```text
Cases/2026-10-05 - Subject.pdf
Cases/2026-10-05 - Subject Vedlegg/
```

The folder suffix is localized from the active UI language. Norwegian Bokmål uses `Vedlegg`, English uses `Attachments`, and the other supported locales use their corresponding attachment term.

Direct PDF and non-PDF attachments are written below this folder. The PDF and localized folder allocator treats either path as a collision, so a later import receives the same numeric suffix on both concepts rather than accidentally reusing an unrelated folder.

All attachment writes are read back and byte-compared before the attachment transaction is accepted.

### ZIP/container attachments

ZIP is a transport container, not a persistent user document.

Every ZIP attachment is inspected during attachment-plan preflight, before any attachment files are written. Archive safety limits cover unsafe/traversal paths, path length/depth, entry counts, per-file and aggregate uncompressed size, compression ratio and supported compression. Nested ZIP expansion is intentionally not supported in the current implementation and fails during preflight.

Members of all ZIP attachments are flattened into the same sibling email attachment folder. ZIP-internal directory structure is not reproduced as user-facing subfolders for email attachments; the original archive-member path remains in technical provenance. One global collision allocator covers direct attachments and all archive members, so two members such as `Vedlegg/notat.txt` from different ZIPs become `notat.txt` and `notat (2).txt` rather than overwriting each other.

The source ZIP itself is not created as a visible attachment file for a new email import.

The email PDF is rendered from the same plan. It shows the complete user-facing attachment set, including ZIP members. An original ZIP filename may appear as a group heading, but the clickable targets are the actual imported member files.

### PDF attachment registration and provenance

Every planned PDF output becomes an ordinary PDFium Gate document through the existing document-register path.

Direct PDF attachments retain the parent-email source/attachment provenance under the reserved `email_import_attachment_*` namespace.

A PDF originating inside a ZIP additionally records:

- original archive filename;
- archive SHA-256;
- original archive-member path;
- parent email PDF relationship;
- links to the other members imported from the same source archive.

The source ZIP path is not required for new imports because the ZIP is transient.

DocumentInfo renders archive provenance and related files from the technical relationship block. For an email archive member, the source presentation points back to the parent email and identifies the original ZIP filename.

### Atomic attachment transaction

The planned attachment phase follows an all-or-nothing rule for outputs created by that phase:

1. create target folders/files;
2. read back and byte-verify every file;
3. register PDF documents;
4. write archive provenance/relationships;
5. write the parent email's attachment-link block.

If a downstream attachment step fails, newly created attachment metadata records and attachment files/folders are rolled back. The source EML/MSG staging file is kept because the overall automatic import is not considered complete.

### Manual Archive Import

A manually added ZIP is owned by the generic Archive Import feature.

Its successful flow is:

```text
Saksdokumenter.zip
        |
        v
preflight -> extract to Saksdokumenter/ -> byte verification
        -> PDF registration -> provenance/relationships
        -> delete Saksdokumenter.zip
```

The source ZIP is deleted only after the entire archive transaction succeeds.

If an error occurs after extraction begins, files/folders and fresh PDF metadata records created by that attempt are rolled back. The ZIP remains. The user is explicitly warned and can choose to keep the failed ZIP for inspection or delete it. Keep is the safe/default outcome.

Because ZIP files may arrive through Windows Explorer without producing the same Obsidian-side create event as drag/drop, Archive Import also reconciles ZIP files on startup and when the Obsidian window regains focus. It does not continuously poll the filesystem.

## 12. Metadata and document-register boundary

After PDF generation, the resulting document enters the existing PDFium Gate path as a normal PDF.

The generated document record remains:

```text
filemeta_type: pdf
filemeta_profile: document
```

Technical email provenance lives in additional `email_import_*` properties in the same Markdown record, while ordinary DocumentInfo and the standard Document Register remain driven by the user's metadata schema.

Email Import reuses existing PDF features rather than duplicating them:

- text selection and copy;
- highlighting / categories;
- metadata;
- DocumentInfo;
- document register;
- links;
- search and future PDF functions.

The same principle applies to a PDF attachment that the user later chooses to import separately: it becomes a normal PDFium Gate PDF rather than a special email-attachment document type.

## 13. Runtime verification boundary

Before runtime integration, CI intentionally required generated `main.js` and `main-bridge.js` to remain unchanged.

That rule is superseded for the integrated milestone because the new user-facing feature must change both generated runtimes.

The replacement boundary requires:

- all existing PDFium Gate architecture/build/regression checks to remain green;
- all Email Import Node tests to remain green;
- real Electron/Chromium PDF generation to remain green;
- bundled Email Import dependencies to be present in generated `main.js` without runtime package requires;
- the secure main-process picker/printer integration to be present in generated `main-bridge.js`;
- deterministic build output with only `main.js` and `main-bridge.js` changed by the build;
- a generated runtime artifact for practical Obsidian testing.

Architecture gates remain active. During integration they caught transport-contract, plugin-feature-port, and Main Bridge lexical-host boundary mismatches; those boundaries were updated or respected rather than disabled.

The next refactor uses the current practical behavior as an additional regression boundary: structural improvements are not accepted if they change the user-confirmed Email Import or PDF-attachment workflows.

## 14. Development order

Implemented milestones:

1. documentation and frozen initial boundaries;
2. Canonical Email Document specification;
3. synthetic EML fixtures;
4. EML parser proof-of-concept;
5. SHA-256 and exact duplicate detection;
6. controlled email renderer;
7. Chromium/Electron PDF generation;
8. optional source retention and documentary provenance;
9. attachment handling refinement;
10. MSG parser;
11. metadata/document-register integration refinements;
12. Import Controller + Obsidian command/UI/runtime integration;
13. practical Email Import, retained-source, inline/CID and PDF-attachment import tests in Obsidian.

Next milestone before further feature expansion:

14. behavior-preserving modular refactor of Email Import and promotion of genuinely generic integrity/SHA primitives to shared PDFium Gate core, as specified in `REFACTORING-AND-SHARED-SERVICES.md` and D-029/D-030.

After that milestone is verified, non-PDF attachment behavior and other new capabilities can be considered independently.

Every milestone must continue to preserve existing PDF functionality.
