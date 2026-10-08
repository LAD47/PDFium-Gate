# PDFium Gate

**Turn PDFs, email, and archives into a traceable source library inside Obsidian.**

PDFium Gate brings PDF reading, annotation, source linking, structured metadata, document registers, email import, and archive handling into one desktop workflow — while keeping the original PDF as the source of record and durable metadata in ordinary Markdown/YAML.

## What you can do

- **Read and annotate PDFs** — select text with mouse or keyboard, create highlights, copy quotes, and create Obsidian links back to exact pages and selections.
- **Add structured metadata beside the PDF** — use **Document information** to capture dates, senders, document types, links, yes/no fields, select lists, and your own custom fields while reading.
- **Manage large document collections** — use the **PDF Document register** to sort, filter, choose columns, edit metadata inline, find missing or unregistered documents, and register PDFs in bulk.
- **Turn email into source documents** — import EML/MSG as PDF, keep attachments linked, detect duplicate source mail, and preserve provenance.
- **Import ZIP archives safely** — preserve archive relationships, register contained PDFs, and roll back partial imports if something fails.
- **Keep your collection portable** — PDFs remain normal PDF files and metadata remains readable Markdown/YAML instead of being locked in a proprietary database.

**Built for document-heavy work:** research, journalism and investigations, public records, administration, source collections, and long-term archives.

Desktop only · Obsidian 1.13.7+ · UI in English, Norwegian Bokmål, German, Spanish, Swedish, Danish and French · no client-side telemetry.

> [!WARNING]
> **PDFium Gate is still pre-release software.** It is under active development and has not yet completed broad platform and real-world testing. Make a complete backup of your Vault before installing or updating it, especially if the Vault contains important or irreplaceable material.

## Why PDFium Gate?

Many PDF tools stop at reading and highlighting. PDFium Gate is built for document collections where you also need to know **where information came from**, preserve the original source, add structured information, and find the document again months or years later.

The design follows a few simple principles:

- **Source first.** The original PDF remains the document of record.
- **Traceable.** Quotes, selections, highlights, notes, attachments, and imported sources should lead back to their origin.
- **Structured.** Important document information should be sortable, filterable, and editable — not buried in filenames or free-form notes.
- **Portable.** Durable metadata is stored as ordinary Markdown/YAML rather than in a proprietary plugin database.
- **Conservative with identity.** PDFium Gate uses stable UUID-based records and fails safely rather than guessing when a document relationship is ambiguous.
- **User-owned.** Your labels, categories, metadata, and Bases are not silently rewritten when you change interface language.

## Feature tour

### Read, select, annotate, and link PDFs

- Integrated Chromium/PDFium PDF reading inside Obsidian.
- Mouse and keyboard text selection, including multi-page workflows.
- Copy selected text or quotes directly into your notes.
- Create Obsidian links back to exact PDF pages and selections.
- Optionally exclude marked headers and footers when copying text.
- Create, recolor, recategorize, and remove PDF highlights.
- Define highlight categories with colors and keyboard shortcuts.
- Optionally create an original-PDF backup before PDFium Gate makes its first modification to a PDF.

### Build a document register around your PDFs

- Define your own metadata fields: text, date, time, integer, decimal, yes/no, select, multi-select, and links.
- Edit metadata beside the PDF through **Document information**.
- Automatically create minimal records for newly detected PDFs, or register existing PDF collections in bulk.
- Keep stable UUID-based document identity across normal rename and move operations.
- Use the Obsidian Bases-powered **PDF Document register** with configurable columns, sorting, datatype-aware filtering, and inline editing.
- Switch quickly between **Active**, **Missing**, **Errors**, **Unregistered**, and **All** views.
- Diagnose invalid or duplicate metadata records without losing sight of the underlying PDF.
- Scale to large collections with a disposable index/cache while Markdown/YAML remains the source of truth.
- Install an optional synthetic example package to explore the register and native Bases without touching your real documents.

### Preserve email and archive sources

- Import EML and MSG email as normal PDFium Gate PDFs.
- Preserve sender/recipient/date/subject context and attachment relationships.
- Detect exact duplicate email sources with SHA-256.
- Export ordinary email attachments beside the generated email PDF and link them back to the parent document.
- Handle PDF attachments as registered source documents with provenance.
- Import ZIP attachments transactionally with verification and rollback.
- Import standalone ZIP archives with safety preflight, preserved directory structure, rollback on failure, and source/archive provenance.
- Show archive and attachment relationships in **Document information**.

### Keep control of your collection

- PDFs stay normal PDF files in your Vault.
- Durable document metadata stays readable as Markdown/YAML.
- User-created metadata labels and categories remain yours.
- Missing PDFs are treated conservatively and are never silently rebound to another file.
- Ordinary PDF identity does not depend on file hashes or proprietary database state.
- PDFium Gate includes no client-side telemetry.

## Languages

The complete UI currently supports:

- English
- Norwegian Bokmål
- German
- Spanish
- Swedish
- Danish
- French

English is the canonical fallback language. When **Auto** is selected, the plugin follows a supported Obsidian UI language and falls back to English for unsupported languages.

UI language is separate from regional date, time, and decimal formatting. Standard metadata labels/options are translated in a presentation layer while their persistent UUID/property/value identity stays language-independent; user-edited metadata labels remain user-owned. Standard category names likewise follow the resolved UI language while they remain untouched factory names; user-customized category names are preserved.

Most open UI surfaces change language immediately. Command Palette display names are the known exception and refresh after the plugin is reloaded or Obsidian is restarted.

## Before you install: back up your Vault

Do not test a pre-release build against the only copy of important data.

Recommended minimum procedure:

1. Close Obsidian or make sure all pending changes have been written.
2. Make a complete copy or snapshot of the entire Vault.
3. Make sure the backup includes your PDFs, Markdown files, Bases, and the hidden `.obsidian` folder.
4. Store the backup separately from the working Vault.
5. For especially important collections, test the plugin in a copy of the Vault first.

The plugin's automatic PDF-backup feature is an additional safeguard for PDF modifications. **It is not a replacement for a full Vault backup.** The plugin also creates and updates metadata/configuration files and plugin settings during normal use.

## Installation

PDFium Gate is distributed through **Obsidian Community Plugins**.

1. In Obsidian, open **Settings → Community plugins**.
2. Select **Browse**.
3. Search for **PDFium Gate**.
4. Select **Install**.
5. Enable **PDFium Gate** under Community plugins.

Updates are delivered through Obsidian's normal Community Plugins update mechanism.

## Requirements and test status

- Desktop Obsidian only (`isDesktopOnly: true`).
- The current compatibility baseline is **Obsidian 1.13.7**.
- Most practical development and regression testing has been performed on **Windows 11**.
- The architecture is intended to remain desktop/cross-platform where Electron and Chromium permit it, but macOS and Linux have not yet received the same level of practical testing.
- The PDF integration depends on Electron/Chromium's built-in PDF viewer. Changes in future Obsidian/Electron/Chromium releases can therefore require compatibility work.

## Privileged desktop access

PDFium Gate is desktop-only and uses a small number of privileged desktop capabilities for specific local workflows:

- **Filesystem access:** reads an EML/MSG source selected by the user, performs verified email-source retention and attachment extraction inside the current Vault, and reads or writes plugin-managed files whose paths are derived from the current Vault or the plugin installation. It does not use filesystem access to scan unrelated external folders.
- **Vault enumeration:** lists Vault files to build and reconcile the document register, detect unregistered PDFs, and maintain metadata indexes.
- **Clipboard access:** the PDF selection bridge temporarily reads and writes text in the system clipboard when capturing a user-triggered Chromium PDF selection, then restores the previous clipboard text when that operation finishes.
- **Bundled dynamic-code dependency:** PDFium Gate does not implement its own `eval()` flow. The bundled `sanitize-html` dependency currently pulls in `postcss` / `source-map-js`, whose quick-sort implementation contains a `new Function(...)` optimization. This is tracked as dependency-review work rather than being patched locally in the release candidate.

These capabilities are local parts of the desktop workflow. PDFium Gate does not include client-side telemetry.

## What the plugin stores

The project deliberately separates durable user data from disposable acceleration data and internal configuration.

- `File Metadata/` contains ordinary indexed Markdown/YAML document records.
- `.pdf-metadata/` contains plugin metadata/configuration and disposable technical data such as the document-record index cache and the example-bootstrap marker.
- `PDF Dokumentregister.base` is created on demand as the standard document register. After creation it is treated as user-owned and is not silently overwritten by the plugin.
  It reads real records from `File Metadata/` through PDFium Gate's dedicated `pdfium-document-register` Bases view; the native Base files in the example package are learning examples, not alternate production registers.
- `Examples-Obsidian-PDFium-Gate/` contains an optional synthetic learning package. The example Bases use Obsidian's built-in table view and are intentionally different from the real PDFium Gate document register. The package is installed or restored only through an explicit Settings action with confirmation; unrelated files and modified legacy examples are preserved.
- PDFs remain normal PDF files in the Vault.
- Imported email attachments remain ordinary Vault files under one localized sibling attachment folder (for example `Subject Vedlegg/` in Norwegian Bokmål).
- EML/MSG and ZIP are normally treated as transport sources: successful imports do not require them to remain as visible Vault documents. Exact EML/MSG retention is available only as an advanced opt-in.

The exact internal structures may still evolve before the project reaches a stable 1.0 release. Changes to persisted formats or file layouts require an explicit migration/backward-compatibility review before a public stable release.

## Pre-release status and limitations

PDFium Gate is in active pre-1.0 development. Its core PDF, metadata, document-register, email-import, and archive workflows have been repeatedly regression-tested, with the primary practical test environment currently being Windows 11 and the documented Obsidian compatibility baseline. Broader cross-platform and real-world coverage is still growing.

Known boundaries include:

- Command Palette labels require a plugin reload/restart after changing UI language.
- Chromium PDF internals are outside the plugin's control and may change with Obsidian/Electron updates.
- macOS and Linux have not yet received the same level of practical testing as Windows.
- Pre-1.0 builds may still change workflows, configuration, or persisted structures when testing shows that a better long-term design is needed.

If you find a reproducible problem, please [open a GitHub Issue](https://github.com/LAD47/PDFium-Gate/issues) and include the PDFium Gate version, Obsidian version, operating system, what you expected, what happened, and any relevant diagnostics.

## Documentation

- [Documentation index](docs/README.md)
- [Example files](docs/examples/)
- [Architecture overview](ARCHITECTURE.md)
- [Detailed architecture contracts](docs/architecture/)
- [Translation guide](TRANSLATING.md)
- [Contributing guide](CONTRIBUTING.md)
- [Historical development notes](docs/history/DEVELOPMENT-NOTES.md)
- [Historical milestones](docs/history/MILESTONE.md)

Historical documents are retained because they explain why several architectural and UX decisions were made. They may describe experiments or policies that were later superseded; current architecture documents and source verification are authoritative.

## Development and verification

The root runtime is generated from canonical sources under `src/`.

Run the complete verification pipeline with:

```bash
npm run check
```

The pipeline builds the runtime and checks internationalization, migrated UI text, architecture documentation integrity, deterministic build output, dependency boundaries, shared-state ownership, metadata contracts, and other regression gates.

Generated root runtime files are committed so GitHub releases can provide the files used by Obsidian Community Plugins.

## Release direction

The current `0.1.x` series is the development/test line. The planned public maturity sequence is:

- `0.9.x` — Beta
- `0.99.x` — Release Candidate
- `1.0.0` — stable release

The project is intentionally conservative about data ownership and migration as it approaches those milestones.

## Contributing

Testing, bug reports, translation improvements, and focused pull requests are welcome while the project matures. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting code or larger documentation changes. Translation contributors should also read [TRANSLATING.md](TRANSLATING.md); architecture contributors should start with [ARCHITECTURE.md](ARCHITECTURE.md).

## License

PDFium Gate is released under the [MIT License](LICENSE).