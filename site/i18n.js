/* i18n minimale (italiano, inglese, spagnolo). window.I18n e window.T
 * - Le chiavi sono i testi italiani (lingua sorgente): T("Avanti") -> "Next" in inglese; se manca la traduzione si vede l'italiano.
 * - Segnaposti: T("Domanda {i} di {n}", {i:1, n:5}).
 * - HTML statico: data-i18n="chiave" (testo), data-i18n-aria / data-i18n-title / data-i18n-ph (attributi).
 * - Le traduzioni stanno in i18n/en.js e i18n/es.js (generati da tools/build_i18n.py).
 * - Dati dinamici (schede): I18n.pick(obj, "meaning") legge obj.meaning_<lingua> con ripiego sensato.
 * - Lingua scelta salvata in localStorage ("hsk.lang"); alla prima visita si usa la lingua del browser. */
(function () {
"use strict";
const LANGS = { it: "Italiano", en: "English", es: "Español" }, KEY = "hsk.lang", dict = { en: {}, es: {} }, subs = [];
let lang = "it";
function detect() {
  try { const s = localStorage.getItem(KEY); if (LANGS[s]) return s; } catch (e) {}
  const n = ((navigator.languages && navigator.languages[0]) || navigator.language || "it").slice(0, 2).toLowerCase();
  return LANGS[n] ? n : "it";
}
function T(s, vars) {
  let r = (lang !== "it" && dict[lang] && dict[lang][s]) || s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return r;
}
function apply(root) {
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(e => { e.textContent = T(e.getAttribute("data-i18n")); });
  [["data-i18n-aria", "aria-label"], ["data-i18n-title", "title"], ["data-i18n-ph", "placeholder"]].forEach(([a, t]) =>
    root.querySelectorAll("[" + a + "]").forEach(e => e.setAttribute(t, T(e.getAttribute(a)))));
}
function set(l) {
  if (!LANGS[l]) return;
  lang = l; try { localStorage.setItem(KEY, l); } catch (e) {}
  document.documentElement.lang = l; apply(); subs.forEach(f => { try { f(l); } catch (e) { console.error(e); } });
}
// Dati con campi per lingua (meaning_it, meaning_en, meaning_es...): lingua scelta -> inglese -> italiano -> campo base.
function pick(o, base) {
  if (!o) return "";
  return o[base + "_" + lang] || (lang === "es" ? o[base + "_en"] : "") || o[base + "_en"] || o[base + "_it"] || o[base] || "";
}
lang = detect(); document.documentElement.lang = lang;
window.I18n = { LANGS, get lang() { return lang; }, t: T, apply, set, pick, onChange: f => subs.push(f), register: (l, d) => { dict[l] = Object.assign(dict[l] || {}, d); if (l === lang) apply(); } };
window.T = T;
})();
