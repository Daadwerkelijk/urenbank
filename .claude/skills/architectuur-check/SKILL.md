---
name: architectuur-check
description: Gebruik dit wanneer om een architectuurcheck of code-review
  op structuurniveau wordt gevraagd (niet losse bugfixes) — bijvoorbeeld
  na een grotere nieuwe feature, of als er expliciet om "architectuur" of
  "opschonen" wordt gevraagd.
---

Bij een architectuurcheck: alleen rapporteren, nooit ongevraagd
wijzigen. Loop langs:

1. **Rekenregels op één plek** — wordt er in `js/app.js` zelf iets
   uitgerekend dat in de database hoort (saldo, norm, kosten, verval)?
   De SQL-functies zijn de bron van waarheid; het scherm toont alleen.
   Uitzondering: optellen/omrekenen voor weergave.
2. **Demo loopt gelijk** — doet `js/demo.js` nog precies wat de
   SQL-functies doen? Draai `node tests/demo-gelijkloop.mjs`; nieuwe
   rekenregels zonder gelijkloop-test zijn een bevinding.
3. **Centrale datalaag** — gaat alle Supabase-verkeer via `js/api.js`
   (`list`, `insert`, `upsert`, `update`, `remove`, `rpc`), of zijn er
   losse `fetch`/client-aanroepen bijgekomen?
4. **Duplicatie** — dezelfde constante, tekst of regel op meer plekken
   (bijvoorbeeld de feestdagenlijst, 187 uur kopen, 1,6 × weekuren,
   kleuren).
5. **Dode code** — functies, CSS-klassen of bestanden die nergens meer
   gebruikt worden.
6. **Migraties** — bestaande, al uitgevoerde migraties worden nooit
   herschreven; wijzigingen staan in een nieuw genummerd bestand. Komt de
   database (`list_migrations`) overeen met de map? Zijn migraties en
   tests vrij van `drop`, `delete` en `update` zonder `where` (zodat
   Claude ze zelf kan uitvoeren)? Welke oude functies zijn alleen nog
   doorgeefluik, en wordt de app nog ergens via die oude naam bediend?
7. **Consistentie** — gebruiken nieuwe schermen de CSS-variabelen
   (`--saldo`, `--bank`, …) en bestaande componenten (`.vlak`, `.knop`,
   `.chip`, dialog), of staan er losse hardgecodeerde waarden?
8. **PWA-versie** — is `CACHE` in `sw.js` opgehoogd na een wijziging aan
   app-bestanden, en staan nieuwe bestanden in de `SCHIL`-lijst?
9. **Documentatie-drift** — kloppen `CLAUDE.md` en `README.md` nog
   (bestandenlijst, rekenregels-tabel, hosting, inlogmethode)? Meld elke
   afwijking apart.

Rapporteer per punt: wat, waar (bestand/functie), risico en moeite. Geen
code aanpassen tenzij daar apart om gevraagd wordt.
