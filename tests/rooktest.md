# Rooktest urenbank

Kernflows om na elke grotere wijziging te doorlopen. Schrijf-flows in de
demo (`?demo`), lezen mag in de live-app. Zie skill `rooktest`.

## Vooraf
- [ ] `tests/sql/rekenregels.sql` eindigt met ALLES GROEN
- [ ] `node tests/demo-gelijkloop.mjs` eindigt met ALLES GROEN

## Kernflows
- [ ] **Inloggen**: inlogscherm toont alleen "Stuur inloglink" (geen wachtwoordveld); demo-link werkt; na inloggen opent Overzicht
- [ ] **Overzicht**: groot getal = verlofsaldo + urenbank; balk en legenda tellen op tot hetzelfde getal; "na planning" is lager bij nog niet geboekt verlof
- [ ] **Deze week invullen** op Overzicht: getal verandert met (Timetell − norm)
- [ ] **Weken**: huidige week gemarkeerd; uren invullen en leegmaken werkt; urenbank-kolom loopt cumulatief
- [ ] **Dag schuiven**: week openen, woensdag 9 en donderdag 0 → weeknorm blijft gelijk; "Standaard" zet terug
- [ ] **Verlof plannen**: formulier toont kosten en werkdagen; opslaan → in lijst met juiste uren en aaneengesloten dagen
- [ ] **Markeer als geboekt** → saldo nu daalt, "na planning" blijft gelijk
- [ ] **Verlof uit urenbank**: telt niet mee in P&O-saldo
- [ ] **Dubbel verlof**: verlof plannen over bestaand verlof → waarschuwing in het formulier, knop wordt "Toch opslaan", tweede klik slaat op; overlap zichtbaar op Verlof en bij "Let op"
- [ ] **Potjes volgend jaar**: "Potjes volgend jaar toevoegen" → saldo en tabel op Overzicht veranderen niet (pas vanaf 1 januari)
- [ ] **Urenbank per jaar**: weekuren van januari volgend jaar invullen → urenbank begint daar op 0
- [ ] **Jaareinde** (klok op november/december of in die maanden): "Let op" vraagt de urenbank op 0 te zetten als hij dat niet is
- [ ] **Onzin-invoer**: 500 uur in een week, opbouwjaar leeg → begrijpelijke melding, niets opgeslagen
- [ ] **Jaarkaart**: feestdagen, vaste vrije dagen, verlof (geboekt en gepland) zichtbaar; dag aanklikken toont details
- [ ] **Instellingen**: rooster opslaan; potje uren wijzigen → saldo verandert; volgorde ▲/▼; gekocht verlof toevoegen; feestdag toevoegen en verwijderen
- [ ] **Jaar wisselen** (‹ ›) op Weken, Verlof en Jaarkaart

## Aandachtspunten
- [ ] Telefoon (390 breed): geen horizontaal scrollen op enig scherm; menu onderaan
- [ ] Desktop (1280 breed): tabellen en formulieren netjes uitgelijnd
- [ ] Donkere modus leesbaar
- [ ] Geen console-errors (behalve een lettertype dat in een afgeschermde omgeving niet laadt)
- [ ] `CACHE` in `sw.js` opgehoogd als app-bestanden zijn gewijzigd

## Alleen op een echte telefoon (gebruiker)
- [ ] App op beginscherm zetten en openen
- [ ] Inloglink uit de mail opent de app en logt in
- [ ] Na een deploy de nieuwe versie zien (eventueel twee keer verversen)

## Resultaat
Datum: ______ Getest door: ______ Bevindingen: ______
