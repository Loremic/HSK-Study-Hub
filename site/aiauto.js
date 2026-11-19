/* Sistema IA: attivo di base, con interruttore nell'interfaccia (barra in alto) e rilevamento automatico del servizio.
   Stato dell'utente (localStorage, in modo pulito e con ripiego se il browser lo blocca):
     hsk.ai.on  = "0" se l'utente ha spento l'IA (assente = acceso)      hsk.ai.url = indirizzo del Worker scelto dall'utente
   Indirizzo del servizio, in ordine: AI_ENDPOINT di config.js > indirizzo salvato dall'utente > ricerca automatica
   (AI_DEFAULT "/api/ai" sullo stesso sito, in un Codespace GitHub la porta 8787, in locale http://localhost:8787/).
   API: HSKAI.on() = IA acceso E servizio indicato; enabled()/setEnabled(b); endpoint(); url()/setUrl(u) (verifica con un ping);
        status() = "checking" | "connected" | "offline" | "none"; retry(); ready = promessa dell'ultimo controllo.
   Evento "hsk-ai-change" a ogni cambio di stato. AI_DETECTOR in config.js è un'altra funzione (stima se un testo è scritto da una AI). */
(function () {
"use strict";
const C = window.HSK_CONFIG = window.HSK_CONFIG || {}, KON = "hsk.ai.on", KURL = "hsk.ai.url";
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const st = { enabled: get(KON) !== "0", endpoint: C.AI_ENDPOINT || get(KURL) || "", status: "checking", tried: "" };
const fire = () => document.dispatchEvent(new CustomEvent("hsk-ai-change", { detail: { on: api.on(), status: st.status } }));
const ping = async url => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3500);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "ping" }), signal: ctl.signal });
    if (!r.ok) return false; const j = await r.json(); return !!(j && j.ok && j.ready !== false);
  } catch (e) { return false; } finally { clearTimeout(t); }
};
const probe = async () => {
  st.status = "checking"; fire();
  if (st.endpoint) { st.tried = st.endpoint; st.status = (await ping(st.endpoint)) ? "connected" : "offline"; fire(); return st; }
  if (C.AI_AUTO === false || location.protocol === "file:") { st.status = "none"; fire(); return st; }
  const cands = [C.AI_DEFAULT || "/api/ai"];
  const cs = location.hostname.match(/^(.+)-\d+\.app\.github\.dev$/); if (cs) cands.unshift("https://" + cs[1] + "-8787.app.github.dev/");
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) cands.push("http://localhost:8787/");
  st.tried = cands.join("  ·  ");
  for (const url of cands) if (await ping(url)) { st.endpoint = url; st.status = "connected"; fire(); document.dispatchEvent(new CustomEvent("hsk-ai-ready")); return st; }
  st.status = "none"; fire(); return st;
};
const api = window.HSKAI = {
  ready: null,
  on: () => st.enabled && !!st.endpoint && st.status !== "none",
  enabled: () => st.enabled,
  setEnabled(b) { st.enabled = !!b; set(KON, b ? null : "0"); fire(); },
  endpoint: () => st.endpoint, url: () => get(KURL) || "",
  async setUrl(u) { u = String(u || "").trim(); set(KURL, u || null); st.endpoint = C.AI_ENDPOINT || u || ""; if (!st.endpoint) st.status = "checking"; api.ready = probe(); return api.ready; },
  status: () => st.status, state: st,
  retry() { api.ready = probe(); return api.ready; }
};
api.ready = probe();
})();
