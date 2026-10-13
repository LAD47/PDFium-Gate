# PDFium Gate: prosjektregler for Codex

Disse reglene supplerer de globale arbeidsreglene i `C:\Users\leifd\.codex\AGENTS.md`. Les dem før arbeid; ikke dupliser eller svekk dem. Brukerens eksplisitte avgrensning gjelder for den aktuelle oppgaven.

## Før arbeid

- Arbeidsområdet er `C:\GitHub\PDFium-Gate`. Kontroller Git-status, aktiv branch og staging før endringer. Ikke anta at lokal arbeidskopi er identisk med GitHub `main`; ikke hent, synkroniser eller bytt branch automatisk.
- Ved eksisterende lokale endringer: stopp før skriving og rapporter dem, med mindre brukeren uttrykkelig har godkjent videre arbeid. Ved slik godkjenning skal de eksisterende endringene bevares fullstendig.
- Les [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), relevante domenekontrakter, [RELEASE.md](RELEASE.md) og [aktiv prosjektplan](docs/planning/ACTIVE-ROADMAP.md). Historiske notater er ikke gjeldende spesifikasjoner.
- Bruk [Codex-arbeidsflyten](docs/development/CODEX-WORKFLOW.md) for lokale Windows-kontroller. Kommandoeksempler i dokumentasjonen er ikke i seg selv tillatelse til å kjøre dem.

## Kildekode og kontrakter

- Kanonisk produksjonskode ligger i `src/`. Rotens runtime-filer, blant annet `main.js` og `main-bridge.js`, er genererte artefakter; ikke rediger dem manuelt.
- Bevar eksisterende kanoniske eiere, eksplisitte operasjonsporter, én skriver per muterbar tilstand og fravær av avhengighetssykluser og skjulte kall mellom features. Grunnleggende arkitekturendringer krever konkret behov og egen avklaring.
- Markdown/YAML og eksplisitte konfigurasjonsfiler er varig sannhetskilde. RAM-indekser og cache er avledet. Tvetydig identitet skal stoppe trygt.
- Bevar dokumentenes permanente `filemeta_id`-UUID, betrodd rename/move-kontinuitet og vanlig PDF-livssyklus `active`/`missing`. Ikke gjeninnfør ordinær PDF-hashgjenoppretting, manuell relink eller `trashed`.
- Endringer i metadataformater, UUID-er, dokumentidentiteter, lagringsstier eller migreringsregler krever egen kompatibilitets-/migreringsvurdering og uttrykkelig godkjenning før implementering. Se [metadata](docs/architecture/08-metadata-schema.md) og [dokumentidentitet](docs/architecture/09-document-records.md).

## Brukerdata og lokal testing

- Ikke les eller endre en Obsidian Vault uten uttrykkelig tillatelse. Ikke endre brukerdata, PDF-filer, metadata eller `.obsidian` uten at det inngår i den godkjente oppgaven.
- Test bare mot en eksplisitt godkjent testvault og avklart testomfang. En vault-sti i testdokumentasjonen er ikke tilgangsgodkjenning. Bevar testgrunnlag og backup.
- Ingen automatisk deploy eller installasjon av plugin. Kopiering til vault/plugin-mappen, aktivering og praktisk testing krever egen tillatelse.
- Ved godkjente kodeendringer: velg relevante automatiserte tester etter [testkontraktene](docs/architecture/13-testing-and-verification.md), og behold eksisterende verifikasjonsporter. Avklar filskriving, midlertidige mapper, logger og testdata før kjøring.
- `npm run check` starter med `npm run build` og kan generere runtime-filer. Det er ikke en skrivefri kontroll. Ikke kjør tester eller bygg i en dokumentasjonsoppgave som forbyr dette.
- Ikke installer eller oppgrader avhengigheter uten godkjenning. Sandkassefeil skal rapporteres konkret; kjøring utenfor sandkassen krever avgrenset godkjenning og gir ikke generell utvidet tilgang.

## Språk og i18n

- Bevar [i18n-kontraktene](docs/architecture/12-i18n.md). Engelsk er kanonisk UI-kilde og fallback. Offisielle språk (`en`, `nb`, `de`, `es`, `sv`, `da`, `fr`) skal ha full nøkkeldekning og identiske placeholders.
- UUID-er, `filemeta_*`, schema-`property`, maskinverdier og tekniske identifikatorer er språk-uavhengige. Bevar skillet mellom lokaliserte fabrikkvisningsnavn og brukerens egne navn/etiketter; språkbytte skal ikke overskrive brukerdata.

## Release og sluttkontroll

- Ikke commit, push, merge, rebase, tag, release eller publiser til GitHub/Community Plugins uten uttrykkelig godkjenning. Ingen eksterne API-kall eller kostnadsbelagte tjenester uten godkjenning.
- [RELEASE.md](RELEASE.md) er autoritativ for release. Bevar repository-verifikasjon, praktisk Obsidian-testing, obligatorisk Community **Review branch / preview scan** av nøyaktig kandidat, vurdering av alle funn, ny scan etter relevante kandidatendringer, grønn runtime-build og uforanderlig `archive/<version>`.
- Sammenlign status før/etter, kontroller diff og staging, og rapporter faktisk kjørte kontroller. Ved godkjent arbeid i en uren arbeidskopi: kontroller også at tidligere endringer er bevart. Nye usporede dokumenter må kontrolleres separat fra vanlig `git diff`.
