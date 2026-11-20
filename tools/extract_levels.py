#!/usr/bin/env python3
"""Estrae le liste di vocabolario dai file sorgente in tools/sources/ e scrive i JSON grezzi tools/sources/*_extracted.json.
HSK 4 (PDF MandarinZone): gli hanzi ci sono nel testo del PDF ma sono invisibili alla resa: si leggono con pdfplumber, non con pdftotext.
HSK 5 (PDF MandarinZone): colonne a posizione fissa; le righe alternate hanno o non hanno il rettangolo di sfondo, le bande si ricostruiscono dagli spazi.
Uso: python3 -I tools/extract_levels.py   (richiede pdfplumber)"""
import pdfplumber, json, re, logging, unicodedata, os
logging.disable(logging.CRITICAL)
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources")
RAD = {"⺠": "民", "⻘": "青", "⻓": "长", "⻋": "车", "⻉": "贝", "⻜": "飞", "⻛": "风", "⻩": "黄", "⻢": "马", "⻔": "门", "⻅": "见", "⻆": "角", "⻚": "页", "⻝": "食", "⻤": "鬼", "⻦": "鸟", "⻬": "齐", "⻮": "齿", "⻰": "龙", "⻳": "龟", "⻣": "骨", "⻏": "阝", "⻊": "足", "⻁": "虎", "⻙": "韦", "⻥": "鱼", "⻧": "麦", "⻨": "麦"}
N = lambda s: unicodedata.normalize("NFKC", "".join(RAD.get(c, c) for c in s))       # normalizza i radicali Kangxi (⽩ -> 白, ⻋ -> 车)

def hsk4():
    pdf = pdfplumber.open(os.path.join(SRC, "HSK4_Vocabulary_MandarinZone_2026.pdf")); rows = []
    for pg in pdf.pages:
        for tb in pg.find_tables():
            for row in tb.rows:
                cells = row.cells
                if len(cells) < 6 or cells[0] is None: continue
                txt = [(pg.crop(c).extract_text() or "").strip() if c else "" for c in cells]
                n = re.sub(r"\s+", "", txt[0])
                if not n.isdigit(): continue
                ex = [l for l in txt[5].split("\n") if l.strip()]
                zh = [l for l in ex if re.search(r"[一-鿿]", l)]; oth = [l for l in ex if l not in zh]
                rows.append(dict(id=int(n), hanzi=N(re.sub(r"\s+", "", txt[1])), py=txt[2].strip(), pos="", en=re.sub(r"\s+", " ", txt[4]).strip(),
                                 ex_zh=N("".join(zh)).strip(), ex_py=oth[0].strip() if oth else "", ex_en=" ".join(oth[1:]).strip()))
    json.dump(rows, open(os.path.join(SRC, "hsk4_extracted.json"), "w", encoding="utf-8"), ensure_ascii=False); return rows

def hsk5():
    pdf = pdfplumber.open(os.path.join(SRC, "hsk5-vocabulary-list-2026.pdf")); out = []
    for pg in pdf.pages:
        ws = pg.extract_words()
        hw = [w for w in ws if w["text"] == "#"]
        hdr = max([r["bottom"] for r in pg.rects for w in hw if r["top"] - 1 <= w["top"] and w["bottom"] <= r["bottom"] + 1 and r["bottom"] - r["top"] < 30] or [132]) + 0.5
        sh = sorted({round(r["top"], 1): (r["top"], r["bottom"]) for r in pg.rects if abs(r["x0"] - 286) < 2 and abs(r["x1"] - 457) < 2 and r["bottom"] - r["top"] > 8 and r["top"] >= hdr - 0.6}.values())
        lim = min([w["top"] for w in ws if w["text"].startswith("Mandarin") and w["top"] > 700] or [pg.height - 40])
        bands, prev = [], hdr
        for t, b in sh:
            if t - prev > 8: bands.append((prev, t))
            bands.append((t, b)); prev = b
        if lim - prev > 8: bands.append((prev, lim))
        for t, b in bands:
            W = [w for w in ws if t - 0.5 <= (w["top"] + w["bottom"]) / 2 <= b + 0.5]
            col = lambda a, c: [w for w in W if a <= w["x0"] < c]
            j = lambda L: " ".join(w["text"] for w in sorted(L, key=lambda w: (round(w["top"] / 3), w["x0"])))
            idt = j(col(30, 58))
            if not re.fullmatch(r"\d{4}", idt): continue
            out.append(dict(id=int(idt), hanzi=N(j(col(58, 120))), py=N(j(col(120, 196))), pos=j(col(196, 286)), en=j(col(286, 457)), reg=j(col(457, 502)), new=bool(col(502, 536))))
    json.dump(out, open(os.path.join(SRC, "hsk5_extracted.json"), "w", encoding="utf-8"), ensure_ascii=False); return out

if __name__ == "__main__":
    a = hsk4(); b = hsk5(); print("HSK4:", len(a), " HSK5:", len(b))
