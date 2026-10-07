# Handoff — after PDFium Gate 0.1.226 Community release

> **Superseded for current 0.1.227 work:** use `HANDOFF-2026-10-07-0.1.227-DOCUMENT-REGISTER.md`. This file is retained as the historical handoff immediately after the 0.1.226 Community Plugins release.

**Date:** 2026-10-06  
**Repository:** `LAD47/PDFium-Gate`  
**Authoritative branch for continued development:** `main`

## Release baseline

PDFium Gate **0.1.226** is fully published and user-confirmed through Obsidian Community Plugins.

Release-time verified commit:

```text
e57192fa376e0e9d89c60676cd668e9b852944f8
```

Confirmed release chain:

- exact candidate merged to `main`;
- **Build generated runtime** succeeded;
- `archive/0.1.226` frozen from the verified commit;
- **Publish Community Plugin release** succeeded;
- GitHub Release/tag `0.1.226` is an ordinary release, not Pre-release;
- release target is `archive/0.1.226`;
- release assets are `main.js`, `manifest.json`, `styles.css`;
- tag, archive and release-time `main` pointed to the same commit;
- Obsidian Community Plugins offered and installed 0.1.226 successfully.

The frozen `archive/0.1.226` must not be moved or rewritten.

## Build/release safeguards established in 0.1.226

Preserve these rules:

- canonical source lives under `src/`;
- root `main.js` and `main-bridge.js` are generated artifacts;
- `package-lock.json` is committed;
- use `npm ci`, not floating `npm install --no-package-lock`, for reproducible dependency installation;
- full verification command is `npm run check`;
- normal Community publishing is manual-only;
- freeze `archive/<version>` only after the final `main` Build generated runtime workflow is green;
- publish the GitHub Release from the frozen archive;
- Community release assets are `main.js`, `manifest.json`, `styles.css`;
- do not treat a GitHub release as a user-confirmed runtime baseline until it has been tested/installed through Obsidian.

## Current branch situation

Known branches after the 0.1.226 release:

- `main` — authoritative continued development;
- `archive/0.1.225` — immutable historical release evidence;
- `archive/0.1.226` — immutable current release evidence;
- `chore/0.1.226-community-cleanup` — already merged; historical working branch, not authoritative;
- `feature/missing-sha256-recovery` — historical/rejected ordinary-PDF recovery experiment; do not use as architectural authority.

Do not merge feature work to `main` without explicit user approval.

## Current product decisions that must not be reopened casually

### Ordinary PDF identity/lifecycle

- permanent `filemeta_id` UUID is the durable record identity;
- trusted rename/move continuity preserves the UUID;
- lifecycle is only `active` / `missing`;
- ordinary-PDF SHA-256 recovery is rejected;
- manual relink/picker recovery is rejected;
- experimental `trashed` lifecycle is rejected;
- a different PDF appearing at a historically missing path gets a fresh identity;
- missing metadata can be explicitly reviewed and deleted;
- future restore belongs to the backup/restore path, not SHA/relink guessing.

### Metadata registration

- automatic minimal records for newly detected PDFs are implemented and practically confirmed;
- **Register existing PDFs** is implemented, idempotent and practically confirmed;
- Markdown/YAML under `File Metadata/` remains durable source of truth;
- disposable indexes/caches are not durable identity.

### Email Import / Archive Import

The current 0.1.226 model is confirmed:

- EML/MSG and ZIP are transport sources;
- generated email PDF is the user-facing email document;
- exact EML/MSG retention is advanced opt-in and off by default;
- one localized sibling attachment folder is used;
- direct attachments and flattened members from multiple email ZIPs share that folder;
- ZIP member original paths remain technical provenance;
- successful email ZIP transport files are not retained;
- generated email-PDF links open the imported PDFs;
- generic manual Archive Import preserves ZIP directory structure;
- manual Archive Import is transactional and deletes source ZIP only after successful verified import;
- ZIP files copied into the Vault with the operating-system file manager are reconciled on startup/focus;
- final flat layout and external-ZIP focus reconciliation were practically confirmed on 2026-10-06.

## Open work for 0.1.227 and later

Use `docs/planning/ACTIVE-ROADMAP.md` as the authoritative active list.

### DocumentInfo

1. Consider an **Edit** action at both top and bottom of long panels.
2. Localized factory metadata/category labels are now implemented and practically verified on `fix/0.1.227-localized-defaults`: Bokmål → English → Bokmål works, while user-customized field/category/option labels remain unchanged. This item is complete pending the explicit merge/release decision.

### PDF Document Register

This is the main confirmed UX backlog:

- redesign the current UI/interaction model;
- build a clear maintenance/report surface for active, missing, invalid/corrupt and unregistered documents;
- do not reintroduce SHA recovery/manual relink/Trash.

### Backup / destructive maintenance

- generic backup engine remains independent in `LAD47/PDFium-Backup`;
- no unconditional dependency from PDFium Gate;
- broader permanent destructive metadata maintenance must remain gated behind validated backup/rollback;
- practical destructive-maintenance + restore testing is required before exposing that workflow to normal users;
- reassess `.pdfium-backup` / `backupOriginalPdf` only after the independent backup solution can be compared;
- future **Restore from backup** belongs naturally in missing-document review.

### Email/Archive future questions

Not 0.1.226 blockers and not reasons to reopen the confirmed transport model:

- exact visual design of generated email PDFs;
- visible vs technical-only `Message-ID`;
- naming policy beyond current date/subject suggestion;
- batch-import UX and duplicate summaries;
- more drag/drop/import surfaces;
- malformed/partial EML/MSG UX;
- configurable semantic mapping to arbitrary metadata fields;
- parent email-PDF rollback for post-PDF failures;
- future vault-wide byte-identical duplicate finder;
- possible **Open original email** action if practical use shows need;
- broader real-world corrupt/password-protected ZIP testing.

## Documentation authority

Read in this order when continuing:

1. `docs/planning/ACTIVE-ROADMAP.md`
2. `ARCHITECTURE.md`
3. relevant `docs/architecture/*.md`
4. `docs/testing/TEST-OBSERVATIONS.md`
5. relevant Email Import current docs, especially `docs/email-import/README.md` and `DECISIONS.md`
6. source code / automated verification
7. historical handoffs only for reasoning history

When historical text conflicts with current source, architecture, roadmap or verification, current material wins.

## Suggested first step in the next conversation

Do not start by changing code.

First:

1. inspect current GitHub `main` and confirm the local clone is clean/up to date;
2. read `docs/planning/ACTIVE-ROADMAP.md`;
3. read the Open items section of `docs/testing/TEST-OBSERVATIONS.md`;
4. choose one contained 0.1.227 task, preferably a practical re-test/closure of the Norwegian Bokmål DocumentInfo-label observation or a scoped DocumentInfo Edit-button UX improvement before beginning the larger Document Register redesign.

## Prompt for a new ChatGPT conversation

> Vi fortsetter utviklingen av Obsidian-pluginen **PDFium Gate** etter den brukerbekreftede Community Plugins-releasen **0.1.226**.
>
> GitHub: `LAD47/PDFium-Gate`  
> Lokal klone: `C:\GitHub\PDFium-Gate`  
> Test-Vault: `C:\Obsidian\Vault`
>
> Bruk GitHub/`main` og gjeldende kildekode som fasit. Ikke rekonstruer prosjektet fra eldre antakelser eller historiske handoffs.
>
> Start med å lese:
>
> - `docs/planning/HANDOFF-2026-10-06-POST-0.1.226.md`
> - `docs/planning/ACTIVE-ROADMAP.md`
> - `docs/testing/TEST-OBSERVATIONS.md`
> - `ARCHITECTURE.md`
> - relevante filer under `docs/architecture/`
>
> Release-baseline 0.1.226 er commit `e57192fa376e0e9d89c60676cd668e9b852944f8`, frosset som `archive/0.1.226`. GitHub Release er publisert som ordinær release, og Obsidian Community Plugins tilbyr/installerer 0.1.226. Ikke endre eller repoint den frosne archive-branchen.
>
> Reproduserbar build er nå et krav: `package-lock.json` er committed, bruk `npm ci`, og full sjekk er `npm run check`.
>
> Viktige gjeldende produktvalg: ordinary PDF identity = permanent UUID + trusted rename/move continuity; lifecycle = `active`/`missing`; ingen SHA-recovery, manuell relink eller Trash. Email/ZIP transport-source-modellen fra 0.1.226 er praktisk bekreftet og skal ikke åpnes på nytt uten en demonstrert regresjon.
>
> Ikke merge til `main` uten at jeg uttrykkelig ber om det.
>
> Første oppgave: kontroller aktiv roadmap og åpne testobservasjoner, og foreslå ett avgrenset neste steg for 0.1.227.
