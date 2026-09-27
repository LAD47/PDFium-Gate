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
Canonical Email Document
      |
      +--> metadata / technical identity
      +--> body
      +--> attachment descriptors
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
```

## 3. Module boundaries

A likely source structure is:

```text
src/
└── email-import/
    ├── import-controller.js
    ├── email-document.js
    │
    ├── parsers/
    │   ├── eml-parser.js
    │   └── msg-parser.js
    │
    ├── integrity/
    │   ├── source-hash.js
    │   └── duplicate-detector.js
    │
    ├── render/
    │   ├── email-html-renderer.js
    │   └── email-pdf-generator.js
    │
    ├── source/
    │   └── source-archive.js
    │
    └── attachments/
        └── attachment-service.js
```

This is a responsibility map, not a frozen filename contract. Filenames may change if the existing PDFium Gate architecture suggests a cleaner integration.

## 4. Import Controller

The Import Controller coordinates the workflow but should not contain parser, renderer, hashing, or storage implementation details.

Expected responsibilities:

1. accept a source file;
2. validate the supported source type;
3. calculate source SHA-256 before transformation;
4. run duplicate detection;
5. obtain user decision when an exact duplicate exists;
6. invoke the correct parser;
7. receive a Canonical Email Document;
8. invoke the renderer;
9. generate the PDF;
10. optionally retain the original source;
11. persist the relationship between generated PDF and source metadata;
12. open or otherwise hand the PDF to the normal PDFium Gate workflow.

## 5. Parsers

### 5.1 EML

The EML parser should use a mature MIME/email parser rather than reimplement MIME parsing in PDFium Gate.

The current reference implementation demonstrates `mailparser` / `simpleParser()` as the likely foundation.

Parser-specific output must be normalized before leaving the parser boundary.

### 5.2 MSG

MSG support is a later milestone.

MSG parsing may require several implementation details not needed for EML, including Outlook compound-message parsing, RTF handling, character decoding, and attachment extraction.

These details must remain inside the MSG parser boundary. The rest of Email Import must not need to know whether the source was EML or MSG.

## 6. Canonical Email Document

Both parsers must produce the same internal representation.

Initial conceptual shape:

```text
EmailDocument

source
    type
    originalFilename
    sha256
    messageId?

message
    subject
    from[]
    to[]
    cc[]
    dateTime

body
    text?
    html?

attachments[]
    filename
    contentType?
    size?
    disposition?
    contentId?
```

The exact schema is not yet frozen. It should be documented separately before implementation becomes dependent on it.

## 7. Integrity and duplicate detection

SHA-256 must be calculated from the original source bytes before parsing, normalization, source renaming, or conversion.

The stored hash represents the imported source, not the generated PDF.

Duplicate detection has at least two possible levels:

### Exact source duplicate

Same SHA-256:

- very strong evidence that the imported source bytes are identical;
- warn the user that the source has already been imported;
- identify the existing PDF when possible;
- offer to open the existing document, cancel, or import again.

### Logical message duplicate

Same `Message-ID` but different source SHA-256:

- potentially the same logical email exported in a different byte representation;
- should not initially be treated as proof of byte identity;
- may later produce a softer warning.

The first implementation should prioritize exact SHA-256 duplicate detection.

## 8. Rendering

The renderer transforms the Canonical Email Document into a controlled HTML representation suitable for both human reading and deterministic PDF generation.

The visible PDF must include at least:

- Subject
- From
- To
- Cc
- Date and time
- Message body
- Attachment list

Rendering must not blindly trust source HTML.

The renderer should ultimately define policy for:

- sanitizing message HTML;
- handling inline/CID images;
- blocking or neutralizing external remote resources by default;
- representing missing or malformed fields;
- text-only messages;
- long recipient lists;
- page breaks;
- attachment listing;
- source-reference section when an original is retained.

## 9. PDF generation

PDF generation should use the Chromium/Electron environment available to Obsidian Desktop rather than introducing a legacy independent HTML-to-PDF engine.

The PDF should be a stable document representation suitable for normal PDFium Gate use.

The generated PDF is the visible working document. It is not the byte-identical original email source.

## 10. Optional source retention

Source retention is optional.

When disabled:

- the source file does not remain stored by Email Import;
- technical metadata such as SHA-256 and Message-ID may still be retained so duplicate detection remains possible.

When enabled:

- the original EML/MSG bytes are retained unchanged;
- the source is stored outside the normal visible document area;
- the generated PDF identifies the original filename;
- the generated PDF provides a link back to the retained source;
- the SHA-256 value binds the retained source to the recorded import identity.

The exact source-storage path is deliberately not frozen yet.

## 11. Attachments

The first PDF representation must include an attachment list.

The long-term attachment policy is still open. Possible later behaviors include:

- preserve only names in the email PDF;
- allow extraction/import as separate vault files;
- retain attachment relationships to the email document;
- support optional links from the email PDF or metadata to extracted attachments.

Attachments should not automatically be flattened into the email PDF without an explicit design decision.

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

## 13. Development order

Recommended milestones:

1. documentation and frozen initial boundaries;
2. canonical Email Document specification;
3. synthetic EML fixtures;
4. EML parse proof-of-concept;
5. SHA-256 and exact duplicate detection;
6. controlled email renderer;
7. Chromium/Electron PDF generation;
8. optional source retention and source link;
9. attachment handling refinement;
10. MSG parser;
11. metadata/document-register integration refinements;
12. broader regression and scale testing.

Every milestone must preserve existing PDF functionality.
