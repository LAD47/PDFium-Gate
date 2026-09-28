# Email Import Architecture

## 1. Scope

Email Import converts supported email source files into PDF documents for normal use inside PDFium Gate.

Initial source formats:

- `.eml`
- `.msg` (later milestone)

Primary user-facing output:

- PDF

Optional retained source:

- original `.eml` or `.msg`, stored outside the normal visible document area of the vault.

The feature must not create a parallel permanent email viewer that duplicates PDFium Gate's existing document workflow unless later evidence shows that such a viewer is necessary.

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
Safe Email Renderer
      |
      v
Controlled HTML representation
      |
      v
Chromium / Electron PDF generation
      |
      +--> optional retained source link
      |
      v
PDFium Gate PDF workflow

Optional explicit attachment extraction/import
      |
      +--> byte/hash verification
      +--> safe filename and destination boundary
      +--> later PDFium Gate import for chosen PDF attachments
```

## 3. Module boundaries

Current Email Import implementation is organized under:

```text
src/email-import/
├── integrity/
│   ├── sha256.js
│   └── duplicate-detector.js
├── parsers/
│   └── eml-parser.js
├── render/
│   ├── email-html-renderer.js
│   ├── email-pdf-generator.js
│   ├── electron-pdf-printer.js
│   └── email-source-reference.js
├── storage/
│   └── source-retention.js
└── attachments/
    ├── attachment-policy.js
    └── attachment-extraction.js
```

A later import controller and MSG parser will orchestrate these bounded modules. Parser, renderer, hashing, storage, and attachment extraction responsibilities should remain separate.

## 4. Import Controller

The Import Controller coordinates the workflow but should not contain parser, renderer, hashing, attachment-extraction, or storage implementation details.

Expected responsibilities:

1. accept a source file;
2. validate the supported source type;
3. calculate source SHA-256 before transformation;
4. run duplicate detection;
5. obtain user decision when an exact duplicate exists;
6. invoke the correct parser;
7. receive a Canonical Email Document;
8. apply optional source-retention policy;
9. invoke the renderer;
10. generate the PDF;
11. persist relationships and technical metadata;
12. offer explicit actions for eligible attachments when appropriate;
13. open or otherwise hand the generated PDF to the normal PDFium Gate workflow.

## 5. Parsers

### 5.1 EML

The EML parser uses the mature `mailparser` MIME/email parser rather than reimplementing MIME parsing in PDFium Gate.

Parser-specific output is normalized before leaving the parser boundary.

### 5.2 MSG

MSG support is a later milestone.

MSG parsing may require implementation details not needed for EML, including Outlook compound-message parsing, RTF handling, character decoding, and attachment extraction.

These details must remain inside the MSG parser boundary. The rest of Email Import must not need to know whether the source was EML or MSG.

## 6. Canonical Email Document

Both parsers must produce the same Canonical Email Document v1 contract documented in `EMAIL-DOCUMENT-MODEL.md`.

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

SHA-256 must be calculated from the original source bytes before parsing, normalization, source renaming, or conversion.

The stored hash represents the imported source, not the generated PDF.

### Exact source duplicate

Same SHA-256:

- very strong evidence that imported source bytes are identical;
- warn the user that the source has already been imported;
- identify the existing PDF when possible;
- offer to open the existing document, cancel, or deliberately import again.

### Logical message duplicate

Same `Message-ID` but different source SHA-256:

- potentially the same logical email exported in a different byte representation;
- not proof of byte identity;
- may later produce a softer warning.

Exact SHA-256 duplicate detection is the implemented first-level policy.

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

## 9. PDF generation

PDF generation uses the Chromium/Electron environment available to Obsidian Desktop through an explicit printer-adapter boundary around main-process `BrowserWindow` / `webContents.printToPDF()` APIs.

The hidden print window runs with JavaScript disabled, Node integration disabled, context isolation and sandbox enabled, web security enabled, and new-window creation denied.

The generated PDF is the visible working document. It is not the byte-identical original email source.

## 10. Optional source retention

Source retention is optional.

When disabled:

- Email Import creates no retained-source file;
- technical source identity may still be persisted for duplicate detection.

When enabled:

- original EML/MSG bytes are retained unchanged;
- storage is under `.pdf-metadata/email-sources/<sha-prefix>/<sha256>.<eml|msg>`;
- the retained file is verified byte-for-byte after writing;
- an existing canonical source file is reused only when bytes are identical;
- collisions fail closed rather than overwrite;
- the generated PDF identifies the original filename, SHA-256, retained path, and controlled Obsidian source link.

## 11. Attachments

Attachment handling has three derived roles:

### Inline resources

CID/related/inline resources support the rendered message. They remain in the canonical attachment array with integrity metadata, but when treated as message resources they are not repeated as ordinary attachments in the email PDF.

### Ordinary attachments

User-facing attachments are listed in the email PDF. They are not automatically extracted, flattened into the email PDF, or created as visible vault files.

### PDF candidates

An ordinary attachment is a PDF candidate when evidence comes from one or more of:

- MIME type `application/pdf`;
- decoded payload beginning with `%PDF-`;
- `.pdf` filename.

PDF-candidate status is advisory. A later Import Controller may offer the user a separate PDFium Gate import action, but classification itself has no side effect.

### Explicit extraction

The attachment extraction service is a safe primitive for later UI/orchestration. It:

- requires decoded payload bytes;
- verifies size and SHA-256 when available;
- sanitizes filenames for cross-platform safety;
- prevents path escape from the caller-supplied destination root;
- writes and verifies exact bytes;
- reuses an existing target only when bytes are identical;
- fails closed on a different-file collision.

The final user-facing destination and relationship model for extracted/imported attachments remains an integration decision, not a parser or extraction-service responsibility.

## 12. Integration boundary

After PDF generation, the resulting document should enter the existing PDFium Gate path as a normal PDF wherever possible.

Email Import should reuse existing PDF features rather than duplicate them:

- text selection and copy;
- highlighting / categories;
- metadata;
- DocumentInfo;
- document register;
- links;
- search and future PDF functions.

The same principle applies to a PDF attachment that the user later chooses to import separately: it should become a normal PDFium Gate PDF rather than a special email-attachment document type.

## 13. Development order

Recommended milestones:

1. documentation and frozen initial boundaries;
2. Canonical Email Document specification;
3. synthetic EML fixtures;
4. EML parser proof-of-concept;
5. SHA-256 and exact duplicate detection;
6. controlled email renderer;
7. Chromium/Electron PDF generation;
8. optional source retention and source link;
9. attachment handling refinement;
10. MSG parser;
11. metadata/document-register integration refinements;
12. broader regression and practical Obsidian testing.

Every milestone must preserve existing PDF functionality.
