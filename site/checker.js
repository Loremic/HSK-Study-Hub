/* Controllo locale del testo cinese (nessuna AI, nessuna rete).  window.Checker
 *  Checker.run(text, { lex }) -> [ { kind, s, e, excerpt, correction?, alts?, category, explanation, local:true } ]
 *  kind: error (rosso) | hanzi (carattere sbagliato) | strength (verde) | alt (blu, alternativa) | tone (rosso, toni del pinyin)
 *
 *  Cosa riconosce (regole esplicite, nessuna "intuizione"):
 *   - classificatori sbagliati o mancanti (三本苹果, 三个书, 三苹果) con ~110 nomi comuni;
 *   - caratteri confusi/omofoni (高心→高兴, 在见→再见, 作饭→做饭, 觉的→觉得…), 在/再 e 的/得;
 *   - ordine delle parole: luogo dopo il verbo (喝茶在饭馆), tempo in fondo (我去学校昨天), 是 davanti ad aggettivi,
 *     negazione al passato (昨天我不买), 把 senza complemento, 吗 con parola interrogativa, doppi avverbi (很非常);
 *   - toni del pinyin scritto, confrontati con il lessico HSK del sito;
 *   - punti di forza (connettivi in coppia, 把/被, complemento di grado 得, 比, 过) e alternative più ricche.
 *  LIMITI: sono euristiche. Segnalano ciò che sanno riconoscere; non capiscono il senso e non sostituiscono una correzione completa.
 */
(function () {
"use strict";
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const H = "\\p{Script=Han}";
const NUM = "(?:[一二两三四五六七八九十百千万几半]+|\\d+)";
const END = "(?=[，。！？；、\\n]|$)";

/* ---------- caratteri confusi: [sbagliato, giusto, pinyin] ---------- */
const CONF = ("高心 高兴 gāoxìng|对不气 对不起 duìbuqǐ|没关西 没关系 méiguānxi|喜欠 喜欢 xǐhuan|名天 明天 míngtiān|现再 现在 xiànzài|因位 因为 yīnwèi|所已 所以 suǒyǐ|但时 但是 dànshì|可已 可以 kěyǐ|汉与 汉语 hànyǔ|学西 学习 xuéxí|作饭 做饭 zuòfàn|工做 工作 gōngzuò|早尚 早上 zǎoshang|晚尚 晚上 wǎnshang|星其 星期 xīngqī|欢应 欢迎 huānyíng|觉的 觉得 juéde|以经 已经 yǐjīng|经长 经常 jīngcháng|知到 知道 zhīdào|明百 明白 míngbai|休系 休息 xiūxi|生日快了 生日快乐 shēngrì kuàilè|朋有 朋友 péngyou|学效 学校 xuéxiào|医园 医院 yīyuàn|公圆 公园 gōngyuán|图书管 图书馆 túshūguǎn|饭管 饭馆 fànguǎn|商点 商店 shāngdiàn|电恼 电脑 diànnǎo|手几 手机 shǒujī|衣腹 衣服 yīfu|平果 苹果 píngguǒ|牛乃 牛奶 niúnǎi|鸡旦 鸡蛋 jīdàn|票亮 漂亮 piàoliang|非长 非常 fēicháng|天汽 天气 tiānqì|作天 昨天 zuótiān|时问 时间 shíjiān|时侯 时候 shíhou|什磨 什么 shénme|怎磨 怎么 zěnme|清问 请问 qǐngwèn|飞几 飞机 fēijī|做车 坐车 zuòchē|作车 坐车 zuòchē|睡角 睡觉 shuìjiào|睡教 睡觉 shuìjiào|洗燥 洗澡 xǐzǎo|唱哥 唱歌 chànggē|问提 问题 wèntí|自已 自己 zìjǐ|老帅 老师 lǎoshī|英与 英语 yīngyǔ|帮肋 帮助 bāngzhù|练西 练习 liànxí|介招 介绍 jièshào|电景 电影 diànyǐng|游永 游泳 yóuyǒng|跑布 跑步 pǎobù|考式 考试 kǎoshì|旅由 旅游 lǚyóu|认式 认识 rènshi|努利 努力 nǔlì|回达 回答 huídá|在见 再见 zàijiàn|在来 再来 zàilái|再家 在家 zàijiā|再学校 在学校 zàixuéxiào|再这里 在这里 zàizhèlǐ|再这儿 在这儿 zàizhèr|再北京 在北京 zàiběijīng").split("|").map(x => x.split(" "));
const CONFRE = new RegExp(CONF.map(c => c[0]).sort((a, b) => b.length - a.length).join("|"), "gu"), CONFMAP = new Map(CONF.map(c => [c[0], c]));

/* ---------- classificatori: nome -> classificatori ammessi ---------- */
const CL = {};
const defCl = (c, nouns) => nouns.split(" ").forEach(n => { (CL[n] = CL[n] || new Set()).add(c); });
defCl("本", "书 杂志 词典 字典 小说 课本 本子 笔记本"); defCl("杯", "水 茶 咖啡 牛奶 果汁 啤酒 可乐"); defCl("瓶", "水 啤酒 可乐 果汁"); defCl("只", "猫 狗 鸟 鸡 兔子 老虎 熊猫 手 眼睛 杯子");
defCl("条", "鱼 裤子 路 河 裙子 狗 毛巾 街 蛇"); defCl("张", "桌子 纸 床 票 照片 地图 画 嘴 报纸"); defCl("件", "衣服 事 事情 礼物 行李 毛衣"); defCl("把", "椅子 伞 刀 钥匙");
defCl("辆", "车 自行车 汽车 出租车"); defCl("双", "鞋 筷子 手套 袜子"); defCl("位", "老师 先生 客人 朋友"); defCl("碗", "饭 面条 汤 粥"); defCl("块", "蛋糕 手表 钱 肉 面包 巧克力");
defCl("家", "商店 饭馆 饭店 公司 银行 医院 餐厅 书店 超市 咖啡馆"); defCl("部", "电影 手机 电话"); defCl("台", "电脑 电视 电视机 冰箱 洗衣机"); defCl("支", "笔 铅笔 钢笔"); defCl("枝", "笔 铅笔");
defCl("封", "信"); defCl("首", "歌"); defCl("节", "课"); defCl("场", "雨 雪 比赛 电影"); defCl("棵", "树"); defCl("朵", "花"); defCl("匹", "马"); defCl("头", "牛 猪"); defCl("座", "山 桥 房子"); defCl("扇", "门 窗户");
defCl("双", "手 眼睛"); defCl("所", "学校 医院"); defCl("个", "苹果 学生 朋友 人 问题 孩子 同学 东西 菜 鸡蛋 西瓜 橘子 香蕉 水果 杯子 盘子 地方 城市 国家 房间 老师 本子 笔记本 面包 蛋糕 电话 电脑 手机 桌子 椅子 学校 作业 句子 汉字 故事 电影 礼物 苹果 梨 桃");
const NOUNS = Object.keys(CL).sort((a, b) => b.length - a.length);
const KNOWN_C = "个本杯瓶只条张件把辆双位碗块家部台支枝封首节场棵朵匹头座扇";
const BEST = n => { const s = CL[n]; for (const c of s) if (c !== "个") return c; return "个"; };
const RE_CL = new RegExp("(" + NUM + ")([" + KNOWN_C + "])(" + NOUNS.join("|") + ")", "gu");
const RE_NOCL = new RegExp("(?<![一二三四五六七八九十百千万几两半\\d])((?:[二三四五六七八九十几两]|\\d+))(" + NOUNS.filter(n => !/^[个]$/.test(n)).join("|") + ")", "gu");

/* ---------- ordine delle parole ---------- */
const PLACE = "学校里|学校|家里|家|饭馆|饭店|餐厅|商店|超市|图书馆|公司|医院|公园|教室里|教室|北京|上海|中国|这儿|这里|那儿|那里|宿舍|银行|车站|机场|房间|咖啡馆|外面|里面|书店";
const VERB = "吃饭|吃|喝茶|喝咖啡|喝|看书|看电影|看|学习汉语|学习|学汉语|学|玩|买东西|买|做饭|做|读书|读|写|唱歌|唱|跳舞|跳|睡觉|见面|等|聊天|运动|上班|上课|练习";
const RE_PLACE = new RegExp("((?:一起|都|也|经常|常常|每天|总是|一直)?)(" + VERB + ")([^，。！？；、\\n在]{0,5}?)在(" + PLACE + ")" + END, "gu");
const ACT = /^(?:去|来|吃|喝|看|学|做|买|玩|睡|工作|上班|上课|回|到|见|唱|跳|写|读|听|打|坐|走|跑|等|起床|洗|跟|和)/u;
const TIMEW = "经常|常常|总是|昨天|今天|明天|前天|后天|每天|现在|晚上|早上|下午|上午|昨晚|今晚|明晚|周末";
const RE_TIME = new RegExp("(我们|你们|他们|她们|我|你|他|她)([^，。！？；、\\n]{1,8}?)(" + TIMEW + ")" + END, "gu");
const ADJ = "高兴|漂亮|好看|好吃|好|大|小|热|冷|忙|累|高|贵|便宜|快乐|开心|有名|方便|干净|新|旧|远|近|快|慢|多|少";
const RE_SHI_ADJ = new RegExp("(我|你|他|她|它|我们|你们|他们|她们|天气|这|那)是((?:很|非常|太|真|特别|不太|比较)?(?:" + ADJ + "))(?!的|[\\p{Script=Han}]{2,}的)(?=[，。！？；、\\n了]|$)", "gu");
const PASTV = "买|去|来|吃|喝|看|做|说|写|学|见|睡|起|到|回|找|给|听|读|玩|上|下|打|开|走|跑|带|用";
const RE_NEG_PAST = new RegExp("(昨天|上周|去年|前天|刚才|上个月|昨晚|上星期|上次)([^，。！？；、\\n]{0,8}?)不(" + "(?:" + PASTV + ")" + ")(?![过得])", "gu");
const RE_BA = new RegExp("把([^，。！？；、\\n了着过]{1,8}?)(吃|喝|看|写|做|买|读|学|说|听|洗|打扫)" + END, "gu");
const RE_WH_MA = new RegExp("(为什么|谁|哪儿|哪里|怎么样|多少|几点|什么时候|怎么)[^，。！？；、\\n]*吗", "gu");
const RE_DE = new RegExp("(跑|说|写|吃|走|玩|唱|睡|做|学|看|听|读|讲|长|考|过)的(?=(?:很|太|非常|特别|真|不)?(?:好|快|慢|高|多|少|早|晚|大|小|清楚|流利|漂亮|累|开心|高兴))", "gu");
const RE_ZAI = new RegExp("(明天|以后|下次|然后|下午|晚上|明年|改天)在(?=见|来|去|吃|做|看|说|找|联系)", "gu");
const RE_GE_UNIT = new RegExp("(" + NUM + ")个(年|天|岁|分钟|秒钟)", "gu");
const MOTV = "去|来|回|到";
const RE_MOT_ZAI = new RegExp("(" + MOTV + ")在(" + PLACE + ")", "gu");                           // 去在学校
const RE_ZAI_MOT = new RegExp("在(" + "去|来|回" + ")(" + PLACE + ")(?!的)", "gu");               // 在去学校
const RE_V_BU = new RegExp("(" + PASTV + "|吃饭|喝水|睡觉|上班|上课)不(?![了到完起着出下上过清懂见得好动开会成够及惯消])(?=" + H + ")", "gu");   // 买不苹果
const RE_BU_GUO = new RegExp("不(" + PASTV + ")过", "gu");                                          // 不去过
const RE_MEI_LE = new RegExp("没(?:有)?(" + PASTV + ")了", "gu");               // 没买了
const RE_NEG_NEG = /(不没有?|没不|没没)/gu;
const RE_DUO = new RegExp("(我们|你们|他们|她们|大家|每天|每个人|每次|每年|每周|总是|也|所有人|全部)多(?=要|是|有|会|想|能|去|来|做|吃|喝|看|喜欢|可以|在|不|没|需要|应该|爱|知道|学)", "gu");   // 每天多要 -> 每天都要
const RE_MODAL2 = /(会能|能会|可以能|能可以|会可以|可以会|要想要|应该要应该)/gu;
const RE_PART2 = /(吗呢|呢吗|吗吧|吧吗|了了|的的)/gu;
const RE_HEN_V = new RegExp("(很|非常|太|真|特别)(吃|喝|看|买|去|做|写|读|学习|学|听|说|跑|走)(?![得好欢重运术问话明究生校])", "gu");
const RE_BA_NEG = new RegExp("把([^，。！？；、\\n不没]{1,6}?)(不|没有|没)([\\p{Script=Han}]{1,3})", "gu");   // 把书不看 -> 不把书看
const RE_BU_HEN = /不很(?=[\p{Script=Han}])/gu;
const RE_DOUBLE = /(很非常|非常很|很太|太很|很特别|非常特别)/gu;

/* ---------- punti di forza e alternative ---------- */
const PAIRS = [["因为", "所以"], ["虽然", "但是"], ["虽然", "可是"], ["如果", "就"], ["不但", "而且"], ["不仅", "还"], ["一边", "一边"], ["先", "然后"], ["又", "又"], ["只要", "就"], ["除了", "以外"], ["越", "越"]];
const RE_BA_OK = /把[^，。！？；、\n]{1,8}?(?:完|好|给|到|在|成|上|了|走|回|掉)/gu;
const RE_BEI = /被[^，。！？；、\n]{1,6}?(?:了|完|走|坏|吃|拿|偷|打|看见|发现)/gu;
const RE_DEGREE = /(?:吃|说|写|跑|走|唱|睡|做|学|看|听|读|玩|考|长)得(?:很|非常|特别|太|真)?(?:好|快|慢|流利|清楚|多|早|晚|高兴|累|漂亮)/gu;
const RE_BI = /比[^，。！？；、\n很]{1,6}?(?:更|还)?(?:高|大|小|好|贵|便宜|快|慢|多|少|早|晚|冷|热|漂亮|难|容易)/gu;
const RE_GUO = /(?:去|吃|看|学|听|来|见|喝|写|读|做)过/gu;
const ALT = [
  ["很多", ["许多", "不少"]], ["很好", ["非常好", "挺好的", "不错"]], ["很高兴", ["非常高兴", "特别高兴", "很开心"]], ["很漂亮", ["非常漂亮", "好看", "很美"]],
  ["很喜欢", ["非常喜欢", "特别喜欢"]], ["但是", ["可是", "不过"]], ["所以", ["因此", "于是"]], ["然后", ["接着", "之后"]], ["我觉得", ["我认为", "我想"]],
  ["非常", ["十分", "特别", "相当"]], ["有意思", ["有趣"]], ["很大", ["非常大", "挺大的"]]
];
const RE_HAO_ADJ = /好(热|冷|累|忙|大|小|高|贵|漂亮|快|慢|远|近|难)(?!吃|看|玩|听)/gu;

/* ---------- pinyin: confronto dei toni con il lessico ---------- */
function toneCheck(text, lex) {
  const out = []; const W = window.Writing && window.Writing._t; if (!W || !lex || !lex.py) return out;
  const toks = [], re = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*[0-5]?/gu; let m;
  const clean = text.replace(/\p{Script=Han}/gu, " ");
  while ((m = re.exec(clean))) {
    const r = W.parsePinyinToken(m[0]); if (!r.ok) { toks.push(null); continue; }
    toks.push({ s: m.index, e: m.index + m[0].length, syls: r.syls.map(x => ({ b: x.base, t: x.tone || 0, has: x.hasTone })) });
  }
  const flat = []; toks.forEach((t, ti) => { if (t) t.syls.forEach(sy => flat.push(Object.assign({ ti }, sy))); else flat.push(null); });
  for (let i = 0; i < flat.length;) {
    if (!flat[i]) { i++; continue; }
    let hit = null;
    for (let k = Math.min(4, flat.length - i); k >= 1 && !hit; k--) {
      const seg = flat.slice(i, i + k); if (seg.some(x => !x)) continue;
      const ent = lex.py.get(seg.map(x => x.b).join("|")); if (ent) hit = { k, seg, ent };
    }
    if (!hit) { i++; continue; }
    const { k, seg, ent } = hit;
    if (seg.some(x => x.has && x.t >= 1)) {
      const ok = ent.some(v => v.every((t, j) => !(seg[j].has && seg[j].t >= 1) || t === 0 || t === seg[j].t));
      if (!ok) {
        const best = ent[0].map((t, j) => W.applyTone(seg[j].b, t)).join(" "), a = toks[seg[0].ti], z = toks[seg[k - 1].ti];
        out.push({ kind: "tone", category: "pinyin", s: a.s, e: z.e, excerpt: text.slice(a.s, z.e), correction: best,
          explanation: tx("Tono diverso da quello della parola nel lessico HSK: si scrive {c}.", { c: best }) });
      }
    }
    i += k;
  }
  return out;
}

/* ---------- esecuzione ---------- */
function run(text, o) {
  o = o || {}; const out = [], T = text;
  const add = x => out.push(Object.assign({ local: true, excerpt: T.slice(x.s, x.e) }, x));
  const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(T))) { fn(m); if (!m[0].length) re.lastIndex++; } };

  // 1) caratteri confusi
  each(CONFRE, m => { const c = CONFMAP.get(m[0]); add({ kind: "hanzi", category: "caratteri", s: m.index, e: m.index + m[0].length, correction: c[1], explanation: tx("Carattere sbagliato: si scrive {r} ({p}), non {w}.", { r: c[1], p: c[2], w: c[0] }) }); });
  each(RE_ZAI, m => add({ kind: "hanzi", category: "caratteri", s: m.index + m[1].length, e: m.index + m[0].length, correction: "再", explanation: tx("再 (zài) = di nuovo, ancora; 在 indica il luogo o l’azione in corso. Qui serve 再.") }));
  each(RE_DE, m => add({ kind: "hanzi", category: "caratteri", s: m.index + m[1].length, e: m.index + m[0].length, correction: "得", explanation: tx("Se descrivi come si svolge l’azione (verbo + valutazione) si scrive 得 (de), non 的.") }));

  // 2) classificatori
  each(RE_CL, m => {
    const n = m[3], c = m[2], ok = CL[n]; if (ok.has(c)) return; const best = BEST(n), fix = m[1] + best + n;
    add({ kind: "error", category: "classificatore", s: m.index, e: m.index + m[0].length, correction: fix, severity: "major", explanation: tx("Classificatore: {n} usa {c}, non {w}.", { n, c: best, w: c }) });
  });
  each(RE_NOCL, m => { const n = m[2], fix = m[1] + BEST(n) + n; add({ kind: "error", category: "classificatore", s: m.index, e: m.index + m[0].length, correction: fix, explanation: tx("Tra numero e nome serve il classificatore: {f}.", { f: fix }) }); });
  each(RE_GE_UNIT, m => add({ kind: "error", category: "classificatore", s: m.index, e: m.index + m[0].length, correction: m[1] + m[2], explanation: tx("Con {u} non si usa 个: dì {f}.", { u: m[2], f: m[1] + m[2] }) }));

  // 3) ordine delle parole e sintassi
  each(RE_PLACE, m => { const fix = m[1] + "在" + m[4] + m[2] + m[3]; add({ kind: "error", category: "coverbi", s: m.index, e: m.index + m[0].length, correction: fix, severity: "major", explanation: tx("Il luogo con 在 va PRIMA del verbo: 在 + luogo + verbo (non dopo).") }); });
  each(RE_TIME, m => { if (/[是在有的到]/.test(m[2]) || !ACT.test(m[2])) return; const fix = m[1] + m[3] + m[2]; add({ kind: "error", category: "ordine", s: m.index, e: m.index + m[0].length, correction: fix, explanation: tx("La parola di tempo va prima del verbo (dopo il soggetto): {f}.", { f: fix }) }); });
  each(RE_SHI_ADJ, m => { const fix = m[1] + m[2]; add({ kind: "error", category: "grammatica", s: m.index, e: m.index + m[0].length, correction: fix, explanation: tx("Davanti a un aggettivo non si mette 是: {f}.", { f: fix }) }); });
  each(RE_NEG_PAST, m => { const a = m.index + m[1].length + m[2].length; add({ kind: "error", category: "negazione", s: a, e: a + 1, correction: "没", explanation: tx("Per un fatto passato si nega con 没(有), non con 不.") }); });
  each(RE_BA, m => add({ kind: "error", category: "grammatica", s: m.index, e: m.index + m[0].length, correction: m[0] + "完", explanation: tx("Con 把 il verbo non resta nudo: serve un risultato o 了 (es. 把书看完).") }));
  each(RE_WH_MA, m => add({ kind: "error", category: "grammatica", s: m.index, e: m.index + m[0].length, correction: m[0].replace(/吗$/, ""), explanation: tx("Con una parola interrogativa (什么, 谁, 怎么…) non si aggiunge 吗.") }));
  each(RE_DOUBLE, m => add({ kind: "error", category: "grammatica", s: m.index, e: m.index + m[0].length, correction: m[0].startsWith("很") || m[0].startsWith("太") ? m[0].slice(1) : m[0].slice(0, -1), explanation: tx("Due avverbi di grado insieme: ne basta uno.") }));
  each(RE_MOT_ZAI, m => { const fix = m[1] + m[2]; add({ kind: "error", category: "coverbi", s: m.index, e: m.index + m[0].length, correction: fix, severity: "major", explanation: tx("Dopo un verbo di movimento (去, 来, 回, 到) la meta segue direttamente, senza 在: {f}.", { f: fix }) }); });
  each(RE_ZAI_MOT, m => { const fix = m[1] + m[2]; add({ kind: "error", category: "coverbi", s: m.index, e: m.index + m[0].length, correction: fix, explanation: tx("Con un verbo di movimento non si mette 在 davanti: {f}.", { f: fix }) }); });
  each(RE_V_BU, m => {
    const before = T.slice(Math.max(0, T.lastIndexOf("。", m.index) + 1, T.lastIndexOf("！", m.index) + 1, T.lastIndexOf("？", m.index) + 1), m.index);
    const past = new RegExp("(" + "昨天|上周|去年|前天|刚才|上个月|昨晚|上星期|上次|已经" + ")").test(before), neg = past ? "没" : "不";
    add({ kind: "error", category: "negazione", s: m.index, e: m.index + m[0].length, correction: neg + m[1], severity: "major", explanation: tx("La negazione va PRIMA del verbo: {f}. (Dopo il verbo 不 compare solo nei complementi potenziali, come 买不到.)", { f: neg + m[1] }) });
  });
  each(RE_BU_GUO, m => add({ kind: "error", category: "negazione", s: m.index, e: m.index + m[0].length, correction: "没" + m[1] + "过", explanation: tx("L’esperienza passata (verbo + 过) si nega con 没(有): 没{v}过.", { v: m[1] }) }));
  each(RE_MEI_LE, m => add({ kind: "error", category: "negazione", s: m.index, e: m.index + m[0].length, correction: m[0].replace(/了$/, ""), explanation: tx("Con 没(有) non si usa 了: {f}.", { f: m[0].replace(/了$/, "") }) }));
  each(RE_NEG_NEG, m => add({ kind: "error", category: "negazione", s: m.index, e: m.index + m[0].length, explanation: tx("Due negazioni di fila: controlla se ne serve davvero una sola.") }));
  each(RE_DUO, m => { const a = m.index + m[1].length; add({ kind: "error", category: "avverbi", s: a, e: a + 1, correction: "都", severity: "major", explanation: tx("L’avverbio è 都 (dōu = tutti, sempre), non 多 (duō = molto, molti).") }); });
  each(RE_MODAL2, m => add({ kind: "error", category: "grammatica", s: m.index, e: m.index + m[0].length, explanation: tx("Due verbi modali di seguito: ne basta uno.") }));
  each(RE_PART2, m => add({ kind: "error", category: "particelle", s: m.index, e: m.index + m[0].length, correction: m[0][0] === m[0][1] ? m[0][0] : m[0][0], explanation: tx("Due particelle finali o ripetute insieme: ne basta una.") }));
  each(RE_HEN_V, m => add({ kind: "error", category: "avverbi", s: m.index, e: m.index + m[0].length, explanation: tx("很 / 非常 si usano con aggettivi o verbi di stato (喜欢, 想), non con verbi d’azione: prova 经常{v} o 很喜欢{v}.", { v: m[2] }) }));
  each(RE_BA_NEG, m => { const fix = m[2] + "把" + m[1] + m[3]; add({ kind: "error", category: "ordine", s: m.index, e: m.index + m[0].length, correction: fix, explanation: tx("Con 把 la negazione va PRIMA di 把: {f}.", { f: fix }) }); });
  each(RE_BU_HEN, m => add({ kind: "alt", category: "stile", s: m.index, e: m.index + m[0].length, correction: "不太", alts: ["很不"], explanation: tx("不很 suona poco naturale: di solito 不太 (non molto) o 很不.") }));

  // 4) toni del pinyin
  for (const x of toneCheck(T, o.lex)) add(x);

  // 5) punti di forza (solo strutture riconosciute e corrette)
  const strengths = [];
  const pushStrength = (s, e, why) => strengths.push({ kind: "strength", s, e, explanation: why });
  for (const [a, b] of PAIRS) {
    const sentRe = new RegExp("[^。！？\\n]*", "gu"); sentRe.lastIndex = 0; let sm;
    while ((sm = sentRe.exec(T))) { if (!sm[0].length) { sentRe.lastIndex++; continue; } const s = sm[0], i = s.indexOf(a); if (i < 0) continue; const j = s.indexOf(b, i + a.length); if (j < 0) continue;
      pushStrength(sm.index + i, sm.index + i + a.length, tx("Struttura a coppia {p} usata bene: collega le idee in una frase articolata.", { p: a + "…" + b })); break; }
  }
  each(RE_BA_OK, m => pushStrength(m.index, m.index + m[0].length, tx("Costruzione 把 corretta, con il risultato dopo il verbo.")));
  each(RE_BEI, m => pushStrength(m.index, m.index + m[0].length, tx("Costruzione passiva con 被 usata correttamente.")));
  each(RE_DEGREE, m => pushStrength(m.index, m.index + m[0].length, tx("Complemento di grado con 得: ben costruito.")));
  each(RE_BI, m => pushStrength(m.index, m.index + m[0].length, tx("Confronto con 比 costruito correttamente (senza 很).")));
  each(RE_GUO, m => pushStrength(m.index, m.index + m[0].length, tx("Esperienza passata espressa bene con 过.")));
  strengths.sort((a, b) => a.s - b.s); for (const x of strengths.slice(0, 7)) add(x);

  // 6) alternative
  let nAlt = 0;
  each(RE_HAO_ADJ, m => { if (nAlt >= 5) return; nAlt++; add({ kind: "alt", category: "stile", s: m.index, e: m.index + m[0].length, correction: "很" + m[1], alts: ["非常" + m[1]], explanation: tx("好 + aggettivo è colloquiale: nello scritto di solito si preferisce 很 o 非常.") }); });
  for (const [w, alts] of ALT) { if (nAlt >= 5) break; const i = T.indexOf(w); if (i < 0) continue; nAlt++; add({ kind: "alt", category: "stile", s: i, e: i + w.length, correction: alts[0], alts: alts.slice(1), explanation: tx("Corretto, ma si può variare per un testo più ricco o naturale.") }); }
  return out;
}
window.Checker = { run, _t: { CONF, CL, toneCheck } };
})();
