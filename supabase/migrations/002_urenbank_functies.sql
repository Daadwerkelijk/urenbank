-- Urenbank: rekenregels
-- Alle functies draaien als de ingelogde gebruiker (security invoker) en filteren op auth.uid().

-- Paaszondag volgens de Gregoriaanse kalender (anonieme methode)
create or replace function urenbank.paaszondag(jaar int)
returns date language plpgsql immutable set search_path = '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := jaar % 19; b := jaar / 100; c := jaar % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(jaar, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

-- Feestdagen cao Gemeenten (art. 6.6). Goede Vrijdag hoort er niet bij; 5 mei sinds 2024 elk jaar.
create or replace function urenbank.landelijke_feestdagen(jaar int)
returns table (datum date, naam text) language sql immutable set search_path = '' as $$
  with p as (select urenbank.paaszondag(jaar) as pasen)
  select v.datum, v.naam
  from p, lateral (values
    (make_date(jaar, 1, 1), 'Nieuwjaarsdag'),
    (p.pasen, '1e Paasdag'),
    (p.pasen + 1, '2e Paasdag'),
    (case when extract(isodow from make_date(jaar, 4, 27)) = 7
          then make_date(jaar, 4, 26) else make_date(jaar, 4, 27) end, 'Koningsdag'),
    (make_date(jaar, 5, 5), 'Bevrijdingsdag'),
    (p.pasen + 39, 'Hemelvaartsdag'),
    (p.pasen + 49, '1e Pinksterdag'),
    (p.pasen + 50, '2e Pinksterdag'),
    (make_date(jaar, 12, 25), '1e Kerstdag'),
    (make_date(jaar, 12, 26), '2e Kerstdag')
  ) as v(datum, naam)
$$;

-- Eén regel per kalenderdag: roosteruren, feestdag, norm, verlof en agenda
-- norm_uren = roosteruren, behalve op een feestdag (0)
create or replace function urenbank.dagen(van date, tot date)
returns table (datum date, isodow int, rooster_uren numeric, feestdag text, norm_uren numeric,
               verlof_id bigint, verlof_bron text, verlof_omschrijving text, agenda text)
language sql stable set search_path = '' as $$
  with d as (
    select g::date as dag from generate_series(van::timestamp, tot::timestamp, interval '1 day') g
  ),
  fd as (
    select l.datum as dag, l.naam
    from generate_series(extract(year from van)::int, extract(year from tot)::int) j,
         lateral urenbank.landelijke_feestdagen(j) l
    where not exists (select 1 from urenbank.feestdag_afwijking a
                      where a.user_id = auth.uid() and a.datum = l.datum and not a.is_feestdag)
    union
    select a.datum, a.naam from urenbank.feestdag_afwijking a
    where a.user_id = auth.uid() and a.is_feestdag and a.datum between van and tot
  )
  select d.dag,
         extract(isodow from d.dag)::int,
         r.uren_dag,
         f.naam,
         case when f.naam is not null then 0 else r.uren_dag end,
         v.id, v.bron, v.omschrijving,
         (select string_agg(ai.omschrijving, ', ' order by ai.begin)
            from urenbank.agenda_item ai
           where ai.user_id = auth.uid() and d.dag between ai.begin and ai.eind)
  from d
  cross join lateral (
    select coalesce(
      (select da.uren from urenbank.dag_afwijking da where da.user_id = auth.uid() and da.datum = d.dag),
      (select ro.uren[extract(isodow from d.dag)::int] from urenbank.rooster ro
        where ro.user_id = auth.uid() and ro.geldig_vanaf <= d.dag
        order by ro.geldig_vanaf desc limit 1),
      0)::numeric as uren_dag
  ) r
  left join lateral (select string_agg(fd.naam, ' / ') as naam from fd where fd.dag = d.dag) f on true
  left join lateral (select vl.id, vl.bron, vl.omschrijving from urenbank.verlof vl
                      where vl.user_id = auth.uid() and d.dag between vl.begin and vl.eind
                      order by vl.id limit 1) v on true
  order by d.dag
$$;

-- Weken van een kalenderjaar: maandag t/m zondag, afgekapt op 1 jan en 31 dec, doorlopend genummerd
create or replace function urenbank.weken(jaar int)
returns table (weeknr int, van date, tot date) language sql immutable set search_path = '' as $$
  select (row_number() over (order by s.wk))::int, s.van, s.tot
  from (
    select date_trunc('week', g) as wk, min(g)::date as van, max(g)::date as tot
    from generate_series(make_date(jaar, 1, 1)::timestamp, make_date(jaar, 12, 31)::timestamp, interval '1 day') g
    group by 1
  ) s
  order by 1
$$;

-- Weekoverzicht met urenbank. verschil = Timetell - norm; cumulatief loopt door over jaren vanaf startdatum
create or replace function urenbank.weekoverzicht(p_jaar int default null)
returns table (jaar int, weeknr int, van date, tot date, norm_uren numeric, timetell_uren numeric,
               verschil numeric, urenbank_cumulatief numeric, feestdagen text, verlof text, agenda text, notitie text)
language sql stable set search_path = '' as $$
  with inst as (
    select coalesce(max(i.startdatum), date_trunc('year', current_date)::date) as startdatum,
           coalesce(max(i.urenbank_startsaldo), 0) as startsaldo
    from urenbank.instellingen i where i.user_id = auth.uid()
  ),
  jaren as (
    select generate_series(
      extract(year from inst.startdatum)::int,
      greatest(extract(year from current_date)::int, coalesce(p_jaar, 0),
               coalesce((select max(w.jaar) from urenbank.week_uren w where w.user_id = auth.uid()), 0))
    ) as j
    from inst
  ),
  wk as (select jaren.j, w.weeknr, w.van, w.tot from jaren, lateral urenbank.weken(jaren.j) w),
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
      inst.startsaldo + sum(case when r.van >= inst.startdatum and r.tt is not null then r.tt - r.norm else 0 end)
                        over (order by r.van) as c
    from regels r, inst
  )
  select cum.j, cum.weeknr, cum.van, cum.tot, cum.norm, cum.tt, cum.vs,
         case when cum.tt is not null then cum.c end,
         cum.fd, cum.vl, cum.ag, cum.nt
  from cum
  where p_jaar is null or cum.j = p_jaar
  order by cum.van
$$;

-- Verlof met berekende kosten en het aaneengesloten vrije blok
-- kosten_uren = handmatige uren, anders de som van de normuren (rooster min feestdagen)
-- vrij blok = aaneengesloten dagen zonder normuren of met verlof (weekend, vaste vrije dag, feestdag, verlof)
create or replace function urenbank.verlof_details()
returns table (id bigint, begin date, eind date, omschrijving text, bron text, soort_overig text,
               werkdagen int, berekende_uren numeric, kosten_uren numeric, uren_handmatig numeric,
               geboekt boolean, geboekte_uren numeric, verschil_geboekt numeric,
               vrij_van date, vrij_tot date, dagen_aansluitend_vrij int, status text)
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
              when vl.begin <= current_date then 'lopend' else 'gepland' end
  from vl
  cross join lateral (
    select (count(*) filter (where dg.norm_uren > 0))::int as werkdagen, coalesce(sum(dg.norm_uren), 0) as uren
    from dg where dg.datum between vl.begin and vl.eind
  ) k
  left join eilanden e on vl.begin between e.van and e.tot
  order by vl.begin, vl.id
$$;

-- Saldo per verlofpotje. Opnames (bron = saldo, vanaf startdatum) worden op datumvolgorde
-- afgeschreven van de potjes op volgorde van prioriteit, mits het potje dan beschikbaar en niet vervallen is.
-- Geboekt verlof telt met de geboekte uren; met incl_gepland = true telt ook gepland verlof mee.
create or replace function urenbank.potje_saldi(incl_gepland boolean default false)
returns table (potje_id bigint, soort text, opbouwjaar int, begin_uren numeric, opgenomen numeric,
               rest numeric, beschikbaar_vanaf date, vervalt_op date, prioriteit int)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  v_start date; v_vw int; v_vb int;
  p record; o record;
  a_id bigint[] := '{}'; a_soort text[] := '{}'; a_jaar int[] := '{}'; a_begin numeric[] := '{}';
  a_rest numeric[] := '{}'; a_opg numeric[] := '{}'; a_van date[] := '{}'; a_verv date[] := '{}'; a_prio int[] := '{}';
  n int := 0; i int; nodig numeric; neem numeric; tekort numeric := 0;
begin
  select ins.startdatum, ins.verval_wettelijk_maanden, ins.verval_bovenwettelijk_maanden
    into v_start, v_vw, v_vb
    from urenbank.instellingen ins where ins.user_id = auth.uid();
  v_start := coalesce(v_start, date_trunc('year', current_date)::date);
  v_vw := coalesce(v_vw, 12); v_vb := coalesce(v_vb, 60);

  for p in
    select vp.id, vp.soort, vp.opbouwjaar, vp.uren + vp.correctie as begin_uren, vp.beschikbaar_vanaf,
           coalesce(vp.vervalt_op,
             (make_date(vp.opbouwjaar, 12, 31)
               + make_interval(months => case when vp.soort = 'wettelijk' then v_vw else v_vb end))::date) as verv,
           vp.prioriteit
      from urenbank.verlof_potje vp
     where vp.user_id = auth.uid()
     order by vp.prioriteit, vp.id
  loop
    n := n + 1;
    a_id[n] := p.id; a_soort[n] := p.soort; a_jaar[n] := p.opbouwjaar; a_begin[n] := p.begin_uren;
    a_rest[n] := p.begin_uren; a_opg[n] := 0; a_van[n] := p.beschikbaar_vanaf; a_verv[n] := p.verv; a_prio[n] := p.prioriteit;
  end loop;

  for o in
    select vd.begin as dag,
           coalesce(case when vd.geboekt then vd.geboekte_uren end, vd.kosten_uren) as uren
      from urenbank.verlof_details() vd
     where vd.bron = 'saldo' and vd.begin >= v_start and (vd.geboekt or incl_gepland)
     order by vd.begin, vd.id
  loop
    nodig := o.uren;
    for i in 1 .. n loop
      exit when nodig <= 0;
      if a_van[i] <= o.dag and a_verv[i] >= o.dag and a_rest[i] > 0 then
        neem := least(a_rest[i], nodig);
        a_rest[i] := a_rest[i] - neem; a_opg[i] := a_opg[i] + neem; nodig := nodig - neem;
      end if;
    end loop;
    tekort := tekort + greatest(nodig, 0);
  end loop;

  for i in 1 .. n loop
    potje_id := a_id[i]; soort := a_soort[i]; opbouwjaar := a_jaar[i]; begin_uren := a_begin[i];
    opgenomen := a_opg[i]; rest := a_rest[i]; beschikbaar_vanaf := a_van[i]; vervalt_op := a_verv[i]; prioriteit := a_prio[i];
    return next;
  end loop;
  if tekort > 0 then
    potje_id := null; soort := 'tekort'; opbouwjaar := null; begin_uren := 0; opgenomen := tekort; rest := -tekort;
    beschikbaar_vanaf := null; vervalt_op := null; prioriteit := null;
    return next;
  end if;
end $$;

-- Totalen voor het dashboard
create or replace function urenbank.samenvatting()
returns jsonb language sql stable set search_path = '' as $$
  with inst as (
    select coalesce(max(i.uren_per_dag), 9) as upd, coalesce(max(i.uren_per_week), 36) as upw
    from urenbank.instellingen i where i.user_id = auth.uid()
  ),
  nu as (
    select coalesce(sum(s.rest) filter (where coalesce(s.vervalt_op, 'infinity'::date) >= current_date), 0) as saldo,
           coalesce(sum(s.rest) filter (where s.vervalt_op < current_date and s.rest > 0), 0) as vervallen
    from urenbank.potje_saldi(false) s
  ),
  plan as (
    select coalesce(sum(s.rest) filter (where coalesce(s.vervalt_op, 'infinity'::date) >= current_date), 0) as saldo
    from urenbank.potje_saldi(true) s
  ),
  wk as (select * from urenbank.weekoverzicht(null)),
  ub as (
    select (select w.urenbank_cumulatief from wk w where w.timetell_uren is not null order by w.van desc limit 1) as nu,
           (select max(w.tot) from wk w where w.timetell_uren is not null) as ingevuld_tot
  ),
  ubplan as (
    select coalesce(sum(vd.kosten_uren), 0) as uren
    from urenbank.verlof_details() vd, ub
    where vd.bron = 'urenbank' and vd.begin > coalesce(ub.ingevuld_tot, current_date)
  )
  select jsonb_build_object(
    'verlof_saldo', nu.saldo,
    'verlof_vervallen', nu.vervallen,
    'verlof_gepland', nu.saldo - plan.saldo,
    'verlof_saldo_na_planning', plan.saldo,
    'urenbank', coalesce(ub.nu, 0),
    'urenbank_gepland', ubplan.uren,
    'urenbank_na_planning', coalesce(ub.nu, 0) - ubplan.uren,
    'totaal', nu.saldo + coalesce(ub.nu, 0),
    'totaal_na_planning', plan.saldo + coalesce(ub.nu, 0) - ubplan.uren,
    'weken_ingevuld_tot', ub.ingevuld_tot,
    'uren_per_dag', inst.upd,
    'uren_per_week', inst.upw)
  from nu, plan, ub, ubplan, inst
$$;

-- Nieuw jaar: wettelijk (4 x weekuren) en bovenwettelijk (1,6 x weekuren, cao Gemeenten) toevoegen
create or replace function urenbank.nieuw_jaar(p_jaar int)
returns void language plpgsql set search_path = '' as $$
declare v_week numeric; v_max int;
begin
  select ins.uren_per_week into v_week from urenbank.instellingen ins where ins.user_id = auth.uid();
  v_week := coalesce(v_week, 36);
  if exists (select 1 from urenbank.verlof_potje vp where vp.user_id = auth.uid()
               and vp.opbouwjaar = p_jaar and vp.soort in ('wettelijk', 'bovenwettelijk')) then
    raise exception 'Er bestaan al potjes voor %', p_jaar;
  end if;
  select coalesce(max(vp.prioriteit), 0) into v_max from urenbank.verlof_potje vp where vp.user_id = auth.uid();
  insert into urenbank.verlof_potje (soort, opbouwjaar, uren, beschikbaar_vanaf, prioriteit, toelichting)
  values ('wettelijk', p_jaar, 4 * v_week, make_date(p_jaar, 1, 1), v_max + 1, 'Toegevoegd via nieuw jaar'),
         ('bovenwettelijk', p_jaar, round(1.6 * v_week, 2), make_date(p_jaar, 1, 1), v_max + 2, 'Toegevoegd via nieuw jaar');
end $$;

revoke all on all functions in schema urenbank from public, anon;
grant execute on all functions in schema urenbank to authenticated;
