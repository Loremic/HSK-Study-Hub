/* Pannello laterale ridimensionabile (livelli + argomenti), stile split-pane.
   - Si trascina il bordo destro del pannello (mouse, dito, penna); frecce ←/→ con la maniglia a fuoco; doppio clic = larghezza predefinita.
   - La larghezza totale (--side) si divide tra la colonna dei livelli e quella degli argomenti; sotto certe soglie i contenuti si
     compattano (data-sb="s|m|l" su #shell, usato da clean.css): font ridotti, nomi su due righe, conteggi nascosti.
   - Preferenza in localStorage ("hsk.ui.side", solo locale). L'area centrale occupa lo spazio che resta (grid 1fr). Sotto 820 px non c'è. */
(function () {
"use strict";
const KEY = "hsk.ui.side", MIN = 150, MAX = 560, DEF = 420, STEP = 16;
const shell = document.getElementById("shell"), layout = document.querySelector(".layout"), levels = document.getElementById("levels"), nav = document.getElementById("nav");
if (!shell || !layout || !levels) return;
const T = s => (window.I18n ? I18n.t(s) : s);
let side = DEF; try { const v = Number(localStorage.getItem(KEY)); if (v >= MIN && v <= MAX) side = v; } catch (e) {}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lvw = s => clamp(Math.round(s * 0.36), 56, 150);
const h = document.createElement("div"); h.id = "sbHandle"; h.setAttribute("role", "separator"); h.setAttribute("aria-orientation", "vertical"); h.tabIndex = 0;
h.setAttribute("aria-label", T("Larghezza del pannello laterale")); h.title = T("Trascina per ridimensionare (doppio clic: ripristina)");
h.setAttribute("aria-valuemin", String(MIN)); h.setAttribute("aria-valuemax", String(MAX)); shell.append(h);
function apply(v, save) {
  side = clamp(Math.round(v), MIN, MAX); const a = lvw(side), b = Math.max(side - a, 90);
  const st = document.documentElement.style; st.setProperty("--lvw", a + "px"); st.setProperty("--navw", b + "px");
  shell.dataset.sb = side < 250 ? "s" : side < 340 ? "m" : "l"; h.setAttribute("aria-valuenow", String(side));
  place(); if (save) { try { localStorage.setItem(KEY, String(side)); } catch (e) {} }
}
function place() {   // la maniglia sta sul bordo destro dell'ultimo pannello visibile
  const navVisible = layout.style.display !== "none" && nav && nav.offsetParent !== null;
  const r = (navVisible ? nav : levels).getBoundingClientRect(), s = shell.getBoundingClientRect();
  h.style.left = Math.round(r.right - s.left - 5) + "px"; h.style.top = "0px"; h.style.height = shell.offsetHeight + "px";
}
let drag = null;
h.addEventListener("pointerdown", e => { if (e.button) return; drag = { x: e.clientX, w: side, nav: layout.style.display !== "none" }; h.setPointerCapture(e.pointerId); document.body.classList.add("sb-drag"); e.preventDefault(); });
h.addEventListener("pointermove", e => {
  if (!drag) return; const dx = e.clientX - drag.x;
  apply(drag.nav ? drag.w + dx : (lvw(drag.w) + dx) / 0.36);   // senza il pannello argomenti si regola solo la colonna dei livelli
});
const end = () => { if (!drag) return; drag = null; document.body.classList.remove("sb-drag"); try { localStorage.setItem(KEY, String(side)); } catch (e) {} };
h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
h.addEventListener("dblclick", () => apply(DEF, true));
h.addEventListener("keydown", e => {
  const k = e.key, d = k === "ArrowLeft" ? -STEP : k === "ArrowRight" ? STEP : 0;
  if (d) { apply(side + d * (e.shiftKey ? 3 : 1), true); e.preventDefault(); } else if (k === "Home") { apply(MIN, true); e.preventDefault(); } else if (k === "End") { apply(MAX, true); e.preventDefault(); } else if (k === "Enter") { apply(DEF, true); }
});
// titoli (tooltip) per i nomi che nella versione compatta vengono troncati
const tip = () => nav.querySelectorAll("button").forEach(b => { const t = b.querySelector("span"); if (t && !b.title) b.title = t.textContent; });
new MutationObserver(tip).observe(nav, { childList: true });
new ResizeObserver(place).observe(shell); new MutationObserver(place).observe(layout, { attributes: true, attributeFilter: ["style"] });
window.addEventListener("resize", place); if (window.I18n) I18n.onChange(() => { h.setAttribute("aria-label", T("Larghezza del pannello laterale")); h.title = T("Trascina per ridimensionare (doppio clic: ripristina)"); });
apply(side, false); setTimeout(place, 300); setTimeout(place, 1200);
})();
