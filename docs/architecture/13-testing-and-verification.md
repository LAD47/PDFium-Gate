# Testing, verification and benchmark boundaries

Machine-enforced contracts are part of the architecture. Verification should prefer behavior simulation where practical and source-pattern gates where single-owner/forbidden-pattern invariants are the subject.

## Verify philosophy and architecture completion

`scripts/verify/contracts/` is organized by architectural/runtime contracts.

Important gates include:

- structure/source-of-truth;
- runtime input routing;
- selection/output behavior;
- RuntimeDriver ownership and coordinate contracts;
- identity/locator fail-closed behavior;
- deterministic release build/root-only load;
- startup/restored-wrapper lifecycle simulation;
- explicit production dataflow and single annotator transport;
- renderer feature/port/state ownership;
- Main Bridge feature/port/state ownership;
- annotator request-handler/dependency ownership;
- final architecture-completion gate.

When behavior can be tested through input → output/runtime simulation, prefer that over brittle source-text matching. Source-text gates remain appropriate for forbidden architecture patterns and single-owner invariants.

`11-architecture-completion.js` makes the structural target machine-enforced. It requires simultaneously:

- renderer hidden cross-feature calls = 0;
- renderer shared mutable-state writers = 0;
- renderer implementation dependency cycles = 0;
- Main Bridge hidden cross-feature calls = 0;
- Main Bridge shared state writers = 0;
- Main Bridge implementation dependency cycles = 0;
- annotator hidden cross-handler calls = 0;
- annotator runtime transport listener owners = 1;
- keyboard navigation algorithm modules = 3;
- keyboard request handler remains below its architecture regression ceiling.

## Benchmark / instrumentation boundary

Scale testing is intentionally isolated from product ownership.

`MetadataBenchmarkFeature` owns only benchmark fixture generation, reporting UI and cleanup. It does not write or update ordinary document records through an alternate product persistence path. Generated fixture records are serialized with the canonical metadata record contract and placed in the same visible/indexed Markdown record layout as normal records so the stress test exercises the real storage shape.

`DocumentRecordsFeature` remains the sole owner of RAM-index mutation. Benchmark instrumentation therefore enters through explicit operations:

- `setDocumentRecordBenchmarkEventSuppression(enabled)`
- `runDocumentRecordIndexBenchmark()`

Cold/full rebuild timing is recorded by the existing `rebuildDocumentRecordIndex()` owner. The benchmark feature never clears or mutates `documentRecords` state directly.

Bulk fixture generation uses direct filesystem writes solely to avoid turning 10k–100k fixture creation events into the benchmark itself. Marked benchmark UUIDs and the dedicated `PDFium Benchmark/` PDF root allow lifecycle suppression to be scoped to benchmark fixtures. Suppression is reset naturally by plugin restart. Measurement must be performed after restart so Obsidian has discovered the files and the canonical cold index is built from disk.

Cleanup is fail-closed: the dedicated root is only recursively removed when a valid benchmark manifest marker is present, and metadata record deletion uses deterministic benchmark UUID paths. Ordinary `File Metadata` records are never selected by root-wide deletion.

The benchmark layer must remain removable without changing record format, schema, DocumentInfo, Bases editing, PDF identity, RuntimeDriver, selection or annotation behavior.

## Document Register DOM and practical regression contract (0.1.230)

The actual host hierarchy and ownership rules are documented in
[Document Register architecture](11-document-register.md). Changes to the
register, Bases integration or Obsidian version must retain these checks:

| Area | Required check |
| --- | --- |
| Actual toolbar DOM | Inspect the tested Obsidian version: the Properties chooser is in the sibling `.bases-header`, outside `.bases-view`, under the same `.view-content`. Do not assume a future host has this exact shape. |
| Local suppression | Hide only the control owned by the loaded `pdfium-document-register` view. Ambiguous, unsupported, hidden or detached hosts leave it visible; native `file.*` properties and metadata remain intact. |
| Other Bases | Native table views, independent leaves and nested views retain their own Properties controls. |
| Switching and cleanup | Delayed/replaced chrome and view switching reconcile correctly. Rebind/disconnect local observation as needed, remove stale markers and ignore queued work after unload. |
| Empty and alternative views | An empty register and each status view keep the schema-aware column chooser; missing schema leaves the chooser disabled. |
| Columns and language | Preserve `pdfiumHiddenColumns` across redraw/reopening, localized UI/schema labels and user-owned names in all seven official locales. Keep UUIDs, schema properties and stored machine values unchanged. |
| Existing Base files | Preserve user-defined `.base` columns, sorting, filters and labels; opening or reinstalling examples does not reset an existing root register or historical copy. |
| Example installation | Create the root register only when missing; initial install/reinstall never creates a second register in the examples folder. Keep historical/legacy files and the two pedagogical native Bases. |

The permanent synthetic DOM/lifecycle and column-picker regression is
[`scripts/test-document-register-native-properties.js`](../../scripts/test-document-register-native-properties.js)
(`npm run test:document-register:native-properties`). Example installation
and file-preservation behavior are covered by
[`scripts/test-example-register-installation.js`](../../scripts/test-example-register-installation.js)
(`npm run test:example-register-installation`); editor keyboard behavior remains
covered by `npm run test:document-register:editor-keys`. All are in
`npm run check`.

Synthetic DOM tests must represent the observed sibling header/view structure,
including ambiguity and lifecycle failures. They do not establish that a new
Obsidian build still uses that structure, and cannot replace practical testing
in Obsidian. The earlier wrong-container implementation passed automated checks
without hiding the real native control. Record host observations, user-reported
practical results, local automated results and GitHub Actions results separately.
The seven practical checks confirmed for the final local 0.1.230 candidate are
recorded in [test observations](../testing/TEST-OBSERVATIONS.md).

## Documentation integrity gate

`scripts/check-architecture-docs.js` verifies that the root architecture index links to the complete canonical document set and that every linked Markdown file exists. It is part of `npm run check`. This gate protects documentation navigation only; it does not replace runtime architecture verification.
