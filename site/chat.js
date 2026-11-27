/* Chat con "Lin", amico e tutor di cinese. Durante la conversazione nessuna correzione (flusso naturale); con "Termina e analizza"
   il Worker produce riepilogo, trascrizione e tabella di correzioni. La conversazione resta sul dispositivo (localStorage "hsk.chat.cur")
   e viene inviata al servizio IA solo per rispondere/analizzare; non viene salvata sul server. */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s, lang = () => (window.I18n && I18n.lang) || "it";
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const KEY = "hsk.chat.cur", MAXTURNS = 40;
let host, opts, S = { msgs: [], py: true, tr: false }, busy = false, review = null, ui = {}, quota = null;
try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && Array.isArray(o.msgs)) S = Object.assign(S, o); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ msgs: S.msgs.slice(-MAXTURNS), py: S.py, tr: S.tr })); } catch (e) {} };
const greeting = () => ({ role: "assistant", text: "你好！我是林。你叫什么名字？", py: "Nǐ hǎo! Wǒ shì Lín. Nǐ jiào shénme míngzi?", tr: T("Ciao! Sono Lin. Come ti chiami?") });
async function call(task, extra) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(HSKAI.endpoint(), { method: "POST", headers: HSKAI.headers(), body: JSON.stringify(Object.assign({ task, level: opts.getLevel(), lang: lang(), messages: S.msgs.map(m => ({ role: m.role, text: m.text })) }, extra)), signal: ctl.signal });
    const j = await r.json().catch(() => null);
    if (r.status === 401 && window.HSKAuth) HSKAuth.invalidate();
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || T("Errore del servizio ({s})", { s: r.status })); e.upgrade = !!(j && j.upgrade); throw e; }
    if (j.quota) quota = j.quota; return j.result;
  } catch (e) { if (e.name === "AbortError") throw new Error(T("Il servizio AI non ha risposto in tempo. Riprova tra poco.")); if (e instanceof TypeError) throw new Error(T("Impossibile contattare il servizio AI (rete o configurazione).")); throw e; }
  finally { clearTimeout(to); }
}
function gate() {   // l'IA deve essere attiva (e, se richiesto, l'utente deve aver fatto il login)
  const w = el("div", "ch-wrap"); w.append(el("h2", "", T("Chat con Lin")));
  const info = (window.HSKAI && HSKAI.info && HSKAI.info()) || {};
  const needs = window.HSKAI && HSKAI.needsLogin();
  w.append(el("p", "hint", needs ? T("Accedi con Google per chattare con il tutor.") : window.HSKAI && !HSKAI.enabled() ? T("L’IA è disattivata: attivala con l’interruttore in alto per usare la chat.") : T("La chat usa l’IA, che non è disponibile in questo momento (server non configurato o non raggiungibile).")));
  if (needs && window.Account) { const b = el("button", "btn big", T("Accedi")); b.type = "button"; b.onclick = () => Account.open(); w.append(b); }
  host.replaceChildren(w);
}
function bubble(m, i) {
  const b = el("div", "ch-msg " + (m.role === "user" ? "me" : "lin")), t = el("div", "ch-zh zh", m.text); b.append(t);
  if (m.role === "assistant") {
    if (S.py && m.py) b.append(el("div", "ch-py", m.py));
    if (S.tr && m.tr) b.append(el("div", "ch-tr", m.tr));
    const s = el("button", "ch-say"); s.type = "button"; s.append(el("span", "ic ic-sound")); s.setAttribute("aria-label", T("Ascolta")); s.onclick = () => opts.speak(m.text); b.append(s);
  }
  return b;
}
function drawLog() {
  ui.log.replaceChildren(...S.msgs.map(bubble)); if (busy) { const d = el("div", "ch-msg lin ch-typing"); d.append(el("i"), el("i"), el("i")); d.setAttribute("aria-label", T("Lin sta scrivendo")); ui.log.append(d); }
  ui.log.scrollTop = ui.log.scrollHeight; ui.end.disabled = busy || !S.msgs.some(m => m.role === "user");
}
function note(text, upgrade) {
  ui.note.replaceChildren(el("span", "", text));
  if (upgrade && window.Pro) { const b = el("button", "btn big", T("Passa a Pro")); b.type = "button"; b.onclick = () => Pro.upgrade(); ui.note.append(b); }
  ui.note.hidden = !text;
}
async function send() {
  const v = ui.ta.value.trim(); if (!v || busy) return;
  ui.ta.value = ""; S.msgs.push({ role: "user", text: v.slice(0, 600) }); busy = true; note(""); save(); drawLog();
  try {
    const r = await call("chat");
    S.msgs.push({ role: "assistant", text: String(r.reply || "…"), py: String(r.pinyin || ""), tr: String(r.translation || "") });
    if (quota && quota.plan === "free" && quota.limit - quota.used <= 3) note(quota.used >= quota.limit ? T("Hai usato tutti i messaggi gratuiti di oggi.") : T("Messaggi gratuiti rimasti oggi: {n}.", { n: quota.limit - quota.used }), quota.used >= quota.limit);
  } catch (e) { S.msgs.pop(); ui.ta.value = v; note(e.message, e.upgrade); }
  busy = false; save(); drawLog(); ui.ta.focus();
}
async function finish() {
  if (busy) return; busy = true; ui.end.disabled = true; drawLog(); note(T("Sto analizzando la conversazione…"));
  try { review = await call("chat_review"); draw(); } catch (e) { busy = false; drawLog(); note(e.message, e.upgrade); return; }
  busy = false;
}
function toggle(label, key) { const l = el("label", "chk"), c = el("input"); c.type = "checkbox"; c.checked = S[key]; c.onchange = () => { S[key] = c.checked; save(); drawLog(); }; l.append(c, " " + label); return l; }
function chatView() {
  const w = el("div", "ch-wrap"); w.append(el("h2", "", T("Chat con Lin")), el("p", "hint", T("Chiacchiera liberamente in cinese: Lin non ti interrompe e non ti corregge. Quando hai finito, premi «Termina e analizza» per vedere gli errori e le spiegazioni.")));
  const bar = el("div", "ch-bar"); bar.append(toggle(T("Pinyin"), "py"), toggle(T("Traduzione"), "tr"));
  const end = el("button", "btn", T("Termina e analizza")); end.type = "button"; end.onclick = finish; bar.append(end);
  const log = el("div", "ch-log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
  const nt = el("div", "ch-note"); nt.hidden = true;
  const form = el("form", "ch-form"), ta = el("textarea"); ta.rows = 1; ta.placeholder = T("Scrivi in cinese…"); ta.lang = "zh-Hans"; ta.setAttribute("aria-label", T("Il tuo messaggio")); ta.maxLength = 600;
  const sb = el("button", "btn big", T("Invia")); sb.type = "submit";
  ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };   // isComposing: non invia mentre si sceglie un carattere con l'IME
  form.onsubmit = e => { e.preventDefault(); send(); }; form.append(ta, sb);
  w.append(bar, log, nt, form, el("p", "hint", T("I messaggi vengono inviati al servizio IA solo per rispondere e analizzare; la conversazione resta su questo dispositivo.")));
  host.replaceChildren(w); ui = { log, note: nt, ta, end };
  if (!S.msgs.length) { S.msgs.push(greeting()); save(); }
  drawLog();
}
const TYPE = { grammar: "Grammatica", word: "Parola", classifier: "Classificatore", particle: "Particella", order: "Ordine delle parole", tone_pinyin: "Toni/pinyin", naturalness: "Naturalezza", other: "Altro" };
function draw() {
  if (!review) return chatView();
  const w = el("div", "ch-wrap"), r = review; w.append(el("h2", "", T("Analisi della conversazione")), el("p", "ch-sum", r.summary || ""));
  const corr = Array.isArray(r.corrections) ? r.corrections : [];
  w.append(el("h3", "", T("Correzioni")));
  if (!corr.length) w.append(el("p", "hint", T("Nessun errore rilevante: ottimo lavoro!")));
  else { const tb = el("table", "ch-tab"), th = el("thead"), hr = el("tr"); [T("Tu hai scritto"), T("Meglio così"), T("Spiegazione")].forEach(x => hr.append(el("th", "", x))); th.append(hr); tb.append(th);
    const bd = el("tbody"); corr.forEach(c => { const tr = el("tr"); const a = el("td", "zh bad", c.original), b = el("td", "zh ok", c.corrected), d = el("td"); d.append(el("span", "ch-type", T(TYPE[c.type] || TYPE.other)), " " + (c.explanation || "")); a.dataset.l = T("Tu hai scritto"); b.dataset.l = T("Meglio così"); d.dataset.l = T("Spiegazione"); tr.append(a, b, d); bd.append(tr); }); tb.append(bd); w.append(el("div", "ch-tabw")); w.lastChild.append(tb); }
  const lst = (title, a) => { if (a && a.length) { w.append(el("h3", "", title)); const u = el("ul", "ch-ul"); a.forEach(x => u.append(el("li", "", x))); w.append(u); } };
  lst(T("Punti di forza"), r.strengths); lst(T("Consigli"), r.tips);
  w.append(el("h3", "", T("Trascrizione")));
  const tr = el("div", "ch-trans"); S.msgs.forEach(m => { const p = el("p", m.role === "user" ? "me" : "lin"); p.append(el("b", "", m.role === "user" ? T("Tu") : "Lin"), el("span", "zh", " " + m.text)); tr.append(p); }); w.append(tr);
  const acts = el("div", "acts"), nw = el("button", "btn big", T("Nuova conversazione")), cp = el("button", "btn", T("Copia trascrizione")); nw.type = cp.type = "button";
  nw.onclick = () => { S.msgs = []; review = null; save(); chatView(); };
  cp.onclick = () => { const txt = S.msgs.map(m => (m.role === "user" ? T("Tu") : "Lin") + ": " + m.text).join("\n"); try { navigator.clipboard.writeText(txt); cp.textContent = T("Copiato"); } catch (e) {} };
  const bk = el("button", "btn", T("Torna alla chat")); bk.type = "button"; bk.onclick = () => { review = null; chatView(); };
  acts.append(nw, cp, bk); w.append(acts); host.replaceChildren(w); host.scrollIntoView({ block: "start" });
}
window.Chat = { mount(h, o) { host = h; opts = o; }, show() { if (!host) return; if (!(window.HSKAI && HSKAI.on())) return gate(); draw(); }, refresh() { this.show(); }, hide() {} };
document.addEventListener("hsk-ai-change", () => { if (host && !host.hidden) window.Chat.show(); });
})();
