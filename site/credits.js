/* Crediti e canali social. Tutto viene da config.js (CREDITS); se è vuoto non compare nulla.
 * Mostra: (1) una riga discreta in fondo alla pagina, (2) una finestra "Informazioni" aperta dal pulsante in alto,
 * (3) la stessa riga in coda alla scheda Statistiche (Credits.line()). Solo link https, nessun tracciamento. */
(function () {
"use strict";
const C = (window.HSK_CONFIG && window.HSK_CONFIG.CREDITS) || {};
const NETS = [["instagram", "Instagram", "community e aggiornamenti"], ["tiktok", "TikTok", "pillole di studio e caratteri"], ["youtube", "YouTube", "guide e lezioni approfondite"]];
const safe = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; } };
const links = NETS.map(([k, n, d]) => ({ k, n, d, url: safe((C.links || {})[k]) })).filter(x => x.url);
const name = String(C.name || "").trim();
const active = !!(name || links.length);
const mk = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function linkEl(x, withDesc) {
  const a = mk("a", "cr-link", x.n); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer me";
  a.setAttribute("aria-label", x.n + (withDesc ? ": " + x.d : "") + " (si apre in una nuova scheda)");
  return a;
}
function line() {
  const d = mk("div", "cr-line");
  if (name) { d.append("Creato da "); d.append(mk("b", "", name)); }
  links.forEach((x, i) => { d.append(name || i ? " · " : ""); d.append(linkEl(x)); });
  return d;
}
function openInfo() {
  let dlg = document.getElementById("crDlg");
  if (!dlg) {
    dlg = mk("dialog", "cr-dlg"); dlg.id = "crDlg"; dlg.setAttribute("aria-labelledby", "crTitle");
    const t = mk("h2", "", "Informazioni"); t.id = "crTitle";
    dlg.append(t, mk("p", "", "Studio HSK: flashcard, quiz a ripetizione dilazionata, pronuncia e produzione scritta per i livelli HSK 1–3."));
    if (name) { const p = mk("p", ""); p.append("Ideato e realizzato da "); p.append(mk("b", "", name)); p.append("."); dlg.append(p); }
    if (links.length) {
      dlg.append(mk("h3", "", "Seguimi"));
      const ul = mk("ul", "cr-list");
      links.forEach(x => { const li = mk("li"); li.append(linkEl(x, true), mk("span", "hint", " — " + x.d)); ul.append(li); });
      dlg.append(ul);
    }
    dlg.append(mk("p", "hint", "I tuoi progressi e i tuoi testi restano solo in questo browser."));
    const b = mk("button", "btn", "Chiudi"); b.type = "button"; b.onclick = () => dlg.close(); dlg.append(b);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
  }
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
}
function init() {
  if (!active) return;
  const hr = document.querySelector(".hright");
  if (hr) { const b = mk("button", "btn cr-btn", "Info"); b.type = "button"; b.id = "infoBtn"; b.setAttribute("aria-haspopup", "dialog"); b.onclick = openInfo; hr.append(b); }
  const f = mk("footer", "cr-foot"); f.append(line()); document.body.append(f);
}
window.Credits = { active, line, openInfo };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
