# Praktisk test: lokal 0.1.228-utviklingskandidat

Dato: 2026-10-13. Testvault: `C:\GitHub\PDFium-Gate\.codex-test-workspaces\obsidian-01228-35cb7a22-c091-4d92-9beb-27ef3fd9fc3d`.
Ved denne tidligere testklargjøringen viste pluginen **0.1.227** fordi manifestet ennå ikke var endret. Releasekandidaten i repositoryet er nå versjonert som **0.1.228**; den bevarte testvaulten er ikke oppdatert i dette steget. Dette er den lokale 0.1.228-utviklingskandidaten, ikke en publisert 0.1.228-release. Automatisk check: 19/19 best?tt; diskregresjon: 10/10. Ved opprinnelig klargjøring var tabellen ikke testet. Brukeren har senere bekreftet punkt 1–6 OK (2026-10-13). Punkt 7–11 er ikke gjentatt i denne runden; tidligere godkjent funksjonalitet beholdes.

## Oppstart

1. I Obsidian: ?pne vault-velgeren, velg **Open folder as vault / ?pne mappe som vault**, og velg den eksakte mappen over. Bekreft mappeidentiteten f?r pluginaktivering.
2. Settings/Innstillinger ? Community plugins/Fellesskapsprogramtillegg: sl? av Restricted mode/Begrenset modus **bare i denne testvaulten**. Aktiver **PDFium Gate** i listen over installerte plugins. Ingen nedlasting trengs. Restart denne vaulten hvis listen m? oppdateres.
3. Velg Bokm?l i PDFium Gate. Registrer eksisterende PDF-er eksplisitt i plugininnstillingene, og ?pne PDF Dokumentregister via pluginens kommando. Velg kolonner slik at Forfatter og Publisert p? nettet vises.
4. E-post/ZIP-kildene ligger under `.pdf-metadata/practical-test-inputs/`. Bruk Windows Filutforsker til ? **kopiere**, ikke flytte, kilden til `02-Inbox/` n?r riktig test skal starte. Dette bevarer syntetiske originaler. Ikke kopier noe fra aktive vaults.

## Resultatregistrering

Fyll Status med **OK / Feil / Ikke testet**. Noter dato, Obsidian-versjon, reprosteg og faktisk resultat. Feilinjeksjonene nedenfor inng?r ikke i praktisk testing; tidligere automatisert bevis erstatter ikke denne brukerbekreftelsen.

| Test | Handling i Obsidian / testvault | Forventet resultat og kontroll i Dokumentinfo / Dokumentregister | Status / notat |
|---|---|---|---|
| 1. Eldre skjema | Aktiver pluginen f?r du endrer skjemaet. Sammenlign med skjemaet i inputs/baseline via Filutforsker. | author/source_url og migrations-mark?r tilkommer; eksisterende felt-UUID-er, Synthetic custom sender og deaktivert response_received bevares. Byteidentisk eldre backup finnes i .pdf-metadata/backup/document-metadata-schema/. Feltene vises i begge metadataflater n?r valgt. | OK – brukerbekreftet 2026-10-13 |
| 2. Gjentatt oppstart | Registrer revisjon, backupantall og UUID-er. Start testvaulten p? nytt. | Ingen nye skjemaendringer/backup fra uendret oppstart; Dokumentinfo og register viser samme verdier. | OK – brukerbekreftet 2026-10-13 |
| 3. PDF og nye felter | ?pne 01-PDF/metadata-test.pdf. Sett Forfatter til Synthetic Author og URL til https://example.invalid/source, lagre og start vaulten p? nytt. | Verdier vedvarer og stemmer i begge flater. URL er klikkbar; .invalid er med hensikt ingen virkelig nettside. | OK – brukerbekreftet 2026-10-13 |
| 4. Spr?k og egeneide etiketter | Bokm?l ? engelsk ? Bokm?l. Endre deretter Forfatter-etiketten til Min syntetiske forfatter via feltadministrasjon og gjenta spr?kbyttet. | Fabrikketiketter f?lger spr?k; Synthetic custom sender og den nye brukeretiketten beholdes. Ingen skjemaskriving ved bare spr?kbytte. UUID-er og verdier uendret; begge flater stemmer. | OK – brukerbekreftet 2026-10-13 |
| 5. Enter/Escape | I registeret: endre tekst/URL/select/boolean med Enter; rediger p? nytt og avbryt med Escape. Kontroller ogs? multiselect hvis du oppretter et syntetisk felt. | Enter lagrer ?n gang, Escape forkaster ulagret endring, fokus returnerer. Dokumentinfo bekrefter samme lagrede verdier. | OK – brukerbekreftet 2026-10-13 |
| 6. URL-validering og eldre verdi | Pr?v ugyldig endret URL og tom URL. For eldre verdi: lukk pluginen, endre bare test-PDF-ens syntetiske metadata-note slik at source_url er www.example.invalid, aktiver igjen og endre bare Forfatter i Dokumentinfo. | Endret ugyldig URL avvises med lokalisert feil; tom valgfri URL kan fjernes. Uendret eldre URL beholdes n?r annet felt lagres. Kontroller note, Dokumentinfo og register. | OK – brukerbekreftet 2026-10-13 |
| 7. EML/MSG | Kopier one-pdf-attachment.eml og msg-with-attachments.msg fra inputs/email til 02-Inbox, ?n om gangen. | E-post-PDF og vedlegg importeres i EPOST-mappe. Kilde fjernes bare ved vellykket import. PDF-er registreres; Dokumentinfo viser proveniens/foreldrelenke, register viser aktive PDF-er. | Ikke testet |
| 8. ZIP og kollisjoner | Kopier zip-collision-1.eml og deretter zip-collision-2.eml til inbox. | Ingen overskriving av foreldre-PDF eller report.pdf-kollisjoner; egen EPOST-mappe/suffiks. Vedleggslenker ?pner rett fil; ZIP-proveniens bevares i Dokumentinfo, register viser riktige PDF-er. Mailene har ulike Message-ID-er for ? unng? byteidentisk duplikat. | Ikke testet |
| 9. Filutforsker mens aktiv | Kopier explorer-live.pdf til inbox; kopier multiple-attachments.eml og returner fokus til Obsidian. | PDF registreres ved create-hendelse; ny e-post importeres via create/fokus uten dobbel import. Dokumentinfo/register samsvarer. | Ikke testet |
| 10. Tilf?rsel mens avsluttet | Etter at f?rste e-postinventar er etablert: lukk testvaulten, kopier offline-email.eml og explorer-offline.pdf til inbox, ?pne igjen. | Ny e-post oppdages ved oppstart; eldre uendrede kilder gir ingen masseimport. Offline-PDF finnes under Uregistrerte og registreres eksplisitt; ikke forvent automatisk oppstartsregistrering. Kontroller begge flater. | Ikke testet |
| 11. Sletting/deaktivering, sist | Deaktiver source_url, slett author via feltadministrasjon, start p? nytt. | Deaktivert felt forblir deaktivert; slettet felt gjenopprettes ikke. Kontroller valgt synlighet i begge flater og skjema. Dette gj?res sist, siden feltene brukes i tidligere tester. | Ikke testet |

## Avgrensning

Ingen virkelig vault-restore eller plugin-nedgradering inng?r. Bruk bare denne syntetiske vaulten. Pluginfilene, det eldre skjemaet og inputkildene er klargjort; punkt 1–6 er senere brukerbekreftet OK. Praktisk testing av hele kandidaten er ikke uttømmende. Tilbakeføring til 0.1.227 etter skjemamigrering er ikke garantert og kan kreve en kompatibel skjemabackup. Bevar testvaulten og tidligere kontrollpunkter.
