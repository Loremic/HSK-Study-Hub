# -*- coding: utf-8 -*-
"""Genera data/grammar.json: roadmap grammaticale per livello HSK.
Voce: (id, livello, (titolo it,en,es), schema, (spiegazione it,en,es), [(zh, pinyin, (it,en,es))], [id collegati])
Le spiegazioni sono sintetiche e originali; l'ordine segue una progressione didattica, non l'elenco ufficiale."""
import json, os
P = []
def g(*a): P.append(a)
# ---------------- HSK 1
g("svo",1,("Ordine base della frase","Basic word order","Orden básico de la oración"),"Soggetto + Verbo + Oggetto",
 ("L'ordine è come in italiano: chi fa, cosa fa, su cosa. Il verbo non cambia mai forma.","Same order as English: who, does what, to what. Verbs never change form.","Igual que en español: quién, qué hace, sobre qué. El verbo nunca cambia de forma."),
 [("我喝茶。","Wǒ hē chá.",("Bevo tè.","I drink tea.","Bebo té."))],["neg-bu","time-pos"])
g("shi",1,("Essere: 是","To be: 是","Ser: 是"),"A 是 B",
 ("是 collega due nomi (A è B). Non si usa davanti agli aggettivi.","是 links two nouns (A is B). It is not used before adjectives.","是 une dos sustantivos (A es B). No se usa ante adjetivos."),
 [("他是老师。","Tā shì lǎoshī.",("Lui è insegnante.","He is a teacher.","Él es profesor."))],["adj-hen","neg-bu"])
g("adj-hen",1,("Aggettivi con 很","Adjectives with 很","Adjetivos con 很"),"Soggetto + 很 + Aggettivo",
 ("L'aggettivo si usa senza 'essere', di solito preceduto da 很 (che qui significa poco più di 'è').","Adjectives work without 'be', usually after 很 (which here is only a light 'is').","El adjetivo no lleva 'ser', normalmente va tras 很 (aquí casi sin sentido propio)."),
 [("今天很热。","Jīntiān hěn rè.",("Oggi fa caldo.","Today is hot.","Hoy hace calor."))],["shi","compare-bi"])
g("neg-bu",1,("Negazione: 不 e 没","Negation: 不 and 没","Negación: 不 y 没"),"不 + Verbo / 没(有) + Verbo",
 ("不 nega abitudini e presente/futuro; 没 nega il passato e il verbo 有 (avere).","不 negates habits, present and future; 没 negates the past and the verb 有 (to have).","不 niega hábitos, presente y futuro; 没 niega el pasado y el verbo 有."),
 [("我不喝咖啡。","Wǒ bù hē kāfēi.",("Non bevo caffè.","I don't drink coffee.","No bebo café.")),("我没有钱。","Wǒ méiyǒu qián.",("Non ho soldi.","I have no money.","No tengo dinero."))],["le-done","you"])
g("ma-q",1,("Domande con 吗 e 呢","Questions with 吗 and 呢","Preguntas con 吗 y 呢"),"Frase + 吗？ / …呢？",
 ("Per una domanda sì/no basta aggiungere 吗 in fondo. 呢 ripropone la stessa domanda ('e tu?').","For a yes/no question just add 吗 at the end. 呢 repeats the question ('and you?').","Para sí/no basta añadir 吗 al final. 呢 repite la pregunta ('¿y tú?')."),
 [("你好吗？","Nǐ hǎo ma?",("Come stai?","How are you?","¿Cómo estás?"))],["q-word"])
g("time-pos",1,("Il tempo prima del verbo","Time before the verb","El tiempo antes del verbo"),"Soggetto + Tempo + Verbo",
 ("Le espressioni di tempo (oggi, domani, alle tre) vanno dopo il soggetto e prima del verbo.","Time words (today, tomorrow, at three) go after the subject and before the verb.","Las expresiones de tiempo van tras el sujeto y antes del verbo."),
 [("我明天去北京。","Wǒ míngtiān qù Běijīng.",("Domani vado a Pechino.","I'm going to Beijing tomorrow.","Mañana voy a Pekín."))],["svo","zai-loc"])
# ---------------- HSK 2
g("le-done",2,("Azione compiuta: 了","Completed action: 了","Acción completada: 了"),"Verbo + 了 (+ Oggetto)",
 ("了 dopo il verbo segnala che l'azione è avvenuta o conclusa. Non è un vero 'passato'.","了 after a verb marks that the action happened or was completed. It is not a true past tense.","了 tras el verbo marca que la acción ocurrió o se completó. No es un pasado propiamente dicho."),
 [("我买了一本书。","Wǒ mǎi le yì běn shū.",("Ho comprato un libro.","I bought a book.","Compré un libro."))],["neg-bu","le-change","guo"])
g("zai-loc",2,("Luogo con 在","Location with 在","Lugar con 在"),"Soggetto + 在 + Luogo + Verbo",
 ("在 + luogo si mette prima del verbo per dire dove avviene l'azione.","在 + place goes before the verb to say where the action happens.","在 + lugar va antes del verbo para decir dónde ocurre la acción."),
 [("他在家看书。","Tā zài jiā kàn shū.",("Lui legge a casa.","He reads at home.","Él lee en casa."))],["time-pos","zai-prog"])
g("zai-prog",2,("Azione in corso: 正在","Ongoing action: 正在","Acción en curso: 正在"),"正在 / 在 + Verbo (+ 呢)",
 ("Mette in primo piano l'azione che sta succedendo adesso.","Highlights an action happening right now.","Resalta la acción que ocurre ahora mismo."),
 [("我在吃饭呢。","Wǒ zài chī fàn ne.",("Sto mangiando.","I'm eating.","Estoy comiendo."))],["zai-loc","le-done"])
g("compare-bi",2,("Il comparativo con 比","Comparison with 比","Comparativo con 比"),"A + 比 + B + Aggettivo",
 ("Per dire 'A è più … di B'. L'aggettivo non prende 很. Si può aggiungere la differenza dopo.","For 'A is more … than B'. The adjective does not take 很. A degree can follow.","Para 'A es más … que B'. El adjetivo no lleva 很. Se puede añadir la diferencia detrás."),
 [("今天比昨天冷。","Jīntiān bǐ zuótiān lěng.",("Oggi fa più freddo di ieri.","Today is colder than yesterday.","Hoy hace más frío que ayer."))],["adj-hen","bi-more"])
g("neng-hui",2,("Verbi modali: 能 / 会 / 可以","Modals: 能 / 会 / 可以","Modales: 能 / 会 / 可以"),"Soggetto + 会/能/可以 + Verbo",
 ("会 = saper fare (imparato), 能 = essere in grado/capace, 可以 = poter fare (permesso).","会 = know how to (learned), 能 = be able to, 可以 = be allowed to.","会 = saber hacer, 能 = ser capaz, 可以 = tener permiso."),
 [("我会说中文。","Wǒ huì shuō Zhōngwén.",("So parlare cinese.","I can speak Chinese.","Sé hablar chino."))],["neg-bu"])
g("guo",2,("Esperienza: 过","Experience: 过","Experiencia: 过"),"Verbo + 过",
 ("过 indica che si è già fatta un'esperienza almeno una volta nella vita.","过 shows you have done something at least once in your life.","过 indica que has vivido algo al menos una vez."),
 [("我去过中国。","Wǒ qù guo Zhōngguó.",("Sono stato in Cina.","I have been to China.","He estado en China."))],["le-done"])
# ---------------- HSK 3
g("le-change",3,("Cambiamento di stato: 了","Change of state: 了","Cambio de estado: 了"),"…… 了 (a fine frase)",
 ("Un 了 finale dice che la situazione è cambiata: 'ormai', 'adesso è così'.","A sentence-final 了 says the situation has changed: 'now', 'by now'.","Un 了 final indica que la situación ha cambiado: 'ya', 'ahora'."),
 [("天黑了。","Tiān hēi le.",("Si è fatto buio.","It has gotten dark.","Ya oscureció."))],["le-done"])
g("ba",3,("La struttura 把","The 把 construction","La construcción 把"),"S + 把 + O + Verbo + Risultato",
 ("Si sposta l'oggetto davanti al verbo per dire cosa gli succede. Il verbo deve avere un complemento o 了.","The object moves before the verb to say what happens to it. The verb needs a complement or 了.","El objeto se adelanta al verbo para decir qué le ocurre. El verbo necesita complemento o 了."),
 [("请把门关上。","Qǐng bǎ mén guān shàng.",("Per favore chiudi la porta.","Please close the door.","Por favor, cierra la puerta."))],["resultative","bei"])
g("resultative",3,("Complementi di risultato","Resultative complements","Complementos de resultado"),"Verbo + Complemento (完/到/好/见)",
 ("Si aggiunge al verbo un secondo elemento che dice l'esito: finito, raggiunto, riuscito.","A second element after the verb tells the outcome: finished, reached, succeeded.","Un segundo elemento tras el verbo indica el resultado: terminado, alcanzado, logrado."),
 [("我看见他了。","Wǒ kànjiàn tā le.",("L'ho visto.","I saw him.","Lo vi."))],["ba","le-done"])
g("de-complement",3,("Complemento di grado: 得","Degree complement: 得","Complemento de grado: 得"),"Verbo + 得 + Aggettivo",
 ("Descrive come viene svolta un'azione. Se c'è un oggetto, si ripete il verbo.","Describes how an action is done. With an object, the verb is repeated.","Describe cómo se hace una acción. Con objeto, se repite el verbo."),
 [("她说得很好。","Tā shuō de hěn hǎo.",("Parla molto bene.","She speaks very well.","Habla muy bien."))],["adj-hen"])
g("conj-sd",3,("Se… allora: 如果…就","If … then: 如果…就","Si… entonces: 如果…就"),"如果 + A，(就) + B",
 ("Per le ipotesi. 就 introduce la conseguenza. Con 因为…所以… si esprime la causa.","For conditions. 就 introduces the result. 因为…所以… expresses cause.","Para condiciones. 就 introduce la consecuencia. 因为…所以… expresa la causa."),
 [("如果下雨，我就不去。","Rúguǒ xià yǔ, wǒ jiù bú qù.",("Se piove, non vado.","If it rains, I won't go.","Si llueve, no voy."))],["suiran"])
g("you",3,("Avere e esistere: 有","Having and existing: 有","Tener y existir: 有"),"处所 + 有 + Cosa",
 ("有 serve anche per dire che in un luogo c'è qualcosa: 'qui ci sono…'.","有 also says something exists in a place: 'there is…'.","有 también dice que algo existe en un lugar: 'hay…'."),
 [("桌子上有一本书。","Zhuōzi shàng yǒu yì běn shū.",("Sul tavolo c'è un libro.","There is a book on the table.","Sobre la mesa hay un libro."))],["neg-bu","zai-loc"])
# ---------------- HSK 4
g("bei",4,("Il passivo con 被","The passive with 被","La pasiva con 被"),"O + 被 + (Agente) + Verbo + Risultato",
 ("Il soggetto subisce l'azione. Spesso ha sfumatura negativa o inattesa.","The subject undergoes the action. It often has a negative or unexpected tone.","El sujeto recibe la acción. A menudo tiene matiz negativo o inesperado."),
 [("我的手机被偷了。","Wǒ de shǒujī bèi tōu le.",("Mi hanno rubato il telefono.","My phone was stolen.","Me robaron el móvil."))],["ba"])
g("suiran",4,("Concessiva: 虽然…但是","Concession: 虽然…但是","Concesiva: 虽然…但是"),"虽然 A，但是 B",
 ("'Sebbene A, tuttavia B'. In cinese entrambe le parti compaiono.","'Although A, still B'. Chinese uses both parts together.","'Aunque A, sin embargo B'. En chino aparecen ambas partes."),
 [("虽然很累，但是我很高兴。","Suīrán hěn lèi, dànshì wǒ hěn gāoxìng.",("Anche se stanco, sono contento.","Although tired, I am happy.","Aunque cansado, estoy contento."))],["conj-sd","budan"])
g("bi-more",4,("Intensificare il paragone","Strengthening comparisons","Reforzar la comparación"),"A + 比 + B + 更/还 + Agg.",
 ("更 e 还 dopo 比 rinforzano: 'ancora più'. Con 没有 si fa il confronto negativo.","更 and 还 after 比 add 'even more'. 没有 makes a negative comparison.","更 y 还 tras 比 añaden 'aún más'. 没有 forma la comparación negativa."),
 [("这个比那个更贵。","Zhège bǐ nàge gèng guì.",("Questo è ancora più caro.","This one is even more expensive.","Este es aún más caro."))],["compare-bi"])
g("lian",4,("Enfasi: 连…都","Emphasis: 连…都","Énfasis: 连…都"),"连 + X + 都/也 + Verbo",
 ("'Perfino X'. Serve a dire che anche il caso più estremo è incluso.","'Even X'. It says the most extreme case is included too.","'Incluso X'. Dice que el caso más extremo también entra."),
 [("他连饭都没吃。","Tā lián fàn dōu méi chī.",("Non ha mangiato nemmeno il pasto.","He didn't even eat.","Ni siquiera comió."))],["neg-bu"])
g("budan",4,("Non solo… ma anche","Not only… but also","No solo… sino también"),"不但 A，而且 B",
 ("Aggiunge un secondo elemento più forte al primo.","Adds a second, stronger element to the first.","Añade un segundo elemento más fuerte al primero."),
 [("她不但漂亮，而且聪明。","Tā búdàn piàoliang, érqiě cōngmíng.",("Non solo è bella, ma anche intelligente.","She is not only pretty but also smart.","No solo es guapa, también lista."))],["suiran"])
# ---------------- HSK 5
g("yue",5,("Più… più…: 越…越","The more… the more…: 越…越","Cuanto más… más…: 越…越"),"越 A 越 B",
 ("Descrive due grandezze che crescono insieme.","Describes two quantities growing together.","Describe dos magnitudes que crecen juntas."),
 [("雨越下越大。","Yǔ yuè xià yuè dà.",("Piove sempre più forte.","The rain gets heavier and heavier.","Llueve cada vez más fuerte."))],["bi-more"])
g("jishi",5,("Anche se: 即使…也","Even if: 即使…也","Aunque: 即使…也"),"即使 A，也 B",
 ("Ipotesi estrema che non cambia il risultato.","An extreme supposition that does not change the result.","Suposición extrema que no cambia el resultado."),
 [("即使下雨，我也要去。","Jíshǐ xià yǔ, wǒ yě yào qù.",("Anche se piove, ci vado.","Even if it rains, I'll go.","Aunque llueva, iré."))],["conj-sd","suiran"])
g("yiwei",5,("Prendere come: 以…为","Taking as: 以…为","Tomar como: 以…为"),"以 A 为 B",
 ("Schema formale: 'prendere A come B'. Molto frequente in testi scritti.","Formal pattern: 'take A as B'. Frequent in written texts.","Patrón formal: 'tomar A como B'. Frecuente en textos escritos."),
 [("他以学习为乐。","Tā yǐ xuéxí wéi lè.",("Trova gioia nello studio.","He takes joy in studying.","Encuentra alegría en estudiar."))],["lian"])
g("zhide",5,("Vale la pena: 值得","Worth doing: 值得","Vale la pena: 值得"),"值得 + Verbo",
 ("'Vale la pena di…'. Si combina con 看/买/学 e altri verbi.","'Is worth…'. Combines with 看/买/学 and other verbs.","'Vale la pena…'. Se combina con 看/买/学 y otros verbos."),
 [("这本书值得读。","Zhè běn shū zhídé dú.",("Vale la pena leggere questo libro.","This book is worth reading.","Este libro vale la pena."))],["de-complement"])
# ---------------- HSK 6
g("fanzheng",6,("Comunque: 反正 / 无论…都","Anyway: 反正 / 无论…都","Pase lo que pase: 反正 / 无论…都"),"无论 A，都 B",
 ("'Qualunque sia A, B resta valido'. 不管 è la variante parlata.","'Whatever A is, B holds'. 不管 is the spoken variant.","'Sea cual sea A, B se mantiene'. 不管 es la variante hablada."),
 [("无论多忙，他都来。","Wúlùn duō máng, tā dōu lái.",("Per quanto sia occupato, viene.","No matter how busy, he comes.","Por muy ocupado que esté, viene."))],["jishi"])
g("yishi",6,("Registro formale: 之 e 所","Formal register: 之 and 所","Registro formal: 之 y 所"),"A 之 B / 所 + Verbo",
 ("Elementi del cinese scritto: 之 lega due nomi, 所 nominalizza un verbo.","Written-Chinese elements: 之 links nouns, 所 nominalises a verb.","Elementos del chino escrito: 之 une nombres, 所 nominaliza un verbo."),
 [("这是我所知道的。","Zhè shì wǒ suǒ zhīdào de.",("Questo è ciò che so.","This is what I know.","Esto es lo que sé."))],["yiwei"])
g("yishi2",6,("Tuttavia e dunque: 然而 / 因而","However and thus: 然而 / 因而","Sin embargo y así: 然而 / 因而"),"……然而……；……因而……",
 ("Connettivi tipici dei testi argomentativi: contrasto (然而) e conseguenza (因而).","Connectors of argumentative texts: contrast (然而) and consequence (因而).","Conectores de textos argumentativos: contraste (然而) y consecuencia (因而)."),
 [("他很努力，然而没成功。","Tā hěn nǔlì, rán'ér méi chénggōng.",("Si è impegnato, ma non ci è riuscito.","He tried hard, yet failed.","Se esforzó, pero no lo logró."))],["suiran","budan"])
# ---------------- HSK 7-9
g("fusu",79,("Strutture parallele e sintesi","Parallel structures and synthesis","Estructuras paralelas y síntesis"),"A，B，乃至 C",
 ("Nei livelli alti si elencano elementi in gradazione, con 乃至 'fino a'.","At advanced levels items are listed by degree, with 乃至 'up to'.","En niveles altos se enumeran elementos graduados con 乃至 'hasta'."),
 [("这影响了个人、社会乃至国家。","Zhè yǐngxiǎo le gèrén、shèhuì nǎizhì guójiā.",("Ciò ha inciso su individuo, società e perfino sullo Stato.","It affected individuals, society and even the nation.","Afectó al individuo, a la sociedad e incluso al país."))],["yishi"])
g("chengyu",79,("Espressioni a quattro caratteri","Four-character expressions","Expresiones de cuatro caracteres"),"成语",
 ("I 成语 condensano storie in quattro caratteri e vanno imparati interi, come blocchi fissi.","成语 condense stories into four characters and are learnt whole, as fixed blocks.","Los 成语 condensan historias en cuatro caracteres y se aprenden enteros."),
 [("画蛇添足。","Huà shé tiān zú.",("Disegnare un serpente con i piedi (strafare).","To draw legs on a snake (overdo it).","Dibujar patas a una serpiente (pasarse)."))],["yishi2"])
g("bianti",79,("Ellissi e frasi senza soggetto","Ellipsis and subjectless sentences","Elipsis y oraciones sin sujeto"),"Omissione del soggetto",
 ("Il cinese omette volentieri il soggetto quando è chiaro dal contesto; va dedotto.","Chinese often drops the subject when context makes it clear; it must be inferred.","El chino omite el sujeto cuando el contexto lo aclara; hay que deducirlo."),
 [("没问题，马上办。","Méi wèntí, mǎshàng bàn.",("Nessun problema, lo faccio subito.","No problem, will do it right away.","Sin problema, lo hago ya."))],["svo"])
# ------- extra: domande con parole interrogative (referenziata come q-word)
g("q-word",1,("Parole interrogative","Question words","Palabras interrogativas"),"谁 / 什么 / 哪儿 / 几 / 多少",
 ("La parola interrogativa occupa il posto dell'informazione cercata: non si sposta all'inizio.","The question word sits where the missing information would be: it does not move to the front.","La palabra interrogativa ocupa el lugar de la información buscada; no pasa al inicio."),
 [("你叫什么名字？","Nǐ jiào shénme míngzi?",("Come ti chiami?","What's your name?","¿Cómo te llamas?"))],["ma-q"])
NEUTRAL = [("Soggetto","S"),("Verbo","V"),("Oggetto","O"),("Aggettivo","Adj"),("Aggettivi","Adj"),("Luogo","Place"),("处所","Place"),("Tempo","Time"),("Cosa","X"),("Risultato","Result"),("Agente","Agent"),("Complemento","Compl."),("Frase","Clause"),("Agg.","Adj"),("Omissione del soggetto","(S)")]
def neutral(x):
    for a,b in NEUTRAL: x=x.replace(a,b)
    return x
P=[(p[0],p[1],p[2],neutral(p[3])) + tuple(p[4:]) for p in P]
ids={p[0] for p in P}
bad=[(p[0],r) for p in P for r in p[6] if r not in ids]
assert not bad, bad
out=[{"id":p[0],"lv":p[1],"t":dict(zip("it en es".split(),p[2])),"p":p[3],"d":dict(zip("it en es".split(),p[4])),
      "ex":[{"zh":e[0],"py":e[1],"tr":dict(zip("it en es".split(),e[2]))} for e in p[5]],"rel":p[6]} for p in P]
root=os.path.join(os.path.dirname(__file__),"..","data")
json.dump(out,open(os.path.join(root,"grammar.json"),"w",encoding="utf8"),ensure_ascii=False,separators=(",",":"))
print(len(out),"punti")
