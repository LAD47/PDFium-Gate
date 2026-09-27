# Canonical Email Document v1

Status: **accepted initial contract for implementation**

This document defines the first canonical internal email model for PDFium Gate Email Import.

The purpose of the model is to isolate source-format differences. EML and MSG parsers may use very different libraries and native data structures, but both must return the same canonical shape before rendering, duplicate detection, PDF generation, source retention, or later metadata integration continues.

The model is an internal runtime contract. It is **not** a promise that every field is persisted verbatim to Markdown/frontmatter or another storage format.

## 1. Design principles

1. The model represents one imported email message.
2. Source bytes are hashed before parsing or transformation.
3. Parser-specific objects must not leak outside the parser boundary.
4. Missing optional scalar values use `null` rather than invented values.
5. Recipient fields are always arrays, including when empty.
6. Original Unicode text must be preserved.
7. The renderer decides presentation; the parser must not insert display labels such as `(No subject)`.
8. Binary attachment content may exist at runtime but is not part of ordinary persisted document metadata.
9. Source-format quirks belong in parser diagnostics rather than changing the common model.
10. The model must be sufficient to render the required PDF without reopening the source file.

## 2. Canonical shape

Conceptual JavaScript shape:

```js
{
  schemaVersion: 1,

  source: {
    format: "eml" | "msg",
    originalFilename: string,
    byteSize: number,
    sha256: string,
    retained: boolean,
    retainedPath: string | null
  },

  identity: {
    messageId: string | null,
    inReplyTo: string | null,
    references: string[]
  },

  message: {
    subject: string | null,
    from: EmailAddress[],
    to: EmailAddress[],
    cc: EmailAddress[],
    bcc: EmailAddress[],
    replyTo: EmailAddress[],
    dateTime: {
      iso: string | null,
      raw: string | null,
      valid: boolean
    }
  },

  body: {
    text: string | null,
    html: string | null
  },

  attachments: EmailAttachment[],

  diagnostics: {
    warnings: string[]
  }
}
```

## 3. EmailAddress

```js
{
  name: string | null,
  address: string | null
}
```

Rules:

- Preserve the decoded display name as faithfully as possible.
- Preserve the decoded address rather than silently rewriting case or punctuation.
- If a parser can recover a display name but not a valid address, keep the name and use `address: null`.
- If a parser can recover an address but no display name, use `name: null`.
- Do not discard a recipient merely because one component is missing.
- Renderer policy decides how incomplete addresses are displayed.

## 4. Source

### `source.format`

Allowed v1 values:

- `eml`
- `msg`

No parser-library name is stored here.

### `source.originalFilename`

The filename presented to the import operation before any internal renaming.

Example:

```text
Svar fra kommunen.eml
```

The filename is documentary metadata and may later be shown in the PDF when the original source is retained.

### `source.byteSize`

Exact number of bytes in the imported source file.

### `source.sha256`

Lowercase hexadecimal SHA-256 calculated over the exact original source bytes **before** parsing, normalization, renaming, rendering, or conversion.

Example:

```text
7c1b...64 hexadecimal characters...e29a
```

This is the primary exact-source duplicate key.

### `source.retained`

Runtime/import result flag indicating whether PDFium Gate retained an unchanged copy of the source in the vault's non-visible source area.

### `source.retainedPath`

Vault-relative path to the retained source when `retained === true`.

Otherwise:

```js
null
```

The exact storage root is deliberately outside this model and remains a storage-module decision.

## 5. Identity

The identity section contains message-level technical identifiers, separate from source-file identity.

### `identity.messageId`

Decoded/trimmed RFC Message-ID when available.

Do not invent a Message-ID when none exists.

A Message-ID match may later support a softer "possibly the same logical message" warning, but it is not proof that source bytes are identical.

### `identity.inReplyTo`

`In-Reply-To` value when available.

### `identity.references`

Zero or more message identifiers from the `References` header or equivalent source information.

These fields provide a foundation for later thread/relation features without making thread reconstruction part of the first implementation.

## 6. Message fields

### `message.subject`

Decoded subject text.

Use `null` when absent. Do not substitute display text in the parser.

### `message.from`

Always an array.

Although normal email usually has one author/sender representation, the canonical model does not force a single element.

### `message.to`

Always an array.

### `message.cc`

Always an array.

### `message.bcc`

Always an array.

BCC may often be unavailable in received/exported messages. It is included now to avoid a schema break later and to support source files where the information is present.

BCC is **not** part of the currently required visible PDF fields. Rendering policy will decide whether it is shown when present.

### `message.replyTo`

Always an array.

Reply-To is retained for completeness but is not required in the first visible PDF layout.

## 7. Date and time

```js
dateTime: {
  iso: string | null,
  raw: string | null,
  valid: boolean
}
```

### `dateTime.iso`

Normalized ISO 8601 representation when the source date can be parsed reliably.

Where the source supplies a UTC offset, the implementation should preserve the represented instant correctly rather than interpreting the value in the local machine timezone.

### `dateTime.raw`

Original decoded date header/value when it can be obtained.

Keeping the raw representation gives us a fallback for malformed or unusual messages and makes conversion behavior easier to inspect.

### `dateTime.valid`

`true` only when `iso` represents a successfully parsed source date.

If date parsing fails:

```js
{
  iso: null,
  raw: "the original value when available",
  valid: false
}
```

The renderer decides how to represent an invalid or missing date.

## 8. Body

```js
body: {
  text: string | null,
  html: string | null
}
```

### `body.text`

Decoded plain-text body when available.

### `body.html`

Decoded source HTML body when available.

Important: `body.html` is **untrusted source content**. The canonical model stores what the parser recovered; it does not imply that the HTML is safe to render.

The renderer/sanitizer boundary is responsible for:

- sanitization;
- removal/neutralization of unsafe active content;
- blocking remote resources by default;
- resolving approved inline/CID resources;
- final HTML used for PDF generation.

If both text and HTML are available, retain both. Do not discard the plain-text alternative merely because HTML exists.

## 9. Attachments

Conceptual shape:

```js
{
  id: string,
  filename: string | null,
  contentType: string | null,
  size: number | null,
  disposition: "attachment" | "inline" | null,
  contentId: string | null,
  related: boolean,

  // Runtime only; optional depending on parser/import stage:
  content: Buffer | Uint8Array | null
}
```

### `id`

Import-local stable identifier generated by PDFium Gate for referencing the attachment during one import operation.

It is not the attachment filename and does not claim to be a globally permanent identifier.

### `filename`

Decoded source filename when available.

### `contentType`

MIME/content type when known.

### `size`

Attachment payload size in bytes when known.

### `disposition`

Normalized to:

- `attachment`
- `inline`
- `null`

### `contentId`

CID/content identifier when available. This is needed for resolving inline images referenced by HTML such as `cid:...`.

### `related`

`true` when the attachment is considered part of the rendered message body/related content rather than an ordinary user-facing file attachment.

### `content`

Binary payload available during runtime when needed for rendering, extraction, or later attachment import.

`content` must **not** be serialized into normal document metadata/frontmatter.

The visible PDF attachment list should normally list user-facing attachments, while inline/related resources are handled by the renderer. Exact policy is finalized in the attachment/rendering milestones.

## 10. Diagnostics

```js
diagnostics: {
  warnings: string[]
}
```

Warnings are non-fatal parser/import observations, for example:

- malformed date header;
- invalid recipient address recovered as display text;
- body charset fallback used;
- attachment without filename;
- unsupported source construct ignored.

Warnings are intended for diagnostics and testability. They are not automatically printed in the PDF.

A fatal parsing failure is not represented as a successful Canonical Email Document with a warning; it should fail the import operation with an explicit error result.

## 11. Required invariants

A successful Canonical Email Document v1 must satisfy all of these:

1. `schemaVersion === 1`.
2. `source.format` is `eml` or `msg`.
3. `source.originalFilename` is a non-empty string.
4. `source.byteSize` is an integer `>= 0`.
5. `source.sha256` is exactly 64 lowercase hexadecimal characters.
6. `source.retained === false` implies `source.retainedPath === null`.
7. Recipient/reply arrays always exist.
8. `identity.references` always exists as an array.
9. `attachments` always exists as an array.
10. `diagnostics.warnings` always exists as an array.
11. At least one of `body.text` or `body.html` should normally exist; if neither can be recovered, the document may still be valid when headers/metadata were successfully parsed, but a diagnostic warning must explain the missing body.
12. No source HTML is considered trusted merely because parsing succeeded.

## 12. Persisted subset

The full runtime object does not need to be persisted.

The first implementation should be able to persist/index at least enough information for duplicate/source relationships:

```text
source.format
source.originalFilename
source.sha256
identity.messageId
source.retained
source.retainedPath (when retained)
```

Additional fields may later be mapped into PDFium Gate document metadata, but that is a separate integration decision.

Binary attachment `content` must never be stored as ordinary text metadata.

## 13. PDF renderer input

The renderer receives the canonical model and must be able to create the required visible PDF from it without parser-specific knowledge.

Required visible content remains:

- Subject
- From
- To
- Cc
- Date and time
- Message body
- Attachment list

When the original source is retained, the renderer also receives enough canonical source information to include:

- original source filename;
- link/reference to the retained source;
- SHA-256 source hash.

No parser-native object is allowed as a renderer dependency.

## 14. Versioning rule

This document defines **schemaVersion 1**.

Compatible implementation refinements may clarify behavior without changing the schema version.

A change that makes existing v1 producers/consumers structurally incompatible must create a new schema version and document the migration/compatibility rule rather than silently changing the contract.

## 15. First implementation target

The first parser milestone only needs to implement the EML producer for this model.

The initial proof must demonstrate that a synthetic EML message can produce a valid Canonical Email Document v1 with at least:

- source hash and size;
- subject;
- from;
- to;
- cc;
- date/time;
- Message-ID when present;
- text and/or HTML body;
- attachment descriptors.

MSG is deliberately postponed until the EML path, canonical model, and tests are stable.
