# Lokal Codex-arbeidsflyt på Windows

Dette dokumentet gjelder lokal utvikling med OpenAI Codex i VS Code i `C:\GitHub\PDFium-Gate`, med Windows 11 og PowerShell som utgangspunkt. Det supplerer [prosjektreglene](../../AGENTS.md) og de globale reglene i `C:\Users\leifd\.codex\AGENTS.md`.

## Start med lokal tilstand

Kontroller lokal branch, arbeidskopi og staging før endringer:

```powershell
git --no-optional-locks status --short
git branch --show-current
git diff --cached --name-only
```

Ikke anta at GitHub `main` er lik lokal arbeidskopi. Ikke kjør pull, fetch, branchbytte eller releasekommandoer automatisk. Eksisterende endringer skal rapporteres før skriving; videre arbeid krever uttrykkelig avklaring og bevaring av brukerens arbeid.

Ved godkjent dokumentasjonsarbeid i en uren arbeidskopi kan SHA-256 registreres med `Get-FileHash -Algorithm SHA256 -LiteralPath <fil>` før og etter for de eksisterende endrede filene. Sammenlign også Git-status og staging. Dette gir en kontroll av faktisk filinnhold, utover at Git fortsatt viser filen som modifisert.

## Bekreftede observasjoner fra denne klargjøringen

Den 2026-10-13, på `feature/0.1.228-email-bundles`:

- Git-status i den begrensede sandkassen feilet med `fatal: this operation must be run in a work tree`.
- En oppfølgende kontroll med eksplisitt work-tree feilet med `fatal: cannot come back to cwd: Permission denied`. Samtidig kunne Git lese aktiv branch og rapporterte `core.bare=false`.
- Etter godkjent, skrivefri kjøring utenfor sandkassen lyktes `git --no-optional-locks status --short` og `git branch --show-current`. Status viste 11 eksisterende modifiserte utviklingsfiler.

Dette er observerte resultater. Forskjellen mellom kjøremiljøene peker mot en tilgangs-/sandkassebegrensning, men fastslår ikke den tekniske rotårsaken. Feilen er ikke grunnlag for å rekonstruere repository, endre Git-konfigurasjon eller tilbakestille filer.

## MXC og Python-temp: erfaringer fra PDFgate Transcriber

Opplysningene nedenfor er brukerens bekreftede praktiske observasjoner fra 2026-10-13 i `C:\GitHub\PDFgate-transcriber`. De er ikke gjentatt i dette dokumentasjonssteget, og er ikke PDFium Gate-testresultater.

### Miljø for de tidligere testene

- Windows 11 Pro 25H2, build `26200.9457`.
- VS Code-utvidelsen **Codex – OpenAI's coding agent** `26.1007.21434`; CLI `codex-cli 0.162.0-alpha.17.2`.
- Python 3.12: `C:\Python312\python.exe`.
- ChatGPT Plus-autentisering, uten separat API-nøkkel.
- Daværende global konfigurasjon: `sandbox_mode = "read-only"`, `approval_policy = "on-request"`, `prefer_mxc = true`. Dette er et historisk miljøoppsett, ikke en anbefaling om å endre gjeldende konfigurasjon.

### MXC-start

Følgende kommando ble forsøkt fra en allerede aktiv Codex-agent:

```powershell
codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK
```

Resultat: `Error: failed to prepare MXC sandbox: native MXC is unavailable on this executor`, avslutningskode `1`.

Samme kommando fra VS Codes vanlige PowerShell-terminal ga `MXC_OK` og avslutningskode `0`. MXC fungerte dermed på denne PC-en fra en vanlig PowerShell-prosess. Hvorfor start fra den eksisterende agenten feilet, er ikke endelig avklart; begrensninger ved nestet sandkassekjøring er en hypotese.

### Midlertidige Python-mapper

Denne testen kunne opprette en midlertidig katalog, men påfølgende filskriving ble blokkert:

```python
import pathlib
import tempfile

with tempfile.TemporaryDirectory() as folder:
    path = pathlib.Path(folder) / "codex-write-test.txt"
    path.write_text("Test OK", encoding="utf-8")
    print(path.read_text(encoding="utf-8"))
```

Skriving ga `PermissionError: [Errno 13] Permission denied`; automatisk opprydding ga også `PermissionError: [WinError 5] Ingen tilgang`. Katalogene lå under `C:\Users\leifd\AppData\Local\Packages\sandbox.{...}\AC\Temp\`, med varierende sandkasse-ID.

Problemet oppstod både i den ordinære Codex-sandkassen og ved direkte Python-kjøring i MXC med `--permission-profile :workspace`, startet fra vanlig PowerShell. Rotårsaken er ikke fastslått: Python-katalogrettigheter, Windows AppContainer/MXC, Codex-versjonen og samspillet mellom dem er mulige forklaringer. Dette er ikke dokumentasjon på en generell feil i alle Codex-/MXC-installasjoner.

### Automatiserte tester og godkjent kjøring utenfor sandkassen

Den samme testsuiten i PDFgate Transcriber ble kjørt med:

```powershell
python -B -m unittest discover -s tests -v
```

| Kjøremiljø / utviklingssteg | Rapportert resultat | Avslutningskode |
| --- | --- | --- |
| Inne i sandkassen | `Ran 80 tests in 0.922s`; `FAILED (errors=103)` | 1 |
| Utenfor sandkassen, etter uttrykkelig godkjenning | `Ran 80 tests in 11.095s`; `OK` | 0 |
| Senere H.2.1-utvikling, fire nye tester; godkjent kjøring utenfor sandkassen | `Ran 84 tests in 10.770s`; `OK` | 0 |

I første kjøring bestod 22 tester og 58 fikk feil; de 103 feilregistreringene inkluderte flere oppryddingsfeil. Feilene gjaldt hovedsakelig tilgang til temp-mapper, SQLite-databaser og testfiler. Ingen dokumentert prosjektkodefeil forklarte resultatet.

Etter den godkjente 80-testkjøringen var rapportert Git-status `## main...origin/main`, uten kildekodeendringer. Alle 80 tester bestod; senere bestod alle 84 etter H.2.1-endringene. Resultatene støtter at de tidligere tilgangsfeilene var knyttet til sandkassemiljøet, men fastslår ikke den underliggende mekanismen.

### Betydning for PDFium Gate

PDFium Gate bruker hovedsakelig JavaScript/Node.js. Tilsvarende feil er **ikke bekreftet** for `npm run check` eller andre Node.js-tester. Ikke endre Node.js, testene eller sandkassekonfigurasjonen på grunnlag av Python-observasjonene. Ved fremtidig godkjent testing: prøv normal sandkassekjøring først, undersøk konkrete begrensninger og be bare om nødvendig utvidet tilgang. Kontroller Git-status før og etter; `npm run check` omfatter bygg og kan generere runtime-filer.

## Godkjenninger og sandkasse

Å åpne prosjektet i VS Code opphever ikke sandkassens begrensninger. En skrivebeskyttet sandkasse kan hindre både dokumentasjonsskriving og tester som oppretter midlertidige filer.

Ved tilgangsfeil: rapporter kommando og feil, identifiser minste nødvendige lese-/skrivebehov og be om avgrenset kjøring utenfor sandkassen gjennom godkjenningsmekanismen. Godkjenningen gjelder den konkrete operasjonen, ikke fremtidige tester, vault-tilgang, installasjon eller publisering. Ikke endre Windows-sikkerhet eller sandkasseinnstillinger for å omgå feilen.

Behold sandkassen aktiv som standard; ikke gi permanent generell tilgang for å få en test til å fungere. Utenfor sandkassen kjører kommandoen med vanlige Windows-brukerrettigheter uten sandkassens tekniske begrensninger. En instruks om å unngå ekstern nettverkstrafikk innebærer ikke at nettverket er teknisk blokkert.

Godkjente kommandoprefikser kan lagres hvis brukeren velger det i dialogen; kontroller at slike regler ikke er unødvendig brede. Lokal HTTP-kommunikasjon via `127.0.0.1` kan godkjennes separat ved behov. Ikke utfør reset eller sletting uten uttrykkelig godkjenning.

Bruk eksisterende ChatGPT-innlogging. Separate API-kostnader, eksterne API-kall, opplastinger og installasjon/oppgradering av avhengigheter krever uttrykkelig godkjenning.

## Testing og release

[CONTRIBUTING.md](../../CONTRIBUTING.md) og [testkontraktene](../architecture/13-testing-and-verification.md) beskriver verifikasjonen. I lokal `package.json` starter `npm run check` med `npm run build`; kommandoen kan derfor regenerere runtime-filer og skal ikke behandles som en skrivefri dokumentasjonskontroll.

Før godkjent testkjøring: les relevant testoppsett og avklar hvor temp-filer, logger, databaser og fixtures skrives. Bevar eksisterende testgrunnlag. Praktisk testing krever en eksplisitt godkjent testvault; den historiske vault-stien i [testobservasjonene](../testing/TEST-OBSERVATIONS.md) er ikke en tillatelse til å lese eller endre den.

Ikke installer/deploy plugin automatisk eller endre PDF-er, metadata, brukerdata eller `.obsidian` uten uttrykkelig tillatelse. Rapportér kjørte tester og resultater, samt tester som ikke ble kjørt.

[RELEASE.md](../../RELEASE.md) beholder autoritet over releaseprosessen, inkludert Community preview scan og øvrige kontroller. Dokumenterte releasekommandoer er ikke godkjenning til commit, push, merge, tag eller publisering.

## Kontroll av dokumentasjonsendringer

For en avgrenset dokumentasjonsoppgave kan disse kontrollene brukes uten bygg eller tester:

```powershell
git diff --check -- CONTRIBUTING.md
git diff --stat
git diff -- CONTRIBUTING.md
git --no-optional-locks status --short
git diff --cached --name-only
```

Vanlig `git diff` viser ikke nye usporede filer. Les disse separat og kontroller lenkemål, UTF-8, avsluttende linjeskift, trailing whitespace og konfliktmarkører uten å stage dem. Sammenlign eventuelle registrerte SHA-256-verdier og status fra oppgavestart. Avslutt med nøyaktig filliste og eventuelle begrensninger; ikke kjør tester, bygg eller releasehandlinger når oppgaven bare gjelder dokumentasjon.


## Windows/npm-loggfiler: bekreftet erfaring 2026-10-13

`npm_config_logs_dir=NUL` opprettet en faktisk `NUL`-katalog med 11 npm-loggfiler i prosjektroten under full verifikasjon. Det reserverte Windows-navnet ga misvisende katalogfeil i Git og vanlige filoperasjoner. Denne metoden skal ikke brukes igjen. Ved behov for å deaktivere npm-loggfiler brukes den dokumenterte npm-innstillingen `logs-max=0` (for eksempel prosesslokalt `npm_config_logs_max=0`); behold konsollutskrift og testresultater.

Dette er en Windows/npm-observasjon, ikke en feil i PDFium Gate. Katalogen og de 11 loggfilene ble fjernet etter særskilt godkjenning og Windows-API-kontroll av eksakt mål, kataloginnhold og fravær av reparsepunkter. Kontrollpunktet ble bevart.
