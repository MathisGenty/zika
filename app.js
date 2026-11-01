/* =====================================================================
   Zìkǎ 字卡 — logique de l'app
   Plan du fichier :
     1. Données de départ (paquet HSK 1)
     2. Stockage (localStorage, clé "zika-v1")
     3. Pinyin : tons, conversion ni3 -> nǐ
     4. Répétition espacée : schedule() — c'est ici qu'on règle les intervalles
     5. Audio (synthèse vocale du navigateur)
     6. Vues : renderReview / renderCards / renderSettings
     7. Raccourcis clavier et démarrage
   ===================================================================== */

/* ---------- Données de départ (HSK 1, exemples modifiables) ---------- */
const SEED = [["你好","nǐ hǎo","bonjour"],["谢谢","xiè xie","merci"],["我","wǒ","je, moi"],["你","nǐ","tu, toi"],["他","tā","il, lui"],["她","tā","elle"],["是","shì","être (c'est)"],["不","bù","ne… pas"],["好","hǎo","bon, bien"],["人","rén","personne, être humain"],["大","dà","grand"],["小","xiǎo","petit"],["中国","Zhōng guó","Chine"],["学习","xué xí","étudier"],["老师","lǎo shī","professeur"],["学生","xué sheng","élève, étudiant"],["吃","chī","manger"],["喝","hē","boire"],["水","shuǐ","eau"],["茶","chá","thé"],["米饭","mǐ fàn","riz cuit"],["朋友","péng you","ami"],["家","jiā","maison, famille"],["爱","ài","aimer"],["看","kàn","regarder, lire"],["说","shuō","parler, dire"],["今天","jīn tiān","aujourd'hui"],["明天","míng tiān","demain"],["猫","māo","chat"],["狗","gǒu","chien"],["书","shū","livre"],["多少","duō shao","combien"]];

/* ---------- Stockage ---------- */
const KEY = "zika-v1";
const DAY = 864e5;
let S;
const DEFAULT_DECK="HSK 1 · départ";
/* Chaque carte a un champ "mod" (date de dernière modification) et les cartes supprimées
   laissent une trace dans S.deleted : c'est ce qui permet de fusionner deux appareils (sync.js). */
function fresh(){
  const cards=SEED.map((c,i)=>mk(c[0],c[1],c[2],DEFAULT_DECK,"seed-"+i)); cards.forEach(c=>c.mod=0);
  return {cards, settings:{dir:"h2f", newPerDay:10, tones:true, active:[]}, settingsMod:0, newLog:{date:"",n:0}, deleted:{}};
}
function mk(h,p,m,deck,id){return {id:id||Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),h,p,m,deck:deck||"Mes cartes",due:0,ivl:0,ease:2.5,reps:0,lapses:0,isNew:true,mod:Date.now()}}
function migrate(){ // met à niveau les anciennes sauvegardes
  S.settings??={dir:"h2f",newPerDay:10,tones:true}; S.settings.active??=[]; S.newLog??={date:"",n:0};
  S.deleted??={}; S.settingsMod??=0; S.records??={};
  for(const c of S.cards){c.deck??=DEFAULT_DECK; c.mod??=0}
}
function load(){try{const r=localStorage.getItem(KEY); S=r?JSON.parse(r):fresh();}catch(e){S=fresh()} migrate()}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){} window.onLocalChange?.()}
function saveSettings(){S.settingsMod=Date.now(); save()}
function removeCards(pred){const now=Date.now(); S.cards=S.cards.filter(c=>{if(pred(c)){S.deleted[c.id]=now;return false}return true})}
load();

/* ---------- Pinyin : tons ---------- */
const TM={1:"āēīōūǖĀĒĪŌŪǕ",2:"áéíóúǘÁÉÍÓÚǗ",3:"ǎěǐǒǔǚǍĚǏǑǓǙ",4:"àèìòùǜÀÈÌÒÙǛ"};
function toneOf(syl){for(const ch of syl)for(const k in TM)if(TM[k].includes(ch))return +k;return 5}
function numToMark(syl){ // ni3 -> nǐ, lv4 -> lǜ
  const m=syl.match(/^([a-zA-Zü:v]+)([1-5])$/); if(!m) return syl;
  let s=m[1].replace(/u:|v/g,"ü").replace(/U:|V/g,"Ü"); const t=+m[2]; if(t===5) return s;
  const marks={a:"āáǎà",e:"ēéěè",i:"īíǐì",o:"ōóǒò",u:"ūúǔù","ü":"ǖǘǚǜ"};
  const low=s.toLowerCase(); let idx=low.indexOf("a"); if(idx<0) idx=low.indexOf("e"); if(idx<0) idx=low.indexOf("ou");
  if(idx<0) for(let i=low.length-1;i>=0;i--) if("iouü".includes(low[i])){idx=i;break}
  if(idx<0) return s;
  let r=marks[low[idx]][t-1]; if(s[idx]!==low[idx]) r=r.toUpperCase();
  return s.slice(0,idx)+r+s.slice(idx+1);
}
function normPinyin(p){return p.replace(/([a-zA-Zü:v]+)([1-5])/g,m=>numToMark(m)+" ").replace(/\s+/g," ").trim()}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function sylls(p){return p.split(/[\s']+/).filter(Boolean)}
function pinyinHTML(p){return sylls(p).map(s=>`<span class="tone${toneOf(s)}">${esc(s)}</span>`).join(" ")}
function hanziHTML(h,p,colored,cls=""){
  const chars=[...h], sy=sylls(p), match=sy.length===chars.length;
  return `<div class="hanzi ${cls}">`+chars.map((c,i)=>`<div class="cell"><span class="${colored&&match?"tone"+toneOf(sy[i]):""}">${esc(c)}</span></div>`).join("")+`</div>`;
}

/* ---------- Répétition espacée (SM-2 simplifié) ---------- */
function schedule(c,g,dry){ // g: 0 à revoir, 1 difficile, 2 bien, 3 facile
  const n={...c}, now=Date.now();
  if(g===0){n.lapses++;n.reps=0;n.ivl=0;n.ease=Math.max(1.3,n.ease-.2);n.due=now+10*60e3}
  else{
    if(n.reps===0) n.ivl=g===3?4:1;
    else if(n.reps===1) n.ivl=g===1?2:g===2?3:7;
    else n.ivl=Math.max(n.ivl+1,Math.round(n.ivl*(g===1?1.2:g===2?n.ease:n.ease*1.3)));
    n.ease=Math.max(1.3,n.ease+(g===1?-.15:g===3?.15:0));
    n.reps++; n.due=now+n.ivl*DAY;
  }
  n.isNew=false; n.mod=now;
  if(!dry) Object.assign(c,n);
  return n;
}
function label(c,g){const n=schedule(c,g,true); if(g===0) return "10 min"; const d=n.ivl; return d<31?d+" j":d<365?Math.round(d/30)+" mois":(d/365).toFixed(1)+" an"}
const today=()=>new Date().toISOString().slice(0,10);
function newLeft(){ if(S.newLog.date!==today()) S.newLog={date:today(),n:0}; return Math.max(0,S.settings.newPerDay-S.newLog.n) }
/* ---------- Paquets ---------- */
function decks(){return [...new Set(S.cards.map(c=>c.deck))]} // dans l'ordre d'ajout
function activeDecks(){const all=decks(); return S.settings.active.filter(d=>all.includes(d))}
function inActive(c){const a=activeDecks(); return !a.length||a.includes(c.deck)}
function pool(){return S.cards.filter(inActive)}

function buildQueue(){
  const now=Date.now(), P=pool();
  const due=P.filter(c=>!c.isNew&&c.due<=now).sort((a,b)=>a.due-b.due);
  const nw=P.filter(c=>c.isNew).slice(0,newLeft());
  return [...due,...nw].map(c=>c.id);
}

/* ---------- Audio ---------- */
let zhVoice=null;
function pickVoice(){ if(!("speechSynthesis" in window)) return; const v=speechSynthesis.getVoices(); zhVoice=v.find(x=>/^zh[-_]CN/i.test(x.lang))||v.find(x=>/^zh/i.test(x.lang))||null }
if("speechSynthesis" in window){pickVoice(); speechSynthesis.onvoiceschanged=pickVoice}
function speak(t){ if(!("speechSynthesis" in window)) return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.lang="zh-CN"; if(zhVoice) u.voice=zhVoice; u.rate=.8; speechSynthesis.speak(u) }

/* ---------- Vues ---------- */
const $=s=>document.querySelector(s), view=$("#view");
let tab="review", queue=[], flipped=false, curDir="h2f";

function renderStats(){
  const now=Date.now(), P=pool(), due=P.filter(c=>!c.isNew&&c.due<=now).length, nw=Math.min(P.filter(c=>c.isNew).length,newLeft());
  const learned=P.filter(c=>c.ivl>=21).length;
  $("#stats").innerHTML=`<div><b>${due}</b>à réviser</div><div><b>${nw}</b>nouvelles aujourd'hui</div><div><b>${learned}</b>acquises (≥ 21 j)</div><div><b>${P.length}</b>cartes${activeDecks().length?" sélectionnées":""}</div>`;
}
function setTab(t){if(tab==="defis"&&t!=="defis") window.stopDefi?.(); tab=t; for(const k of ["review","defis","cards","settings"]) $("#tab-"+k).setAttribute("aria-current",k===t); if(t==="review"){queue=buildQueue();flipped=false;pickDir()} render()}
function pickDir(){const d=S.settings.dir; curDir=d==="mix"?(Math.random()<.5?"h2f":"f2h"):d}

function render(){renderStats(); applyLook(); ({review:renderReview,defis:()=>window.renderDefis?.(),cards:renderCards,settings:renderSettings})[tab]()}

/* ---------- Apparence : style, police des caractères, caractère du jour, sceau ---------- */
const HANFONTS={song:null, sans:"Noto+Sans+SC:wght@400;700", pinceau:"Ma+Shan+Zheng"};
const loadedFonts=new Set();
function applyLook(){
  const st=S.settings, root=document.documentElement;
  root.dataset.style=st.style||"jade";
  root.dataset.hanfont=st.hanfont||"song";
  const fam=HANFONTS[st.hanfont];
  if(fam&&!loadedFonts.has(fam)){loadedFonts.add(fam); const l=document.createElement("link"); l.rel="stylesheet"; l.href=`https://fonts.googleapis.com/css2?family=${fam}&display=swap`; document.head.append(l)}
  // caractère du jour : tiré de tes cartes, le même toute la journée
  const chars=[...new Set(S.cards.flatMap(c=>[...c.h]).filter(ch=>/\p{Script=Han}/u.test(ch)))];
  if(chars.length){let h=0; for(const ch of today()) h=(h*31+ch.charCodeAt(0))>>>0; root.style.setProperty("--daychar",`"${chars[h%chars.length]}"`)}
}
function sealChar(deck){
  const m=String(deck).match(/HSK\s*(\d)/i); if(m) return "零壹贰叁肆伍陆柒捌玖"[+m[1]]||"汉";
  const han=[...String(deck)].find(ch=>/\p{Script=Han}/u.test(ch)); if(han) return han;
  return deck==="Mes cartes"?"我":"学";
}

function deckBar(){
  const now=Date.now(), a=activeDecks(), ds=decks();
  if(ds.length<2) return "";
  const cnt=d=>{const cs=S.cards.filter(c=>c.deck===d); return cs.filter(c=>!c.isNew&&c.due<=now).length+" · "+cs.filter(c=>c.isNew).length};
  return `<div class="decks" role="group" aria-label="Paquets à réviser">
    <button class="chip" data-deck="" aria-pressed="${!a.length}">Tous</button>
    ${ds.map(d=>`<button class="chip" data-deck="${esc(d)}" aria-pressed="${a.includes(d)}">${esc(d)}<small title="à réviser · nouvelles">${cnt(d)}</small></button>`).join("")}
  </div>`;
}
function bindDeckBar(){
  view.querySelectorAll(".chip").forEach(b=>b.addEventListener("click",()=>{
    const d=b.dataset.deck; let a=activeDecks();
    a = !d ? [] : a.includes(d) ? a.filter(x=>x!==d) : [...a,d];
    S.settings.active=a; saveSettings(); queue=buildQueue(); flipped=false; pickDir(); render();
  }));
}
function renderReview(){
  const c=S.cards.find(x=>x.id===queue[0]);
  if(!c){
    const next=pool().filter(x=>!x.isNew).sort((a,b)=>a.due-b.due)[0];
    const when=next?new Date(next.due).toLocaleString("fr-FR",{weekday:"long",hour:"2-digit",minute:"2-digit"}):null;
    view.innerHTML=deckBar()+`<div class="card"><div class="seal">完</div><div class="done"><div class="big">完了</div><div><b>wán le</b> — c'est fini pour aujourd'hui.</div>
      <div class="note">${when?"Prochaine révision : "+when+".":""} ${pool().some(x=>x.isNew)&&!newLeft()?"Limite de nouvelles cartes atteinte (modifiable dans Réglages).":""}</div></div></div>`;
    bindDeckBar(); return;
  }
  const col=S.settings.tones, f2h=curDir==="f2h";
  let front, back="";
  if(!f2h){
    front=hanziHTML(c.h,c.p,flipped&&col);
    if(flipped) back=`<div class="pinyin ${col?"":"mono"}">${pinyinHTML(c.p)}</div><div class="meaning">${esc(c.m)}</div>`;
  } else {
    front=`<div class="meaning big">${esc(c.m)}</div>`;
    if(flipped) back=hanziHTML(c.h,c.p,col)+`<div class="pinyin ${col?"":"mono"}">${pinyinHTML(c.p)}</div>`;
  }
  const tag=c.isNew?"Nouvelle":c.lapses?`Révision · ${c.lapses} oubli${c.lapses>1?"s":""}`:"Révision";
  view.innerHTML=deckBar()+`
    <div class="card ${flipped?"flip":""}">
      <div class="seal" title="${esc(c.deck)}">${sealChar(c.deck)}</div>
      <div class="dir">${f2h?"Français → 汉字":"汉字 → Français"} · ${tag} · ${esc(c.deck)}</div>
      ${(flipped||!f2h)?`<button class="speak" id="speak" title="Écouter (touche A)">🔊 Écouter</button>`:""}
      ${front}${back}
    </div>
    ${flipped?`<div class="actions">
      ${["À revoir","Difficile","Bien","Facile"].map((l,g)=>`<button class="btn g${g}" id="g${g}">${l}<small>${label(c,g)} · <kbd>${g+1}</kbd></small></button>`).join("")}
    </div>`:`<div class="actions one"><button class="btn primary" id="flip">Afficher la réponse <kbd>Espace</kbd></button></div>`}
    <div class="hint">${queue.length} carte${queue.length>1?"s":""} restante${queue.length>1?"s":""} dans cette session</div>`;
  bindDeckBar();
  $("#flip")?.addEventListener("click",flip);
  $("#speak")?.addEventListener("click",()=>speak(c.h));
  for(let g=0;g<4;g++) $("#g"+g)?.addEventListener("click",()=>answer(g));
}
function flip(){flipped=true; renderReview(); if(curDir==="f2h"){const c=S.cards.find(x=>x.id===queue[0]); if(c&&S.settings.autoplay) speak(c.h)}}
function answer(g){
  const c=S.cards.find(x=>x.id===queue[0]); if(!c) return;
  if(c.isNew){newLeft(); S.newLog.n++}
  schedule(c,g); queue.shift(); if(g===0) queue.push(c.id);
  save(); flipped=false; pickDir(); render();
}

let listDeck=""; // filtre de la liste des cartes
function renderCards(){
  const ds=decks();
  if(listDeck&&!ds.includes(listDeck)) listDeck="";
  const dl=`<datalist id="deck-list">${ds.map(d=>`<option value="${esc(d)}">`).join("")}</datalist>`;
  view.innerHTML=`${dl}
  <div style="display:flex;flex-direction:column;gap:16px">
  <section class="panel" id="library">
    <h2>Bibliothèque</h2>
    <div class="note" id="lib-body">Chargement des paquets…</div>
  </section>
  <section class="panel">
    <h2>Ajouter une carte</h2>
    <div class="row">
      <label>汉字<input type="text" id="in-h" placeholder="你好" lang="zh"></label>
      <label>Pinyin<input type="text" id="in-p" placeholder="ni3 hao3 ou nǐ hǎo"></label>
      <label>Sens<input type="text" id="in-m" placeholder="bonjour"></label>
      <label>Paquet<input type="text" id="in-d" list="deck-list" value="${esc(listDeck||"Mes cartes")}"></label>
    </div>
    <div class="row" style="align-items:center"><div class="preview" id="pv"></div><button class="sbtn accent" id="add">Ajouter</button></div>
    <div class="msg" id="add-msg"></div>
  </section>
  <section class="panel">
    <h2>Importer une liste</h2>
    <div class="note">Une carte par ligne : <code>汉字 ; pinyin ; sens</code>. Pour ranger par paquet, mets une ligne de titre qui commence par <code>#</code> : toutes les cartes en dessous iront dans ce paquet. Séparateurs acceptés : point-virgule, tabulation (copier-coller depuis un tableur) ou virgule. Le pinyin peut s'écrire avec des chiffres (<code>xue2</code>).</div>
    <textarea id="imp" placeholder="# Les nombres&#10;一;yi1;un&#10;二;er4;deux&#10;# La nature&#10;山;shān;montagne"></textarea>
    <div class="row" style="align-items:end">
      <label>Paquet par défaut (si aucune ligne #)<input type="text" id="imp-d" list="deck-list" value="Mes cartes"></label>
      <button class="sbtn accent" id="imp-go">Importer</button>
    </div>
    <div class="msg" id="imp-msg"></div>
  </section>
  <section class="panel">
    <div class="row" style="align-items:center"><h2 style="flex:1 1 auto">Mes cartes</h2>
      <select id="ld" style="flex:0 1 220px"><option value="">Tous les paquets (${S.cards.length})</option>${ds.map(d=>`<option value="${esc(d)}" ${d===listDeck?"selected":""}>${esc(d)} (${S.cards.filter(c=>c.deck===d).length})</option>`).join("")}</select>
      <input type="text" id="q" placeholder="Rechercher…" style="flex:0 1 180px"></div>
    <div class="list" id="list"></div>
    ${listDeck?`<div class="row" style="justify-content:flex-end"><button class="sbtn danger" id="del-deck">Supprimer le paquet « ${esc(listDeck)} »</button></div>`:""}
  </section></div>`;
  const pv=()=>{const p=normPinyin($("#in-p").value); $("#pv").innerHTML=p?`Pinyin enregistré : <b>${pinyinHTML(p)}</b>`:""};
  $("#in-p").addEventListener("input",pv);
  $("#add").addEventListener("click",()=>{
    const h=$("#in-h").value.trim(), p=normPinyin($("#in-p").value), m=$("#in-m").value.trim(), d=$("#in-d").value.trim()||"Mes cartes";
    if(!h||!m){$("#add-msg").textContent="Il faut au moins les caractères et le sens."; return}
    if(S.cards.some(c=>c.h===h&&c.deck===d)){$("#add-msg").textContent=`« ${h} » est déjà dans le paquet « ${d} ».`; return}
    S.cards.push(mk(h,p,m,d)); save(); renderCards(); $("#in-d").value=d; $("#add-msg").textContent=`« ${h} » ajouté à « ${d} ».`; renderStats(); $("#in-h").focus();
  });
  $("#imp-go").addEventListener("click",()=>{
    let added=0, skip=0, deck=$("#imp-d").value.trim()||"Mes cartes"; const touched=new Set();
    for(const line of $("#imp").value.split(/\n/)){
      if(!line.trim()) continue;
      if(line.trim().startsWith("#")){deck=line.trim().replace(/^#+/,"").trim()||deck; continue}
      const sep=line.includes("\t")?"\t":line.includes(";")?";":",";
      const [h,p="",...rest]=line.split(sep).map(s=>s.trim()); const m=rest.join(sep===","?", ":sep).trim();
      if(!h||!m||S.cards.some(c=>c.h===h&&c.deck===deck)){skip++;continue}
      S.cards.push(mk(h,normPinyin(p),m,deck)); added++; touched.add(deck);
    }
    save(); renderCards();
    $("#imp-msg").textContent=`${added} carte${added>1?"s":""} importée${added>1?"s":""}${touched.size?` dans ${touched.size} paquet${touched.size>1?"s":""}`:""}${skip?`, ${skip} ignorée${skip>1?"s":""} (doublon ou ligne incomplète)`:""}.`; renderStats();
  });
  $("#ld").addEventListener("change",e=>{listDeck=e.target.value; renderCards()});
  const dd=$("#del-deck"); dd?.addEventListener("click",()=>{
    if(!dd.dataset.armed){dd.dataset.armed=1; dd.textContent=`Confirmer : supprimer ${S.cards.filter(c=>c.deck===listDeck).length} cartes`; return}
    removeCards(c=>c.deck===listDeck); listDeck=""; save(); renderCards(); renderStats();
  });
  $("#q").addEventListener("input",drawList);
  drawList();
  drawLibrary();
}

/* ---------- Bibliothèque : paquets prêts à l'emploi (dossier decks/) ---------- */
let LIB=null;
async function drawLibrary(){
  const box=$("#lib-body"); if(!box) return;
  try{ if(!LIB) LIB=await (await fetch("decks/index.json",{cache:"no-cache"})).json() }
  catch(e){ box.textContent="La bibliothèque s'affiche quand l'app est ouverte depuis son adresse en ligne."; return }
  box.className="lib";
  box.innerHTML=LIB.map((d,i)=>{
    const have=S.cards.filter(c=>c.deck===d.name).length;
    const state=have>=d.count?`<span class="lib-ok">Ajouté</span>`:`<button class="sbtn ${have?"":"accent"}" data-i="${i}">${have?`Compléter (${d.count-have})`:"Ajouter"}</button>`;
    return `<div class="lib-item"><div class="m"><div><b>${esc(d.name)}</b> <span class="lib-n">${d.count} mots</span></div><div class="note">${esc(d.description||"")}</div></div>${state}</div>`;
  }).join("");
  box.querySelectorAll("button[data-i]").forEach(b=>b.addEventListener("click",async()=>{
    const d=LIB[+b.dataset.i]; b.disabled=true; b.textContent="Ajout…";
    try{
      const data=await (await fetch("decks/"+d.file,{cache:"no-cache"})).json();
      const have=new Set(S.cards.filter(c=>c.deck===d.name).map(c=>c.h)); let n=0;
      data.forEach(([h,p,m],k)=>{ if(!have.has(h)){S.cards.push(mk(h,p,m,d.name,"lib-"+d.file.replace(/\.json$/,"")+"-"+k)); n++} });
      save(); renderStats(); renderCards();
      $("#lib-body").insertAdjacentHTML("afterend",`<div class="msg">${n} cartes ajoutées au paquet « ${esc(d.name)} ». Elles arrivent par ${S.settings.newPerDay} nouvelles par jour (réglable).</div>`);
    }catch(e){ b.disabled=false; b.textContent="Réessayer" }
  }));
}
function drawList(){
  const q=($("#q")?.value||"").toLowerCase().trim(), now=Date.now();
  const items=S.cards.filter(c=>(!listDeck||c.deck===listDeck)&&(!q||(c.h+c.p+c.m).toLowerCase().includes(q)));
  $("#list").innerHTML=items.map(c=>{
    const st=c.isNew?"nouvelle":c.due<=now?"à réviser":"dans "+Math.max(1,Math.round((c.due-now)/DAY))+" j";
    return `<div class="item"><div class="h">${esc(c.h)}</div><div class="m"><div>${pinyinHTML(c.p)}</div><div>${esc(c.m)}${listDeck?"":` · <i>${esc(c.deck)}</i>`}</div></div>
      <div class="due">${st}<button class="del" data-id="${c.id}">Supprimer</button></div></div>`}).join("")||`<div class="note">Aucune carte ne correspond.</div>`;
  $("#list").querySelectorAll(".del").forEach(b=>b.addEventListener("click",()=>{
    if(!b.classList.contains("armed")){b.classList.add("armed");b.textContent="Confirmer ?";setTimeout(()=>{b.classList.remove("armed");b.textContent="Supprimer"},3000);return}
    removeCards(c=>c.id===b.dataset.id); save(); drawList(); renderStats();
  }));
}

function renderSettings(){
  const st=S.settings;
  view.innerHTML=`<div style="display:flex;flex-direction:column;gap:16px">
  <section class="panel"><h2>Apparence</h2>
    <div class="styles" role="radiogroup" aria-label="Style">
      ${[["jade","Jade et nuages","Vert jade, motif de nuages 祥云"],["encre","Encre et papier","Papier de riz, encre et vermillon"],["cahier","Cahier d'écolier","Feuille quadrillée 田字格, encre bleue"]].map(([k,n,d])=>
        `<button class="style-opt" role="radio" aria-checked="${(st.style||"jade")===k}" data-style-opt="${k}" id="style-${k}"><span class="sw" data-sw="${k}"><b>字</b><i></i></span><span><b>${n}</b><small>${d}</small></span></button>`).join("")}
    </div>
    <label>Police des caractères<select id="s-font">
      <option value="song">Song 宋体 (imprimé, par défaut)</option><option value="sans">Hei 黑体 (bâton, comme sur écran)</option><option value="pinceau">Pinceau 楷书 (écrit à la main)</option></select></label>
  </section>
  <section class="panel"><h2>Révision</h2>
    <div class="row">
      <label>Sens des cartes<select id="s-dir">
        <option value="h2f">汉字 → Français</option><option value="f2h">Français → 汉字</option><option value="mix">Mélangé</option></select></label>
      <label>Nouvelles cartes par jour<input type="number" id="s-new" min="0" max="200" value="${st.newPerDay}"></label>
    </div>
    <label style="flex-direction:row;align-items:center;gap:8px;color:var(--ink)"><input type="checkbox" id="s-tones" ${st.tones?"checked":""}> Colorer les tons (1 <span class="tone1">rouge</span>, 2 <span class="tone2">orange</span>, 3 <span class="tone3">vert</span>, 4 <span class="tone4">bleu</span>, neutre <span class="tone5">gris</span>)</label>
    <label style="flex-direction:row;align-items:center;gap:8px;color:var(--ink)"><input type="checkbox" id="s-auto" ${st.autoplay?"checked":""}> Lire la prononciation automatiquement en mode Français → 汉字</label>
    <div class="note" id="voice-note"></div>
  </section>
  <section class="panel" id="account"></section>
  <section class="panel"><h2>Sauvegarde dans un fichier</h2>
    <div class="note">Un filet de sécurité, avec ou sans compte : télécharge un fichier avec toutes tes cartes et ta progression, et garde-le où tu veux (iCloud, Drive, mail…).</div>
    <div class="row" style="justify-content:flex-start">
      <button class="sbtn" id="bk-dl">Télécharger ma sauvegarde</button>
      <label class="sbtn" for="bk-file" style="flex-direction:row;color:var(--ink);font-weight:600">Restaurer depuis un fichier<input type="file" id="bk-file" accept=".json,application/json" hidden></label>
    </div>
    <div class="row" style="justify-content:flex-end;align-items:center">
      <div class="msg" id="bk-msg" style="flex:1 1 auto"></div>
      <button class="sbtn danger" id="reset">Tout réinitialiser</button>
    </div>
  </section></div>`;
  $("#s-dir").value=st.dir;
  $("#s-font").value=st.hanfont||"song";
  $("#s-font").addEventListener("change",e=>{st.hanfont=e.target.value;saveSettings();applyLook()});
  view.querySelectorAll("[data-style-opt]").forEach(b=>b.addEventListener("click",()=>{st.style=b.dataset.styleOpt;saveSettings();applyLook();
    view.querySelectorAll("[data-style-opt]").forEach(x=>x.setAttribute("aria-checked",x===b))}));
  $("#voice-note").textContent=!("speechSynthesis" in window)?"Ton navigateur ne propose pas la synthèse vocale.":zhVoice?`Voix chinoise utilisée : ${zhVoice.name}.`:"Aucune voix chinoise détectée : installe une voix « Chinois (Chine) » dans les réglages de ton système pour avoir l'audio.";
  $("#s-dir").addEventListener("change",e=>{st.dir=e.target.value;saveSettings()});
  $("#s-new").addEventListener("change",e=>{st.newPerDay=Math.max(0,+e.target.value||0);saveSettings();renderStats()});
  $("#s-tones").addEventListener("change",e=>{st.tones=e.target.checked;saveSettings()});
  $("#s-auto").addEventListener("change",e=>{st.autoplay=e.target.checked;saveSettings()});
  $("#bk-dl").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(S)],{type:"application/json"}), a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=`zika-sauvegarde-${today()}.json`; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000); $("#bk-msg").textContent="Sauvegarde téléchargée.";
  });
  $("#bk-file").addEventListener("change",async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ restoreFrom(JSON.parse(await f.text())); render(); $("#bk-msg").textContent=`Restauré : ${S.cards.length} cartes.` }
    catch(err){ $("#bk-msg").textContent="Ce fichier n'est pas une sauvegarde Zìkǎ valide." }
  });
  const r=$("#reset"); r.addEventListener("click",()=>{
    if(r.dataset.armed){ const old=S; S=fresh(); const now=Date.now(); S.deleted={...old.deleted}; old.cards.forEach(c=>S.deleted[c.id]=now);
      for(const c of S.cards){delete S.deleted[c.id]; c.mod=now} S.settingsMod=now; save(); render(); $("#bk-msg").textContent="Réinitialisé avec le paquet de départ."; return }
    r.dataset.armed=1; r.textContent="Confirmer la réinitialisation";
  });
  window.renderAccount?.();
}
/* Restaurer une sauvegarde : elle devient la version la plus récente, y compris sur les autres appareils */
function restoreFrom(d){
  if(!Array.isArray(d?.cards)) throw new Error("invalide");
  const now=Date.now(), keep=new Set(d.cards.map(c=>c.id)), del={...S.deleted,...(d.deleted||{})};
  S.cards.forEach(c=>{if(!keep.has(c.id)) del[c.id]=now});
  S=d; migrate(); S.deleted=del; for(const c of S.cards){delete S.deleted[c.id]; c.mod=now} S.settingsMod=now; save();
}

/* ---------- Clavier ---------- */
document.addEventListener("keydown",e=>{
  if(tab!=="review"||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(e.code==="Space"&&!flipped){e.preventDefault();flip()}
  else if(flipped&&["1","2","3","4"].includes(e.key)) answer(+e.key-1);
  else if(e.key.toLowerCase()==="a"){const c=S.cards.find(x=>x.id===queue[0]); if(c&&(flipped||curDir==="h2f")) speak(c.h)}
});
for(const k of ["review","defis","cards","settings"]) $("#tab-"+k).addEventListener("click",()=>setTab(k));
setTab("review");
