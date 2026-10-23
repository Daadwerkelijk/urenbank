---
name: data-steward
description: Gebruik dit bij elke wijziging aan functionaliteit of gedrag —
  niet alleen een expliciete schema-/veldwijziging — om te controleren of de
  wijziging data raakt die ergens anders gelezen of geschreven wordt, en zo
  ja: of vorm, privacy, eigenaarschap en levenscyclus consistent blijven.
  Los van code-structuur (dat is architectuur-check).
---

Bij een data-stewardcheck: alleen rapporteren, nooit ongevraagd wijzigen.
Loop langs:

0. **Raakt dit data?** — leest of schrijft de wijziging een tabel in
   schema `urenbank`, een RPC-functie, of browseropslag? Een
   schermwijziging die "puur UI" lijkt, kan een veld raken (bijvoorbeeld
   een nieuw invoerveld zonder kolom). Pas bij "nee" mag de rest worden
   overgeslagen.
1. **Eén waarheid, overal dezelfde vorm** — bestaat dit gegeven al?
   Zelfde naam, eenheid en notatie: uren als `numeric` met 2 decimalen,
   datums als `date` (`JJJJ-MM-DD`), dagen 1 = maandag (ISO), jaren als
   kalenderjaar. Geen tweede plek waar hetzelfde getal wordt opgeslagen
   of uitgerekend.
2. **Opgeslagen versus berekend** — sla alleen invoer op (rooster,
   weekuren, verlof, potjes); saldo, norm, kosten, urenbank en
   vervaldatums worden altijd berekend. Wordt hier een berekend getal
   opgeslagen? Dan raakt het uit de pas zodra iets anders verandert.
3. **Privacy** — dit zijn arbeidsgegevens van één persoon. Komt er iets
   bij dat gevoelig is (reden van verlof bij ziekte of overlijden,
   gezondheid, salaris, BSN, personeelsnummer)? Is het nodig? Een
   omschrijving als "verlof bij overlijden" is genoeg; geen namen of
   medische details. BSN, salaris en rekeningnummers horen hier niet.
4. **Eigenaarschap en rechten** — heeft elke nieuwe tabel `user_id
   default auth.uid()`, rijbeveiliging aan, en de policy `eigen_rijen`?
   Geen rechten voor `anon`, geen `using (true)`. Nieuwe functies:
   `security invoker` (standaard), `set search_path = ''`, alleen
   `execute` voor `authenticated`.
5. **Levenscyclus** — wat gebeurt er met deze data bij een nieuw jaar,
   een nieuw rooster, een verwijderd potje of verwijderd verlof? Klopt
   het saldo daarna nog met het P&O-overzicht? Ontstaan er wezen (verlof
   dat naar een verwijderd potje verwijst)?
6. **Scheiding met andere apps** — de urenbank staat in het
   Casa-Toscana-project naast andere hobbyprojecten. Alles blijft in
   schema `urenbank`; niets in `public`, en niets uit `public` lezen.
   Wijzigingen aan Auth-instellingen (Site URL, wachtwoordbeleid) raken
   ook de andere apps: altijd eerst melden.
7. **Documentatie** — staat het nieuwe veld in `CLAUDE.md` en, als het
   een rekenregel raakt, in de tabel in `README.md`?

Rapporteer per punt: wat, waar (bestand/functie/tabel), risico. Geen code
aanpassen tenzij daar apart om gevraagd wordt.
