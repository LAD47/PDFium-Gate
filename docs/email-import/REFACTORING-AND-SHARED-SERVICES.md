> [!NOTE]
> **Architectural-history document.**
> The modular/shared-service direction in this file drove the implemented refactor (including shared integrity/SHA primitives and bounded controllers). Some workflow examples below still describe the earlier retained-source/explicit-attachment model and are not current product behavior. For current runtime behavior use `ARCHITECTURE.md`, `DECISIONS.md` and `RUNTIME-INTEGRATION.md`.

# Email Import — Refactoring and Shared Services Direction

## Status

Accepted architectural direction before adding further attachment features.

This document records the next structural milestone for Email Import. The milestone is intentionally a **behavior-preserving refactor**: the currently user-verified Email Import and PDF-attachment workflows are the regression boundary while responsibilities are split into smaller modules and reusable project-level services.

The purpose is to keep future Email Import development inexpensive and safe, and to avoid locking generally useful mechanisms inside an email-specific feature.

## Why refactor now

Email Import started as a bounded subproject but now contains several independently meaningful responsibilities:

- source selection and import orchestration;
- EML and MSG parsing;
- canonical email normalization;
- SHA-256 calculation and byte-integrity verification;
- exact duplicate detection;
- retained-source storage and validation;
- safe HTML rendering and Chromium PDF generation;
- attachment classification and extraction;
- metadata projection and document relationships;
- Obsidian commands, modals, notices, path validation and viewer handoff.

Further features such as non-PDF attachment extraction would make the current runtime feature increasingly difficult to change safely if orchestration, policy, UI and reusable primitives remain concentrated in one place.

The project should therefore follow the same architectural direction already used successfully by PDFium Gate: **small logical modules, explicit boundaries, narrow orchestration, and reusable services where the responsibility is not feature-specific**.

## Architectural rule: generic mechanisms do not belong to Email Import

A mechanism should live outside `src/email-import/` when its semantics do not depend on email.

The clearest current example is SHA-256.

Calculating a SHA-256 digest from exact bytes is not an email operation. It is a general content-integrity and file-identity primitive. Email Import is only the first consumer that exposed the need.

The same distinction applies to duplicate handling:

- **Generic:** calculate a content fingerprint, compare fingerprints, group byte-identical files, verify that bytes still match a previously recorded fingerprint.
- **Email-specific:** look up `email_import_source_sha256`, interpret a match as an imported-email source duplicate, and offer the existing generated email PDF in the Email Import UX.

Email-specific policy may depend on generic integrity services, but generic integrity services must not depend on Email Import.

## Intended shared integrity layer

The exact final names may change during implementation, but the target responsibility is equivalent to:

```text
src/core/integrity/
    sha256.js
    content-fingerprint.js
```

Possible later additions, only when a concrete feature requires them:

```text
src/core/integrity/
    file-fingerprint-cache.js
    duplicate-groups.js
```

The initial refactor should extract only mature, already-used primitives. It should **not** build a full vault duplicate finder merely because the architecture can support one.

### Required properties of the shared integrity service

- Accept exact bytes and return deterministic SHA-256 identity.
- Avoid file-format assumptions.
- Avoid Email Import metadata or UI concepts.
- Be usable by parsers, retained-source verification, attachment verification and future unrelated PDFium Gate features.
- Remain independently testable.
- Fail closed when integrity verification does not match expected bytes/hash.

## Future opportunity: vault-wide duplicate finder

A future PDFium Gate feature may use the shared integrity layer to find byte-identical files anywhere in an Obsidian vault.

A possible user-facing flow is:

1. scan relevant vault files;
2. avoid unnecessary hashing by grouping or filtering on cheap file facts such as size;
3. calculate/reuse SHA-256 fingerprints;
4. group files with identical hashes;
5. show only duplicate groups with two or more files;
6. clearly state that the files are byte-for-byte identical;
7. never delete, move or replace files automatically without a separate explicit user action.

For large vaults, a later implementation may cache a tuple such as:

```text
vault path
file size
modified time or another change indicator
SHA-256
```

so unchanged files do not need to be rehashed on every scan. This is a future design opportunity, not part of the current Email Import refactor.

The shared SHA/integrity layer must therefore avoid assumptions that would prevent this future use.

## Target Email Import layering

Email Import should keep email-specific parsing and policy under `src/email-import/`, while orchestration is split into bounded controllers/services.

A likely direction is:

```text
src/email-import/
    parsers/
        eml-parser.js
        msg-parser.js

    render/
        email-html-renderer.js
        email-pdf-generator.js
        email-source-reference.js

    storage/
        source-retention.js

    attachments/
        attachment-policy.js
        attachment-extraction.js
        attachment-metadata.js

    metadata/
        email-metadata-projection.js

    runtime/
        import-email-controller.js
        import-pdf-attachment-controller.js
        retained-source-loader.js
        target-path-policy.js
```

The exact file split is implementation work and may be refined when dependencies are mapped. The important constraint is responsibility, not the provisional filenames.

## Thin plugin feature

`src/plugin/features/20-email-import.js` should become a thin integration/facade layer rather than the long-term home of workflow logic.

Its responsibilities should primarily be:

- register Email Import commands;
- obtain active PDF / Obsidian context;
- connect controllers to explicit PDFium Gate ports/adapters;
- invoke the correct controller;
- present high-level success/failure notices or hand off to passive UI components.

It should not own parsing, hashing, source validation, attachment extraction, metadata construction, filesystem policy or large multi-step workflows when those responsibilities can be isolated behind explicit modules.

## Controllers and reusable workflow services

The current user-visible flows should be separated conceptually:

```text
Import email source
    -> import-email-controller

Import retained PDF attachment
    -> import-pdf-attachment-controller

Read + verify retained EML/MSG and rebuild canonical document
    -> retained-source-loader

Validate / allocate safe vault destinations
    -> target-path-policy
```

The retained-source loader is especially important because future PDF and non-PDF attachment actions need the same operation:

```text
parent email PDF metadata
        |
        v
retained source path + expected SHA
        |
        v
read exact bytes
        |
        v
verify SHA / source identity
        |
        v
parse EML or MSG
        |
        v
Canonical Email Document v1
```

That flow should exist once, not be copied into every attachment feature.

## UI rule: modals are passive decision surfaces

Email Import modals should collect/display user choices and return a decision object.

They should not themselves:

- parse EML/MSG;
- calculate SHA-256;
- read or write retained sources;
- write attachment bytes;
- create metadata records;
- implement rollback.

This keeps user interface code replaceable and makes workflow logic testable without an Obsidian DOM.

## Port and feature rule

Continue the existing PDFium Gate architecture rule:

> Feature -> explicit ports/adapters -> bounded services. Avoid peer-feature implementation dependencies.

If a capability is needed by multiple features, promote the capability to an explicit shared service/port rather than importing another feature implementation directly.

## Refactoring regression boundary

The refactor must not deliberately change user-visible behavior.

The following already-proven behavior is the regression baseline:

- ordinary existing PDFs still work in PDFium Gate;
- EML/MSG import produces the existing generated PDF workflow;
- exact source duplicate detection remains SHA-256 based;
- optional retained original remains byte-identical and SHA-addressed;
- retained-source PDF section remains documentary text with no clickable source link;
- inline/CID resources render correctly and are not duplicated as ordinary attachments;
- PDF attachments remain listed in the email PDF;
- explicit retained PDF-attachment import works one attachment at a time;
- PDF attachment bytes and retained source are integrity-verified;
- imported PDF attachments become ordinary PDFium Gate documents with their own metadata record and technical parent relationship;
- user metadata such as sender/date/document type is not silently copied to an attachment document;
- full existing PDFium Gate automated regression checks remain green.

The practical Obsidian test of PDF attachment import steps 1–9 is considered user-confirmed before this refactor.

## Suggested implementation order

1. Freeze tests around the currently verified runtime behavior.
2. Inventory functions in `20-email-import.js` and classify each as UI/integration, orchestration, policy, generic integrity, storage, metadata or attachment logic.
3. Extract the general SHA-256/content-integrity primitive to a shared project-level core without changing behavior.
4. Update Email Import to consume the shared integrity service.
5. Extract retained-source loading/verification into one reusable email service.
6. Extract initial email import and PDF-attachment import into separate controllers.
7. Reduce `20-email-import.js` to command/context/port wiring.
8. Keep modal classes passive.
9. Run the complete current Email Import test suite, real Electron PDF test, existing PDFium Gate regression suite and practical Obsidian smoke test.
10. Only after the refactor is verified, continue with non-PDF attachment behavior or other new Email Import functionality.

## Non-goals for this refactor

Do not combine this structural milestone with:

- vault-wide duplicate-finder UI;
- automatic duplicate deletion;
- non-PDF attachment import/extraction UX;
- batch email import;
- drag-and-drop;
- new metadata mappings;
- visual redesign of generated email PDFs;
- changes to retained-source policy.

Those remain separate features/decisions.

## Long-term principle

New feature work should be treated as an opportunity to discover reusable primitives, but reusable code should be promoted only when the underlying responsibility is genuinely general.

The goal is not abstraction for its own sake. The goal is to ensure that mature capabilities such as byte integrity, content identity and safe file operations can be reused across PDFium Gate without copying Email Import logic or coupling unrelated features to Email Import.
