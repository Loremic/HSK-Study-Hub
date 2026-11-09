/* Community / Forum.  window.Forum
 *
 * Due modalità, stesso codice di interfaccia:
 *  - REMOTA: parla con il worker (task forum_*, database D1). Moderazione, voti e limiti sono decisi dal SERVER.
 *  - LOCALE: se non c'è endpoint o il worker non ha il database. I messaggi restano in localStorage su questo dispositivo
 *            (solo per provare): la schermata lo dichiara. Usa lo stesso filtro, ma senza moderatore umano.
 * Il filtro nel browser (moderation.js) serve solo ad avvisare subito; non è mai l'unico controllo.
 * Tutto il testo degli utenti entra nella pagina SOLO con textContent (mai innerHTML).
 */
(function () {
"use strict";
const CFG = window.HSK_CONFIG || {};
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const lang = () => window.I18n ? I18n.lang : "it";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const ssGet = k => { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } };
const ssSet = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) {} };
const ENDPOINT = ((CFG.FORUM && CFG.FORUM.endpoint) || CFG.AI_ENDPOINT || "").trim();
const LOCAL_KEY = "hsk.forum.local", ID_KEY = "hsk.forum.id", NICK_KEY = "hsk.forum.nick", SORT_KEY = "hsk.forum.sort";
const NICK_RE = /^[\p{L}\p{N}_ .\-]{2,20}$/u, RESERVED = /^(admin|administrator|moderator|moderatore|mod|staff|freedeas|claude|anthropic|sistema|system)$/i;

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const rnd = n => { const a = new Uint8Array(n); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); };
function voter() { let v = lsGet(ID_KEY, ""); if (!/^[A-Za-z0-9_-]{16,64}$/.test(v)) { v = rnd(16); lsSet(ID_KEY, v); } return v; }
function ago(ts) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  try { const f = new Intl.RelativeTimeFormat(lang(), { numeric: "auto" });
    if (s < 60) return f.format(0, "second"); if (s < 3600) return f.format(-Math.floor(s / 60), "minute"); if (s < 86400) return f.format(-Math.floor(s / 3600), "hour"); if (s < 86400 * 30) return f.format(-Math.floor(s / 86400), "day");
    return new Date(ts * 1000).toLocaleDateString(lang());
  } catch (e) { return new Date(ts * 1000).toLocaleDateString(); }
}

/* ------------------------------------------------------------------ messaggi per categoria di moderazione */
const CAT = {
  insult: "Contiene insulti o linguaggio offensivo.", homophobic: "Contiene espressioni omofobe.", racist: "Contiene espressioni razziste.", violence: "Contiene minacce o violenza.",
  blasphemy: "Contiene bestemmie o offese alla religione.", group_hate: "Svaluta un gruppo di persone.", religion: "Tocca la religione in modo non ammesso.",
  politics: "Contiene temi politici.", link: "Contiene un link.", spam: "Sembra spam.", personal_data: "Contiene dati personali (email o telefono)."
};
const catList = cats => (cats || []).filter(c => CAT[c]).map(c => tx(CAT[c]));

/* ------------------------------------------------------------------ backend LOCALE (stessa interfaccia del worker) */
const Local = (() => {
  const load = () => Object.assign({ posts: [], comments: [], votes: {} }, lsGet(LOCAL_KEY, {}));
  const save = d => lsSet(LOCAL_KEY, d);
  const err = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
  const hot = (r, t) => (r.score + 1 + 0.3 * r.ncomments) / Math.pow((t - r.ts) / 3600 + 2, 1.35);
  const view = (d, r, kind) => Object.assign({}, r, { my_vote: d.votes[(kind === "p" ? "p_" : "c_") + r.id] || 0, mine: true });
  const judge = fields => { const M = window.Moderation; let v = "ok", cats = new Set(); if (!M) return { verdict: v, cats: [] }; for (const [k, t] of fields) { const r = M.moderate(t, k); r.cats.forEach(c => cats.add(c)); if (r.verdict === "block") v = "block"; else if (r.verdict === "review" && v !== "block") v = "review"; } return { verdict: v, cats: [...cats] }; };
  const checkNick = n => { if (!NICK_RE.test(n) || RESERVED.test(n)) throw err(400, "Nome non valido (2–20 caratteri; alcuni nomi sono riservati).", { field: "nick" }); };
  const gate = j => { if (j.verdict === "block") throw err(422, "Contenuto non consentito.", { reasons: j.cats }); if (j.verdict === "review") throw err(422, "Richiede revisione", { reasons: j.cats, local_review: true }); };
  return {
    async forum_list(b) {
      const d = load(), t = Date.now() / 1000; let a = d.posts.filter(p => p.status === "ok");
      if (b.sort === "new") a.sort((x, y) => y.ts - x.ts); else if (b.sort === "top") a.sort((x, y) => y.score - x.score || y.ts - x.ts); else a.sort((x, y) => hot(y, t) - hot(x, t));
      return { posts: a.slice(0, 40).map(p => Object.assign(view(d, p, "p"), { body: p.body.slice(0, 280) })) };
    },
    async forum_get(b) {
      const d = load(), p = d.posts.find(x => x.id === b.id); if (!p) throw err(404, "Post non trovato.");
      const cs = d.comments.filter(c => c.post_id === p.id).sort((x, y) => y.score - x.score || x.ts - y.ts).map(c => view(d, c, "c"));
      return { post: view(d, p, "p"), comments: cs };
    },
    async forum_post(b) {
      checkNick(b.nick); const title = String(b.title).trim(), body = String(b.body).trim();
      if (title.length < 3 || title.length > 120) throw err(400, "Il titolo deve avere tra 3 e 120 caratteri.", { field: "title" });
      if (body.length < 2 || body.length > 4000) throw err(400, "Il testo deve avere tra 2 e 4000 caratteri.", { field: "body" });
      gate(judge([["nick", b.nick], ["title", title], ["body", body]]));
      const d = load(), p = { id: rnd(8), ts: Math.floor(Date.now() / 1000), author: b.nick, title, body, status: "ok", score: 0, ncomments: 0, pinned: 0, admin: 0 };
      d.posts.push(p); save(d); return { id: p.id, status: "ok" };
    },
    async forum_comment(b) {
      checkNick(b.nick); const body = String(b.body).trim(); if (body.length < 1 || body.length > 1500) throw err(400, "Il commento deve avere tra 1 e 1500 caratteri.", { field: "body" });
      const d = load(), p = d.posts.find(x => x.id === b.post_id); if (!p) throw err(404, "Post non trovato.");
      gate(judge([["nick", b.nick], ["body", body]]));
      d.comments.push({ id: rnd(8), post_id: p.id, ts: Math.floor(Date.now() / 1000), author: b.nick, body, status: "ok", score: 0, admin: 0 });
      p.ncomments = d.comments.filter(c => c.post_id === p.id).length; save(d); return { status: "ok" };
    },
    async forum_vote(b) {
      const d = load(), key = b.target, rec = (key[0] === "p" ? d.posts : d.comments).find(x => x.id === key.slice(2)); if (!rec) throw err(404, "Contenuto non trovato.");
      // in locale gli autori siamo tutti noi: il voto è consentito per poter provare la funzione (nel server non è possibile votare il proprio contenuto)
      const prev = d.votes[key] || 0; rec.score += b.v - prev; if (b.v) d.votes[key] = b.v; else delete d.votes[key]; save(d); return { score: rec.score, my_vote: b.v };
    },
    async forum_report() { return { ok: true, hidden: false }; },
    async forum_delete(b) {
      const d = load(), id = b.target.slice(2);
      if (b.target[0] === "p") { d.posts = d.posts.filter(p => p.id !== id); d.comments = d.comments.filter(c => c.post_id !== id); }
      else { const c = d.comments.find(x => x.id === id); d.comments = d.comments.filter(x => x.id !== id); const p = c && d.posts.find(x => x.id === c.post_id); if (p) p.ncomments = d.comments.filter(x => x.post_id === p.id).length; }
      save(d); return { ok: true };
    }
  };
})();

/* ------------------------------------------------------------------ chiamata (remota con ricaduta sul locale) */
const S = { root: null, mode: ENDPOINT ? "remote" : "local", sort: lsGet(SORT_KEY, "hot"), view: "list", postId: null, busy: false, composer: false, notice: "", admin: ssGet("hsk.forum.mod") };
async function api(task, body) {
  body = Object.assign({ task, voter: voter() }, body || {});
  if (S.mode === "local") return Local[task](body);
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  let r, j = null;
  try { r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); try { j = await r.json(); } catch (e) {} }
  catch (e) { throw Object.assign(new Error(e.name === "AbortError" ? tx("Il server non ha risposto in tempo. Riprova.") : tx("Impossibile contattare il forum (rete o configurazione).")), { status: 0 }); }
  finally { clearTimeout(to); }
  if (r.status === 501 && task !== "forum_admin") { S.mode = "local"; S.notice = "local501"; return Local[task](body); }       // worker senza database: modalità locale
  if (!r.ok || !j || j.ok === false) throw Object.assign(new Error(tx((j && j.error) || "Errore del forum.")), { status: r.status, reasons: j && j.reasons, field: j && j.field });
  return j.result;
}
const say = (box, text, kind) => { box.className = "wr-msg" + (kind ? " " + kind : ""); box.textContent = text || ""; box.hidden = !text; };

/* ------------------------------------------------------------------ elementi comuni */
function voteCol(kind, item, onChange) {
  const key = (kind === "p" ? "p_" : "c_") + item.id; let v = item.my_vote || 0, score = item.score;
  const up = h("button", { type: "button", class: "fo-v", "aria-label": tx("Voto positivo") }, "▲"), down = h("button", { type: "button", class: "fo-v", "aria-label": tx("Voto negativo") }, "▼");
  const num = h("div", { class: "fo-score", "aria-live": "polite" });
  const paint = () => { up.setAttribute("aria-pressed", String(v === 1)); down.setAttribute("aria-pressed", String(v === -1)); num.textContent = score; };
  async function click(dir) {
    const nv = v === dir ? 0 : dir, prev = { v, score }; score += nv - v; v = nv; paint();                // ottimistico
    try { const r = await api("forum_vote", { target: key, v: nv }); score = r.score; v = r.my_vote; paint(); onChange && onChange(score); }
    catch (e) { v = prev.v; score = prev.score; paint(); S.flash && S.flash(e.status === 403 ? tx("Non puoi votare un tuo contenuto.") : e.status === 429 ? tx("Stai andando troppo veloce: riprova tra poco.") : e.message, "warn"); }
  }
  up.onclick = () => click(1); down.onclick = () => click(-1); paint();
  return h("div", { class: "fo-votes" }, up, num, down);
}
function actions(kind, item, after) {
  const key = (kind === "p" ? "p_" : "c_") + item.id, row = h("span", { class: "fo-act" });
  const rep = h("button", { type: "button", class: "fo-lnk", onclick: async ev => { if (!confirm(tx("Segnalare questo contenuto ai moderatori?"))) return; ev.target.disabled = true;
    try { const r = await api("forum_report", { target: key }); ev.target.textContent = tx("Segnalato"); if (r.hidden) after && after(); } catch (e) { ev.target.disabled = false; S.flash(e.message, "warn"); } } }, tx("Segnala"));
  row.append(rep);
  if (item.mine) row.append(h("button", { type: "button", class: "fo-lnk", onclick: async () => { if (!confirm(tx("Eliminare questo contenuto?"))) return; try { await api("forum_delete", { target: key }); after && after(true); } catch (e) { S.flash(e.message, "warn"); } } }, tx("Elimina")));
  if (S.admin && S.mode === "remote") row.append(h("button", { type: "button", class: "fo-lnk bad", onclick: async () => { if (!confirm(tx("Eliminare come moderatore?"))) return; try { await api("forum_admin", { token: S.admin, action: "delete", target: key }); after && after(true); } catch (e) { S.flash(e.message, "warn"); } } }, tx("Elimina (mod)")));
  return row;
}
const meta = it => h("div", { class: "fo-meta" }, it.pinned ? h("span", { class: "tag" }, "📌 " + tx("Fissato")) : null, it.admin ? h("span", { class: "tag" }, tx("Staff")) : null, h("b", null, it.author), " · ", ago(it.ts));

/* ------------------------------------------------------------------ composer */
function composer(kind, onDone, postId) {
  const nick = h("input", { type: "text", maxlength: "20", autocomplete: "nickname", "aria-label": tx("Il tuo nome"), placeholder: tx("Il tuo nome (2–20 caratteri)") }); nick.value = lsGet(NICK_KEY, "");
  const title = kind === "p" ? h("input", { type: "text", maxlength: "120", "aria-label": tx("Titolo"), placeholder: tx("Titolo") }) : null;
  const body = h("textarea", { rows: kind === "p" ? "6" : "3", maxlength: kind === "p" ? "4000" : "1500", "aria-label": tx("Testo"), placeholder: kind === "p" ? tx("Scrivi qui la tua domanda, novità o discussione…") : tx("Scrivi un commento…") });
  const msg = h("p", { class: "wr-msg", hidden: true, role: "alert" });
  const go = h("button", { type: "button", class: "btn big" }, kind === "p" ? tx("Pubblica") : tx("Commenta"));
  go.onclick = async () => {
    const n = nick.value.trim(); say(msg, "");
    // controllo rapido nel browser (solo per avvisare: il server ripete tutto)
    if (!NICK_RE.test(n) || RESERVED.test(n)) return say(msg, tx("Nome non valido (2–20 caratteri; alcuni nomi sono riservati)."), "bad");
    const M = window.Moderation;
    if (M) { const fields = [["nick", n], ["body", body.value]].concat(title ? [["title", title.value]] : []); const cats = new Set(); let blocked = false;
      fields.forEach(([k, t]) => { const r = M.moderate(t, k); r.cats.forEach(c => cats.add(c)); if (r.verdict === "block") blocked = true; });
      if (blocked) return say(msg, tx("Non posso pubblicarlo.") + " " + catList([...cats]).join(" ") + " " + tx("Riformula il testo e riprova."), "bad"); }
    go.disabled = true; say(msg, tx("Invio in corso…"));
    try {
      lsSet(NICK_KEY, n);
      const r = await api(kind === "p" ? "forum_post" : "forum_comment", kind === "p" ? { nick: n, title: title.value, body: body.value } : { nick: n, body: body.value, post_id: postId });
      body.value = ""; if (title) title.value = "";
      if (r.status === "pending") S.keepFlash = { t: tx("Grazie! Il tuo messaggio contiene un tema che richiede la revisione di un moderatore: sarà pubblicato dopo l’approvazione."), k: "ok" };   // sopravvive al render successivo
      say(msg, ""); onDone && onDone(r);
    } catch (e) {
      if (e.status === 422 && e.local_review) say(msg, tx("Questo testo richiede la revisione di un moderatore, che nella modalità locale non esiste: non viene pubblicato.") + " " + catList(e.reasons).join(" "), "warn");
      else if (e.status === 422) say(msg, tx("Non posso pubblicarlo.") + " " + catList(e.reasons).join(" ") + " " + tx("Riformula il testo e riprova."), "bad");
      else say(msg, e.message, "bad");
    } finally { go.disabled = false; }
  };
  return h("div", { class: "fo-comp" }, nick, title, body, h("div", { class: "acts wr-left" }, go), msg,
    h("p", { class: "hint" }, tx("Prima della pubblicazione il testo viene controllato. Niente insulti, discriminazioni, politica, religione offensiva, spam o dati personali.")));
}

/* ------------------------------------------------------------------ viste */
function render() {
  const R = S.root; R.replaceChildren();
  S.flashBox = h("p", { class: "wr-msg", hidden: true, role: "status" });
  S.flash = (t, k) => { say(S.flashBox, t, k); if (t) S.flashBox.scrollIntoView({ block: "nearest" }); };
  put(R, h("h2", null, tx("Community")), h("p", { class: "hint" }, tx("Domande, novità e discussioni sullo studio del cinese. I messaggi più votati salgono in alto.")));
  if (S.mode === "local") put(R, h("div", { class: "wr-msg warn" }, tx("Modalità locale: i messaggi restano solo su questo dispositivo e non sono visibili agli altri. Per un forum condiviso serve il server con database (vedi README).")));
  put(R, S.flashBox);
  if (S.keepFlash) { S.flash(S.keepFlash.t, S.keepFlash.k); S.keepFlash = null; }
  if (S.view === "mod") modView(R); else if (S.view === "thread") threadView(R); else listView(R);
  put(R, modLink());
}
const put = (p, ...k) => { for (const c of k.flat(Infinity)) if (c != null && c !== false) p.append(c); return p; };

async function listView(R) {
  const sorts = [["hot", tx("Rilevanti")], ["top", tx("Più votati")], ["new", tx("Recenti")]];
  const seg = h("div", { class: "seg", role: "group", "aria-label": tx("Ordina per") }, sorts.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(S.sort === k), onclick: () => { S.sort = k; lsSet(SORT_KEY, k); render(); } }, l)));
  const box = h("div", { class: "fo-list", "aria-busy": "true" }, h("p", { class: "hint" }, tx("Caricamento…")));
  const comp = h("div", { class: "wr-card", hidden: !S.composer }, h("h3", null, tx("Nuovo post")), composer("p", r => { S.composer = false; render(); }));
  put(R, h("details", { class: "fo-rules" }, h("summary", null, tx("Regole del forum")), h("ul", null, [
    "Rispetto per tutti: niente insulti né linguaggio offensivo.", "Niente discriminazioni (omofobia, razzismo, odio verso gruppi o religioni).", "Niente politica e niente propaganda: qui si parla di studio del cinese.",
    "Niente link promozionali, spam o dati personali (email, telefono).", "I contenuti segnalati possono essere nascosti e controllati dai moderatori."].map(x => h("li", null, tx(x))))));
  put(R, h("div", { class: "acts wr-left fo-bar" }, seg, h("button", { type: "button", class: "btn", onclick: render }, "↻ " + tx("Aggiorna")),
    h("button", { type: "button", class: "btn big", onclick: () => { S.composer = !S.composer; comp.hidden = !S.composer; if (S.composer) comp.scrollIntoView({ block: "nearest" }); } }, "＋ " + tx("Nuovo post"))), comp, box);
  try {
    const r = await api("forum_list", { sort: S.sort }); box.replaceChildren(); box.removeAttribute("aria-busy");
    if (S.notice === "local501") { S.notice = ""; return render(); }
    if (!r.posts.length) return put(box, h("p", { class: "hint" }, tx("Ancora nessun post: scrivi tu il primo!")));
    r.posts.forEach(p => put(box, h("article", { class: "fo-item" + (p.pinned ? " pin" : "") }, voteCol("p", p),
      h("div", { class: "fo-main" }, h("button", { type: "button", class: "fo-title", onclick: () => { S.view = "thread"; S.postId = p.id; render(); } }, p.title), meta(p),
        h("p", { class: "fo-snip" }, p.body), h("div", { class: "fo-foot" }, "💬 " + tx("{n} commenti", { n: p.ncomments }))))));
  } catch (e) { box.replaceChildren(h("p", { class: "wr-msg bad" }, e.message)); }
}

async function threadView(R) {
  const back = h("button", { type: "button", class: "btn", onclick: () => { S.view = "list"; render(); } }, "← " + tx("Torna ai post"));
  const box = h("div", { "aria-busy": "true" }, h("p", { class: "hint" }, tx("Caricamento…")));
  put(R, back, box);
  try {
    const r = await api("forum_get", { id: S.postId }), p = r.post; box.replaceChildren(); box.removeAttribute("aria-busy");
    const goList = () => { S.view = "list"; render(); };
    put(box, h("article", { class: "fo-item fo-full" }, voteCol("p", p), h("div", { class: "fo-main" }, h("h3", { class: "fo-h" }, p.title), meta(p), h("p", { class: "fo-body" }, p.body), actions("p", p, goList))));
    put(box, h("h3", { class: "wr-h3" }, tx("{n} commenti", { n: r.comments.length })));
    r.comments.forEach(c => put(box, h("div", { class: "fo-item fo-c" }, voteCol("c", c), h("div", { class: "fo-main" }, meta(c), h("p", { class: "fo-body" }, c.body), actions("c", c, () => render())))));
    put(box, h("div", { class: "wr-card" }, h("h3", null, tx("Il tuo commento")), composer("c", () => render(), p.id)));
  } catch (e) { box.replaceChildren(h("p", { class: "wr-msg bad" }, e.message)); }
}

/* ------------------------------------------------------------------ pannello moderatore (solo modalità remota) */
async function modView(R) {
  put(R, h("button", { type: "button", class: "btn", onclick: () => { S.view = "list"; render(); } }, "← " + tx("Torna ai post")), h("h3", { class: "wr-h3" }, tx("Pannello moderatore")));
  const box = h("div", null, h("p", { class: "hint" }, tx("Caricamento…"))); put(R, box);
  const call = (b) => api("forum_admin", Object.assign({ token: S.admin }, b));
  try {
    const r = await call({ action: "pending" }); box.replaceChildren();
    const item = (kind, x) => h("div", { class: "fo-item" }, h("div", { class: "fo-main" }, x.title ? h("b", null, x.title) : null, h("div", { class: "fo-meta" }, h("b", null, x.author), " · ", ago(x.ts), x.reason ? h("span", { class: "tag" }, x.reason) : null), h("p", { class: "fo-body" }, x.body),
      h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: async () => { await call({ action: "approve", target: (kind === "p" ? "p_" : "c_") + x.id }); render(); } }, tx("Approva")),
        h("button", { type: "button", class: "btn", onclick: async () => { await call({ action: "delete", target: (kind === "p" ? "p_" : "c_") + x.id }); render(); } }, tx("Elimina")))));
    put(box, h("h4", null, tx("In attesa di revisione ({n})", { n: r.posts.length + r.comments.length })), r.posts.map(x => item("p", x)), r.comments.map(x => item("c", x)), r.posts.length + r.comments.length ? null : h("p", { class: "hint" }, tx("Niente da rivedere.")));
    const t = h("input", { type: "text", maxlength: "120", "aria-label": tx("Titolo"), placeholder: tx("Titolo dell’annuncio") }), b = h("textarea", { rows: "4", "aria-label": tx("Testo"), placeholder: tx("Testo dell’annuncio") }), pin = h("input", { type: "checkbox" });
    put(box, h("div", { class: "wr-card" }, h("h3", null, tx("Pubblica un annuncio")), t, b, h("label", { class: "hint fo-chk" }, pin, " " + tx("Fissa in alto")),
      h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn big", onclick: async () => { try { await call({ action: "post", title: t.value, body: b.value, pinned: pin.checked }); S.view = "list"; render(); } catch (e) { S.flash(e.message, "bad"); } } }, tx("Pubblica")))));
    put(box, h("button", { type: "button", class: "btn", onclick: () => { S.admin = ""; ssSet("hsk.forum.mod", ""); S.view = "list"; render(); } }, tx("Esci dal pannello")));
  } catch (e) { S.admin = ""; ssSet("hsk.forum.mod", ""); S.view = "list"; render(); S.flash(e.status === 403 ? tx("Accesso moderatore negato.") : e.message, "bad"); }
}
function modLink() {
  if (S.mode !== "remote") return null;
  return h("p", { class: "hint fo-mod" }, h("button", { type: "button", class: "fo-lnk", onclick: async () => {
    if (!S.admin) { const t = prompt(tx("Codice moderatore:")); if (!t) return; S.admin = t.trim(); ssSet("hsk.forum.mod", S.admin); }
    S.view = "mod"; render(); } }, tx("Area moderatori")));
}

window.Forum = {
  mount(root) { S.root = root; },
  show() { render(); },
  refresh() { render(); },
  _t: { Local, CAT }
};
})();
