/* =====================================================================
   Zìkǎ 字卡 — amis, série de jours et défi du jour (Supabase)
   Tables : profiles, friendships, daily_scores (voir supabase-amis.sql)
   ===================================================================== */
(function(){
  const AVATARS = ["龙","虎","猫","马","熊","鹤","鱼","兔","狗","鸟","月","山","火","竹","花","星"];
  const SOC = { loaded:false, me:undefined, links:[], people:{}, scores:{ day:[], week:[] }, board:"day", busy:false };
  const z = () => window.zika || {};
  const sb = () => z().sb;
  const me = () => z().user?.();
  const $d = id => document.getElementById(id);
  const fmt = n => n.toLocaleString("fr-FR");
  const esc2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function monday(){ const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); }
  function yesterday(){ const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
  const liveStreak = p => p && p.last_active && p.last_active >= yesterday() ? p.streak : 0;
  const longDate = () => new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });

  /* ---------- Chargement des données ---------- */
  async function load(){
    const u = me(); if (!u || SOC.busy) return;
    SOC.busy = true;
    try {
      const { data: prof } = await sb().from("profiles").select("*").eq("id", u.id).maybeSingle();
      SOC.me = prof || null;
      if (SOC.me) {
        const { data: links } = await sb().from("friendships").select("*");
        SOC.links = links || [];
        const ids = [...new Set(SOC.links.flatMap(l => [l.requester, l.addressee]))].filter(id => id !== u.id);
        SOC.people = { [u.id]: SOC.me };
        if (ids.length) {
          const { data: ppl } = await sb().from("profiles").select("id,pseudo,avatar,streak,last_active").in("id", ids);
          for (const p of ppl || []) SOC.people[p.id] = p;
        }
        const { data: sc } = await sb().from("daily_scores").select("user_id,day,level,score,correct").gte("day", monday());
        const all = sc || [];
        SOC.scores.day = all.filter(s => s.day === today());
        const week = {};
        for (const s of all) week[s.user_id] = (week[s.user_id] || 0) + s.score;
        SOC.scores.week = Object.entries(week).map(([user_id, score]) => ({ user_id, score }));
        pushStreak();
        submitPending();
      }
      SOC.loaded = true; SOC.error = null;
    } catch (e) {
      SOC.error = navigator.onLine ? "Impossible de charger tes amis pour le moment." : "Hors ligne : les amis s'affichent quand la connexion revient.";
    }
    SOC.busy = false;
    paint();
  }

  const friends = () => {
    const u = me(); if (!u) return [];
    return SOC.links.filter(l => l.status === "accepted").map(l => SOC.people[l.requester === u.id ? l.addressee : l.requester]).filter(Boolean);
  };

  /* ---------- Série de jours ---------- */
  let streakTimer = null;
  function pushStreak(){
    if (!SOC.me) return;
    clearTimeout(streakTimer);
    streakTimer = setTimeout(async () => {
      const s = streak(), last = [...S.activity].pop() || null;
      if (SOC.me.streak === s && SOC.me.last_active === last) return;
      const { error } = await sb().from("profiles").update({ streak: s, last_active: last }).eq("id", SOC.me.id);
      if (!error) { SOC.me.streak = s; SOC.me.last_active = last; }
    }, 1500);
  }
  window.onActivity = pushStreak;

  /* ---------- Défi du jour ---------- */
  async function submitPending(){
    const d = S.daily;
    if (!d || d.day !== today() || d.sent || !SOC.me) return;
    const { error } = await sb().from("daily_scores").insert({ day: d.day, level: d.level, score: d.score, correct: d.correct });
    if (!error || error.code === "23505") { d.sent = true; save(); }
    return error;
  }

  async function playDaily(){
    const level = S.settings.dailyLevel || 1, btn = $d("daily-go");
    if (btn) { btn.disabled = true; btn.textContent = "Préparation…"; }
    let questions;
    try { questions = await window.zikaDefi.dailyQuestions(level, today()); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = "Réessayer"; } $d("daily-msg").textContent = "Impossible de charger les questions. Vérifie ta connexion."; return; }
    const preset = { questions, level, status: "" };
    preset.onFinish = g => {
      S.daily = { day: today(), level, score: g.score, correct: g.correct, sent: false };
      preset.status = me() && SOC.me ? "envoi du score…" : me() ? "choisis un pseudo pour partager ton score" : "connecte-toi pour comparer avec tes amis";
      if (me() && SOC.me) submitPending().then(err => {
        const el = $d("daily-send");
        if (el) el.textContent = !err ? "score partagé avec tes amis" : err.code === "23505" ? "déjà joué aujourd'hui sur un autre appareil" : "score non envoyé, nouvel essai plus tard";
        SOC.loaded = false; load();
      });
    };
    window.zikaDefi.start("quotidien", preset);
  }

  /* ---------- Affichage ---------- */
  function boardHTML(){
    const u = me();
    if (!z().enabled) return "";
    if (!u) return `<div class="note">Connecte-toi dans Réglages → Compte pour comparer ton score avec tes amis.</div>`;
    if (!SOC.loaded) return `<div class="note">${SOC.error || "Chargement du classement…"}</div>`;
    if (!SOC.me) return `<div class="note">Choisis ton pseudo plus bas pour apparaître dans le classement.</div>`;
    const rows = SOC.scores[SOC.board].slice().sort((a, b) => b.score - a.score);
    const shown = new Set(rows.map(r => r.user_id));
    // en vue « aujourd'hui », les amis qui n'ont pas encore joué apparaissent en bas
    if (SOC.board === "day") for (const p of [SOC.me, ...friends()]) if (!shown.has(p.id)) rows.push({ user_id: p.id, score: null });
    const lines = rows.map((r, i) => {
      const p = SOC.people[r.user_id] || { pseudo: "?", avatar: "?" };
      return `<div class="lb-row ${r.user_id === u.id ? "me" : ""}">
        <span class="lb-rank">${r.score === null ? "–" : i + 1}</span>
        <span class="avatar sm">${esc2(p.avatar)}</span>
        <span class="lb-name">${esc2(p.pseudo)}${r.level ? ` <small>HSK ${r.level}</small>` : ""}</span>
        <span class="lb-score">${r.score === null ? `<small>pas encore joué</small>` : fmt(r.score)}</span>
      </div>`;
    }).join("");
    return `<div class="lb">
      <div class="seg" role="tablist">
        <button role="tab" aria-selected="${SOC.board === "day"}" data-board="day" id="lb-day">Aujourd'hui</button>
        <button role="tab" aria-selected="${SOC.board === "week"}" data-board="week" id="lb-week">Cette semaine</button>
      </div>
      ${lines || `<div class="note">Personne n'a encore joué ${SOC.board === "day" ? "aujourd'hui" : "cette semaine"}.</div>`}
      ${!friends().length ? `<div class="note">Ajoute des amis plus bas pour les voir ici.</div>` : ""}
    </div>`;
  }

  function paintDaily(){
    const box = $d("daily"); if (!box) return;
    const lvl = S.settings.dailyLevel || 1, d = S.daily, played = d && d.day === today();
    // le jour de la semaine en tête du score du jour
    const todayRow = SOC.scores.day.find(s => s.user_id === me()?.id);
    box.innerHTML = `
      <div class="daily-head">
        <div><h2>Défi du jour</h2><div class="note">${longDate()} · les mêmes 10 questions pour tous</div></div>
        <span class="daily-glyph" aria-hidden="true">日</span>
      </div>
      ${played || todayRow ? `<div class="daily-done">Ton score aujourd'hui : <b>${fmt((d && d.day === today() ? d : todayRow).score)}</b> <small>HSK ${(d && d.day === today() ? d : todayRow).level}</small><div class="note">Reviens demain pour un nouveau défi.</div></div>`
      : `<div class="row" style="align-items:center">
          <div class="levels" role="group" aria-label="Niveau">${[1,2,3,4].map(n => `<button class="chip" aria-pressed="${n === lvl}" data-lvl="${n}" id="lvl-${n}">HSK ${n}</button>`).join("")}</div>
          <button class="sbtn accent" id="daily-go" style="flex:0 0 auto">Jouer · HSK ${lvl}</button>
        </div>
        <div class="note">Un seul essai par jour. Choisis le niveau avant de jouer : ton score s'affichera avec.</div>
        <div class="msg" id="daily-msg"></div>`}
      ${boardHTML()}`;
    box.querySelectorAll("[data-lvl]").forEach(b => b.addEventListener("click", () => { S.settings.dailyLevel = +b.dataset.lvl; saveSettings(); paintDaily(); }));
    $d("daily-go")?.addEventListener("click", playDaily);
    box.querySelectorAll("[data-board]").forEach(b => b.addEventListener("click", () => { SOC.board = b.dataset.board; paintDaily(); }));
  }

  function paintFriends(){
    const box = $d("friends"); if (!box) return;
    const u = me();
    if (!z().enabled) { box.hidden = true; return; }
    if (!u) { box.innerHTML = `<h2>Amis</h2><div class="note">Connecte-toi dans Réglages → Compte pour ajouter des amis et comparer vos scores.</div>`; return; }
    if (!SOC.loaded) { box.innerHTML = `<h2>Amis</h2><div class="note">${SOC.error || "Chargement…"}</div>`; return; }
    if (!SOC.me) return paintProfileForm(box);

    const recv = SOC.links.filter(l => l.status === "pending" && l.addressee === u.id);
    const sent = SOC.links.filter(l => l.status === "pending" && l.requester === u.id);
    const fr = friends().sort((a, b) => a.pseudo.localeCompare(b.pseudo));
    const todayOf = id => SOC.scores.day.find(s => s.user_id === id);
    const linkOf = id => SOC.links.find(l => (l.requester === id || l.addressee === id) && l.status === "accepted");
    box.innerHTML = `
      <h2>Amis</h2>
      <div class="me-line"><span class="avatar">${esc2(SOC.me.avatar)}</span>
        <div><b>${esc2(SOC.me.pseudo)}</b><div class="note">${streak() ? `${streak()} jour${streak() > 1 ? "s" : ""} de suite` : "Révise ou joue aujourd'hui pour lancer ta série"}</div></div></div>
      <form class="row" id="add-form" style="align-items:end">
        <label>Ajouter un ami<input type="text" id="add-pseudo" placeholder="Son pseudo exact" autocomplete="off"></label>
        <button class="sbtn accent" style="flex:0 0 auto">Envoyer une demande</button>
      </form>
      <div class="msg" id="add-msg"></div>
      ${recv.length ? `<div class="qlabel">Demandes reçues</div>${recv.map(l => personRow(SOC.people[l.requester],
        `<button class="sbtn accent" data-accept="${l.id}">Accepter</button><button class="sbtn" data-remove="${l.id}">Refuser</button>`)).join("")}` : ""}
      ${sent.length ? `<div class="qlabel">En attente de réponse</div>${sent.map(l => personRow(SOC.people[l.addressee],
        `<button class="del" data-remove="${l.id}">Annuler</button>`)).join("")}` : ""}
      ${fr.length ? `<div class="qlabel">Mes amis (${fr.length})</div>${fr.map(p => {
        const t = todayOf(p.id), s = liveStreak(p);
        return personRow(p, `<span class="f-today">${t ? `${fmt(t.score)} <small>HSK ${t.level}</small>` : "<small>pas encore joué</small>"}</span><button class="del" data-remove="${linkOf(p.id)?.id}" data-confirm="1">Retirer</button>`,
          s ? `${s} jour${s > 1 ? "s" : ""} de suite` : "pas de série en cours");
      }).join("")}` : `<div class="note">Ajoute un ami avec son pseudo exact : il devra accepter ta demande. Donne-lui aussi le tien : <b>${esc2(SOC.me.pseudo)}</b>.</div>`}`;

    $d("add-form").addEventListener("submit", e => { e.preventDefault(); addFriend($d("add-pseudo").value.trim()); });
    box.querySelectorAll("[data-accept]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true; await sb().from("friendships").update({ status: "accepted" }).eq("id", b.dataset.accept); refresh();
    }));
    box.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", async () => {
      if (b.dataset.confirm && !b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Confirmer ?"; b.classList.add("armed"); return; }
      b.disabled = true; await sb().from("friendships").delete().eq("id", b.dataset.remove); refresh();
    }));
  }

  function personRow(p, actions, sub){
    p ||= { pseudo: "?", avatar: "?" };
    return `<div class="person"><span class="avatar sm">${esc2(p.avatar)}</span>
      <div class="p-name"><b>${esc2(p.pseudo)}</b>${sub ? `<div class="note">${sub}</div>` : ""}</div>
      <div class="p-act">${actions}</div></div>`;
  }

  function paintProfileForm(box){
    let pick = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    box.innerHTML = `
      <h2>Ton profil de joueur</h2>
      <div class="note">Choisis un pseudo et un avatar. C'est tout ce que tes amis verront de toi, avec ta série de jours et tes scores au défi du jour.</div>
      <form id="prof-form" class="row" style="align-items:end">
        <label>Pseudo<input type="text" id="prof-pseudo" maxlength="20" placeholder="3 à 20 lettres ou chiffres" autocomplete="nickname"></label>
        <button class="sbtn accent" style="flex:0 0 auto">Créer mon profil</button>
      </form>
      <div class="avatars" role="radiogroup" aria-label="Avatar">${AVATARS.map(a => `<button type="button" class="avatar pick" role="radio" aria-checked="${a === pick}" data-av="${a}">${a}</button>`).join("")}</div>
      <div class="msg" id="prof-msg"></div>`;
    box.querySelectorAll("[data-av]").forEach(b => b.addEventListener("click", () => {
      pick = b.dataset.av; box.querySelectorAll("[data-av]").forEach(x => x.setAttribute("aria-checked", x === b));
    }));
    $d("prof-form").addEventListener("submit", async e => {
      e.preventDefault();
      const pseudo = $d("prof-pseudo").value.trim(), msg = $d("prof-msg");
      if (!/^[\p{L}\p{N}.\-]{3,20}$/u.test(pseudo)) { msg.textContent = "Le pseudo doit faire 3 à 20 caractères : lettres, chiffres, point ou tiret."; return; }
      msg.textContent = "Création…";
      const { data, error } = await sb().from("profiles").insert({ pseudo, avatar: pick, streak: streak(), last_active: [...S.activity].pop() || null }).select().single();
      if (error) { msg.textContent = error.code === "23505" ? "Ce pseudo est déjà pris, essaies-en un autre." : "Erreur : " + error.message; return; }
      SOC.me = data; refresh();
    });
  }

  async function addFriend(pseudo){
    const msg = $d("add-msg"), u = me();
    if (!/^[\p{L}\p{N}.\-]{3,20}$/u.test(pseudo)) { msg.textContent = "Entre le pseudo exact de ton ami (3 à 20 caractères)."; return; }
    msg.textContent = "Recherche…";
    const { data: found, error } = await sb().from("profiles").select("id,pseudo,avatar").ilike("pseudo", pseudo).maybeSingle();
    if (error) { msg.textContent = "Erreur : " + error.message; return; }
    if (!found) { msg.textContent = `Personne ne s'appelle « ${pseudo} ». Vérifie l'orthographe avec ton ami.`; return; }
    if (found.id === u.id) { msg.textContent = "C'est ton propre pseudo !"; return; }
    const link = SOC.links.find(l => (l.requester === found.id && l.addressee === u.id) || (l.addressee === found.id && l.requester === u.id));
    if (link?.status === "accepted") { msg.textContent = `${found.pseudo} est déjà ton ami.`; return; }
    if (link && link.requester === u.id) { msg.textContent = `Demande déjà envoyée à ${found.pseudo}.`; return; }
    if (link) { await sb().from("friendships").update({ status: "accepted" }).eq("id", link.id); msg.textContent = `${found.pseudo} t'avait déjà invité : vous êtes maintenant amis.`; refresh(); return; }
    const { error: e2 } = await sb().from("friendships").insert({ addressee: found.id });
    if (e2) { msg.textContent = e2.code === "23505" ? `Demande déjà envoyée à ${found.pseudo}.` : "Erreur : " + e2.message; return; }
    SOC.people[found.id] = found;
    refresh(`Demande envoyée à ${found.pseudo}. Elle s'affichera dans son onglet Défis.`);
  }

  async function refresh(note){
    SOC.loaded = true; // garde l'affichage actuel pendant le rechargement
    await load();
    if (note && $d("add-msg")) $d("add-msg").textContent = note;
  }

  function paint(){
    if (tab !== "defis" || window.zikaDefi?.isPlaying()) return;
    paintDaily(); paintFriends();
  }

  /* appelé par renderDefis() : affiche tout de suite ce qu'on a, puis recharge (au plus toutes les 20 s) */
  let lastLoad = 0;
  window.renderSocial = () => {
    paint();
    if (me() && Date.now() - lastLoad > 20000) { lastLoad = Date.now(); load(); }
  };
  window.addEventListener("zika-auth", () => {
    Object.assign(SOC, { loaded:false, me:undefined, links:[], people:{}, scores:{ day:[], week:[] } });
    lastLoad = 0; if (tab === "defis") window.renderSocial();
  });
})();
