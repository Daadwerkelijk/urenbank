---
name: monkey
description: Gebruik dit wanneer expliciet om monkey testing wordt gevraagd,
  of om te proberen "het systeem stuk te krijgen" met willekeurige,
  onvoorspelbare of rare input — het woord "monkey" of "monkey testing".
---

# Monkey testing

Doel: de app laten crashen met domme, chaotische, onvoorspelbare input —
niet de slimme edge-cases die je toch al bedenkt, maar echte willekeur. Een
fout die je hier vindt, mag nooit stilletjes een verkeerd verlofsaldo
opleveren.

## Doelwit en veiligheid
- Test standaard **alleen in de demo-modus** (`?demo`): alle data staat in
  het geheugen, niets gaat naar Supabase. Nooit monkey-testen tegen de
  ingelogde app met echte uren; wil de gebruiker dat toch, vraag het
  expliciet.
- Lokale server in de projectroot, bijvoorbeeld
  `python3 -m http.server 8765` (of een vergelijkbare statische server op
  Windows), en open `http://localhost:8765/?demo#/<scherm>`.
- Browser: een headless browser (Playwright) als die beschikbaar is,
  anders de Chrome-tools. Houd console-fouten en `pageerror` continu bij,
  na elke golf.
- Met een scherm als argument (overzicht, weken, verlof, jaar,
  instellingen): focus daarop. Zonder argument: alle vijf.

## Golf 1 — Kwaadaardige tekstinvoer
In elk tekstveld (omschrijving verlof, toelichting potje, feestdagnaam,
agenda): leeg, alleen spaties, één teken, 5000+ tekens, emoji en
multi-byte (🔥💥用户), `<script>alert(1)</script>`,
`"><img src=x onerror=alert(1)>`, quotes/backslashes door elkaar,
newlines/tabs, RTL-tekst. Let op: wordt het overal netjes ge-escaped
(`esc()`), ook in de jaarkaart, de signalen en `aria-label`s?

## Golf 2 — Getallen en datums
- Timetell-uren en roosteruren: negatief, 0, 1e20, 0.001, tekst plakken,
  leeg opslaan, meer dan 24 uur per dag, 200 uur per week.
- Potjes: negatieve uren, correctie die het saldo onder nul brengt, 187+
  uur gekocht.
- Verlof: einde vóór begin, 1900, 2099, verlof over de jaargrens, verlof
  van één dag op een feestdag of vaste vrije dag (0 uur), twee
  overlappende verlofperiodes.
- Rekenregels: uren per dag 0 (deling!), uren per week 0, vervaltermijn 0
  of negatief, startdatum in de toekomst.

## Golf 3 — Sneller en vaker klikken dan bedoeld
Dubbel- en drieklikken op Opslaan, Markeer als geboekt, ▲/▼ in de
potjes, Potjes volgend jaar toevoegen (twee keer = dubbele potjes?).
Twee dialogen na elkaar openen. Annuleren en Opslaan vlak na elkaar.
Snel wisselen tussen jaren en schermen terwijl er nog geladen wordt.

## Golf 4 — Onmogelijke toestand
Via de console in demo-modus:
- `location.hash = '#/verlof/abc'`, `'#/weken/-5'`, `'#/bestaat-niet'`.
- Een verlofregel bewerken die net verwijderd is.
- Alle roosters verwijderen en dan elk scherm openen.
- Een potje met `vervalt_op` vóór `beschikbaar_vanaf`.

## Golf 5 — Leeg op de bodem
Verwijder in de demo alle potjes, alle verlof, alle weekuren en het
rooster. Loop elk scherm langs. Zoek naar `NaN`, `Infinity`, `undefined`,
lege balk met deling door nul, een `.find()` gevolgd door
property-toegang op `undefined`, of een witte pagina.

## Golf 6 — Klik-storm
Verzamel alle `button, a, input` op het huidige scherm en klik ze in
willekeurige volgorde snel na elkaar via script. Echte willekeur, geen
vast scenario.

## Na elke golf
Noteer elke vondst meteen: welke actie, exacte foutmelding, hoe je 'm
opnieuw opwekt.

## Rapporteren
Alleen rapporteren, nooit ongevraagd fixen. Per vondst: bestand/functie,
reproductiestappen, foutmelding, impact. Het ergste is een **stil
verkeerd getal** (saldo, urenbank, kosten) zonder foutmelding — markeer
dat altijd als hoogste prioriteit. Sluit na afloop de server en
browser-tabbladen.
