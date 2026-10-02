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

3. **PDF Document Register: PDFs without user metadata are not registered**
   - A PDF dragged into the vault does not appear in **PDF Dokumentregister** until the user first saves a metadata value.
   - Reconsider the current lazy-first-save model.
   - Preferred direction to evaluate: automatically create a minimal system record (UUID, file link/path, status and SHA-256) when a PDF is discovered, while leaving all user metadata fields optional/empty.

## Completed items

_None yet._
