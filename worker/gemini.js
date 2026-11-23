/* Collegamento a Gemini (Google AI, API generateContent). La chiave (GEMINI_API_KEY) vive solo qui, come segreto del Worker.
   buildRequest() in worker.js produce una richiesta in formato "Claude" (system + messages + uno strumento con lo schema JSON);
   qui la si traduce per Gemini: istruzione di sistema, parti (testo / immagine / PDF / audio in base64) e risposta JSON vincolata
   da uno schema (responseMimeType + responseJsonSchema). Se l'API rifiuta lo schema (400), si riprova una volta chiedendo il JSON
   nel prompt, e la risposta viene comunque letta e controllata. */
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
export const GEMINI_MODEL = "gemini-3.6-flash";
export const GEMINI_FAST = "gemini-3.5-flash-lite";

function partsOf(content) {
  if (typeof content === "string") return [{ text: content }];
  return (content || []).map(b => {
    if (b.type === "text") return { text: b.text };
    if (b.source && b.source.data) return { inline_data: { mime_type: b.source.media_type, data: b.source.data } };
    return null;
  }).filter(Boolean);
}
export function toGeminiBody(req, withSchema = true) {
  const tool = (req.tools || [])[0], schema = tool && tool.input_schema;
  let system = req.system || "";
  if (schema && !withSchema) system += "\n\nRispondi SOLO con un oggetto JSON valido (nessun testo fuori dal JSON, nessun blocco di codice) conforme a questo schema:\n" + JSON.stringify(schema);
  const gen = { temperature: 0.2, maxOutputTokens: Math.max(4096, (req.max_tokens || 2048) * 2) };
  if (schema) { gen.responseMimeType = "application/json"; if (withSchema) gen.responseJsonSchema = schema; }
  return { systemInstruction: { parts: [{ text: system }] }, contents: (req.messages || []).map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: partsOf(m.content) })), generationConfig: gen };
}
/** Estrae l'oggetto JSON da un testo (toglie eventuali recinti ``` e testo attorno). */
export function parseJsonText(t) {
  let s = String(t || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a < 0 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}
const textOf = out => ((out && out.candidates && out.candidates[0] && out.candidates[0].content && out.candidates[0].content.parts) || []).map(p => p.text || "").join("");

/** Chiama Gemini. Restituisce l'oggetto JSON (o, con plain:true, il testo). Lancia { status, msg }. */
export async function callGemini(env, req, opts = {}) {
  const fetchFn = opts.fetchFn || fetch, model = req.model;
  const go = async withSchema => {
    let up;
    try { up = await fetchFn(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify(toGeminiBody(req, withSchema)) }); }
    catch (e) { throw { status: 502, msg: "Servizio AI non raggiungibile." }; }
    return up;
  };
  let up = await go(true);
  if (up.status === 400 && !opts.plain) { const t = await up.text(); console.error("gemini 400 (riprovo senza schema)", t.slice(0, 200)); up = await go(false); }
  if (up.status === 429) throw { status: 503, msg: "Il servizio AI è molto occupato: riprova tra poco." };
  if (up.status === 404) throw { status: 502, msg: "Modello Gemini non trovato: controlla la variabile MODEL del Worker." };
  if (up.status === 401 || up.status === 403) { console.error("gemini auth", up.status); throw { status: 502, msg: "Chiave Gemini non valida o non autorizzata." }; }
  if (!up.ok) { console.error("gemini", up.status, (await up.text()).slice(0, 300)); throw { status: 502, msg: "Errore del servizio AI." }; }
  let out; try { out = await up.json(); } catch (e) { throw { status: 502, msg: "Risposta AI non valida." }; }
  const fr = out && out.candidates && out.candidates[0] && out.candidates[0].finishReason;
  if (!out.candidates || !out.candidates.length || fr === "SAFETY" || fr === "PROHIBITED_CONTENT") throw { status: 422, msg: "Il contenuto non può essere analizzato dal servizio AI." };
  const text = textOf(out);
  if (opts.plain) return text.trim();
  const obj = parseJsonText(text); if (!obj) throw { status: 502, msg: "Risposta AI non valida." };
  return obj;
}
