// Demo-modus (?demo): voorbeelddata in het geheugen en dezelfde rekenregels als de database-functies.
// Wordt gebruikt om de app te bekijken zonder account. Niets wordt opgeslagen.

const pad = n => String(n).padStart(2, '0');
const toIso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s, n) => { const d = fromIso(s); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
const isodow = s => ((fromIso(s).getUTCDay() + 6) % 7) + 1;
const diffDays = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
const r2 = n => Math.round(n * 100) / 100;

const JAAR = new Date().getFullYear();
let nextId = 100;

const store = {
  instellingen: [{ user_id: 'demo', startdatum: `${JAAR}-01-01`, urenbank_startsaldo: 0, uren_per_dag: 9, uren_per_week: 36,
    verval_wettelijk_maanden: 12, verval_bovenwettelijk_maanden: 60, waarschuw_dagen: 120 }],
  rooster: [{ id: 1, user_id: 'demo', geldig_vanaf: `${JAAR - 2}-01-01`, uren: [9, 9, 0, 9, 9, 0, 0] }],
  dag_afwijking: [],
  feestdag_afwijking: [],
  agenda_item: [
    { id: 2, user_id: 'demo', begin: `${JAAR}-03-09`, eind: `${JAAR}-03-13`, omschrijving: 'Planningssessie', soort: 'werksessie' },
    { id: 3, user_id: 'demo', begin: `${JAAR}-10-17`, eind: `${JAAR}-10-25`, omschrijving: 'Herfstvakantie school', soort: 'schoolvakantie' },
  ],
  week_uren: [],
  verlof_potje: [
    { id: 4, user_id: 'demo', soort: 'bovenwettelijk', opbouwjaar: JAAR - 1, uren: 30, correctie: 0, beschikbaar_vanaf: `${JAAR - 1}-01-01`, vervalt_op: null, prioriteit: 1, toelichting: 'Beginsaldo' },
    { id: 5, user_id: 'demo', soort: 'wettelijk', opbouwjaar: JAAR, uren: 144, correctie: 0, beschikbaar_vanaf: `${JAAR}-01-01`, vervalt_op: null, prioriteit: 2, toelichting: null },
    { id: 6, user_id: 'demo', soort: 'gekocht', opbouwjaar: JAAR, uren: 36, correctie: 0, beschikbaar_vanaf: `${JAAR}-02-01`, vervalt_op: null, prioriteit: 3, toelichting: 'Gekocht via IKB' },
    { id: 7, user_id: 'demo', soort: 'bovenwettelijk', opbouwjaar: JAAR, uren: 57.6, correctie: 0, beschikbaar_vanaf: `${JAAR}-01-01`, vervalt_op: null, prioriteit: 4, toelichting: null },
  ],
  verlof: [
    { id: 8, user_id: 'demo', begin: `${JAAR}-02-19`, eind: `${JAAR}-02-23`, omschrijving: 'Skiweek', bron: 'saldo', soort_overig: null, uren_handmatig: null, geboekt: true, geboekte_uren: 27 },
    { id: 9, user_id: 'demo', begin: `${JAAR}-05-28`, eind: `${JAAR}-05-29`, omschrijving: 'Lang weekend', bron: 'urenbank', soort_overig: null, uren_handmatig: null, geboekt: false, geboekte_uren: null },
    { id: 10, user_id: 'demo', begin: `${JAAR}-07-20`, eind: `${JAAR}-08-09`, omschrijving: 'Zomervakantie', bron: 'saldo', soort_overig: null, uren_handmatig: null, geboekt: true, geboekte_uren: 108 },
    { id: 11, user_id: 'demo', begin: `${JAAR}-12-21`, eind: `${JAAR}-12-31`, omschrijving: 'Kerstvakantie', bron: 'saldo', soort_overig: null, uren_handmatig: null, geboekt: false, geboekte_uren: null },
  ],
};

function paaszondag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const x = h + l - 7 * m + 114;
  return toIso(new Date(Date.UTC(j, Math.floor(x / 31) - 1, (x % 31) + 1)));
}

function landelijkeFeestdagen(j) {
  const p = paaszondag(j);
  const kd = isodow(`${j}-04-27`) === 7 ? `${j}-04-26` : `${j}-04-27`;
  return [[`${j}-01-01`, 'Nieuwjaarsdag'], [p, '1e Paasdag'], [addDays(p, 1), '2e Paasdag'], [kd, 'Koningsdag'],
    [`${j}-05-05`, 'Bevrijdingsdag'], [addDays(p, 39), 'Hemelvaartsdag'], [addDays(p, 49), '1e Pinksterdag'],
    [addDays(p, 50), '2e Pinksterdag'], [`${j}-12-25`, '1e Kerstdag'], [`${j}-12-26`, '2e Kerstdag']];
}

function dagen({ van, tot }) {
  const fd = new Map();
  for (let j = +van.slice(0, 4); j <= +tot.slice(0, 4); j++) {
    for (const [d, n] of landelijkeFeestdagen(j)) {
      if (!store.feestdag_afwijking.some(a => a.datum === d && !a.is_feestdag)) fd.set(d, n);
    }
  }
  for (const a of store.feestdag_afwijking) if (a.is_feestdag) fd.set(a.datum, a.naam);
  const roosters = [...store.rooster].sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf));
  const out = [];
  for (let d = van; d <= tot; d = addDays(d, 1)) {
    const dow = isodow(d);
    const afw = store.dag_afwijking.find(a => a.datum === d);
    const ro = roosters.find(r => r.geldig_vanaf <= d);
    const uren = afw ? afw.uren : ro ? ro.uren[dow - 1] : 0;
    const feest = fd.get(d) || null;
    const vl = store.verlof.filter(v => d >= v.begin && d <= v.eind).sort((a, b) => a.id - b.id)[0];
    const ag = store.agenda_item.filter(a => d >= a.begin && d <= a.eind).map(a => a.omschrijving).join(', ') || null;
    out.push({ datum: d, isodow: dow, rooster_uren: uren, feestdag: feest, norm_uren: feest ? 0 : uren,
      verlof_id: vl?.id ?? null, verlof_bron: vl?.bron ?? null, verlof_omschrijving: vl?.omschrijving ?? null, agenda: ag });
  }
  return out;
}

function weken(j) {
  const res = [];
  for (let d = `${j}-01-01`; d <= `${j}-12-31`; d = addDays(d, 1)) {
    if (!res.length || isodow(d) === 1) res.push({ weeknr: res.length + 1, van: d, tot: d });
    else res[res.length - 1].tot = d;
  }
  return res;
}

function weekoverzicht({ p_jaar = null } = {}) {
  const inst = store.instellingen[0];
  const vanJaar = +inst.startdatum.slice(0, 4);
  const totJaar = Math.max(JAAR, p_jaar || 0, ...store.week_uren.map(w => w.jaar));
  const rows = [];
  let cum = Number(inst.urenbank_startsaldo);
  for (let j = vanJaar; j <= totJaar; j++) {
    const dg = dagen({ van: `${j}-01-01`, tot: `${j}-12-31` });
    for (const w of weken(j)) {
      const ds = dg.filter(d => d.datum >= w.van && d.datum <= w.tot);
      const norm = ds.reduce((s, d) => s + d.norm_uren, 0);
      const wu = store.week_uren.find(x => x.jaar === j && x.weeknr === w.weeknr);
      const tt = wu ? Number(wu.timetell_uren) : null;
      if (tt != null && w.van >= inst.startdatum) cum += tt - norm;
      const uniq = k => [...new Set(ds.map(d => d[k]).filter(Boolean))].join(', ') || null;
      rows.push({ jaar: j, weeknr: w.weeknr, van: w.van, tot: w.tot, norm_uren: norm, timetell_uren: tt,
        verschil: tt == null ? null : r2(tt - norm), urenbank_cumulatief: tt == null ? null : r2(cum),
        feestdagen: uniq('feestdag'), verlof: uniq('verlof_omschrijving'), agenda: uniq('agenda'), notitie: wu?.notitie ?? null });
    }
  }
  return p_jaar ? rows.filter(r => r.jaar === p_jaar) : rows;
}

function verlofDetails() {
  if (!store.verlof.length) return [];
  const lo = addDays(store.verlof.reduce((m, v) => v.begin < m ? v.begin : m, '9999'), -31);
  const hi = addDays(store.verlof.reduce((m, v) => v.eind > m ? v.eind : m, '0000'), 31);
  const dg = dagen({ van: lo, tot: hi });
  const vrij = new Set(dg.filter(d => d.norm_uren === 0 || d.verlof_id != null).map(d => d.datum));
  const vandaag = toIso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  return [...store.verlof].sort((a, b) => a.begin.localeCompare(b.begin) || a.id - b.id).map(v => {
    const ds = dg.filter(d => d.datum >= v.begin && d.datum <= v.eind);
    const uren = ds.reduce((s, d) => s + d.norm_uren, 0);
    let van = v.begin, tot = v.begin;
    while (vrij.has(addDays(van, -1))) van = addDays(van, -1);
    while (vrij.has(addDays(tot, 1))) tot = addDays(tot, 1);
    const kosten = v.uren_handmatig ?? uren;
    return { ...v, werkdagen: ds.filter(d => d.norm_uren > 0).length, berekende_uren: uren, kosten_uren: kosten,
      verschil_geboekt: v.geboekt && v.geboekte_uren != null ? r2(v.geboekte_uren - kosten) : null,
      vrij_van: van, vrij_tot: tot, dagen_aansluitend_vrij: diffDays(van, tot) + 1,
      status: v.eind < vandaag ? 'voorbij' : v.begin <= vandaag ? 'lopend' : 'gepland' };
  });
}

function potjeSaldi({ incl_gepland = false } = {}) {
  const inst = store.instellingen[0];
  const potjes = [...store.verlof_potje].sort((a, b) => a.prioriteit - b.prioriteit || a.id - b.id).map(p => {
    const mnd = p.soort === 'wettelijk' ? inst.verval_wettelijk_maanden : inst.verval_bovenwettelijk_maanden;
    const verv = p.vervalt_op || toIso(new Date(Date.UTC(p.opbouwjaar + Math.floor(mnd / 12), 11 + (mnd % 12), 31)));
    const begin = Number(p.uren) + Number(p.correctie);
    return { potje_id: p.id, soort: p.soort, opbouwjaar: p.opbouwjaar, begin_uren: begin, opgenomen: 0, rest: begin,
      beschikbaar_vanaf: p.beschikbaar_vanaf, vervalt_op: verv, prioriteit: p.prioriteit };
  });
  let tekort = 0;
  for (const o of verlofDetails().filter(v => v.bron === 'saldo' && v.begin >= inst.startdatum && (v.geboekt || incl_gepland))) {
    let nodig = o.geboekt && o.geboekte_uren != null ? Number(o.geboekte_uren) : o.kosten_uren;
    for (const p of potjes) {
      if (nodig <= 0) break;
      if (p.beschikbaar_vanaf <= o.begin && p.vervalt_op >= o.begin && p.rest > 0) {
        const neem = Math.min(p.rest, nodig);
        p.rest = r2(p.rest - neem); p.opgenomen = r2(p.opgenomen + neem); nodig = r2(nodig - neem);
      }
    }
    tekort += Math.max(nodig, 0);
  }
  if (tekort > 0) potjes.push({ potje_id: null, soort: 'tekort', opbouwjaar: null, begin_uren: 0, opgenomen: tekort,
    rest: -tekort, beschikbaar_vanaf: null, vervalt_op: null, prioriteit: null });
  return potjes;
}

function samenvatting() {
  const inst = store.instellingen[0];
  const vandaag = new Date().toISOString().slice(0, 10);
  const geldig = p => (p.vervalt_op ?? '9999-12-31') >= vandaag;
  const nu = potjeSaldi({ incl_gepland: false });
  const plan = potjeSaldi({ incl_gepland: true });
  const saldo = r2(nu.filter(geldig).reduce((s, p) => s + p.rest, 0));
  const planSaldo = r2(plan.filter(geldig).reduce((s, p) => s + p.rest, 0));
  const wk = weekoverzicht().filter(w => w.timetell_uren != null);
  const ub = wk.length ? wk[wk.length - 1].urenbank_cumulatief : 0;
  const ingevuld = wk.length ? wk[wk.length - 1].tot : null;
  const ubPlan = verlofDetails().filter(v => v.bron === 'urenbank' && v.begin > (ingevuld || vandaag))
    .reduce((s, v) => s + v.kosten_uren, 0);
  return { verlof_saldo: saldo, verlof_vervallen: r2(nu.filter(p => !geldig(p) && p.rest > 0).reduce((s, p) => s + p.rest, 0)),
    verlof_gepland: r2(saldo - planSaldo), verlof_saldo_na_planning: planSaldo, urenbank: ub, urenbank_gepland: ubPlan,
    urenbank_na_planning: r2(ub - ubPlan), totaal: r2(saldo + ub), totaal_na_planning: r2(planSaldo + ub - ubPlan),
    weken_ingevuld_tot: ingevuld, uren_per_dag: inst.uren_per_dag, uren_per_week: inst.uren_per_week };
}

function nieuwJaar({ p_jaar }) {
  if (store.verlof_potje.some(p => p.opbouwjaar === p_jaar && p.soort !== 'gekocht')) throw new Error(`Er bestaan al potjes voor ${p_jaar}`);
  const max = Math.max(0, ...store.verlof_potje.map(p => p.prioriteit));
  const w = store.instellingen[0].uren_per_week;
  store.verlof_potje.push(
    { id: nextId++, user_id: 'demo', soort: 'wettelijk', opbouwjaar: p_jaar, uren: 4 * w, correctie: 0, beschikbaar_vanaf: `${p_jaar}-01-01`, vervalt_op: null, prioriteit: max + 1, toelichting: 'Toegevoegd via nieuw jaar' },
    { id: nextId++, user_id: 'demo', soort: 'bovenwettelijk', opbouwjaar: p_jaar, uren: r2(1.6 * w), correctie: 0, beschikbaar_vanaf: `${p_jaar}-01-01`, vervalt_op: null, prioriteit: max + 2, toelichting: 'Toegevoegd via nieuw jaar' });
  return null;
}

// Voorbeeld-weekuren tot vorige week
(() => {
  const vandaag = new Date().toISOString().slice(0, 10);
  const patroon = [0, 2, 4, 0, -2, 0, 6, 0, 2, -4];
  const wk = weken(JAAR);
  const dg = dagen({ van: `${JAAR}-01-01`, tot: `${JAAR}-12-31` });
  wk.filter(w => w.tot < vandaag).forEach((w, i) => {
    const ds = dg.filter(d => d.datum >= w.van && d.datum <= w.tot);
    const norm = ds.reduce((s, d) => s + d.norm_uren, 0);
    const ub = ds.filter(d => d.verlof_bron === 'urenbank').reduce((s, d) => s + d.norm_uren, 0);
    store.week_uren.push({ user_id: 'demo', jaar: JAAR, weeknr: w.weeknr, timetell_uren: Math.max(0, norm - ub + (norm ? patroon[i % patroon.length] : 0)), notitie: null });
  });
})();

const PK = { instellingen: ['user_id'], dag_afwijking: ['datum'], feestdag_afwijking: ['datum'], week_uren: ['jaar', 'weeknr'] };
const matches = (row, match) => Object.entries(match).every(([k, v]) => String(row[k]) === String(v));
const clone = x => JSON.parse(JSON.stringify(x));

export const demoApi = {
  demo: true,
  async session() { return { user: { id: 'demo', email: 'demo@voorbeeld.nl' } }; },
  onAuth() {},
  uid: () => 'demo',
  email: () => 'demo@voorbeeld.nl',
  async signIn() {},
  async signOut() { location.search = ''; },
  async rpc(fn, args = {}) {
    const f = { dagen, weekoverzicht, verlof_details: verlofDetails, potje_saldi: potjeSaldi, samenvatting, nieuw_jaar: nieuwJaar }[fn];
    if (!f) throw new Error(`Onbekende functie ${fn}`);
    return clone(f(args));
  },
  async list(table, { order, filter = {} } = {}) {
    let rows = store[table].filter(r => matches(r, filter));
    for (const o of [].concat(order || []).reverse()) rows = rows.sort((a, b) => String(a[o]).localeCompare(String(b[o]), 'nl', { numeric: true }));
    return clone(rows);
  },
  async insert(table, row) {
    const r = { user_id: 'demo', ...row };
    if (!PK[table]) r.id = nextId++;
    store[table].push(r);
    return clone(r);
  },
  async upsert(table, row) {
    const keys = PK[table] || ['id'];
    const i = store[table].findIndex(r => keys.every(k => String(r[k]) === String(row[k] ?? (k === 'user_id' ? 'demo' : undefined))));
    if (i >= 0) store[table][i] = { ...store[table][i], ...row };
    else store[table].push({ user_id: 'demo', ...row });
    return [clone(row)];
  },
  async update(table, match, patch) {
    store[table].filter(r => matches(r, match)).forEach(r => Object.assign(r, patch));
    return [];
  },
  async remove(table, match) {
    store[table] = store[table].filter(r => !matches(r, match));
    return [];
  },
};
