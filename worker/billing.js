/* Piano Free / Pro con Stripe (Checkout + Customer Portal + webhook), stato in Cloudflare KV (binding PROGRESS).
   Chiavi KV:  plan:<sub Google> = { status, cust, subId, until }   cust:<id cliente Stripe> = <sub Google>
   Il piano si sblocca SOLO dal webhook firmato da Stripe (mai da ciò che dice il browser).
   Segreti del Worker: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Variabile: STRIPE_PRICE_ID (prezzo ricorrente creato in Stripe). */
const te = new TextEncoder();
const API = "https://api.stripe.com/v1/";
export const billingOn = env => !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.PROGRESS);
const active = p => !!p && (p.status === "active" || p.status === "trialing" || (p.status === "past_due" && p.until && p.until > Date.now())) && (!p.until || p.until > Date.now() - 86400000);

export async function getPlan(env, sub) {
  if (!env.PROGRESS || !sub) return { plan: "free" };
  let p = null; try { p = await env.PROGRESS.get("plan:" + sub, "json"); } catch (e) {}
  return { plan: active(p) ? "pro" : "free", until: p && p.until || null, status: p && p.status || null, portal: !!(p && p.cust) };
}
async function stripe(env, path, form, fetchFn = fetch) {
  const r = await fetchFn(API + path, { method: "POST", headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  const j = await r.json().catch(() => ({})); if (!r.ok) { console.error("stripe", r.status, JSON.stringify(j.error || j).slice(0, 300)); throw { status: 502, msg: "Il servizio di pagamento non è disponibile in questo momento." }; }
  return j;
}
/** Avvia il pagamento: restituisce l'URL di Stripe Checkout. returnUrl deve appartenere a un'origine autorizzata (controllo nel chiamante). */
export async function checkout(env, user, returnUrl, fetchFn) {
  const cur = await env.PROGRESS.get("plan:" + user.sub, "json").catch(() => null);
  const form = { mode: "subscription", "line_items[0][price]": env.STRIPE_PRICE_ID, "line_items[0][quantity]": "1", client_reference_id: user.sub, success_url: returnUrl + "?pro=ok", cancel_url: returnUrl + "?pro=no", allow_promotion_codes: "true", "subscription_data[metadata][sub]": user.sub };
  if (cur && cur.cust) form.customer = cur.cust; else if (user.email) form.customer_email = user.email;
  return (await stripe(env, "checkout/sessions", form, fetchFn)).url;
}
export async function portal(env, user, returnUrl, fetchFn) {
  const cur = await env.PROGRESS.get("plan:" + user.sub, "json").catch(() => null);
  if (!cur || !cur.cust) throw { status: 404, msg: "Nessun abbonamento trovato." };
  return (await stripe(env, "billing_portal/sessions", { customer: cur.cust, return_url: returnUrl }, fetchFn)).url;
}
/* ---- webhook ---- */
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
const eq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
/** Verifica l'intestazione Stripe-Signature ("t=…,v1=…") con HMAC-SHA256 di "<t>.<corpo grezzo>"; tolleranza 5 minuti. */
export async function verifyStripe(raw, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header || "").split(",").map(s => s.trim().split("=")).filter(a => a.length === 2));
  const sigs = String(header || "").split(",").map(s => s.trim()).filter(s => s.startsWith("v1=")).map(s => s.slice(3));
  if (!secret || !parts.t || !sigs.length || Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, te.encode(parts.t + "." + raw)));
  return sigs.some(s => eq(s, mac));
}
async function setPlan(env, sub, patch) {
  const cur = (await env.PROGRESS.get("plan:" + sub, "json").catch(() => null)) || {}, next = Object.assign(cur, patch);
  await env.PROGRESS.put("plan:" + sub, JSON.stringify(next));
  if (next.cust) await env.PROGRESS.put("cust:" + next.cust, sub);
}
export async function handleEvent(env, ev) {
  const o = ev && ev.data && ev.data.object; if (!o) return;
  if (ev.type === "checkout.session.completed") {
    const sub = o.client_reference_id; if (!sub || o.mode !== "subscription") return;
    await setPlan(env, sub, { status: "active", cust: o.customer, subId: o.subscription, until: null });
  } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const sub = (o.metadata && o.metadata.sub) || await env.PROGRESS.get("cust:" + o.customer).catch(() => null); if (!sub) return;
    const st = ev.type === "customer.subscription.deleted" ? "canceled" : o.status;   // active | trialing | past_due | canceled | unpaid | …
    await setPlan(env, sub, { status: st, cust: o.customer, subId: o.id, until: o.current_period_end ? o.current_period_end * 1000 : null });
  }
}
