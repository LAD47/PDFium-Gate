# PDF Document Register / Obsidian Bases

The custom `pdfium-document-register` view is a presentation/editing layer over Obsidian Bases and the canonical DocumentRecords write path. Bases remains query/sort owner; the custom view must not become a second metadata database.

## Native Base examples versus the PDFium Gate document register

PDFium Gate intentionally exposes two different Bases concepts and the UI/documentation must keep them distinct:

- the optional files under `Examples-Obsidian-PDFium-Gate/` use Obsidian's built-in `table` view over synthetic Markdown/YAML records; they exist only to teach the portable metadata model and normal Bases filtering/sorting;
- `PDF Dokumentregister.base` is the real register for user documents. It is created on demand, queries real records under `File Metadata/`, and uses the custom `pdfium-document-register` view.

The example package must never query or mutate real registered PDFs. The real register remains create-once/user-owned after creation. Example-package reinstall is a separate explicit Settings action: it may overwrite the known canonical example files after confirmation, but it must preserve unrelated files and any modified legacy example Base.

## Current missing-document policy

Missing records are visible historical metadata and are read-only in the document register. The register must not offer manual PDF selection, relink or SHA-based recovery for ordinary PDFs. If a PDF exists without an active record, it is handled as an unregistered document and can receive new metadata through the normal metadata workflow.

Cleanup of retained missing records belongs to the backup-backed maintenance workflow described in [Document metadata backup and maintenance plan](../planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md).


## 0.1.196 Bases presentation and future localization boundary

The permanent metadata contract remains language-neutral. `field.property`, select/multiselect option `value`, UUID identities and `filemeta_*` system properties are storage/API identifiers, not localized UI strings.

DocumentInfo and the PDF document-register Bases presentation consume the same metadata schema and field-type registry for user-facing formatting. A select value such as `letter` may therefore render as the schema label `Brev` without modifying the Markdown record.

The custom Bases view type `pdfium-document-register` is presentation-only. Bases remains the query/filter engine and supplies the record entries; the view does not create a second document database or a parallel index.

Future multilingual UI is an explicit roadmap requirement. UI language must remain separate from regional date/time/decimal formatting. Locale-specific labels may be added later, but changing language must never migrate or rewrite stable stored metadata values.

## 0.1.197 editable document-register boundary

The custom `pdfium-document-register` Bases view may edit user metadata fields inline, but it is not a persistence owner. The view renders edit controls through the same `metadataFieldTypeRegistry` used by DocumentInfo, then routes canonical field patches through the root-bound `saveDocumentMetadataRecordValues` operation owned by `DocumentRecordsFeature`.

Rules:

- Bases continues to own query/filter membership and provides the record entries.
- The custom view owns presentation and edit interaction only.
- The view must not call `processFrontMatter`, Vault write APIs, or serialize YAML directly.
- `FieldTypeRegistry.parseNormalizeValidate` is the validation gate before every inline save.
- A field update is a narrow patch; `DocumentRecordsFeature` merges it into the existing record and performs the canonical read-back verification.
- Select/multiselect controls expose schema labels but persist stable option `value`s.
- Date/time/decimal inputs use the current regional presentation while preserving canonical stored values.
- Missing PDF records are read-only in the document register until a separate missing-file workflow is explicitly designed.

This keeps DocumentInfo and the document register on one metadata write path and prevents UI-specific storage behavior from becoming a second source of truth.

## 0.1.204 standard Dokumentregister ownership

`DocumentRegisterBasesFeature` owns the end-user entry point to the document register and the **create-once** standard Base file `PDF Dokumentregister.base`. The Base file is not metadata source of truth; it is a user-facing query/view configuration over ordinary indexed Markdown records.

Creation rules:

- creation is lazy and happens only through **PDF: Åpne Dokumentregister**;
- if the canonical Base file already exists, it is reused and never modified by the plugin;
- generated membership is constrained to `File Metadata` + `filemeta_type == "pdf"`;
- generated property labels come from the current metadata schema and respect `show_in_default_base`;
- technical UUID/record filenames are not standard columns;
- default sort is `document_date` descending, with `file.mtime` descending only when `document_date` is unavailable.

The custom `pdfium-document-register` view remains a presentation/edit surface, not a metadata persistence owner. It renders human status and PDF actions, while user field writes continue through `saveDocumentMetadataRecordValues`. Missing records remain informational/read-only and are not rebound from this view. Native Bases continues to own membership, filtering, sorting and search.

## 0.1.205 clickable register headers test boundary

The custom `pdfium-document-register` view may expose lightweight header interactions without taking ownership of the underlying document database. Sorting mutates only the Bases view sort configuration; query execution and ordering remain Bases responsibilities. The first filter prototype is deliberately transient view state, never a metadata writer and never a `.base` filter writer, so user-owned Base filter configuration cannot be overwritten during the UX experiment.

## 0.1.206 schema-aware header filter test boundary

The custom document-register view may derive transient filter controls from the existing metadata schema and FieldTypeRegistry. Machine values remain canonical: select/multiselect filters compare stored option values, boolean filters compare booleans, and date/time/numeric range bounds are parsed and validated through the existing field-type contract. Human labels and regional formatting remain presentation only.

These filters are intentionally view-local test state. They do not call `BasesViewConfig.set('filters', ...)`, do not rewrite `PDF Dokumentregister.base`, and do not participate in metadata persistence. Multiple active column filters are combined as AND after Bases has already produced the view's query result. This keeps the experiment reversible while preserving existing Bases query ownership and the single canonical metadata write path.

## 0.1.207 combined sort/filter test boundary

The custom document-register view may combine two distinct query/presentation concerns without creating a second data engine. Bases remains the owner of query membership and sort order. The view receives the Bases result, then applies the existing transient schema-aware header filters as an additional presentation-level narrowing step.

Ordinary header click replaces the current Bases sort list with one property and toggles ASC/DESC. Shift+click edits the existing Bases sort list to add, reverse or remove secondary/tertiary sort keys. Sort priority is presentation-only. Header filters remain transient view state and must not write `BasesViewConfig.filters`, `.base` files, metadata records, or DocumentRecords state.

## 0.1.208 recovery boundary

0.1.208 is a constrained recovery build for the Document Register header. Multi-column/Shift sorting from 0.1.207 was removed after a user-confirmed regression. The previously confirmed single-column Bases sorting path from 0.1.206 was restored together with the 0.1.206 datatype-aware transient header filters. No canonical metadata, DocumentRecords, cache/startup, identity, or PDF-runtime contracts changed.

## 0.1.209 simple sort interaction boundary

The PDF Document Register keeps Bases as the sole owner of query ordering. The custom view exposes only a deterministic single-column interaction: an unsorted column starts `ASC`, subsequent ordinary clicks toggle `ASC`/`DESC`, and choosing a different column replaces the previous sort key. Shift/multi-column sort behavior is intentionally absent. Existing datatype-aware header filters remain transient presentation state and may coexist with the Bases-owned sort order without writing Base filter configuration.

## 0.1.210 Bases sort write boundary

Document Register header sorting uses the Bases runtime sort operation `BasesViewConfig.setSortProperty(...)`; it must not write the serialized `sort` key through generic `config.set`. The product contract remains one active sort property, ordinary click only, ASC/DESC toggle. Header filtering remains transient view-local state and is independent of the Bases sort configuration.

## 0.1.211 optional header-filter persistence boundary

The `pdfium-document-register` custom view may optionally persist its own datatype-aware header-filter state, but this does not transfer query ownership away from Bases. The user setting `rememberDocumentRegisterFilters` is default-off. When enabled, the view serializes sanitized state under the custom view-config key `pdfiumHeaderFilters` via `BasesViewConfig.set`; on restore it reads only that key and rejects unknown filter shapes.

This custom state is distinct from native Base `filters`: the plugin must not write `config.set('filters', ...)` and must not rewrite `PDF Dokumentregister.base` directly. Native Bases continues to determine query membership and sort order; the custom view only narrows the already-produced result for its own header-filter UX.

0.1.211 also restores release-version consistency: renderer `PLUGIN_VERSION`, manifest/package version, and the generated runtime bridge filename are aligned. The stale pre-release `main-bridge-0.1.205.js` may be removed only after the current versioned bridge has been successfully written and loaded. The Main Bridge source itself is unchanged.

## 0.1.223 profile filter

The standard PDF Document Register remains a PDF-specific user view, but its Base filter now targets the generic record layer with both `filemeta_type == "pdf"` and `filemeta_profile == "document"`. This keeps the current UI simple while allowing future registers to select other type/profile combinations.

## 0.1.227 compact columns and PDF-link boundary

The first Document Register redesign slice keeps the custom view but reduces table width and removes an unnecessary action control.

- The PDF system column is the first table column and renders the resolved PDF filename as a normal clickable Obsidian-style internal link. There is no separate **Open** button. Missing PDFs render the remembered filename/path as non-clickable muted text.
- The custom view exposes a **Columns…** chooser containing schema-driven metadata columns plus the Status and PDF system columns.
- The **Columns…** control is placed at the left edge of the register toolbar so it is visible next to the result area instead of being pushed to the far right.
- Column visibility is presentation state only. It does not add/remove metadata fields, rewrite document records, or change the metadata schema.
- Visibility is stored under the custom Bases view-config key `pdfiumHiddenColumns`, so the choice belongs to that Base view. Unknown/stale property names are ignored when read back.
- Hiding a column does not silently remove a filter on that property; filter state remains independent presentation state and becomes accessible again when the column is shown.
- At least one column must remain visible.
- Newly created standard `PDF Dokumentregister.base` files start compact: `document_date`, `sender`, `document_type`, Status and PDF are visible, while the standard time/response-detail columns start hidden. User-defined fields that are enabled for the default Base are not automatically hidden.
- The create-once ownership rule still applies. Existing user-owned Base files are not rewritten to adopt these defaults; their visibility changes only when the user uses the column chooser.


## 0.1.227 document-status filters

The second contained Document Register redesign slice turns the health overview into five quick filters above the result area, in this order: **Active**, **Missing**, **Errors**, **Unregistered**, **All**.

- **Active** counts valid, unambiguous records whose lifecycle state is `active` and filters the normal register table to those rows.
- **Missing** counts valid, unambiguous records whose lifecycle state is `missing` and filters the normal register table to those rows.
- **Errors** counts metadata-record files that are invalid/corrupt or participate in ambiguous record-ID/PDF-path identity. Because such files cannot always appear as valid Base rows, this filter renders a focused problem list in the same register surface, with the metadata file, any known PDF path and a problem reason.
- For invalid/corrupt records, the document-record index also retains the exact parser/validation error in RAM (for example an invalid UUID, unsupported type/profile, wrong format version, invalid status, unsupported file link, missing YAML frontmatter or YAML parse failure). The Error view shows this detail below the broad **Invalid metadata record** category. This diagnostic detail is derived from the canonical parser and is not written back into the metadata file.
- **Unregistered** counts user PDF files accepted by the normal registration scan that do not currently resolve to an active metadata record. This filter renders those concrete PDF paths in the same result surface.
- **All** is last and resets the quick status filter to the normal valid registered-record table. Its count is Active + Missing; Errors and Unregistered are maintenance states outside the valid Base-row set and are therefore not included in the All count.
- Technical backup PDFs and benchmark PDFs remain excluded through the existing registration-file policy.
- Quick status filters are transient view state and do not rewrite native Base filters, metadata records or the schema. Existing per-column header filters remain independent and continue to apply to the normal Active/Missing/All table.
- Table text is explicitly selectable/copyable, including diagnostic paths, validation messages and long technical values. Inline-edit cells must not enter edit mode when the click completes a non-empty text selection inside that cell; Enter/F2 and ordinary unselected clicks still enter the existing editor.
- Problem-list metadata-file links and unregistered PDF links are ordinary Obsidian links. This slice deliberately does not add destructive delete/repair actions; those require separate safety/UX decisions.
- The filter bar is rendered even when the Base query has no valid rows, because an empty table may still coexist with invalid records or unregistered PDFs.
- Invalid-record paths are maintained by the same record-index lifecycle used by DocumentInfo and registration. A record that is corrected or deleted must leave the Errors count without requiring a full restart.
- Before the Errors summary is returned, the in-memory invalid-record set is self-healed against the live Obsidian vault: an invalid-record path that is confirmed to no longer exist as a Markdown file is removed from RAM state automatically. This does **not** delete or modify any file. If vault lookup is unavailable or throws, the path is retained (fail closed) rather than being silently discarded.
- The custom Bases view consumes the summary through an explicit host port; it does not scan/write metadata itself.

