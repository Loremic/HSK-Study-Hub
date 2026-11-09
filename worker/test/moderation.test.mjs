import { moderate } from "../moderation.mjs";
let f=0; const exp=(t,v,k="body")=>{const r=moderate(t,k); if(r.verdict!==v){f++;console.log("FAIL",JSON.stringify(t),"->",r.verdict,r.cats,"atteso",v)}};
// puliti (studio del cinese)
for (const t of ["Come si dice finocchio in cinese?","我喜欢吃苹果，你呢？","这是我妈妈的书。","你妈妈好吗？","你的生日你想怎么过？","Ho un dubbio sul tono di 妈 (mā) e 骂 (mà)","Il gatto negro de mi vecino es bonito","Sono nato a Roma nel 1990","Conte e conto: differenza?","I draghi sono animali fantastici","Qual è il pinyin di 猴子?","迷信 significa superstizione","La porta di destra è aperta","Grazie mille, ottimo aiuto!","Gli italiani sono simpatici","I cinesi sono tutti gentili","Vi consiglio questo libro per HSK 3","Scusa, non sono un idiota ahah" ].slice(0,16)) exp(t,"ok");
// insulti
for (const t of ["sei uno stronzo","Sei un id1ota","s t r o n z o","che coglioneeee","fuck you all","you are an asshole","hijo de puta","eres un gilipollas","vaffanculo!","傻逼","他妈的","testa di cazzo"]) exp(t,"block");
// odio
for (const t of ["i gay fanno schifo","frocio di merda","sporco negro","cinesi di merda","tornatevene a casa vostra","gli immigrati sono feccia","muslims are terrorists","los inmigrantes son basura","白痴","黑鬼"]) exp(t,"block");
// violenza, bestemmie, dati
for (const t of ["ti ammazzo","devono morire tutti","kill yourself","porco dio","dio cane","chiamami al +39 333 123 4567","scrivimi a mario@example.com"]) exp(t,"block");
// politica, link -> review
for (const t of ["Chi voterete alle elezioni?","Meloni ha ragione","Trump is great","习近平","vote for Biden","guarda www.example.com","visita https://x.it/abc","los musulmanes son muchos"]) exp(t,"review");
// nick
exp("Mario_88","ok","nick"); exp("stronzo99","block","nick"); exp("www.sito.it","block","nick");
console.log(f?("FAIL "+f):"ALL OK");
