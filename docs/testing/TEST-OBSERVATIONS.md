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

3. **PDF Document Register: current user interface needs redesign**
   - The current Document Register user interface was judged unusable/poor in practical testing.
   - Treat this as a UI/interaction redesign task rather than a small cosmetic fix.
   - Keep the new simple lifecycle visible: active records are usable; missing records are informational/read-only; unregistered PDFs can receive new metadata.

4. **PDF annotation backup: reassess `.pdfium-backup` after the independent backup solution exists**
   - Keep the current `backupOriginalPdf` safety function for now: it stores one original PDF copy before PDFium Gate first modifies the file and never overwrites an existing copy.
   - Reassess whether this separate per-PDF original-copy mechanism is still needed once the independent backup project provides a validated backup/restore workflow.
   - Do not remove or merge the behavior merely because both features use the word "backup"; compare their actual protection scope, restore semantics and failure modes first.
   - If the generic backup solution fully replaces this protection later, remove the old setting and `.pdfium-backup` workflow through an explicit migration/release decision rather than silently changing behavior.

## Completed items

- **Email/ZIP transport-source redesign: flat email layout and external-ZIP reconciliation practically confirmed**
   - **Current replacement model (implemented after the practical UX review on 2026-10-05):** EML/MSG and ZIP are transport sources. A generated email PDF and one localized sibling attachment folder are paired deterministically; Norwegian Bokmål appends ` Vedlegg` to the PDF base name. Direct attachments and members from every ZIP in the email are planned together before durable writes; the email PDF lists the actual imported files, ZIP names are group/provenance labels rather than live link targets, and source ZIP files are not persisted for successful email imports.
   - Exact EML/MSG retention is now advanced opt-in and defaults to off. Automatic staging EML/MSG is deleted only after verified success; failed/cancelled imports keep the source.
   - Manual Archive Import is now transactional: complete preflight before extraction, byte read-back verification, PDF registration and relationship persistence, then source ZIP deletion. Partial failures roll back created output and fresh PDF metadata; the user is warned and chooses **Keep ZIP** or **Delete ZIP**.
   - Archive Import now reconciles externally copied ZIP files on startup and when Obsidian regains focus, covering the Windows File Explorer path without continuous polling. Practical focus-reconciliation verification passed on 2026-10-06: a ZIP copied directly into the Vault with Windows File Explorer while Obsidian was running was detected when Obsidian regained focus, imported automatically with its directory structure preserved, and the source ZIP was deleted after successful import.
   - Automated regression is green for multiple ZIPs in one email, one common attachment folder, collision suffixing, direct links in the email PDF, no persisted email ZIP transport files, archive provenance without a live ZIP path, rollback, successful source deletion, failed-source keep/delete, and external ZIP reconciliation.
   - Practical verification of the replacement model passed on 2026-10-05 with a synthetic email containing one direct PDF and two ZIP attachments:
     - automatic EML import succeeded and the staging EML was removed after verified success;
     - one attachment folder was created for the email;
     - direct attachment plus members from both ZIPs were present in that one folder;
     - neither source ZIP remained in the vault;
     - the generated email PDF showed the complete attachment list, with ZIP filenames acting only as group/provenance labels;
     - direct links to the direct PDF and PDFs from both ZIPs opened the actual imported PDFs without a ZIP chooser;
     - DocumentInfo on PDFs from the ZIPs showed the parent-email relationship and original ZIP provenance.
   - User-facing naming refinement was then practically confirmed: the attachment folder uses a localized suffix rather than exactly matching the email PDF base name. Norwegian Bokmål uses ` Vedlegg` (for example `2026-10-05 - Subject Vedlegg/`); equivalent localized suffixes are implemented for all supported UI locales.
   - Follow-up UX observation: email attachments should not create ZIP-derived subfolders inside that one attachment folder. Email ZIP members are therefore flattened to file basenames; original archive-member paths remain technical provenance. Filename collisions are resolved with deterministic suffixes such as ` (2)`. Manual Archive Import remains intentionally different and still preserves the ZIP's directory structure.
   - Automated regression covers localized naming, flattening and collision handling. Practical verification of the final flat layout passed on 2026-10-06 with `zip-01-pdf-only.eml`: both ZIP-contained PDFs were imported into the single localized sibling attachment folder, the original `underkatalog/` path was not exposed as a user-facing subfolder, the source ZIP did not remain in the Vault, both generated email-PDF links opened the correct PDFs, and DocumentInfo preserved the ZIP provenance.
   - **Historical superseded prototype evidence:** the notes below are retained to preserve the diagnostic path that led to the redesign. They do not describe current new-import behavior.
   - The first Email Import-specific ZIP implementation was abandoned after practical testing exposed the architectural duplication.
   - Email Import now owns only the source email relationship: it exports the original ZIP beside the generated email PDF and links that ZIP as the source attachment.
   - The created ZIP is then routed to the generic Archive Import module, which owns inspection, aggregate unsupported-file choice, safe extraction, folder preservation, PDF registration and Archive Relationship creation.
   - PDFs nested inside ZIP are no longer treated as direct email attachments. Their relationship is `email PDF -> original ZIP -> archive member`.
   - Direct PDF email attachments still retain their existing `email_import_attachment_*` provenance.
   - Archive Import's manual ZIP path is already practically confirmed, including PDF registration, DocumentInfo relationship presentation and clickable PDF/file relations.
   - Automated regression now verifies that Email Import creates only the original ZIP and hands the created file to Archive Import; it must not create archive members itself.
   - First practical combined handoff test on 2026-10-05: the EML imported successfully, but the original ZIP attachment and its extraction folder were not created. The setting **Trekk ut e-postvedlegg automatisk** was confirmed enabled, so the failure is before Archive Import receives a ZIP and is currently scoped to the Email Import attachment-export boundary.
   - The built-in `lastEmailAttachmentExport` snapshot identified the concrete failure as `{ ok:false, reason:'not-email-import' }`.
   - Root cause: if automatic PDF registration created the minimal document record before Email Import saved its technical provenance, metadata repository `updateRecord()` rewrote only schema-defined user fields and dropped non-schema extension values such as `email_import_source_sha256`. The newly created email PDF therefore immediately lost its Email Import identity.
   - Fix: metadata record updates now persist the union of schema-defined properties and non-system extension values already present in the record value set, while still rejecting `filemeta_*`/legacy system namespaces. This makes update behavior consistent with record creation and preserves technical extension metadata through later status/rename updates.
   - A dedicated metadata-repository regression test verifies technical extension persistence, status-update preservation and explicit removal via empty value.
   - Full CI is green on the fix.
   - Practical retest after the metadata fix: the generated email PDF and original ZIP attachment were both created successfully, confirming the previous `not-email-import` failure is fixed. However, the dedicated extraction folder was not created, so the remaining failure is now isolated to the Email Import -> Archive Import handoff/execution boundary after ZIP creation.
   - The next diagnostic was the `archiveResult` embedded in `lastEmailAttachmentExport`.
   - That diagnostic reported a complete Archive Import success (`extractedArchiveCount: 1`, target folder `05 test/Metadata-Fix-Handoff`, three extracted paths, two linked PDFs, no relationship failures), but a direct Windows filesystem check immediately afterward showed `Test-Path C:\\Obsidian\\Vault\\05 test\\Metadata-Fix-Handoff -> False`.
   - This exposed a false-success persistence boundary: runtime believed writes succeeded although the expected folder/files were not present at the tested filesystem path.
   - Obsidian's public API contract requires `Vault.createBinary()` / `modifyBinary()` data to be `ArrayBuffer`. The shared vault-write adapter now normalizes Buffer/typed-array inputs to exact ArrayBuffer slices.
   - Archive Import now reads every newly created archive member back through the vault API and byte-compares it before counting the member as successfully extracted; its result also includes the resolved vault root path for diagnostics.
   - Full CI is green on the write-contract/read-back hardening.
   - Fresh practical EML retest after the write-contract fix succeeded at the persistence boundary:
     - the email PDF was created;
     - the original `Persistence-Check.zip` was created;
     - direct Windows `Test-Path` confirmed `C:\\Obsidian\\Vault\\05 test\\Persistence-Check` exists;
     - recursive filesystem listing confirmed `rapport.pdf`, `Vedlegg/vedtak.pdf` and `Vedlegg/notat.txt` exist physically in the expected structure.
   - The runtime diagnostic from the same run independently agrees with the filesystem result: vault root `C:\\Obsidian\\Vault`, one extracted archive, three extracted members, two linked PDFs and no relationship failures.
   - This practically confirms the persistence portion of the combined chain `Email Import -> original ZIP -> Archive Import -> physical extracted files`.
   - Final DocumentInfo verification passed: both extracted PDFs show the expected Archive Relationship section, PDF-to-PDF and PDF-to-text links open correctly, and `vedtak.pdf` links back to `rapport.pdf`.
   - A final UX issue was then found in the generated email PDF: clicking the original ZIP attachment still opened the ZIP container rather than an extracted PDF.
   - Updated click rule: the parent email relationship continues to point to the original ZIP for provenance, but the generated email PDF's attachment click now resolves Archive Relationship members. One extracted PDF opens directly; multiple extracted PDFs require an explicit chooser; zero resolved PDFs fall back to the original ZIP.
   - Automated regression covers both one-PDF direct routing and multiple-PDF chooser routing.
   - Final practical ZIP-click verification passed on 2026-10-05:
     - clicking the ZIP attachment in the existing generated email PDF opened **Velg PDF fra ZIP**;
     - both `rapport.pdf` and `vedtak.pdf` were offered as choices;
     - choosing `rapport.pdf` opened the extracted report PDF rather than the ZIP;
     - choosing `vedtak.pdf` opened the extracted decision PDF rather than the ZIP.
   - The complete practical chain is therefore confirmed: `EML -> generated email PDF -> retained/original ZIP -> Archive Import -> physical extraction -> PDF registration -> Archive Relationship -> DocumentInfo -> user-facing PDF selection/opening`.

- **PDF Document Register: automatic and existing-PDF registration practically confirmed**
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

- **Missing documents: live-delete and offline reconciliation practically confirmed**
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

- **Document deletion: current missing-document flow accepted**
   - Product decision on 2026-10-05: do not add a separate **Delete document and metadata** command at this stage.
   - The practically confirmed flow is the accepted behavior:
     - deleting a registered PDF changes its record to `missing`;
     - the **Missing documents** review gives the user an explicit second decision;
     - **Delete metadata** removes the retained missing record only when the user chooses it.
   - This deliberately avoids silently deleting metadata together with the PDF and leaves room for a future **Restore from backup** action in the same review flow.
   - Revisit a one-step delete command only if practical use later shows a clear need.

- **Archive Import legacy visible-ZIP prototype: practically confirmed, now superseded**
  - The following practical tests were completed on 2026-10-05 against the earlier visible-source-ZIP design. They remain useful regression/history evidence, but the replacement transport-source model now deletes successful ZIP sources and requires a new practical verification pass.
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
  - Historical note: external filesystem arrival detection was not implemented in this prototype. The replacement model now implements startup/focus reconciliation, which was practically confirmed on 2026-10-06 by copying a ZIP into the Vault with Windows File Explorer and returning focus to Obsidian.

- **Missing PDF lifecycle and recovery experiment**
  - Practical test confirmed: active record -> unexpected PDF disappearance -> `missing`.
  - Reappearance at the same path did not auto-bind.
  - Exact SHA-256 recovery was experimentally implemented and worked for an unchanged byte-identical PDF.
  - Practical annotation testing then showed why that direction is unsuitable for ordinary editable PDFs: adding a highlight changes SHA-256, and removing the highlight does not restore the previous SHA-256.
  - Product decision: ordinary PDF records use only `active`/`missing`; no SHA recovery, no manual relink and no `trashed` state. Backup/restore plus maintenance replaces that complexity.

