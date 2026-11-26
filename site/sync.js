/* Salvataggio cloud dei progressi (richiede l'accesso con Google e un Worker con KV: vedi worker/ e README).
   Cosa si sincronizza: progressi di studio, Calligrafia, Quaderno di scrittura e bozze, cronologie di Lettura/Parlato, livello, lingua, tema.
   Come: ogni scrittura in localStorage su queste chiavi è registrata con la sua ora; al login e all'apertura si scarica il documento cloud,
   si uniscono i dati (Calligrafia e progressi di studio carattere per carattere / scheda per scheda, il resto vince il più recente),
   poi si inviano le modifiche. Un reset scrive una "lapide" (null), così un altro dispositivo con dati vecchi non lo annulla.
   API: HSKSync.status() / syncNow() / keys() / resetKeys(test) / exportAll() / onChange(fn) */
(function () {
"use strict";
const RX = /^(hsk\.progress\.[a-z0-9]+|hsk1\.progress|hsk\.callig|hsk\.activity|hsk\.grammar|hsk\.actlog|hsk\.writing\.notebook|hsk\.writing\.draft\.[A-Za-z0-9_.-]+|hsk\.reading\.log|hsk\.speaking\.log|hsk\.level|hsk\.lang|hsk\.theme)$/;
const META = "hsk.sync.meta", LS = window.localStorage, proto = Storage.prototype, _get = proto.getItem, _set = proto.setItem, _rem = proto.removeItem;
let meta = { updated: {}, dirty: {} }, applying = false, timer = 0, busy = false, state = { s: "idle", at: 0, err: "" };
try { const m = JSON.parse(_get.call(LS, META)); if (m && m.updated) meta = { updated: m.updated, dirty: m.dirty || {} }; } catch (e) {}
const saveMeta = () => { try { _set.call(LS, META, JSON.stringify(meta)); } catch (e) {} };
const subs = []; const fire = () => subs.forEach(f => { try { f(state); } catch (e) {} });
const setState = (s, err) => { state = { s, at: s === "ok" ? Date.now() : state.at, err: err || "" }; fire(); };
const signed = () => !!(window.HSKAuth && HSKAuth.signedIn()) && !!(window.HSKAI && HSKAI.info() && HSKAI.info().cloud);
function touch(k) { meta.updated[k] = Date.now(); meta.dirty[k] = 1; saveMeta(); schedule(); }
proto.setItem = function (k, v) { const same = this === LS && _get.call(this, k) === String(v); _set.call(this, k, v); if (this === LS && !applying && !same && RX.test(k)) touch(k); };
proto.removeItem = function (k) { const had = this === LS && _get.call(this, k) !== null; _rem.call(this, k); if (this === LS && !applying && had && RX.test(k)) touch(k); };
function schedule() { if (!signed()) return; clearTimeout(timer); timer = setTimeout(() => push().catch(() => {}), 4000); }

const mergeMap = (a, b, pickA) => { let x, y; try { x = JSON.parse(a); y = JSON.parse(b); } catch (e) { return null; } if (!x || !y || typeof x !== "object" || typeof y !== "object") return null; const o = Object.assign({}, y); for (const k in x) if (!(k in y) || pickA(x[k], y[k])) o[k] = x[k]; return JSON.stringify(o); };
const MERGE = { "hsk.callig": (a, b) => mergeMap(a, b, (p, q) => (p.t || 0) >= (q.t || 0)), "act": (a, b) => mergeMap(a, b, (p, q) => (p || 0) >= (q || 0)), "log": (a, b) => { let x, y; try { x = JSON.parse(a); y = JSON.parse(b); } catch (e) { return null; } if (!x || !y) return null; const o = Object.assign({}, y); for (const k in x) { const p = x[k], q = y[k] || {}, r = Object.assign({}, q); for (const f in p) r[f] = Array.isArray(p[f]) ? [...new Set([...(q[f] || []), ...p[f]])] : Math.max(p[f] || 0, q[f] || 0); o[k] = r; } return JSON.stringify(o); }, "prog": (a, b) => mergeMap(a, b, (p, q) => (p.n || 0) >= (q.n || 0)) };
const merger = k => k === "hsk.actlog" ? MERGE.log : k === "hsk.activity" ? MERGE.act : k === "hsk.callig" ? MERGE["hsk.callig"] : /^hsk1?\.progress/.test(k) ? MERGE.prog : null;

async function call(method, path, body) {
  const url = HSKAuth.apiUrl(path); if (!url) throw new Error("no endpoint");
  const r = await fetch(url, { method, headers: HSKAuth.headers(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status === 401) { HSKAuth.invalidate(); throw new Error("sessione scaduta"); }
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "errore " + r.status);
  return j;
}
const localKeys = () => { const o = []; for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (RX.test(k)) o.push(k); } return o; };
/** Applica un documento remoto: ritorna true se ha cambiato dati locali. */
function applyRemote(remote) {
  let changed = false; const ks = new Set([...Object.keys(remote.updated || {}), ...localKeys(), ...Object.keys(meta.updated)]);
  applying = true;
  try {
    for (const k of ks) {
      if (!RX.test(k)) continue;
      const lv = _get.call(LS, k), rv = remote.data ? remote.data[k] : undefined, rt = (remote.updated && remote.updated[k]) || 0, lt = meta.updated[k] || (lv != null ? 1 : 0);
      if (!rt) { if (lv != null || meta.updated[k]) meta.dirty[k] = 1; continue; }
      const mg = merger(k);
      if (lv != null && rv != null && mg && lv !== rv) {            // dati su entrambi i lati: unione elemento per elemento
        const m = mg(lv, rv); if (m && m !== lv) { _set.call(LS, k, m); changed = true; }
        meta.updated[k] = Date.now(); meta.dirty[k] = 1; continue;
      }
      if (rt > lt) { if (rv == null) { if (lv != null) { _rem.call(LS, k); changed = true; } } else if (rv !== lv) { _set.call(LS, k, rv); changed = true; } meta.updated[k] = rt; delete meta.dirty[k]; }
      else if (lt > rt) meta.dirty[k] = 1;
    }
  } finally { applying = false; }
  saveMeta(); return changed;
}
async function push() {
  if (!signed() || busy) return; const ks = Object.keys(meta.dirty).filter(k => RX.test(k)); if (!ks.length) return;
  busy = true; setState("sync");
  try {
    const data = {}, updated = {}; ks.forEach(k => { const v = _get.call(LS, k); data[k] = v; updated[k] = meta.updated[k] || Date.now(); });
    const out = await call("PUT", "progress", { data, updated });
    ks.forEach(k => { if (meta.updated[k] === updated[k]) delete meta.dirty[k]; }); saveMeta();
    const ch = applyRemote(out); setState("ok"); if (ch) reloadOnce();
  } catch (e) { setState("err", e.message); throw e; } finally { busy = false; }
}
function reloadOnce() { try { const t = Number(sessionStorage.getItem("hsk.sync.rl") || 0); if (Date.now() - t < 30000) return; sessionStorage.setItem("hsk.sync.rl", String(Date.now())); } catch (e) {} location.reload(); }
async function pull() {
  if (!signed()) return; setState("sync");
  try { const rem = await call("GET", "progress"); const ch = applyRemote(rem); await push(); setState("ok"); if (ch) reloadOnce(); }
  catch (e) { setState("err", e.message); }
}
const api = window.HSKSync = {
  status: () => state, signed, onChange: f => subs.push(f), syncNow: () => pull(), keys: localKeys,
  /** Cancella (con lapide per il cloud) le chiavi che soddisfano il test. Ritorna quante. */
  resetKeys(test) { const ks = [...new Set([...localKeys(), ...Object.keys(meta.updated)])].filter(k => RX.test(k) && test(k)); let n = 0; for (const k of ks) { if (_get.call(LS, k) !== null) n++; _rem.call(LS, k); meta.updated[k] = Date.now(); meta.dirty[k] = 1; } saveMeta(); if (signed()) push().catch(() => {}); return n; },
  exportAll() { const o = {}; localKeys().forEach(k => { o[k] = _get.call(LS, k); }); return { app: "studio-hsk", exported: new Date().toISOString(), data: o }; },
  forgetMeta() { meta = { updated: {}, dirty: {} }; saveMeta(); }
};
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && signed() && Object.keys(meta.dirty).length) { clearTimeout(timer); push().catch(() => {}); } });
const start = () => { if (signed()) pull(); };
document.addEventListener("hsk-auth-change", () => { if (window.HSKAuth && HSKAuth.signedIn()) { if (window.HSKAI && HSKAI.info()) pull(); else HSKAI.ready && HSKAI.ready.then(start); } fire(); });
window.addEventListener("load", () => { if (window.HSKAI && HSKAI.ready) HSKAI.ready.then(start); });
})();
