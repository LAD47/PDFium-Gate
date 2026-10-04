# Test observations and deferred fixes

This file is a running list of observations found during practical testing that should be reviewed and fixed later.

## Test baseline

- Current practical test vault: `C:\Obsidian\Vault`
- The vault was recreated as a clean test vault on 2026-10-02.
- Old test data is not considered reliable enough for conclusions about current behavior.
- New test documents should be added manually so each test case has known provenance.
- This list is for observations and deferred fixes; adding an item here does not mean the behavior has been reproduced, diagnosed, or fixed.

## Open items

1. **DocumentInfo: Edit button placement**
   - The **Edit** button should preferably be available both at the top and at the bottom of the DocumentInfo panel.
   - Reason: users entering the panel may not see the current button until they scroll past all metadata fields.

2. **DocumentInfo: metadata field labels ignore Norwegian Bokmål**
   - Metadata field labels are currently shown with English words even when the UI language is set to Norwegian Bokmål.
   - Review localization/presentation so Norwegian Bokmål labels are shown when that language is selected.

3. **PDF Document Register: implement approved minimal-record registration**
   - Current runtime still waits for first metadata save before creating the record.
   - Approved direction: newly detected PDFs may receive a minimal system record automatically (fresh UUID, file link/path and active status; user metadata remains optional/empty).
   - Add a persistent Settings toggle for automatic registration of **newly detected** PDFs; intended default is enabled.
   - Existing/unregistered PDFs are handled separately: offer a one-time/user-invoked scan/action to register them rather than treating "old files" as a permanent toggle.
   - Files copied into the vault through ordinary file management while Obsidian is running must follow the same new-PDF event path when Obsidian reports them.
   - Practical test required: copy PDF into the vault with Windows File Explorer and confirm automatic record creation.
   - Practical test required: choose not to bulk-register existing PDFs and confirm they remain unregistered across restart until the explicit scan/action is used.
   - Practical test required: a new PDF appearing at the same path as a retained missing record receives a new UUID and does not reactivate the missing record.

4. **PDF Document Register: current user interface needs redesign**
   - The current Document Register user interface was judged unusable/poor in practical testing.
   - Treat this as a UI/interaction redesign task rather than a small cosmetic fix.
   - Keep the new simple lifecycle visible: active records are usable; missing records are informational/read-only; unregistered PDFs can receive new metadata.

5. **Document deletion: implement approved delete-document-and-metadata workflow**
   - Add an explicit user-facing **Delete document and metadata** operation for an active document.
   - Deliberate PDFium Gate deletion removes/trashes the PDF and its associated active record through one controlled operation.
   - This remains distinct from unexpected/external disappearance, which continues to retain the record as `missing`.
   - Prefer Obsidian's configured trash behavior rather than irreversible raw deletion.
   - Detailed sequencing must fail safely: partial failure should preserve metadata rather than silently lose it.
   - Cleanup of already-missing historical records remains a separate maintenance operation.

6. **Email Import attachments: better support for non-PDF file types**
   - Improve handling of email attachments that are not PDFs.
   - ZIP archives are an explicit practical example that should be supported more clearly.
   - Review how such attachments are retained, represented, opened/exported and linked from the imported email without assuming that every attachment is directly viewable in the PDF-oriented UI.
   - This must not weaken Email Import's existing exact-byte SHA-256 use for retained immutable source/integrity handling.

## Completed items

- **Missing PDF lifecycle and recovery experiment**
  - Practical test confirmed: active record -> unexpected PDF disappearance -> `missing`.
  - Reappearance at the same path did not auto-bind.
  - Exact SHA-256 recovery was experimentally implemented and worked for an unchanged byte-identical PDF.
  - Practical annotation testing then showed why that direction is unsuitable for ordinary editable PDFs: adding a highlight changes SHA-256, and removing the highlight does not restore the previous SHA-256.
  - Product decision: ordinary PDF records use only `active`/`missing`; no SHA recovery, no manual relink and no `trashed` state. Backup/restore plus maintenance replaces that complexity.

