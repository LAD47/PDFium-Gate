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
