---
name: tdd
description: Gebruik dit wanneer expliciet om Test Driven Development of TDD
  wordt gevraagd, of bij het bouwen/wijzigen van rekenregels (norm, urenbank,
  verlofkosten, afschrijving, verval, feestdagen) waar eerst een test voor
  moet komen — de woorden "tdd" of "test driven development".
---

# Test Driven Development

Bron: Kent Beck, *Test-Driven Development: By Example* (2002) — de
Red-Green-Refactor-cyclus — aangevuld met Robert C. Martins "drie wetten
van TDD".

## De drie wetten (niet onderhandelbaar tijdens een TDD-sessie)
1. Schrijf geen regel productiecode voordat er een falende test voor bestaat.
2. Schrijf niet meer van een test dan nodig is om 'm te laten falen.
3. Schrijf niet meer productiecode dan nodig is om de falende test te laten
   slagen.

Merk je dat je code schrijft die geen test vereist (een parameter "voor
later", een edge-case die niemand vroeg)? Stop en vraag je af welke test
die code zou afdwingen. Geen test? Dan hoort de code er nu niet.

## De cyclus
1. **RED** — kleinste test voor het volgende stukje gedrag. Draai 'm en
   bevestig dat hij faalt om de juiste reden (niet door een typo in de test).
2. **GREEN** — minimale code: *fake it*, *obvious implementation* of
   *triangulation* (pas veralgemeniseren als twee tests dat vereisen).
3. **REFACTOR** — opschonen zonder gedrag te veranderen; na elke stap
   opnieuw draaien.

Goede tests zijn FIRST: Fast, Independent, Repeatable (geen afhankelijkheid
van de systeemklok — gebruik vaste datums zoals in de bestaande tests),
Self-validating, Timely.

## Waar de rekenregels in deze app zitten
De rekenregels staan op twee plekken die gelijk moeten lopen:
1. **De bron van waarheid**: SQL-functies in schema `urenbank`
   (`supabase/migrations/002_urenbank_functies.sql` en latere migraties,
   nu t/m `004`): `landelijke_feestdagen`, `dagen`, `weken`,
   `weekoverzicht`, `verlof_overzicht` (de app; `verlof_details` is een
   doorgeefluik), `potje_saldi`, `samenvatting(date)` (de app;
   `samenvatting()` is een doorgeefluik), `nieuw_jaar`.
2. **De demo-kopie**: `js/demo.js` rekent hetzelfde na in JavaScript voor
   `?demo`.

Een rekenregel wijzigen = in beide, en beide testsets moeten groen zijn.

## Hoe tests hier draaien
- **Database**: `tests/sql/rekenregels.sql`. Draait in één transactie met
  een verzonnen testgebruiker (zonder account, via
  `session_replication_role = replica`) en eindigt met `ROLLBACK`, dus er
  blijft niets achter en echte data wordt niet geraakt. Een falende assert
  stopt met `ROOD: <naam> — verwacht X, kreeg Y`; het laatste resultaat is
  `ALLES GROEN`. **Claude draait dit zelf** via `execute_sql` (Supabase
  MCP): de inhoud vanaf `begin;` zonder commentaarregels. Houd het script
  vrij van `drop`, `delete` en `update` zonder `where`, anders vraagt de
  MCP om een bevestiging die niet doorkomt (zie CLAUDE.md).
- **Demo-kopie**: `node tests/demo-gelijkloop.mjs` (Node, geen browser of
  netwerk nodig). Zelfde scenario, zelfde verwachte uitkomsten.
- Controleer aan het begin van een sessie of `node` beschikbaar is
  (`command -v node`). Zonder Node: draai alleen de SQL-tests en meld dat
  de demo-gelijkloop niet gecontroleerd is.

Een nieuwe regel testen: voeg een `pg_temp.verwacht(...)`-regel toe aan de
SQL-test (en een `verwacht(...)` in de gelijkloop-test), draai, zie ROOD,
pas de functie aan in een nieuwe migratie (volgend nummer, nooit een
bestaande migratie herschrijven die al is uitgevoerd; alleen toevoegend,
zonder `drop`), voer die zelf uit met `apply_migration`, draai opnieuw tot
GROEN.

## Wel en niet TDD-geschikt
- **Wel**: alles wat rekent of valideert — weeknorm, feestdagen,
  aaneengesloten vrije dagen, afschrijfvolgorde, vervaldatums, tekort,
  jaarovergang, omrekening naar dagen/weken.
- **Niet**: schermopbouw, knoppen, formulieren. Daarvoor zijn `rooktest`
  en `monkey`.

## Bugfix-gedreven TDD
Bij een gevonden bug (bijvoorbeeld via `monkey` of een verschil met het
P&O-overzicht): eerst een test die het foute gedrag exact reproduceert,
bevestig ROOD, dan fixen tot GROEN.

## Werkwijze
1. Vraag welk stukje gedrag het wordt, als dat niet duidelijk is.
2. Test schrijven, laten zien, ROOD bevestigen.
3. Minimale implementatie, GROEN bevestigen.
4. Refactor, nog steeds GROEN.
5. Meld elke rood→groen-stap kort, in plaats van pas aan het eind.
