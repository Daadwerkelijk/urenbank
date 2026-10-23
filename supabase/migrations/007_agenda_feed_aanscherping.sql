-- Urenbank 007: agenda-abonnement aanscherpen. Toevoegend en herhaalbaar.
-- 1. Token moet 64 hex-tekens zijn (geen zwakke, zelfgekozen token via de API).
-- 2. agenda_items zet naast request.jwt.claims ook de oudere instelling request.jwt.claim.sub,
--    zodat auth.uid() in elke variant de eigenaar van de token geeft.
-- Let op: agenda_items is security definer (RLS geldt daarbinnen niet). De afscherming rust op de
-- expliciete filters op auth.uid() in verlof_overzicht() en dagen(); zie CLAUDE.md.

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_feed_token_formaat') then
    alter table urenbank.agenda_feed add constraint agenda_feed_token_formaat check (token ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create or replace function urenbank.agenda_items(p_token text, p_vanaf date default current_date)
returns table (id bigint, begin date, eind date, omschrijving text, bron text, soort_overig text,
               kosten_uren numeric, geboekt boolean, status text)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return; end if;
  select f.user_id into v_user from urenbank.agenda_feed f where f.token = p_token;
  if v_user is null then return; end if;
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  return query
    select o.id, o.begin, o.eind, o.omschrijving, o.bron, o.soort_overig, o.kosten_uren, o.geboekt, o.status
    from urenbank.verlof_overzicht() o
    where o.eind >= p_vanaf
    order by o.begin, o.id;
end $$;

revoke all on function urenbank.agenda_items(text, date) from public, anon, authenticated;
grant execute on function urenbank.agenda_items(text, date) to service_role;
