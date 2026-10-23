-- Urenbank 006: agenda-abonnement (bijvoorbeeld Google Agenda via URL).
-- Elke gebruiker kan één geheime link maken. Wie de link heeft, ziet de verlofperiodes
-- vanaf vandaag (geen historie). De link kan altijd worden vernieuwd (nieuwe token).
-- De Edge Function 'urenbank-agenda' haalt de gegevens op met de service-sleutel en
-- zet ze om naar een .ics-agenda. Toevoegend en herhaalbaar.

create table if not exists urenbank.agenda_feed (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  aangemaakt timestamptz not null default now()
);

alter table urenbank.agenda_feed enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'urenbank' and tablename = 'agenda_feed' and policyname = 'eigen_rijen') then
    create policy eigen_rijen on urenbank.agenda_feed for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update on urenbank.agenda_feed to authenticated;

-- Verlof voor de agenda, op basis van de token. Draait als eigenaar (security definer) en
-- doet zich voor de rekenregels voor als de eigenaar van de token, zodat kosten en status
-- uit verlof_overzicht komen. Alleen uitvoerbaar met de service-sleutel (Edge Function).
create or replace function urenbank.agenda_items(p_token text, p_vanaf date default current_date)
returns table (id bigint, begin date, eind date, omschrijving text, bron text, soort_overig text,
               kosten_uren numeric, geboekt boolean, status text)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return; end if;
  select f.user_id into v_user from urenbank.agenda_feed f where f.token = p_token;
  if v_user is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  return query
    select o.id, o.begin, o.eind, o.omschrijving, o.bron, o.soort_overig, o.kosten_uren, o.geboekt, o.status
    from urenbank.verlof_overzicht() o
    where o.eind >= p_vanaf
    order by o.begin, o.id;
end $$;

revoke all on function urenbank.agenda_items(text, date) from public, anon, authenticated;
grant execute on function urenbank.agenda_items(text, date) to service_role;
grant usage on schema urenbank to service_role;

notify pgrst, 'reload schema';
