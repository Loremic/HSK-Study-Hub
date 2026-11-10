/* Rotella stile iPod (click wheel) per scegliere tra gli esercizi.  window.Wheel
 *  Wheel.mount(root, { items:[{key,label,desc}], current, mini:false, onSelect(key) }) -> { set(key), destroy() }
 *  - Trascina il dito/mouse lungo l'anello: ogni ~38° passa all'elemento successivo/precedente (con "scatto").
 *  - Rotellina del mouse sull'anello, tasti ◀ ▶ ▲ ▼ sull'anello, pulsante centrale (o Invio) per aprire.
 *  - Tutto è anche raggiungibile con normali pulsanti (voci dello schermo, ◀◀ ▶▶, OK): nulla dipende dal solo gesto circolare.
 *  mini:true = solo anello, per cambiare esercizio al volo; ogni scatto apre direttamente l'esercizio.
 */
(function () {
"use strict";
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k);
const STEP = 38;                                          // gradi per scatto
const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function h(tag, cls, text, attrs) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const ang = (e, r) => Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;

function mount(root, o) {
  const items = o.items.slice(), mini = !!o.mini; let cur = Math.max(0, items.findIndex(i => i.key === o.current)), acc = 0, last = null, rot = 0, dragging = false;
  root.replaceChildren();
  const box = h("div", "ipod" + (mini ? " mini" : ""));
  let screen = null, rows = [];
  if (!mini) {
    screen = h("div", "ipod-screen"); screen.append(h("div", "ipod-bar", tx("Esercizi")));
    const ul = h("div", "ipod-list", null, { role: "listbox", "aria-label": tx("Esercizi") });
    rows = items.map((it, i) => { const b = h("button", "ipod-row", null, { type: "button", role: "option", id: "ipodopt" + i });
      b.append(h("span", "ipod-lab", it.label), h("span", "ipod-chev", "›")); b.addEventListener("click", () => { cur = i; paint(); open(); }); ul.append(b); return b; });
    screen.append(ul, h("p", "ipod-desc", ""));
    box.append(screen);
  }
  const wheel = h("div", "wheel", null, { role: "group", "aria-label": tx("Rotella degli esercizi") });
  const ring = h("div", "wheel-ring", null, { tabindex: "0", role: "slider", "aria-label": tx("Ruota per cambiare esercizio"), "aria-valuemin": "1", "aria-valuemax": String(items.length) });
  const dot = h("i", "wheel-dot", null, { "aria-hidden": "true" }); ring.append(dot);
  const mkb = (cls, label, txt, fn) => { const b = h("button", "wheel-b " + cls, txt, { type: "button", "aria-label": label }); b.addEventListener("click", ev => { ev.stopPropagation(); fn(); }); return b; };
  const bPrev = mkb("w-l", tx("Esercizio precedente"), "◀◀", () => move(-1)), bNext = mkb("w-r", tx("Esercizio successivo"), "▶▶", () => move(1));
  const bUp = mkb("w-t", tx("Esercizio precedente"), "▲", () => move(-1)), bDown = mkb("w-b", tx("Esercizio successivo"), "▼", () => move(1));
  const ok = h("button", "wheel-ok", mini ? "" : "OK", { type: "button", "aria-label": tx("Apri l’esercizio selezionato") }); ok.addEventListener("click", ev => { ev.stopPropagation(); open(); });
  if (mini) { ok.textContent = String(cur + 1) + "/" + items.length; ok.setAttribute("aria-label", items[cur].label); }
  wheel.append(ring, bUp, bDown, bPrev, bNext, ok); box.append(wheel); root.append(box);

  function paint() {
    rows.forEach((b, i) => { b.setAttribute("aria-selected", String(i === cur)); b.classList.toggle("sel", i === cur); });
    if (screen) { screen.querySelector(".ipod-desc").textContent = items[cur].desc || ""; if (rows[cur]) rows[cur].scrollIntoView({ block: "nearest" }); }
    ring.setAttribute("aria-valuenow", String(cur + 1)); ring.setAttribute("aria-valuetext", items[cur].label);
    if (mini) { ok.textContent = (cur + 1) + "/" + items.length; ok.setAttribute("aria-label", items[cur].label); }
    ring.style.setProperty("--rot", rot + "deg");
  }
  function open() { o.onSelect && o.onSelect(items[cur].key); }
  function move(d, auto) {
    cur = (cur + d + items.length) % items.length; rot += d * STEP; paint();
    try { navigator.vibrate && navigator.vibrate(4); } catch (e) {}
    if (mini || auto) open();
  }
  ring.addEventListener("pointerdown", e => { if (e.target !== ring && e.target !== dot) return; dragging = true; last = ang(e, ring.getBoundingClientRect()); acc = 0; try { ring.setPointerCapture(e.pointerId); } catch (x) {} ring.classList.add("on"); e.preventDefault(); });
  ring.addEventListener("pointermove", e => {
    if (!dragging) return; const a = ang(e, ring.getBoundingClientRect()); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; last = a; acc += d;
    while (acc >= STEP) { acc -= STEP; move(1); } while (acc <= -STEP) { acc += STEP; move(-1); }
  });
  const end = () => { dragging = false; ring.classList.remove("on"); };
  ring.addEventListener("pointerup", end); ring.addEventListener("pointercancel", end);
  ring.addEventListener("wheel", e => { e.preventDefault(); move(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }, { passive: false });
  ring.addEventListener("keydown", e => {
    const k = e.key; if (k === "ArrowRight" || k === "ArrowDown") { e.preventDefault(); move(1); } else if (k === "ArrowLeft" || k === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); open(); } else if (k === "Home") { e.preventDefault(); move(-cur); } else if (k === "End") { e.preventDefault(); move(items.length - 1 - cur); }
  });
  paint();
  return { set(key) { const i = items.findIndex(x => x.key === key); if (i >= 0) { cur = i; paint(); } }, destroy() { root.replaceChildren(); }, get index() { return cur; } };
}
window.Wheel = { mount, STEP };
})();
