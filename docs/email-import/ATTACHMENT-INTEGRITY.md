# Attachment Integrity

Status: **accepted design refinement for Canonical Email Document v1**

Email attachments may be important source documents in their own right, especially PDF attachments. PDFium Gate should therefore be able to verify that an attachment extracted from EML/MSG is byte-identical to the attachment payload recovered during parsing.

## SHA-256

For each attachment whose binary payload is available, Email Import should calculate SHA-256 over the decoded attachment payload bytes.

Conceptually, `EmailAttachment` gains:

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

## Initial use

The first automated attachment tests should verify that:

1. parser reports the expected filename and content type;
2. parser reports the expected attachment count;
3. calculated attachment SHA-256 matches `test/fixtures/email/expected.json`;
4. later extraction/import writes bytes whose SHA-256 remains identical.

Attachment duplicate detection inside the vault is a possible later feature, not part of the first EML parser milestone.
