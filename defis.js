/* =====================================================================
   Zìkǎ 字卡 — Défis : Éclair, Tons, Survie
   - Questions à choix multiples chronométrées, avec un bouton « Je ne sais pas ».
   - Barème : Éclair, Tons et défi du jour = +10 par bonne réponse, −5 par erreur
     (ou temps écoulé), 0 pour « Je ne sais pas ». Survie = 1 point par bonne réponse.
   - Records enregistrés dans S.records (et synchronisés avec le compte).
   - Un mot raté pendant un défi revient tout de suite dans la révision.
   ===================================================================== */
(function(){
  const MODES = {
    eclair: { name:"Éclair", glyph:"闪", n:10, time:8,
      desc:"10 questions, 8 secondes chacune. +10 par bonne réponse, −5 par erreur." },
    tons:   { name:"Tons",   glyph:"声", n:15, time:10,
      desc:"Trouve le ton de la syllabe soulignée. 15 questions de 10 secondes. +10 / −5." },
    survie: { name:"Survie", glyph:"命", n:Infinity, time:10,
      desc:"1 point par bonne réponse, 3 vies. Le temps raccourcit et le niveau monte." },
    quotidien: { name:"Défi du jour", glyph:"日", n:10, time:8, hidden:true,
      desc:"Les mêmes 10 questions pour tout le monde aujourd'hui. Un seul essai. +10 / −5." }
  };
  const TONE_NAMES = ["", "1er ton", "2e ton", "3e ton", "4e ton", "neutre"];

  let G = null;          // partie en cours
  let timers = [];       // délais à annuler si on quitte
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  /* ---------- Outils ---------- */
  // hasard : Math.random, ou un tirage « à graine » pour que le défi du jour soit identique pour tous
  let RAND = Math.random;
  const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash = str => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
  const rnd = n => Math.floor(RAND() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const weighted = list => { let t = list.reduce((s, [, w]) => s + w, 0), r = RAND() * t; for (const [v, w] of list) { if ((r -= w) < 0) return v; } return list[0][0]; };
  const stripTone = s => s.normalize("NFD").replace(/[̀́̄̌]/g, "").normalize("NFC");
  const fmt = n => n.toLocaleString("fr-FR");
  const $d = id => document.getElementById(id);

  // « records2 » : records du barème actuel (les anciens, plus gros, ne sont plus comparables)
  function records(){ S.records2 ??= {}; return S.records2; }

  function sourcePool(){
    const st = S.settings;
    return S.cards.filter(c => c.h && c.m
      && (!st.defiDeck || c.deck === st.defiDeck)
      && (!st.defiSeen || !c.isNew));
  }
  // decks présents dans la source, dans l'ordre d'ajout (sert à la montée de niveau en Survie)
  function poolDecks(pool){ return [...new Set(pool.map(c => c.deck))]; }

  /* ---------- Fabrication des questions ---------- */
  function distractors(card, pool, key, n = 3){
    const seen = new Set([key(card)]), out = [];
    const cands = pool.filter(x => x.id !== card.id && key(x))
      .map(x => ({ x, s: (x.deck === card.deck ? 2 : 0) + ([...x.h].length === [...card.h].length ? 1 : 0) + RAND() * 1.6 }))
      .sort((a, b) => b.s - a.s);
    for (const { x } of cands) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); if (out.length === n) break; } }
    return out.length === n ? out : null;
  }

  function choiceQ(card, pool, kind){
    const key = kind === "m2h" ? (x => x.h) : kind === "h2p" ? (x => x.p) : (x => x.m);
    const others = distractors(card, pool, key); if (!others) return null;
    const opts = shuffle([card, ...others]).map(x => ({ label: key(x), ok: x === card }));
    return { kind, card, opts };
  }

  function toneQ(card){
    const sy = sylls(card.p), ch = [...card.h];
    if (!sy.length || sy.length !== ch.length) return null;
    const idx = rnd(sy.length), tone = toneOf(sy[idx]), base = stripTone(sy[idx]).toLowerCase();
    const opts = [1, 2, 3, 4, 5].map(t => ({ label: t === 5 ? base : numToMark(base + t), tone: t, ok: t === tone }));
    return { kind: "tone", card, idx, opts };
  }

  function nextCard(pool){
    let fresh = pool.filter(c => !G.used.has(c.id));
    if (!fresh.length) { G.used.clear(); fresh = pool; }
    const c = fresh[rnd(fresh.length)]; G.used.add(c.id); return c;
  }

  function buildQuestion(){
    if (G.preset) return G.preset.questions[G.i] || null;
    let pool = G.pool;
    if (G.mode === "survie" && G.decks.length > 1) {
      const allowed = G.decks.slice(0, 1 + Math.floor(G.correct / 10));
      pool = G.pool.filter(c => allowed.includes(c.deck));
      G.level = allowed.length;
    }
    for (let tries = 0; tries < 30; tries++) {
      const card = nextCard(pool);
      const kind = G.mode === "tons" ? "tone"
        : G.mode === "eclair" ? weighted([["h2m", 3], ["m2h", 2], ["h2p", 2]])
        : weighted([["h2m", 3], ["m2h", 2], ["h2p", 2], ["tone", 2]]);
      const q = kind === "tone" ? toneQ(card) : choiceQ(card, G.pool, kind);
      if (q) return q;
    }
    return null;
  }

  /* ---------- Défi du jour : 10 questions tirées à partir de la date et du niveau ---------- */
  const dailyCache = {};
  async function dailyQuestions(level, day){
    const key = level + "|" + day;
    if (dailyCache[key]) return dailyCache[key];
    const data = await (await fetch(`decks/hsk${level}.json`, { cache: "no-cache" })).json();
    const pool = data.map(([h, p, m], i) => ({ id: `d${level}-${i}`, h, p, m, deck: `HSK ${level}` }));
    RAND = seeded(hash("zika-" + day + "-hsk" + level));
    try {
      const order = shuffle(pool.slice()), qs = [];
      for (const card of order) {
        const kind = weighted([["h2m", 3], ["m2h", 2], ["h2p", 2], ["tone", 2]]);
        const q = kind === "tone" ? toneQ(card) : choiceQ(card, pool, kind);
        if (q) qs.push(q);
        if (qs.length === 10) break;
      }
      return (dailyCache[key] = qs);
    } finally { RAND = Math.random; }
  }

  /* ---------- Déroulement d'une partie ---------- */
  function start(mode, preset){
    const pool = preset ? [] : sourcePool();
    G = { mode, pool, decks: poolDecks(pool), used: new Set(), i: 0, score: 0, combo: 0, bestCombo: 0,
          correct: 0, lives: 3, wrong: [], level: 1, q: null, answered: false, preset };
    ask();
  }

  function duration(){
    if (G.mode === "survie") return Math.max(4, 10 - Math.floor(G.correct / 5));
    return MODES[G.mode].time;
  }

  function ask(){
    if (G.mode !== "survie" && G.i >= (G.preset ? G.preset.questions.length : MODES[G.mode].n)) return finish();
    if (G.mode === "survie" && G.lives <= 0) return finish();
    G.q = buildQuestion();
    if (!G.q) { G.error = "Pas assez de cartes différentes pour créer des questions. Ajoute des cartes ou choisis une autre source."; return finish(); }
    G.i++; G.answered = false; G.dur = duration() * 1000; G.t0 = performance.now();
    renderGame();
    tick();
  }

  function tick(){
    if (!G || G.answered) return;
    const left = Math.max(0, G.dur - (performance.now() - G.t0));
    const bar = $d("tbar"); if (bar) { bar.style.width = (left / G.dur * 100) + "%"; bar.dataset.low = left < 2500; }
    if (left <= 0) return answer(-1);
    G.raf = requestAnimationFrame(tick);
  }

  function answer(k){
    if (!G || G.answered) return;
    G.answered = true; cancelAnimationFrame(G.raf);
    // k : index de la réponse choisie, -1 = temps écoulé, -2 = « Je ne sais pas »
    const q = G.q, ok = k >= 0 && q.opts[k].ok, skip = k === -2, survie = G.mode === "survie";
    let label;
    if (ok) {
      const pts = survie ? 1 : 10;
      G.score += pts; G.combo++; G.correct++; G.bestCombo = Math.max(G.bestCombo, G.combo);
      label = `+${pts}`;
    } else {
      G.combo = 0;
      if (survie) { G.lives--; label = skip ? "Passé · −1 vie" : k === -1 ? "Temps écoulé · −1 vie" : "Raté · −1 vie"; }
      else if (skip) { G.skipped = (G.skipped || 0) + 1; label = "Passé · 0"; }
      else { G.errors = (G.errors || 0) + 1; G.score = Math.max(0, G.score - 5); label = k === -1 ? "Temps écoulé · −5" : "Raté · −5"; }
      if (!G.wrong.includes(q.card)) G.wrong.push(q.card);
    }
    // marque les boutons
    document.querySelectorAll(".opt[data-k]").forEach((b, i) => {
      b.disabled = true;
      if (q.opts[i].ok) b.classList.add("right"); else if (i === k) b.classList.add("wrong");
    });
    const sk = $d("opt-skip"); if (sk) { sk.disabled = true; if (skip) sk.classList.add("chosen"); }
    const c = q.card;
    $d("gfb").innerHTML = `
      <div class="fb ${ok ? "ok" : skip && !survie ? "skip" : "ko"}">
        <b>${label}</b>
        <span class="fb-word"><span class="fb-h">${esc(c.h)}</span> ${pinyinHTML(c.p)} · ${esc(c.m)}</span>
      </div>
      <button class="sbtn" id="g-next">Continuer <kbd>Entrée</kbd></button>`;
    $d("g-next").addEventListener("click", next);
    $d("g-score").textContent = fmt(G.score);
    $d("g-combo").textContent = G.combo >= 2 ? `série ${G.combo}` : "";
    if (G.mode === "survie") $d("g-prog").innerHTML = livesHTML();
    if (q.kind === "tone" || q.kind === "h2p") speak(c.h);
    later(next, ok ? 1100 : 2600);
  }

  function next(){
    if (!G || !G.answered) return;
    timers.forEach(clearTimeout); timers = [];
    ask();
  }

  function finish(){
    cancelAnimationFrame(G?.raf); timers.forEach(clearTimeout); timers = [];
    const R = records(), r = (R[G.mode] ??= { best: 0, plays: 0 });
    let isRecord = false;
    if (!G.error) {
      if (G.mode !== "quotidien") {
        r.plays++; if (G.score > r.best) { r.best = G.score; isRecord = G.score > 0; }
        r.last = Date.now();
      }
      // les mots ratés reviennent tout de suite en révision (s'ils sont dans tes cartes)
      const now = Date.now();
      G.back = 0;
      for (const w of G.wrong) for (const c of S.cards) if (c.h === w.h && !c.isNew) { c.due = Math.min(c.due, now); c.mod = now; G.back++; }
      markActive();
      G.preset?.onFinish?.(G);
      save();
    }
    G.done = true; G.isRecord = isRecord;
    renderGame();
  }

  /* ---------- Affichage ---------- */
  const livesHTML = () => `<span class="lives" aria-label="${G.lives} vies">${[0, 1, 2].map(i => `<i class="${i < G.lives ? "on" : ""}">♥</i>`).join("")}</span>`;

  function promptHTML(q){
    const c = q.card;
    if (q.kind === "m2h") return `<div class="qlabel">Quel est le hanzi ?</div><div class="meaning big">${esc(c.m)}</div>`;
    if (q.kind === "h2p") return `<div class="qlabel">Quelle est la prononciation ?</div>${hanziHTML(c.h, c.p, false)}`;
    if (q.kind === "h2m") return `<div class="qlabel">Que veut dire ce mot ?</div>${hanziHTML(c.h, c.p, false)}`;
    // ton
    const sy = sylls(c.p);
    const cells = [...c.h].map((ch, i) => `<div class="cell ${i === q.idx ? "target" : ""}"><span>${esc(ch)}</span></div>`).join("");
    const py = sy.map((s, i) => i === q.idx ? `<span class="blank">${esc(stripTone(s))}</span>` : `<span class="tone${toneOf(s)}">${esc(s)}</span>`).join(" ");
    return `<div class="qlabel">Quel est le ton de la syllabe soulignée ?</div><div class="hanzi">${cells}</div><div class="pinyin">${py}</div><div class="note">${esc(c.m)}</div>`;
  }

  function optsHTML(q){
    const skip = `<button class="opt skip" id="opt-skip"><span>Je ne sais pas</span><kbd>0</kbd></button>`;
    if (q.kind === "tone") return `<div class="opts tones">${q.opts.map((o, i) =>
      `<button class="opt tone${o.tone}" data-k="${i}" id="opt-${i}"><b>${esc(o.label)}</b><small>${TONE_NAMES[o.tone]} · <kbd>${i + 1}</kbd></small></button>`).join("")}${skip}</div>`;
    const cls = q.kind === "m2h" ? "han" : q.kind === "h2p" ? "py" : "";
    return `<div class="opts ${cls}">${q.opts.map((o, i) =>
      `<button class="opt" data-k="${i}" id="opt-${i}"><span>${esc(o.label)}</span><kbd>${i + 1}</kbd></button>`).join("")}${skip}</div>`;
  }

  function renderGame(){
    const view = document.getElementById("view"), m = MODES[G.mode];
    if (G.done) {
      const r = records()[G.mode] || { best: 0 };
      const back = G.back || 0, daily = G.mode === "quotidien";
      view.innerHTML = G.error ? `<div class="card"><div class="done"><div class="note">${esc(G.error)}</div><button class="sbtn accent" id="g-home">Retour aux défis</button></div></div>` : `
        <div class="card end">
          <div class="seal">${m.glyph}</div>
          <div class="qlabel">${m.name} · terminé</div>
          <div class="end-score">${fmt(G.score)}</div>
          <div class="end-rec">${daily ? `HSK ${G.preset.level} · <span id="daily-send">${G.preset.status || ""}</span>` : G.isRecord ? "Nouveau record !" : `Record : ${fmt(r.best)}`}</div>
          <div class="end-stats">
            <div><b>${G.correct}</b> bonne${G.correct > 1 ? "s" : ""} réponse${G.correct > 1 ? "s" : ""}${G.mode !== "survie" ? ` sur ${G.i}` : ""}</div>
            ${G.mode !== "survie" ? `<div><b>${G.errors || 0}</b> erreur${(G.errors || 0) > 1 ? "s" : ""}</div><div><b>${G.skipped || 0}</b> passée${(G.skipped || 0) > 1 ? "s" : ""}</div>` : `<div><b>${G.bestCombo}</b> de suite au mieux</div>`}
            ${G.mode === "survie" && G.decks.length > 1 ? `<div>niveau <b>${G.level}</b> atteint</div>` : ""}
          </div>
          ${G.wrong.length ? `<div class="end-miss"><div class="qlabel">À retravailler</div>${G.wrong.map(c =>
            `<div class="miss"><span class="fb-h">${esc(c.h)}</span><span>${pinyinHTML(c.p)}</span><span class="note">${esc(c.m)}</span></div>`).join("")}
            ${back ? `<div class="note">${back} mot${back > 1 ? "s" : ""} déjà étudié${back > 1 ? "s" : ""} revien${back > 1 ? "nent" : "t"} dès maintenant dans ta révision.</div>` : ""}</div>` : ""}
          <div class="row" style="justify-content:center">
            ${daily ? `<button class="sbtn accent" id="g-home">Voir le classement</button>` : `<button class="sbtn" id="g-home">Autres défis</button>
            <button class="sbtn accent" id="g-again">Rejouer <kbd>Entrée</kbd></button>`}
          </div>
        </div>`;
      $d("g-home").addEventListener("click", () => { G = null; renderDefis(); });
      $d("g-again")?.addEventListener("click", () => start(G.mode));
      return;
    }
    const q = G.q;
    view.innerHTML = `
      <div class="game">
        <div class="ghead">
          <span class="gmode"><span class="glyph">${m.glyph}</span>${m.name}</span>
          <span id="g-prog">${G.mode === "survie" ? livesHTML() : `${G.i} / ${G.preset ? G.preset.questions.length : m.n}`}</span>
          <span class="gright"><span id="g-combo" class="gcombo">${G.combo >= 2 ? `série ${G.combo}` : ""}</span><b id="g-score">${fmt(G.score)}</b></span>
        </div>
        <div class="timer"><i id="tbar"></i></div>
        <div class="card gq">
          ${G.mode === "survie" && G.decks.length > 1 ? `<div class="dir">Niveau ${G.level} · ${esc(G.decks[G.level - 1])}</div>` : ""}
          ${promptHTML(q)}
        </div>
        ${optsHTML(q)}
        <div id="gfb" class="gfb"></div>
        <div class="row" style="justify-content:flex-end"><button class="del" id="g-quit">Abandonner</button></div>
      </div>`;
    view.querySelectorAll(".opt[data-k]").forEach(b => b.addEventListener("click", () => answer(+b.dataset.k)));
    $d("opt-skip").addEventListener("click", () => answer(-2));
    $d("g-quit").addEventListener("click", () => { finish(); });
  }

  function renderDefis(){
    if (G) return renderGame();
    const view = document.getElementById("view"), st = S.settings, R = records();
    const ds = decks(), pool = sourcePool();
    const toneable = pool.filter(c => sylls(c.p).length === [...c.h].length).length;
    const enough = pool.length >= 4;
    view.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">
      <section class="panel" id="daily"></section>
      <section class="panel">
        <h2>Défis</h2>
        <div class="row" style="align-items:end">
          <label>Cartes utilisées<select id="d-deck">
            <option value="">Tous mes paquets</option>
            ${ds.map(d => `<option value="${esc(d)}" ${d === st.defiDeck ? "selected" : ""}>${esc(d)}</option>`).join("")}
          </select></label>
          <label style="flex-direction:row;align-items:center;gap:8px;color:var(--ink);flex:0 1 auto;padding-bottom:9px">
            <input type="checkbox" id="d-seen" ${st.defiSeen ? "checked" : ""}> Seulement les cartes déjà étudiées</label>
        </div>
        <div class="note">${enough ? `${fmt(pool.length)} cartes en jeu.` : "Il faut au moins 4 cartes pour jouer. Choisis une autre source ou ajoute des cartes."}</div>
      </section>
      <div class="modes">
        ${Object.entries(MODES).filter(([, m]) => !m.hidden).map(([k, m]) => {
          const r = R[k], dis = !enough || (k === "tons" && !toneable);
          return `<button class="mode" data-mode="${k}" id="mode-${k}" ${dis ? "disabled" : ""}>
            <span class="glyph">${m.glyph}</span>
            <span class="mode-txt"><b>${m.name}</b><small>${m.desc}</small></span>
            <span class="mode-rec">${r?.best ? `Record <b>${fmt(r.best)}</b>` : "Pas encore joué"}</span>
          </button>`; }).join("")}
      </div>
      <div class="note" style="text-align:center">Les mots ratés pendant un défi reviennent dans ta révision.</div>
      <section class="panel" id="friends"></section>
      </div>`;
    $d("d-deck").addEventListener("change", e => { st.defiDeck = e.target.value; saveSettings(); renderDefis(); });
    $d("d-seen").addEventListener("change", e => { st.defiSeen = e.target.checked; saveSettings(); renderDefis(); });
    view.querySelectorAll(".mode").forEach(b => b.addEventListener("click", () => start(b.dataset.mode)));
    window.renderSocial?.();
  }

  /* ---------- Clavier ---------- */
  document.addEventListener("keydown", e => {
    if (tab !== "defis" || !G || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (G.done) { if (e.key === "Enter" && !G.error && G.mode !== "quotidien") { e.preventDefault(); start(G.mode); } return; }
    const n = parseInt(e.key, 10);
    if (!G.answered && n >= 1 && n <= G.q.opts.length) { e.preventDefault(); answer(n - 1); }
    else if (!G.answered && n === 0) { e.preventDefault(); answer(-2); }
    else if (G.answered && (e.key === "Enter" || e.code === "Space")) { e.preventDefault(); next(); }
  });

  window.renderDefis = renderDefis;
  window.zikaDefi = { start, dailyQuestions, isPlaying: () => !!G && !G.done };
  window.stopDefi = () => { if (G) { cancelAnimationFrame(G.raf); timers.forEach(clearTimeout); timers = []; G = null; } };
})();
