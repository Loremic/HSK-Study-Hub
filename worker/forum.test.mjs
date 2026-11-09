import { DatabaseSync } from "node:sqlite"; import fs from "node:fs";
import worker from "../worker.js";
let fails=0; const ok=(c,m,x)=>{ if(!c){fails++;console.log("FAIL",m,x??"")} else console.log("ok  ",m) };
function mkDB(){ const db=new DatabaseSync(":memory:"); db.exec(fs.readFileSync(new URL("../schema.sql",import.meta.url),"utf8"));
  const prep=sql=>{ let args=[]; const o={ bind(...a){args=a;return o}, async first(){ return db.prepare(sql).get(...args)||null }, async all(){ return {results:db.prepare(sql).all(...args)} }, async run(){ db.prepare(sql).run(...args); return {success:true} }, _run(){ db.prepare(sql).run(...args) } }; return o };
  return { prepare:prep, async batch(list){ db.exec("BEGIN"); try{ for(const s of list) s._run(); db.exec("COMMIT") }catch(e){ db.exec("ROLLBACK"); throw e } return [] } , raw:db } }
const env={ ALLOWED_ORIGINS:"https://a.it", DB:mkDB(), ADMIN_TOKEN:"x".repeat(20)+"TOKEN1", FORUM_SALT:"s" };
const V1="aaaaaaaaaaaaaaaa1111", V2="bbbbbbbbbbbbbbbb2222", V3="cccccccccccccccc3333";
let ipn=0; const call=async(body,e=env,ip="1.1.1.1")=>{ const r=await worker.fetch(new Request("https://w/",{method:"POST",headers:{origin:"https://a.it","content-type":"application/json","cf-connecting-ip":ip},body:JSON.stringify(body)}),e); return {s:r.status,j:await r.json()} };
// creazione
let r=await call({task:"forum_post",voter:V1,nick:"Lorenzo",title:"Come si impara il tono?",body:"Qualche consiglio per i toni di HSK 1?"}); ok(r.s===200&&r.j.result.status==="ok","post pulito pubblicato",JSON.stringify(r.j)); const P1=r.j.result.id;
r=await call({task:"forum_post",voter:V1,nick:"Lorenzo",title:"Sei uno stronzo",body:"testo"}); ok(r.s===422&&r.j.reasons.includes("insult"),"insulto bloccato (422) con categoria",JSON.stringify(r.j));
r=await call({task:"forum_post",voter:V1,nick:"Lorenzo",title:"Elezioni",body:"Chi voterete alle elezioni?"}); ok(r.s===200&&r.j.result.status==="pending","politica -> pending",JSON.stringify(r.j)); const PEND=r.j.result.id;
r=await call({task:"forum_post",voter:V1,nick:"Admin",title:"Titolo valido",body:"testo valido"}); ok(r.s===400&&r.j.field==="nick","nick riservato rifiutato");
r=await call({task:"forum_post",voter:"x",nick:"Mario",title:"Titolo valido",body:"testo valido"}); ok(r.s===400,"voter non valido");
r=await call({task:"forum_post",voter:V1,nick:"Mario",title:"Titolo <b>x</b>",body:"<script>alert(1)</script> ciao"}); ok(r.s===200,"HTML accettato come testo (verrà mostrato con textContent)");
// lista: pending non visibile
r=await call({task:"forum_list",sort:"new",voter:V2}); ok(r.s===200&&r.j.result.posts.length===2&&!r.j.result.posts.some(p=>p.id===PEND),"lista senza pending",r.j.result.posts.length);
// voti
r=await call({task:"forum_vote",voter:V2,target:"p_"+P1,v:1},env,"2.2.2.2"); ok(r.j.result.score===1,"upvote",JSON.stringify(r.j));
r=await call({task:"forum_vote",voter:V2,target:"p_"+P1,v:1},env,"2.2.2.2"); ok(r.j.result.score===1,"stesso voto ripetuto non raddoppia");
r=await call({task:"forum_vote",voter:V3,target:"p_"+P1,v:1},env,"3.3.3.3"); ok(r.j.result.score===2,"secondo votante");
r=await call({task:"forum_vote",voter:V2,target:"p_"+P1,v:-1},env,"2.2.2.2"); ok(r.j.result.score===0,"cambio voto +1 -> -1 (2-1... =0)",JSON.stringify(r.j));
r=await call({task:"forum_vote",voter:V2,target:"p_"+P1,v:0},env,"2.2.2.2"); ok(r.j.result.score===1,"ritiro voto");
r=await call({task:"forum_vote",voter:V1,target:"p_"+P1,v:1}); ok(r.s===403,"niente voto al proprio post");
r=await call({task:"forum_vote",voter:V2,target:"p_"+P1,v:5}); ok(r.s===400,"valore voto non valido");
r=await call({task:"forum_vote",voter:V2,target:"p_"+PEND,v:1}); ok(r.s===404,"niente voto su contenuto non pubblicato");
// ordinamento
const mk=async(t,voters)=>{ const x=await call({task:"forum_post",voter:V1,nick:"Lorenzo",title:t,body:"corpo "+t},env,"9.9.9."+Math.floor(Math.random()*200)); return x.j.result.id };
env.DB.raw.exec("DELETE FROM rl");
const PA=await mk("Post A basso"), PB=await mk("Post B molto votato");
for(const [v,ip] of [[V2,"4.4.4.4"],[V3,"5.5.5.5"]]) await call({task:"forum_vote",voter:v,target:"p_"+PB,v:1},env,ip);
await call({task:"forum_vote",voter:V2,target:"p_"+PA,v:-1},env,"4.4.4.4");
r=await call({task:"forum_list",sort:"top",voter:V2}); ok(r.j.result.posts[0].id===PB,"ordinamento per voti: il più votato in cima",r.j.result.posts.map(p=>p.title+":"+p.score).join(" | "));
ok(r.j.result.posts.find(p=>p.id===PB).my_vote===1,"my_vote riportato al votante");
r=await call({task:"forum_list",sort:"hot",voter:V2}); ok(r.j.result.posts[0].id===PB,"hot: il più votato prima",r.j.result.posts.map(p=>p.title+":"+p.score).join(" | "));
// vecchio ma molto votato vs nuovo: il tempo conta
env.DB.raw.exec(`UPDATE posts SET ts = ts - 86400*20 WHERE id='${PB}'`); r=await call({task:"forum_list",sort:"hot",voter:V2}); ok(r.j.result.posts[0].id!==PB,"hot: un post di 20 giorni scende");
// commenti
r=await call({task:"forum_comment",voter:V2,nick:"Giulia",post_id:P1,body:"Ascolta tanto e ripeti!"},env,"6.6.6.6"); ok(r.s===200&&r.j.result.status==="ok","commento pubblicato"); const C1=r.j.result.id;
r=await call({task:"forum_comment",voter:V3,nick:"Paolo",post_id:P1,body:"Sei un idiota se non lo sai"},env,"7.7.7.7"); ok(r.s===422,"commento offensivo bloccato");
r=await call({task:"forum_comment",voter:V3,nick:"Paolo",post_id:P1,body:"Meloni ha ragione"},env,"7.7.7.7"); ok(r.s===200&&r.j.result.status==="pending","commento politico in revisione");
r=await call({task:"forum_comment",voter:V3,nick:"Paolo",post_id:P1,body:"Anch'io ripeto ogni giorno"},env,"7.7.7.7"); const C2=r.j.result.id;
await call({task:"forum_vote",voter:V1,target:"c_"+C2,v:1},env,"1.1.1.2");
r=await call({task:"forum_get",id:P1,voter:V1}); ok(r.j.result.comments.length===2&&r.j.result.comments[0].id===C2,"commenti ordinati per voti",r.j.result.comments.map(c=>c.score).join());
ok(r.j.result.post.ncomments===2,"contatore commenti");
// segnalazioni -> nascosto
for(const [i,v] of [[1,"dddddddddddddddd0001"],[2,"dddddddddddddddd0002"],[3,"dddddddddddddddd0003"]]) r=await call({task:"forum_report",voter:v,target:"c_"+C1},env,"8.8.8."+i);
ok(r.j.result.hidden===true,"3 segnalazioni nascondono il commento");
r=await call({task:"forum_get",id:P1,voter:V1}); ok(r.j.result.comments.length===1,"commento segnalato non più visibile");
// moderatore
r=await call({task:"forum_admin",token:"sbagliato",action:"pending"}); ok(r.s===403,"token errato rifiutato");
r=await call({task:"forum_admin",token:env.ADMIN_TOKEN,action:"pending"}); ok(r.s===200&&r.j.result.posts.length===1&&r.j.result.comments.length>=1,"pannello: elenco in attesa",JSON.stringify(r.j).slice(0,150));
r=await call({task:"forum_admin",token:env.ADMIN_TOKEN,action:"approve",target:"p_"+PEND}); ok(r.s===200,"approva");
r=await call({task:"forum_list",sort:"new"}); ok(r.j.result.posts.some(p=>p.id===PEND),"post approvato visibile");
r=await call({task:"forum_admin",token:env.ADMIN_TOKEN,action:"post",title:"Benvenuti!",body:"Regole del forum",pinned:true}); ok(r.s===200,"annuncio admin");
r=await call({task:"forum_list",sort:"top"}); ok(r.j.result.posts[0].title==="Benvenuti!"&&r.j.result.posts[0].admin,"annuncio fissato in cima con badge");
r=await call({task:"forum_admin",token:env.ADMIN_TOKEN,action:"delete",target:"p_"+PEND}); r=await call({task:"forum_list",sort:"new"}); ok(!r.j.result.posts.some(p=>p.id===PEND),"eliminazione moderatore");
// eliminazione propria
r=await call({task:"forum_delete",voter:V2,target:"p_"+P1}); ok(r.s===403,"non si elimina il post altrui");
r=await call({task:"forum_delete",voter:V1,target:"p_"+P1}); ok(r.s===200,"si elimina il proprio post");
// limiti di frequenza
env.DB.raw.exec("DELETE FROM rl"); let last; for(let i=0;i<7;i++) last=await call({task:"forum_post",voter:V1,nick:"Spam",title:"Titolo numero "+i,body:"testo "+i},env,"10.0.0.1"); ok(last.s===429,"rate limit sui post (5/ora)",last.s);
// senza DB
r=await call({task:"forum_list"},{ALLOWED_ORIGINS:"https://a.it"}); ok(r.s===501,"senza database -> 501");
r=await call({task:"forum_post",voter:V1,nick:"x".repeat(50),title:"t",body:"b"}); ok([400,429].includes(r.s),"input fuori limiti rifiutato");
console.log(fails?"FAIL "+fails:"ALL OK");
