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
   - Final practical identity test on 2026-10-04 also passed:
     - the original record changed to `missing`;
     - a different PDF copied to the same path stayed unregistered while automatic registration was disabled;
     - **Register existing PDFs** registered the new PDF;
     - the new PDF received a fresh UUID different from the historical missing record;
     - the old record remained `missing` with its original UUID.
   - Registration identity behavior is therefore practically confirmed for both new and existing PDFs.

4. **PDF Document Register: current user interface needs redesign**
   - The current Document Register user interface was judged unusable/poor in practical testing.
   - Treat this as a UI/interaction redesign task rather than a small cosmetic fix.
   - Keep the new simple lifecycle visible: active records are usable; missing records are informational/read-only; unregistered PDFs can receive new metadata.

5. **Missing documents: live-delete and offline reconciliation practically confirmed**
   - Practical testing on 2026-10-04 confirmed the complete live-delete flow:
     - deleting a registered PDF while Obsidian is running changes its record to `missing`;
     - the **Missing documents** dialog opens automatically and shows the correct count;
     - **Close** leaves the missing metadata record intact;
     - the Command Palette action reopens the same review;
     - **Delete metadata** removes the missing metadata record;
     - a subsequent review reports no remaining missing documents.
   - Offline startup reconciliation is implemented and practically confirmed:
     - reconciliation is scheduled from layout readiness through idle scheduling;
     - a metadata-cache `resolved` event may also request scheduling but is not required, avoiding the missed-event startup bug found during testing;
     - the record scan stays off the critical startup path;
     - closing Obsidian, deleting a registered PDF externally, and restarting Obsidian opens the **Missing documents** dialog automatically;
     - the offline-deleted PDF changes from `active` to `missing`;
     - the record keeps the same UUID;
     - a control PDF that still exists remains `active`;
     - existing `missing` records remain unchanged;
     - benchmark records are excluded;
     - resolver/infrastructure uncertainty fails closed without changing status.
   - Known non-goal: if a different PDF replaces the original at the exact same path while Obsidian is closed, path-only reconciliation cannot distinguish that replacement from the original file.
   - Missing is a temporary safety state awaiting user choice, not a relink/recovery identity.
   - Future backup integration should add **Restore from backup** as the alternative resolution path.

6. **Document deletion: current missing-document flow accepted**
   - Product decision on 2026-10-05: do not add a separate **Delete document and metadata** command at this stage.
   - The practically confirmed flow is the accepted behavior:
     - deleting a registered PDF changes its record to `missing`;
     - the **Missing documents** review gives the user an explicit second decision;
     - **Delete metadata** removes the retained missing record only when the user chooses it.
   - This deliberately avoids silently deleting metadata together with the PDF and leaves room for a future **Restore from backup** action in the same review flow.
   - Revisit a one-step delete command only if practical use later shows a clear need.

7. **Email Import -> Archive Import ZIP handoff: implemented; practical email test pending**
   - The first Email Import-specific ZIP implementation was abandoned after practical testing exposed the architectural duplication.
   - Email Import now owns only the source email relationship: it exports the original ZIP beside the generated email PDF and links that ZIP as the source attachment.
   - The created ZIP is then routed to the generic Archive Import module, which owns inspection, aggregate unsupported-file choice, safe extraction, folder preservation, PDF registration and Archive Relationship creation.
   - PDFs nested inside ZIP are no longer treated as direct email attachments. Their relationship is `email PDF -> original ZIP -> archive member`.
   - Direct PDF email attachments still retain their existing `email_import_attachment_*` provenance.
   - Archive Import's manual ZIP path is already practically confirmed, including PDF registration, DocumentInfo relationship presentation and clickable PDF/file relations.
   - Automated regression now verifies that Email Import creates only the original ZIP and hands the created file to Archive Import; it must not create archive members itself.
   - First practical combined handoff test on 2026-10-05: the EML imported successfully, but the original ZIP attachment and its extraction folder were not created. The setting **Trekk ut e-postvedlegg automatisk** was confirmed enabled, so the failure is before Archive Import receives a ZIP and is currently scoped to the Email Import attachment-export boundary.
   - The next diagnostic is the built-in `lastEmailAttachmentExport` snapshot from the same import, to distinguish a skipped export from a controller failure.
   - Practical combined handoff verification therefore remains open.

8. **PDF annotation backup: reassess `.pdfium-backup` after the independent backup solution exists**
   - Keep the current `backupOriginalPdf` safety function for now: it stores one original PDF copy before PDFium Gate first modifies the file and never overwrites an existing copy.
   - Reassess whether this separate per-PDF original-copy mechanism is still needed once the independent backup project provides a validated backup/restore workflow.
   - Do not remove or merge the behavior merely because both features use the word "backup"; compare their actual protection scope, restore semantics and failure modes first.
   - If the generic backup solution fully replaces this protection later, remove the old setting and `.pdfium-backup` workflow through an explicit migration/release decision rather than silently changing behavior.

## Completed items

- **Archive Import: manual ZIP extraction and PDF handoff practically confirmed**
  - Practical tests confirmed on 2026-10-05 by dragging ZIP files into the Obsidian vault.
  - Important trigger condition: Archive Import currently reacts to the Obsidian-side vault create event. Dragging the ZIP into Obsidian triggers the flow; moving/copying the ZIP directly into the vault with Windows File Explorer did not trigger Archive Import in the practical test environment.
  - Baseline extraction test points 1-5 all passed:
    - ZIP was detected automatically;
    - original ZIP remained in the vault;
    - a dedicated subfolder named from the ZIP was created;
    - all four synthetic files were extracted;
    - nested directory structure was preserved.
  - PDF handoff test points 1-7 all passed with a second ZIP containing two PDFs:
    - ZIP was extracted successfully;
    - both PDFs appeared in the expected preserved folder structure;
    - both PDFs received normal PDFium Gate metadata records;
    - both records had `filemeta_status: active`;
    - each PDF received its own UUID.
  - This practically confirms the modular chain: ZIP -> Archive Import -> extracted files -> existing automatic PDF registration.
  - Archive relationships are now practically confirmed:
    - each extracted PDF has a plugin-managed Archive Relationship block in its existing File Metadata Markdown record;
    - the relationship links back to the source ZIP and to every other extracted member from the same archive, while excluding the PDF itself;
    - DocumentInfo presents these relations directly as **Vedlegg fra ZIP**, **Kildearkiv** and **Filer i samme arkiv**, so users do not need to locate or inspect technical File Metadata Markdown records;
    - practical click tests 1-4 passed: PDF-to-PDF and PDF-to-ordinary-file links open the intended vault file;
    - the explicit DocumentInfo link activation routes through Obsidian `workspace.openLinkText`, preserving normal Obsidian link handling.
  - This confirms the preferred UX boundary: users work with archive relationships through DocumentInfo; the File Metadata Markdown relationship block remains an implementation/storage detail.
  - External filesystem arrival detection for ZIP files is not yet implemented/confirmed and should be treated separately from the current Obsidian drag/drop trigger.

- **Missing PDF lifecycle and recovery experiment**
  - Practical test confirmed: active record -> unexpected PDF disappearance -> `missing`.
  - Reappearance at the same path did not auto-bind.
  - Exact SHA-256 recovery was experimentally implemented and worked for an unchanged byte-identical PDF.
  - Practical annotation testing then showed why that direction is unsuitable for ordinary editable PDFs: adding a highlight changes SHA-256, and removing the highlight does not restore the previous SHA-256.
  - Product decision: ordinary PDF records use only `active`/`missing`; no SHA recovery, no manual relink and no `trashed` state. Backup/restore plus maintenance replaces that complexity.

