/* Piano Free / Pro. Il piano vive sul server (Cloudflare KV) ed è sbloccato solo dal webhook di Stripe: qui il browser si limita
   a leggere lo stato (risposta del ping) e ad aprire Stripe Checkout / Customer Portal. Nessun dato di pagamento passa dal sito. */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s;
const info = () => (window.HSKAI && HSKAI.info && HSKAI.info()) || {};
const api = window.Pro = {
  available: () => !!info().billing,
  isPro: () => info().plan === "pro",
  async go(kind) {                      // kind: "checkout" | "portal"
    if (!HSKAuth.signedIn()) { if (window.Account) Account.open(); return; }
    const url = HSKAuth.apiUrl("billing/" + kind); if (!url) return;
    try {
      const r = await fetch(url, { method: "POST", headers: HSKAuth.headers(), body: JSON.stringify({ return_url: location.origin + location.pathname }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.url) throw new Error((j && j.error) || "Errore");
      location.href = j.url;
    } catch (e) { alert(e.message); }
  },
  upgrade() { return api.go("checkout"); }, manage() { return api.go("portal"); },
  /** Sezione "Piano" per il pannello Account. */
  panel(mk, section) {
    if (!api.available()) return null;
    const pro = api.isPro(), b = mk("button", "btn" + (pro ? "" : " big"), pro ? T("Gestisci abbonamento") : T("Passa a Pro")); b.type = "button"; b.onclick = pro ? api.manage : api.upgrade;
    return section(T("Piano"), mk("p", "hint", pro ? T("Hai il piano Pro: chat con il tutor e correzioni IA con limiti molto più ampi.") : T("Piano gratuito: chat con il tutor e correzioni IA con un limite giornaliero. Con Pro li usi senza i limiti del piano gratuito.")), b);
  }
};
/* pulsante nella barra superiore */
const chip = document.createElement("button"); chip.type = "button"; chip.id = "proBtn"; chip.className = "btn probtn"; chip.hidden = true; chip.onclick = () => (api.isPro() ? api.manage() : api.upgrade());
function sync() { const show = api.available(); chip.hidden = !show; chip.textContent = api.isPro() ? "Pro" : T("Passa a Pro"); chip.classList.toggle("on", api.isPro()); chip.title = api.isPro() ? T("Gestisci abbonamento") : T("Passa a Pro"); }
const acc = document.getElementById("accBtn"); if (acc) acc.before(chip); else document.querySelector("header").append(chip);
document.addEventListener("hsk-ai-change", sync); if (window.HSKAuth) HSKAuth.onChange(() => { if (window.HSKAI) HSKAI.retry(); }); if (window.I18n) I18n.onChange(sync); sync();
/* ritorno da Stripe: il webhook può arrivare qualche secondo dopo, quindi si riprova a leggere il piano */
const q = new URLSearchParams(location.search).get("pro");
if (q) {
  history.replaceState(null, "", location.pathname);
  if (q === "ok") { let n = 0; const t = setInterval(async () => { if (window.HSKAI) await HSKAI.retry(); if (api.isPro() || ++n > 8) clearInterval(t); }, 3000);
    const m = document.createElement("div"); m.className = "toast"; m.setAttribute("role", "status"); m.textContent = T("Grazie! Sto attivando il piano Pro…"); document.body.append(m); setTimeout(() => m.remove(), 6000); }
}
})();
