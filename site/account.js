/* Pannello Account: accesso con Google, stato del salvataggio cloud, azzeramento dei progressi (parziale o totale),
   esportazione e cancellazione dei dati, informativa privacy e nota di trasparenza sull'IA (Gemini). Usa HSKAuth, HSKSync, HSKAI. */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s;
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const CFG = (window.HSK_CONFIG && HSK_CONFIG.PRIVACY) || {};
const bar = document.querySelector(".hright"); if (!bar || !window.HSKAuth) return;
const btn = mk("button", "btn acbtn"); btn.type = "button"; btn.id = "accBtn"; btn.setAttribute("aria-haspopup", "dialog");
const aiw = bar.querySelector(".aiw"); bar.insertBefore(btn, aiw || bar.firstChild);

/* ---- testi: informativa e trasparenza IA (tradotti con i18n, chiave = testo italiano) ---- */
const PRIVACY = () => [
  ["Chi tratta i dati", CFG.controller ? T("Titolare del trattamento: {n}.", { n: CFG.controller }) + " " + (CFG.email ? T("Contatto per esercitare i diritti: {e}.", { e: CFG.email }) : T("Il contatto del titolare non è ancora stato impostato in config.js.")) : T("Il titolare del trattamento è l’autore del sito indicato nelle Info. Il contatto va impostato in config.js (PRIVACY).")],
  ["Quali dati", T("Se non accedi, i tuoi progressi restano solo in questo browser e non ci arriva nulla. Se accedi con Google riceviamo identificativo dell’account, nome, indirizzo email e foto del profilo (mai la password) e, se attivi il salvataggio, i tuoi progressi: parole studiate, statistiche, Calligrafia, Quaderno di scrittura, cronologie di lettura e parlato, livello, lingua e tema.")],
  ["A cosa servono", T("Servono a farti accedere, a salvare e riprendere i progressi su più dispositivi e a mostrarti il tuo nome. Non usiamo i dati per pubblicità né per profilazione e non li vendiamo.")],
  ["Correzione con l’IA (Gemini)", T("Solo quando chiedi una correzione o una valutazione, il testo, l’immagine o la registrazione che invii passa dal nostro server e viene inviato a Google (API Gemini) per essere analizzato. Il nostro server non conserva questi contenuti; può tenere per qualche giorno in una cache anonima il solo risultato della valutazione, per non ripeterla. Google tratta i contenuti secondo le condizioni dell’API Gemini.")],
  ["Dove e per quanto", T("I dati cloud sono su Cloudflare. Restano finché non li elimini: puoi azzerarli in parte o del tutto, o cancellare l’account, in qualsiasi momento da questo pannello.")],
  ["I tuoi diritti", T("Puoi accedere ai tuoi dati (Esporta i miei dati), correggerli, cancellarli, ottenerne copia e opporti al trattamento; puoi anche proporre reclamo all’autorità di controllo (in Italia, il Garante per la protezione dei dati personali). Per gli utenti sotto i 14 anni serve il consenso di un genitore.")],
  ["Sicurezza", T("L’accesso passa dal sistema ufficiale di Google. Il sito non vede la tua password. Il browser tiene un token di sessione di 30 giorni, che si cancella con Esci.")]
];
const AI_NOTE = () => T("Come valuta Gemini: l’IA di Google confronta il tuo testo (o la trascrizione del parlato) con il livello HSK scelto e con la consegna, e segnala grammatica, scelta delle parole, vocabolario e argomentazione, spiegando ogni correzione. Con una registrazione può anche ascoltare toni e pronuncia. È un aiuto automatico: può sbagliare e non sostituisce un insegnante, quindi controlla sempre le correzioni.");
window.HSKTransparency = { ai: AI_NOTE, note() { if (!(window.HSKAI && HSKAI.on() && HSKAI.info() && HSKAI.info().provider === "gemini")) return null; const p = mk("p", "aitrans", AI_NOTE()); p.setAttribute("data-ai-note", ""); return p; } };

/* ---- finestra ---- */
const dlg = mk("dialog", "acdlg"); dlg.id = "acDlg"; dlg.setAttribute("aria-labelledby", "acTitle"); document.body.append(dlg);
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
let privOpen = false;

function status() {
  const s = HSKSync.status(), at = s.at ? new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return s.s === "sync" ? T("Sincronizzazione in corso…") : s.s === "err" ? T("Salvataggio cloud non riuscito: {e}", { e: s.err }) : s.s === "ok" ? T("Progressi salvati nel cloud alle {t}.", { t: at }) : T("Salvataggio cloud attivo.");
}
const RESETS = [
  ["study", "Studio: flashcard, quiz e ripetizione", k => /^hsk1?\.progress/.test(k)],
  ["callig", "Calligrafia", k => k === "hsk.callig"],
  ["notes", "Quaderno di scrittura (testi e bozze)", k => /^hsk\.writing\./.test(k)],
  ["logs", "Cronologia di Lettura e Parlato", k => /^hsk\.(reading|speaking)\.log$/.test(k)]
];
const kids = (tag, cls, ...c) => { const e = mk(tag, cls); e.append(...c); return e; };
function section(title, ...kids) { const s = mk("section", "acs"); s.append(mk("h4", "", title), ...kids); return s; }
function draw() {
  const info = window.HSKAI && HSKAI.info(), signed = HSKAuth.signedIn(), u = HSKAuth.user(), root = mk("div", "acbox");
  const head = mk("div", "achead"); head.append(mk("h3", "", T("Account e dati")), Object.assign(mk("button", "btn acx", "✕"), { type: "button", onclick: () => dlg.close() })); head.firstChild.id = "acTitle"; head.lastChild.setAttribute("aria-label", T("Chiudi"));
  root.append(head);
  /* accesso */
  if (signed) {
    const row = mk("div", "acuser"); if (u.picture) { const im = mk("img"); im.src = u.picture; im.alt = ""; im.referrerPolicy = "no-referrer"; im.width = im.height = 40; row.append(im); }
    const d = mk("div"); d.append(mk("b", "", u.name || ""), mk("div", "hint", u.email || "")); row.append(d); root.append(row);
    const st = mk("p", "acst", status()); st.setAttribute("role", "status");
    const act = mk("div", "acact"); const sy = mk("button", "btn", T("Sincronizza ora")); sy.type = "button"; sy.onclick = async () => { sy.disabled = true; await HSKSync.syncNow(); sy.disabled = false; draw(); };
    const out = mk("button", "btn", T("Esci")); out.type = "button"; out.onclick = () => { HSKAuth.signOut(); draw(); };
    act.append(sy, out); root.append(st, act);
    if (!HSKSync.signed()) st.textContent = T("Accesso effettuato, ma questo server non ha il salvataggio cloud: i progressi restano su questo dispositivo.");
  } else if (!info || info.auth === "off") {
    root.append(section(T("Accesso con Google"), mk("p", "hint", info ? T("L’accesso con Google non è attivo su questo server: il sito funziona in locale e i progressi restano su questo dispositivo.") : T("Servizio non raggiungibile: il sito funziona in locale e i progressi restano su questo dispositivo."))));
  } else {
    const box = mk("div", "acg"), msg = mk("p", "hint acmsg");
    root.append(section(T("Accedi con Google"), mk("p", "hint", info.auth === "required" ? T("Per usare la correzione con l’IA e salvare i progressi nel cloud accedi con il tuo account Google. Senza accedere puoi comunque studiare: i progressi restano su questo dispositivo.") : T("Accedi per salvare i progressi nel cloud e ritrovarli su ogni dispositivo.")), box, msg,
      mk("p", "hint", T("Accedendo accetti il trattamento descritto nell’informativa qui sotto."))));
    HSKAuth.mountButton(box, err => { if (err) msg.textContent = err.message; else draw(); }).catch(e => { msg.textContent = e.message === "client" ? T("Client ID di Google non configurato sul server.") : T("Impossibile caricare l’accesso di Google (controlla la connessione o i blocchi del browser)."); });
  }
  /* trasparenza IA */
  const prov = info && info.provider === "gemini";
  root.append(section(T("Trasparenza sull’IA"), mk("p", "hint", prov || !info ? AI_NOTE() : T("La correzione con l’IA è fatta da un modello linguistico: può sbagliare e non sostituisce un insegnante."))));
  /* azzeramento */
  const lvSel = mk("select", "acsel"); lvSel.setAttribute("aria-label", T("Livello da azzerare")); lvSel.append(new Option(T("Tutti i livelli"), "all")); [["hsk1", "HSK 1"], ["hsk2", "HSK 2"], ["hsk3", "HSK 3"], ["hsk4", "HSK 4"], ["hsk5", "HSK 5"], ["hsk6", "HSK 6"], ["hsk79", "HSK 7–9"]].forEach(([v, l]) => lvSel.append(new Option(l, v)));
  const list = mk("div", "acchecks"), boxes = {};
  RESETS.forEach(([id, label]) => { const l = mk("label", "accheck"), c = mk("input"); c.type = "checkbox"; boxes[id] = c; l.append(c, " " + T(label)); list.append(l); if (id === "study") l.append(" ", lvSel); });
  const goBtn = mk("button", "btn", T("Azzera i selezionati")); goBtn.type = "button";
  goBtn.onclick = () => {
    const ch = RESETS.filter(([id]) => boxes[id].checked); if (!ch.length) { alert(T("Seleziona cosa azzerare.")); return; }
    if (!confirm(T("Azzerare in modo definitivo: {l}?", { l: ch.map(([, l]) => T(l)).join(", ") }) + (HSKAuth.signedIn() ? "\n\n" + T("L’azzeramento vale anche per il salvataggio cloud.") : ""))) return;
    const lv = lvSel.value, picked = ch.map(c => c[0]);
    HSKSync.resetKeys(k => /^hsk1?\.progress/.test(k) ? (picked.includes("study") && (lv === "all" || k === "hsk.progress." + lv || (lv === "hsk1" && k === "hsk1.progress"))) : RESETS.some(([id, , t]) => id !== "study" && picked.includes(id) && t(k)));
    setTimeout(() => location.reload(), 500);
  };
  const all = mk("button", "btn warn", T("Azzera tutto")); all.type = "button";
  all.onclick = () => { if (!confirm(T("Azzerare TUTTI i progressi (studio, Calligrafia, Quaderno, cronologie)? Non si può annullare.") + (HSKAuth.signedIn() ? "\n\n" + T("L’azzeramento vale anche per il salvataggio cloud.") : ""))) return; HSKSync.resetKeys(k => !/^hsk\.(level|lang|theme)$/.test(k)); setTimeout(() => location.reload(), 500); };
  root.append(section(T("Azzera i progressi"), mk("p", "hint", T("Puoi cancellare solo una parte dei progressi, in qualsiasi momento.")), list, kids("div", "acact", goBtn, all)));
  /* i miei dati */
  const ex = mk("button", "btn", T("Esporta i miei dati")); ex.type = "button";
  ex.onclick = () => { const b = new Blob([JSON.stringify(HSKSync.exportAll(), null, 2)], { type: "application/json" }), a = mk("a"); a.href = URL.createObjectURL(b); a.download = "studio-hsk-dati.json"; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const acts = kids("div", "acact", ex);
  if (signed && HSKSync.signed()) {
    const del = mk("button", "btn warn", T("Elimina i miei dati dal cloud")); del.type = "button";
    del.onclick = async () => {
      if (!confirm(T("Eliminare dal cloud tutti i dati collegati al tuo account? I progressi su questo dispositivo restano. Non si può annullare."))) return;
      try { const r = await fetch(HSKAuth.apiUrl("account"), { method: "DELETE", headers: HSKAuth.headers() }); if (!r.ok) throw 0; HSKSync.forgetMeta(); HSKAuth.signOut(); alert(T("Dati cloud eliminati.")); draw(); } catch (e) { alert(T("Eliminazione non riuscita: riprova.")); }
    };
    acts.append(del);
  }
  root.append(section(T("I miei dati"), acts));
  /* informativa */
  const pv = mk("details", "acpriv"); if (privOpen) pv.open = true; pv.addEventListener("toggle", () => { privOpen = pv.open; });
  pv.append(mk("summary", "", T("Informativa sulla privacy")));
  PRIVACY().forEach(([h, t]) => pv.append(mk("h5", "", T(h)), mk("p", "", t)));
  pv.append(mk("p", "hint", T("Questo testo è un modello informativo: il titolare del sito deve verificarlo e completarlo (contatti, eventuali altri trattamenti).")));
  root.append(pv);
  dlg.replaceChildren(root);
}
function open() { draw(); if (!dlg.open) dlg.showModal(); }
function label() {
  const u = HSKAuth.user(); btn.replaceChildren();
  if (u) { const i = mk("span", "acav", (u.name || u.email || "?").trim().charAt(0).toUpperCase()); i.setAttribute("aria-hidden", "true"); btn.append(i, mk("span", "", T("Account"))); btn.title = u.email || ""; }
  else { btn.append(mk("span", "", HSKAI.info() && HSKAI.info().auth === "off" ? T("Dati") : T("Accedi"))); btn.title = T("Account e dati"); }
}
btn.onclick = open;
const refresh = () => { label(); if (dlg.open) draw(); };
HSKAuth.onChange(refresh); HSKSync.onChange(() => { if (dlg.open) { const s = dlg.querySelector(".acst"); if (s) s.textContent = status(); } });
document.addEventListener("hsk-ai-change", () => { label(); });
if (window.I18n) I18n.onChange(refresh);
label();
window.Account = { open };
})();
