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

7. **Email Import ZIP attachments: implemented; practical test in progress**
   - ZIP attachments are now inspected as containers while the original ZIP remains the ordinary source-attachment link target.
   - Each ZIP expands into its own dedicated subfolder and preserves internal directory structure.
   - PDFs inside ZIP are routed through normal PDF attachment registration/provenance and become ordinary PDFium Gate documents.
   - Common text/image/media formats are copied as ordinary vault files.
   - Other formats trigger one aggregate decision: copy anyway, skip unsupported entries, or do not extract ZIP contents.
   - Archive path traversal and bounded entry-count/size/compression checks fail closed.
   - Synthetic EML/ZIP fixture generation is included for practical testing, including PDF-only, mixed supported, unsupported-format, and 35-file cases.
   - First practical PDF-only ZIP test on 2026-10-05: email import and preservation of the original ZIP succeeded, but the dedicated ZIP subfolder and extracted PDF were not created (test points 3-4 failed).
   - Installed `main.js` SHA-256 matched the freshly built repository `main.js`, and the generated runtime contains the ZIP extraction code, ruling out a stale deployed plugin.
   - Follow-up regression coverage now passes the synthetic ZIP through the real EML parser before ZIP inspection/extraction, and runtime item failures are logged explicitly for the next practical diagnosis.
   - Practical Obsidian verification remains open until the extraction failure is resolved.

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

