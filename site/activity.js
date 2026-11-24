/* Tempo di studio e serie di giorni consecutivi. Conta solo i secondi in cui la scheda è visibile E l'utente ha interagito negli
   ultimi 60 s (niente conteggio con la pagina aperta e dimenticata). Salvato localmente in "hsk.activity" = { "AAAA-MM-GG": secondi }. */
(function () {
"use strict";
const KEY = "hsk.activity", TICK = 5, IDLE = 60, MINDAY = 60;   // un giorno vale per la serie da 1 minuto di studio
let last = Date.now(), pend = 0, cache = null;
const day = d => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
["pointerdown", "keydown", "scroll", "touchstart", "wheel"].forEach(ev => addEventListener(ev, () => { last = Date.now(); }, { passive: true, capture: true }));
function flush() { if (!pend) return; const o = load(), k = day(); o[k] = (o[k] || 0) + pend; pend = 0; save(o); }
setInterval(() => {
  if (document.visibilityState !== "visible" || Date.now() - last > IDLE * 1000) return;
  pend += TICK; if (pend >= 15) flush();
}, TICK * 1000);
addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
function stats() {
  flush(); const o = load(), today = new Date(), days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ d: day(d), s: o[day(d)] || 0, wd: d.getDay() }); }
  const ok = k => (o[k] || 0) >= MINDAY;
  let streak = 0, d = new Date(today); if (!ok(day(d))) d.setDate(d.getDate() - 1);   // oggi non è ancora finito: non spezza la serie
  while (ok(day(d))) { streak++; d.setDate(d.getDate() - 1); }
  const keys = Object.keys(o).filter(ok).sort(); let best = 0, run = 0, prev = null;
  keys.forEach(k => { const t = new Date(k + "T12:00:00"); run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; prev = t; if (run > best) best = run; });
  let total = 0; for (const k in o) total += o[k] || 0;
  return { streak, best: Math.max(best, streak), total, today: o[day(today)] || 0, days, studiedToday: ok(day(today)) };
}
window.Activity = { stats, flush };
})();
