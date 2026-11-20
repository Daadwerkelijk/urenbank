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
const vd = async o => (await api.rpc('verlof_overzicht')).find(v => v.omschrijving === o);
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

// Vooruitblik per jaar: dit jaar los van volgend jaar; opbouw volgend jaar verwacht volgens cao
const z27 = await api.insert('verlof', { begin: '2027-07-05', eind: '2027-07-09', omschrijving: 'Zomer 2027', bron: 'saldo', uren_handmatig: null, geboekt: false, geboekte_uren: null });
verwacht('Zomer 2027 kost 36 uur', 36, (await vd('Zomer 2027')).kosten_uren);
verwacht('Rest eind dit jaar: alleen planning t/m 31 december', 129.2, som(await api.rpc('potje_saldi_tot', { incl_gepland: true, p_tot: '2026-12-31' })));
const prog = async j => (await api.rpc('verlof_prognose', { p_peildatum: '2026-10-23' })).find(r => r.jaar === j);
verwacht('Vooruitblik: dit jaar en volgend jaar', 2, (await api.rpc('verlof_prognose', { p_peildatum: '2026-10-23' })).length);
verwacht('2026: begint met saldo nu', 165.2, (await prog(2026)).begin_saldo);
verwacht('2026: nog gepland (kerst)', 36, (await prog(2026)).gepland);
verwacht('2026: over op 31 december', 129.2, (await prog(2026)).eind_saldo);
verwacht('2027: begint met wat over is uit 2026', 129.2, (await prog(2027)).begin_saldo);
verwacht('2027: opbouw volgens cao (4 + 1,6 x weekuren)', 201.6, (await prog(2027)).opbouw);
verwacht('2027: opbouw is verwacht (nog geen potjes)', true, (await prog(2027)).opbouw_verwacht);
verwacht('2027: gepland', 36, (await prog(2027)).gepland);
verwacht('2027: over op 31 december', 294.8, (await prog(2027)).eind_saldo);
const ver = await api.insert('verlof', { begin: '2029-03-05', eind: '2029-03-09', omschrijving: 'Ver weg', bron: 'saldo', uren_handmatig: null, geboekt: false, geboekte_uren: null });
verwacht('Vooruitblik kijkt niet verder dan volgend jaar', 2, (await api.rpc('verlof_prognose', { p_peildatum: '2026-10-23' })).length);
verwacht('Verlof na volgend jaar telt niet mee', 294.8, (await prog(2027)).eind_saldo);
await api.update('verlof', { id: ver.id }, { bron: 'overig' });
const gek = (await api.list('verlof_potje')).find(p => p.soort === 'gekocht' && p.opbouwjaar === 2025);
await api.update('verlof_potje', { id: gek.id }, { vervalt_op: '2026-12-31' });
verwacht('2026: rest gekocht vervalt eind 2026', 14, (await prog(2026)).vervalt);
verwacht('2026: over na verval', 115.2, (await prog(2026)).eind_saldo);
verwacht('2027: over na verval in 2026', 280.8, (await prog(2027)).eind_saldo);
await api.update('verlof_potje', { id: gek.id }, { vervalt_op: null });
await api.update('verlof', { id: z27.id }, { uren_handmatig: 500 });
verwacht('2027: tekort als planning de opbouw overstijgt', 169.2, (await prog(2027)).tekort);
verwacht('2027: over is negatief bij tekort', -169.2, (await prog(2027)).eind_saldo);
verwacht('2026: geen tekort door planning 2027', 0, (await prog(2026)).tekort);
await api.update('verlof', { id: z27.id }, { uren_handmatig: null, bron: 'overig' });
verwacht('Zonder planning volgend jaar: alleen dit jaar', 1, (await api.rpc('verlof_prognose', { p_peildatum: '2026-10-23' })).length);
await api.update('verlof', { id: ver.id }, { bron: 'saldo' });
verwacht('Alleen verlof na volgend jaar: geen lege kaart volgend jaar', 1, (await api.rpc('verlof_prognose', { p_peildatum: '2026-10-23' })).length);
await api.update('verlof', { id: ver.id }, { bron: 'overig' });
await api.update('verlof_potje', { id: gek.id }, { vervalt_op: '2026-03-31' });
const verg = await api.insert('verlof', { begin: '2026-03-02', eind: '2026-03-03', omschrijving: 'Vergeten te boeken', bron: 'saldo', uren_handmatig: null, geboekt: false, geboekte_uren: null });
verwacht('Niet geboekt verlof uit het verleden: saldo nu zonder vervallen potje', 125.2, (await prog(2026)).begin_saldo);
verwacht('Niet geboekt verlof uit het verleden: alleen het deel dat het saldo raakt', 46, (await prog(2026)).gepland);
verwacht('Niet geboekt verlof uit het verleden: rekensom sluit', 79.2, (await prog(2026)).eind_saldo);
await api.update('verlof', { id: verg.id }, { bron: 'overig' });
await api.update('verlof_potje', { id: gek.id }, { vervalt_op: null });

// Potjes van volgend jaar tellen pas mee vanaf hun eerste dag
await api.rpc('nieuw_jaar', { p_jaar: 2027 });
await api.update('verlof', { id: z27.id }, { bron: 'saldo' });
verwacht('2027 met echte potjes: opbouw niet meer verwacht', false, (await prog(2027)).opbouw_verwacht);
verwacht('2027 met echte potjes: zelfde uitkomst', 294.8, (await prog(2027)).eind_saldo);
await api.update('verlof', { id: z27.id }, { bron: 'overig' });
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
