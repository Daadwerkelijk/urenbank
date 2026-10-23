# Urenbank

Persoonlijke PWA om de **urenbank** (plus/min-uren t.o.v. contract), het
**verlofsaldo** (zoals bij P&O van de gemeente Amsterdam) en de
**verlofplanning** bij te houden. Vervangt de Excel "Uren Bank". Nu voor
één gebruiker; later mogelijk ook voor collega's (daarom vanaf het begin
login en rijbeveiliging).

Statische app: vanilla HTML/CSS/JS-modules, geen build-stap. Data in
Supabase, schema `urenbank`. Hosting: GitHub Pages vanaf `main`
(https://daadwerkelijk.github.io/urenbank/).

## Kernbegrippen (afspraken met de gebruiker, oktober 2026)
- **Rooster**: 4 × 9 uur (ma, di, do, vr; woensdag vast vrij). De vrije
  dag mag per week schuiven → `dag_afwijking`.
- **Timetell**: de gebruiker schrijft per week gewerkte uren + verlof dat
  bij P&O geboekt is. Feestdagen zijn in Timetell geblokkeerd (niet
  geschreven). Verlof uit de urenbank schrijft hij bewust níet.
- **Norm** per week = rooster − feestdagen op werkdagen.
- **Urenbank** = Σ (Timetell − norm). Eigen administratie: geen maximum,
  vervalt niet, staat niet in de officiële systemen.
- **Verlofsaldo**: potjes zoals in het P&O-overzicht ("Mijn saldo"):
  soort + opbouwjaar + uren. Alleen **geboekt** verlof gaat eraf (ook als
  het in de toekomst ligt); gepland verlof telt alleen in "na planning".
- **Afschrijfvolgorde** zoals P&O het doet (afgeleid oktober 2026):
  bovenwettelijk oudste jaar → wettelijk lopend jaar → gekocht vorig jaar
  → bovenwettelijk vorig jaar → bovenwettelijk lopend jaar. Instelbaar.
- **Totaal vrij** = verlofsaldo + urenbank. Omrekening: dagen ÷ 9,
  werkweken ÷ 36.
- **Dagen aaneengesloten vrij** = verlof + aangrenzende weekenden, vaste
  vrije dagen en feestdagen (bewust "voor het goede gevoel").
- **Feestdagen**: cao Gemeenten — 5 mei elk jaar, geen Goede Vrijdag.
  1 mei: onbekend of de gebruiker die keuzedag heeft; behandeld als
  werkdag.
- **KPE/werksessies**: alleen info in de planning, geen effect op uren.
- **Controlepunt 23-10-2026**: de app kwam per potje tot op de honderdste
  overeen met het P&O-overzicht ("Mijn saldo"). Bij een nieuw verschil:
  vergelijk per potje begin, opgenomen en rest (skill `p-en-o`). Echte
  saldi staan niet in de repo (die is openbaar).
- **Urenbank per kalenderjaar**: begint elk jaar op 0 en gaat niet mee
  naar het nieuwe jaar. De gebruiker zorgt zelf dat hij op 31 december op
  0 staat; de app waarschuwt in november en december.
- **Potjes** tellen pas mee en zijn pas zichtbaar op het overzicht vanaf
  "beschikbaar vanaf" (potjes van volgend jaar dus vanaf 1 januari).
- **Dubbel verlof**: bij opslaan een waarschuwing ("Toch opslaan"); op de
  verlofpagina en bij "Let op" blijft overlap zichtbaar.

## Structuur
- `index.html` — schil; laadt `css/app.css` en `js/app.js`
- `js/app.js` — alle schermen (overzicht, weken, verlof, jaarkaart,
  instellingen) en login. Rekent niet zelf; toont wat de database
  berekent.
- `js/api.js` — enige datalaag (Supabase-client, schema `urenbank`); met
  `?demo` wordt `js/demo.js` gebruikt
- `js/demo.js` — demo-modus: voorbeelddata in het geheugen + JS-kopie van
  de rekenregels. Moet gelijk lopen met de SQL-functies.
- `js/config.js` — Supabase-URL en publishable key (openbaar bedoeld)
- `css/app.css` — opmaak; kleuren als CSS-variabelen, licht en donker
- `sw.js` — service worker (netwerk eerst); `CACHE` ophogen bij elke
  wijziging aan app-bestanden
- `manifest.webmanifest`, `icons/` — PWA
- `supabase/migrations/` — `001` schema + RLS, `002` rekenfuncties,
  `003` jaarcontroles (2000–2100), `004` urenbank per jaar, samenvatting
  met peildatum, `verlof_overzicht` (met overlap), `005` jaarovergang
  afgerond (`instellingen.jaarovergang_klaar`), `006` agenda-abonnement
  (`agenda_feed` + `agenda_items`, alleen voor `service_role`), `007`
  tokenformaat-check en `request.jwt.claim.sub`. Nieuwe
  wijzigingen altijd in een nieuw genummerd bestand.
- `supabase/functions/urenbank-agenda/` — Edge Function (verify_jwt uit):
  geeft met `?token=` een .ics met verlof vanaf vandaag (geen historie);
  onbekende token = lege agenda. Uitrollen via `deploy_edge_function`.
  De functie `dynamic-action` in hetzelfde project hoort bij een andere
  app: niet aanraken.
- `tests/sql/rekenregels.sql` — rekenregeltests (transactie + rollback,
  verzonnen getallen). Claude draait ze zelf via `execute_sql`.
- `tests/demo-gelijkloop.mjs` — zelfde scenario tegen `js/demo.js` (Node)
- `tests/rooktest.md` — kernflows om af te vinken

## Supabase
- Project **Casa-Toscana** (`wvtvcfmdkyzuptnuawuy`, eu-west-1). Gedeeld
  met andere privé-hobbyprojecten van de gebruiker (tabellen in
  `public`); de urenbank blijft strikt in schema `urenbank`.
- Schema `urenbank` staat bij Data API → Exposed schemas.
- Elke tabel: `user_id default auth.uid()`, RLS aan, policy
  `eigen_rijen`; geen rechten voor `anon`. Functies: `security invoker`,
  `set search_path = ''`, `execute` alleen voor `authenticated`.
  Enige uitzondering: `agenda_items` (security definer, alleen
  `service_role`, voor de agendafeed). Omdat RLS daarbinnen niet geldt,
  moet elke functie die het aanroept (`verlof_overzicht`, `dagen` en
  hulpfuncties) zelf expliciet op `user_id = auth.uid()` filteren. De
  feedtest "andere gebruiker" in `rekenregels.sql` blijft altijd staan.
- **Inloggen**: met e-maillink (`signInWithOtp`, geen nieuwe accounts).
  De gebruiker wil met zijn eigen e-mailadres inloggen en zijn wachtwoord
  níet wijzigen, omdat hetzelfde account in zijn andere apps wordt
  gebruikt. Wachtwoord-reset dus nooit voorstellen of automatisch doen.
  Redirect URL `https://daadwerkelijk.github.io/urenbank/` moet in
  Authentication → URL Configuration staan.
- Auth-instellingen gelden voor het hele project: wijzigingen daaraan
  altijd eerst met de gebruiker bespreken.

### Database-wijzigingen zelf uitvoeren (afspraak 23-10-2026)
De gebruiker wil database-wijzigingen en tests níet handmatig hoeven te
plakken. De Supabase-koppeling vraagt om een bevestiging (die in de praktijk
wordt geannuleerd) bij: `drop`, `delete`, en `update`/`delete` zonder
`where`. Daarom:
- **Migraties zijn altijd toevoegend**: `create`, `create or replace`,
  `alter table ... add`, en herhaalbaar (`if not exists`). Nooit `drop`.
  Verandert de vorm van een functie (andere kolommen of parameters), dan
  krijgt de nieuwe versie een nieuwe naam en wordt de oude met
  `create or replace` een doorgeefluik naar de nieuwe. Voorbeeld:
  `verlof_details()` → `verlof_overzicht()`, `samenvatting()` →
  `samenvatting(date)`.
- **Tests en losse SQL**: geen `delete`; elke `update` met een `where`.
  Testdata verdwijnt via `rollback`. Een verzonnen testgebruiker zonder
  account kan met `set local session_replication_role = replica` (alleen
  binnen de transactie), zodat er niets in `auth` geschreven hoeft te
  worden.
- Volgorde bij uitrollen: eerst de migratie (via `apply_migration`), dan
  de SQL-tests (via `execute_sql`), dan pas pushen.
- Is opruimen toch echt nodig (een overbodige functie, oude data), dan
  eerst aan de gebruiker vragen en het als losse, bewuste stap doen.

## Werkwijze-afspraken

### Skills
Vraag bij elk verzoek om een actie of wijziging aan de app eerst welke
skill(s) ingezet moeten worden: `architectuur-check`, `data-steward`,
`monkey`, `p-en-o`, `rooktest`, `super-collega`, `tdd`. Bij elke wijziging
aan een rekenregel horen in elk geval `tdd` en `p-en-o`. Na afronding van
een taak, vóór commit/push: de agent `code-controleur` laten meekijken.

### Testen, niet aannemen
- Valideer gewijzigde JS met `node --check` voordat je iets "klaar" noemt.
- Rekenregel gewijzigd → `tests/sql/rekenregels.sql` en
  `node tests/demo-gelijkloop.mjs` moeten groen zijn.
- Schrijf-flows testen in de demo, nooit met de echte gegevens van de
  gebruiker. Echte data alleen lezen, of na expliciet akkoord wijzigen.
- Test beveiliging echt: niet ingelogd, eigen account, ander account.
- Telefoon (390 breed) is het belangrijkste formaat: geen horizontaal
  scrollen.

### Voordat er iets naar GitHub gaat
- Vraag altijd expliciet toestemming voordat je commit en pusht. Leg kort
  uit wat er gewijzigd is en waarom, en wacht op een duidelijk "ja".
- Verhoog `CACHE` in `sw.js` bij elke wijziging aan app-bestanden.
- Nooit echte uren, verlofgegevens of persoonsgegevens in de repo (die is
  openbaar): geen seeds, exports of screenshots met echte data.

### Na elke wijziging
- Beknopte samenvatting: wat, welke bestanden, en wat de gebruiker zelf
  moet controleren.
- Na een grotere wijziging: voorstellen om `tests/rooktest.md` te
  doorlopen.
- Bij twijfel een gerichte vraag stellen; kleine voor de hand liggende
  keuzes zelf maken en kort melden.

### Privacy
- Alleen arbeidsgegevens die nodig zijn: uren, verlofdata, korte
  omschrijving. Geen medische details, namen van derden, BSN, salaris of
  rekeningnummers.

## Sessiebeheer
- Stel na een afgeronde taak voor om /compact te draaien met een korte
  instructie; bij een ongerelateerd volgend onderwerp /clear.
- Blijvende afspraken horen in dit bestand, niet alleen in het gesprek.
