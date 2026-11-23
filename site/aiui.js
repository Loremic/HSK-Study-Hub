/* Interruttore IA nella barra in alto + pannello con stato e indirizzo del servizio. Usa HSKAI (aiauto.js). */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s;
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const bar = document.querySelector(".hright"), theme = document.getElementById("themeBtn");
if (!bar || !window.HSKAI) return;
const wrap = mk("div", "aiw"), sw = mk("button", "theme aibtn"), cfg = mk("button", "aicfg"), pan = mk("div", "aipan");
sw.id = "aiBtn"; sw.type = "button"; sw.setAttribute("role", "switch");
const tk = mk("span", "tk"); tk.setAttribute("aria-hidden", "true"); const lab = mk("span", "ail"), dot = mk("i", "aid"); dot.setAttribute("aria-hidden", "true");
sw.append(tk, lab, dot);
cfg.id = "aiCfg"; cfg.type = "button"; cfg.textContent = "⚙"; cfg.setAttribute("aria-haspopup", "dialog"); cfg.setAttribute("aria-expanded", "false");
pan.id = "aiPanel"; pan.hidden = true; pan.setAttribute("role", "dialog");
wrap.append(sw, cfg, pan); bar.insertBefore(wrap, theme);

const status = mk("p", "aist"), fl = mk("label", "aifl"), inp = mk("input"), row = mk("div", "aiact"), save = mk("button", "btn"), retry = mk("button", "btn"), help = mk("p", "hint");
inp.type = "url"; inp.id = "aiUrl"; inp.placeholder = "https://…"; inp.autocomplete = "off"; inp.spellcheck = false;
fl.htmlFor = "aiUrl"; save.type = retry.type = "button"; row.append(save, retry); const ttl = mk("h4");
const tr = mk("p", "aitrans"); pan.append(ttl, status, fl, inp, row, help, tr);

const MSG = () => ({
  off: T("IA spenta: usi solo l’analisi automatica locale."),
  checking: T("Controllo il servizio IA…"),
  connected: T("IA attiva: servizio collegato."),
  down: T("IA accesa, ma il servizio non risponde: finché non risponde funziona solo l’analisi locale.")
});
function draw() {
  const en = HSKAI.enabled(), s = HSKAI.status(), M = MSG(), nl = en && s === "connected" && HSKAI.needsLogin();
  sw.setAttribute("aria-checked", String(en)); sw.setAttribute("aria-label", T("Assistenza IA"));
  lab.textContent = T("IA");
  const k = !en ? "off" : s === "connected" ? "ok" : s === "checking" ? "wait" : "down";
  dot.dataset.k = nl ? "wait" : k; sw.title = nl ? T("Per usare l’IA accedi con Google.") : !en ? M.off : s === "connected" ? M.connected : s === "checking" ? M.checking : M.down;
  cfg.setAttribute("aria-label", T("Impostazioni IA")); cfg.title = T("Impostazioni IA");
  ttl.textContent = T("Assistenza IA");
  status.textContent = nl ? T("Servizio collegato: per usare l’IA accedi con Google (pulsante in alto).") : !en ? M.off : s === "connected" ? M.connected : s === "checking" ? M.checking : M.down; status.dataset.k = nl ? "wait" : k;
  const tn = window.HSKTransparency && HSKAI.info() && HSKAI.info().provider === "gemini" ? HSKTransparency.ai() : ""; if (tn) { tr.textContent = tn; tr.hidden = false; } else tr.hidden = true;
  fl.textContent = T("Indirizzo del servizio IA (Worker)");
  if (document.activeElement !== inp) inp.value = HSKAI.url();
  save.textContent = T("Salva e verifica"); retry.textContent = T("Riprova");
  help.textContent = T("Il servizio è il piccolo Worker che custodisce la chiave API (vedi README): il sito da solo non può contenere la chiave. L’interruttore accende o spegne l’uso del servizio; se il campo è vuoto, il sito lo cerca da solo.");
}
const open = o => { pan.hidden = !o; cfg.setAttribute("aria-expanded", String(o)); if (o) { draw(); inp.focus(); } };
sw.addEventListener("click", () => HSKAI.setEnabled(!HSKAI.enabled()));
cfg.addEventListener("click", () => open(pan.hidden));
save.addEventListener("click", async () => { save.disabled = true; await HSKAI.setUrl(inp.value); save.disabled = false; draw(); });
retry.addEventListener("click", async () => { retry.disabled = true; await HSKAI.retry(); retry.disabled = false; draw(); });
inp.addEventListener("keydown", e => { if (e.key === "Enter") save.click(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !pan.hidden) { open(false); cfg.focus(); } });
document.addEventListener("click", e => { if (!pan.hidden && !wrap.contains(e.target)) open(false); });
document.addEventListener("hsk-ai-change", draw);
if (window.I18n) I18n.onChange(draw);
draw();
})();
