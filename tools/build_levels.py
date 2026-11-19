#!/usr/bin/env python3
"""Costruisce data/flashcards_hsk4|5|6|79.json dalle liste in tools/sources/ (vedi extract_levels.py per i PDF).
  HSK 4: PDF MandarinZone 2026 (parola, pinyin, significato EN, frase d'esempio zh/pinyin/en)
  HSK 5: PDF MandarinZone 2026 (parola, pinyin, POS, significato EN, registro)
  HSK 6: CSV (parola, pinyin, POS, frase d'esempio). Il CSV NON ha il significato della parola: viene da tools/sources/hsk6_glosses.json
         (id -> breve glossa inglese), scritto a partire dalla parola e dalla frase d'esempio.
  HSK 7-9: CSV (parola, pinyin, significato CC-CEDICT, classificatore)
Poi i temi: python3 tools/assign_themes.py hsk4 hsk5 hsk6 hsk79 (usa data/themes/<livello>.json).
Uso: python3 -I tools/extract_levels.py && python3 tools/build_levels.py"""
import csv, json, os, re, unicodedata
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SRC = os.path.join(ROOT, "tools", "sources"); DATA = os.path.join(ROOT, "data")
HAN = re.compile(r"[一-鿿]")
def clean_word(w): return re.sub(r"\d+$", "", unicodedata.normalize("NFKC", w)).strip()
def card(i, order, hanzi, py, en, ex=None, new=False, pos=""):
    c = {"id": i, "order": order, "phase": "", "unit": "", "hanzi": hanzi, "pinyin": py, "meaning_it": None, "meaning_en": en, "example": ex, "new": new, "syllabus_order": order}
    if pos: c["pos"] = pos
    return c
def save(level, cards, name):
    for k, c in enumerate(cards, 1): c["order"] = c["syllabus_order"] = k
    json.dump(cards, open(os.path.join(DATA, name), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(level, len(cards))

def h4():
    rows = json.load(open(os.path.join(SRC, "hsk4_extracted.json"), encoding="utf-8"))
    return [card(r["id"], 0, clean_word(r["hanzi"]), r["py"], r["en"], {"zh": r["ex_zh"], "pinyin": r["ex_py"], "en": r["ex_en"]} if r["ex_zh"] else None) for r in rows]
def h5():
    rows = json.load(open(os.path.join(SRC, "hsk5_extracted.json"), encoding="utf-8"))
    return [card(r["id"], 0, clean_word(r["hanzi"]), r["py"], r["en"], None, bool(r["new"]), r["pos"]) for r in rows]
def h6():
    gl = {}
    fp = os.path.join(SRC, "hsk6_glosses.json")
    if os.path.exists(fp): gl = json.load(open(fp, encoding="utf-8"))
    out = []
    for r in csv.DictReader(open(os.path.join(SRC, "hsk6_vocabulary.csv"), encoding="utf-8-sig")):
        i = int(r["No."]); out.append(card(i, 0, clean_word(r["Word"]), r["Pinyin"], gl.get(str(i)) or None, {"zh": r["Example Sentence"], "pinyin": r["Sentence Pinyin"], "en": r["English Translation"]}, False, r["POS"]))
    return out
def h79():
    rows = list(csv.reader(open(os.path.join(SRC, "hsk-7-9-vocabulary-2026.csv"), encoding="utf-8-sig")))
    out = []
    for k, r in enumerate([x for x in rows[2:] if len(x) >= 4 and x[0]], 1):
        out.append(card(5400 + k, 0, clean_word(r[0]), r[1], r[2], None, False, ("mw: " + r[3]) if r[3] else ""))
    return out

if __name__ == "__main__":
    save("hsk4", h4(), "flashcards_hsk4.json"); save("hsk5", h5(), "flashcards_hsk5.json"); save("hsk6", h6(), "flashcards_hsk6.json"); save("hsk79", h79(), "flashcards_hsk79.json")
