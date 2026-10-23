-- Urenbank 003
-- 1. Urenbank per kalenderjaar: begint elk jaar op 0 (startsaldo alleen in het startjaar).
-- 2. Verlofpotjes tellen in de samenvatting pas mee vanaf "beschikbaar vanaf" (peildatum instelbaar voor tests).
-- 3. verlof_details meldt overlappend verlof (overlapt_met).
-- 4. Onzinnige jaartallen worden geweigerd (alleen 2000 t/m 2100), ook als opbouwjaar van een potje.
-- Herhaalbaar: kan opnieuw worden uitgevoerd als een eerdere poging halverwege stopte.

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'week_uren_jaar_redelijk') then
    alter table urenbank.week_uren add constraint week_uren_jaar_redelijk check (jaar between 2000 and 2100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'verlof_potje_opbouwjaar_redelijk') then
    alter table urenbank.verlof_potje add constraint verlof_potje_opbouwjaar_redelijk check (opbouwjaar between 2000 and 2100);
  end if;
end $$;

create or replace function urenbank.weekoverzicht(p_jaar int default null)
returns table (jaar int, weeknr int, van date, tot date, norm_uren numeric, timetell_uren numeric,
               verschil numeric, urenbank_cumulatief numeric, feestdagen text, verlof text, agenda text, notitie text)
language plpgsql stable set search_path = '' as $$
begin
  if p_jaar is not null and p_jaar not between 2000 and 2100 then
    raise exception 'Kies een jaar tussen 2000 en 2100.';
  end if;
  return query
  with inst as (
    select coalesce(max(i.startdatum), date_trunc('year', current_date)::date) as startdatum,
           coalesce(max(i.urenbank_startsaldo), 0) as startsaldo
    from urenbank.instellingen i where i.user_id = auth.uid()
  ),
  jaren as (
    select generate_series(
      greatest(extract(year from inst.startdatum)::int, 2000),
      least(greatest(extract(year from current_date)::int, coalesce(p_jaar, 0),
                     coalesce((select max(w.jaar) from urenbank.week_uren w where w.user_id = auth.uid()), 0)), 2100)
    ) as j
    from inst
  ),
  wk as (select jaren.j, w.weeknr, w.van, w.tot from jaren, lateral urenbank.weken(jaren.j) w
         where p_jaar is null or jaren.j = p_jaar),
  dg as (select * from urenbank.dagen((select min(wk.van) from wk), (select max(wk.tot) from wk))),
  regels as (
    select wk.j, wk.weeknr, wk.van, wk.tot,
      (select sum(dg.norm_uren) from dg where dg.datum between wk.van and wk.tot) as norm,
      wu.timetell_uren as tt, wu.notitie as nt,
      (select string_agg(distinct dg.feestdag, ', ') from dg where dg.datum between wk.van and wk.tot) as fd,
      (select string_agg(distinct dg.verlof_omschrijving, ', ') from dg where dg.datum between wk.van and wk.tot) as vl,
      (select string_agg(distinct dg.agenda, ', ') from dg where dg.datum between wk.van and wk.tot) as ag
    from wk
    left join urenbank.week_uren wu on wu.user_id = auth.uid() and wu.jaar = wk.j and wu.weeknr = wk.weeknr
  ),
  cum as (
    select r.*, r.tt - r.norm as vs,
      case when r.j = extract(year from inst.startdatum)::int then inst.startsaldo else 0 end
      + sum(case when r.van >= inst.startdatum and r.tt is not null then r.tt - r.norm else 0 end)
          over (partition by r.j order by r.van) as c
    from regels r, inst
  )
  select cum.j, cum.weeknr, cum.van, cum.tot, cum.norm, cum.tt, cum.vs,
         case when cum.tt is not null then cum.c end,
         cum.fd, cum.vl, cum.ag, cum.nt
  from cum
  order by cum.van;
end $$;

drop function if exists urenbank.verlof_details();
create or replace function urenbank.verlof_details()
returns table (id bigint, begin date, eind date, omschrijving text, bron text, soort_overig text,
               werkdagen int, berekende_uren numeric, kosten_uren numeric, uren_handmatig numeric,
               geboekt boolean, geboekte_uren numeric, verschil_geboekt numeric,
               vrij_van date, vrij_tot date, dagen_aansluitend_vrij int, status text, overlapt_met text)
language sql stable set search_path = '' as $$
  with vl as (select * from urenbank.verlof v where v.user_id = auth.uid()),
  grens as (select min(vl.begin) - 31 as lo, max(vl.eind) + 31 as hi from vl),
  dg as (select d.* from grens, lateral urenbank.dagen(grens.lo, grens.hi) d where grens.lo is not null),
  vrij as (
    select dg.datum, dg.datum - (row_number() over (order by dg.datum))::int as grp
    from dg where dg.norm_uren = 0 or dg.verlof_id is not null
  ),
  eilanden as (select min(vrij.datum) as van, max(vrij.datum) as tot from vrij group by vrij.grp)
  select vl.id, vl.begin, vl.eind, vl.omschrijving, vl.bron, vl.soort_overig,
         k.werkdagen, k.uren, coalesce(vl.uren_handmatig, k.uren), vl.uren_handmatig,
         vl.geboekt, vl.geboekte_uren,
         case when vl.geboekt and vl.geboekte_uren is not null
              then vl.geboekte_uren - coalesce(vl.uren_handmatig, k.uren) end,
         e.van, e.tot, (e.tot - e.van + 1)::int,
         case when vl.eind < current_date then 'voorbij'
              when vl.begin <= current_date then 'lopend' else 'gepland' end,
         (select string_agg(a.omschrijving, ', ' order by a.begin, a.id) from vl a
           where a.id <> vl.id and a.begin <= vl.eind and a.eind >= vl.begin)
  from vl
  cross join lateral (
    select (count(*) filter (where dg.norm_uren > 0))::int as werkdagen, coalesce(sum(dg.norm_uren), 0) as uren
    from dg where dg.datum between vl.begin and vl.eind
  ) k
  left join eilanden e on vl.begin between e.van and e.tot
  order by vl.begin, vl.id
$$;

drop function if exists urenbank.samenvatting();
drop function if exists urenbank.samenvatting(date);
create or replace function urenbank.samenvatting(p_peildatum date default current_date)
returns jsonb language sql stable set search_path = '' as $$
  with inst as (
    select coalesce(max(i.uren_per_dag), 9) as upd, coalesce(max(i.uren_per_week), 36) as upw
    from urenbank.instellingen i where i.user_id = auth.uid()
  ),
  pj as (select extract(year from p_peildatum)::int as jaar),
  nu as (
    select coalesce(sum(s.rest) filter (where s.soort <> 'tekort' and s.beschikbaar_vanaf <= p_peildatum
                                          and coalesce(s.vervalt_op, 'infinity'::date) >= p_peildatum), 0) as saldo,
           coalesce(sum(s.rest) filter (where s.soort <> 'tekort' and s.vervalt_op < p_peildatum and s.rest > 0), 0) as vervallen,
           coalesce(sum(-s.rest) filter (where s.soort = 'tekort'), 0) as tekort
    from urenbank.potje_saldi(false) s
  ),
  plan as (
    select coalesce(sum(s.rest) filter (where s.soort <> 'tekort' and s.beschikbaar_vanaf <= p_peildatum
                                          and coalesce(s.vervalt_op, 'infinity'::date) >= p_peildatum), 0) as saldo,
           coalesce(sum(-s.rest) filter (where s.soort = 'tekort'), 0) as tekort
    from urenbank.potje_saldi(true) s
  ),
  wk as (select * from pj, lateral urenbank.weekoverzicht(pj.jaar)),
  ub as (
    select (select w.urenbank_cumulatief from wk w where w.timetell_uren is not null order by w.van desc limit 1) as nu,
           (select max(w.tot) from wk w where w.timetell_uren is not null) as ingevuld_tot
  ),
  ubplan as (
    select coalesce(sum(vd.kosten_uren), 0) as uren
    from urenbank.verlof_details() vd, ub, pj
    where vd.bron = 'urenbank'
      and vd.begin > coalesce(ub.ingevuld_tot, p_peildatum)
      and extract(year from vd.begin)::int = pj.jaar
  )
  select jsonb_build_object(
    'peildatum', p_peildatum,
    'urenbank_jaar', pj.jaar,
    'verlof_saldo', nu.saldo,
    'verlof_vervallen', nu.vervallen,
    'verlof_tekort', nu.tekort,
    'verlof_gepland', nu.saldo - plan.saldo + plan.tekort - nu.tekort,
    'verlof_saldo_na_planning', plan.saldo - plan.tekort,
    'urenbank', coalesce(ub.nu, 0),
    'urenbank_gepland', ubplan.uren,
    'urenbank_na_planning', coalesce(ub.nu, 0) - ubplan.uren,
    'totaal', nu.saldo - nu.tekort + coalesce(ub.nu, 0),
    'totaal_na_planning', plan.saldo - plan.tekort + coalesce(ub.nu, 0) - ubplan.uren,
    'weken_ingevuld_tot', ub.ingevuld_tot,
    'uren_per_dag', inst.upd,
    'uren_per_week', inst.upw)
  from nu, plan, ub, ubplan, inst, pj
$$;

revoke all on all functions in schema urenbank from public, anon;
grant execute on all functions in schema urenbank to authenticated;

notify pgrst, 'reload schema';
