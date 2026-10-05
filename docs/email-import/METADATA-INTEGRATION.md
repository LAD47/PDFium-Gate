# Email Import — Metadata and Document Register integration

## Purpose

A generated email PDF must enter the existing PDFium Gate metadata lifecycle as a normal PDF document. Email Import does not create a parallel email-document register or a second metadata database.

## Existing document identity

The generated PDF uses the existing document-record descriptor:

```yaml
filemeta_type: pdf
filemeta_profile: document
```

The record continues to live under the normal `File Metadata/` Markdown source-of-truth and is therefore handled by the existing document-record index, DocumentInfo, Bases integration, rename/move tracking, missing-file lifecycle, and cache logic.

Email origin is provenance of a normal PDF document, not a new `filemeta_type` or `filemeta_profile`.

## Technical provenance

Email Import stores machine-owned provenance as additional frontmatter properties in the same Markdown record. The initial namespace is `email_import_*`.

The projection can persist:

- `email_import_version`
- `email_import_source_format`
- `email_import_source_sha256`
- `email_import_source_byte_size`
- `email_import_original_filename`
- `email_import_source_retained`
- `email_import_retained_path` when applicable
- `email_import_message_id` when available
- `email_import_in_reply_to` when available
- `email_import_references` when available
- `email_import_attachment_count`
- `email_import_user_attachment_count`
- `email_import_inline_resource_count`
- `email_import_pdf_candidate_count`

These properties are not `filemeta_*` system identity fields and do not alter the generic document-record contract. The existing record parser preserves non-system frontmatter values.

For PDF attachments originating inside ZIP containers, child PDF provenance can additionally record:

- parent email record/document identity;
- decoded attachment SHA-256;
- original ZIP filename;
- original ZIP SHA-256;
- original ZIP member path.

The source ZIP does not need to remain as a live vault file for this provenance to survive.

The `email_import_*` namespace is reserved by Email Import policy. If a user metadata schema already uses that namespace, registration fails closed rather than silently overwriting a user field.

## User metadata suggestions

Email Import may provide initial values only for compatible fields that already exist in the user's metadata schema.

Initial semantic mappings are:

- document date;
- document time;
- sender.

Factory field UUIDs are used as the primary semantic identity so a user may rename the field property without breaking the mapping. The canonical factory property name is only a fallback when the stable factory UUID is unavailable.

Email Import does not:

- create missing user metadata fields;
- guess values for unrelated custom fields;
- automatically set `document_type`;
- overwrite an already-registered PDF record with email provenance.

Every suggested value is checked against the current field type and field constraints before it is included.

## Date and time projection

When a parseable raw email `Date` header is available, the metadata suggestion preserves its source wall-clock date and time. For example:

```text
Mon, 28 Sep 2026 15:30:45 +0200
```

projects to:

```text
document date: 2026-09-28
document time: 15:30 or 15:30:45 according to field precision
```

It is not silently changed to the UTC wall clock merely because the canonical instant is also stored as ISO time.

If no usable source wall clock exists, the projection falls back to the canonical ISO instant in UTC.

## Fresh-path and auto-registration rule

Email Import requires a fresh target **file path** before it creates a generated email PDF or attachment PDF. Generated-PDF naming and collision handling are therefore resolved before durable writes.

PDFium Gate's normal automatic PDF registration may react immediately to the newly created PDF and create a minimal document record before Email Import saves its richer provenance. A minimal record created for a path that the current import transaction has just created is transaction-owned and is upgraded with Email Import provenance rather than treated as an external collision.

A genuinely pre-existing PDF path or record that existed before the transaction remains a fail-closed collision.

The registration/update port is the existing `saveDocumentMetadataRecordValues` operation. Rollback also owns any minimal records created by auto-registration for PDF paths created by the failed transaction.

## DocumentInfo and Bases

The standard Document Register is schema-driven. Because `email_import_*` properties are not ordinary schema fields, they are not automatically added as visible columns.

The same separation applies conceptually to DocumentInfo: normal user metadata remains the editable presentation. Technical provenance exists in the Markdown source-of-truth for integrity, duplicate lookup, diagnostics, and future advanced views without cluttering the normal editing surface.

A user may later build a custom Base that explicitly queries technical provenance if such a workflow is useful; that does not require changing the standard register.

## Verification

`scripts/test-email-import-metadata.js` verifies that:

- EML and MSG use the same projection;
- the output remains a normal `pdf/document` record;
- technical provenance serializes through the existing record contract;
- standard Document Register columns remain schema-driven and exclude technical provenance by default;
- stable factory field UUIDs survive user property renaming;
- unrelated custom fields are not guessed;
- source wall-clock time is preserved when available;
- `email_import_*` schema collisions fail closed;
- a genuinely pre-existing PDF is not silently rebound to email provenance;
- a transaction-owned minimal record created by PDF auto-registration is safely upgraded;
- rollback can remove transaction-owned PDF metadata records after downstream failure;
- archive-member provenance survives without a live source ZIP path.
