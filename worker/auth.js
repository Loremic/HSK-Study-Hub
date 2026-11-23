/* Autenticazione: verifica del token Google (Google Sign-In) e sessioni firmate dal Worker.
   Flusso: il browser ottiene da Google un "ID token" (JWT RS256), lo manda a POST /api/auth/google; il Worker lo verifica
   (firma con le chiavi pubbliche di Google, audience = il tuo Client ID, scadenza, emittente) e risponde con un token di
   sessione proprio (HS256, 30 giorni) firmato con SESSION_SECRET. Le altre chiamate usano solo quello: così la sessione non
   scade dopo un'ora come l'ID token di Google e il Worker non deve riverificare Google a ogni richiesta. */
const te = new TextEncoder(), td = new TextDecoder();
export const b64uEnc = buf => { const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf; let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const b64uDec = str => { const s = atob(String(str).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(str).length + 3) % 4)); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
const parseJwt = t => { const p = String(t || "").split("."); if (p.length !== 3) throw new Error("jwt"); return { h: JSON.parse(td.decode(b64uDec(p[0]))), c: JSON.parse(td.decode(b64uDec(p[1]))), sig: b64uDec(p[2]), signed: te.encode(p[0] + "." + p[1]) }; };

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let jwksMem = null;
async function googleKeys(fetchFn) {
  if (jwksMem && jwksMem.exp > Date.now()) return jwksMem.keys;
  const r = await fetchFn(JWKS_URL); if (!r.ok) throw new Error("jwks");
  const j = await r.json(); jwksMem = { keys: j.keys || [], exp: Date.now() + 60 * 60 * 1000 }; return jwksMem.keys;
}
export const _resetKeys = () => { jwksMem = null; };

/** Verifica un ID token Google. Restituisce { sub, name, email, picture }. Lancia Error se non valido. */
export async function verifyGoogleIdToken(token, clientId, fetchFn = fetch, now = Date.now()) {
  if (!clientId) throw new Error("client id mancante");
  const { h, c, sig, signed } = parseJwt(token);
  if (h.alg !== "RS256") throw new Error("alg");
  const keys = await googleKeys(fetchFn), jwk = keys.find(k => k.kid === h.kid);
  if (!jwk) throw new Error("kid");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, signed))) throw new Error("firma");
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("iss");
  if (c.aud !== clientId) throw new Error("aud");
  if (!c.exp || c.exp * 1000 < now - 60000) throw new Error("scaduto");
  if (!c.sub) throw new Error("sub");
  return { sub: String(c.sub), name: String(c.name || "").slice(0, 80), email: String(c.email || "").slice(0, 120), picture: String(c.picture || "").slice(0, 300) };
}

const hmacKey = secret => crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
export const SESSION_DAYS = 30;
export async function signSession(user, secret, now = Date.now()) {
  const head = b64uEnc(te.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const pay = b64uEnc(te.encode(JSON.stringify({ sub: user.sub, name: user.name, email: user.email, picture: user.picture, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), te.encode(head + "." + pay));
  return head + "." + pay + "." + b64uEnc(sig);
}
/** Restituisce il payload della sessione o null. */
export async function verifySession(token, secret, now = Date.now()) {
  try {
    if (!secret) return null; const { h, c, sig, signed } = parseJwt(token);
    if (h.alg !== "HS256") return null;
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, signed))) return null;
    if (!c.exp || c.exp * 1000 < now || !c.sub) return null;
    return c;
  } catch (e) { return null; }
}
