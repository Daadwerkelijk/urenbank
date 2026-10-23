// Eén API voor de app. Met ?demo in de URL draait alles in het geheugen met voorbeelddata.
import { SUPABASE_URL, SUPABASE_KEY, SCHEMA } from './config.js';

const isDemo = new URLSearchParams(location.search).has('demo');

async function supabaseApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
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

  return {
    demo: false,
    async session() {
      sessie = (await sb.auth.getSession()).data.session;
      return sessie;
    },
    onAuth(cb) {
      sb.auth.onAuthStateChange((e, s) => { sessie = s; cb(s, e); });
    },
    async resetPassword(email) {
      const terug = location.origin + location.pathname;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: terug });
      if (error) throw new Error(error.message);
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(/should be at least/i.test(error.message)
        ? 'Kies een wachtwoord van minimaal 6 tekens.'
        : /same/i.test(error.message) ? 'Kies een ander wachtwoord dan je huidige.' : error.message);
    },
    herstelLink: () => /type=recovery/.test(location.hash),
    uid: () => sessie?.user?.id,
    email: () => sessie?.user?.email,
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials'
        ? 'E-mailadres of wachtwoord klopt niet.' : error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async rpc(fn, args = {}) { return check(await sb.rpc(fn, args)); },
    async list(table, { order, filter = {} } = {}) {
      let q = metMatch(sb.from(table).select('*'), filter);
      for (const o of [].concat(order || [])) q = q.order(o, { ascending: true });
      return check(await q);
    },
    async insert(table, row) { return check(await sb.from(table).insert(row).select().single()); },
    async upsert(table, row) { return check(await sb.from(table).upsert({ user_id: sessie.user.id, ...row }).select()); },
    async update(table, match, patch) { return check(await metMatch(sb.from(table).update(patch), match).select()); },
    async remove(table, match) { return check(await metMatch(sb.from(table).delete(), match)); },
  };
}

export const api = isDemo ? (await import('./demo.js')).demoApi : await supabaseApi();
