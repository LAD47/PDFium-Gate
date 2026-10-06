# Translating PDFium Gate

English (`src/i18n/en.json`) is the canonical translation source. The officially supported UI locales are English (`en`), Norwegian Bokmål (`nb`), German (`de`), Spanish (`es`), Swedish (`sv`), Danish (`da`), and French (`fr`). Every officially supported locale must contain the complete canonical key set and pass `npm run check:i18n` with 100% coverage.

English remains the runtime fallback if a translation key is unexpectedly unavailable. Unsupported Obsidian UI languages also fall back to English when the plugin language setting is `Auto`.

## Add or improve a translation

1. Copy `src/i18n/en.json` to a locale file such as `it.json` when starting a new language.
2. Translate only the values on the right-hand side.
3. Keep every translation key unchanged.
4. Keep placeholders such as `{{format}}`, `{{type}}`, and `{{value}}` unchanged.
5. Complete the full canonical key set before adding the locale to the official supported-language list.
6. Run `npm run check:i18n` before opening a pull request.
7. Run `npm run check:i18n-ui` if your change touches an already-migrated UI surface.

## Do not translate

- translation keys
- UUIDs
- `pdfmeta_*` properties
- stable machine values such as `active`, `missing`, `letter`, and `decision`
- file paths and code identifiers
- user-defined metadata labels or category names
- diagnostic JSON/property keys intended for bug reports

## Source-code language

Source-code identifiers, technical comments, architecture documentation, and contributor documentation use English. User-facing interface text belongs in the i18n locale files.

## Coverage policy

Officially supported locales are release-gated at 100% coverage. Missing keys, unknown keys, duplicate keys, invalid JSON, and placeholder mismatches fail `npm run check:i18n`.

A proposed new language can be developed in a pull request, but it should not be added to the official runtime locale list until the canonical key set is complete. This keeps the language selector honest: every language shown there is intended to provide the full plugin interface rather than a partial translation.

## UI migration protection

`npm run check:i18n-ui` prevents hard-coded user-facing text from re-entering modules that have already been migrated. The current automated gate is the authoritative protection for migrated UI surfaces.

The earlier migration inventory is preserved for historical context at [`docs/history/i18n/I18N-AUDIT.md`](docs/history/i18n/I18N-AUDIT.md). It documents the staged migration and therefore contains some requirements that were later completed or superseded.

### Commands and diagnostics

Translate Command Palette display names and user-facing diagnostic labels/buttons. Never translate command IDs, JSON diagnostic keys, UUIDs, paths, `pdfmeta_*` properties, or canonical machine values.

## Factory defaults and persistent labels

Human-facing factory names are translation resources for the standard metadata schema and the five standard highlight categories. Locale files therefore contain `factory.category.*` and `factory.metadata.*` keys. Stable UUIDs, metadata properties, option machine values, colors and shortcuts remain language-independent.

New or explicitly reset defaults use the resolved UI language. Existing standard names may be relocalized only while they are still recognizable as untouched factory translations for the same stable identity. Once a user customizes a category name, metadata field label or option label, language changes must preserve that customized text. Standard Base container/path text remains deterministic unless a separate product decision changes it.
