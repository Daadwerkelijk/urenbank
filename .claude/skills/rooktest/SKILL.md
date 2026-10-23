---
name: rooktest
description: Gebruik dit na een grotere wijziging (nieuwe feature,
  rekenregel- of Supabase-wijziging, of vlak vóór een push) om de
  kernflows echt in de browser te doorlopen — het woord "rooktest",
  "smoke test", of een voorstel om tests/rooktest.md te doorlopen.
---

# Rooktest

Doel: bevestigen dat het gewone, verwachte pad nog werkt — het derde been
naast `monkey` (chaos) en `tdd` (rekenregels). `tests/rooktest.md` is de
bron van waarheid voor de kernflows; deze skill is de uitvoering ervan.

## Vooraf zeggen
Een rooktest loopt de héle app langs, niet alleen de laatste wijziging.
Zeg dat in één zin, en rapporteer daarna gescheiden: "jouw wijziging" en
"algemene kernflows".

## Doelwit
- **Demo-modus** (`?demo`) via een lokale server in de projectroot,
  bijvoorbeeld `python3 -m http.server 8765`. Daar zijn schrijf-flows
  veilig: niets gaat naar Supabase.
- **Rekenregels**: draai eerst `tests/sql/rekenregels.sql` en
  `node tests/demo-gelijkloop.mjs` (zie `tdd`). Rood = stop, eerst melden.
- **Live-app**: alleen lezen. Nooit schrijf-flows testen met de echte
  gegevens van de gebruiker.
- Formaten: telefoon (390×844) en desktop (1280×900). Controleer op
  telefoon dat geen enkele pagina horizontaal scrollt.
- Wat alleen op een echte telefoon kan (installeren op beginscherm,
  inloglink openen, nieuwe versie na deploy): niet zelf afvinken, maar als
  lijstje aan de gebruiker geven.

## Uitvoering
1. Lees `tests/rooktest.md` en loop elke regel af.
2. **Per kernflow**: echt uitvoeren zoals een gebruiker (klikken, typen),
   niet met een script-kortere-weg voor de kernhandeling. Daarna
   controleren dat het getal klopt dat erbij hoort (bijvoorbeeld: 30 uur
   invullen bij norm 36 → totaal 6 lager).
3. **Console**: na elke flow controleren op errors en `pageerror`
   (lettertype dat niet laadt in een afgeschermde omgeving telt niet).
4. **Aandachtspunten** uit `rooktest.md` apart afvinken.

## Na afloop
- Server en tabbladen sluiten.
- Het "Resultaat"-veld in `rooktest.md` niet zelf invullen; rapporteer
  kort welke flows getest zijn, wat werkte en wat niet. Problemen niet
  ongevraagd fixen.
- Pas ná een schone rooktest (of akkoord op de gevonden punten) om
  toestemming vragen voor commit/push.
