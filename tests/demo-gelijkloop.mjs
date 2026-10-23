// Controleert dat de demo-rekenkern (js/demo.js) dezelfde uitkomsten geeft als de database-tests
// (tests/sql/rekenregels.sql). Draait met Node, zonder browser of netwerk:
//   node tests/demo-gelijkloop.mjs
// Verschilt een uitkomst, dan lopen demo.js en de SQL-functies uit elkaar: pas beide aan.

globalThis.location = { search: '?demo' };
const { demoApi: api } = await import('../js/demo.js');

let rood = 0;
const verwacht = (naam, v, w) => {
  const ok = JSON.stringify(v) === JSON.stringify(w);
  if (!ok) rood++;
  console.log(`${ok ? 'GROEN' : 'ROOD '} ${naam}${ok ? '' : ` — verwacht ${JSON.stringify(v)}, kreeg ${JSON.stringify(w)}`}`);
};

// Zelfde opzet als de SQL-test: leeg beginnen, 4x9, vijf potjes
for (const t of ['verlof', 'verlof_potje', 'week_uren', 'agenda_item', 'dag_afwijking', 'feestdag_afwijking']) {
  for (const r of await api.list(t)) await api.remove(t, r.id != null ? { id: r.id } : { datum: r.datum ?? '', jaar: r.jaar ?? '', weeknr: r.weeknr ?? '' });
}
await api.upsert('instellingen', { user_id: 'demo', startdatum: '2026-01-01', urenbank_startsaldo: 0, uren_per_dag: 9, uren_per_week: 36 });
for (const [soort, jaar, uren, van, prio] of [
  ['bovenwettelijk', 2024, 8.38, '2024-01-01', 1], ['wettelijk', 2026, 144, '2026-01-01', 2],
  ['gekocht', 2025, 36, '2025-01-01', 3], ['bovenwettelijk', 2025, 57.6, '2025-01-01', 4],
  ['bovenwettelijk', 2026, 57.6, '2026-01-01', 5]]) {
  await api.insert('verlof_potje', { soort, opbouwjaar: jaar, uren, correctie: 0, beschikbaar_vanaf: van, vervalt_op: null, prioriteit: prio });
}

const wk = async nr => (await api.rpc('weekoverzicht', { p_jaar: 2026 })).find(w => w.weeknr === nr);
const fd = (await api.rpc('dagen', { van: '2026-01-01', tot: '2026-12-31' })).filter(d => d.feestdag);
verwacht('Tien feestdagen 2026 (incl. 1e Paas/Pinksterdag)', 10, fd.length);
verwacht('Geen Goede Vrijdag', false, fd.some(d => d.datum === '2026-04-03'));
verwacht('5 mei feestdag', true, fd.some(d => d.datum === '2026-05-05'));
verwacht('2026 heeft 53 weken', 53, (await api.rpc('weekoverzicht', { p_jaar: 2026 })).length);
verwacht('Norm week 1', 9, (await wk(1)).norm_uren);
verwacht('Norm week 14', 36, (await wk(14)).norm_uren);
verwacht('Norm week 19', 27, (await wk(19)).norm_uren);
verwacht('Norm week 52', 27, (await wk(52)).norm_uren);
verwacht('Norm week 53', 27, (await wk(53)).norm_uren);

for (const [nr, uren] of [[1, 9], [2, 44], [3, 30]]) await api.upsert('week_uren', { jaar: 2026, weeknr: nr, timetell_uren: uren });
verwacht('Urenbank na week 3', 2, (await wk(3)).urenbank_cumulatief);

await api.insert('verlof', { begin: '2026-12-24', eind: '2026-12-31', omschrijving: 'Kerst', bron: 'saldo', uren_handmatig: null, geboekt: false, geboekte_uren: null });
await api.insert('verlof', { begin: '2026-02-25', eind: '2026-02-28', omschrijving: 'Weekje weg', bron: 'urenbank', uren_handmatig: null, geboekt: false, geboekte_uren: null });
await api.insert('verlof', { begin: '2026-07-06', eind: '2026-08-02', omschrijving: 'Zomer', bron: 'saldo', uren_handmatig: null, geboekt: true, geboekte_uren: 144 });
const vd = async o => (await api.rpc('verlof_details')).find(v => v.omschrijving === o);
verwacht('Kerst kost 36 uur', 36, (await vd('Kerst')).kosten_uren);
verwacht('Kerst 12 dagen vrij', 12, (await vd('Kerst')).dagen_aansluitend_vrij);
verwacht('Weekje weg 5 dagen vrij', 5, (await vd('Weekje weg')).dagen_aansluitend_vrij);
verwacht('Zomer kost 144 uur', 144, (await vd('Zomer')).kosten_uren);

const som = a => Math.round(a.reduce((s, p) => s + p.rest, 0) * 100) / 100;
verwacht('Saldo nu', 159.58, som(await api.rpc('potje_saldi', { incl_gepland: false })));
verwacht('Saldo na planning', 123.58, som(await api.rpc('potje_saldi', { incl_gepland: true })));
verwacht('Wettelijk 2026 vervalt eind 2027', '2027-12-31', (await api.rpc('potje_saldi')).find(p => p.soort === 'wettelijk').vervalt_op);
verwacht('Bovenwettelijk 2024 vervalt eind 2029', '2029-12-31', (await api.rpc('potje_saldi')).find(p => p.opbouwjaar === 2024).vervalt_op);

console.log(rood ? `\n${rood} test(s) ROOD` : '\nALLES GROEN');
process.exit(rood ? 1 : 0);
