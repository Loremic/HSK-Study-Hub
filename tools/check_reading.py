#!/usr/bin/env python3
"""Valida un file di esercizi di lettura (formato di data/reading.json, solo la lista "sets").
Uso: python3 tools/check_reading.py <file.json> <hsk1|hsk2|hsk3>
Controlla: struttura, evidenze (citazioni) presenti nel testo, risposte valide, caratteri nel lessico del livello (soglia 97%)."""
import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAN = re.compile(r"[一-鿿]")
FILES = {"hsk1": ["flashcards.json"], "hsk2": ["flashcards.json", "flashcards_hsk2.json"], "hsk3": ["flashcards.json", "flashcards_hsk2.json", "flashcards_hsk3.json"]}
def lexicon(level):
    ch = set()
    for f in FILES[level]:
        for c in json.load(open(os.path.join(ROOT, "data", f), encoding="utf-8")): ch.update(HAN.findall(c["hanzi"]))
    return ch
def norm(s): return re.sub(r"[\s，。！？、；：“”‘’（）,.!?;:\"'—…]", "", s)
def check(sets, level):
    lex, errs, warns = lexicon(level), [], []
    ids = set()
    for s in sets:
        i = s.get("id", "?"); e = lambda m: errs.append("%s: %s" % (i, m))
        if i in ids: e("id duplicato")
        ids.add(i)
        if s.get("level") != level: e("level errato")
        t = s.get("type")
        if t not in ("tf", "blank", "mcq"): e("type non valido"); continue
        items = s.get("items") or []
        if not items: e("nessuna domanda")
        passage = s.get("passage", "")
        texts = [passage] + [it.get("q", "") for it in items] + [o for it in items for o in it.get("options", [])] + list(s.get("bank", []))
        if t in ("tf", "mcq") and len(norm(passage)) < 8: e("passage troppo corto")
        if t == "blank":
            bank = s.get("bank") or []
            if len(set(bank)) != len(bank): e("bank con duplicati")
            if not (len(items) + 1 <= len(bank) <= len(items) + 2): e("bank deve avere 1-2 voci in più delle frasi")
            used = [it.get("answer") for it in items]
            if len(set(used)) != len(used) or any(not isinstance(a, int) or not 0 <= a < len(bank) for a in used): e("answer non valide/uniche")
        for n, it in enumerate(items, 1):
            f = lambda m: errs.append("%s #%d: %s" % (i, n, m))
            q = it.get("q", "")
            if t == "tf":
                if not isinstance(it.get("answer"), bool): f("answer deve essere true/false")
                if it.get("evidence") and norm(it["evidence"]) not in norm(passage): f("evidence non è nel testo")
                if not it.get("evidence"): f("manca evidence")
            if t == "mcq":
                o = it.get("options") or []
                if not 3 <= len(o) <= 4 or len(set(o)) != len(o): f("servono 3-4 opzioni distinte")
                if not isinstance(it.get("answer"), int) or not 0 <= it["answer"] < len(o): f("answer fuori range")
                if not it.get("evidence") or norm(it["evidence"]) not in norm(passage): f("evidence assente o non nel testo")
            if t == "blank":
                if q.count("____") != 1: f("la frase deve contenere esattamente un '____'")
        bad = [c for tx in texts for c in HAN.findall(tx) if c not in lex]
        tot = sum(len(HAN.findall(tx)) for tx in texts)
        if tot and len(bad) / tot > 0.03: e("%.1f%% caratteri fuori livello: %s" % (100 * len(bad) / tot, "".join(sorted(set(bad)))))
        elif bad: warns.append("%s: fuori livello (ok): %s" % (i, "".join(sorted(set(bad)))))
    return errs, warns
if __name__ == "__main__":
    d = json.load(open(sys.argv[1], encoding="utf-8")); sets = d["sets"] if isinstance(d, dict) else d
    errs, warns = check(sets, sys.argv[2])
    print("%d esercizi, %d domande" % (len(sets), sum(len(s.get("items", [])) for s in sets)))
    for w in warns[:30]: print("  nota", w)
    for e in errs: print("  ERRORE", e)
    print("OK" if not errs else "%d errori" % len(errs)); sys.exit(1 if errs else 0)
