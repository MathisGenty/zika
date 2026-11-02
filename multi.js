/* =====================================================================
   Zìkǎ 字卡 — parties en direct entre amis (Supabase Realtime)
   Deux jeux :
   - Course 抢答 : le premier qui répond juste prend +10, une erreur −5 et bloque
     jusqu'à la question suivante. Premier à 100 points.
   - Phrases 造句 : tout le monde reçoit les mêmes tuiles, 2 minutes pour écrire
     des phrases (chaque tuile une seule fois). Points = nombre de caractères au carré.
     Le créateur de la partie valide ou refuse chaque phrase. 3 manches.
   Fonctionnement : une partie = un canal temps réel « zika-room-CODE ».
   Le créateur (l'hôte) détient l'état de la partie et le diffuse à tous ;
   les autres joueurs n'envoient que leurs actions.
   ===================================================================== */
(function(){
  const COURSE_TARGET = 100, COURSE_MAX_Q = 30, COURSE_Q_TIME = 12000, COURSE_PAUSE = 2600;
  const PHRASE_TIME = 120000, PHRASE_ROUNDS = 3;
  const CORE = "我你他她们是的不了很在有和也都吗呢吧这那一个人要去想会说看好大小吃喝做来没就还对多什么谁家今天明中国学生朋友喜欢".split("");
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  let M = null; // partie en cours (vue locale)
  const $d = id => document.getElementById(id);
  const esc2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmt = n => n.toLocaleString("fr-FR");
  const user = () => window.zika?.user?.();
  const profile = () => window.zikaSocial?.me?.();

  /* ---------- Transport temps réel (Supabase, ou faux canal local pour les tests) ---------- */
  function openTransport(code, meId, meta, { onMsg, onPresence, onReady, onError }){
    if (window.ZIKA_TRANSPORT) return window.ZIKA_TRANSPORT(code, meId, meta, { onMsg, onPresence, onReady, onError });
    const sb = window.zika.sb;
    const ch = sb.channel("zika-room-" + code, { config: { broadcast: { self: false }, presence: { key: meId } } });
    ch.on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload));
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState(), out = {};
      for (const [k, arr] of Object.entries(st)) out[k] = arr[0];
      onPresence(out);
    });
    ch.subscribe(async status => {
      if (status === "SUBSCRIBED") { await ch.track(meta); onReady(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError(status);
    });
    return {
      send: payload => ch.send({ type: "broadcast", event: "m", payload }),
      close: () => { try { ch.untrack(); } catch (e) {} sb.removeChannel(ch); }
    };
  }

  /* ---------- Données : listes HSK ---------- */
  const deckCache = {};
  async function deck(level){
    if (!deckCache[level]) deckCache[level] = (await (await fetch(`decks/hsk${level}.json`)).json()).map(([h, p, m]) => ({ h, p, m }));
    return deckCache[level];
  }
  async function charInfo(maxLevel){
    const py = {}, chars = [];
    for (let l = 1; l <= maxLevel; l++) for (const w of await deck(l)) {
      const cs = [...w.h], sy = sylls(w.p);
      cs.forEach((c, i) => { if (!py[c]) { py[c] = sy.length === cs.length ? sy[i] : ""; chars.push(c); } });
    }
    for (const c of CORE) if (!py[c]) py[c] = "";
    return { py, chars };
  }

  /* ---------- Côté hôte : état de la partie ---------- */
  let H = null; // données privées de l'hôte (bonnes réponses, minuteurs)

  function newRoom(game, opts){
    const me = profile(), code = Array.from({ length: 4 }, () => CODE_CHARS[rnd(CODE_CHARS.length)]).join("");
    return {
      code, hostId: me.id, game, level: opts.level, nTiles: opts.nTiles || 30,
      phase: "lobby", seq: 0, endsIn: 0,
      players: { [me.id]: { pseudo: me.pseudo, avatar: me.avatar, score: 0, online: true } },
      // course
      qi: 0, q: null, locked: [], reveal: null,
      // phrases
      round: 0, tiles: [], py: {}, subs: {}, verdicts: {}, roundPts: {}
    };
  }

  function broadcast(){
    const R = M.R; R.seq++;
    R.endsIn = H.ends ? Math.max(0, H.ends - Date.now()) : 0;
    M.t.send({ t: "state", R });
    applyState(structuredClone(R));
  }

  function hostAction(from, a){
    const R = M.R;
    if (a.t === "hello") { if (!R.players[from] && a.p) R.players[from] = { pseudo: a.p.pseudo, avatar: a.p.avatar, score: 0, online: true }; return broadcast(); }
    if (R.game === "course" && a.t === "ans") return courseAnswer(from, a);
    if (R.game === "phrase" && a.t === "sub" && R.phase === "write" && a.round === R.round) { R.subs[from] = cleanSub(a, R.tiles.length); return; } // pas besoin de tout rediffuser
  }

  function presenceChanged(online){
    if (!M) return;
    M.online = online;
    if (!M.isHost) {
      if (M.R && online[M.R.hostId]) M.sawHost = true;
      if (M.R && M.sawHost && !online[M.R.hostId] && M.R.phase !== "end") { M.hostGone = true; render(); }
      return;
    }
    const R = M.R; if (!R) return;
    let changed = false;
    for (const [id, meta] of Object.entries(online)) {
      if (!R.players[id] && R.phase !== "end") { R.players[id] = { pseudo: meta.pseudo, avatar: meta.avatar, score: 0, online: true }; changed = true; }
    }
    for (const [id, p] of Object.entries(R.players)) { const on = !!online[id]; if (p.online !== on) { p.online = on; changed = true; } }
    if (changed) broadcast();
    if (R.game === "course" && R.phase === "q") courseCheckAllLocked();
  }

  /* ---------- Course ---------- */
  async function courseNext(){
    const R = M.R;
    const top = Math.max(...Object.values(R.players).map(p => p.score));
    if (top >= COURSE_TARGET || R.qi >= COURSE_MAX_Q) return endGame();
    const words = await deck(R.level);
    let q = null;
    while (!q) {
      const card = words[rnd(words.length)];
      if (H.used.has(card.h)) continue;
      const kind = ["h2m", "m2h", "h2p"][rnd(3)];
      const key = kind === "m2h" ? (x => x.h) : kind === "h2p" ? (x => x.p) : (x => x.m);
      const seen = new Set([key(card)]), others = [];
      for (const x of shuffle(words.slice())) { if (!seen.has(key(x))) { seen.add(key(x)); others.push(x); if (others.length === 3) break; } }
      const opts = shuffle([card, ...others]);
      H.used.add(card.h); H.correct = opts.indexOf(card);
      q = { kind, card, opts: opts.map(key) };
    }
    R.qi++; R.q = q; R.locked = []; R.reveal = null; R.phase = "q";
    H.ends = Date.now() + COURSE_Q_TIME;
    clearTimeout(H.timer); H.timer = setTimeout(() => courseReveal(null), COURSE_Q_TIME);
    broadcast();
  }

  function courseAnswer(from, a){
    const R = M.R;
    if (R.phase !== "q" || a.qi !== R.qi || R.locked.includes(from) || !R.players[from]) return;
    if (a.k === H.correct) { R.players[from].score += 10; return courseReveal(from); }
    R.players[from].score = Math.max(0, R.players[from].score - 5);
    R.locked.push(from);
    broadcast();
    courseCheckAllLocked();
  }
  function courseCheckAllLocked(){
    const R = M.R, on = Object.entries(R.players).filter(([, p]) => p.online).map(([id]) => id);
    if (R.phase === "q" && on.length && on.every(id => R.locked.includes(id))) courseReveal(null);
  }
  function courseReveal(winner){
    const R = M.R; if (R.phase !== "q") return;
    clearTimeout(H.timer);
    R.phase = "reveal"; R.reveal = { ok: H.correct, winner };
    H.ends = 0; broadcast();
    H.timer = setTimeout(courseNext, COURSE_PAUSE);
  }

  /* ---------- Phrases ---------- */
  async function phraseRound(){
    const R = M.R;
    R.round++;
    const { py, chars } = await charInfo(R.level);
    const n = R.nTiles, nCore = Math.round(n * 0.4), tiles = [];
    const core = shuffle(CORE.slice());
    for (let i = 0; i < nCore; i++) tiles.push(core[i % core.length]);
    const pool = shuffle(chars.filter(c => !CORE.includes(c)));
    for (let i = 0; tiles.length < n; i++) tiles.push(pool[i % pool.length]);
    R.tiles = shuffle(tiles);
    R.py = Object.fromEntries(R.tiles.map(c => [c, py[c] || ""]));
    R.subs = {}; R.verdicts = {}; R.roundPts = {}; R.phase = "write";
    H.ends = Date.now() + PHRASE_TIME;
    clearTimeout(H.timer); H.timer = setTimeout(phraseJudge, PHRASE_TIME);
    broadcast();
  }
  function cleanSub(a, n){
    const used = new Set(), out = [];
    for (const s of [...(a.sents || []), a.cur || []]) {
      if (!Array.isArray(s) || s.length < 2) continue;
      const ok = s.every(i => Number.isInteger(i) && i >= 0 && i < n && !used.has(i));
      if (!ok) continue;
      s.forEach(i => used.add(i)); out.push(s);
    }
    return out;
  }
  function phraseJudge(){
    const R = M.R; if (R.phase !== "write") return;
    clearTimeout(H.timer); H.ends = 0;
    R.subs[R.hostId] = cleanSub({ sents: M.my.sents, cur: M.my.cur }, R.tiles.length);
    R.phase = "judge"; broadcast();
  }
  function phraseScore(){
    const R = M.R; R.roundPts = {};
    for (const [id, sents] of Object.entries(R.subs)) {
      let pts = 0;
      sents.forEach((s, i) => { if (R.verdicts[id + "|" + i]) pts += s.length * s.length; });
      R.roundPts[id] = pts;
      if (R.players[id]) R.players[id].score += pts;
    }
    R.phase = "round"; broadcast();
  }

  /* ---------- Début / fin ---------- */
  function startGame(){
    const R = M.R;
    for (const p of Object.values(R.players)) p.score = 0;
    H.used = new Set(); R.qi = 0; R.round = 0;
    if (R.game === "course") courseNext(); else phraseRound();
  }
  function endGame(){
    const R = M.R; clearTimeout(H.timer); H.ends = 0;
    R.phase = "end"; broadcast();
  }

  /* ---------- Côté joueur : réception de l'état ---------- */
  function applyState(R){
    const prev = M.R;
    M.R = R; M.ready = true;
    M.localEnd = R.endsIn ? Date.now() + R.endsIn : 0;
    if (R.game === "phrase" && R.phase === "write" && (!prev || prev.phase !== "write" || prev.round !== R.round)) M.my = { sents: [], cur: [] };
    if (R.phase === "end" && prev?.phase !== "end") recordResult(R);
    if (!M.isHost && !R.players[M.meId] && R.phase !== "end") M.t.send({ t: "act", from: M.meId, a: { t: "hello", p: { pseudo: profile().pseudo, avatar: profile().avatar } } });
    render();
  }
  function recordResult(R){
    const ranks = Object.entries(R.players).sort((a, b) => b[1].score - a[1].score);
    S.multi ??= { played: 0, wins: 0 };
    S.multi.played++;
    if (ranks[0]?.[0] === M.meId && ranks[0][1].score > 0) S.multi.wins++;
    markActive(); save();
  }

  function act(a){
    if (M.isHost) hostAction(M.meId, a);
    else M.t.send({ t: "act", from: M.meId, a });
  }

  /* ---------- Créer / rejoindre / quitter ---------- */
  function connect(code, isHost, R){
    const me = profile();
    M = { code, isHost, meId: me.id, R: null, ready: false, online: {}, my: { sents: [], cur: [] } };
    H = isHost ? { used: new Set(), ends: 0, timer: null, correct: -1 } : null;
    M.t = openTransport(code, me.id, { pseudo: me.pseudo, avatar: me.avatar }, {
      onMsg: msg => {
        if (!M) return;
        if (msg.t === "state" && !M.isHost) { if (!M.R || msg.R.seq > M.R.seq || msg.R.phase !== M.R.phase) applyState(msg.R); }
        else if (msg.t === "act" && M.isHost) hostAction(msg.from, msg.a);
        else if (msg.t === "closed" && !M.isHost) { M.hostGone = true; render(); }
      },
      onPresence: presenceChanged,
      onReady: () => {
        if (isHost) { M.R = R; broadcast(); }
        else {
          act({ t: "hello", p: { pseudo: me.pseudo, avatar: me.avatar } });
          setTimeout(() => { if (M && !M.ready) { M.notFound = true; render(); } }, 5000);
        }
      },
      onError: () => { if (M) { M.netError = true; render(); } }
    });
    render();
  }
  function leave(){
    if (!M) return;
    if (M.isHost) { clearTimeout(H?.timer); try { M.t.send({ t: "closed" }); } catch (e) {} }
    M.t.close(); M = null; H = null;
    clearInterval(tickTimer); tickTimer = null;
    window.renderDefis();
  }

  /* ---------- Affichage ---------- */
  let tickTimer = null;
  function startTick(){
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      if (!M || !M.localEnd) return;
      const left = Math.max(0, M.localEnd - Date.now()), el = $d("m-time"), bar = $d("tbar");
      if (el) el.textContent = Math.ceil(left / 1000) + " s";
      if (bar) { bar.style.width = Math.min(100, left / (M.R.game === "course" ? COURSE_Q_TIME : PHRASE_TIME) * 100) + "%"; bar.dataset.low = left < (M.R.game === "course" ? 3000 : 15000); }
    }, 200);
  }

  const players = () => Object.entries(M.R.players).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.score - a.score);
  function scoreboard(compact){
    return `<div class="m-board ${compact ? "compact" : ""}">${players().map(p => `
      <div class="m-pl ${p.id === M.meId ? "me" : ""} ${p.online ? "" : "off"} ${M.R.locked?.includes(p.id) ? "locked" : ""}">
        <span class="avatar sm">${esc2(p.avatar)}</span><span class="m-name">${esc2(p.pseudo)}${p.id === M.R.hostId ? ` <small>hôte</small>` : ""}${p.online ? "" : ` <small>parti</small>`}</span>
        <b>${fmt(p.score)}</b></div>`).join("")}</div>`;
  }
  function header(){
    const R = M.R, g = R.game === "course" ? "Course 抢答" : "Phrases 造句";
    const step = R.game === "course" ? (R.qi ? `Question ${R.qi}` : "") : (R.round ? `Manche ${R.round} / ${PHRASE_ROUNDS}` : "");
    return `<div class="ghead"><span class="gmode"><span class="glyph">${R.game === "course" ? "抢" : "句"}</span>${g} · HSK ${R.level}</span>
      <span>${step}</span><span class="m-code">${esc2(R.code)}</span></div>`;
  }

  function render(){
    if (!M || tab !== "defis") return;
    const view = $d("view");
    startTick();
    if (M.hostGone || M.notFound || M.netError) {
      view.innerHTML = `<div class="card"><div class="done"><div class="big">散</div>
        <div>${M.notFound ? `Aucune partie trouvée avec le code <b>${esc2(M.code)}</b>. Vérifie le code avec ton ami.`
          : M.netError ? "La connexion temps réel a échoué. Vérifie ta connexion internet, puis réessaie."
          : "Le créateur de la partie l'a quittée. La partie est terminée."}</div>
        <button class="sbtn accent" id="m-leave">Retour aux défis</button></div></div>`;
      $d("m-leave").addEventListener("click", leave); return;
    }
    if (!M.R) { view.innerHTML = `<div class="card"><div class="done"><div class="note">Connexion à la partie ${esc2(M.code)}…</div><button class="del" id="m-leave">Annuler</button></div></div>`; $d("m-leave").addEventListener("click", leave); return; }
    const R = M.R;
    const fn = { lobby: renderLobby, q: renderCourseQ, reveal: renderCourseQ, write: renderWrite, judge: renderJudge, round: renderRound, end: renderEnd }[R.phase];
    fn(view, R);
    $d("m-leave")?.addEventListener("click", () => {
      const b = $d("m-leave");
      if (R.phase !== "end" && R.phase !== "lobby" && !b.dataset.armed) { b.dataset.armed = 1; b.textContent = M.isHost ? "Confirmer : la partie s'arrête pour tous" : "Confirmer"; b.classList.add("armed"); return; }
      leave();
    });
  }

  function renderLobby(view, R){
    const n = Object.values(R.players).filter(p => p.online).length;
    view.innerHTML = `<div class="game">
      ${header()}
      <div class="card m-lobby">
        <div class="qlabel">Code de la partie</div>
        <div class="m-bigcode">${esc2(R.code)}</div>
        <div class="row" style="justify-content:center"><button class="sbtn" id="m-copy">Copier le code</button></div>
        <div class="note">Tes amis vont dans Défis → Jouer avec des amis → Rejoindre, et tapent ce code.</div>
      </div>
      <section class="panel"><h2>Joueurs (${n})</h2>${scoreboard(true)}</section>
      ${R.game === "phrase" ? `<div class="note" style="text-align:center">${R.nTiles} tuiles · 2 minutes par manche · ${PHRASE_ROUNDS} manches · points = caractères²</div>`
        : `<div class="note" style="text-align:center">+10 par bonne réponse, −5 par erreur · premier à ${COURSE_TARGET} points</div>`}
      ${M.isHost ? `<button class="btn primary" id="m-start" ${n < 2 ? "disabled" : ""}>${n < 2 ? "En attente d'au moins un autre joueur…" : "Lancer la partie"}</button>`
        : `<div class="note" style="text-align:center">En attente du lancement par ${esc2(R.players[R.hostId]?.pseudo)}…</div>`}
      <div class="row" style="justify-content:flex-end"><button class="del" id="m-leave">Quitter</button></div>
    </div>`;
    $d("m-copy").addEventListener("click", () => { navigator.clipboard?.writeText(R.code).then(() => $d("m-copy").textContent = "Copié", () => {}); });
    $d("m-start")?.addEventListener("click", startGame);
  }

  function renderCourseQ(view, R){
    const q = R.q, c = q.card, rev = R.phase === "reveal" ? R.reveal : null;
    const locked = R.locked.includes(M.meId);
    const prompt = q.kind === "m2h" ? `<div class="qlabel">Quel est le hanzi ?</div><div class="meaning big">${esc2(c.m)}</div>`
      : `<div class="qlabel">${q.kind === "h2p" ? "Quelle est la prononciation ?" : "Que veut dire ce mot ?"}</div>${hanziHTML(c.h, c.p, false)}`;
    const cls = q.kind === "m2h" ? "han" : q.kind === "h2p" ? "py" : "";
    const winner = rev?.winner ? R.players[rev.winner] : null;
    view.innerHTML = `<div class="game">
      ${header()}
      <div class="timer"><i id="tbar"></i></div>
      ${scoreboard(true)}
      <div class="card gq">${prompt}</div>
      <div class="opts ${cls}">${q.opts.map((o, i) => `<button class="opt ${rev && i === rev.ok ? "right" : ""} ${rev && i === M.myAns?.[R.qi] && i !== rev.ok ? "wrong" : ""} ${!rev && locked && i === M.myAns?.[R.qi] ? "wrong" : ""}"
        data-k="${i}" ${rev || locked ? "disabled" : ""}><span>${esc2(o)}</span><kbd>${i + 1}</kbd></button>`).join("")}</div>
      <div class="gfb">${rev ? `<div class="fb ${rev.winner === M.meId ? "ok" : "skip"}"><b>${winner ? (rev.winner === M.meId ? "Bravo, +10 !" : `${esc2(winner.pseudo)} a trouvé`) : "Personne n'a trouvé"}</b>
        <span class="fb-word"><span class="fb-h">${esc2(c.h)}</span> ${pinyinHTML(c.p)} · ${esc2(c.m)}</span></div>`
        : locked ? `<div class="fb ko"><b>Raté · −5</b><span class="note">Tu es bloqué jusqu'à la question suivante.</span></div>` : ""}</div>
      <div class="row" style="justify-content:flex-end"><button class="del" id="m-leave">Quitter la partie</button></div>
    </div>`;
    view.querySelectorAll(".opt[data-k]").forEach(b => b.addEventListener("click", () => {
      const k = +b.dataset.k; (M.myAns ??= {})[R.qi] = k;
      view.querySelectorAll(".opt[data-k]").forEach(x => x.disabled = true);
      act({ t: "ans", qi: R.qi, k });
    }));
    if (rev) speak(c.h);
  }

  function renderWrite(view, R){
    const my = M.my, used = new Set([...my.sents.flat(), ...my.cur]);
    const sentHTML = (s, i) => `<div class="m-sent"><span class="m-hz">${s.map(k => esc2(R.tiles[k])).join("")}</span>
      <span class="m-pts">${s.length}² = ${s.length * s.length}</span><button class="del" data-del="${i}" aria-label="Retirer cette phrase">Retirer</button></div>`;
    const total = my.sents.reduce((t, s) => t + s.length * s.length, 0);
    view.innerHTML = `<div class="game">
      ${header()}
      <div class="timer"><i id="tbar"></i></div>
      <div class="row" style="justify-content:space-between;align-items:center"><span class="qlabel">Forme des phrases avec ces tuiles</span><b id="m-time" class="m-time"></b></div>
      <div class="m-tiles">${R.tiles.map((ch, i) => `<button class="m-tile" data-i="${i}" ${used.has(i) ? "disabled" : ""}><span>${esc2(ch)}</span><small>${esc2(R.py[ch] || "")}</small></button>`).join("")}</div>
      <div class="card m-cur">
        <div class="qlabel">Phrase en cours${my.cur.length ? ` · ${my.cur.length} caractère${my.cur.length > 1 ? "s" : ""} = ${my.cur.length * my.cur.length} pts` : ""}</div>
        <div class="m-curline">${my.cur.length ? my.cur.map((k, j) => `<button class="m-tile in" data-j="${j}">${esc2(R.tiles[k])}</button>`).join("") : `<span class="note">Touche des tuiles pour écrire. Touche une tuile ici pour la retirer.</span>`}</div>
        <div class="row" style="justify-content:flex-end">
          <button class="sbtn" id="m-clear" ${my.cur.length ? "" : "disabled"}>Effacer</button>
          <button class="sbtn accent" id="m-add" ${my.cur.length >= 2 ? "" : "disabled"}>Garder cette phrase</button>
        </div>
      </div>
      <section class="panel"><h2>Mes phrases · ${total} pts si validées</h2>
        ${my.sents.length ? my.sents.map(sentHTML).join("") : `<div class="note">Une phrase longue vaut bien plus que plusieurs courtes : 15 caractères = 225 pts, 3 × 5 = 75 pts.</div>`}
        <div class="note">La phrase en cours est aussi comptée à la fin du temps.</div>
      </section>
      ${M.isHost ? `<button class="sbtn" id="m-stop">Arrêter la manche maintenant</button>` : ""}
      <div class="row" style="justify-content:flex-end"><button class="del" id="m-leave">Quitter la partie</button></div>
    </div>`;
    const push = () => act({ t: "sub", round: R.round, sents: my.sents, cur: my.cur });
    const again = () => { push(); renderWrite(view, R); };
    view.querySelectorAll(".m-tile[data-i]").forEach(b => b.addEventListener("click", () => { my.cur.push(+b.dataset.i); again(); }));
    view.querySelectorAll(".m-tile[data-j]").forEach(b => b.addEventListener("click", () => { my.cur.splice(+b.dataset.j, 1); again(); }));
    view.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { my.sents.splice(+b.dataset.del, 1); again(); }));
    $d("m-clear").addEventListener("click", () => { my.cur = []; again(); });
    $d("m-add").addEventListener("click", () => { my.sents.push(my.cur); my.cur = []; again(); });
    $d("m-stop")?.addEventListener("click", phraseJudge);
  }

  function renderJudge(view, R){
    const rows = players().map(p => {
      const sents = R.subs[p.id] || [];
      return `<section class="panel"><div class="me-line"><span class="avatar sm">${esc2(p.avatar)}</span><b>${esc2(p.pseudo)}</b></div>
        ${sents.length ? sents.map((s, i) => {
          const key = p.id + "|" + i, v = R.verdicts[key];
          return `<div class="m-sent judge ${v === true ? "yes" : v === false ? "no" : ""}">
            <span class="m-hz">${s.map(k => esc2(R.tiles[k])).join("")}</span><span class="m-pts">${s.length}² = ${s.length * s.length}</span>
            ${M.isHost ? `<span class="m-vote"><button class="sbtn ${v === true ? "accent" : ""}" data-v="${key}|1" aria-label="Valider">✓</button><button class="sbtn ${v === false ? "danger-on" : ""}" data-v="${key}|0" aria-label="Refuser">✗</button></span>`
              : `<span class="m-verdict">${v === true ? "validée" : v === false ? "refusée" : "…"}</span>`}</div>`;
        }).join("") : `<div class="note">Aucune phrase.</div>`}</section>`;
    }).join("");
    const pending = Object.entries(R.subs).some(([id, s]) => s.some((_, i) => R.verdicts[id + "|" + i] === undefined));
    view.innerHTML = `<div class="game">
      ${header()}
      <div class="note" style="text-align:center">${M.isHost ? "Valide ou refuse chaque phrase, puis compte les points." : `${esc2(R.players[R.hostId]?.pseudo)} valide les phrases…`}</div>
      ${rows}
      ${M.isHost ? `<button class="btn primary" id="m-count">${pending ? "Compter (les phrases non jugées sont refusées)" : "Compter les points"}</button>` : ""}
      <div class="row" style="justify-content:flex-end"><button class="del" id="m-leave">Quitter la partie</button></div>
    </div>`;
    view.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => {
      const [id, i, v] = b.dataset.v.split("|"); R.verdicts[id + "|" + i] = v === "1"; M.R = R; broadcast();
    }));
    $d("m-count")?.addEventListener("click", phraseScore);
  }

  function renderRound(view, R){
    const last = R.round >= PHRASE_ROUNDS;
    view.innerHTML = `<div class="game">
      ${header()}
      <section class="panel"><h2>Manche ${R.round}</h2>
        ${players().map(p => `<div class="lb-row ${p.id === M.meId ? "me" : ""}"><span class="lb-rank"></span><span class="avatar sm">${esc2(p.avatar)}</span>
          <span class="lb-name">${esc2(p.pseudo)}</span><span class="lb-score">+${fmt(R.roundPts[p.id] || 0)}</span></div>`).join("")}</section>
      <section class="panel"><h2>Total</h2>${scoreboard()}</section>
      ${M.isHost ? `<button class="btn primary" id="m-next">${last ? "Voir le podium" : "Manche suivante"}</button>` : `<div class="note" style="text-align:center">En attente de la suite…</div>`}
      <div class="row" style="justify-content:flex-end"><button class="del" id="m-leave">Quitter la partie</button></div>
    </div>`;
    $d("m-next")?.addEventListener("click", () => last ? endGame() : phraseRound());
  }

  function renderEnd(view, R){
    const ps = players(), win = ps[0];
    view.innerHTML = `<div class="game">
      <div class="card end">
        <div class="seal">胜</div>
        <div class="qlabel">${R.game === "course" ? "Course" : "Phrases"} · terminée</div>
        <span class="avatar" style="width:64px;height:64px;font-size:34px">${esc2(win.avatar)}</span>
        <div class="end-score" style="font-size:36px">${esc2(win.pseudo)}</div>
        <div class="end-rec">${win.id === M.meId ? "Tu as gagné !" : "remporte la partie"}</div>
        <div style="width:100%;max-width:420px">${scoreboard()}</div>
        <div class="note">${S.multi ? `Tes parties : ${S.multi.played} jouée${S.multi.played > 1 ? "s" : ""}, ${S.multi.wins} gagnée${S.multi.wins > 1 ? "s" : ""}.` : ""}</div>
        <div class="row" style="justify-content:center">
          ${M.isHost ? `<button class="sbtn accent" id="m-again">Rejouer avec les mêmes joueurs</button>` : ""}
          <button class="sbtn" id="m-leave">Quitter</button>
        </div>
      </div></div>`;
    $d("m-again")?.addEventListener("click", () => { M.R.phase = "lobby"; for (const p of Object.values(M.R.players)) p.score = 0; broadcast(); });
  }

  /* ---------- Entrée dans l'onglet Défis ---------- */
  function renderEntry(){
    const box = $d("multi-entry"); if (!box) return;
    const st = S.settings;
    box.innerHTML = `<h2>Jouer avec des amis · en direct</h2>`;
    if (!window.zika?.enabled) { box.innerHTML += `<div class="note">La synchronisation n'est pas configurée.</div>`; return; }
    if (!user()) { box.innerHTML += `<div class="note">Connecte-toi dans Réglages → Compte pour jouer avec tes amis.</div>`; return; }
    if (!profile()) { box.innerHTML += `<div class="note">${window.zikaSocial?.loaded() ? "Crée ton profil de joueur plus bas (pseudo et avatar) pour jouer." : "Chargement…"}</div>`; return; }
    const lvl = st.multiLevel || 1, game = st.multiGame || "course", nT = st.multiTiles || 30;
    box.innerHTML += `
      <div class="m-games">
        <button class="m-game" aria-pressed="${game === "course"}" data-g="course"><span class="glyph">抢</span><span><b>Course</b><small>Le premier qui répond juste prend les points.</small></span></button>
        <button class="m-game" aria-pressed="${game === "phrase"}" data-g="phrase"><span class="glyph">句</span><span><b>Phrases</b><small>Les mêmes tuiles pour tous : la phrase la plus longue gagne.</small></span></button>
      </div>
      <div class="row" style="align-items:end">
        <label>Niveau<select id="m-lvl">${[1,2,3,4].map(n => `<option value="${n}" ${n === lvl ? "selected" : ""}>HSK ${n}</option>`).join("")}</select></label>
        ${game === "phrase" ? `<label>Tuiles<select id="m-ntiles">${[20,30,40,50].map(n => `<option value="${n}" ${n === nT ? "selected" : ""}>${n} tuiles</option>`).join("")}</select></label>` : ""}
        <button class="sbtn accent" id="m-create" style="flex:0 0 auto">Créer une partie</button>
      </div>
      <form class="row" id="m-join" style="align-items:end">
        <label>Rejoindre avec un code<input type="text" id="m-code" maxlength="4" placeholder="ABCD" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-family:var(--f-mono)"></label>
        <button class="sbtn" style="flex:0 0 auto">Rejoindre</button>
      </form>
      <div class="msg" id="m-msg"></div>`;
    box.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => { st.multiGame = b.dataset.g; saveSettings(); renderEntry(); }));
    $d("m-lvl").addEventListener("change", e => { st.multiLevel = +e.target.value; saveSettings(); });
    $d("m-ntiles")?.addEventListener("change", e => { st.multiTiles = +e.target.value; saveSettings(); });
    $d("m-create").addEventListener("click", () => {
      const R = newRoom(st.multiGame || "course", { level: st.multiLevel || 1, nTiles: st.multiTiles || 30 });
      connect(R.code, true, R);
    });
    $d("m-join").addEventListener("submit", e => {
      e.preventDefault();
      const code = $d("m-code").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) { $d("m-msg").textContent = "Le code fait 4 caractères, par exemple MAO7."; return; }
      connect(code, false);
    });
  }

  window.zikaMulti = { active: () => !!M, render, renderEntry, leave };
  window.addEventListener("beforeunload", () => { if (M?.isHost) try { M.t.send({ t: "closed" }); } catch (e) {} });
})();
