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

3. **PDF Document Register: automatic and existing-PDF registration practically confirmed**
   - Automatic minimal-record creation for newly detected PDFs is implemented and practically confirmed.
   - Practical test on 2026-10-04 confirmed all of the following:
     - the Settings toggle exists, defaults to enabled and can be disabled;
     - copying a PDF into the vault with Windows File Explorer while Obsidian is running creates a record automatically;
     - UUID, file link and `active` status are correct;
     - DocumentInfo sees the record before user metadata is entered;
     - saving user metadata preserves the same UUID;
     - disabling the toggle prevents automatic record creation.
   - The user-invoked **Register existing PDFs** action is implemented in Settings and was practically confirmed on 2026-10-04:
     - with automatic registration disabled, newly copied PDFs remain unregistered;
     - the scan finds those unregistered PDFs;
     - confirmation creates minimal active records with fresh UUIDs and correct file links;
     - a second scan is idempotent and does not create duplicate records or replace UUIDs.
   - `.pdfium-backup` PDFs and generated benchmark PDFs are excluded by the implementation and automated verifier.
   - Remaining practical identity test: a current PDF sharing a textual path with a retained `missing` record must receive a fresh UUID rather than reusing the missing identity.

4. **PDF Document Register: current user interface needs redesign**
   - The current Document Register user interface was judged unusable/poor in practical testing.
   - Treat this as a UI/interaction redesign task rather than a small cosmetic fix.
   - Keep the new simple lifecycle visible: active records are usable; missing records are informational/read-only; unregistered PDFs can receive new metadata.

5. **Missing documents: live-delete review flow confirmed; offline reconciliation still pending**
   - Practical testing on 2026-10-04 confirmed the complete live-delete flow:
     - deleting a registered PDF while Obsidian is running changes its record to `missing`;
     - the **Missing documents** dialog opens automatically and shows the correct count;
     - **Close** leaves the missing metadata record intact;
     - the Command Palette action reopens the same review;
     - **Delete metadata** removes the missing metadata record;
     - a subsequent review reports no remaining missing documents.
   - Missing is a temporary safety state awaiting user choice, not a relink/recovery identity.
   - Future backup integration should add **Restore from backup** as the alternative resolution path.
   - Still pending: detect PDFs that disappeared while Obsidian/PDFium Gate was not running and bring those records into the same missing-document review flow.

6. **Document deletion: implement approved delete-document-and-metadata workflow**
   - Add an explicit user-facing **Delete document and metadata** operation for an active document.
   - Deliberate PDFium Gate deletion removes/trashes the PDF and its associated active record through one controlled operation.
   - This remains distinct from unexpected/external disappearance, which continues to retain the record as `missing`.
   - Prefer Obsidian's configured trash behavior rather than irreversible raw deletion.
   - Detailed sequencing must fail safely: partial failure should preserve metadata rather than silently lose it.
   - Cleanup of already-missing historical records remains a separate maintenance operation.

7. **Email Import attachments: better support for non-PDF file types**
   - Improve handling of email attachments that are not PDFs.
   - ZIP archives are an explicit practical example that should be supported more clearly.
   - Review how such attachments are retained, represented, opened/exported and linked from the imported email without assuming that every attachment is directly viewable in the PDF-oriented UI.
   - This must not weaken Email Import's existing exact-byte SHA-256 use for retained immutable source/integrity handling.

8. **PDF annotation backup: reassess `.pdfium-backup` after the independent backup solution exists**
   - Keep the current `backupOriginalPdf` safety function for now: it stores one original PDF copy before PDFium Gate first modifies the file and never overwrites an existing copy.
   - Reassess whether this separate per-PDF original-copy mechanism is still needed once the independent backup project provides a validated backup/restore workflow.
   - Do not remove or merge the behavior merely because both features use the word "backup"; compare their actual protection scope, restore semantics and failure modes first.
   - If the generic backup solution fully replaces this protection later, remove the old setting and `.pdfium-backup` workflow through an explicit migration/release decision rather than silently changing behavior.

## Completed items

- **Missing PDF lifecycle and recovery experiment**
  - Practical test confirmed: active record -> unexpected PDF disappearance -> `missing`.
  - Reappearance at the same path did not auto-bind.
  - Exact SHA-256 recovery was experimentally implemented and worked for an unchanged byte-identical PDF.
  - Practical annotation testing then showed why that direction is unsuitable for ordinary editable PDFs: adding a highlight changes SHA-256, and removing the highlight does not restore the previous SHA-256.
  - Product decision: ordinary PDF records use only `active`/`missing`; no SHA recovery, no manual relink and no `trashed` state. Backup/restore plus maintenance replaces that complexity.

