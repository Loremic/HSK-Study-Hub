/* Pulizia della GUI: raccoglie i comandi secondari nel menu "⋯" e sposta la ricerca dentro Studia.
   Non cambia nessuna logica: sposta soltanto elementi esistenti (con i loro gestori). Va caricato per ultimo. */
(function () {
"use strict";
function init() {
  const hr = document.querySelector(".hright"); if (!hr || document.getElementById("moreBtn")) return;
  const T = s => (window.I18n ? I18n.t(s) : s);
  const btn = document.createElement("button"); btn.type = "button"; btn.id = "moreBtn"; btn.className = "btn"; btn.textContent = "⋯"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", T("Altre impostazioni")); btn.title = T("Altre impostazioni");
  const menu = document.createElement("div"); menu.id = "moreMenu"; menu.hidden = true; menu.setAttribute("role", "group"); menu.setAttribute("aria-label", T("Altre impostazioni"));
  const theme = document.getElementById("themeBtn"), lang = document.getElementById("langSel"), help = document.getElementById("helpBtn"), info = document.getElementById("infoBtn");
  if (theme) menu.append(theme);
  if (lang) { const row = document.createElement("label"); row.className = "mrow"; const s = document.createElement("span"); s.textContent = T("Lingua"); s.setAttribute("data-i18n", "Lingua"); row.append(s, lang); menu.append(row); }
  if (help) { help.title = T("Guida rapida"); help.textContent = "?"; menu.append(help); }
  if (info) menu.append(info);
  hr.append(btn); header_().append(menu);
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
  menu.addEventListener("click", e => { if (e.target.closest("#helpBtn,#infoBtn")) close(); });
  const q = document.getElementById("q"), mode = document.getElementById("studyMode");
  if (q && mode && mode.parentNode) { const w = document.createElement("div"); w.className = "searchrow"; w.append(q); mode.parentNode.insertBefore(w, mode); }
}
const header_ = () => document.querySelector("header");
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
