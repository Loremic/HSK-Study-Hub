#!/usr/bin/env python3
"""Prepara i dati dei tratti per la sezione Calligrafia.
Sorgente: repository hanzi-writer-data (https://github.com/chanind/hanzi-writer-data, dati da Make Me a Hanzi, licenza Arphic Public License):
  git clone --depth 1 https://github.com/chanind/hanzi-writer-data.git /percorso/hwd
Uso: python3 tools/build_strokes.py /percorso/hwd
Scrive un file per livello data/strokes/hsk<livello>.json ({carattere: {"s": [contorni SVG dei tratti], "m": [linee mediane dei tratti]}}, coordinate 1024x1024, y verso l'alto)
e data/calli_index.json (elenco dei caratteri dei livelli HSK 1-9 con livello, pinyin quando ricavabile, numero di tratti).
I dati restano soggetti alla licenza Arphic: il testo è in data/strokes/ARPHICPL.TXT."""
import json, os, re, sys, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DATA = os.path.join(ROOT, "data")
HW = sys.argv[1] if len(sys.argv) > 1 else "hwd"
FILES = [("1", "flashcards.json"), ("2", "flashcards_hsk2.json"), ("3", "flashcards_hsk3.json"), ("4", "flashcards_hsk4.json"), ("5", "flashcards_hsk5.json"), ("6", "flashcards_hsk6.json"), ("79", "flashcards_hsk79.json")]
V = "aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ"
SYL = re.compile(r"[^%s\s'’·]*[%s]+(?:ng|n|r)?(?![%s])" % (V, V, V), re.I)
def syllables(p): return SYL.findall(p.replace("’", "'").replace("'", " "))
idx = {}
I18N = {}
for lv, fn in FILES:
    fp = os.path.join(DATA, "i18n", "cards_hsk%s.json" % lv)
    I18N[lv] = json.load(open(fp, encoding="utf-8")) if os.path.exists(fp) else {}
for lv, fn in FILES:
    for c in json.load(open(os.path.join(DATA, fn), encoding="utf-8")):
        h = c["hanzi"]; py = c.get("pinyin", "")
        sy = syllables(py)
        tr = (I18N[lv].get(str(c.get("id"))) or {}).get("meaning") or {}
        mi = c.get("meaning_it") or ""; me = c.get("meaning_en") or tr.get("en") or ""; ms = tr.get("es") or ""
        for k, ch in enumerate(h):
            if not re.match(r"[一-鿿]", ch): continue
            e = idx.setdefault(ch, {"c": ch, "l": lv, "p": ""})
            if not e["p"]:
                if len(h) == 1 and sy: e["p"] = sy[0] if len(sy) == 1 else py
                elif len(sy) == len(h): e["p"] = sy[k]
            # parola di riferimento per l'esercizio a memoria: meglio quella di un solo carattere, altrimenti la prima
            rank = 0 if len(h) == 1 else 1
            if "_r" not in e or rank < e["_r"]:
                e["_r"] = rank; e["u"] = c.get("unit", ""); e["o"] = c.get("order", 0); e["w"] = h; e["wp"] = py; e["mi"] = mi; e["me"] = me; e["ms"] = ms
bundle = {}; lvl = {}; os.makedirs(os.path.join(DATA, "strokes"), exist_ok=True)
index = []; miss = []
for ch, e in idx.items():
    fp = os.path.join(HW, "data", ch + ".json")
    if not os.path.exists(fp): miss.append(ch); continue
    d = json.load(open(fp, encoding="utf-8"))
    lvl.setdefault(e["l"], {})[ch] = {"s": d["strokes"], "m": d["medians"]}
    e.pop("_r", None); e["n"] = len(d["strokes"]); index.append(e)
index.sort(key=lambda e: (["1", "2", "3", "4", "5", "6", "79"].index(e["l"]), e["o"], e["n"], e["c"]))
for l, dd in lvl.items(): json.dump(dd, open(os.path.join(DATA, "strokes", "hsk%s.json" % l), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(index, open(os.path.join(DATA, "calli_index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
shutil.copy(os.path.join(HW, "ARPHICPL.TXT"), os.path.join(DATA, "strokes", "ARPHICPL.TXT"))
print("caratteri:", len(index), "senza dati:", len(miss), "".join(miss))
