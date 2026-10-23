import { api } from './api.js';

/* ---------- hulpjes ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => (v == null || v === '' ? null : Number(v));
const fmt = (v, d = 2) => (v == null || isNaN(v) ? '–' : Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: d }));
const fmtU = v => (v == null || isNaN(v) ? '–' : Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtTeken = (v, f = fmt) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + f(Math.abs(v)));
const klasseTeken = v => (v > 0 ? 'plus' : v < 0 ? 'min' : '');
const pad = x => String(x).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const datum = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const plusDagen = (s, k) => { const d = datum(s); d.setDate(d.getDate() + k); return iso(d); };
const VANDAAG = iso(new Date());
const DIT_JAAR = new Date().getFullYear();
const dfKort = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const dfLang = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dfMaand = new Intl.DateTimeFormat('nl-NL', { month: 'long' });
const kort = s => dfKort.format(datum(s)).replace('.', '');
const jaarVan = s => +s.slice(0, 4);
const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const JAAR_MIN = 2000, JAAR_MAX = 2100;
const geldigJaar = j => (Number.isInteger(j) && j >= JAAR_MIN && j <= JAAR_MAX ? j : DIT_JAAR);

// Grenzen voor invoer: houdt onzin uit de database en geeft een begrijpelijke melding
function controleer(waarde, { min, max, naam, heel = false }) {
  if (waarde == null || Number.isNaN(waarde)) throw new Error(`Vul bij ${naam} een getal in.`);
  if (waarde < min || waarde > max) throw new Error(`${naam[0].toUpperCase()}${naam.slice(1)} moet tussen ${fmt(min)} en ${fmt(max)} liggen.`);
  if (heel && !Number.isInteger(waarde)) throw new Error(`Vul bij ${naam} een heel getal in.`);
  return waarde;
}

// Technische databasemeldingen omzetten naar gewone taal
function begrijpelijk(e) {
  const m = String(e?.message || e || '');
  if (/numeric field overflow/i.test(m)) return 'Dit getal is te groot. Controleer wat je hebt ingevuld.';
  if (/out of range|invalid input syntax|date/i.test(m) && /date|jaar|year/i.test(m)) return 'Deze datum of dit jaar kan niet. Controleer wat je hebt ingevuld.';
  if (/violates check constraint/i.test(m)) return 'Deze waarde kan niet. Controleer of de getallen en datums kloppen.';
  if (/duplicate key|already exists/i.test(m)) return 'Dit bestaat al.';
  if (/JWT|not authenticated|permission denied|row-level security/i.test(m)) return 'Je bent niet meer ingelogd. Ververs de pagina en log opnieuw in.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Geen verbinding. Controleer je internet en probeer het opnieuw.';
  return m || 'Er ging iets mis. Probeer het opnieuw.';
}

function periode(van, tot) {
  const sfx = s => (jaarVan(s) !== DIT_JAAR ? ` ${jaarVan(s)}` : '');
  if (van === tot) return kort(van) + sfx(van);
  const [dv, mv] = kort(van).split(' ');
  const [dt, mt] = kort(tot).split(' ');
  if (mv === mt && jaarVan(van) === jaarVan(tot)) return `${dv}–${dt} ${mt}${sfx(tot)}`;
  return `${kort(van)}${jaarVan(van) !== jaarVan(tot) ? sfx(van) : ''} – ${kort(tot)}${sfx(tot)}`;
}

const BRON = { saldo: 'Verlofsaldo', urenbank: 'Urenbank', overig: 'Overig verlof' };
const SOORT = { wettelijk: 'Wettelijk', bovenwettelijk: 'Bovenwettelijk', gekocht: 'Gekocht', tekort: 'Tekort' };
const potjeNaam = p => (p.soort === 'tekort' ? 'Tekort' : `${SOORT[p.soort]} ${p.opbouwjaar}`);

function melding(tekst, fout = false) {
  $('.melding')?.remove();
  const el = document.createElement('div');
  el.className = `melding${fout ? ' fout' : ''}`;
  el.setAttribute('role', fout ? 'alert' : 'status');
  el.textContent = tekst;
  document.body.append(el);
  setTimeout(() => el.remove(), fout ? 6000 : 2200);
}

async function bewaar(fn, ok = 'Opgeslagen') {
  try {
    await fn();
    if (ok) melding(ok);
    return true;
  } catch (e) {
    melding(begrijpelijk(e), true);
    return false;
  }
}

let instellingenCache = null;
async function instellingen() {
  if (!instellingenCache) {
    const rij = (await api.list('instellingen'))[0];
    instellingenCache = {
      startdatum: `${DIT_JAAR}-01-01`, urenbank_startsaldo: 0, uren_per_dag: 9, uren_per_week: 36,
      verval_wettelijk_maanden: 12, verval_bovenwettelijk_maanden: 60, waarschuw_dagen: 120, ...rij,
    };
  }
  return instellingenCache;
}

/* ---------- skelet en navigatie ---------- */
const VIEWS = [
  ['overzicht', 'Overzicht'],
  ['weken', 'Weken'],
  ['verlof', 'Verlof'],
  ['jaar', 'Jaarkaart'],
  ['instellingen', 'Instellingen'],
];

function skelet() {
  $('#app').innerHTML = `
    ${api.demo ? '<div class="demo-band">Demo met voorbeelddata. Wijzigingen worden niet bewaard.</div>' : ''}
    <header class="kop">
      <p class="merk">Uren<span>bank</span></p>
      <nav class="nav" aria-label="Hoofdmenu">
        ${VIEWS.map(([k, t]) => `<a href="#/${k}" data-view="${k}">${t}</a>`).join('')}
      </nav>
    </header>
    <main id="inhoud"></main>`;
}

async function router() {
  const [, view = 'overzicht', arg] = location.hash.split('/');
  const geldig = VIEWS.some(([k]) => k === view) ? view : 'overzicht';
  if (arg != null && geldigJaar(+arg) !== +arg) { location.hash = `#/${geldig}`; return; }
  $$('.nav a').forEach(a => (a.dataset.view === geldig ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const main = $('#inhoud');
  main.innerHTML = '<p class="laden">Gegevens ophalen…</p>';
  try {
    await ({ overzicht: toonOverzicht, weken: toonWeken, verlof: toonVerlof, jaar: toonJaar, instellingen: toonInstellingen })[geldig](main, arg);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="vlak" style="margin-top:2rem"><h2 style="margin-top:0">Dit scherm laadt niet</h2>
      <p>${esc(begrijpelijk(e))}</p><p class="muted">Lukt het daarna nog niet, laat dan de tekst hieronder zien aan wie de app beheert.</p>
      <p class="info">${esc(e.message)}</p>
      <button class="knop" onclick="location.reload()">Opnieuw laden</button></div>`;
  }
}

const herlaad = () => router();

/* ---------- overzicht ---------- */
const POTKLEUR = ['var(--saldo)', 'var(--saldo-2)', 'var(--gekocht)', 'var(--saldo-3)', 'var(--overig)'];

async function toonOverzicht(main) {
  const [s, potjes, potjesPlan, weken, verlof, inst] = await Promise.all([
    api.rpc('samenvatting', { p_peildatum: VANDAAG }),
    api.rpc('potje_saldi', { incl_gepland: false }),
    api.rpc('potje_saldi', { incl_gepland: true }),
    api.rpc('weekoverzicht', { p_jaar: DIT_JAAR }),
    api.rpc('verlof_details'),
    instellingen(),
  ]);
  const upd = n(s.uren_per_dag), upw = n(s.uren_per_week);
  // Alleen potjes die vandaag beschikbaar en niet vervallen zijn (potjes van volgend jaar pas vanaf 1 januari)
  const zichtbaar = p => p.soort === 'tekort' || (p.beschikbaar_vanaf <= VANDAAG && (p.vervalt_op ?? '9999') >= VANDAAG);
  const geldig = p => p.soort !== 'tekort' && zichtbaar(p);

  // Balk: potjes met rest + urenbank (positief)
  const segmenten = potjes.filter(p => geldig(p) && n(p.rest) > 0).map((p, i) => ({ naam: potjeNaam(p), uren: n(p.rest), kleur: POTKLEUR[i % POTKLEUR.length] }));
  if (n(s.urenbank) > 0) segmenten.push({ naam: 'Urenbank', uren: n(s.urenbank), kleur: 'var(--bank)' });
  const totaalBalk = segmenten.reduce((a, b) => a + b.uren, 0) || 1;

  const deze = weken.find(w => w.van <= VANDAAG && w.tot >= VANDAAG);
  const gepland = verlof.filter(v => v.status !== 'voorbij' && v.bron !== 'overig');
  const signalen = maakSignalen({ s, potjesPlan, weken, verlof, inst });

  main.innerHTML = `
    <section class="stand" aria-labelledby="stand-label">
      <p class="stand-label" id="stand-label">Vrij op te nemen per vandaag</p>
      <p class="stand-getal num">${fmtU(s.totaal)}<small>uur</small></p>
      <p class="stand-om">Dat is <strong>${fmt(s.totaal / upd, 1)} werkdagen</strong> van ${fmt(upd)} uur, of <strong>${fmt(s.totaal / upw, 1)} werkweken</strong> van ${fmt(upw)} uur.
        Opgebouwd uit ${fmtU(s.verlof_saldo)} uur verlofsaldo (zoals bij P&amp;O) en ${fmtTeken(n(s.urenbank), fmtU)} uur op je urenbank ${esc(s.urenbank_jaar)}.</p>
      <div class="balk" role="img" aria-label="${esc(`Verdeling: ${segmenten.map(x => `${x.naam} ${fmtU(x.uren)} uur`).join(', ')}`)}">
        ${segmenten.map(x => `<div style="flex:${x.uren / totaalBalk};background:${x.kleur}" title="${esc(x.naam)}: ${fmtU(x.uren)} uur"></div>`).join('')}
      </div>
      <ul class="legenda">
        ${segmenten.map(x => `<li><span class="stip" style="background:${x.kleur}"></span>${esc(x.naam)} <span class="num">${fmtU(x.uren)}</span></li>`).join('')}
      </ul>
      <div class="plan">
        <p>Na al je geplande verlof: <strong class="num">${fmtU(s.totaal_na_planning)} uur</strong>
          <span class="muted">(${fmtU(s.verlof_saldo_na_planning)} verlofsaldo, ${fmtU(s.urenbank_na_planning)} urenbank)</span></p>
        ${gepland.length ? `<ul>${gepland.map(v => `<li>${esc(v.omschrijving)}, ${periode(v.begin, v.eind)}: ${fmtU(v.kosten_uren)} uur van ${BRON[v.bron].toLowerCase()}${v.bron === 'saldo' && !v.geboekt ? ', nog niet geboekt bij P&amp;O' : ''}</li>`).join('')}</ul>` : '<p class="muted">Je hebt geen verlof gepland.</p>'}
      </div>
    </section>

    <div class="twee">
      <section class="vlak" aria-labelledby="week-kop">
        <h3 id="week-kop">${deze ? `Deze week, week ${deze.weeknr} (${periode(deze.van, deze.tot)})` : 'Deze week'}</h3>
        ${deze ? `
        <div class="week-invoer">
          <label class="veld"><span>Geschreven in Timetell</span>
            <input class="tt-invoer getal num" id="deze-week" type="number" inputmode="decimal" step="0.25" min="0" value="${deze.timetell_uren ?? ''}"></label>
          <div><span class="muted">Norm</span><br><span class="num" style="font-size:1.6rem">${fmt(deze.norm_uren)}</span></div>
          <div><span class="muted">Verschil</span><br><span class="num ${klasseTeken(n(deze.verschil))}" style="font-size:1.6rem">${deze.verschil == null ? '–' : fmtTeken(n(deze.verschil))}</span></div>
        </div>
        ${deze.feestdagen || deze.verlof ? `<p class="info">${[deze.feestdagen, deze.verlof].filter(Boolean).map(esc).join(', ')}</p>` : ''}` : '<p class="muted">Geen week gevonden.</p>'}
      </section>
      <section class="vlak" aria-labelledby="sig-kop">
        <h3 id="sig-kop" style="margin-bottom:0.75rem">Let op</h3>
        ${signalen.length ? `<ul class="signalen">${signalen.map(([k, t]) => `<li class="${k}">${t}</li>`).join('')}</ul>` : '<ul class="signalen"><li class="goed">Alles is bijgewerkt en geboekt.</li></ul>'}
      </section>
    </div>

    <h2>Verlofsaldo per potje</h2>
    ${potjesTabel(potjes.filter(zichtbaar), potjesPlan, s)}
    <p class="info">De volgorde van afschrijven en de vervaldatums stel je in bij Instellingen. Geboekt verlof gaat eraf, ook als het in de toekomst ligt; gepland verlof zie je in de laatste kolom.</p>`;

  $('#deze-week')?.addEventListener('change', async e => {
    const v = n(e.target.value);
    const ok = await bewaar(() => (v != null && controleer(v, { min: 0, max: 100, naam: 'de weekuren' }), v == null
      ? api.remove('week_uren', { jaar: DIT_JAAR, weeknr: deze.weeknr })
      : api.upsert('week_uren', { jaar: DIT_JAAR, weeknr: deze.weeknr, timetell_uren: v })));
    if (ok) herlaad();
  });
}

function potjesTabel(potjes, plan, s) {
  const restPlan = id => plan.find(p => p.potje_id === id)?.rest;
  const echt = potjes.filter(p => p.soort !== 'tekort');
  const tekortNu = n(s.verlof_tekort) || 0;
  const tekortPlan = plan.find(p => p.soort === 'tekort');
  const som = k => echt.reduce((a, p) => a + n(p[k]), 0);
  return `<div class="tabel-wrap"><table>
    <thead><tr><th>Soort</th><th class="r">Begin</th><th class="r">Opgenomen</th><th class="r">Rest</th><th>Vervalt</th><th class="r">Rest na planning</th></tr></thead>
    <tbody>${echt.map(p => `<tr>
      <td>${esc(potjeNaam(p))}</td>
      <td class="r num">${fmtU(p.begin_uren)}</td>
      <td class="r num">${fmtU(p.opgenomen)}</td>
      <td class="r num"><strong>${fmtU(p.rest)}</strong></td>
      <td>${p.vervalt_op ? `${kort(p.vervalt_op)} ${jaarVan(p.vervalt_op)}` : ''}</td>
      <td class="r num">${fmtU(restPlan(p.potje_id))}</td></tr>`).join('')}
      ${tekortNu || tekortPlan ? `<tr><td class="min">Tekort</td><td></td><td></td><td class="r num min">${tekortNu ? fmtU(-tekortNu) : ''}</td><td></td><td class="r num min">${tekortPlan ? fmtU(tekortPlan.rest) : ''}</td></tr>` : ''}
    </tbody>
    <tfoot><tr><td>Totaal</td><td class="r num">${fmtU(som('begin_uren'))}</td><td class="r num">${fmtU(som('opgenomen'))}</td><td class="r num">${fmtU(n(s.verlof_saldo) - tekortNu)}</td><td></td><td class="r num">${fmtU(s.verlof_saldo_na_planning)}</td></tr></tfoot>
  </table></div>`;
}

function maakSignalen({ s, potjesPlan, weken, verlof, inst }) {
  const uit = [];
  const horizon = plusDagen(VANDAAG, 60);
  for (const v of verlof) {
    if (v.bron === 'saldo' && !v.geboekt && v.begin <= horizon) {
      uit.push([v.begin < VANDAAG ? 'fout' : 'let-op', `<span><strong>${esc(v.omschrijving)}</strong> (${periode(v.begin, v.eind)}) is nog niet geboekt bij P&amp;O. Boek ${fmtU(v.kosten_uren)} uur.</span>`]);
    }
    if (v.geboekt && v.verschil_geboekt != null && Math.abs(n(v.verschil_geboekt)) >= 0.5) {
      uit.push(['let-op', `<span><strong>${esc(v.omschrijving)}</strong>: geboekt ${fmtU(v.geboekte_uren)} uur, berekend ${fmtU(v.kosten_uren)} uur.</span>`]);
    }
  }
  const open = weken.filter(w => w.tot < VANDAAG && w.van >= inst.startdatum && w.timetell_uren == null);
  if (open.length) uit.push(['let-op', `<span>${open.length === 1 ? 'Week' : `${open.length} weken`} zonder Timetell-uren: ${open.slice(0, 6).map(w => `week ${w.weeknr}`).join(', ')}${open.length > 6 ? ' en meer' : ''}.</span>`]);
  const grens = plusDagen(VANDAAG, inst.waarschuw_dagen);
  for (const p of potjesPlan) {
    if (p.soort !== 'tekort' && n(p.rest) > 0 && p.vervalt_op && p.vervalt_op >= VANDAAG && p.vervalt_op <= grens) {
      uit.push(['fout', `<span>${fmtU(p.rest)} uur ${esc(potjeNaam(p).toLowerCase())} vervalt op ${kort(p.vervalt_op)} ${jaarVan(p.vervalt_op)}, ook na je planning. Plan dit verlof in.</span>`]);
    }
  }
  const tekort = potjesPlan.find(p => p.soort === 'tekort');
  if (tekort) uit.push(['fout', `<span>Je plant ${fmtU(tekort.opgenomen)} uur meer verlof dan je saldo toelaat.</span>`]);
  const ub = n(s.urenbank);
  if (ub !== 0 && new Date().getMonth() >= 10) {
    uit.push(['let-op', `<span>Je urenbank ${esc(s.urenbank_jaar)} staat op ${fmtTeken(ub, fmtU)} uur. Zorg dat hij op 31 december op 0 staat: ${ub > 0 ? `neem nog ${fmtU(ub)} uur vrij of schrijf minder` : `werk nog ${fmtU(-ub)} uur extra`}.</span>`]);
  } else if (ub < 0) {
    uit.push(['let-op', `<span>Je urenbank staat op ${fmtTeken(ub, fmtU)} uur: je hebt minder geschreven dan je norm.</span>`]);
  }
  const dubbel = verlof.filter(v => v.overlapt_met && v.status !== 'voorbij');
  for (const v of dubbel.filter((v, i) => !dubbel.slice(0, i).some(x => (x.overlapt_met || '').split(', ').includes(v.omschrijving)))) {
    uit.push(['fout', `<span>Dubbel verlof: <strong>${esc(v.omschrijving)}</strong> valt over <strong>${esc(v.overlapt_met)}</strong>. Controleer of dit niet dubbel is ingevoerd.</span>`]);
  }
  if (n(s.verlof_vervallen) > 0) uit.push(['fout', `<span>${fmtU(s.verlof_vervallen)} uur verlof is vervallen.</span>`]);
  return uit;
}

/* ---------- weken ---------- */
async function toonWeken(main, arg) {
  const jaar = geldigJaar(+arg || DIT_JAAR);
  const [weken, dagen, afw, inst] = await Promise.all([
    api.rpc('weekoverzicht', { p_jaar: jaar }),
    api.rpc('dagen', { van: `${jaar}-01-01`, tot: `${jaar}-12-31` }),
    api.list('dag_afwijking'),
    instellingen(),
  ]);
  const afwSet = new Set(afw.map(a => a.datum));
  const gevuld = weken.filter(w => w.timetell_uren != null && w.van >= inst.startdatum);
  const som = k => gevuld.reduce((a, w) => a + n(w[k]), 0);
  const laatste = gevuld[gevuld.length - 1];

  main.innerHTML = `
    <div class="rij tussen" style="margin:1.5rem 0 1rem">
      <div class="jaarwissel">
        <a class="knop licht klein" href="#/weken/${jaar - 1}" aria-label="Vorig jaar">‹</a>
        <strong>${jaar}</strong>
        <a class="knop licht klein" href="#/weken/${jaar + 1}" aria-label="Volgend jaar">›</a>
      </div>
      <p class="muted" style="margin:0">Urenbank eind laatst ingevulde week: <strong class="num ${klasseTeken(n(laatste?.urenbank_cumulatief))}">${laatste ? fmtTeken(n(laatste.urenbank_cumulatief)) : '–'}</strong></p>
    </div>
    <p class="info" style="margin-top:0">Vul per week de uren in die je in Timetell hebt geschreven: gewerkt plus verlof dat je bij P&amp;O boekt. Verlof uit je urenbank schrijf je niet. Open een week om je rooster per dag aan te passen, bijvoorbeeld als je je vrije dag schuift.</p>
    <div class="tabel-wrap">
      <table class="weken-tabel">
        <thead><tr><th>Week</th><th>Periode</th><th class="r norm-kol">Norm</th><th class="r">Timetell</th><th class="r">Verschil</th><th class="r">Urenbank</th><th class="bijz">Bijzonderheden</th></tr></thead>
        <tbody>
          ${weken.map(w => {
            const huidig = w.van <= VANDAAG && w.tot >= VANDAAG;
            const toekomst = w.van > VANDAAG;
            const bijz = [w.feestdagen && `<span class="chip feest">${esc(w.feestdagen)}</span>`, w.verlof && esc(w.verlof), w.agenda && `<span class="muted">${esc(w.agenda)}</span>`].filter(Boolean).join(' ');
            return `<tr class="${huidig ? 'huidig' : toekomst ? 'toekomst' : ''}" data-week="${w.weeknr}" ${huidig ? 'id="huidige-week"' : ''}>
              <td><button class="knop-tekst" data-open="${w.weeknr}" aria-expanded="false" aria-label="Dagen van week ${w.weeknr} tonen">${w.weeknr}</button></td>
              <td class="periode">${periode(w.van, w.tot)}<div class="info alleen-mobiel">norm ${fmt(w.norm_uren)}${bijz ? `, ${bijz}` : ''}</div></td>
              <td class="r num norm-kol">${fmt(w.norm_uren)}</td>
              <td class="r"><input class="tt-invoer num" type="number" inputmode="decimal" step="0.25" min="0" value="${w.timetell_uren ?? ''}" aria-label="Timetell-uren week ${w.weeknr}" data-tt="${w.weeknr}"></td>
              <td class="r num ${klasseTeken(n(w.verschil))}">${w.verschil == null ? '' : fmtTeken(n(w.verschil))}</td>
              <td class="r num ${klasseTeken(n(w.urenbank_cumulatief))}">${w.urenbank_cumulatief == null ? '' : fmtTeken(n(w.urenbank_cumulatief))}</td>
              <td class="info bijz">${bijz}</td></tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr><td colspan="2">Ingevuld (${gevuld.length})</td><td class="r num norm-kol">${fmt(som('norm_uren'))}</td><td class="r num">${fmt(som('timetell_uren'))}</td><td class="r num ${klasseTeken(som('verschil'))}">${fmtTeken(som('verschil'))}</td><td></td><td class="bijz"></td></tr></tfoot>
      </table>
    </div>`;

  $$('[data-tt]', main).forEach(inp => inp.addEventListener('change', async () => {
    const weeknr = +inp.dataset.tt, v = n(inp.value);
    const ok = await bewaar(() => (v != null && controleer(v, { min: 0, max: 100, naam: 'de weekuren' }), v == null
      ? api.remove('week_uren', { jaar, weeknr })
      : api.upsert('week_uren', { jaar, weeknr, timetell_uren: v })));
    if (ok) { const y = scrollY; await toonWeken(main, jaar); scrollTo(0, y); }
  }));

  $$('[data-open]', main).forEach(knop => knop.addEventListener('click', () => {
    const tr = knop.closest('tr');
    const bestaand = tr.nextElementSibling?.classList.contains('dagen-rij') ? tr.nextElementSibling : null;
    if (bestaand) { bestaand.remove(); knop.setAttribute('aria-expanded', 'false'); return; }
    const w = weken.find(x => x.weeknr === +knop.dataset.open);
    const ds = dagen.filter(d => d.datum >= w.van && d.datum <= w.tot);
    const rij = document.createElement('tr');
    rij.className = 'dagen-rij';
    rij.innerHTML = `<td colspan="7"><div class="week-dagen">${ds.map(d => `
      <div class="week-dag ${afwSet.has(d.datum) ? 'afwijkend' : ''}">
        <strong>${DAGNAMEN[d.isodow - 1]} ${kort(d.datum)}</strong>
        ${d.feestdag ? `<div class="chip feest">${esc(d.feestdag)}</div>` : ''}
        ${d.verlof_omschrijving ? `<div class="info">${esc(d.verlof_omschrijving)}</div>` : ''}
        <label><span class="info">Rooster</span><input class="tt-invoer num" type="number" step="0.25" min="0" max="24" value="${n(d.rooster_uren)}" data-dag="${d.datum}" aria-label="Roosteruren ${dfLang.format(datum(d.datum))}"></label>
        ${afwSet.has(d.datum) ? `<button class="knop-tekst" data-herstel="${d.datum}">Standaard</button>` : ''}
      </div>`).join('')}</div></td>`;
    tr.after(rij);
    knop.setAttribute('aria-expanded', 'true');
    $$('[data-dag]', rij).forEach(inp => inp.addEventListener('change', async () => {
      const v = n(inp.value) ?? 0;
      const ok = await bewaar(() => controleer(v, { min: 0, max: 24, naam: 'de uren per dag' }) != null && api.upsert('dag_afwijking', { datum: inp.dataset.dag, uren: v, toelichting: 'Aangepast in weekoverzicht' }));
      if (ok) { const y = scrollY; await toonWeken(main, jaar); scrollTo(0, y); $(`[data-open="${w.weeknr}"]`, main)?.click(); }
    }));
    $$('[data-herstel]', rij).forEach(b => b.addEventListener('click', async () => {
      const ok = await bewaar(() => api.remove('dag_afwijking', { datum: b.dataset.herstel }), 'Standaardrooster hersteld');
      if (ok) { const y = scrollY; await toonWeken(main, jaar); scrollTo(0, y); $(`[data-open="${w.weeknr}"]`, main)?.click(); }
    }));
  }));

  if (jaar === DIT_JAAR && !toonWeken.gescrold) {
    toonWeken.gescrold = true;
    $('#huidige-week', main)?.scrollIntoView({ block: 'center' });
  }
}

/* ---------- verlof ---------- */
async function toonVerlof(main, arg) {
  const jaar = geldigJaar(+arg || DIT_JAAR);
  const alles = await api.rpc('verlof_details');
  const lijst = alles.filter(v => jaarVan(v.begin) === jaar || jaarVan(v.eind) === jaar);
  const som = b => lijst.filter(v => v.bron === b).reduce((a, v) => a + n(v.kosten_uren), 0);

  main.innerHTML = `
    <div class="rij tussen" style="margin:1.5rem 0 1rem">
      <div class="jaarwissel">
        <a class="knop licht klein" href="#/verlof/${jaar - 1}" aria-label="Vorig jaar">‹</a>
        <strong>${jaar}</strong>
        <a class="knop licht klein" href="#/verlof/${jaar + 1}" aria-label="Volgend jaar">›</a>
      </div>
      <button class="knop" id="nieuw-verlof">Verlof plannen</button>
    </div>
    <ul class="legenda" style="margin-bottom:1rem">
      <li><span class="stip" style="background:var(--saldo)"></span>Uit verlofsaldo <span class="num">${fmt(som('saldo'))} uur</span></li>
      <li><span class="stip" style="background:var(--bank)"></span>Uit urenbank <span class="num">${fmt(som('urenbank'))} uur</span></li>
      <li><span class="stip" style="background:var(--overig)"></span>Overig verlof <span class="num">${fmt(som('overig'))} uur</span></li>
      <li class="muted">Totaal ${jaar}, inclusief gepland</li>
    </ul>
    ${lijst.length ? `<ul class="verlof-lijst">${lijst.map(verlofItem).join('')}</ul>` : `<div class="vlak leeg-staat">Nog geen verlof in ${jaar}. Plan je eerste vrije dag met de knop hierboven.</div>`}`;

  $('#nieuw-verlof').addEventListener('click', () => verlofFormulier(null, jaar));
  $$('[data-bewerk]', main).forEach(b => b.addEventListener('click', () => verlofFormulier(alles.find(v => v.id === +b.dataset.bewerk), jaar)));
  $$('[data-geboekt]', main).forEach(b => b.addEventListener('click', async () => {
    const v = alles.find(x => x.id === +b.dataset.geboekt);
    const ok = await bewaar(() => api.update('verlof', { id: v.id }, { geboekt: true, geboekte_uren: n(v.kosten_uren) }), 'Gemarkeerd als geboekt');
    if (ok) toonVerlof(main, jaar);
  }));
}

function verlofItem(v) {
  const kleur = { saldo: 'var(--saldo)', urenbank: 'var(--bank)', overig: 'var(--overig)' }[v.bron];
  const boekStatus = v.bron === 'urenbank'
    ? '<span class="muted">Niet boeken bij P&amp;O, minder schrijven in Timetell</span>'
    : v.geboekt
      ? `<span class="chip ja">Geboekt bij P&amp;O${v.geboekte_uren != null ? `: ${fmtU(v.geboekte_uren)} uur` : ''}</span>`
      : `<span class="chip nee">Nog niet geboekt</span> <button class="knop-tekst" data-geboekt="${v.id}">Markeer als geboekt</button>`;
  return `<li class="verlof-item ${v.status}">
    <div class="kleur" style="background:${kleur}"></div>
    <div class="inhoud">
      <h3>${esc(v.omschrijving)}</h3>
      <div class="feiten">
        <span>${periode(v.begin, v.eind)}</span>
        <span>${v.werkdagen} ${v.werkdagen === 1 ? 'werkdag' : 'werkdagen'}</span>
        <span>${v.dagen_aansluitend_vrij} dagen aaneengesloten vrij (${periode(v.vrij_van, v.vrij_tot)})</span>
      </div>
      ${v.overlapt_met ? `<p class="fout-tekst" style="margin:0">Valt over: ${esc(v.overlapt_met)}. Controleer of dit niet dubbel is ingevoerd.</p>` : ''}
      <div class="rij" style="gap:0.5rem"><span class="chip ${esc(v.bron)}">${v.bron === 'overig' && v.soort_overig ? esc(v.soort_overig) : BRON[v.bron]}</span>${boekStatus}</div>
    </div>
    <div class="kosten">
      <span class="num">${fmtU(v.kosten_uren)}</span><span class="muted">uur${v.uren_handmatig != null && n(v.uren_handmatig) !== n(v.berekende_uren) ? ` (rooster: ${fmtU(v.berekende_uren)})` : ''}</span>
      <div><button class="knop-tekst" data-bewerk="${v.id}">Bewerken</button></div>
    </div>
  </li>`;
}

function verlofFormulier(v, jaar) {
  const nieuw = !v;
  v = v || { begin: '', eind: '', omschrijving: '', bron: 'saldo', soort_overig: '', uren_handmatig: null, geboekt: false, geboekte_uren: null };
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" novalidate>
    <h2 style="margin:0">${nieuw ? 'Verlof plannen' : 'Verlof bewerken'}</h2>
    <label class="veld"><span>Waarvoor</span><input name="omschrijving" required maxlength="120" value="${esc(v.omschrijving)}" placeholder="Bijvoorbeeld: Zomervakantie Frankrijk"></label>
    <div class="velden">
      <label class="veld"><span>Eerste dag</span><input type="date" name="begin" required value="${v.begin}"></label>
      <label class="veld"><span>Laatste dag</span><input type="date" name="eind" required value="${v.eind}"></label>
    </div>
    <label class="veld"><span>Betalen uit</span>
      <select name="bron">
        <option value="saldo" ${v.bron === 'saldo' ? 'selected' : ''}>Verlofsaldo (boeken bij P&amp;O)</option>
        <option value="urenbank" ${v.bron === 'urenbank' ? 'selected' : ''}>Urenbank (minder schrijven)</option>
        <option value="overig" ${v.bron === 'overig' ? 'selected' : ''}>Overig verlof (telt niet mee)</option>
      </select></label>
    <label class="veld" data-alleen="overig"><span>Soort verlof</span><input name="soort_overig" value="${esc(v.soort_overig)}" placeholder="Bijvoorbeeld: Verlof bij overlijden"></label>
    <div class="voorvertoning" id="voorvertoning">Kies de data om te zien hoeveel uur dit kost.</div>
    <label class="veld"><span>Afwijkend aantal uren</span><input type="number" name="uren_handmatig" step="0.25" min="0" inputmode="decimal" value="${v.uren_handmatig ?? ''}"><small>Alleen invullen als je een deel van een dag vrij bent of toch werkt.</small></label>
    <div data-niet="urenbank" style="display:grid;gap:0.75rem">
      <label class="vink"><input type="checkbox" name="geboekt" ${v.geboekt ? 'checked' : ''}> Geboekt bij P&amp;O</label>
      <label class="veld" data-geboekt-veld><span>Geboekte uren</span><input type="number" name="geboekte_uren" step="0.01" min="0" inputmode="decimal" value="${v.geboekte_uren ?? ''}"></label>
    </div>
    <p class="fout-tekst" id="formfout" role="alert"></p>
    <div class="rij tussen">
      ${nieuw ? '<span></span>' : '<button type="button" class="knop gevaar" id="verwijder">Verwijderen</button>'}
      <div class="rij"><button type="button" class="knop licht" id="annuleer">Annuleren</button><button class="knop" value="bewaar">${nieuw ? 'Verlof opslaan' : 'Wijzigingen opslaan'}</button></div>
    </div>
  </form>`;
  document.body.append(dlg);
  const f = $('form', dlg);
  let berekend = null;
  let bestaand = [];
  let dubbelBevestigd = false;
  const overlap = () => bestaand.filter(x => x.id !== v.id && f.begin.value && f.eind.value && x.begin <= f.eind.value && x.eind >= f.begin.value);
  const opslaanKnop = $('button[value=bewaar]', f);
  const opslaanTekst = opslaanKnop.textContent;
  api.list('verlof').then(r => { bestaand = r; voorvertoning(); })
    .catch(e => { $('#formfout', f).textContent = `Controle op dubbel verlof lukt niet: ${begrijpelijk(e)}`; });

  const zichtbaarheid = () => {
    const bron = f.bron.value;
    $('[data-alleen="overig"]', f).classList.toggle('verborgen', bron !== 'overig');
    $('[data-niet="urenbank"]', f).classList.toggle('verborgen', bron === 'urenbank');
    $('[data-geboekt-veld]', f).classList.toggle('verborgen', !f.geboekt.checked);
  };
  const voorvertoning = async () => {
    const vv = $('#voorvertoning', f);
    if (!f.begin.value || !f.eind.value || f.eind.value < f.begin.value) { vv.textContent = 'Kies de data om te zien hoeveel uur dit kost.'; berekend = null; return; }
    dubbelBevestigd = false;
    opslaanKnop.textContent = opslaanTekst;
    $('#formfout', f).textContent = '';
    let ds;
    try {
      ds = await api.rpc('dagen', { van: f.begin.value, tot: f.eind.value });
    } catch (e) {
      vv.textContent = `Kosten berekenen lukt niet: ${begrijpelijk(e)}`;
      berekend = null;
      return;
    }
    const werk = ds.filter(d => n(d.norm_uren) > 0);
    berekend = werk.reduce((a, d) => a + n(d.norm_uren), 0);
    const feest = ds.filter(d => d.feestdag && n(d.rooster_uren) > 0).map(d => d.feestdag);
    const dubbel = overlap();
    vv.innerHTML = `Volgens je rooster kost dit <strong>${fmtU(berekend)} uur</strong> (${werk.length} ${werk.length === 1 ? 'werkdag' : 'werkdagen'}: ${werk.map(d => `${DAGNAMEN[d.isodow - 1]} ${kort(d.datum)}`).join(', ') || 'geen'}).${feest.length ? ` Feestdag${feest.length > 1 ? 'en' : ''} op een werkdag: ${feest.map(esc).join(', ')}.` : ''}${dubbel.length ? `<p class="fout-tekst" style="margin:0.5rem 0 0">Let op: je hebt in deze periode al verlof: ${dubbel.map(x => `${esc(x.omschrijving)} (${periode(x.begin, x.eind)})`).join(', ')}. Dubbel verlof gaat twee keer van je saldo af.</p>` : ''}`;
    if (f.geboekt.checked && !f.geboekte_uren.value) f.geboekte_uren.placeholder = fmtU(n(f.uren_handmatig.value) ?? berekend);
  };
  f.bron.addEventListener('change', zichtbaarheid);
  f.geboekt.addEventListener('change', () => {
    zichtbaarheid();
    if (f.geboekt.checked && !f.geboekte_uren.value) f.geboekte_uren.value = n(f.uren_handmatig.value) ?? berekend ?? '';
  });
  f.begin.addEventListener('change', () => { if (!f.eind.value || f.eind.value < f.begin.value) f.eind.value = f.begin.value; voorvertoning(); });
  f.eind.addEventListener('change', voorvertoning);
  zichtbaarheid();
  voorvertoning();

  const sluit = () => { dlg.close(); dlg.remove(); };
  $('#annuleer', f).addEventListener('click', sluit);
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  $('#verwijder', f)?.addEventListener('click', async () => {
    if (!confirm(`"${v.omschrijving}" verwijderen?`)) return;
    if (await bewaar(() => api.remove('verlof', { id: v.id }), 'Verlof verwijderd')) { sluit(); toonVerlof($('#inhoud'), jaar); }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const fout = $('#formfout', f);
    if (!f.omschrijving.value.trim()) return (fout.textContent = 'Vul in waarvoor het verlof is.');
    if (!f.begin.value || !f.eind.value) return (fout.textContent = 'Vul de eerste en laatste dag in.');
    if (f.eind.value < f.begin.value) return (fout.textContent = 'De laatste dag ligt voor de eerste dag.');
    if (jaarVan(f.begin.value) < JAAR_MIN || jaarVan(f.eind.value) > JAAR_MAX) return (fout.textContent = `Kies datums tussen ${JAAR_MIN} en ${JAAR_MAX}.`);
    for (const [veld, naam] of [['uren_handmatig', 'het afwijkende aantal uren'], ['geboekte_uren', 'de geboekte uren']]) {
      if (f[veld].value !== '' && (Number(f[veld].value) < 0 || Number(f[veld].value) > 2000)) return (fout.textContent = `${naam[0].toUpperCase()}${naam.slice(1)} moet tussen 0 en 2.000 liggen.`);
    }
    const dubbel = overlap();
    if (dubbel.length && !dubbelBevestigd) {
      dubbelBevestigd = true;
      opslaanKnop.textContent = 'Toch opslaan';
      fout.textContent = `Je staat op het punt dubbel verlof te boeken: dit valt over ${dubbel.map(x => `${x.omschrijving} (${periode(x.begin, x.eind)})`).join(', ')}. Klik nog een keer om toch op te slaan.`;
      return;
    }
    const bron = f.bron.value;
    const rij = {
      omschrijving: f.omschrijving.value.trim(), begin: f.begin.value, eind: f.eind.value, bron,
      soort_overig: bron === 'overig' ? f.soort_overig.value.trim() || null : null,
      uren_handmatig: n(f.uren_handmatig.value),
      geboekt: bron !== 'urenbank' && f.geboekt.checked,
      geboekte_uren: bron !== 'urenbank' && f.geboekt.checked ? n(f.geboekte_uren.value) : null,
    };
    const ok = await bewaar(() => (nieuw ? api.insert('verlof', rij) : api.update('verlof', { id: v.id }, rij)), nieuw ? 'Verlof opgeslagen' : 'Wijzigingen opgeslagen');
    if (ok) { sluit(); toonVerlof($('#inhoud'), jaarVan(rij.begin)); location.hash = `#/verlof/${jaarVan(rij.begin)}`; }
  });
  dlg.showModal();
  f.omschrijving.focus();
}

/* ---------- jaarkaart ---------- */
async function toonJaar(main, arg) {
  const jaar = geldigJaar(+arg || DIT_JAAR);
  const dagen = await api.rpc('dagen', { van: `${jaar}-01-01`, tot: `${jaar}-12-31` });
  const verlof = await api.rpc('verlof_details');
  const status = new Map(verlof.map(v => [v.id, v]));
  const perMaand = Array.from({ length: 12 }, () => []);
  dagen.forEach(d => perMaand[+d.datum.slice(5, 7) - 1].push(d));

  const klasse = d => {
    const k = ['dag'];
    if (d.verlof_bron) {
      k.push(`v-${d.verlof_bron}`);
      const v = status.get(d.verlof_id);
      if (v && v.bron === 'saldo' && !v.geboekt) k.push('zacht');
    } else if (d.feestdag && n(d.rooster_uren) > 0) k.push('feest');
    else if (d.isodow >= 6) k.push('weekend');
    else if (n(d.norm_uren) === 0) k.push('vrij');
    if (d.feestdag && d.verlof_bron) k.push('feest-ook');
    if (d.agenda) k.push('agenda');
    if (d.datum === VANDAAG) k.push('vandaag');
    return k.join(' ');
  };
  const label = d => [dfLang.format(datum(d.datum)), d.feestdag, d.verlof_omschrijving, d.agenda,
    !d.feestdag && !d.verlof_omschrijving && n(d.norm_uren) > 0 ? `${fmt(d.norm_uren)} uur werken` : '',
    !d.feestdag && !d.verlof_omschrijving && n(d.norm_uren) === 0 && d.isodow < 6 ? 'vaste vrije dag' : ''].filter(Boolean).join(', ');

  main.innerHTML = `
    <div class="rij tussen" style="margin:1.5rem 0 1rem">
      <div class="jaarwissel">
        <a class="knop licht klein" href="#/jaar/${jaar - 1}" aria-label="Vorig jaar">‹</a>
        <strong>${jaar}</strong>
        <a class="knop licht klein" href="#/jaar/${jaar + 1}" aria-label="Volgend jaar">›</a>
      </div>
      <button class="knop licht" id="plan-hier">Verlof plannen</button>
    </div>
    <ul class="legenda" style="margin-bottom:1.25rem">
      <li><span class="stip" style="background:var(--saldo)"></span>Verlofsaldo</li>
      <li><span class="stip" style="background:var(--saldo);opacity:.55"></span>Gepland, nog niet geboekt</li>
      <li><span class="stip" style="background:var(--bank)"></span>Urenbank</li>
      <li><span class="stip" style="background:var(--overig)"></span>Overig verlof</li>
      <li><span class="stip" style="box-shadow:inset 0 0 0 2px var(--feest)"></span>Feestdag</li>
      <li><span class="stip" style="background:var(--vrij)"></span>Vaste vrije dag</li>
      <li><span class="stip" style="background:var(--surface);box-shadow:inset 0 -3px 0 var(--ink)"></span>Werksessie of info</li>
    </ul>
    <div class="vlak dag-info" id="dag-info" aria-live="polite"><span class="muted">Kies een dag voor details.</span></div>
    <div class="kaart">
      ${perMaand.map((ds, m) => {
        const leeg = ds[0].isodow - 1;
        return `<section class="maand"><h3>${dfMaand.format(new Date(jaar, m, 1))}</h3>
          <div class="maand-raster">
            ${DAGNAMEN.map(d => `<span class="kopdag">${d}</span>`).join('')}
            ${'<span class="dag leeg"></span>'.repeat(leeg)}
            ${ds.map(d => `<button class="${klasse(d)}" data-d="${d.datum}" aria-label="${esc(label(d))}">${+d.datum.slice(8)}</button>`).join('')}
          </div></section>`;
      }).join('')}
    </div>`;

  $('#plan-hier').addEventListener('click', () => verlofFormulier(null, jaar));
  $$('.dag[data-d]', main).forEach(b => b.addEventListener('click', () => {
    $$('.dag.gekozen', main).forEach(x => x.classList.remove('gekozen'));
    b.classList.add('gekozen');
    const d = dagen.find(x => x.datum === b.dataset.d);
    const v = d.verlof_id ? status.get(d.verlof_id) : null;
    $('#dag-info').innerHTML = `<strong style="text-transform:capitalize">${dfLang.format(datum(d.datum))}</strong>
      <div class="rij" style="gap:0.5rem;margin-top:0.35rem">
        ${d.feestdag ? `<span class="chip feest">${esc(d.feestdag)}</span>` : ''}
        ${n(d.norm_uren) > 0 ? `<span>${fmt(d.norm_uren)} uur volgens rooster</span>` : d.isodow < 6 && !d.feestdag ? '<span class="muted">Vaste vrije dag</span>' : ''}
        ${v ? `<span class="chip ${esc(v.bron)}">${esc(v.omschrijving)}</span><span class="muted">${periode(v.begin, v.eind)}, ${fmtU(v.kosten_uren)} uur, ${v.dagen_aansluitend_vrij} dagen aaneengesloten vrij</span> <button class="knop-tekst" data-bewerk-dag="${v.id}">Bewerken</button>` : ''}
        ${d.agenda ? `<span>${esc(d.agenda)}</span>` : ''}
      </div>`;
    $('[data-bewerk-dag]')?.addEventListener('click', () => verlofFormulier(v, jaar));
  }));
}

/* ---------- instellingen ---------- */
async function toonInstellingen(main) {
  instellingenCache = null;
  const [inst, roosters, potjes, saldi, fdAfw, agenda, dagenJaar] = await Promise.all([
    instellingen(),
    api.list('rooster', { order: 'geldig_vanaf' }),
    api.list('verlof_potje', { order: ['prioriteit', 'id'] }),
    api.rpc('potje_saldi', { incl_gepland: false }),
    api.list('feestdag_afwijking', { order: 'datum' }),
    api.list('agenda_item', { order: 'begin' }),
    api.rpc('dagen', { van: `${DIT_JAAR}-01-01`, tot: `${DIT_JAAR}-12-31` }),
  ]);
  const huidigRooster = [...roosters].reverse().find(r => r.geldig_vanaf <= VANDAAG) || roosters[roosters.length - 1];
  const feestdagen = dagenJaar.filter(d => d.feestdag);
  const verval = p => saldi.find(s => s.potje_id === p.id)?.vervalt_op;

  main.innerHTML = `
    <h2>Werkrooster</h2>
    <div class="vlak">
      <p class="info" style="margin-top:0">Je vaste uren per dag. Schuif je één keer een dag, pas dat dan aan bij die week onder Weken. Verandert je contract, voeg dan een nieuw rooster toe met een ingangsdatum.</p>
      ${roosters.length > 1 ? `<p class="info">Eerdere roosters: ${roosters.filter(r => r !== huidigRooster).map(r => `vanaf ${kort(r.geldig_vanaf)} ${jaarVan(r.geldig_vanaf)} (${r.uren.map(n).join('/')})`).join(', ')}</p>` : ''}
      <form id="rooster-form" class="sectie" style="display:grid;gap:1rem">
        <div class="rooster-dagen">${DAGNAMEN.map((d, i) => `<label>${d}<input type="number" name="d${i}" step="0.25" min="0" max="24" inputmode="decimal" value="${huidigRooster ? n(huidigRooster.uren[i]) : (i < 5 ? 7.2 : 0)}"></label>`).join('')}</div>
        <div class="rij">
          <label class="veld"><span>Geldig vanaf</span><input type="date" name="vanaf" value="${huidigRooster?.geldig_vanaf || `${DIT_JAAR}-01-01`}"></label>
          <p class="muted" style="margin:1.4rem 0 0">Totaal <strong class="num" id="rooster-totaal"></strong> uur per week</p>
        </div>
        <div><button class="knop">Rooster opslaan</button></div>
      </form>
    </div>

    <h2>Verlofpotjes</h2>
    <div class="vlak">
      <p class="info" style="margin-top:0">Neem de potjes over uit je P&amp;O-overzicht: het beginsaldo op je startdatum, of het toegekende of gekochte aantal. Opgenomen verlof gaat eraf van boven naar beneden; verschuif een potje om de volgorde te wijzigen. Laat Vervalt leeg om de standaardregel te gebruiken.</p>
      <div class="tabel-wrap" style="border:none">
        <table>
          <thead><tr><th>Volgorde</th><th>Soort</th><th class="r">Uren</th><th class="r">Correctie</th><th>Beschikbaar vanaf</th><th>Vervalt (leeg = standaard)</th><th>Toelichting</th><th></th></tr></thead>
          <tbody>${potjes.map((p, i) => `<tr data-potje="${p.id}">
            <td><div class="potje-acties">
              <button class="knop licht klein" data-omhoog="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Eerder afschrijven">▲</button>
              <button class="knop licht klein" data-omlaag="${i}" ${i === potjes.length - 1 ? 'disabled' : ''} aria-label="Later afschrijven">▼</button></div></td>
            <td>${esc(potjeNaam(p))}</td>
            <td class="r"><input class="tt-invoer num" type="number" step="0.01" data-veld="uren" value="${n(p.uren)}" aria-label="Uren ${esc(potjeNaam(p))}"></td>
            <td class="r"><input class="tt-invoer num" type="number" step="0.01" data-veld="correctie" value="${n(p.correctie)}" aria-label="Correctie ${esc(potjeNaam(p))}"></td>
            <td><input class="tt-invoer" style="width:9.5rem;text-align:left" type="date" data-veld="beschikbaar_vanaf" value="${p.beschikbaar_vanaf}"></td>
            <td><input class="tt-invoer" style="width:9.5rem;text-align:left" type="date" data-veld="vervalt_op" value="${p.vervalt_op || ''}"><div class="info">${!p.vervalt_op && verval(p) ? `standaard ${kort(verval(p))} ${jaarVan(verval(p))}` : ''}</div></td>
            <td><input class="tt-invoer" style="width:12rem;text-align:left" data-veld="toelichting" value="${esc(p.toelichting)}"></td>
            <td><button class="knop-tekst" data-wis-potje="${p.id}">Verwijderen</button></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="rij sectie">
        <button class="knop" id="nieuw-jaar">Potjes ${DIT_JAAR + 1} toevoegen</button>
        <button class="knop licht" id="koop">Gekocht verlof registreren</button>
        <button class="knop licht" id="los-potje">Ander potje toevoegen</button>
      </div>
      <p class="info">Potjes ${DIT_JAAR + 1} toevoegen maakt ${fmt(4 * inst.uren_per_week)} uur wettelijk en ${fmt(1.6 * inst.uren_per_week)} uur bovenwettelijk aan (cao Gemeenten bij ${fmt(inst.uren_per_week)} uur per week).</p>
    </div>

    <h2>Feestdagen</h2>
    <div class="vlak">
      <p class="info" style="margin-top:0">Standaard gelden de feestdagen uit de cao Gemeenten, met 5 mei elk jaar en zonder Goede Vrijdag. Voeg hier een extra vrije dag van je werkgever toe, of zet een feestdag uit. Een door de werkgever verplicht aangewezen vrije dag die van je saldo afgaat, plan je als gewoon verlof.</p>
      <p><strong>${DIT_JAAR}:</strong> ${feestdagen.map(d => `${esc(d.feestdag)} ${kort(d.datum)}`).join(', ')}</p>
      ${fdAfw.length ? `<ul class="signalen">${fdAfw.map(a => `<li class="${a.is_feestdag ? 'goed' : 'let-op'}"><span>${kort(a.datum)} ${jaarVan(a.datum)}: ${esc(a.naam)} ${a.is_feestdag ? '(extra vrije dag)' : '(geldt niet)'} <button class="knop-tekst" data-wis-fd="${a.datum}">Verwijderen</button></span></li>`).join('')}</ul>` : ''}
      <form id="fd-form" class="velden sectie" style="align-items:end">
        <label class="veld"><span>Datum</span><input type="date" name="datum" required></label>
        <label class="veld"><span>Naam</span><input name="naam" required placeholder="Bijvoorbeeld: Goede Vrijdag"></label>
        <label class="veld"><span>Wat geldt</span><select name="type"><option value="extra">Vrije dag van werkgever</option><option value="geen">Feestdag geldt niet</option></select></label>
        <div><button class="knop licht">Toevoegen</button></div>
      </form>
    </div>

    <h2>Werksessies en schoolvakanties</h2>
    <div class="vlak">
      <p class="info" style="margin-top:0">Alleen ter informatie in je planning en jaarkaart. Ze veranderen je uren niet.</p>
      ${agenda.length ? `<ul class="signalen">${agenda.map(a => `<li><span>${periode(a.begin, a.eind)}: ${esc(a.omschrijving)} <span class="muted">(${esc({ werksessie: 'werksessie', schoolvakantie: 'schoolvakantie', info: 'overig' }[a.soort] || a.soort)})</span> <button class="knop-tekst" data-wis-ag="${a.id}">Verwijderen</button></span></li>`).join('')}</ul>` : ''}
      <form id="ag-form" class="velden sectie" style="align-items:end">
        <label class="veld"><span>Van</span><input type="date" name="begin" required></label>
        <label class="veld"><span>Tot en met</span><input type="date" name="eind" required></label>
        <label class="veld"><span>Omschrijving</span><input name="omschrijving" required placeholder="Bijvoorbeeld: KPE"></label>
        <label class="veld"><span>Soort</span><select name="soort"><option value="werksessie">Werksessie</option><option value="schoolvakantie">Schoolvakantie</option><option value="info">Overig</option></select></label>
        <div><button class="knop licht">Toevoegen</button></div>
      </form>
    </div>

    <h2>Rekenregels</h2>
    <div class="vlak">
      <form id="inst-form" style="display:grid;gap:1rem">
        <div class="velden">
          <label class="veld"><span>Startdatum</span><input type="date" name="startdatum" value="${inst.startdatum}"><small>Vanaf hier tellen urenbank en verlofopname.</small></label>
          <label class="veld"><span>Urenbank op startdatum</span><input type="number" step="0.25" name="urenbank_startsaldo" value="${n(inst.urenbank_startsaldo)}"></label>
          <label class="veld"><span>Uren per werkdag</span><input type="number" step="0.25" name="uren_per_dag" value="${n(inst.uren_per_dag)}"><small>Voor de omrekening naar dagen.</small></label>
          <label class="veld"><span>Uren per week (contract)</span><input type="number" step="0.25" name="uren_per_week" value="${n(inst.uren_per_week)}"></label>
          <label class="veld"><span>Wettelijk verlof vervalt na</span><input type="number" min="0" name="verval_wettelijk_maanden" value="${inst.verval_wettelijk_maanden}"><small>Maanden na het opbouwjaar. Wet: 6, gemeenten: 12.</small></label>
          <label class="veld"><span>Bovenwettelijk en gekocht vervalt na</span><input type="number" min="0" name="verval_bovenwettelijk_maanden" value="${inst.verval_bovenwettelijk_maanden}"><small>Maanden na het opbouwjaar. Wet: 60.</small></label>
          <label class="veld"><span>Waarschuw vooraf</span><input type="number" min="0" name="waarschuw_dagen" value="${inst.waarschuw_dagen}"><small>Dagen voor een vervaldatum.</small></label>
        </div>
        <div><button class="knop">Rekenregels opslaan</button></div>
      </form>
    </div>

    <h2>Account</h2>
    <div class="vlak rij tussen">
      <span>Ingelogd als <strong>${esc(api.email())}</strong></span>
      <button class="knop licht" id="uitloggen">Uitloggen</button>
    </div>`;

  // rooster
  const rf = $('#rooster-form');
  const totaal = () => { $('#rooster-totaal').textContent = fmt(DAGNAMEN.reduce((a, _, i) => a + (n(rf[`d${i}`].value) || 0), 0)); };
  rf.addEventListener('input', totaal); totaal();
  rf.addEventListener('submit', async e => {
    e.preventDefault();
    const rij = { geldig_vanaf: rf.vanaf.value, uren: DAGNAMEN.map((_, i) => n(rf[`d${i}`].value) || 0) };
    try {
      rij.uren.forEach(u => controleer(u, { min: 0, max: 24, naam: 'de uren per dag' }));
      if (!rij.geldig_vanaf) throw new Error('Vul in vanaf wanneer het rooster geldt.');
    } catch (err) { return melding(err.message, true); }
    const bestaand = roosters.find(r => r.geldig_vanaf === rij.geldig_vanaf);
    if (await bewaar(() => (bestaand ? api.update('rooster', { id: bestaand.id }, rij) : api.insert('rooster', rij)), 'Rooster opgeslagen')) toonInstellingen(main);
  });

  // potjes
  $$('[data-potje] [data-veld]', main).forEach(inp => inp.addEventListener('change', async () => {
    const id = +inp.closest('tr').dataset.potje, veld = inp.dataset.veld;
    let waarde = inp.value;
    if (veld === 'uren' || veld === 'correctie') {
      waarde = n(waarde) ?? 0;
      try {
        controleer(waarde, veld === 'uren' ? { min: 0, max: 2000, naam: 'de uren van een potje' } : { min: -2000, max: 2000, naam: 'de correctie' });
      } catch (err) { melding(err.message, true); return toonInstellingen(main); }
    }
    if (veld === 'vervalt_op' || veld === 'toelichting') waarde = waarde || null;
    if (await bewaar(() => api.update('verlof_potje', { id }, { [veld]: waarde }))) toonInstellingen(main);
  }));
  const wissel = async (a, b) => {
    const [pa, pb] = [potjes[a], potjes[b]];
    const ok = await bewaar(async () => {
      await api.update('verlof_potje', { id: pa.id }, { prioriteit: pb.prioriteit === pa.prioriteit ? pa.prioriteit + (b > a ? 1 : -1) : pb.prioriteit });
      await api.update('verlof_potje', { id: pb.id }, { prioriteit: pa.prioriteit });
    }, 'Volgorde aangepast');
    if (ok) toonInstellingen(main);
  };
  $$('[data-omhoog]', main).forEach(b => b.addEventListener('click', () => wissel(+b.dataset.omhoog, +b.dataset.omhoog - 1)));
  $$('[data-omlaag]', main).forEach(b => b.addEventListener('click', () => wissel(+b.dataset.omlaag, +b.dataset.omlaag + 1)));
  $$('[data-wis-potje]', main).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Dit potje verwijderen? Het saldo wordt opnieuw berekend.')) return;
    if (await bewaar(() => api.remove('verlof_potje', { id: +b.dataset.wisPotje }), 'Potje verwijderd')) toonInstellingen(main);
  }));
  $('#nieuw-jaar').addEventListener('click', async () => {
    if (await bewaar(() => api.rpc('nieuw_jaar', { p_jaar: DIT_JAAR + 1 }), `Potjes ${DIT_JAAR + 1} toegevoegd`)) toonInstellingen(main);
  });
  const maxPrio = Math.max(0, ...potjes.map(p => p.prioriteit));
  $('#koop').addEventListener('click', () => potjeFormulier({ soort: 'gekocht', opbouwjaar: DIT_JAAR, beschikbaar_vanaf: VANDAAG, prioriteit: maxPrio + 1 }, main));
  $('#los-potje').addEventListener('click', () => potjeFormulier({ soort: 'bovenwettelijk', opbouwjaar: DIT_JAAR, beschikbaar_vanaf: `${DIT_JAAR}-01-01`, prioriteit: maxPrio + 1 }, main));

  // feestdagen
  $('#fd-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (!f.datum.value || !f.naam.value.trim()) return melding('Vul datum en naam in.', true);
    if (await bewaar(() => api.upsert('feestdag_afwijking', { datum: f.datum.value, naam: f.naam.value.trim(), is_feestdag: f.type.value === 'extra' }))) toonInstellingen(main);
  });
  $$('[data-wis-fd]', main).forEach(b => b.addEventListener('click', async () => {
    if (await bewaar(() => api.remove('feestdag_afwijking', { datum: b.dataset.wisFd }), 'Verwijderd')) toonInstellingen(main);
  }));

  // agenda
  $('#ag-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (!f.begin.value || !f.eind.value || !f.omschrijving.value.trim()) return melding('Vul data en omschrijving in.', true);
    if (f.eind.value < f.begin.value) return melding('De einddatum ligt voor de begindatum.', true);
    if (await bewaar(() => api.insert('agenda_item', { begin: f.begin.value, eind: f.eind.value, omschrijving: f.omschrijving.value.trim(), soort: f.soort.value }))) toonInstellingen(main);
  });
  $$('[data-wis-ag]', main).forEach(b => b.addEventListener('click', async () => {
    if (await bewaar(() => api.remove('agenda_item', { id: +b.dataset.wisAg }), 'Verwijderd')) toonInstellingen(main);
  }));

  // rekenregels
  $('#inst-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      controleer(n(f.uren_per_dag.value), { min: 1, max: 24, naam: 'uren per werkdag' });
      controleer(n(f.uren_per_week.value), { min: 1, max: 60, naam: 'uren per week' });
      controleer(n(f.urenbank_startsaldo.value) ?? 0, { min: -500, max: 500, naam: 'de urenbank op de startdatum' });
      controleer(n(f.verval_wettelijk_maanden.value), { min: 0, max: 120, naam: 'de vervaltermijn wettelijk', heel: true });
      controleer(n(f.verval_bovenwettelijk_maanden.value), { min: 0, max: 120, naam: 'de vervaltermijn bovenwettelijk', heel: true });
      controleer(n(f.waarschuw_dagen.value), { min: 0, max: 730, naam: 'waarschuw vooraf', heel: true });
      if (!f.startdatum.value) throw new Error('Vul een startdatum in.');
    } catch (err) { return melding(err.message, true); }
    const rij = {
      startdatum: f.startdatum.value, urenbank_startsaldo: n(f.urenbank_startsaldo.value) ?? 0,
      uren_per_dag: n(f.uren_per_dag.value) || 9, uren_per_week: n(f.uren_per_week.value) || 36,
      verval_wettelijk_maanden: n(f.verval_wettelijk_maanden.value) ?? 12, verval_bovenwettelijk_maanden: n(f.verval_bovenwettelijk_maanden.value) ?? 60,
      waarschuw_dagen: n(f.waarschuw_dagen.value) ?? 120,
    };
    if (await bewaar(() => api.upsert('instellingen', rij), 'Rekenregels opgeslagen')) { instellingenCache = null; toonInstellingen(main); }
  });

  $('#uitloggen').addEventListener('click', async () => {
    try { await api.signOut(); } catch (e) { return melding(begrijpelijk(e), true); }
    instellingenCache = null;
    location.hash = '';
    start();
  });
}

function potjeFormulier(p, main) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form novalidate>
    <h2 style="margin:0">${p.soort === 'gekocht' ? 'Gekocht verlof registreren' : 'Potje toevoegen'}</h2>
    <div class="velden">
      <label class="veld"><span>Soort</span><select name="soort">${Object.entries(SOORT).filter(([k]) => k !== 'tekort').map(([k, t]) => `<option value="${k}" ${k === p.soort ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="veld"><span>Jaar</span><input type="number" name="opbouwjaar" value="${p.opbouwjaar}"></label>
      <label class="veld"><span>Uren</span><input type="number" name="uren" step="0.01" min="0" inputmode="decimal" required></label>
      <label class="veld"><span>Beschikbaar vanaf</span><input type="date" name="beschikbaar_vanaf" value="${p.beschikbaar_vanaf}"></label>
    </div>
    <label class="veld"><span>Toelichting</span><input name="toelichting" placeholder="Bijvoorbeeld: gekocht via IKB in maart"></label>
    <p class="info" style="margin:0">Cao Gemeenten: je kunt maximaal 187 uur per jaar kopen. Het potje komt onderaan de afschrijfvolgorde; verschuif het daarna als dat nodig is.</p>
    <div class="rij" style="justify-content:flex-end"><button type="button" class="knop licht" data-sluit>Annuleren</button><button class="knop">Opslaan</button></div>
  </form>`;
  document.body.append(dlg);
  const f = $('form', dlg);
  const sluit = () => { dlg.close(); dlg.remove(); };
  $('[data-sluit]', f).addEventListener('click', sluit);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const uren = n(f.uren.value);
    if (uren == null || uren <= 0 || uren > 2000) return melding('Vul een aantal uren tussen 0 en 2.000 in.', true);
    const opbouwjaar = Number(f.opbouwjaar.value);
    if (!f.opbouwjaar.value || geldigJaar(opbouwjaar) !== opbouwjaar) return melding(`Vul een jaar tussen ${JAAR_MIN} en ${JAAR_MAX} in.`, true);
    if (!f.beschikbaar_vanaf.value) return melding('Vul in vanaf wanneer het potje beschikbaar is.', true);
    if (f.soort.value === 'gekocht' && uren > 187) melding('Let op: meer dan 187 uur kopen staat de cao niet toe.', true);
    const rij = { soort: f.soort.value, opbouwjaar: +f.opbouwjaar.value, uren, beschikbaar_vanaf: f.beschikbaar_vanaf.value, prioriteit: p.prioriteit, toelichting: f.toelichting.value.trim() || null, correctie: 0 };
    if (await bewaar(() => api.insert('verlof_potje', rij), 'Potje toegevoegd')) { sluit(); toonInstellingen(main); }
  });
  dlg.showModal();
  f.uren.focus();
}

/* ---------- login en start ---------- */
function toonLogin(bericht = '') {
  $('#app').innerHTML = `
    <div class="login">
      <p class="merk">Uren<span>bank</span></p>
      <p class="muted">Houd bij hoeveel uur je op de bank hebt, hoeveel verlof er over is en wanneer je vrij bent.</p>
      <form id="link-form">
        <label class="veld"><span>E-mailadres</span><input type="email" name="email" autocomplete="username" required></label>
        <p class="fout-tekst" id="link-fout" role="alert"></p>
        <p class="info" id="link-info" role="status" style="margin:0">${esc(bericht)}</p>
        <button class="knop">Stuur inloglink</button>
      </form>
      <p class="info" style="margin-top:1.5rem">Eerst rondkijken? <a href="?demo">Bekijk de demo met voorbeelddata</a>.</p>
    </div>`;
  const lf = $('#link-form');
  lf.addEventListener('submit', async e => {
    e.preventDefault();
    const knop = $('button', lf), email = lf.email.value.trim();
    $('#link-fout').textContent = ''; $('#link-info').textContent = '';
    knop.disabled = true;
    try {
      await api.sendLoginLink(email);
      $('#link-info').textContent = `Er staat een mail met een inloglink in ${email}. Open de link op dit apparaat; je blijft daarna ingelogd.`;
    } catch (err) {
      $('#link-fout').textContent = begrijpelijk(err);
    } finally {
      knop.disabled = false;
    }
  });
}

api.onAuth((sessie, gebeurtenis) => {
  if (gebeurtenis === 'SIGNED_IN' && sessie && !$('#inhoud')) { history.replaceState(null, '', location.pathname + location.search); start(); }
});

async function start() {
  let sessie;
  try {
    sessie = await api.session();
  } catch (e) {
    return toonLogin(begrijpelijk(e));
  }
  if (!sessie) return toonLogin();
  skelet();
  router();
}

window.addEventListener('hashchange', () => { if ($('#inhoud')) router(); });
// Fouten die nergens anders worden opgevangen (bijvoorbeeld bij het verversen na opslaan)
window.addEventListener('unhandledrejection', e => { console.error(e.reason); melding(begrijpelijk(e.reason), true); });
if ('serviceWorker' in navigator && !api.demo) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
