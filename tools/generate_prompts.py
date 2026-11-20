#!/usr/bin/env python3
"""Genera le tracce di scrittura e le salva in data/prompts.json.

Fonti usate (nessun testo d'esame ufficiale viene copiato):
  * il LESSICO e i CARATTERI di ciascun livello (data/flashcards*.json): tutte le parole richieste
    o suggerite e tutti i caratteri delle consegne in cinese devono appartenere al livello (o a quelli inferiori);
  * i MACRO-ARGOMENTI: per l'HSK 1 le unità tematiche del JSON; per HSK 2 e 3 (unità alfabetiche) un banco di argomenti
    i cui termini vengono filtrati sul lessico del livello;
  * la STRUTTURA UFFICIALE delle prove (CTI, "Nuovo HSK 1-6: struttura e sample", dic 2025, in vigore da luglio 2026):
      HSK 1  nessuna prova di scrittura
      HSK 2  10 item di scrittura (tra cui: completare con il carattere scritto dal pinyin)
      HSK 3  10 item: 5 caratteri dal pinyin + 5 frasi "scrivi una frase con la parola data"
    Da qui i tipi di traccia: `sentence_word` (modello HSK 3), `sentences_words`, `short_text`, `reply`.
    Le lunghezze sono tarate su queste prove (es. la risposta-modello HSK 3 è di 10 caratteri) e sono PRATICA,
    non requisiti ufficiali.

Uso:   python3 tools/generate_prompts.py [--seed 2026] [--check]
  --check   non scrive: genera e stampa il rapporto di calibrazione.
Le tracce con "type": "exam" (o senza "generated") già presenti nel file vengono conservate.
"""
import argparse, json, random, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from i18n_ui4 import UI4   # testi dei macro-argomenti in italiano/inglese/spagnolo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
FILES = {"hsk1": "flashcards.json", "hsk2": "flashcards_hsk2.json", "hsk3": "flashcards_hsk3.json"}
ORDER = ["hsk1", "hsk2", "hsk3"]
HAN = re.compile(r"[一-鿿]")
PUNCT_OK = set("“”‘’、，。：；？！（） 0123456789")

# ---------------------------------------------------------------- calibrazione per livello
LEVELS = {
    "hsk1": {"label": "HSK 1", "official_writing": False,
             "note_it": "L’HSK 1 ufficiale non ha una prova di scrittura: queste sono tracce brevi di pratica, costruite con le parole e i caratteri del livello.",
             "sentence": {"min": 4, "lo": 6, "hi": 20}, "short": {"min": 10, "lo": 15, "hi": 40}},
    "hsk2": {"label": "HSK 2", "official_writing": True,
             "note_it": "Nell’HSK 2 ufficiale la scrittura è di 10 item (tra cui completare una frase scrivendo il carattere dal pinyin). Queste tracce sono pratica di produzione più ampia: frasi e brevi testi.",
             "sentence": {"min": 6, "lo": 8, "hi": 25}, "short": {"min": 20, "lo": 30, "hi": 70}},
    "hsk3": {"label": "HSK 3", "official_writing": True,
             "note_it": "Nell’HSK 3 ufficiale la scrittura è di 10 item: 5 caratteri dal pinyin e 5 frasi con una parola data. Le tracce “frase con parola” seguono questo modello; i brevi testi sono pratica aggiuntiva.",
             "sentence": {"min": 8, "lo": 10, "hi": 30}, "short": {"min": 40, "lo": 60, "hi": 120}},
}
COUNTS = {  # tracce per tipo e livello
    "hsk1": {"sentence_word": 30, "sentences_words": 10, "short_text": 99, "reply": 99},
    "hsk2": {"sentence_word": 30, "sentences_words": 12, "short_text": 99, "reply": 99},
    "hsk3": {"sentence_word": 30, "sentences_words": 12, "short_text": 99, "reply": 99},
}
N_REQUIRED = {"hsk1": 2, "hsk2": 3, "hsk3": 3}
N_SENT = {"hsk1": (2, 3), "hsk2": (3, 4), "hsk3": (4, 6)}   # frasi richieste nei brevi testi
SKIP_UNITS_HSK1 = {"01 Numeri", "03 Pronomi personali", "05 Particelle e parole-chiave", "07 Parole interrogative",
                   "08 Questo, quello, qui, là", "09 Posizione", "10 Verbi essenziali", "14 Classificatori e quantità",
                   "16 Aggettivi comuni", "23 Grammatica avanzata"}
# titolo cinese semplice e punti per le unità tematiche dell'HSK 1
UNIT_INFO = {
    "02 Saluti e cortesia": ("打招呼", ["Chi saluti", "Cosa dici quando incontri qualcuno", "Come ringrazi o ti scusi"]),
    "04 Presentarsi": ("我是谁", ["Come ti chiami", "Di dove sei", "Cosa studi o fai"]),
    "06 Famiglia e persone": ("我的家人", ["Chi c'è nella tua famiglia", "Quanti anni hanno", "Cosa fanno"]),
    "11 Tempo: date e orari": ("今天几点", ["Che giorno è", "A che ora fai qualcosa", "Cosa fai domani"]),
    "12 Momenti della giornata": ("我的一天", ["Cosa fai la mattina", "Cosa fai la sera", "A che ora"]),
    "13 Cibo e bevande": ("吃和喝", ["Cosa mangi", "Cosa bevi", "Cosa ti piace"]),
    "15 Acquisti e soldi": ("买东西", ["Cosa compri", "Quanto costa", "Ti sembra caro o economico"]),
    "17 Scuola e studio": ("我的学校", ["Cosa studi", "Chi è il tuo insegnante", "Ti piace la scuola"]),
    "18 Casa, oggetti e animali": ("我的家", ["Cosa c'è a casa", "Hai un animale", "Com'è la tua stanza"]),
    "19 Meteo": ("今天天气", ["Che tempo fa", "Come ti senti", "Cosa fai"]),
    "20 Luoghi e trasporti": ("去哪儿", ["Dove vai", "Con quale mezzo", "È lontano"]),
    "21 Azioni di tutti i giorni": ("每天做什么", ["Cosa fai ogni giorno", "A che ora", "Con chi"]),
    "22 Lavoro e salute": ("工作和身体", ["Che lavoro fai", "Dove lavori", "Come stai"]),
}

# ---------------------------------------------------------------- banco di argomenti (HSK 2 e 3, e in più per HSK 1)
# (id, titolo it, [varianti titolo zh dalla più alla meno semplice], consegna it, punti, termini candidati)
TOPICS = [
    ("presentarsi", "Presentati", ["我是谁", "自我介绍"], "Presentati a un nuovo amico.", ["Come ti chiami", "Quanti anni hai", "Di dove sei", "Cosa ti piace"], "我 叫 名字 岁 是 中国 人 家 喜欢 学生 老师 朋友 汉语 学"),
    ("famiglia", "La mia famiglia", ["我的家人"], "Parla della tua famiglia.", ["Quante persone ci sono", "Chi sono", "Cosa fanno o quanti anni hanno"], "家 爸爸 妈妈 哥哥 姐姐 弟弟 妹妹 儿子 女儿 家人 工作 岁 有"),
    ("giornata", "La mia giornata", ["我的一天"], "Racconta cosa fai di solito durante la giornata.", ["A che ora ti alzi", "Cosa mangi", "Dove vai", "Cosa fai la sera"], "早上 中午 晚上 点 吃 喝 去 回 学习 工作 睡觉 起床 每天 饭 学校"),
    ("amico", "Il mio amico", ["我的朋友"], "Descrivi un tuo amico.", ["Come si chiama", "Com'è", "Cosa vi piace fare insieme"], "朋友 他 她 很 喜欢 也 高 好 一起 同学 帮 聪明 快乐"),
    ("tempo", "Che tempo fa", ["今天天气", "天气"], "Descrivi il tempo e cosa fai.", ["Che tempo fa oggi", "Come ti senti", "Cosa vuoi fare"], "今天 天气 热 冷 下雨 雨 想 晴 风 雪 好 天 明天 春天 冬天"),
    ("acquisti", "Fare acquisti", ["买东西"], "Racconta cosa compri e quanto costa.", ["Cosa compri", "Quanto costa", "Cosa pensi del prezzo"], "买 个 多少 块 钱 贵 便宜 要 东西 商店 衣服 卖 件"),
    ("cibo", "Il cibo che mi piace", ["我爱吃的东西", "我喜欢的食物"], "Parla del cibo e delle bevande che ti piacciono.", ["Cosa ti piace mangiare", "Cosa bevi", "Cosa non ti piace"], "吃 喝 喜欢 水 米饭 好吃 菜 茶 咖啡 水果 面条 肉 苹果 饭"),
    ("stanza", "La mia stanza", ["我的房间"], "Descrivi la tua stanza.", ["Cosa c'è nella stanza", "Dove si trovano le cose", "Com'è la stanza"], "房间 有 在 桌子 椅子 书 床 里 上 下 大 小 门 家"),
    ("scuola", "La mia scuola", ["我的学校"], "Parla della tua scuola o del tuo corso.", ["Com'è la scuola", "Chi sono i tuoi compagni", "Cosa studi"], "学校 教室 老师 同学 学 学习 考试 课 书 汉语 写 读 懂 学生"),
    ("lavoro", "Il mio lavoro", ["我的工作"], "Parla del tuo lavoro o di quello che vorresti fare.", ["Che lavoro fai", "Dove lavori", "Ti piace"], "工作 公司 医生 老师 忙 累 上班 学生 每天 点 想 喜欢"),
    ("trasporti", "Come arrivare", ["去学校", "怎么去"], "Spiega come arrivare da casa tua a un posto.", ["Dove vuoi andare", "Con quale mezzo", "Quanto è lontano"], "去 来 车 地铁 公交车 出租车 近 远 离 路 走 坐 到 从 飞机 站"),
    ("hobby", "Il mio hobby", ["我喜欢做的事", "我的爱好"], "Parla del tuo hobby.", ["Qual è", "Da quanto tempo lo fai", "Perché ti piace"], "爱好 喜欢 看 听 画 歌 唱 玩 书 电影 音乐 运动 快乐 跑步 打"),
    ("salute", "Salute e sport", ["我的身体", "身体好不好"], "Parla di come ti tieni in forma.", ["Che sport fai", "Quanto spesso", "Come ti senti dopo"], "身体 跑步 篮球 累 经常 每 医生 医院 药 病 好 运动 水"),
    ("viaggio", "Un viaggio", ["去旅游", "一次旅行"], "Racconta un viaggio, reale o immaginario.", ["Dove sei andato", "Come ci sei arrivato", "Cosa ti è piaciuto"], "旅游 机场 飞机 酒店 从 到 去 玩 火车 照片 机票 北京 中国 出国 高兴"),
    ("ristorante", "Al ristorante", ["在饭馆"], "Racconta una cena al ristorante.", ["Con chi sei", "Cosa ordini", "Com'è il cibo"], "饭馆 点 菜 不错 好吃 吃 喝 饭 茶 杯 碗 请 谢谢 贵"),
    ("animali", "Gli animali", ["我喜欢的动物"], "Parla di un animale che ti piace.", ["Quale animale", "Com'è", "Perché ti piace"], "猫 狗 鸟 动物 喜欢 可爱 小 大 有 养 跑 飞 吃"),
    ("luogo", "Il posto dove abito", ["我住的地方"], "Descrivi il posto dove vivi.", ["Dove abiti", "Com'è", "Cosa c'è vicino"], "住 家 学校 商店 医院 公园 楼 路 近 远 大 小 北京 城市 附近"),
    ("weekend", "Il fine settimana", ["星期天", "周末"], "Racconta cosa fai nel fine settimana.", ["Cosa fai", "Con chi", "Dove vai"], "星期 周末 想 去 玩 看 电影 朋友 一起 家 休息 睡觉 买"),
    ("compleanno", "Il compleanno", ["生日"], "Parla del tuo compleanno o di una festa.", ["Quando è", "Chi viene", "Cosa si mangia"], "生日 快乐 月 号 岁 蛋糕 朋友 礼物 高兴 吃 喝 家人 过"),
    ("vestiti", "I vestiti", ["我的衣服"], "Descrivi i tuoi vestiti preferiti.", ["Cosa ti piace indossare", "Di che colore", "Dove lo compri"], "衣服 裤子 穿 红色 白色 黑色 绿色 漂亮 买 喜欢 大 小 件"),
    ("telefono", "Il telefono", ["我的手机"], "Parla del tuo telefono e di come lo usi.", ["Cosa fai con il telefono", "Quanto lo usi", "Cosa ti piace"], "手机 电话 电脑 用 看 听 玩 打 号码 上网 网 朋友 每天"),
    ("musica", "Film e musica", ["电影和音乐"], "Parla dei film o della musica che ti piacciono.", ["Cosa guardi o ascolti", "Quando", "Perché ti piace"], "电影 音乐 歌 看 听 喜欢 好看 好听 唱 朋友 一起 晚上"),
    ("passato", "Cosa ho fatto ieri", ["昨天", "去年"], "Racconta cosa hai fatto ieri o la settimana scorsa.", ["Dove sei andato", "Cosa hai fatto", "Con chi"], "昨天 去年 了 去 买 看 吃 和 跟 朋友 学 做 过"),
    ("futuro", "I miei progetti", ["以后做什么", "我的打算"], "Parla dei tuoi progetti per il futuro.", ["Cosa pensi di fare", "Quando", "Cosa devi preparare"], "明年 打算 想 要 参加 希望 因为 所以 必须 学 工作 毕业"),
    ("confronto", "Confronto", ["比一比"], "Confronta due persone o due cose.", ["Cosa confronti", "Quali differenze", "Quale preferisci"], "比 更 高 大 小 快 慢 好 一样 不同 比较 但是 而且"),
    ("problema", "Un problema e la soluzione", ["遇到问题"], "Racconta un problema e come lo hai risolto.", ["Qual era il problema", "Cosa hai fatto", "Come è finita"], "办法 办 问题 担心 帮助 帮 丢 着急 终于 告诉 发现"),
    ("citta", "La mia città", ["我的城市"], "Descrivi la tua città.", ["Com'è la città", "Cosa c'è di bello", "Cosa non va"], "城市 公园 地铁 附近 方便 但是 大 小 人 多 好玩 商场 车"),
]

# messaggi a cui rispondere: (id, titolo it, consegna it, [varianti zh dalla più alla meno semplice... prima la più naturale], punti, termini, livello minimo)
REPLIES = [
    ("r-nome", "Rispondi a un nuovo amico", "Un nuovo amico ti scrive. Rispondi in cinese.", ["你好！你叫什么名字？你是哪国人？"], ["Il tuo nome", "Il tuo paese"], "叫 名字 国 人 是 我", "hsk1"),
    ("r-famiglia", "Rispondi sulla famiglia", "Un amico ti fa una domanda sulla tua famiglia. Rispondi in cinese.", ["你家有几口人？他们都做什么工作？", "你家有几口人？"], ["Quante persone", "Cosa fanno"], "家 口 人 工作 有 爸爸 妈妈", "hsk1"),
    ("r-oggi", "Rispondi su oggi", "Un amico ti chiede cosa farai. Rispondi in cinese.", ["你今天做什么？想去哪儿？", "你今天做什么？"], ["Cosa fai", "Dove vai"], "今天 去 想 做 看 吃 家 学校", "hsk1"),
    ("r-cibo", "Rispondi sul cibo", "Un amico ti invita a mangiare. Rispondi in cinese.", ["你喜欢吃什么？我们一起吃饭吧！", "你喜欢吃什么？"], ["Cosa ti piace", "Accetti l'invito"], "吃 喝 喜欢 饭 好吃 一起", "hsk1"),
    ("r-weekend", "Rispondi sul fine settimana", "Un amico ti propone qualcosa per il fine settimana. Rispondi in cinese.", ["周末你想做什么？我们一起去玩吧！", "星期天你想做什么？我们一起去玩吧！"], ["Accetti o rifiuti", "Proponi un'idea"], "想 去 玩 看 星期 一起 好", "hsk2"),
    ("r-lezione", "Perché non sei venuto?", "Il tuo insegnante ti scrive. Rispondi in cinese.", ["你昨天为什么没来上课？现在好点了吗？", "你昨天为什么没来上课？"], ["Spiega perché", "Come stai ora"], "因为 病 身体 累 忙 好 昨天", "hsk2"),
    ("r-viaggio", "Parlami del tuo viaggio", "Un amico ti chiede del tuo viaggio. Rispondi in cinese.", ["你去过中国吗？你觉得怎么样？", "你去过北京吗？那儿怎么样？"], ["Sei stato lì", "Com'era"], "去 过 中国 北京 觉得 好 玩 喜欢", "hsk2"),
    ("r-citta", "Descrivi la tua città", "Un amico straniero ti scrive. Rispondi in cinese.", ["你的城市怎么样？有什么好玩的地方？", "你住的地方怎么样？有什么好玩的？"], ["Com'è la città", "Cosa visitare"], "城市 好玩 公园 地方 大 小 但是 方便", "hsk3"),
    ("r-problema", "Un amico ha un problema", "Un amico ti chiede aiuto. Rispondi in cinese.", ["我的手机丢了，怎么办？你能帮我吗？", "我的手机丢了，我很着急。你有什么办法吗？"], ["Consola", "Proponi una soluzione"], "办法 帮 手机 丢 担心 放心 可以 能", "hsk3"),
    ("r-progetti", "Cosa farai?", "Un amico ti chiede dei tuoi progetti. Rispondi in cinese.", ["你以后打算做什么？为什么？"], ["Cosa farai", "Perché"], "打算 想 因为 所以 学 工作 希望", "hsk3"),
]


# ---------------------------------------------------------------- dati
LANGS = ("en", "es")
EXTRA = {"Scrivi sul tema.": ("Write about the topic.", "Escribe sobre el tema.")}
def tr(s, i):  # i: 0=en, 1=es
    d = UI4.get(s) or EXTRA.get(s)
    return d[i] if d else s


def load_levels():
    cards, lex, chars, own = {}, {}, {}, {}
    for lv in ORDER:
        cards[lv] = json.load(open(DATA / FILES[lv], encoding="utf-8"))
        side = json.load(open(DATA / "i18n" / f"cards_{lv}.json", encoding="utf-8"))
        for c in cards[lv]:
            m = side.get(str(c["id"]), {}).get("meaning", {})
            for l in ("it", "en", "es"):
                if m.get(l): c["meaning_" + l] = m[l]
    for i, lv in enumerate(ORDER):
        ws, cs = set(), set()
        for l2 in ORDER[: i + 1]:
            for c in cards[l2]:
                ws.add(c["hanzi"]); cs.update(ch for ch in c["hanzi"] if HAN.match(ch))
        lex[lv], chars[lv], own[lv] = ws, cs, {c["hanzi"] for c in cards[lv]}
    return cards, lex, chars, own


def zh_ok(text, chars):
    """True se tutti i caratteri cinesi della stringa appartengono al livello."""
    return all(ch in chars or ch in PUNCT_OK or not HAN.match(ch) for ch in text)


def meaning(c, lang="it"):
    m = c.get("meaning_" + lang) or c.get("meaning_en") or c.get("meaning_it") or ""
    return re.split(r"[;•]", m)[0].strip()


FUNC_RE = re.compile(r"particle|\(mw|mw\.|measure word|pronoun|preposition|conjunction|numeral|prefix|suffix|modal|auxiliary|interrog", re.I)


def good_for_sentence(c, lv):
    w = c["hanzi"]
    if len(w) < 2 and lv != "hsk1": return False
    if FUNC_RE.search((c.get("meaning_en") or "") + " " + (c.get("meaning_it") or "")): return False
    if c.get("unit") in SKIP_UNITS_HSK1: return False
    return True


def lim(lv, kind, mult=1):
    d = LEVELS[lv][kind]
    return {"min_chars": d["min"] * mult, "target_min": d["lo"] * mult, "max_chars": d["hi"] * mult}


def build(seed):
    cards, lex, chars, own = load_levels()
    rng = random.Random(seed)
    out, report = [], {}
    for lv in ORDER:
        rep = report[lv] = {"sentence_word": 0, "sentences_words": 0, "short_text": 0, "reply": 0, "zh_instr_dropped": 0, "topics_skipped": []}
        L, C = lex[lv], chars[lv]
        pool = [c for c in cards[lv] if good_for_sentence(c, lv)]
        if lv == "hsk3": pool = [c for c in pool if c.get("new")] or pool   # priorità alle parole nuove del sillabo 3.0
        rng.shuffle(pool)
        n = 0

        def add(p):
            nonlocal n
            n += 1
            p.setdefault("id", f"{lv}-{p['task_type']}-{n:03d}")
            p.update({"level": lv, "type": "generated", "source": "Generata dal sillabo"})
            for i, l in enumerate(LANGS):          # titolo/consegna/punti negli altri linguaggi, se non già impostati
                p.setdefault("title_" + l, tr(p["title_it"], i))
                p.setdefault("points_" + l, [tr(x, i) for x in p.get("points", [])])
            out.append(p); rep[p["task_type"]] += 1

        # 1) frase con una parola (modello della prova HSK 3, parte 2)
        for c in pool[: COUNTS[lv]["sentence_word"]]:
            zh = f"请用“{c['hanzi']}”写一个句子。"
            ok = zh_ok(zh, C)
            if not ok: rep["zh_instr_dropped"] += 1
            p = {"task_type": "sentence_word", "unit": "Frase con una parola", "title_it": f"Una frase con {c['hanzi']}", "title_zh": c["hanzi"],
                 "instruction_it": f"Scrivi una frase con la parola {c['hanzi']} ({c['pinyin']}: {meaning(c)}).",
                 "title_en": f"A sentence with {c['hanzi']}", "title_es": f"Una frase con {c['hanzi']}",
                 "instruction_en": f"Write a sentence with the word {c['hanzi']} ({c['pinyin']}: {meaning(c, 'en')}).",
                 "instruction_es": f"Escribe una frase con la palabra {c['hanzi']} ({c['pinyin']}: {meaning(c, 'es')}).",
                 "points_en": ["A complete sentence, with subject and verb"], "points_es": ["Una frase completa, con sujeto y verbo"],
                 "required": [c["hanzi"]], "keywords": [], "points": ["Una frase completa, con soggetto e verbo"]}
            if ok: p["instruction_zh"] = zh
            p.update(lim(lv, "sentence")); add(p)
        # 2) una frase per ciascuna di più parole
        rest = pool[COUNTS[lv]["sentence_word"]:]
        k = 3 if lv == "hsk1" else 3
        for i in range(0, min(len(rest), COUNTS[lv]["sentences_words"] * k), k):
            grp = rest[i:i + k]
            if len(grp) < k: break
            ws = [c["hanzi"] for c in grp]
            zh = "请用下面的词写句子：" + "、".join(ws) + "。"
            ok = zh_ok(zh, C)
            if not ok: rep["zh_instr_dropped"] += 1
            p = {"task_type": "sentences_words", "unit": "Frasi con più parole", "title_it": "Frasi con " + " · ".join(ws), "title_zh": " ".join(ws),
                 "instruction_it": "Scrivi una frase per ciascuna di queste parole: " + ", ".join(f"{c['hanzi']} ({meaning(c)})" for c in grp) + ".",
                 "title_en": "Sentences with " + " · ".join(ws), "title_es": "Frases con " + " · ".join(ws),
                 "instruction_en": "Write one sentence for each of these words: " + ", ".join(f"{c['hanzi']} ({meaning(c, 'en')})" for c in grp) + ".",
                 "instruction_es": "Escribe una frase con cada una de estas palabras: " + ", ".join(f"{c['hanzi']} ({meaning(c, 'es')})" for c in grp) + ".",
                 "points_en": ["One sentence per word"], "points_es": ["Una frase por palabra"],
                 "required": ws, "keywords": [], "points": ["Una frase per parola"]}
            if ok: p["instruction_zh"] = zh
            p.update(lim(lv, "sentence", k)); add(p)

        # 3) brevi testi su un macro-argomento
        def short(title_it, title_zh_variants, brief, points, seeds, unit_label, unit_words=None):
            kws = [w for w in (unit_words if unit_words is not None else seeds) if w in L]
            kws = list(dict.fromkeys(kws))
            need = 5 if lv != "hsk1" else 4
            if len(kws) < need:
                rep["topics_skipped"].append(title_it); return
            kws = kws[:10]
            owns = [w for w in kws if w in own[lv]] or kws
            req = rng.sample(owns, min(N_REQUIRED[lv], len(owns)))
            lo_n, hi_n = N_SENT[lv]; ns = rng.randint(lo_n, hi_n)
            title_zh = next((t for t in title_zh_variants if zh_ok(t, C)), None)
            zh = f"请写{ns}句话，说说“{title_zh}”。" if title_zh else None
            if zh and not zh_ok(zh.replace(title_zh, ""), C): zh = None
            if not zh: rep["zh_instr_dropped"] += 1
            nums = {2: "两", 3: "三", 4: "四", 5: "五", 6: "六"}
            if zh: zh = zh.replace(f"写{ns}句话", f"写{nums.get(ns, ns)}句话")
            p = {"task_type": "short_text", "unit": unit_label, "title_it": title_it, "instruction_it": f"{brief} Scrivi {ns} frasi o più, usando almeno {len(req)} delle parole da usare.",
                 "instruction_en": f"{tr(brief, 0)} Write {ns} sentences or more, using at least {len(req)} of the words to use.",
                 "instruction_es": f"{tr(brief, 1)} Escribe {ns} frases o más, usando al menos {len(req)} de las palabras a usar.",
                 "required": req, "keywords": kws, "points": points}
            if title_zh: p["title_zh"] = title_zh
            if zh and zh_ok(zh, C): p["instruction_zh"] = zh
            p.update(lim(lv, "short")); add(p)

        if lv == "hsk1":  # macro-argomenti = unità tematiche del JSON
            by_unit = {}
            for c in cards[lv]: by_unit.setdefault(c["unit"], []).append(c["hanzi"])
            for u, ws in by_unit.items():
                if u in SKIP_UNITS_HSK1 or u not in UNIT_INFO: continue
                zh, pts = UNIT_INFO[u]
                short(re.sub(r"^\d+\s*", "", u), [zh], "Scrivi sul tema.", pts, ws, u, ws)
        for tid, it, zhv, brief, pts, seeds in TOPICS:
            if lv == "hsk1" and tid in ("passato", "futuro", "confronto", "problema", "citta", "viaggio", "telefono", "musica", "salute"): continue
            short(it, zhv, brief, pts, seeds.split(), "Argomento: " + it)

        # 4) rispondere a un messaggio
        for rid, it, brief, zhv, pts, seeds, minlv in REPLIES:
            if ORDER.index(minlv) > ORDER.index(lv): continue
            zh = next((z for z in zhv if zh_ok(z, C)), None)
            if not zh: continue
            kws = [w for w in seeds.split() if w in L]
            if len(kws) < 3: continue
            p = {"task_type": "reply", "unit": "Rispondere a un messaggio", "title_it": it, "instruction_it": brief, "instruction_en": tr(brief, 0), "instruction_es": tr(brief, 1), "instruction_zh": zh,
                 "required": [], "keywords": kws, "points": pts}
            p.update(lim(lv, "short")); add(p)
    return out, report, cards, lex, chars


def validate(prompts, lex, chars):
    errs = []
    for p in prompts:
        lv = p["level"]
        for k in ("required", "keywords"):
            for w in p.get(k, []):
                if w not in lex[lv]: errs.append(f"{p['id']}: {k} '{w}' fuori dal lessico {lv}")
        if p.get("instruction_zh") and not zh_ok(p["instruction_zh"], chars[lv]): errs.append(f"{p['id']}: instruction_zh con caratteri fuori livello")
        if p.get("title_zh") and not zh_ok(p["title_zh"], chars[lv]): errs.append(f"{p['id']}: title_zh con caratteri fuori livello")
        if not (p["min_chars"] <= p["target_min"] <= p["max_chars"]): errs.append(f"{p['id']}: limiti incoerenti")
    ids = [p["id"] for p in prompts]
    errs += [f"id duplicato {i}" for i in set(ids) if ids.count(i) > 1]
    return errs


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--seed", type=int, default=2026); ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    gen, rep, cards, lex, chars = build(a.seed)
    path = DATA / "prompts.json"
    old = json.load(open(path, encoding="utf-8")) if path.exists() else {"prompts": []}
    keep = [p for p in (old["prompts"] if isinstance(old, dict) else old) if p.get("type") != "generated"]
    errs = validate(gen + keep, lex, chars)
    print(f"seed={a.seed}  conservate (non generate): {len(keep)}")
    for lv in ORDER:
        r = rep[lv]; tot = sum(r[t] for t in ("sentence_word", "sentences_words", "short_text", "reply"))
        print(f"  {lv}: {tot:3d} tracce  (frase+parola {r['sentence_word']}, più parole {r['sentences_words']}, brevi testi {r['short_text']}, risposte {r['reply']})"
              f" · consegne cinesi omesse perché fuori livello: {r['zh_instr_dropped']}" + (f" · argomenti saltati (poche parole): {', '.join(r['topics_skipped'])}" if r['topics_skipped'] else ""))
    if errs:
        print("ERRORI:"); [print(" -", e) for e in errs]; sys.exit(1)
    if a.check: print("(--check: nessun file scritto)"); return
    doc = {"version": 2, "levels": LEVELS, "prompts": keep + gen}
    json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"scritto {path.relative_to(ROOT)}: {len(keep) + len(gen)} tracce")


if __name__ == "__main__":
    main()
