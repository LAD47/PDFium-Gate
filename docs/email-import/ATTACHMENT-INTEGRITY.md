# Attachment Integrity

Status: **current attachment handling contract for Canonical Email Document v1**

Email attachments may be important source documents in their own right. PDFium Gate therefore verifies attachment payloads at the source/import boundary and verifies durable writes before an Email Import transaction is accepted.

## SHA-256

For each attachment whose decoded payload is available, Email Import calculates SHA-256 over the decoded attachment payload bytes.

The hash is independent of the SHA-256 for the complete EML/MSG source:

- `source.sha256` identifies the exact imported EML/MSG source bytes;
- `attachment.sha256` identifies one decoded attachment payload.

The attachment hash is immutable provenance for the import event. It is **not** a rule that a user-modified exported attachment must forever keep the same bytes in order for its live Obsidian relationship to open.

## Derived attachment policy

Attachment roles are derived after parsing:

- **inline resources** — CID/related/inline resources used to render the message;
- **ordinary attachments** — user-facing files represented in the generated email PDF;
- **PDF candidates** — ordinary attachments with PDF evidence from MIME type, decoded `%PDF-` payload signature or filename.

Inline resources remain represented in the canonical attachment array and retain integrity information, but they are not duplicated as ordinary files when they support message rendering.

For the current integrated workflow, ordinary user-facing attachments are a **mandatory part of a successful new Email Import**. Verified PDFs enter the normal PDFium Gate PDF/document lifecycle. Ordinary non-PDF files remain normal vault files.

## Preflight before durable attachment writes

The complete attachment plan is built while the parsed email and decoded payloads are still in memory.

Before durable attachment output begins:

1. decoded payload bytes must be available for an extractable attachment;
2. canonical size is verified when present;
3. canonical SHA-256 is verified when present;
4. filenames are sanitized for cross-platform safety;
5. ZIP attachments are fully inspected under the Archive Import limits;
6. unsafe/traversal/blocked entries fail before extraction begins;
7. nested ZIP expansion is rejected in the current implementation;
8. one deterministic collision allocator assigns final email-attachment filenames.

For email ZIP members, the user-facing destination uses the member basename while the original archive member path remains provenance.

## Durable write verification

For every planned user-facing attachment:

1. create the file in the transaction-owned attachment folder;
2. read the file back through the vault API;
3. compare the read-back bytes with the planned bytes;
4. only then continue to PDF registration and relationship persistence.

No source ZIP is required as a durable intermediate for a new email import.

## Atomic transaction rule

Attachment output is all-or-nothing for files owned by the current attachment transaction.

If a downstream step fails after files were created, PDFium Gate removes:

- transaction-owned attachment files/folders;
- fresh PDF metadata records created by the transaction, including minimal records created by PDF auto-registration.

The staging EML/MSG is not considered successfully consumed when this mandatory attachment transaction fails.

## Manual ZIP integrity

Manual Archive Import uses the same general fail-closed principles but a different user-facing layout:

- full ZIP preflight before extraction;
- preserve ZIP directory structure;
- create and read-back verify every extracted file;
- create normal PDF registrations and archive relationships;
- delete the source ZIP only after the complete transaction succeeds.

If a manual ZIP transaction fails after writes begin, outputs are rolled back and the source ZIP remains until the user chooses **Keep ZIP** or **Delete ZIP**.

## Automated fixture coverage

Current tests cover:

- parser attachment filename/content type/count;
- deterministic attachment SHA-256;
- inline-resource separation;
- PDF-candidate evidence;
- payload size/hash verification;
- unsafe filename/path neutralization;
- multiple ZIP attachments;
- flattened email ZIP-member naming;
- deterministic cross-ZIP collision suffixing;
- read-back verification;
- PDF auto-registration race handling;
- rollback of all transaction-owned PDF records/files;
- manual ZIP source deletion after success;
- failed manual ZIP rollback and keep/delete source policy.
