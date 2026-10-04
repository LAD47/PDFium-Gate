# Document records, identity and startup cache

Markdown/YAML document records are the permanent metadata source of truth. Indexes and caches exist only to accelerate access and must remain rebuildable.

## Document-record layer

`src/plugin/features/16-document-records.js` is the single owner of per-PDF metadata-record identity, persistence orchestration and RAM indexing. It consumes the canonical schema through a port and does not call back into DocumentInfo; lifecycle owns cross-feature refresh orchestration so the feature graph remains acyclic.

Permanent records are ordinary Markdown notes under `File Metadata/<first-two-UUID-hex>/<filemeta_id>.md`. The root remains a normal indexed vault folder so Obsidian properties and Bases can consume the records. Since 0.1.195, the root may be visually hidden from File Explorer by a presentation-only feature; it is not moved into a dot-folder or excluded from indexing. `.pdf-metadata/` remains reserved for hidden technical config and backup.

Each record has stable UUID v4 identity and canonical system properties `filemeta_type`, `filemeta_profile`, `filemeta_version`, `filemeta_id`, `filemeta_file`, and `filemeta_status`. Ordinary PDF document records have only two supported lifecycle states: `active` and `missing`. `filemeta_file` is an Obsidian wikilink to the PDF. User metadata values use the schema properties directly. Markdown/YAML is source of truth; `state.documentRecords` is cache/index only.

The index has two canonical lookup directions: active unambiguous `byPdfPath` and unique `byId`. Duplicate active PDF-path bindings fail closed. The current runtime still creates records lazily on first valid DocumentInfo save, but that behavior is now an implementation gap: the approved next direction is automatic minimal system records for PDFs according to the registration policy below. Existing frontmatter updates use the `FileManager.processFrontMatter` platform adapter and are read back/validated before the index is replaced.

Vault lifecycle listeners are installed only after workspace layout readiness. PDF rename/move updates the existing record's `filemeta_file`. PDF deletion retains the metadata note and changes status to `missing`; it is not automatically rebound if a different PDF later appears at the same path. Manual record create/modify/rename/delete updates only the affected index entries.

## Approved minimal-record registration direction

**Decision date:** 2026-10-04  
**Implementation status:** Pending.

The target model is that a PDF managed by PDFium Gate can have a minimal active record even when the user has never entered user metadata. The minimal record contains the canonical system identity/state only (including UUID, file link and `active` status); schema-defined user metadata fields may remain empty.

Registration behavior is intentionally split into two different user choices:

1. **New PDFs** — a persistent setting controls whether newly detected PDFs receive a minimal record automatically. The intended default is enabled. A PDF added while Obsidian/PDFium Gate is running should use the same lifecycle path regardless of whether it was created through Obsidian or copied into the vault with ordinary file management, once Obsidian reports the vault `create` event.
2. **PDFs that already existed before PDFium Gate/this feature** — bulk registration is an explicit user action, not a persistent "old files" toggle. On first relevant onboarding, PDFium Gate may count unregistered existing PDFs and ask whether the user wants to register them. The same action remains available later from Settings so the user can defer the choice and run it manually.

The lifecycle listener remains registered only after workspace layout readiness. This deliberately avoids treating Obsidian's startup `create` notifications for every already-loaded vault file as genuine new-file events.

A runtime `create` event for a PDF follows fail-closed rules:

- if an unambiguous active record already owns the canonical PDF path: no-op;
- if no active record owns the path and automatic new-PDF registration is enabled: create one new minimal active record with a fresh UUID;
- an older `missing` record with the same persisted path does not block creation of the new record and is never reactivated; the new PDF receives a new UUID;
- record-creation failure must not modify/delete the PDF.

PDFs copied into the vault while Obsidian/PDFium Gate is not running cannot be reliably distinguished from older unregistered PDFs at the next startup without maintaining additional historical inventory state. The first implementation therefore does not invent such state: those files are discovered by the explicit existing/unregistered-PDF registration action. A later reconciliation policy may be considered separately if practical testing shows a need.

## Approved controlled document deletion direction

**Decision date:** 2026-10-04  
**Implementation status:** Pending.

A deliberate **Delete document and metadata** operation is distinct from unexpected file disappearance.

Target semantics:

- unexpected/ordinary external disappearance of an active PDF: retain the record and change it to `missing`;
- deliberate PDFium Gate **Delete document and metadata**: remove/trash the PDF and its associated active metadata record as one controlled user action;
- a retained `missing` record is not removed by this command; historical missing-record cleanup remains a separate maintenance operation;
- a missing record at the same textual path never becomes the identity of a later new PDF.

The deletion implementation should prefer Obsidian's normal trash behavior rather than irreversible raw deletion. The detailed sequencing, confirmation UX and failure recovery must be designed so partial failure preserves metadata rather than silently losing it.

## Canonical record-link identity

`filemeta_file` is a link representation, not a primary identity key. Obsidian may legitimately rewrite equivalent links between full-path and shortest-path forms.

Canonical runtime rule:

1. Physical Markdown/YAML remains source of truth for persisted record content.
2. Parse `filemeta_file` as an Obsidian linkpath.
3. Resolve it using Obsidian link semantics from the metadata record source path.
4. Use the resolved PDF `TFile.path` as the only `byPdfPath` identity key.
5. Direct vault-path lookup is fallback only when link resolution is unavailable/not-found.
6. If the PDF is missing, retain persisted path text so missing records remain inspectable.
7. Never create a second document identity merely because Obsidian changed wikilink representation.

This rule is orthogonal to PDF runtime identity (`PDF token`, `processId + routingId`) and does not alter viewer targeting.

## Document-record presentation visibility

`src/plugin/features/17-document-record-visibility.js` owns only File Explorer presentation. It toggles the `pdfium-hide-document-records` body class according to the plugin setting `hideDocumentMetadataFilesInExplorer` (default true). `styles.css` scopes the rule to the standard File Explorer and the exact `data-path="File Metadata"` folder.

This owner must never participate in record persistence, record identity, RAM indexing, metadata parsing or lifecycle mutation. Disabling the setting or unloading the plugin removes the body class. Therefore an Obsidian DOM change is deliberately fail-open: `File Metadata` can become visible again, but the underlying indexed Markdown records remain untouched.

## Missing-PDF boundary

Loss of reliable file continuity must fail closed. If a registered PDF disappears and there is no trusted rename/move event, `DocumentRecordsFeature` retains the Markdown record and changes its status to `missing`.

Move/rename inside the vault is different: Obsidian's rename event supplies the old and new path for the same file lifecycle event, so the existing record may be updated automatically while preserving `filemeta_id`.

A missing record is historical metadata. It must not be reactivated merely because a PDF later appears at the same path or with the same filename. Ordinary PDF records do not use content-hash recovery and PDFium Gate does not offer a manual PDF picker/relink operation. A PDF without an active record is treated as unregistered and may receive a new record through the normal metadata create/save workflow.

The deliberate product rule is therefore simple:

- `active` — the registered PDF has reliable current continuity;
- `missing` — the PDF can no longer be located with reliable continuity.

There is no ordinary-document `trashed` state. Permanent removal of retained missing metadata belongs to the planned backup-backed maintenance workflow, not to PDF disappearance handling. See [Document metadata backup and maintenance plan](../planning/DOCUMENT-METADATA-BACKUP-AND-MAINTENANCE.md).

## Disposable document-record index cache

The canonical persistent document metadata remains ordinary Markdown/YAML under `File Metadata/`. A performance cache may exist at:

```text
.pdf-metadata/document-record-index-cache.json
```

This cache is explicitly **not** source of truth and is not a compatibility format. It can be deleted or ignored without data loss.

Cache rules:

- current metadata schema is SHA-256 signed into the cache; mismatch invalidates the cache;
- record/cache contract version mismatch invalidates the cache;
- each entry is bound to canonical record path plus current `TFile.stat.mtime` and `TFile.stat.size`;
- mismatch/missing fingerprint => read and parse the physical Markdown record;
- cached record data never bypasses current Obsidian PDF-link resolution; `addDocumentRecordEntry` still resolves `filemeta_file` to canonical `TFile.path` on every RAM-index build;
- cache write/read failure is fail-open for performance and must not fail metadata indexing;
- cache entries are rebuilt/pruned from the current indexed Markdown file set.

This preserves the architectural rule: Markdown/YAML is permanent truth; RAM index and disk cache are rebuildable derived state.

## Idle-deferred startup ownership

DocumentRecords background startup is no longer started synchronously inside the layout-ready callback. Lifecycle schedules the owner through the browser idle scheduler after layout-ready. `ensureDocumentRecordIndexReady()` remains the only readiness gate and now uses one shared single-flight promise; an early user demand cancels the pending idle warmup and starts the same canonical rebuild immediately. There is no fixed/random startup delay. Markdown/YAML remains source of truth and the 0.1.201 cache format is unchanged.

## Startup gate ownership

DocumentRecords owns startup readiness. Lifecycle contributes two explicit signals through declared operation ports: `markDocumentRecordMetadataResolved()` and `markDocumentRecordLayoutReady()`. The metadata-resolved listener is registered early during plugin load; layout-ready is signaled from the existing workspace lifecycle callback. DocumentRecords schedules background warmup only after both latches are true, then uses the existing idle scheduler.

This is an orchestration optimization only. Persistent Markdown/YAML remains source of truth, the disposable cache contract is unchanged, and on-demand callers are never forced to wait for the background gate: they use the same canonical single-flight readiness promise immediately.

## Example-set isolation and opt-in installation

The plugin ships a small canonical demonstration set under `docs/examples/`. The same set can be copied explicitly from plugin Settings to `Examples-Obsidian-PDFium-Gate/` in the user's Vault.

Nothing is written to the Vault automatically for the example set. The example folder is deliberately outside `File Metadata/`. Example notes use valid record-shaped frontmatter and fixed sample UUIDs, but they are teaching/demo material and must never enter the production document-record index merely because they exist in the Vault. A native Obsidian Bases file in the example folder filters that folder directly and demonstrates that ordinary Markdown/YAML properties can be consumed without the PDFium Gate custom Bases view.

Installer rules:

- the user starts the copy explicitly from Settings;
- before any write, the UI warns that the four canonical example filenames in `Examples-Obsidian-PDFium-Gate/` will be overwritten if they already exist;
- cancelling the warning performs no write;
- the folder is created only after confirmation when it does not already exist;
- existing files with the canonical example filenames are replaced with the current canonical examples;
- other files in the example folder are never touched;
- there is no startup bootstrap marker or background recreation behavior;
- running the action again is an intentional restore/update operation for the example set.

The example set is not a source of truth for production records, does not change document identity, and must not participate in production record lifecycle events or indexing.

## 0.1.223 file-neutral record identity

Permanent records now live under `File Metadata/` and use `filemeta_type`, `filemeta_profile`, `filemeta_version`, `filemeta_id`, `filemeta_file` and `filemeta_status`. The current supported descriptor is only `pdf` + `document`. Runtime PDF code may use a `pdfPath` adapter alias internally, but that alias is not persisted and is not backward compatibility for the old `pdfmeta_*` format.
