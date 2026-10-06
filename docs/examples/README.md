# PDFium Gate example files

These files are the canonical synthetic example set for PDFium Gate. From plugin Settings, the user can explicitly install the same set into the Vault under:

`Examples-Obsidian-PDFium-Gate/`

Nothing is copied automatically. The example records live outside the real `File Metadata/` tree, use fixed sample UUIDs and placeholder PDF links, and are never treated as production document records.

## Two different Base concepts

The two Base files in this folder use Obsidian's built-in `table` view. Their purpose is to demonstrate that PDFium Gate metadata is ordinary Markdown/YAML that users can reuse in their own native Obsidian Bases.

They are **not** the PDFium Gate document register.

The real register is `PDF Dokumentregister.base`. It reads real registered PDF metadata from `File Metadata/` and uses the PDFium Gate custom view type `pdfium-document-register`. The plugin creates that Base once; after creation it is user-owned and is not silently overwritten.

## Included examples

- `README.md` — explains the example package and the difference between native Bases and the PDFium Gate document register.
- `Example - Active PDF record.md` — complete factory-schema example using all nine current user metadata fields.
- `Example - Decision.md` — active decision with a received response.
- `Example - Report.md` — active report with no response workflow completed.
- `Example - Memo.md` — active memo with both received and sent response data.
- `Example - Awaiting response.md` — active letter where a response was sent but no response has been received yet.
- `Example - Missing PDF record.md` — preserved metadata for a missing PDF; the record is historical/read-only until explicitly deleted or a future backup restore path is used.
- `Example - Native Obsidian Base - All documents.base` — ordinary Obsidian table showing the complete synthetic set.
- `Example - Native Obsidian Base - Awaiting response.base` — ordinary Obsidian table demonstrating a practical filter.

Running the Settings action again restores these canonical example files after an explicit warning. Existing canonical example files are overwritten. The old `Example PDF Document Register.base` filename is removed only when its content is still byte-for-byte equal to the old canonical example; a modified legacy file is preserved. Unrelated files are never changed.

The canonical factory field names used here are:

- `document_date`
- `document_time`
- `sender`
- `document_type`
- `response_received`
- `response_received_date`
- `response_sent`
- `response_sent_date`
- `response_sent_link`

System fields are:

- `filemeta_type`
- `filemeta_profile`
- `filemeta_version`
- `filemeta_id`
- `filemeta_file`
- `filemeta_status`

The `document_type` examples cover all four stable canonical values: `decision`, `letter`, `report`, and `memo`. Display labels are presentation and may vary by UI language.
