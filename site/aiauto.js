/* Attivazione automatica dell'IA. Nessun interruttore: se il proxy AI risponde, l'IA è attiva.
   - Se config.js ha AI_ENDPOINT, si usa quello.
   - Altrimenti si prova l'indirizzo predefinito AI_DEFAULT ("/api/ai" sullo stesso sito, dove va il Worker: vedi worker/wrangler.toml).
   - Se non risponde, il sito resta pienamente utilizzabile con l'analisi locale (nessun errore mostrato).
   window.HSKAI.ready è una promessa da attendere prima di chiamare l'IA; window.HSKAI.on() dice se è attiva. */
(function () {
"use strict";
const C = window.HSK_CONFIG = window.HSK_CONFIG || {};
const st = { on: false, endpoint: "", tried: "" };
const ping = async url => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3500);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "ping" }), signal: ctl.signal });
    if (!r.ok) return false; const j = await r.json(); return !!(j && j.ok && j.ready !== false);
  } catch (e) { return false; } finally { clearTimeout(t); }
};
const ready = (async () => {
  if (C.AI_ENDPOINT) { st.on = true; st.endpoint = C.AI_ENDPOINT; return st; }
  if (C.AI_AUTO === false || location.protocol === "file:") return st;
  const url = C.AI_DEFAULT || "/api/ai"; st.tried = url;
  if (await ping(url)) { C.AI_ENDPOINT = url; st.on = true; st.endpoint = url; document.dispatchEvent(new CustomEvent("hsk-ai-ready")); }
  return st;
})();
window.HSKAI = { ready, on: () => !!C.AI_ENDPOINT, state: st };
})();
