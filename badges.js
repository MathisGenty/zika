/* =====================================================================
   Zìkǎ 字卡 — badges et profil personnalisé
   - Les badges gagnés sont dans S.badges ({ id: date }) et synchronisés avec le compte.
   - Les compteurs utiles (parties parfaites, jours de défi du jour) sont dans S.bstats.
   - Le profil public (titre, vitrine de 3 badges, couleur, nombre de badges) est
     envoyé dans la table profiles (voir supabase-badges.sql) pour que les amis le voient.
   Niveaux : 1 bronze 铜, 2 argent 银, 3 or 金, 4 jade 玉.
   ===================================================================== */
(function(){
  const CATS = [
    ["survie", "Survie"], ["eclair", "Éclair"], ["tons", "Tons"], ["jour", "Défi du jour"],
    ["direct", "Parties en direct"], ["serie", "Régularité"], ["mots", "Vocabulaire"], ["secret", "Secrets"]
  ];
  const TIERS = { 1: "Bronze 铜", 2: "Argent 银", 3: "Or 金", 4: "Jade 玉" };
  const BADGES = [
    // Survie (1 point par bonne réponse)
    { id: "sv10",  cat: "survie", g: "坚", n: "Persévérant", d: "10 bonnes réponses en Survie", t: 1 },
    { id: "sv25",  cat: "survie", g: "城", n: "Muraille", d: "25 bonnes réponses en Survie", t: 2 },
    { id: "sv50",  cat: "survie", g: "龙", n: "Dragon", d: "50 bonnes réponses en Survie", t: 3 },
    { id: "sv100", cat: "survie", g: "凤", n: "Phénix", d: "100 bonnes réponses en Survie", t: 4 },
    { id: "svnh",  cat: "survie", g: "盾", n: "Sans une égratignure", d: "20 bonnes réponses en Survie sans perdre une vie", t: 3 },
    // Éclair (sur 100)
    { id: "ec70",  cat: "eclair", g: "快", n: "Rapide", d: "70 points ou plus en Éclair", t: 1 },
    { id: "ec100", cat: "eclair", g: "闪", n: "Éclair parfait", d: "100 sur 100 en Éclair", t: 3 },
    { id: "ec5",   cat: "eclair", g: "雷", n: "Tonnerre", d: "5 parties parfaites en Éclair", t: 4 },
    // Tons (sur 150)
    { id: "tn100", cat: "tons", g: "耳", n: "Bonne oreille", d: "100 points ou plus en Tons", t: 2 },
    { id: "tn150", cat: "tons", g: "音", n: "Mélomane", d: "150 sur 150 en Tons", t: 3 },
    { id: "tn3",   cat: "tons", g: "琴", n: "Âme sœur musicale 知音", d: "3 sans-fautes en Tons", t: 4 },
    // Défi du jour
    { id: "dl7",   cat: "jour", g: "日", n: "Fidèle", d: "Défi du jour 7 jours de suite", t: 2 },
    { id: "dl30",  cat: "jour", g: "月", n: "Lunaire", d: "Défi du jour 30 jours de suite", t: 4 },
    { id: "dltop", cat: "jour", g: "冠", n: "Couronné", d: "Premier du classement du jour parmi tes amis", t: 3 },
    { id: "dl100", cat: "jour", g: "满", n: "Plein", d: "100 sur 100 au défi du jour", t: 3 },
    // Parties en direct
    { id: "mw1",   cat: "direct", g: "胜", n: "Première victoire", d: "Gagner une partie en direct", t: 1 },
    { id: "mw10",  cat: "direct", g: "王", n: "Roi", d: "Gagner 10 parties en direct", t: 3 },
    { id: "poet",  cat: "direct", g: "诗", n: "Poète", d: "Faire valider une phrase de 15 caractères", t: 3 },
    { id: "calm",  cat: "direct", g: "稳", n: "Sang-froid", d: "Gagner une Course sans aucune erreur", t: 2 },
    // Régularité
    { id: "st7",   cat: "serie", g: "火", n: "Étincelle", d: "7 jours de suite", t: 1 },
    { id: "st30",  cat: "serie", g: "炎", n: "Flamme", d: "30 jours de suite", t: 2 },
    { id: "st100", cat: "serie", g: "焰", n: "Brasier", d: "100 jours de suite", t: 3 },
    { id: "st365", cat: "serie", g: "阳", n: "Soleil", d: "365 jours de suite", t: 4 },
    // Vocabulaire (mot acquis = intervalle de révision d'au moins 21 jours)
    { id: "ln100", cat: "mots", g: "学", n: "Étudiant", d: "100 mots acquis", t: 1 },
    { id: "ln500", cat: "mots", g: "才", n: "Talent", d: "500 mots acquis", t: 2 },
    { id: "ln1k",  cat: "mots", g: "师", n: "Maître", d: "1 000 mots acquis", t: 3 },
    { id: "hsk1",  cat: "mots", g: "壹", n: "Diplômé HSK 1", d: "Tous les mots du paquet HSK 1 acquis", t: 1 },
    { id: "hsk2",  cat: "mots", g: "贰", n: "Diplômé HSK 2", d: "Tous les mots du paquet HSK 2 acquis", t: 2 },
    { id: "hsk3",  cat: "mots", g: "叁", n: "Diplômé HSK 3", d: "Tous les mots du paquet HSK 3 acquis", t: 3 },
    { id: "hsk4",  cat: "mots", g: "肆", n: "Diplômé HSK 4", d: "Tous les mots du paquet HSK 4 acquis", t: 4 },
    // Secrets
    { id: "owl",   cat: "secret", g: "夜", n: "Chat de nuit 夜猫子", d: "Réviser entre minuit et 4 h", t: 2, secret: true },
    { id: "bird",  cat: "secret", g: "早", n: "Lève-tôt", d: "Réviser avant 7 h", t: 2, secret: true },
    { id: "lucky", cat: "secret", g: "发", n: "Porte-bonheur", d: "Exactement 8 bonnes réponses d'affilée dans un défi (8 porte chance)", t: 3, secret: true },
    { id: "four",  cat: "secret", g: "四", n: "Pas de chance", d: "4 erreurs d'affilée dans un défi (4 se prononce comme « mort »)", t: 1, secret: true }
  ];
  const BY = Object.fromEntries(BADGES.map(b => [b.id, b]));
  const COLORS = [["jade", "Jade"], ["rouge", "Vermillon"], ["or", "Or"], ["bleu", "Bleu"], ["prune", "Prune"], ["encre", "Encre"]];

  const $d = id => document.getElementById(id);
  const esc2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const got = () => (S.badges ??= {});
  const bs = () => (S.bstats ??= {});
  const prof = () => (S.profile ??= { title: "", showcase: [], color: "jade" });
  let fresh = [], editing = false, expanded = false;

  /* ---------- Gagner un badge ---------- */
  function award(id){
    if (!BY[id] || got()[id]) return;
    got()[id] = Date.now(); fresh.push(id);
  }
  function finalize(){
    if (!fresh.length) return;
    const ids = fresh; fresh = [];
    save(); pushProfile(); ids.forEach((id, i) => setTimeout(() => toast(id), i * 2600));
    if (tab === "defis") paintPanel();
  }

  function dailyStreak(){
    const set = new Set(bs().dailyDays || []), d = new Date(); let n = 0;
    if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // fin d'un défi solo ou du défi du jour
  function onGame(r){
    const st = bs();
    if (r.mode === "survie") {
      if (r.correct >= 10) award("sv10"); if (r.correct >= 25) award("sv25");
      if (r.correct >= 50) award("sv50"); if (r.correct >= 100) award("sv100");
      if (r.noHit >= 20) award("svnh");
    }
    if (r.mode === "eclair") {
      if (r.score >= 70) award("ec70");
      if (r.score >= 100) { award("ec100"); st.ecPerfect = (st.ecPerfect || 0) + 1; if (st.ecPerfect >= 5) award("ec5"); }
    }
    if (r.mode === "tons") {
      if (r.score >= 100) award("tn100");
      if (r.score >= 150) { award("tn150"); st.tnPerfect = (st.tnPerfect || 0) + 1; if (st.tnPerfect >= 3) award("tn3"); }
    }
    if (r.mode === "quotidien") {
      st.dailyDays = [...new Set([...(st.dailyDays || []), today()])].sort().slice(-400);
      if (r.score >= 100) award("dl100");
      const ds = dailyStreak(); if (ds >= 7) award("dl7"); if (ds >= 30) award("dl30");
    }
    if (r.lucky) award("lucky");
    if (r.maxErrRun >= 4) award("four");
    passive(); finalize();
  }
  function onReview(){
    const h = new Date().getHours();
    if (h < 4) award("owl"); else if (h < 7) award("bird");
    passive(); finalize();
  }
  function onMulti(r){
    const w = S.multi?.wins || 0;
    if (r.won) award("mw1"); if (w >= 10) award("mw10");
    if (r.won && r.game === "course" && !r.err) award("calm");
    if (r.best >= 15) award("poet");
    finalize();
  }
  function onDailyTop(){ award("dltop"); finalize(); }

  // badges qui dépendent de l'état général (série, mots acquis, paquets terminés)
  function passive(){
    const s = streak();
    if (s >= 7) award("st7"); if (s >= 30) award("st30"); if (s >= 100) award("st100"); if (s >= 365) award("st365");
    const learned = S.cards.filter(c => c.ivl >= 21).length;
    if (learned >= 100) award("ln100"); if (learned >= 500) award("ln500"); if (learned >= 1000) award("ln1k");
    for (let l = 1; l <= 4; l++) {
      const cs = S.cards.filter(c => c.deck === "HSK " + l);
      if (cs.length >= 100 && cs.every(c => c.ivl >= 21)) award("hsk" + l);
    }
  }

  /* ---------- Profil public ---------- */
  function publicProfile(){
    const p = prof(), g = got();
    return { title: p.title && g[p.title] ? p.title : null, showcase: (p.showcase || []).filter(id => g[id]).slice(0, 3),
             color: p.color || "jade", badge_count: Object.keys(g).filter(id => BY[id]).length };
  }
  let pushTimer = null;
  function pushProfile(){
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => window.zikaSocial?.updateProfile?.(publicProfile()), 800);
  }

  /* ---------- Affichage ---------- */
  function seal(id, cls = ""){
    const b = BY[id]; if (!b) return "";
    return `<span class="badge t${b.t} ${cls}" title="${esc2(b.n)}">${esc2(b.g)}</span>`;
  }
  function titleOf(id){ const b = BY[id]; return b ? b.n : ""; }
  // mini vitrine pour la liste d'amis et le classement
  function miniShowcase(p){ return (p?.showcase || []).filter(id => BY[id]).map(id => seal(id, "xs")).join(""); }

  function toast(id){
    const b = BY[id]; if (!b) return;
    const el = document.createElement("div");
    el.className = "badge-toast"; el.setAttribute("role", "status");
    el.innerHTML = `${seal(id, "lg")}<div><small>Nouveau badge · ${TIERS[b.t]}</small><b>${esc2(b.n)}</b><span>${esc2(b.d)}</span></div>`;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 400); }, 4200);
  }

  function paintPanel(){
    const box = $d("badges"); if (!box) return;
    const g = got(), p = prof(), me = window.zikaSocial?.me?.(), pub = publicProfile();
    const count = pub.badge_count;
    const cell = b => {
      const has = !!g[b.id], hidden = b.secret && !has, inShow = pub.showcase.includes(b.id);
      return `<button class="b-cell ${has ? "" : "locked"} ${editing && has ? "pickable" : ""} ${inShow ? "shown" : ""}" data-b="${b.id}" ${editing && has ? "" : "tabindex=\"-1\""}>
        <span class="badge ${has ? "t" + b.t : "off"}">${hidden ? "?" : esc2(b.g)}</span>
        <b>${hidden ? "Badge secret" : esc2(b.n)}</b>
        <small>${hidden ? "À toi de le découvrir" : esc2(b.d)}</small>
        ${has ? `<small class="b-date">${new Date(g[b.id]).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small>` : ""}
        ${inShow ? `<i class="b-star" aria-label="Dans ta vitrine">★</i>` : ""}
      </button>`;
    };
    box.innerHTML = `
      <div class="b-head">
        <span class="avatar av-${esc2(pub.color)}">${esc2(me?.avatar || "我")}</span>
        <div class="b-who"><b>${esc2(me?.pseudo || "Mes badges")}</b>
          <span class="b-title">${pub.title ? esc2(titleOf(pub.title)) : `<span class="note">Pas encore de titre</span>`}</span>
          <span class="note">${count} badge${count > 1 ? "s" : ""} sur ${BADGES.length}</span></div>
        <div class="b-show">${pub.showcase.map(id => seal(id)).join("") || `<span class="note">Vitrine vide</span>`}</div>
      </div>
      ${!expanded && count ? `<div class="qlabel">Badges gagnés</div><div class="b-earned">${BADGES.filter(b => g[b.id]).map(b => seal(b.id)).join("")}</div>` : ""}
      <div class="row" style="justify-content:flex-end">
        <button class="sbtn" id="b-more">${expanded ? "Replier" : `Voir les ${BADGES.length} badges`}</button>
        <button class="sbtn ${editing ? "accent" : ""}" id="b-edit">${editing ? "Terminer" : "Personnaliser mon profil"}</button>
      </div>
      ${editing ? `<div class="b-editor">
        <label>Titre affiché sous ton pseudo<select id="b-title"><option value="">Aucun</option>
          ${BADGES.filter(b => g[b.id]).map(b => `<option value="${b.id}" ${p.title === b.id ? "selected" : ""}>${esc2(b.n)}</option>`).join("")}</select></label>
        <div><div class="qlabel" style="margin-bottom:6px">Couleur de l'avatar</div><div class="b-colors">${COLORS.map(([k, n]) =>
          `<button class="avatar sm av-${k} ${pub.color === k ? "picked" : ""}" data-col="${k}" aria-label="${n}" title="${n}">${esc2(me?.avatar || "我")}</button>`).join("")}</div></div>
        <div class="note">Touche jusqu'à 3 badges gagnés pour les mettre dans ta vitrine (★). Tes amis la verront.</div>
      </div>` : ""}
      ${!expanded ? "" : CATS.map(([k, n]) => `<div class="qlabel b-cat">${n}</div><div class="b-grid">${BADGES.filter(b => b.cat === k).map(cell).join("")}</div>`).join("")}
      ${!me ? `<div class="note">Crée ton profil de joueur (plus haut) pour que tes amis voient tes badges.</div>` : ""}`;
    $d("b-edit").addEventListener("click", () => { editing = !editing; if (editing) expanded = true; paintPanel(); });
    $d("b-more").addEventListener("click", () => { expanded = !expanded; if (!expanded) editing = false; paintPanel(); });
    $d("b-title")?.addEventListener("change", e => { p.title = e.target.value; p.mod = Date.now(); save(); pushProfile(); paintPanel(); });
    box.querySelectorAll("[data-col]").forEach(b => b.addEventListener("click", () => { p.color = b.dataset.col; p.mod = Date.now(); save(); pushProfile(); paintPanel(); }));
    if (editing) box.querySelectorAll(".b-cell.pickable").forEach(c => c.addEventListener("click", () => {
      const id = c.dataset.b; let sc = (p.showcase || []).filter(x => g[x]);
      sc = sc.includes(id) ? sc.filter(x => x !== id) : sc.length < 3 ? [...sc, id] : [...sc.slice(1), id];
      p.showcase = sc; p.mod = Date.now(); save(); pushProfile(); paintPanel();
    }));
  }

  window.zikaBadges = { onGame, onReview, onMulti, onDailyTop, passive: () => { passive(); finalize(); },
    paintPanel, seal, miniShowcase, titleOf, publicProfile, all: BADGES };
})();
