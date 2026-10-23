# Urenbank

Persoonlijke webapp om je **urenbank** (meer of minder uren dan je contract), je **verlofsaldo** en je **verlofplanning** bij te houden. Gemaakt voor medewerkers onder de cao Gemeenten, maar rooster, feestdagen en vervaltermijnen zijn in te stellen.

Bekijk de demo met voorbeelddata: open de app met `?demo` achter het adres.

## Wat de app doet

- **Overzicht**: hoeveel uur je vandaag vrij kunt opnemen (verlofsaldo + urenbank), omgerekend naar werkdagen en werkweken, en wat er overblijft na je geplande verlof. Met signalen voor verlof dat nog niet bij P&O geboekt is, ontbrekende weekuren en verlof dat bijna vervalt.
- **Weken**: per week de norm (rooster min feestdagen), de uren die je in Timetell schreef, het verschil en de lopende urenbank. Per dag kun je je rooster aanpassen als je een vrije dag schuift.
- **Verlof**: plannen met omschrijving, kosten in uren volgens je rooster, het aantal aaneengesloten vrije dagen (inclusief weekend, vaste vrije dag en feestdagen) en of het geboekt is bij P&O.
- **Jaarkaart**: alle dagen van het jaar op één kaart.
- **Instellingen**: rooster, verlofpotjes en afschrijfvolgorde, gekocht verlof, feestdagen van je werkgever, werksessies en rekenregels.

## Rekenregels

Alle berekeningen staan in de database (`supabase/migrations/002_urenbank_functies.sql` en latere migraties), zodat ze controleerbaar en overal gelijk zijn.

| Begrip | Regel |
|---|---|
| Norm per dag | Roosteruren, of de afwijking voor die datum; 0 op een feestdag |
| Feestdagen | Cao Gemeenten: Nieuwjaar, Pasen (2), Koningsdag, 5 mei (elk jaar), Hemelvaart, Pinksteren (2), Kerst (2). Geen Goede Vrijdag. Aan te vullen of uit te zetten per datum |
| Week | Maandag t/m zondag, afgekapt op 1 januari en 31 december, doorlopend genummerd |
| Urenbank | Per kalenderjaar: som van (Timetell-uren − norm) over de ingevulde weken van dat jaar. Begint elk jaar op 0 (startsaldo alleen in het startjaar). In november en december waarschuwt de app als hij niet op 0 staat |
| Kosten verlof | Som van de normuren over de verlofperiode, of het handmatig ingevulde aantal |
| Verlofsaldo | Potjes uit je P&O-overzicht. Geboekt verlof wordt op datumvolgorde afgeschreven van de potjes in de ingestelde volgorde, als het potje dan beschikbaar en niet vervallen is |
| Saldo vandaag | Alleen potjes die vandaag beschikbaar en niet vervallen zijn; potjes van volgend jaar tellen pas vanaf 1 januari |
| Dubbel verlof | Overlappende verlofperiodes worden gemeld (waarschuwing bij opslaan en bij "Let op"); beide tellen volledig mee |
| Na planning | Hetzelfde, maar dan ook met verlof dat nog niet geboekt is |
| Verval | Wettelijk: 12 maanden na het opbouwjaar (cao Gemeenten art. 6.1 lid 2; instelbaar, wet: 6). Bovenwettelijk en gekocht: 60 maanden |
| Verlof uit urenbank | Gaat niet van het P&O-saldo af; je schrijft minder uren, dus het zit in het weekverschil |

## Techniek

- Statische webapp (HTML, CSS, JavaScript-modules), geen build-stap. Installeerbaar als app (PWA).
- Data in Supabase (Postgres) in een eigen schema `urenbank`, met rijbeveiliging: iedere gebruiker ziet alleen zijn eigen gegevens.
- Hosting via GitHub Pages.

## Zelf gebruiken

1. Maak een Supabase-project en voer de bestanden in `supabase/migrations/` op volgorde uit.
2. Zet in Supabase bij **Project Settings → Data API → Exposed schemas** het schema `urenbank` aan.
3. Zet je project-URL en publishable key in `js/config.js`.
4. Maak een gebruiker aan en vul bij Instellingen je rooster en verlofpotjes in.
