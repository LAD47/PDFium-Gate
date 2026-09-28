# Attachment Integrity

Status: **accepted attachment handling contract for Canonical Email Document v1**

Email attachments may be important source documents in their own right, especially PDF attachments. PDFium Gate therefore verifies that attachment payloads recovered from EML/MSG remain byte-identical when they are later extracted or imported.

## SHA-256

For each attachment whose binary payload is available, Email Import calculates SHA-256 over the decoded attachment payload bytes.

Conceptually, `EmailAttachment` contains:

```js
{
  id: string,
  filename: string | null,
  contentType: string | null,
  size: number | null,
  disposition: "attachment" | "inline" | null,
  contentId: string | null,
  related: boolean,
  sha256: string | null,

  // Runtime only
  content: Buffer | Uint8Array | null
}
```

`sha256` is lowercase hexadecimal when calculated, otherwise `null`.

The hash is independent of the SHA-256 for the EML/MSG source file:

- `source.sha256` identifies the complete imported email source bytes.
- `attachment.sha256` identifies one decoded attachment payload.

## Derived attachment policy

Attachment roles are derived after parsing rather than stored as parser-specific canonical fields.

The policy separates:

- **inline resources** — CID/related/inline resources used to render the message;
- **ordinary attachments** — user-facing files listed in the generated email PDF;
- **PDF candidates** — ordinary attachments with PDF evidence from MIME type, decoded `%PDF-` payload signature, or filename.

Inline resources remain fully represented in the canonical attachment array and retain their integrity information. They are not duplicated in the ordinary attachment list when they are used as message resources.

PDF-candidate classification is advisory. It does not automatically flatten the attachment into the email PDF or create a separate PDFium Gate document.

## Explicit extraction

Extraction is explicit rather than automatic.

Before writing an attachment, the extraction service:

1. requires decoded payload bytes;
2. verifies canonical size when available;
3. verifies canonical SHA-256 when available;
4. sanitizes the proposed filename for cross-platform filesystem safety;
5. constrains the result to the caller-provided destination root;
6. writes and reads back the payload for byte-for-byte verification;
7. reuses an existing target only when its bytes are identical;
8. fails closed when an existing target has different bytes.

This gives the later import controller/UI a safe primitive without pre-deciding where visible extracted attachments should live.

## Automated fixture coverage

The synthetic attachment tests verify that:

1. parser reports expected filename and content type;
2. parser reports expected attachment count;
3. calculated attachment SHA-256 matches `test/fixtures/email/expected.json`;
4. inline CID resources are separated from ordinary attachments;
5. PDF candidates are identified from independent evidence;
6. extraction writes byte-identical payloads;
7. unsafe filename/path components are neutralized;
8. identical existing targets may be reused;
9. different existing targets fail closed rather than being overwritten.

Attachment duplicate detection across already-registered vault documents remains a possible later feature and is not implied by extraction reuse at one requested target path.
