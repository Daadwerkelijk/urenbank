// Controleert dat de demo-rekenkern (js/demo.js) dezelfde uitkomsten geeft als de database-tests
// (tests/sql/rekenregels.sql). Draait met Node, zonder browser of netwerk:
//   node tests/demo-gelijkloop.mjs
// Verschilt een uitkomst, dan lopen demo.js en de SQL-functies uit elkaar: pas beide aan.
// Alle getallen zijn verzonnen testwaarden.

globalThis.location = { search: '?demo' };
const { demoApi: api } = await import('../js/demo.js');

let rood = 0;
const verwacht = (naam, v, w) => {
  const ok = JSON.stringify(v) === JSON.stringify(w);
  if (!ok) rood++;
  console.log(`${ok ? 'GROEN' : 'ROOD '} ${naam}${ok ? '' : ` — verwacht ${JSON.stringify(v)}, kreeg ${JSON.stringify(w)}`}`);
};
const geeftFout = async (naam, fn) => {
  let fout = false;
  try { await fn(); } catch { fout = true; }
  verwacht(naam, true, fout);
};

// Leeg beginnen: alle voorbeelddata weg
const SLEUTELS = { dag_afwijking: ['datum'], feestdag_afwijking: ['datum'], week_uren: ['jaar', 'weeknr'] };
for (const t of ['verlof', 'verlof_potje', 'week_uren', 'agenda_item', 'dag_afwijking', 'feestdag_afwijking']) {
  for (const r of await api.list(t)) {
    const match = Object.fromEntries((SLEUTELS[t] || ['id']).map(k => [k, r[k]]));
    await api.remove(t, match);
  }
}
verwacht('Testopzet begint leeg', 0, (await api.list('week_uren')).length + (await api.list('verlof')).length + (await api.list('verlof_potje')).length);

// Zelfde opzet als de SQL-test: 4x9, vijf potjes (verzonnen getallen)
await api.upsert('instellingen', { user_id: 'demo', startdatum: '2026-01-01', urenbank_startsaldo: 0, uren_per_dag: 9, uren_per_week: 36, verval_wettelijk_maanden: 12, verval_bovenwettelijk_maanden: 60 });
for (const [soort, jaar, uren, van, prio] of [
  ['bovenwettelijk', 2024, 10, '2024-01-01', 1], ['wettelijk', 2026, 144, '2026-01-01', 2],
  ['gekocht', 2025, 40, '2025-01-01', 3], ['bovenwettelijk', 2025, 57.6, '2025-01-01', 4],
  ['bovenwettelijk', 2026, 57.6, '2026-01-01', 5]]) {
  await api.insert('verlof_potje', { soort, opbouwjaar: jaar, uren, correctie: 0, beschikbaar_vanaf: van, vervalt_op: null, prioriteit: prio });
}

// Feestdagen
const fd = j => api.rpc('dagen', { van: `${j}-01-01`, tot: `${j}-12-31` }).then(d => d.filter(x => x.feestdag));
verwacht('Tien feestdagen 2026 (incl. 1e Paas/Pinksterdag)', 10, (await fd(2026)).length);
verwacht('Paaszondag 2027 is 28 maart', true, (await fd(2027)).some(d => d.datum === '2027-03-28' && d.feestdag === '1e Paasdag'));
verwacht('Geen Goede Vrijdag', false, (await fd(2026)).some(d => d.datum === '2026-04-03'));
verwacht('5 mei feestdag', true, (await fd(2026)).some(d => d.datum === '2026-05-05'));
verwacht('Koningsdag op zondag wordt zaterdag (2025)', true, (await fd(2025)).some(d => d.datum === '2025-04-26' && d.feestdag === 'Koningsdag'));

// Weken en normen
const wk = async (nr, j = 2026) => (await api.rpc('weekoverzicht', { p_jaar: j })).find(w => w.weeknr === nr);
verwacht('2026 heeft 53 weken', 53, (await api.rpc('weekoverzicht', { p_jaar: 2026 })).length);
verwacht('Norm week 1', 9, (await wk(1)).norm_uren);
verwacht('Norm week 14', 36, (await wk(14)).norm_uren);
verwacht('Norm week 19', 27, (await wk(19)).norm_uren);
verwacht('Norm week 52', 27, (await wk(52)).norm_uren);
verwacht('Norm week 53', 27, (await wk(53)).norm_uren);
await api.upsert('dag_afwijking', { datum: '2026-06-10', uren: 9 });
await api.upsert('dag_afwijking', { datum: '2026-06-11', uren: 0 });
verwacht('Geschoven dag houdt weeknorm gelijk', 36, (await wk(24)).norm_uren);
await api.remove('dag_afwijking', { datum: '2026-06-10' });
await api.remove('dag_afwijking', { datum: '2026-06-11' });
await api.upsert('feestdag_afwijking', { datum: '2026-04-03', naam: 'Goede Vrijdag', is_feestdag: true });
verwacht('Extra feestdag verlaagt norm', 27, (await wk(14)).norm_uren);
await api.remove('feestdag_afwijking', { datum: '2026-04-03' });
await geeftFout('Onzinnig jaartal wordt geweigerd', () => api.rpc('weekoverzicht', { p_jaar: 9999 }));

// Urenbank: per kalenderjaar, begint elk jaar op 0
for (const [nr, uren] of [[1, 9], [2, 44], [3, 30]]) await api.upsert('week_uren', { jaar: 2026, weeknr: nr, timetell_uren: uren });
verwacht('Urenbank na week 3', 2, (await wk(3)).urenbank_cumulatief);
await api.upsert('week_uren', { jaar: 2027, weeknr: 2, timetell_uren: 40 });
verwacht('Urenbank 2027 begint op 0 (week 2: +4)', 4, (await wk(2, 2027)).urenbank_cumulatief);
verwacht('Samenvatting 2026 toont urenbank 2026', 2, (await api.rpc('samenvatting', { p_peildatum: '2026-10-23' })).urenbank);
verwacht('Samenvatting 2027 toont urenbank 2027', 4, (await api.rpc('samenvatting', { p_peildatum: '2027-01-11' })).urenbank);
await api.remove('week_uren', { jaar: 2027, weeknr: 2 });

// Verlof: kosten, aaneengesloten vrij, overlap
await api.insert('verlof', { begin: '2026-12-24', eind: '2026-12-31', omschrijving: 'Kerst', bron: 'saldo', uren_handmatig: null, geboekt: false, geboekte_uren: null });
await api.insert('verlof', { begin: '2026-02-25', eind: '2026-02-28', omschrijving: 'Weekje weg', bron: 'urenbank', uren_handmatig: null, geboekt: false, geboekte_uren: null });
await api.insert('verlof', { begin: '2026-07-06', eind: '2026-08-02', omschrijving: 'Zomer', bron: 'saldo', uren_handmatig: null, geboekt: true, geboekte_uren: 144 });
const vd = async o => (await api.rpc('verlof_details')).find(v => v.omschrijving === o);
verwacht('Kerst kost 36 uur', 36, (await vd('Kerst')).kosten_uren);
verwacht('Kerst 4 werkdagen', 4, (await vd('Kerst')).werkdagen);
verwacht('Kerst 12 dagen vrij', 12, (await vd('Kerst')).dagen_aansluitend_vrij);
verwacht('Weekje weg 5 dagen vrij', 5, (await vd('Weekje weg')).dagen_aansluitend_vrij);
verwacht('Zomer kost 144 uur', 144, (await vd('Zomer')).kosten_uren);
verwacht('Geen overlap zonder dubbel verlof', null, (await vd('Kerst')).overlapt_met);
const dubbel = await api.insert('verlof', { begin: '2026-12-30', eind: '2027-01-02', omschrijving: 'Oud en nieuw', bron: 'saldo', uren_handmatig: null, geboekt: false, geboekte_uren: null });
verwacht('Overlap wordt gemeld', 'Oud en nieuw', (await vd('Kerst')).overlapt_met);
verwacht('Overlap wordt aan beide kanten gemeld', 'Kerst', (await vd('Oud en nieuw')).overlapt_met);
await api.remove('verlof', { id: dubbel.id });

// Saldo: alleen geboekt verlof; volgorde = prioriteit
const som = a => Math.round(a.filter(p => p.soort !== 'tekort').reduce((s, p) => s + p.rest, 0) * 100) / 100;
verwacht('Saldo nu (alleen geboekt)', 165.2, som(await api.rpc('potje_saldi', { incl_gepland: false })));
verwacht('Eerst bovenwettelijk 2024 op', 0, (await api.rpc('potje_saldi')).find(p => p.opbouwjaar === 2024).rest);
verwacht('Daarna wettelijk 2026', 10, (await api.rpc('potje_saldi')).find(p => p.soort === 'wettelijk').rest);
verwacht('Saldo na planning (kerst erbij)', 129.2, som(await api.rpc('potje_saldi', { incl_gepland: true })));
verwacht('Samenvatting: totaal = saldo + urenbank', 167.2, (await api.rpc('samenvatting', { p_peildatum: '2026-10-23' })).totaal);

// Potjes van volgend jaar tellen pas mee vanaf hun eerste dag
await api.rpc('nieuw_jaar', { p_jaar: 2027 });
verwacht('Potjes 2027 tellen in 2026 niet mee', 165.2, (await api.rpc('samenvatting', { p_peildatum: '2026-10-23' })).verlof_saldo);
verwacht('Potjes 2027 tellen vanaf 1 januari 2027 mee', 366.8, (await api.rpc('samenvatting', { p_peildatum: '2027-01-11' })).verlof_saldo);

// Verval
const potje = async (s, j) => (await api.rpc('potje_saldi')).find(p => p.soort === s && p.opbouwjaar === j);
verwacht('Wettelijk 2026 vervalt eind 2027', '2027-12-31', (await potje('wettelijk', 2026)).vervalt_op);
verwacht('Bovenwettelijk 2024 vervalt eind 2029', '2029-12-31', (await potje('bovenwettelijk', 2024)).vervalt_op);
await api.upsert('instellingen', { user_id: 'demo', verval_wettelijk_maanden: 6 });
verwacht('Bij 6 maanden vervalt wettelijk 2026 op 30 juni 2027', '2027-06-30', (await potje('wettelijk', 2026)).vervalt_op);
await api.upsert('instellingen', { user_id: 'demo', verval_wettelijk_maanden: 12 });

// Tekort wordt zichtbaar
await api.insert('verlof', { begin: '2026-09-01', eind: '2026-09-01', omschrijving: 'Te veel', bron: 'saldo', uren_handmatig: null, geboekt: true, geboekte_uren: 900 });
verwacht('Tekort bij te veel verlof', true, (await api.rpc('potje_saldi')).some(p => p.soort === 'tekort'));
const sTekort = await api.rpc('samenvatting', { p_peildatum: '2026-10-23' });
verwacht('Samenvatting: tekort (900 - 165,2)', 734.8, sTekort.verlof_tekort);
verwacht('Samenvatting: totaal met tekort (0 - 734,8 + 2)', -732.8, sTekort.totaal);
verwacht('Samenvatting: na planning met tekort (-734,8 - 36)', -770.8, sTekort.verlof_saldo_na_planning);
await geeftFout('Potje met opbouwjaar 0 wordt geweigerd', () => api.insert('verlof_potje', { soort: 'gekocht', opbouwjaar: 0, uren: 1, correctie: 0, beschikbaar_vanaf: '2026-01-01', prioriteit: 99 }));

console.log(rood ? `\n${rood} test(s) ROOD` : '\nALLES GROEN');
process.exit(rood ? 1 : 0);
