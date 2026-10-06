# Metadata schema and hidden configuration storage

This document defines the editable metadata schema, hidden technical configuration storage and safe-write ownership.

## Metadata schema + hidden storage product layer

The first product slice adds a new renderer/plugin owner, `metadataSchema`, without altering the established PDF identity, RuntimeDriver, selection, annotation or bridge contracts.

Persistent schema source-of-truth is `.pdf-metadata/document-metadata-schema.json`. It is open JSON inside the vault. Because the path is hidden from normal Obsidian indexing, schema I/O is owned by `src/platform/obsidian-adapter-file-store.js` over `vault.adapter`; the schema repository does not depend on indexed `TFile` objects. The active in-memory copy is cache/state only.

Hidden PDF-related configuration uses one canonical folder name: `.pdf-metadata`. Highlight categories use `.pdf-metadata/highlight-categories.yaml` at vault root and `<folder>/.pdf-metadata/highlight-categories.yaml` for folder-scoped overrides. The existing nearest-parent category inheritance model is preserved. The former `.pdf-markering/config.yaml` test layout is not part of the canonical runtime.

Schema and category writes go through `src/core/safe-config-file-write.js`: validate before touching the current file, backup only when existing content actually changes, write the already-read previous bytes through the same file-store write path and prove the backup exists/round-trips exactly before canonical mutation, validate a temporary write by read-back, replace through rename, and restore the previous canonical file if replacement fails. Schema backups live in `.pdf-metadata/backup/document-metadata-schema/`; category backups live in the corresponding `<folder>/.pdf-metadata/backup/highlight-categories/` scope.

Schema field identity has three separate concerns:

- stable UUID v4 `id`;
- stable English technical `property`;
- editable user-facing `label`.

System metadata uses the reserved `filemeta_*` namespace. The former pre-release `pdfmeta_*` namespace also remains reserved so legacy-looking fields cannot be created as user metadata. User properties must match `^[a-z][a-z0-9_]{0,63}$` and may not collide with reserved Obsidian/Bases names declared by the schema contract.

v1 field types are text, date, time, integer, decimal, boolean, select, multiselect and link. Canonical persistence is locale-independent. `date` uses `YYYY-MM-DD`; time-only uses `HH:mm` or `HH:mm:ss` without timezone. Regional presentation/input preferences are plugin settings, not schema semantics.

`src/metadata/schema-contract.js` owns the data contract and pure validation. `src/metadata/schema-repository.js` owns schema persistence through the Adapter file-store boundary. `src/plugin/features/14-metadata-schema.js` owns active schema state and mutations. `src/main/metadata-schema-modal.js` owns field administration; `src/main/settings.js` exposes only compact global metadata/regional settings.

0.1.192 adds the separate indexed document-record layer described below. It consumes this schema rather than duplicating field definitions; hidden `.pdf-metadata` remains technical configuration only.

## Canonical factory defaults

The standard schema contains nine fields: `document_date`, `document_time`, `sender`, `document_type`, `response_received`, `response_received_date`, `response_sent`, `response_sent_date`, and `response_sent_link`.

Persistent machine identity remains canonical and language-independent: field UUID + `property`, and for select options UUID + `value`. Standard factory labels are stored canonically in English and carry `label_source: "factory"`. User-created fields/options and any standard label explicitly edited by the user carry `label_source: "user"` and preserve the user's text verbatim.

Existing pre-0.1.227 schemas are migrated once by stable field/option identity. A legacy label that still matches any known factory translation is classified as factory-owned; a different label is classified as user-owned. Factory-owned labels are canonicalized in persistent schema, while user-owned labels are preserved.

UI consumers do not rewrite the schema when language changes. `metadataSchemaForPresentation()` clones the persistent schema and translates only factory-owned labels for the resolved UI language. DocumentInfo, the metadata field manager and Document Register use that presentation schema. Changing UI language therefore does not increment schema revision, create a schema backup, alter metadata properties/values, or overwrite user-owned labels.

## Multi-file-type metadata foundation (0.1.223)

0.1.223 changes the permanent Markdown record identity from the PDF-specific `pdfmeta_*` namespace to the file-type-neutral `filemeta_*` namespace. Records now separate `filemeta_type` from `filemeta_profile`; the first and only enabled combination is `pdf` + `document`. The persisted record root is `File Metadata/`.

The current document schema remains the first profile schema and keeps its existing nine user fields. Future content types should add profile-specific schemas while reusing the same field type registry, validation rules, record identity and Markdown/YAML persistence. 0.1.223 deliberately does **not** enable HTML, image or SVG product support.

The technical `.pdf-metadata/` configuration root is intentionally unchanged in this build because it also contains PDF-specific configuration such as highlight categories and the current document-profile cache. Renaming or splitting that technical storage is a separate decision and must not be coupled mechanically to record identity.

User-facing terminology continues to follow the content model rather than the internal architecture: Document information for the PDF/document profile now, with future Web page information or Image information only when those product features are actually implemented.
