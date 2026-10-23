-- Rekenregeltests voor schema urenbank.
-- Draait volledig binnen één transactie met een verzonnen testgebruiker en eindigt met ROLLBACK:
-- er blijft niets achter en echte gebruikersdata wordt niet gelezen of gewijzigd.
-- Elke assert faalt met een duidelijke melding; geen melding = alles groen.
-- Uitvoeren: via execute_sql (Supabase MCP) of in de Supabase SQL Editor.
-- Bewust zonder drop, delete en update zonder where: die vragen via de MCP om een bevestiging.
-- Opruimen gebeurt door de rollback.
-- Vereist migratie 004.

begin;

create or replace function pg_temp.verwacht(naam text, verwacht anyelement, werkelijk anyelement) returns void
language plpgsql as $$
begin
  if verwacht is distinct from werkelijk then
    raise exception 'ROOD: % — verwacht %, kreeg %', naam, verwacht, werkelijk;
  end if;
  raise notice 'GROEN: %', naam;
end $$;

-- Verzonnen testgebruiker zonder account: koppeling met auth.users tijdelijk uit (alleen binnen deze transactie).
-- Zo is er geen schrijfactie in auth nodig en kan Claude de test zelf uitvoeren.
set local session_replication_role = replica;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

-- Opzet: 4x9 (ma, di, do, vr), vijf potjes. Alle getallen zijn verzonnen testwaarden.
insert into urenbank.instellingen (startdatum, uren_per_dag, uren_per_week) values ('2026-01-01', 9, 36);
insert into urenbank.rooster (geldig_vanaf, uren) values ('2024-01-01', '{9,9,0,9,9,0,0}');
insert into urenbank.verlof_potje (soort, opbouwjaar, uren, beschikbaar_vanaf, prioriteit) values
  ('bovenwettelijk', 2024, 10, '2024-01-01', 1),
  ('wettelijk', 2026, 144, '2026-01-01', 2),
  ('gekocht', 2025, 40, '2025-01-01', 3),
  ('bovenwettelijk', 2025, 57.6, '2025-01-01', 4),
  ('bovenwettelijk', 2026, 57.6, '2026-01-01', 5);

-- Feestdagen (cao Gemeenten): Pasen 2026 = 5 april, geen Goede Vrijdag, 5 mei elk jaar
select pg_temp.verwacht('Paaszondag 2026', '2026-04-05'::date, urenbank.paaszondag(2026));
select pg_temp.verwacht('Paaszondag 2027', '2027-03-28'::date, urenbank.paaszondag(2027));
select pg_temp.verwacht('Tien feestdagen per jaar', 10::bigint, (select count(*) from urenbank.landelijke_feestdagen(2026)));
select pg_temp.verwacht('Geen Goede Vrijdag', 0::bigint, (select count(*) from urenbank.landelijke_feestdagen(2026) where datum = '2026-04-03'));
select pg_temp.verwacht('5 mei ook buiten lustrumjaar', 1::bigint, (select count(*) from urenbank.landelijke_feestdagen(2026) where datum = '2026-05-05'));
select pg_temp.verwacht('Koningsdag op zondag wordt zaterdag (2025)', '2025-04-26'::date,
  (select datum from urenbank.landelijke_feestdagen(2025) where naam = 'Koningsdag'));

-- Weken: afgekapt op de jaargrens
select pg_temp.verwacht('2026 heeft 53 weken', 53::bigint, (select count(*) from urenbank.weken(2026)));
select pg_temp.verwacht('Week 1 2026 begint op 1 jan', '2026-01-01'::date, (select van from urenbank.weken(2026) where weeknr = 1));
select pg_temp.verwacht('Week 53 2026 eindigt op 31 dec', '2026-12-31'::date, (select tot from urenbank.weken(2026) where weeknr = 53));

-- Normen per week
select pg_temp.verwacht('Norm week 1 (alleen vr 2 jan)', 9::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 1));
select pg_temp.verwacht('Norm week 14 (Goede Vrijdag werkdag)', 36::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 14));
select pg_temp.verwacht('Norm week 19 (5 mei op dinsdag)', 27::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 19));
select pg_temp.verwacht('Norm week 52 (kerst op vrijdag)', 27::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 52));
select pg_temp.verwacht('Norm week 53 (ma, di, do)', 27::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 53));
do $$ begin
  perform urenbank.weekoverzicht(9999);
  raise exception 'ROOD: Onzinnig jaartal wordt geweigerd — geen fout gekregen';
exception when others then
  if sqlerrm like 'ROOD:%' then raise; end if;
end $$;

-- Dag schuiven: woensdag werken, donderdag vrij
insert into urenbank.dag_afwijking (datum, uren) values ('2026-06-10', 9), ('2026-06-11', 0);
select pg_temp.verwacht('Geschoven dag houdt weeknorm gelijk', 36::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 24));
-- (geschoven dag blijft staan: raakt de volgende tests niet)

-- Werkgeversfeestdag en uitgezette feestdag
insert into urenbank.feestdag_afwijking (datum, naam, is_feestdag) values ('2026-04-03', 'Goede Vrijdag', true);
select pg_temp.verwacht('Extra feestdag verlaagt norm', 27::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 14));
update urenbank.feestdag_afwijking set is_feestdag = false where datum = '2026-04-03';

-- Urenbank: Timetell - norm, cumulatief
insert into urenbank.week_uren (jaar, weeknr, timetell_uren) values (2026, 1, 9), (2026, 2, 44), (2026, 3, 30);
select pg_temp.verwacht('Urenbank na week 3', 2::numeric, (select urenbank_cumulatief from urenbank.weekoverzicht(2026) where weeknr = 3));
insert into urenbank.week_uren (jaar, weeknr, timetell_uren) values (2027, 2, 40);
select pg_temp.verwacht('Urenbank 2027 begint op 0 (week 2: +4)', 4::numeric, (select urenbank_cumulatief from urenbank.weekoverzicht(2027) where weeknr = 2));
select pg_temp.verwacht('Samenvatting 2026 toont urenbank 2026', 2::numeric, (urenbank.samenvatting('2026-10-23')->>'urenbank')::numeric);
select pg_temp.verwacht('Samenvatting 2027 toont urenbank 2027', 4::numeric, (urenbank.samenvatting('2027-01-11')->>'urenbank')::numeric);
-- (week 2027 blijft staan: de volgende tests kijken naar 2026)

-- Verlof: kosten en aaneengesloten vrij
insert into urenbank.verlof (begin, eind, omschrijving, bron, geboekt, geboekte_uren) values
  ('2026-12-24', '2026-12-31', 'Kerst', 'saldo', false, null),
  ('2026-02-25', '2026-02-28', 'Weekje weg', 'urenbank', false, null),
  ('2026-07-06', '2026-08-02', 'Zomer', 'saldo', true, 144);
select pg_temp.verwacht('Kerst 24-31 dec kost 36 uur', 36::numeric, (select kosten_uren from urenbank.verlof_overzicht() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Kerst: 4 werkdagen', 4, (select werkdagen from urenbank.verlof_overzicht() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Kerst: 12 dagen aaneengesloten vrij', 12, (select dagen_aansluitend_vrij from urenbank.verlof_overzicht() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Wo-za: 5 dagen vrij tot en met zondag', 5, (select dagen_aansluitend_vrij from urenbank.verlof_overzicht() where omschrijving = 'Weekje weg'));
select pg_temp.verwacht('Zomer 6 jul - 2 aug kost 144 uur', 144::numeric, (select kosten_uren from urenbank.verlof_overzicht() where omschrijving = 'Zomer'));
select pg_temp.verwacht('Geen overlap zonder dubbel verlof', null::text, (select overlapt_met from urenbank.verlof_overzicht() where omschrijving = 'Kerst'));
insert into urenbank.verlof (begin, eind, omschrijving, bron) values ('2026-12-30', '2027-01-02', 'Oud en nieuw', 'saldo');
select pg_temp.verwacht('Overlap wordt gemeld', 'Oud en nieuw', (select overlapt_met from urenbank.verlof_overzicht() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Overlap wordt aan beide kanten gemeld', 'Kerst', (select overlapt_met from urenbank.verlof_overzicht() where omschrijving = 'Oud en nieuw'));
update urenbank.verlof set begin = '2026-03-10', eind = '2026-03-10', bron = 'overig' where omschrijving = 'Oud en nieuw';

-- Saldo: alleen geboekt verlof gaat eraf; urenbank-verlof nooit; volgorde = prioriteit
select pg_temp.verwacht('Saldo nu (alleen geboekt)', 165.2::numeric, (select sum(rest) from urenbank.potje_saldi(false) where soort <> 'tekort'));
select pg_temp.verwacht('Eerst bovenwettelijk 2024 op', 0::numeric, (select rest from urenbank.potje_saldi(false) where opbouwjaar = 2024));
select pg_temp.verwacht('Daarna wettelijk 2026', 10::numeric, (select rest from urenbank.potje_saldi(false) where soort = 'wettelijk' and opbouwjaar = 2026));
select pg_temp.verwacht('Saldo na planning (kerst erbij)', 129.2::numeric, (select sum(rest) from urenbank.potje_saldi(true)));
select pg_temp.verwacht('Samenvatting: totaal = saldo + urenbank', 167.2::numeric, (urenbank.samenvatting('2026-10-23')->>'totaal')::numeric);

-- Potjes van volgend jaar tellen pas mee vanaf hun eerste dag
select urenbank.nieuw_jaar(2027);
select pg_temp.verwacht('Potjes 2027 tellen in 2026 niet mee', 165.2::numeric, (urenbank.samenvatting('2026-10-23')->>'verlof_saldo')::numeric);
select pg_temp.verwacht('Potjes 2027 tellen vanaf 1 januari 2027 mee', 366.8::numeric, (urenbank.samenvatting('2027-01-11')->>'verlof_saldo')::numeric);

-- Verval: wettelijk 12 maanden, bovenwettelijk 60 maanden na het opbouwjaar
select pg_temp.verwacht('Wettelijk 2026 vervalt eind 2027', '2027-12-31'::date, (select vervalt_op from urenbank.potje_saldi(false) where soort = 'wettelijk' and opbouwjaar = 2026));
select pg_temp.verwacht('Bovenwettelijk 2024 vervalt eind 2029', '2029-12-31'::date, (select vervalt_op from urenbank.potje_saldi(false) where opbouwjaar = 2024));
update urenbank.instellingen set verval_wettelijk_maanden = 6 where user_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.verwacht('Bij 6 maanden vervalt wettelijk 2026 op 30 juni 2027', '2027-06-30'::date, (select vervalt_op from urenbank.potje_saldi(false) where soort = 'wettelijk' and opbouwjaar = 2026));
update urenbank.instellingen set verval_wettelijk_maanden = 12 where user_id = '00000000-0000-0000-0000-0000000000a1';

-- Tekort wordt zichtbaar in plaats van stil weggeslikt
insert into urenbank.verlof (begin, eind, omschrijving, bron, geboekt, geboekte_uren) values ('2026-09-01', '2026-09-01', 'Te veel', 'saldo', true, 900);
select pg_temp.verwacht('Tekort bij te veel verlof', true, exists (select 1 from urenbank.potje_saldi(false) where soort = 'tekort'));
select pg_temp.verwacht('Samenvatting: tekort (900 - 165,2)', 734.8::numeric, (urenbank.samenvatting('2026-10-23')->>'verlof_tekort')::numeric);
select pg_temp.verwacht('Samenvatting: totaal met tekort (0 - 734,8 + 2)', -732.8::numeric, (urenbank.samenvatting('2026-10-23')->>'totaal')::numeric);
select pg_temp.verwacht('Samenvatting: na planning met tekort (-734,8 - 36)', -770.8::numeric, (urenbank.samenvatting('2026-10-23')->>'verlof_saldo_na_planning')::numeric);
do $$ begin
  insert into urenbank.verlof_potje (soort, opbouwjaar, uren, beschikbaar_vanaf, prioriteit) values ('gekocht', 0, 1, '2026-01-01', 99);
  raise exception 'ROOD: Potje met opbouwjaar 0 wordt geweigerd — geen fout gekregen';
exception when others then
  if sqlerrm like 'ROOD:%' then raise; end if;
end $$;

-- Rijbeveiliging: een andere gebruiker ziet niets
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select pg_temp.verwacht('Andere gebruiker ziet geen verlof', 0::bigint, (select count(*) from urenbank.verlof));

select 'ALLES GROEN' as resultaat;

rollback;
