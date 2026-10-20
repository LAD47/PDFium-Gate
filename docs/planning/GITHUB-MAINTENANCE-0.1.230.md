# GitHub maintenance review after 0.1.230

Review date: 19 October 2026. Repository: `LAD47/PDFium-Gate`.
Reviewed `main`: `92c1f4ce2632f80b281ed8adc770308b6098fe33`.

This is a documentation update and read-only GitHub/CI analysis. Recommendations
below do not authorize branch deletion, workflow edits, repository settings
changes, commit/push or publication. No production or version changes are included.

## Release and practical evidence

- [GitHub Release 0.1.230](https://github.com/LAD47/PDFium-Gate/releases/tag/0.1.230)
  was published on 2026-10-19 as an ordinary, non-draft, non-prerelease release
  (release ID `417629211`).
- Tag `0.1.230` and immutable `archive/0.1.230` point to
  `ee5b7950a08477c1ad65cd1d474325e4b6b6b50b`.
- Required release assets are `main.js` (4,597,612 bytes), `manifest.json`
  and `styles.css`.
- [Build generated runtime 39298734216](https://github.com/LAD47/PDFium-Gate/actions/runs/39298734216)
  and [publication 39305773758](https://github.com/LAD47/PDFium-Gate/actions/runs/39305773758)
  succeeded for the release commit.
- The later `main` commit synchronizes only `AGENTS.md`. It does not change
  the release archive/tag or justify moving either.
- The user confirmed all seven practical tests of the final local 0.1.230
  candidate. See [the active roadmap](ACTIVE-ROADMAP.md) and
  [test observations](../testing/TEST-OBSERVATIONS.md) for the preserved scope.
- Installation of the published 0.1.230 version through Obsidian Community
  Plugins has not yet been separately user-confirmed. Historical successful
  installation of 0.1.226 is not evidence of that later installation.

## Five development branches

The tips below were read live from GitHub. Their commit objects already existed
locally, so no fetch, checkout, synchronization or GitHub ref update was needed.
Each tip is a direct ancestor of the reviewed `main`; `merge-base(main, tip)`
equals the tip and `git rev-list --count main..tip` is zero. Therefore **there
are no unique commits to rescue through cherry-picks or a new archive**: their
original commits are already reachable from `main`.

There were no open pull requests in the repository at the review. No active
development purpose was found for these branch tips. Old workflow branch
selectors are a CI maintenance dependency, not evidence of unmerged feature work.

| GitHub branch | Latest commit | Commit date | Commits outside main | Commits behind main | Preserved work / current purpose | Recommendation |
| --- | --- | --- | ---: | ---: | --- | --- |
| `chore/0.1.226-community-cleanup` | `2464611395ad383abcef9345cc90dd96bdc14680` | 2026-10-06 | 0 | 412 | Completed Community cleanup; its commits are directly retained in main and the published release history. | Delete after separate approval. |
| `feature/missing-sha256-recovery` | `18f2ad9edcf5458a9df8c92343fb83928bd16890` | 2026-10-06 | 0 | 451 | Completed/superseded development history. Ordinary-PDF SHA recovery/relink was deliberately removed later; the branch is not a current product direction. Still named by old Email CI. | Delete after CI is retargeted and separately approved. |
| `feature/0.1.228-email-bundles` | `4e54550a8c7dec79d5496595030a747a4547d0de` | 2026-10-13 | 0 | 10 | EPOST bundles and offline-arrival work are merged into main, including the branch's CI changes. Still named by old Email CI. | Delete after CI is retargeted and separately approved. |
| `fix/0.1.227-localized-defaults` | `560eb60c0dc64004a7cb208cc5424095e59b7720` | 2026-10-07 | 0 | 75 | Completed localization work, already in main; tip is also archive/0.1.227. | Delete after separate approval. |
| `fix/0.1.228-email-zip-relations` | `bbb0d38a4c043ae323fed091ae4e8e50b8cb48f9` | 2026-10-12 | 0 | 52 | Completed ZIP relationship/read-back work retained in main and later releases. Still named by old Email CI. | Delete after CI is retargeted and separately approved. |

All five recommendations are deletion of obsolete development refs, with the
CI prerequisite shown above. Keep `main` and every `archive/*` ref.
No branch was deleted, renamed, archived or repointed in this review.

Ancestry preserves the experimental SHA-recovery history; it does not mean
that behavior is enabled today. Later commits such as `56970c3` removed
ordinary-PDF recovery/manual relink paths. The current
[document identity contract](../architecture/09-document-records.md) remains
`active`/`missing`, permanent UUIDs and trusted rename/move continuity.

Local branch names are not necessarily the live GitHub tips:
`feature/missing-sha256-recovery` is locally at `558ce5331f9b0d9a2fd8555918351e5d11ac5e47`,
and `fix/0.1.227-localized-defaults` is locally at
`ff37f4bde78671ebe89dca4c37ac4797b250d956`. Both local tips also have zero
commits outside `main`. The table's recommendations concern the verified
GitHub refs; no local branch was changed.

Read-only comparison commands, using the exact GitHub tip SHA for each branch:

```text
git --no-optional-locks rev-list --left-right --count <main-sha>...<tip-sha>
git --no-optional-locks merge-base <main-sha> <tip-sha>
git --no-optional-locks log --format=%H%x09%s <main-sha>..<tip-sha>
```

## Three GitHub Actions workflows

| Workflow | Current trigger and role | Recommendation |
| --- | --- | --- |
| [build-generated-runtime.yml](../../.github/workflows/build-generated-runtime.yml) | Relevant path-filtered pushes to main; Node 24, npm ci, complete npm run check, optional bot commit of generated main.js/main-bridge.js. | Keep as the runtime owner. Review path filters separately: most scripts/test-*.js files are not explicitly covered, so a test-only change can miss this workflow. Retain one generated-runtime writer. |
| [publish-community-release.yml](../../.github/workflows/publish-community-release.yml) | Manual workflow_dispatch; resolves archive/manifest-version, verifies version/assets, rebuilds/checks, rejects generated-runtime drift, attests assets and publishes an ordinary release. | Keep manual and archive-based. Do not combine publication with routine test pushes or repoint an existing archive. |
| [email-import-poc.yml](../../.github/workflows/email-import-poc.yml) | Pushes only to four old feature/fix names, then path filtering; no main or pull_request trigger. Runs extra Node, real Electron PDF and runtime checks plus the full repository check. | Preserve its extra coverage and retarget it to main and PRs into main before retiring the old branch dependency. A later approved change can simplify duplicate checks. |

`email-import-poc.yml` currently names `feature/email-import`,
`feature/missing-sha256-recovery`, `fix/0.1.228-email-zip-relations` and
`feature/0.1.228-email-bundles`. The first branch is absent from the live branch
list; the other three are fully in `main`. Thus new `main` changes do not
receive this workflow's extra coverage merely because its file remains present.

The latest visible Email Import run was
[38441738500](https://github.com/LAD47/PDFium-Gate/actions/runs/38441738500),
successful on 2026-10-13 for `4e54550a8c7dec79d5496595030a747a4547d0de`.
It is historical branch evidence, not an Electron test of the 0.1.230 release commit.

### Node coverage compared with npm run check

At the reviewed [package.json](../../package.json), `npm run check` has
21 top-level stages. `npm run test:email-import` invokes
22 Node test groups; these counts are script entry points, not
individual assertions or a coverage percentage.

The four shared named groups are:

- `test:core:integrity`
- `test:email-import:vault-reconciliation`
- `test:email-import:zip-attachments`
- `test:email-import:zip-link-routing`

The following 18 groups are not invoked by `npm run check`:

- `test:email-import:parser`
- `test:email-import:msg-parser`
- `test:email-import:duplicates`
- `test:email-import:renderer`
- `test:email-import:retention`
- `test:email-import:retained-loader`
- `test:email-import:target-paths`
- `test:email-import:vault-trigger`
- `test:email-import:vault-staging-flow`
- `test:email-import:source-controller`
- `test:email-import:attachment-controller`
- `test:email-import:auto-attachments`
- `test:email-import:attachment-links`
- `test:email-import:pdf-link-hit-test`
- `test:email-import:pdf-point-adapter`
- `test:email-import:obsidian-adapter`
- `test:email-import:attachments`
- `test:email-import:metadata`

There is also semantic overlap with archive/metadata/platform and verifier
contracts. The count above identifies missing entry-point execution, not
18 completely disjoint features. Source inspection of the check chain and
verifier found no invocation of these extra scripts or the Electron test.

### What the Electron/PDF test adds

[`scripts/test-email-import-pdf-electron.js`](../../scripts/test-email-import-pdf-electron.js)
runs inside actual Electron/Chromium. The workflow installs the pinned Electron
binary, configures its Linux SUID sandbox and uses `xvfb-run`, with a three-minute
step timeout. It does not run inside Obsidian.

The test drives a hidden BrowserWindow and real `webContents.printToPDF` for
HTML email, CID-image/attachment and hostile-source fixtures. It validates
a non-trivial PDF buffer and `%PDF-` header, confirms that the attachment URI
is present in the resulting PDF, and checks that the printer receives embedded
CID data, controlled CSP and no source scripts, event handlers, tracking URL or
internal retained-source details. This exercises the Chromium printer boundary
that the Node HTML-renderer tests cannot exercise. It is worth retaining.
It is not a visual pagination/image comparison or a practical Obsidian test.

[`scripts/check-email-import-runtime-integration.js`](../../scripts/check-email-import-runtime-integration.js)
adds a separate read-only source-pattern check over the generated renderer/bridge
for bundled dependencies, command wiring, planned attachments, provenance and
printer isolation. It is not currently a check-chain entry point. The workflow
also runs `git diff --exit-code HEAD -- .` after the build and uploads generated
runtime files for manual practical testing.

### Proposed integration order (not implemented here)

1. With separate approval, give the existing Email workflow `push: main` and
   `pull_request` into `main` with relevant source/test/fixture/workflow paths;
   optional manual dispatch can support reproduction. Do not hard-code obsolete
   feature branch names.
2. Preserve all extra Node groups, the real Electron test, runtime integration
   and tracked-file cleanliness checks. Verify the replacement CI first.
3. Consider moving the extra Node groups and runtime integration into the
   normal `npm run check` chain, while keeping Electron/Xvfb as a separate
   platform-dependent CI job. Remove duplicate invocations only after equivalent
   execution is demonstrated; this is not authorization to weaken a gate.
4. Only then remove the three old Email branch selectors and, after explicit
   deletion approval, retire the five obsolete development branches.
5. Keep frozen release archives and published tags/releases unchanged.

## GitHub presentation proposals (not applied)

The current repository description begins `xperimental Obsidian plugin...`;
Topics are empty. Proposed replacement description:

> PDFium Gate – Obsidian plugin for PDF reading, annotations, document metadata, registers, email import, and source archiving.

Suggested Topics: `obsidian`, `obsidian-plugin`, `pdf`, `pdfium`,
`pdf-annotations`, `document-management`, `metadata`, `email-import`,
`archive-import`.

The current root README already has a useful feature tour. Suggested follow-up:
add a compact latest-release/installation section linking to 0.1.230 and the
current docs index; show the metadata/register and EPOST workflows with a few
synthetic screenshots; document the distinction between the standard register
and pedagogical native Bases; link clearly to release notes, compatibility and
known limits. Keep practical local testing separate from confirmation of a
published Community Plugins installation. Root README and repository settings
are not changed in this task.

## Documentation scope and historical records

Updated active indexes distinguish published 0.1.230 from the historical 0.1.226
Community installation and the earlier local candidate. Current release-policy
references agree that Community preview is optional. Dated handoffs, release
notes, old test results and the one-time 0.1.229 archive decision remain preserved;
their original candidate/pending wording is historical evidence, not current work.

No build, installation, runtime/Electron test or vault access is part of this
maintenance task. The existing read-only architecture-documentation checker and
relative-link/UTF-8/diff checks are used for the documentation changes.

## Electron 43.7.5 local test-environment upgrade (19 October 2026)

This later development/test update starts from
`62af45c4c7b2cd2fcf4f41e108dceceeb43da15d` on a clean local `main`.
The earlier branch/workflow audit above remains a dated snapshot.

### Environment and compatibility scope

- Electron development dependency and installed package before: **43.5.0**.
- Electron development dependency, lock entry and installed native executable
  after: exactly **43.7.5**, with no range prefix.
- Actual running diagnostic process: Electron **43.7.5**,
  Chromium **150.0.7871.250**. Native `electron.exe --version`
  also returned `v43.7.5`; this is not only a package.json version check.
- Host tooling: Windows/PowerShell, Node **22.23.2**, npm **11.6.2**.
- The owner confirms **Obsidian 1.14.4** works for the previously practically
  tested functions. This is user-reported application compatibility; no new
  Obsidian/Vault test or installation was performed in this task.
- As supplied by the owner, Electron 43.7.5 is bundled with the updated
  Obsidian 1.14 installer. Obtaining that embedded runtime requires the updated
  **Obsidian installer**, not merely an in-app application update.
  Updating this repository's npm dependency does not upgrade the user's
  Obsidian runtime; its actual embedded Electron version was not inspected.
- Plugin version remains **0.1.230** and minimum Obsidian remains **1.13.7**.
  The newer test dependency does not raise the production compatibility floor.
  Published-version installation through Community Plugins remains a separate
  confirmation from the application-version/practical-function report.

### Dependency installation and scope

The targeted command was:

```text
npm.cmd --logs-max=0 install --save-dev --save-exact --package-lock-only --ignore-scripts --no-audit --no-fund electron@43.7.5
npm.cmd --logs-max=0 ci --no-audit --no-fund
node node_modules/electron/install.js
```

All three commands completed with exit 0. `npm ci` installed 65 packages from
the updated lock. It installed the Electron package without its native binary;
the installed package exposes no automatic install script, so the existing
workflow's explicit `install.js` step was necessary to obtain the binary.

npm initially reordered the direct dependency list and added unrelated
`selderee.peer` lock metadata. Those incidental changes were removed before
verification. The final package/lock changes are only the exact Electron
version and its resolved tarball/integrity. Other direct dependencies,
transitive package versions and Electron's dependency requirements are unchanged.

### Actual regression results

| Command / verification | Actual result |
| --- | --- |
| `npm.cmd --logs-max=0 ci --no-audit --no-fund` | Passed, exit 0. Native Electron installation required the explicit installer step above. |
| `npm.cmd --logs-max=0 run check` | Passed all 21 stages, exit 0; 10 disk-migration scenarios, nine native Properties/column groups and all 730 translation keys in seven locales passed. Injected disk-failure diagnostics were expected test cases. |
| Runtime verification | `deterministicBuild: true`, `rootOnlyLoad: true`; no generated-runtime content change. |
| `npm.cmd --logs-max=0 run test:email-import` | Failed, exit 1, at the EML parser fixture SHA assertion. The aggregate command is not a passed suite. |
| Remaining Email Import groups run individually | All 22 groups were exercised across the aggregate attempt and individual continuation: **20 passed, two failed** (`test:email-import:parser` and `test:email-import:attachments`). |
| Standard `npm.cmd --logs-max=0 run test:email-import:pdf-electron -- --user-data-dir=<new-temp-profile>` | Returned 0, including a console-attached retry, but did not reach the success message. Instrumentation confirmed only one created test window and no call to the test's final `app.exit`; this is not evidence that the full PDF suite passed. |
| Diagnostic Electron run of the unchanged PDF test | With a temporary `window-all-closed` listener keeping only the diagnostic process alive between windows, all **three** HTML/CID/hostile-source cases completed, the test's success message was recorded, `app.exit(0)` was reached and the process returned 0. Real printToPDF output, valid PDF headers and preserved clickable attachment URI were verified by the existing assertions. |

### Confirmed fixture and test-lifecycle limitations

The two Node failures are caused by reference PDF bytes in this Windows
checkout, not a change made by this upgrade. Both reference files already had
the same CRLF bytes in the pre-upgrade checksum snapshot. Their Git versions
have LF; decoded email attachments equal the Git bytes exactly. Converting
only CRLF to LF in memory reproduced the committed references. No fixture,
expected hash, parser or assertion was edited.

| Reference fixture | Checkout bytes / SHA-256 | Git and decoded attachment bytes / SHA-256 |
| --- | --- | --- |
| `test-attachment-1.pdf` | 1981 / `fb8e16f75dd9b009c61368d7174cc3bb5cb4d8ddb29c811bf8568fbcf26e8aff` | 1896 / `0605780a416688f7f06e7ec97016b7df03145238ceb358f62d514ce6d002c749` |
| `test-attachment-2.pdf` | 1975 / `f93d0f7b6878043b0c53f51d62fb129fc051c16bf7493f32a9e89b695209d594` | 1890 / `aa18431ebbd82b67b4abcefe3f913f18c05720423fcf8cfd98a4b86bc95aa8c8` |

The inherited environment contained `ELECTRON_RUN_AS_NODE=1`. It was removed
only for the native Electron test child process, with an isolated new OS-temp
profile; no persistent environment or sandbox setting was changed.
The native runtime starts correctly. However, the unmodified standalone test
quits after its first hidden window closes, before the remaining cases and
final success/exit code path. A process exit of 0 therefore gives a false
impression of complete test coverage in this environment.

The diagnostic listener changes only process lifetime, not PDF production code
or test assertions, and forwards the test's own final exit code. It demonstrates
that all three PDF cases work with Electron 43.7.5 here, but does not turn the
ordinary test launcher into a verified complete regression gate. This review
does not establish whether its lifecycle issue also occurs on Linux CI or in
the earlier 43.5.0 runtime.

Retained synthetic evidence (all outside any Obsidian Vault):

- Disk-migration workspace: `C:\Users\leifd\AppData\Local\Temp\metadata-migration-8b47639e-0f80-4b0b-9cae-d5e05dcfb053`.
- Unmodified-test lifecycle evidence: `C:\Users\leifd\AppData\Local\Temp\pdfium-gate-electron-43.7.5-proof-TWP88N\result.json`.
- Completed three-case diagnostic evidence: `C:\Users\leifd\AppData\Local\Temp\pdfium-gate-electron-43.7.5-complete-emfnS2\result.json`.

### Commit-readiness decision

**Not ready for commit as a fully green regression update.** The dependency
upgrade and full repository check succeed, and the complete diagnostic PDF run
shows no rendering/link regression. The ordinary Email Import aggregate remains
red on two pre-existing checkout fixture mismatches, and the standalone PDF
test needs an explicit lifecycle/completion guard.

A separately approved follow-up should preserve reference PDF bytes across Git
checkouts and make the standalone Electron test remain alive until every case
finishes, with reliable completion evidence. No test, fixture, workflow,
production source or version-file fix is included in this dependency-only task.
The Git index file acquired a different raw checksum during installation/test
verification. A read-only comparison confirmed that all 332 indexed mode/blob/path
entries still equal HEAD, with no staged changes. Its cache was not restored.
Production source, generated runtime, AGENTS.md, manifest/minimum, versions.json
and Git staging remain unchanged. No commit, push or release is performed.

## Ordinary test stabilization (20 October 2026)

This follow-up preserves the local 43.7.5 package/lock update and the complete
19 October record above. Its earlier **Not ready** decision is historical;
the ordinary results below establish the current local commit-readiness status.
Starting branch/HEAD/origin-main reference remained `main` /
`62af45c4c7b2cd2fcf4f41e108dceceeb43da15d`, with empty staging and only
the three already approved local package/lock/report modifications.

### Confirmed reference-byte cause and minimal correction

- The initial failures were `test:email-import:parser` (reference SHA-256 for
  `test-attachment-2.pdf`) and `test:email-import:attachments` (exact decoded
  `test-attachment-1.pdf` bytes). These checks correctly require byte identity,
  not merely equivalent text or a visually similar PDF.
- `git config --show-origin --get core.autocrlf` reported `true` from the
  system Git configuration. No Git configuration was changed. Before correction,
  `git ls-files --eol` reported `i/lf w/crlf` for both PDFs; `text` and `eol`
  attributes were unspecified. A system `diff=astextplain` attribute also
  applied, but that diff driver is not itself checkout conversion.
- These synthetic PDFs have no NUL bytes and were automatically treated as
  text for checkout conversion. Their Git blobs and base64-decoded email
  attachments already matched the fixed SHA-256/size expectations above;
  the CRLF-expanded checkout references did not.
- Once those PDF checks could continue, the parser exposed the same mismatch
  in `notes.txt`: checkout 51 bytes, SHA-256
  `9626912639283053816b318430dcac10ee6486dec4d7840e462c52eb0310c6d7`,
  versus committed/decoded 49 bytes, SHA-256
  `2b813401f179682b85b9d389db5bff025254b0896d977bd47e88f02a724e4971`.
  The first post-PDF-fix aggregate attempt therefore still failed; the final
  aggregate below includes the text-reference correction.
- `.gitattributes` now sets `test/fixtures/email/attachments/* -text` for all
  four checksummed attachment references, including the text reference.
  Checksummed reference bytes must survive checkout unchanged regardless of
  whether their format is human-readable.
- The owner separately approved restoring only the two named PDF references
  from HEAD. Those PDFs and the affected text reference were copied directly
  from their current HEAD blobs and verified against their existing hashes.
  No PDF normalization, regeneration, new expected hash or assertion change
  was used. The restored files have no content diff against HEAD.

### Confirmed Electron lifecycle cause and minimal correction

The original `run().then(...).catch(...)` chain and the per-case PDF operations
are awaited. The printer intentionally destroys each job's hidden BrowserWindow
in `finally`. In this standalone application, closing the last window triggers
Electron's default application shutdown between jobs, even while the next
Promise is pending. The test had no `window-all-closed` listener and therefore
never reached its final success message or explicit `app.exit(0)`.

Read-only lifecycle observation reproduced this in **both 43.5.0 and 43.7.5**:
one window created/closed, process exit 0, no success message and no call to
the test's own final exit. Electron 43.5.0 was downloaded with checksum
verification into a separate OS-temp directory; the project's installed
43.7.5 dependency was not replaced. This is not an upgrade-specific failure.

`scripts/test-email-import-pdf-electron.js` now owns its standalone lifetime:

- A `window-all-closed` listener keeps the process alive between awaited jobs.
- The existing success/error handlers still explicitly exit 0/1 after the
  suite completes. An unexpected `app.quit()` before completion is rejected
  with exit 1 by a `before-quit` guard.
- Each run creates a new OS-temp user-data profile, avoiding a shared Electron
  application profile. Test profiles and diagnostic evidence are retained.
- No delay, timer, retry, production-printer change or weakened PDF/link
  assertion was introduced.

An extra intentional quit at the ready-event boundary produced the guard
message and exit **1**, as expected. An earlier probe that synchronously
called quit from inside BrowserWindow construction returned native error
`4294930435`; that constructor-interruption probe was not counted as an
ordinary suite result. The fixed suite itself also completed on 43.5.0.

### Final ordinary verification

The following are direct npm scripts, without the earlier diagnostic runner
or additional test arguments:

```text
npm.cmd run check
npm.cmd run test:email-import
npm.cmd run test:email-import:pdf-electron
```

`npm_config_logs_max=0` was set only in the command process to suppress npm
log files. The inherited `ELECTRON_RUN_AS_NODE=1` was removed only in the
native Electron command's child environment. No persistent environment or
sandbox configuration was changed; no user Obsidian installation/Vault was used.

| Ordinary command | Final result |
| --- | --- |
| `npm run check` | **21/21 stages passed**, exit 0; disk migration 10/10, native Properties/columns nine groups, 730 keys in seven locales. Injected error-path diagnostics are expected. |
| `npm run test:email-import` | **22/22 groups passed**, exit 0, including all six EML messages, reference SHA-256/size/exact-byte checks, PDF integrity and extraction/collision checks. |
| `npm run test:email-import:pdf-electron` | **All three HTML/CID/hostile-source cases passed**, exit 0 with the final success message. Actual Electron **43.7.5**, Chromium **150.0.7871.250**. Real printToPDF headers/size and clickable attachment URI checks passed. |
| Generated runtime | `deterministicBuild: true`, `rootOnlyLoad: true`; runtime bytes unchanged. |

These ordinary results replace the diagnostic-only completion evidence from
19 October. The previously recorded user-reported Obsidian 1.14.4 compatibility
and updated-installer requirement above retain their original scope.
Linux/macOS execution and a new practical Obsidian run were not performed.

Retained follow-up evidence:

- Lifecycle comparison and fixed-test/quit-guard results:
  `C:\Users\leifd\AppData\Local\Temp\pdfium-gate-electron-lifecycle-gEcsk3`.
- Disk migration workspace:
  `C:\Users\leifd\AppData\Local\Temp\metadata-migration-9d3e46f8-2f11-408e-9153-3ed6dc7c6bf5`.

### Current local decision

**Ready for commit after local stabilization.** There is no observed production
or PDF/link regression in these runs. Scope is Git checkout attributes, the
standalone Electron test and this report, alongside the preserved earlier
Electron-only package/lock update. The restored reference files equal HEAD.
Production source, generated runtime, AGENTS.md, workflows, plugin **0.1.230**
and minimum Obsidian **1.13.7** remain unchanged. Staging remains empty.
No staging, commit, push, branch/tag/archive change or release was performed.

Final Git inspection: `status --short` reports eight modified paths, including
the three restored references. Their raw bytes equal HEAD, and both the raw
and content diffs for those references are empty. The content diff therefore
contains five files: `.gitattributes`, this report, `package.json`,
`package-lock.json` and `scripts/test-email-import-pdf-electron.js`.
SHA-256 comparison of all 332 project files confirmed that every other byte
is preserved from task start, including the existing package changes.
All 332 index mode/blob/path entries still equal HEAD. No index restoration
or staging was used to clear the reported reference-file status.
