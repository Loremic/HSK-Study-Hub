/* Accesso con Google (Google Identity Services) + sessione del Worker.
   - Lo script di Google (accounts.google.com/gsi/client) viene caricato SOLO quando l'utente apre il pannello Account per accedere.
   - Il pulsante è quello ufficiale di Google (renderButton). Il browser riceve da Google un ID token e lo manda al Worker
     (POST /api/auth/google); il Worker lo verifica e risponde con un token di sessione di 30 giorni, tenuto in localStorage ("hsk.auth").
   - Nessuna password, nessuna chiave nel browser. Il Client ID è pubblico: arriva dal Worker (ping) o da HSK_CONFIG.GOOGLE_CLIENT_ID.
   API: HSKAuth.user() / token() / signedIn() / headers() / apiUrl(percorso) / mountButton(elemento) / signOut() / invalidate() / onChange(fn) */
(function () {
"use strict";
const KEY = "hsk.auth", subs = [];
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const expOf = t => { try { return JSON.parse(atob(String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp || 0; } catch (e) { return 0; } };
let sess = null;
try { const s = JSON.parse(lsGet(KEY)); if (s && s.token && expOf(s.token) * 1000 > Date.now()) sess = s; else if (s) lsSet(KEY, null); } catch (e) {}
const fire = () => { subs.forEach(f => { try { f(); } catch (e) {} }); document.dispatchEvent(new CustomEvent("hsk-auth-change", { detail: { signedIn: !!sess } })); document.dispatchEvent(new CustomEvent("hsk-ai-change")); };
let gsiP = null;
const loadGsi = () => gsiP || (gsiP = new Promise((res, rej) => {
  if (window.google && google.accounts && google.accounts.id) return res();
  const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = () => res(); s.onerror = () => { gsiP = null; rej(new Error("gsi")); }; document.head.append(s);
}));
const api = window.HSKAuth = {
  user: () => sess && sess.user, token: () => sess && sess.token, signedIn: () => !!sess,
  onChange: f => subs.push(f),
  clientId() { const i = window.HSKAI && HSKAI.info && HSKAI.info(); return (window.HSK_CONFIG && HSK_CONFIG.GOOGLE_CLIENT_ID) || (i && i.client_id) || ""; },
  /** Indirizzo di un servizio del Worker ("auth/google", "progress", "account"), ricavato dall'indirizzo dell'IA. */
  apiUrl(path) { const e = window.HSKAI ? HSKAI.endpoint() : ""; if (!e) return ""; return /\/api\/ai\/?$/.test(e) ? e.replace(/ai\/?$/, path) : e.replace(/\/?$/, "/") + "api/" + path; },
  headers(extra) { const h = Object.assign({ "content-type": "application/json" }, extra || {}); if (sess) h.authorization = "Bearer " + sess.token; return h; },
  async exchange(credential) {
    const r = await fetch(api.apiUrl("auth/google"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
    const j = await r.json().catch(() => null); if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "Accesso non riuscito.");
    sess = { token: j.token, user: j.user }; lsSet(KEY, JSON.stringify(sess)); fire(); return sess.user;
  },
  /** Disegna nel contenitore il pulsante ufficiale "Accedi con Google". onDone(err|null) a fine accesso. */
  async mountButton(box, onDone) {
    const id = api.clientId(); if (!id) throw new Error("client");
    await loadGsi();
    google.accounts.id.initialize({ client_id: id, callback: async r => { try { await api.exchange(r.credential); onDone && onDone(null); } catch (e) { onDone && onDone(e); } }, auto_select: false, cancel_on_tap_outside: true });
    box.replaceChildren(); google.accounts.id.renderButton(box, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", logo_alignment: "left", locale: (window.I18n && I18n.lang) || "it", width: 260 });
  },
  signOut() { try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {} sess = null; lsSet(KEY, null); fire(); },
  invalidate() { if (sess) { sess = null; lsSet(KEY, null); fire(); } }          // il Worker ha risposto 401: sessione scaduta o non valida
};
})();
