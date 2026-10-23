-- Urenbank 003: onzinnige jaartallen weigeren (alleen 2000 t/m 2100) bij weekuren en opbouwjaar van potjes.
-- Herhaalbaar.

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'week_uren_jaar_redelijk') then
    alter table urenbank.week_uren add constraint week_uren_jaar_redelijk check (jaar between 2000 and 2100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'verlof_potje_opbouwjaar_redelijk') then
    alter table urenbank.verlof_potje add constraint verlof_potje_opbouwjaar_redelijk check (opbouwjaar between 2000 and 2100);
  end if;
end $$;
