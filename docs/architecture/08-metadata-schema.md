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

The original nine-field factory schema contains: `document_date`, `document_time`, `sender`, `document_type`, `response_received`, `response_received_date`, `response_sent`, `response_sent_date`, and `response_sent_link`.

Persistent machine identity remains canonical and language-independent: field UUID + `property`, and for select options UUID + `value`. Standard factory labels are stored canonically in English and carry `label_source: "factory"`. User-created fields/options and any standard label explicitly edited by the user carry `label_source: "user"` and preserve the user's text verbatim.

Existing pre-0.1.227 schemas are migrated once by stable field/option identity. A legacy label that still matches any known factory translation is classified as factory-owned; a different label is classified as user-owned. Factory-owned labels are canonicalized in persistent schema, while user-owned labels are preserved.

UI consumers do not rewrite the schema when language changes. `metadataSchemaForPresentation()` clones the persistent schema and translates only factory-owned labels for the resolved UI language. DocumentInfo, the metadata field manager and Document Register use that presentation schema. Changing UI language therefore does not increment schema revision, create a schema backup, alter metadata properties/values, or overwrite user-owned labels.

## 0.1.228 author/source URL upgrade

The production schema initializer adds `author` (text) and `source_url` (link with `config.kind: "url"`) through a controlled one-time upgrade. New schemas and explicit resets include both fields. Existing fields keep their UUIDs, configuration, values and active state; a missing field in an unmarked schema is not evidence of a historical deletion.

The optional persistent marker `migrations.author_source_url_v1` maps `author` and `source_url` to their field UUIDs. Validation requires an object containing those two distinct UUID-v4 identities and rejects unknown marker keys. The schema format version remains 1; the marker is an extension of the accepted schema contract. Upgrade and label normalization are persisted together through the canonical schema repository. Once marked, startup does not re-add deleted fields; deactivated fields remain deactivated. An explicit reset intentionally restores defaults. Repeated unchanged startup does not write the schema.

Newly added factory fields have canonical English labels and `label_source: "factory"`; presentation follows the active UI language without persistent writes. Existing explicit or uncertain user ownership is preserved, even if the label matches a known translation. The earlier LOCAL-TEST fields used `label_source: "user"`, so their labels are not automatically reclassified or translated. Existing UUIDs are retained in the marker.

HTTP(S) URL input rules and clickable presentation remain unchanged. DocumentInfo captures the original editor input and stored value. An unchanged non-empty legacy URL that fails current URL parsing is omitted from the canonical metadata patch, so editing another field preserves it. A changed URL undergoes ordinary validation; an optional empty URL becomes null. Internal links retain their existing behavior. No alternate record-write path is introduced.

### Verification and downgrade boundary

The user practically approved `author` / Forfatter and `source_url` / Publisert p? nettet in Obsidian on 2026-10-13. The subsequent migration, ownership and legacy-URL fixes passed `node scripts/test-metadata-author-source-url.js` and the extended `npm.cmd run test:document-register:editor-keys` in synthetic in-memory tests. The metadata regression is now included in `npm run check` as `test:metadata:author-source-url`. Full verification subsequently passed all 17 steps, including deterministic build. The separate disk integration passed all 10 scenarios; practical confirmation was pending at that earlier stage; isolated points 1–6 are now user-confirmed OK (2026-10-13), with whole-candidate testing not exhaustive.

0.1.227 rejects the upgraded schema because `migrations` is an unknown top-level property. Schema-dependent metadata functions may therefore become unavailable after downgrade. Returning can require restoration of a compatible pre-upgrade schema backup, with separate preservation of later schema edits. A synthetic schema restore passed against the frozen older contract; practical downgrade of the whole plugin is not tested or guaranteed. Document files are not automatically migrated or restored by this marker.

### Disk migration regression: verified scope and automation

On 2026-10-13, `node scripts/test-metadata-migration-disk.js` passed all 10 scenarios using the production MetadataSchemaFeature, schema repository, Obsidian Adapter file-store wrapper and safe-config writer over an isolated Node filesystem adapter. The backup algorithm is production code, not a test reimplementation.

- First upgrade: a physical backup was read byte-identically before canonical replacement; added fields, marker, original UUIDs and custom labels validated.
- Repeated startup: no writes, revision changes or extra backup.
- Deletion/deactivation: deleted author stayed absent and disabled source_url stayed disabled.
- Six injected single faults: backup write/read-back, temporary write/read-back, replacement rename and final read-back. Each was reported as failure; original canonical bytes were readable and unchanged after recovery.
- Separate synthetic restore: the older contract rejected migrations, then accepted/read the compatible backup restored through the real repository and safe writer. This tests schema/file operations, not the whole plugin.

The confirmed workspace `.codex-test-workspaces/metadata-migration-48101c48-89ce-41d5-9e0e-5043b8375abb/` is preserved. Process crashes, concurrent faults, recovery itself failing and practical whole-plugin downgrade are not tested. The Node adapter does not reproduce every Obsidian filesystem behavior.

The compatibility reference is the exact production schema-contract Git blob from local commit `ca2ca22804c7689764cab6095a4f3b59e03f154b`, whose manifest reports 0.1.227. It is frozen at `test/fixtures/metadata/0.1.227/schema-contract.js`, with provenance and SHA-256 `25e37e23db2b3f791c63f89ef05cad67edd88a8b93da3c95d1ff3874d17c6926`. This is a 0.1.227 development candidate, not an independently verified published-release baseline. The test validates the frozen checksum and no longer reads HEAD or fetches anything.

`test:metadata:migration-disk` is included in `npm run check`, preserving every earlier gate. Future runs allocate a new UUID-named `metadata-migration-*` directory directly under `os.tmpdir()`, guard paths against escapes and symlinks/junctions and retain success/failure artifacts. The exact root is printed before file operations; successful runs write results.json. No automatic cleanup is performed. Local project checkpoints and test workspaces are protected by anchored gitignore rules. The preceding 10/10 evidence is preserved; subsequent integrated verification also passed 10/10 disk scenarios within a full 19/19 check, including deterministic build. Practical isolated test points 1–6 are user-confirmed OK (2026-10-13); author/source_url are approved. Whole-candidate practical testing is not exhaustive, and downgrade remains unguaranteed.

## Multi-file-type metadata foundation (0.1.223)

0.1.223 changes the permanent Markdown record identity from the PDF-specific `pdfmeta_*` namespace to the file-type-neutral `filemeta_*` namespace. Records now separate `filemeta_type` from `filemeta_profile`; the first and only enabled combination is `pdf` + `document`. The persisted record root is `File Metadata/`.

The current document schema remains the first profile schema and keeps its existing nine user fields. Future content types should add profile-specific schemas while reusing the same field type registry, validation rules, record identity and Markdown/YAML persistence. 0.1.223 deliberately does **not** enable HTML, image or SVG product support.

The technical `.pdf-metadata/` configuration root is intentionally unchanged in this build because it also contains PDF-specific configuration such as highlight categories and the current document-profile cache. Renaming or splitting that technical storage is a separate decision and must not be coupled mechanically to record identity.

User-facing terminology continues to follow the content model rather than the internal architecture: Document information for the PDF/document profile now, with future Web page information or Image information only when those product features are actually implemented.
