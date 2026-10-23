// Eén API voor de app. Met ?demo in de URL draait alles in het geheugen met voorbeelddata.
// Inloggen gaat alleen met een inloglink per e-mail: het account wordt gedeeld met andere apps,
// dus deze app wijzigt of gebruikt nooit het wachtwoord.
import { SUPABASE_URL, SUPABASE_KEY, SCHEMA } from './config.js';

const isDemo = new URLSearchParams(location.search).has('demo');

async function supabaseApi() {
  let createClient;
  try {
    ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
  } catch {
    throw new Error('De verbinding met de database kon niet worden geladen. Controleer je internet en ververs de pagina.');
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: SCHEMA } });
  let sessie = null;

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message || 'Onbekende fout bij opslaan');
    return data;
  };
  const metMatch = (q, match) => {
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    return q;
  };
  const ingelogd = () => {
    if (!sessie?.user?.id) throw new Error('Je bent niet meer ingelogd. Ververs de pagina en log opnieuw in.');
    return sessie.user.id;
  };

  return {
    demo: false,
    async session() {
      sessie = (await sb.auth.getSession()).data.session;
      return sessie;
    },
    onAuth(cb) {
      sb.auth.onAuthStateChange((e, s) => { sessie = s; cb(s, e); });
    },
    async sendLoginLink(email) {
      const terug = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: terug, shouldCreateUser: false } });
      if (error) throw new Error(/signups not allowed|not found/i.test(error.message)
        ? 'Er is geen account met dit e-mailadres.'
        : /rate limit|seconds/i.test(error.message) ? 'Je hebt net al een link aangevraagd. Wacht een minuut en probeer het opnieuw.' : error.message);
    },
    uid: () => sessie?.user?.id,
    email: () => sessie?.user?.email,
    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw new Error(error.message);
    },
    async rpc(fn, args = {}) { return check(await sb.rpc(fn, args)); },
    async list(table, { order, filter = {} } = {}) {
      let q = metMatch(sb.from(table).select('*'), filter);
      for (const o of [].concat(order || [])) q = q.order(o, { ascending: true });
      return check(await q);
    },
    async insert(table, row) { ingelogd(); return check(await sb.from(table).insert(row).select().single()); },
    async upsert(table, row) { return check(await sb.from(table).upsert({ user_id: ingelogd(), ...row }).select()); },
    async update(table, match, patch) {
      ingelogd();
      const rijen = check(await metMatch(sb.from(table).update(patch), match).select());
      if (!rijen?.length) throw new Error('Niets gewijzigd: deze regel bestaat niet meer. Ververs de pagina.');
      return rijen;
    },
    async remove(table, match) { ingelogd(); return check(await metMatch(sb.from(table).delete(), match)); },
  };
}

export const api = isDemo ? (await import('./demo.js')).demoApi : await supabaseApi();
