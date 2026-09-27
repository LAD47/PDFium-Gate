# Synthetic Email Import Fixtures

These fixtures are permanent synthetic test data for the PDFium Gate Email Import subproject.

No message, address, attachment, or document in this directory represents a real person or real correspondence. The reserved `.invalid` domain is used for email addresses and Message-IDs.

## Message fixtures

- `plain-text.eml` - simple text-only message with no attachments.
- `norwegian-utf8.eml` - Norwegian Unicode in subject, sender name, and body.
- `html.eml` - multipart text/plain + text/html message.
- `one-pdf-attachment.eml` - one normal `application/pdf` attachment.
- `multiple-attachments.eml` - two different PDF attachments plus one text attachment.
- `inline-image-and-pdf.eml` - one CID/inline PNG resource plus one normal PDF attachment.

## Attachment source files

`attachments/` contains the exact binary/text payloads embedded in the fixture messages.

The two PDF files intentionally contain selectable text, including Norwegian characters. They are small reference documents for later tests of extraction/import into the normal PDFium Gate workflow.

## Expected results

`expected.json` records stable expectations for parser tests, including:

- Message-ID and subject;
- attachment count;
- filenames and content types;
- SHA-256 of each source EML;
- SHA-256 of each attachment payload.

Attachment SHA-256 allows a future parser/extraction test to prove that an extracted attachment is byte-identical to the payload embedded in the EML.

## Fixture rule

These files are test evidence. Once implementation tests depend on them, change them deliberately rather than regenerating them casually. A changed byte changes SHA-256 and can invalidate duplicate/integrity tests.
