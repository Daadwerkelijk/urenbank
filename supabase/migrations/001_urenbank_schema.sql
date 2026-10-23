-- Urenbank: schema, tabellen en rijbeveiliging
-- Alle rekenregels staan in 002_urenbank_functies.sql

create schema if not exists urenbank;
grant usage on schema urenbank to authenticated;

-- Persoonlijke instellingen (één rij per gebruiker)
create table urenbank.instellingen (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  startdatum date not null default date_trunc('year', current_date)::date, -- vanaf hier telt de app (saldo + urenbank)
  urenbank_startsaldo numeric(7,2) not null default 0,
  uren_per_dag numeric(5,2) not null default 9,     -- omrekening restant naar dagen
  uren_per_week numeric(5,2) not null default 36,   -- omrekening restant naar werkweken, en basis nieuw jaar
  verval_wettelijk_maanden int not null default 12,
  verval_bovenwettelijk_maanden int not null default 60,
  waarschuw_dagen int not null default 120
);

-- Vast rooster, met ingangsdatum. uren[1] = maandag ... uren[7] = zondag (ISO)
create table urenbank.rooster (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  geldig_vanaf date not null,
  uren numeric(4,2)[] not null check (array_length(uren, 1) = 7),
  unique (user_id, geldig_vanaf)
);

-- Afwijking op het rooster voor één datum (bv. vrije dag geschoven)
create table urenbank.dag_afwijking (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null,
  uren numeric(4,2) not null check (uren between 0 and 24),
  toelichting text,
  primary key (user_id, datum)
);

-- Afwijking op de landelijke cao-feestdagen
-- is_feestdag = true: extra (werkgevers)feestdag; false: landelijke feestdag geldt niet
create table urenbank.feestdag_afwijking (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null,
  naam text not null,
  is_feestdag boolean not null,
  primary key (user_id, datum)
);

-- Informatie in de planning (werksessies, schoolvakanties); geen effect op uren
create table urenbank.agenda_item (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  begin date not null,
  eind date not null,
  omschrijving text not null,
  soort text not null default 'info' check (soort in ('werksessie', 'schoolvakantie', 'info')),
  check (eind >= begin)
);

-- Geschreven uren in Timetell per week (week = maandag t/m zondag, afgekapt op het kalenderjaar)
create table urenbank.week_uren (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jaar int not null,
  weeknr int not null check (weeknr between 1 and 54),
  timetell_uren numeric(5,2) not null check (timetell_uren >= 0),
  notitie text,
  primary key (user_id, jaar, weeknr)
);

-- Verlofpotjes zoals in het P&O-overzicht. uren = beginsaldo op startdatum of toegekend/gekocht aantal
create table urenbank.verlof_potje (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  soort text not null check (soort in ('wettelijk', 'bovenwettelijk', 'gekocht')),
  opbouwjaar int not null,
  uren numeric(7,2) not null check (uren >= 0),
  correctie numeric(7,2) not null default 0,
  beschikbaar_vanaf date not null,
  vervalt_op date,             -- leeg = berekend uit instellingen
  prioriteit int not null,     -- lager = eerder afschrijven
  toelichting text
);

-- Verlof: gepland of geboekt
-- bron: saldo = gaat van P&O-saldo af; urenbank = minder uren schrijven; overig = bijzonder verlof, telt niet mee
create table urenbank.verlof (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  begin date not null,
  eind date not null,
  omschrijving text not null,
  bron text not null default 'saldo' check (bron in ('saldo', 'urenbank', 'overig')),
  soort_overig text,
  uren_handmatig numeric(6,2) check (uren_handmatig >= 0),
  geboekt boolean not null default false,
  geboekte_uren numeric(6,2) check (geboekte_uren >= 0),
  created_at timestamptz not null default now(),
  check (eind >= begin)
);

create index on urenbank.rooster (user_id, geldig_vanaf);
create index on urenbank.agenda_item (user_id, begin);
create index on urenbank.verlof_potje (user_id, prioriteit);
create index on urenbank.verlof (user_id, begin);

-- Rijbeveiliging: iedereen ziet en wijzigt alleen zijn eigen rijen
do $$
declare t text;
begin
  foreach t in array array['instellingen','rooster','dag_afwijking','feestdag_afwijking',
                           'agenda_item','week_uren','verlof_potje','verlof']
  loop
    execute format('alter table urenbank.%I enable row level security', t);
    execute format('create policy eigen_rijen on urenbank.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on urenbank.%I to authenticated', t);
  end loop;
end $$;
