# PDFium Gate example files

These files are the canonical synthetic example set for PDFium Gate. From plugin Settings, the user can explicitly install the same set into the Vault under:

`Examples-Obsidian-PDFium-Gate/`

Nothing is copied automatically. The example records live outside the real `File Metadata/` tree, use fixed sample UUIDs and placeholder PDF links, and are never treated as production document records.

## Two different Base concepts

The two native Base examples in this folder use Obsidian's built-in `table` view. Their purpose is to demonstrate that PDFium Gate metadata is ordinary Markdown/YAML that users can reuse in their own native Obsidian Bases.

They are **not** the PDFium Gate document register.

The real register is `PDF Dokumentregister.base`. It reads real registered PDF metadata from `File Metadata/` and uses the PDFium Gate custom view type `pdfium-document-register`. The Settings action creates this working register only at the Vault root if it is missing. No register copy is installed in the example folder. Existing root registers and historical copies remain untouched.

## Included examples

- `README.md` — explains the example package and the difference between native Bases and the PDFium Gate document register.
- `Example - Active PDF record.md` — complete example using nine original fields plus `author` and `source_url`.
- `Example - Decision.md` — active decision with a received response.
- `Example - Report.md` — active report with no response workflow completed.
- `Example - Memo.md` — active memo with both received and sent response data.
- `Example - Awaiting response.md` — active letter where a response was sent but no response has been received yet.
- `Example - Missing PDF record.md` — preserved metadata for a missing PDF; the record is historical/read-only until explicitly deleted or a future backup restore path is used.
- `Example - Native Obsidian Base - All documents.base` — ordinary Obsidian table showing the complete synthetic set.
- `Example - Native Obsidian Base - Awaiting response.base` — ordinary Obsidian table demonstrating a practical filter.

Running the Settings action again restores only the nine canonical synthetic example files after an explicit warning. The working Vault-root register is never overwritten. Historical `PDF Dokumentregister.base` copies and `Example PDF Document Register.base` files are not read, overwritten, moved or deleted, even if they still match old templates. Reinstallation does not recreate a register copy. Unrelated files are never changed.

The duplicate real-register snapshot has been removed from this example set. The canonical register generator remains in `src/metadata/document-register-base-config.js`; use the plugin's standard register action rather than copying an example.

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

The 0.1.228 schema upgrade adds the optional `author` (Forfatter) and `source_url` (Publisert på nettet, HTTP/HTTPS) fields.

System fields are:

- `filemeta_type`
- `filemeta_profile`
- `filemeta_version`
- `filemeta_id`
- `filemeta_file`
- `filemeta_status`

The `document_type` examples cover all four stable canonical values: `decision`, `letter`, `report`, and `memo`. Display labels are presentation and may vary by UI language.
