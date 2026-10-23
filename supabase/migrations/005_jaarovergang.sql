-- Urenbank 005: onthouden voor welk jaar de jaarovergang is afgerond.
-- De app toont vanaf 1 januari een checklist tot de gebruiker "Klopt, afgerond" kiest.
-- Toevoegend en herhaalbaar.

alter table urenbank.instellingen add column if not exists jaarovergang_klaar int
  check (jaarovergang_klaar between 2000 and 2100);
