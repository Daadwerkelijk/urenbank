-- Rekenregeltests voor schema urenbank.
-- Draait volledig binnen één transactie met een verzonnen testgebruiker en eindigt met ROLLBACK:
-- er blijft niets achter en echte gebruikersdata wordt niet gelezen of gewijzigd.
-- Elke assert faalt met een duidelijke melding; geen melding = alles groen.
-- Uitvoeren: plak in de Supabase SQL-editor of via execute_sql (Supabase MCP).

begin;

create or replace function pg_temp.verwacht(naam text, verwacht anyelement, werkelijk anyelement) returns void
language plpgsql as $$
begin
  if verwacht is distinct from werkelijk then
    raise exception 'ROOD: % — verwacht %, kreeg %', naam, verwacht, werkelijk;
  end if;
  raise notice 'GROEN: %', naam;
end $$;

-- Testgebruiker (bestaat alleen binnen deze transactie)
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000a1', 'test-urenbank@voorbeeld.invalid', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

-- Opzet: 4x9 (ma, di, do, vr), wettelijk 144 + bovenwettelijk 57,6
insert into urenbank.instellingen (startdatum, uren_per_dag, uren_per_week) values ('2026-01-01', 9, 36);
insert into urenbank.rooster (geldig_vanaf, uren) values ('2024-01-01', '{9,9,0,9,9,0,0}');
insert into urenbank.verlof_potje (soort, opbouwjaar, uren, beschikbaar_vanaf, prioriteit) values
  ('bovenwettelijk', 2024, 8.38, '2024-01-01', 1),
  ('wettelijk', 2026, 144, '2026-01-01', 2),
  ('gekocht', 2025, 36, '2025-01-01', 3),
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

-- Dag schuiven: woensdag werken, donderdag vrij
insert into urenbank.dag_afwijking (datum, uren) values ('2026-06-10', 9), ('2026-06-11', 0);
select pg_temp.verwacht('Geschoven dag houdt weeknorm gelijk', 36::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 24));
delete from urenbank.dag_afwijking;

-- Werkgeversfeestdag en uitgezette feestdag
insert into urenbank.feestdag_afwijking (datum, naam, is_feestdag) values ('2026-04-03', 'Goede Vrijdag', true);
select pg_temp.verwacht('Extra feestdag verlaagt norm', 27::numeric, (select norm_uren from urenbank.weekoverzicht(2026) where weeknr = 14));
delete from urenbank.feestdag_afwijking;

-- Urenbank: Timetell - norm, cumulatief
insert into urenbank.week_uren (jaar, weeknr, timetell_uren) values (2026, 1, 9), (2026, 2, 44), (2026, 3, 30);
select pg_temp.verwacht('Urenbank na week 3', 2::numeric, (select urenbank_cumulatief from urenbank.weekoverzicht(2026) where weeknr = 3));

-- Verlof: kosten en aaneengesloten vrij
insert into urenbank.verlof (begin, eind, omschrijving, bron, geboekt, geboekte_uren) values
  ('2026-12-24', '2026-12-31', 'Kerst', 'saldo', false, null),
  ('2026-02-25', '2026-02-28', 'Weekje weg', 'urenbank', false, null),
  ('2026-07-06', '2026-08-02', 'Zomer', 'saldo', true, 144);
select pg_temp.verwacht('Kerst 24-31 dec kost 36 uur', 36::numeric, (select kosten_uren from urenbank.verlof_details() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Kerst: 4 werkdagen', 4, (select werkdagen from urenbank.verlof_details() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Kerst: 12 dagen aaneengesloten vrij', 12, (select dagen_aansluitend_vrij from urenbank.verlof_details() where omschrijving = 'Kerst'));
select pg_temp.verwacht('Wo-za: 5 dagen vrij tot en met zondag', 5, (select dagen_aansluitend_vrij from urenbank.verlof_details() where omschrijving = 'Weekje weg'));
select pg_temp.verwacht('Zomer 6 jul - 2 aug kost 144 uur', 144::numeric, (select kosten_uren from urenbank.verlof_details() where omschrijving = 'Zomer'));

-- Saldo: alleen geboekt verlof gaat eraf; urenbank-verlof nooit; volgorde = prioriteit
select pg_temp.verwacht('Saldo nu (alleen geboekt)', 159.58::numeric, (select sum(rest) from urenbank.potje_saldi(false)));
select pg_temp.verwacht('Eerst bovenwettelijk 2024 op', 0::numeric, (select rest from urenbank.potje_saldi(false) where opbouwjaar = 2024));
select pg_temp.verwacht('Daarna wettelijk 2026', 8.38::numeric, (select rest from urenbank.potje_saldi(false) where soort = 'wettelijk'));
select pg_temp.verwacht('Saldo na planning (kerst erbij)', 123.58::numeric, (select sum(rest) from urenbank.potje_saldi(true)));
select pg_temp.verwacht('Samenvatting: totaal = saldo + urenbank', 161.58::numeric, (urenbank.samenvatting()->>'totaal')::numeric);

-- Verval: wettelijk 12 maanden, bovenwettelijk 60 maanden na het opbouwjaar
select pg_temp.verwacht('Wettelijk 2026 vervalt eind 2027', '2027-12-31'::date, (select vervalt_op from urenbank.potje_saldi(false) where soort = 'wettelijk'));
select pg_temp.verwacht('Bovenwettelijk 2024 vervalt eind 2029', '2029-12-31'::date, (select vervalt_op from urenbank.potje_saldi(false) where opbouwjaar = 2024));

-- Tekort wordt zichtbaar in plaats van stil weggeslikt
insert into urenbank.verlof (begin, eind, omschrijving, bron, geboekt, geboekte_uren) values ('2026-09-01', '2026-09-01', 'Te veel', 'saldo', true, 500);
select pg_temp.verwacht('Tekort bij te veel verlof', true, exists (select 1 from urenbank.potje_saldi(false) where soort = 'tekort'));

-- Rijbeveiliging: een andere gebruiker ziet niets
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select pg_temp.verwacht('Andere gebruiker ziet geen verlof', 0::bigint, (select count(*) from urenbank.verlof));

select 'ALLES GROEN' as resultaat;

rollback;
