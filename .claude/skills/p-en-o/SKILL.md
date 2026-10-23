---
name: p-en-o
description: Gebruik dit bij elke wijziging of vraag over verlofregels,
  verlofopbouw, afschrijving, verval, gekocht/verkocht verlof, feestdagen,
  jaarovergang of uren — om te controleren of de app rekent volgens de wet
  (Burgerlijk Wetboek) en de cao Gemeenten / cao Amsterdam (PGA). Ook bij
  een verschil tussen de app en het officiële P&O-overzicht.
---

# P&O-check: rekent de app volgens wet en cao?

Denk als een nauwkeurige P&O-adviseur van de gemeente Amsterdam: je kent
de regels, je controleert elke rekenregel tegen de bron, en je zegt het
als iets niet klopt of niet zeker is. Je geeft geen juridisch advies; je
toetst of de app de regels correct toepast.

## Werkwijze
1. **Bepaal welke regel(s) geraakt worden** (zie de lijst hieronder).
2. **Zoek de actuele bron op** — regels veranderen met elke cao. Gebruik
   altijd een zoekactie, ook als je de regel denkt te kennen:
   - Cao Gemeenten: vng.nl (actuele cao-tekst, ledenbrieven).
   - Cao Amsterdam / PGA: amsterdam.nl/pga.
   - Wet: wetten.overheid.nl (Burgerlijk Wetboek boek 7, titel 10,
     afdeling 3: art. 7:634–7:645).
   Noem de bron en het artikel. Kun je het niet bevestigen, zeg dat dan
   en markeer de regel als "onzeker" in plaats van te gokken.
3. **Vergelijk met de app**: SQL-functies in
   `supabase/migrations/002_urenbank_functies.sql` (en latere migraties),
   de demo-kopie in `js/demo.js`, en de standaardwaarden in
   `urenbank.instellingen`.
4. **Toets tegen het echte P&O-overzicht** als de gebruiker dat heeft
   gedeeld: komen begin, opgenomen en rest per potje overeen? Een
   verschil is een bevinding, ook als het 0,01 is (verklaar het).
5. **Rapporteer**, niet ongevraagd wijzigen. Een regel aanpassen gaat
   via `tdd`: eerst een test die de wettelijke uitkomst vastlegt.

## Te toetsen regels (stand: bouw oktober 2026 — controleer of dit nog klopt)
| Onderwerp | Hoe de app nu rekent | Te controleren tegen |
|---|---|---|
| Wettelijk verlof | 4 × weekuren (144 bij 36 uur) | BW 7:634 |
| Bovenwettelijk verlof | 1,6 × weekuren (57,6 bij 36 uur, sinds 2025) | cao Gemeenten art. 6.2 |
| Verval wettelijk | 12 maanden na opbouwjaar (instelbaar; wet: 6) | BW 7:640a; cao/PGA kan langer geven |
| Verjaring bovenwettelijk en gekocht | 60 maanden na opbouwjaar | BW 7:642 |
| Verlofspaarpot | Niet ondersteund (verjaart niet) | cao Gemeenten art. 6.3 |
| Afschrijfvolgorde | Instelbare volgorde, overgenomen uit P&O | cao/PGA; afwijking mag, maar wettelijk vervalt eerder |
| Gekocht verlof | Bovenwettelijk potje; waarschuwing boven 187 uur/jaar | cao Gemeenten art. 4.3 (IKB) |
| Verkopen verlof | Niet ondersteund | cao Gemeenten; alleen bovenwettelijk |
| Feestdagen | Nieuwjaar, Pasen (2), Koningsdag, 5 mei (elk jaar), Hemelvaart, Pinksteren (2), Kerst (2); geen Goede Vrijdag | cao Gemeenten art. 6.6; lokale feestdagen PGA |
| Door werkgever aangewezen vrije dagen | Plannen als verlof (gaat van saldo af) | max. 2 dagen bovenwettelijk per jaar, cao art. 6.6 |
| Feestdag op vaste vrije dag | Geen compensatie | cao Gemeenten (geen recht op vervangende dag) |
| Ziekte tijdens vakantie | Niet ondersteund; gebruiker past verlof handmatig aan | BW 7:637 (ziektedagen gelden niet als vakantie) |
| Opbouw bij deeltijd/roosterwijziging | Potjes handmatig; geen pro-rata-berekening | BW 7:634; cao |
| Urenbank (plus/min-uren) | Eigen administratie, geen maximum of verval | Geen formele regeling; meld als de gebruiker er rechten aan ontleent |

## Signalen die altijd gemeld worden
- Een rekenregel zonder bron of met een bron die niet meer actueel is.
- Een vervaldatum die eerder valt dan de wet toestaat (dat mag nooit), of
  later zonder cao-grond.
- Wettelijke uren die dreigen te vervallen terwijl er bovenwettelijke
  uren worden afgeschreven.
- Een nieuwe cao (nieuwe looptijd, nieuwe uren, nieuwe feestdagen) die
  nog niet in de app zit.
- Een verschil tussen app en P&O-overzicht dat niet verklaard kan worden.

Rapporteer per bevinding: regel, wat de app doet, wat wet/cao zegt (met
bron en artikel), impact in uren, en of het zeker of onzeker is.
