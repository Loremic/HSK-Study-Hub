/* Tour guidato: evidenzia i punti chiave dell'interfaccia con un riquadro luminoso e un fumetto minimale.
   Parte da solo alla prima visita (chiave locale "hsk.tour") e si rilancia dall'icona "?" in alto. Si può saltare/chiudere in ogni
   momento (pulsante ×, Salta, Esc). Cambia scheda da solo se il punto da mostrare è altrove e poi ripristina quella di partenza. */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s, KEY = "hsk.tour";
const mobile = () => matchMedia("(max-width:820px)").matches;
const STEPS = [
  { tab: "esercizi", sel: "#exView .rl", title: "Il rullo degli esercizi", text: "Scorri il rullo (trascina, rotellina o frecce ↑ ↓): l’esercizio al centro si apre subito sotto. Qui trovi quiz, ascolto, lettura, scrittura e parlato." },
  { tab: "studia", sel: () => mobile() ? "#levels" : "#nav", title: "Pannello laterale ridimensionabile", text: () => mobile() ? "Scorri la barra dei livelli HSK e scegli unità e argomenti dal menu." : "Trascina il bordo del pannello dei livelli e degli argomenti per allargarlo o restringerlo; doppio clic per ripristinare. La larghezza viene ricordata.", pad: 6 },
  { sel: "#aiBtn", title: "Interruttore IA", text: "Attiva o disattiva la correzione con l’IA (scrittura, parlato, chat). Con l’IA spenta puoi comunque studiare, fare quiz e calligrafia." },
  { tab: "stat", sel: ".dash", title: "Statistiche e serie di giorni", text: "Qui vedi la tua serie di giorni consecutivi, il tempo di studio e i caratteri acquisiti. Tocca un giorno del grafico per vedere cosa hai fatto." }
];
let i = 0, ov, hole, tip, from = null, on = false;
const mk = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const val = v => typeof v === "function" ? v() : v;
function close(done) {
  if (!on) return; on = false; ov.remove(); document.removeEventListener("keydown", key, true); removeEventListener("resize", place); removeEventListener("scroll", place, true);
  try { localStorage.setItem(KEY, "1"); } catch (e) {}
  if (from && window.showTab) showTab(from); from = null;
  const b = document.getElementById("helpBtn"); if (b) b.focus();
}
function key(e) { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "ArrowRight") next(); else if (e.key === "ArrowLeft") back(); }
function next() { if (i >= STEPS.length - 1) return close(true); go(i + 1); }
function back() { if (i > 0) go(i - 1); }
function find(st) { return document.querySelector(val(st.sel)); }
async function go(n) {
  i = n; const st = STEPS[n];
  if (st.tab && window.showTab) { showTab(st.tab); await new Promise(r => setTimeout(r, 450)); }
  let t = find(st); for (let k = 0; !t && k < 20; k++) { await new Promise(r => setTimeout(r, 200)); t = find(st); }
  if (!t) return n < STEPS.length - 1 ? go(n + 1) : close(true);          // elemento assente (es. funzione non attiva): si salta il passo
  t.scrollIntoView({ block: "center", behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  tip.replaceChildren(); const h = mk("div", "tr-h"), x = mk("button", "tr-x", "×"); x.type = "button"; x.setAttribute("aria-label", T("Chiudi il tour")); x.onclick = () => close();
  h.append(mk("b", "", T(st.title)), x);
  const dots = mk("div", "tr-dots"); STEPS.forEach((_, k) => dots.append(mk("i", k === n ? "on" : ""))); dots.setAttribute("aria-hidden", "true");
  const sk = mk("button", "tr-skip", T("Salta")), bk = mk("button", "btn", T("Indietro")), nx = mk("button", "btn big", n === STEPS.length - 1 ? T("Fine") : T("Avanti"));
  [sk, bk, nx].forEach(b => { b.type = "button"; }); sk.onclick = () => close(); bk.onclick = back; nx.onclick = next; bk.hidden = n === 0;
  const f = mk("div", "tr-f"); f.append(sk, dots, bk, nx);
  tip.append(h, mk("p", "", T(val(st.text))), f); place(); nx.focus({ preventScroll: true });
}
function place() {
  if (!on) return; const st = STEPS[i], t = find(st); if (!t) return; const r = t.getBoundingClientRect(), p = st.pad || 8, vw = innerWidth, vh = innerHeight;
  Object.assign(hole.style, { left: r.left - p + "px", top: r.top - p + "px", width: r.width + 2 * p + "px", height: r.height + 2 * p + "px" });
  const tw = Math.min(330, vw - 24); tip.style.width = tw + "px"; const th = tip.offsetHeight;
  const below = r.bottom + p + 12 + th < vh || r.top - p - 12 - th < 8;
  tip.style.top = Math.max(8, Math.min(vh - th - 8, below ? r.bottom + p + 12 : r.top - p - 12 - th)) + "px";
  tip.style.left = Math.max(12, Math.min(vw - tw - 12, r.left + r.width / 2 - tw / 2)) + "px";
}
function start() {
  if (on) return; on = true; from = typeof curTab !== "undefined" ? curTab : null;
  ov = mk("div", "tr-ov"); hole = mk("div", "tr-hole"); tip = mk("div", "tr-tip"); tip.setAttribute("role", "dialog"); tip.setAttribute("aria-label", T("Tour guidato"));
  ov.append(hole, tip); document.body.append(ov);
  document.addEventListener("keydown", key, true); addEventListener("resize", place); addEventListener("scroll", place, true); go(0);
}
window.Tour = { start, seen: () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return true; } } };
addEventListener("load", () => { if (!Tour.seen() && !location.search.includes("pro=") && !(window.HSK_CONFIG && HSK_CONFIG.NO_TOUR)) setTimeout(start, 1500); });
})();
