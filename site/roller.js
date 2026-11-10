/* Menu a rullo (effetto datario / cilindro) per scegliere l'esercizio.  window.Roller
 *  Roller.mount(root, { items:[{key,label,sub}], current, onSelect(key) }) -> { set(key, silent) }
 *  - Le voci sono su un cilindro verticale: quella al centro è piena e nitida, quelle sopra/sotto sfumano (ghost).
 *  - Si gira trascinando (mouse o dito, con inerzia), con la rotellina del mouse, con ↑/↓ (o PgSu/PgGiù, Home/Fine) o cliccando una voce.
 *  - Quando il rullo si ferma su una voce (o premi Invio/clic sulla voce centrale) l'esercizio si carica sotto.
 *  - prefers-reduced-motion: nessuna animazione, scatta direttamente.
 */
(function () {
"use strict";
const ITEM = 58;                                            // altezza di una voce, px
const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function h(tag, cls, text, attrs) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

function mount(root, o) {
  const items = o.items.slice(), n = items.length; let pos = Math.max(0, items.findIndex(i => i.key === o.current)), target = pos, vel = 0, raf = 0, drag = null, settleT = 0, loaded = items[pos] && items[pos].key, wheelAcc = 0;
  root.replaceChildren();
  const box = h("div", "rl", null, { role: "listbox", tabindex: "0", "aria-label": o.label || "Esercizi", "aria-orientation": "vertical" });
  const band = h("div", "rl-band", null, { "aria-hidden": "true" });
  const rows = items.map((it, i) => { const r = h("div", "rl-i", null, { role: "option", id: "rl-opt-" + i }); r.append(h("span", "rl-t", it.label), it.sub ? h("span", "rl-s", it.sub) : ""); box.append(r); return r; });
  box.prepend(band); root.append(box);
  let moved = false;
  const mod = (a, m) => ((a % m) + m) % m;
  function paint() {
    const cur = mod(Math.round(pos), n);
    rows.forEach((r, i) => {
      let d = mod(i - pos + n / 2, n) - n / 2;                        // distanza ciclica dalla posizione centrale, in voci
      const a = Math.abs(d), vis = a <= 1.6;
      r.style.visibility = vis ? "visible" : "hidden";
      r.style.transform = "translateY(" + (d * ITEM * 0.92).toFixed(1) + "px) rotateX(" + (-d * 34).toFixed(1) + "deg) scale(" + (1 - Math.min(a, 2) * 0.1).toFixed(3) + ")";
      r.style.opacity = String(Math.max(0, 1 - a * 0.68).toFixed(2));
      r.classList.toggle("sel", i === cur && a < .5); r.setAttribute("aria-selected", String(i === cur));
      r.style.zIndex = String(10 - Math.round(a * 3));
    });
    box.setAttribute("aria-activedescendant", "rl-opt-" + cur);
  }
  function commit() { const k = items[mod(Math.round(pos), n)].key; if (k !== loaded) { loaded = k; o.onSelect && o.onSelect(k); } }
  function step() {
    raf = 0;
    if (drag) return;
    if (reduce()) { pos = target; paint(); commit(); return; }
    const diff = target - pos; pos += diff * 0.2 + vel; vel *= 0.5;
    if (Math.abs(diff) < 0.004) { pos = target; paint(); clearTimeout(settleT); settleT = setTimeout(commit, 60); return; }
    paint(); raf = requestAnimationFrame(step);
  }
  function go(i, direct) {                                           // vai alla voce i passando dal lato più corto del cilindro
    let d = mod(i - Math.round(target) + n / 2, n) - n / 2; target = Math.round(target) + d; if (direct) vel = 0; if (!raf) raf = requestAnimationFrame(step);
  }
  const move = d => { target = Math.round(target) + d; if (!raf) raf = requestAnimationFrame(step); };
  box.addEventListener("pointerdown", e => { if (e.button > 0) return; drag = { y: e.clientY, p: pos, last: e.clientY, t: performance.now(), v: 0 }; moved = false; try { box.setPointerCapture(e.pointerId); } catch (x) {} box.classList.add("on"); });
  box.addEventListener("pointermove", e => {
    if (!drag) return; const dy = e.clientY - drag.y; if (Math.abs(dy) > 4) moved = true; if (!moved) return;
    const now = performance.now(), dt = Math.max(1, now - drag.t); drag.v = (drag.last - e.clientY) / dt / ITEM * 16; drag.last = e.clientY; drag.t = now;
    pos = drag.p - dy / (ITEM * 0.92); target = pos; paint();
  });
  const up = e => { if (!drag) return; const v = drag.v, tap = !moved && e && e.type === "pointerup"; drag = null; box.classList.remove("on"); target = Math.round(pos + (reduce() ? 0 : v * 6)); vel = 0; if (!raf) raf = requestAnimationFrame(step); setTimeout(() => { moved = false; }, 0);
    if (tap) { const r = box.getBoundingClientRect(), d = Math.round((e.clientY - (r.top + r.height / 2)) / (ITEM * 0.92)); if (d) go(Math.round(pos) + d, true); else { loaded = null; commit(); } } };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  box.addEventListener("wheel", e => { e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) >= 40) { move(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; } }, { passive: false });
  box.addEventListener("keydown", e => {
    const k = e.key; if (k === "ArrowDown" || k === "PageDown") { e.preventDefault(); move(1); } else if (k === "ArrowUp" || k === "PageUp") { e.preventDefault(); move(-1); }
    else if (k === "Home") { e.preventDefault(); go(0); } else if (k === "End") { e.preventDefault(); go(n - 1); } else if (k === "Enter" || k === " ") { e.preventDefault(); loaded = null; commit(); }
  });
  paint();
  return { set(key, silent) { const i = items.findIndex(x => x.key === key); if (i < 0) return; if (silent) loaded = key; go(i, true); }, get key() { return items[mod(Math.round(pos), n)].key; } };
}
window.Roller = { mount, ITEM };
})();
