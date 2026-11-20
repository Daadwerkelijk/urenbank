-- Urenbank 010: randgevallen vooruitblik (na code-controle). Toevoegend en herhaalbaar.
-- 1. Staat er alleen verlof ná volgend jaar, dan geen lege kaart voor volgend jaar.
-- 2. Niet geboekt verlof uit het verleden: "gepland" telt alleen het deel dat het saldo van nu raakt
--    (niet het deel uit een potje dat inmiddels al vervallen is), zodat de rekensom per jaar sluit.

create or replace function urenbank.verlof_prognose(p_peildatum date default current_date)
returns table (jaar int, begin_saldo numeric, opbouw numeric, opbouw_verwacht boolean,
               gepland numeric, vervalt numeric, tekort numeric, eind_saldo numeric)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  v_start date; v_vw int; v_vb int; v_week numeric;
  y0 int := extract(year from p_peildatum)::int; ymax int; y int;
  p record; o record;
  a_soort text[] := '{}'; a_jaar int[] := '{}'; a_rest numeric[] := '{}'; a_rest1 numeric[] := '{}';
  a_van date[] := '{}'; a_verv date[] := '{}';
  n int := 0; i int; nodig numeric; neem numeric;
  tekort1 numeric := 0; tekort_cum numeric := 0;
  v_einde date; v_onder date; v_vorig numeric; v_verwacht boolean;
  v_gepland numeric; v_tekort numeric; v_opbouw numeric; v_vervalt numeric; v_eind numeric;
begin
  select ins.startdatum, ins.verval_wettelijk_maanden, ins.verval_bovenwettelijk_maanden, ins.uren_per_week
    into v_start, v_vw, v_vb, v_week
    from urenbank.instellingen ins where ins.user_id = auth.uid();
  v_start := coalesce(v_start, date_trunc('year', current_date)::date);
  v_vw := coalesce(v_vw, 12); v_vb := coalesce(v_vb, 60); v_week := coalesce(v_week, 36);

  -- tot welk jaar vooruitkijken: dit jaar, of volgend jaar als daar gepland saldo-verlof staat
  select greatest(y0, coalesce(max(extract(year from vd.begin)::int), y0)) into ymax
    from urenbank.verlof_overzicht() vd
   where vd.bron = 'saldo' and not vd.geboekt and vd.begin >= v_start
     and extract(year from vd.begin)::int <= y0 + 1;

  -- echte potjes, in afschrijfvolgorde
  for p in
    select vp.soort, vp.opbouwjaar, vp.uren + vp.correctie as begin_uren, vp.beschikbaar_vanaf,
           coalesce(vp.vervalt_op,
             (make_date(vp.opbouwjaar, 12, 31)
               + make_interval(months => case when vp.soort = 'wettelijk' then v_vw else v_vb end))::date) as verv
      from urenbank.verlof_potje vp
     where vp.user_id = auth.uid()
     order by vp.prioriteit, vp.id
  loop
    n := n + 1;
    a_soort[n] := p.soort; a_jaar[n] := p.opbouwjaar; a_rest[n] := p.begin_uren; a_van[n] := p.beschikbaar_vanaf; a_verv[n] := p.verv;
  end loop;

  -- fase 1: geboekt verlof gaat eraf (zoals potje_saldi(false)); dat geeft het saldo van nu
  for o in
    select vd.begin as dag, coalesce(vd.geboekte_uren, vd.kosten_uren) as uren
      from urenbank.verlof_overzicht() vd
     where vd.bron = 'saldo' and vd.begin >= v_start and vd.geboekt
     order by vd.begin, vd.id
  loop
    nodig := o.uren;
    for i in 1 .. n loop
      exit when nodig <= 0;
      if a_van[i] <= o.dag and a_verv[i] >= o.dag and a_rest[i] > 0 then
        neem := least(a_rest[i], nodig); a_rest[i] := a_rest[i] - neem; nodig := nodig - neem;
      end if;
    end loop;
    tekort1 := tekort1 + greatest(nodig, 0);
  end loop;

  -- verwachte opbouw voor toekomstige jaren zonder potjes (achteraan in de volgorde, zoals nieuw_jaar)
  for y in y0 + 1 .. ymax loop
    if not (y = any (select a_jaar[k] from generate_subscripts(a_jaar, 1) k where a_soort[k] = 'wettelijk')) then
      n := n + 1; a_soort[n] := 'wettelijk'; a_jaar[n] := y; a_rest[n] := 4 * v_week; a_van[n] := make_date(y, 1, 1);
      a_verv[n] := (make_date(y, 12, 31) + make_interval(months => v_vw))::date;
    end if;
    if not (y = any (select a_jaar[k] from generate_subscripts(a_jaar, 1) k where a_soort[k] = 'bovenwettelijk')) then
      n := n + 1; a_soort[n] := 'bovenwettelijk'; a_jaar[n] := y; a_rest[n] := round(1.6 * v_week, 2); a_van[n] := make_date(y, 1, 1);
      a_verv[n] := (make_date(y, 12, 31) + make_interval(months => v_vb))::date;
    end if;
  end loop;
  a_rest1 := a_rest;

  -- saldo nu (zelfde definitie als samenvatting: verlof_saldo - verlof_tekort)
  select coalesce(sum(a_rest[k]), 0) - tekort1 into v_vorig
    from generate_subscripts(a_rest, 1) k where a_van[k] <= p_peildatum and a_verv[k] >= p_peildatum;
  tekort_cum := tekort1;

  -- fase 2: gepland verlof per jaar, met een momentopname op 31 december
  for y in y0 .. ymax loop
    v_einde := make_date(y, 12, 31);
    v_onder := case when y = y0 then p_peildatum else make_date(y, 1, 1) end;
    v_gepland := 0; v_tekort := 0;
    for o in
      select vd.begin as dag, vd.kosten_uren as uren
        from urenbank.verlof_overzicht() vd
       where vd.bron = 'saldo' and not vd.geboekt and vd.begin >= v_start and vd.begin <= v_einde
         and (y > y0 and vd.begin >= make_date(y, 1, 1) or y = y0)
       order by vd.begin, vd.id
    loop
      nodig := o.uren;
      for i in 1 .. n loop
        exit when nodig <= 0;
        if a_van[i] <= o.dag and a_verv[i] >= o.dag and a_rest[i] > 0 then
          neem := least(a_rest[i], nodig); a_rest[i] := a_rest[i] - neem; nodig := nodig - neem;
          -- alleen wat het saldo raakt: niet uit een potje dat op de peildatum al vervallen is
          if a_verv[i] >= p_peildatum then v_gepland := v_gepland + neem; end if;
        end if;
      end loop;
      v_tekort := v_tekort + greatest(nodig, 0);
      v_gepland := v_gepland + greatest(nodig, 0);
    end loop;
    tekort_cum := tekort_cum + v_tekort;

    select coalesce(sum(a_rest1[k]), 0), bool_or(a_jaar[k] = y and a_van[k] = make_date(y, 1, 1)
             and not exists (select 1 from urenbank.verlof_potje vp where vp.user_id = auth.uid()
                               and vp.opbouwjaar = y and vp.soort = a_soort[k]))
      into v_opbouw, v_verwacht
      from generate_subscripts(a_rest1, 1) k
     where a_van[k] > case when y = y0 then p_peildatum else make_date(y - 1, 12, 31) end and a_van[k] <= v_einde;
    select coalesce(sum(a_rest[k]), 0) into v_vervalt
      from generate_subscripts(a_rest, 1) k
     where a_van[k] <= v_einde and a_verv[k] >= v_onder and a_verv[k] <= v_einde and a_rest[k] > 0;
    select coalesce(sum(a_rest[k]), 0) - tekort_cum into v_eind
      from generate_subscripts(a_rest, 1) k where a_van[k] <= v_einde and a_verv[k] > v_einde;

    jaar := y; begin_saldo := round(v_vorig, 2); opbouw := round(v_opbouw, 2); opbouw_verwacht := coalesce(v_verwacht, false);
    gepland := round(v_gepland, 2); vervalt := round(v_vervalt, 2); tekort := round(v_tekort, 2); eind_saldo := round(v_eind, 2);
    return next;
    v_vorig := v_eind;
  end loop;
end $$;

notify pgrst, 'reload schema';
