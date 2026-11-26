/* Caricamento a richiesta dei moduli pesanti (Scrittura, Lettura, Parlato, Calligrafia, menu a rullo).
   All'avvio il sito carica solo lo studio (HSK 1 + interfaccia). Qui ogni modulo è rappresentato da un "segnaposto" con la stessa API
   (mount / show / refresh / hide): alla prima chiamata utile scarica gli script veri, rifà le chiamate in coda e il segnaposto viene
   sostituito dal modulo reale. Dopo l'avvio, a browser inattivo, i moduli vengono scaricati comunque in background (precaricamento),
   così il primo clic su una sezione è già istantaneo. Lazy.all() = promessa "tutto pronto" (usata dai test). */
(function () {
"use strict";
const base = (document.currentScript && document.currentScript.src || "").replace(/[^/]*$/, "");
const loaded = {}, loading = {};
const file = f => loaded[f] ? Promise.resolve() : loading[f] || (loading[f] = new Promise((res, rej) => {
  const s = document.createElement("script"); s.src = base + f; s.async = false;
  s.onload = () => { loaded[f] = 1; res(); }; s.onerror = () => { delete loading[f]; rej(new Error("script " + f)); }; document.head.append(s);
}));
const seq = fs => fs.reduce((p, f) => p.then(() => file(f)), Promise.resolve());
const mods = {};
function def(name, files, loadOnMount) {
  const st = { q: [], mounts: [], real: null, p: null };
  const load = () => st.p || (st.p = seq(files).then(() => {
    const R = window[name]; st.real = R;
    st.mounts.forEach(m => { const h = R.mount(...m.args); if (m.handle) m.handle.bind(h); });
    st.q.forEach(([k, a]) => { try { R[k](...a); } catch (e) { console.error(name + "." + k, e); } });
    st.q = []; st.mounts = []; return R;
  }).catch(e => { st.p = null; console.error(e); throw e; }));
  const queue = (k, a) => { st.q = st.q.filter(x => x[0] !== k); st.q.push([k, a]); };
  const stub = {
    mount(...args) {
      if (st.real) return st.real.mount(...args);
      let real = null, last = null; const handle = { set: (...a) => { if (real) real.set(...a); else last = a; } };
      st.mounts.push({ args, handle: { bind: h => { real = h; if (last && h && h.set) h.set(...last); } } });
      if (loadOnMount) load().catch(() => {}); return handle;
    },
    hide() { if (st.real) st.real.hide(); },
    show(...a) { if (st.real) return st.real.show(...a); queue("show", a); load().catch(() => {}); },
    refresh(...a) { if (st.real) return st.real.refresh(...a); queue("refresh", a); load().catch(() => {}); }
  };
  mods[name] = { load, stub }; window[name] = stub;
}
def("Writing", ["detector.js", "checker.js", "annot.js", "writing.js"]);
def("Reading", ["reading.js"]);
def("Speaking", ["detector.js", "checker.js", "annot.js", "wave.js", "speaking.js"]);
def("Calli", ["calli.js"]);
def("Listen", ["listen.js"]);
def("Grammar", ["grammar.js"]);
def("Roller", ["roller.js"], true);
const api = window.Lazy = { all: () => Promise.all(Object.keys(mods).map(k => mods[k].load())), load: n => mods[n] && mods[n].load(), loaded: f => !!loaded[f] };
const idle = window.requestIdleCallback || (f => setTimeout(f, 800));
window.addEventListener("load", () => setTimeout(() => idle(() => { api.all().catch(() => {}); }, { timeout: 4000 }), 600));
})();
