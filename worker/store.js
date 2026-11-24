/* Salvataggio cloud dei progressi: un documento per utente in Cloudflare KV (binding PROGRESS), chiave "u:<sub Google>".
   Formato: { v:1, updated:{<chiave>:<ms>}, data:{<chiave>:<stringa JSON>|null} }. null = cancellazione (tombstone), così un reset
   fatto su un dispositivo non viene "risuscitato" da un altro dispositivo con dati vecchi. Unione per chiave: vince il più recente. */
export const MAX_BYTES = 400 * 1024;
export const ALLOWED_KEY = /^(hsk\.progress\.[a-z0-9]+|hsk1\.progress|hsk\.callig|hsk\.activity|hsk\.writing\.notebook|hsk\.writing\.draft\.[A-Za-z0-9_.-]+|hsk\.reading\.log|hsk\.speaking\.log|hsk\.level|hsk\.lang|hsk\.theme)$/;
const empty = () => ({ v: 1, updated: {}, data: {} });
export async function load(env, sub) { try { const d = await env.PROGRESS.get("u:" + sub, "json"); return d && d.v === 1 ? d : empty(); } catch (e) { return empty(); } }
export function merge(cur, inc, now = Date.now()) {
  const out = { v: 1, updated: Object.assign({}, cur.updated), data: Object.assign({}, cur.data) };
  for (const k of Object.keys(inc.data || {})) {
    if (!ALLOWED_KEY.test(k)) continue;
    const t = Math.min(Number(inc.updated && inc.updated[k]) || 0, now + 5 * 60 * 1000), v = inc.data[k];
    if (v !== null && typeof v !== "string") continue;
    if (t >= (out.updated[k] || 0)) { out.updated[k] = t; out.data[k] = v; }
  }
  return out;
}
export const size = d => JSON.stringify(d).length;
export async function save(env, sub, doc) { await env.PROGRESS.put("u:" + sub, JSON.stringify(doc)); }
export async function wipe(env, sub) { await env.PROGRESS.delete("u:" + sub); }
