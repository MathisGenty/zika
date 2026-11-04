/* =====================================================================
   Zìkǎ 字卡 — Examen HSK
   - Une question par mot de la liste HSK choisie (HSK 4 = 598 questions).
   - Sens tiré au hasard : français → chinois ou chinois → français, 4 propositions.
   - Temps limité pour tout l'examen : 8 secondes par mot (HSK 1 : 20 min, HSK 4 : 80 min).
     Le chrono ne tourne que quand l'examen est à l'écran : on peut le mettre en pause
     et le reprendre plus tard (l'examen en cours est gardé sur cet appareil).
   - Pas de correction pendant l'examen ; note sur 20 à la fin (12/20 = 60 %, seuil de réussite du HSK).
   - Les meilleures notes sont dans S.exams (synchronisées avec le compte).
   ===================================================================== */
(function(){
  const SEC_PER_WORD = 8;
  const KEY = "zika-exam-en-cours";
  const COUNTS = { 1: 150, 2: 147, 3: 298, 4: 598 };
  const $d = id => document.getElementById(id);
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const minutes = n => Math.ceil(n * SEC_PER_WORD / 60);

  let E = null;         // examen en cours
  let words = null;     // liste HSK du niveau
  let tick = null, last = 0, shown = false;

  /* ---------- Sauvegarde locale de l'examen en cours ---------- */
  const store = () => { try { if (E && !E.done) localStorage.setItem(KEY, JSON.stringify(E)); else localStorage.removeItem(KEY); } catch (e) {} };
  function pending(){ try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && !v.done ? v : null; } catch (e) { return null; } }
  async function loadWords(level){ words = await (await fetch(`decks/hsk${level}.json`)).json(); return words; }

  /* ---------- Préparation : une question par mot ---------- */
  async function create(level){
    const list = await loadWords(level), n = list.length;
    const qs = shuffle([...Array(n).keys()]).map(i => {
      const kind = Math.random() < 0.5 ? "h2m" : "m2h", key = kind === "h2m" ? 2 : 0; // 0 = hanzi, 2 = sens
      const seen = new Set([list[i][key]]), others = [];
      for (const j of shuffle([...Array(n).keys()])) {
        if (j !== i && !seen.has(list[j][key])) { seen.add(list[j][key]); others.push(j); if (others.length === 3) break; }
      }
      const opts = shuffle([i, ...others]);
      return { w: i, kind, opts, ok: opts.indexOf(i) };
    });
    E = { level, qs, ans: Array(n).fill(null), i: 0, used: 0, limit: n * SEC_PER_WORD * 1000, started: Date.now(), done: false };
    store();
  }

  /* ---------- Chrono : il ne tourne que si l'examen est visible ---------- */
  function running(){ return E && !E.done && !E.paused && tab === "defis" && shown && document.visibilityState === "visible"; }
  function startTick(){
    if (tick) return;
    last = performance.now();
    tick = setInterval(() => {
      const now = performance.now(), dt = now - last; last = now;
      if (!running()) return;
      E.used += dt;
      const left = E.limit - E.used;
      const t = $d("ex-time"); if (t) { t.textContent = mmss(left); t.dataset.low = left < 60000; }
      if (left <= 0) return finish();
      if (Math.floor(E.used / 5000) !== Math.floor((E.used - dt) / 5000)) store(); // sauvegarde régulière du temps
    }, 250);
  }
  function stopTick(){ clearInterval(tick); tick = null; }

  /* ---------- Réponse ---------- */
  function answer(k){
    if (!E || E.done || E.lock) return;
    E.ans[E.i] = k; E.lock = true;
    const b = document.querySelector(k >= 0 ? `.opt[data-k="${k}"]` : "#opt-skip"); if (b) b.classList.add("chosen");
    setTimeout(() => {
      E.lock = false;
      // question suivante sans réponse (on peut en avoir sauté avec « Passer »)
      let next = E.ans.findIndex((a, j) => a === null && j > E.i);
      if (next < 0) next = E.ans.findIndex(a => a === null);
      if (next < 0) return finish();
      E.i = next; store(); render();
    }, 180);
  }
  function later(){ // passer : la question reviendra à la fin
    if (!E || E.done) return;
    let next = E.ans.findIndex((a, j) => a === null && j > E.i);
    if (next < 0) next = E.ans.findIndex((a, j) => a === null && j !== E.i);
    if (next < 0) return;
    E.i = next; store(); render();
  }

  /* ---------- Fin et note ---------- */
  function finish(){
    if (!E || E.done) return;
    stopTick();
    const n = E.qs.length;
    const correct = E.qs.filter((q, j) => E.ans[j] === q.ok).length;
    const note = Math.round(correct / n * 200) / 10; // sur 20, au dixième
    E.done = true; E.result = { correct, n, note, used: Math.min(E.used, E.limit), timeout: E.used >= E.limit };
    // les mots ratés reviennent tout de suite en révision (s'ils sont dans tes cartes)
    const now = Date.now(); let back = 0;
    const missed = new Set(E.qs.filter((q, j) => E.ans[j] !== q.ok).map(q => words[q.w][0]));
    for (const c of S.cards) if (missed.has(c.h) && !c.isNew) { c.due = Math.min(c.due, now); c.mod = now; back++; }
    E.result.back = back;
    S.exams ??= {};
    const r = (S.exams[E.level] ??= { best: 0, tries: 0 });
    r.tries++; r.last = note; r.lastDate = now;
    E.result.record = note > r.best; if (note > r.best) r.best = note;
    markActive(); save(); store();
    render();
  }

  function mention(note){
    if (note >= 18) return ["Excellent", "优秀", "ok"];
    if (note >= 14) return ["Très bien", "良好", "ok"];
    if (note >= 12) return ["Réussi", "合格", "ok"];
    return ["Pas encore", "不合格", "ko"];
  }

  /* ---------- Affichage ---------- */
  function render(){
    const view = $d("view");
    if (!E) return;
    shown = true; startTick();
    if (E.done) return renderEnd(view);
    if (!words) { view.innerHTML = `<div class="card"><div class="note">Chargement de l'examen…</div></div>`; loadWords(E.level).then(render); return; }
    const q = E.qs[E.i], w = words[q.w], n = E.qs.length;
    const done = E.ans.filter(a => a !== null).length, skipped = E.ans.filter((a, j) => a === null && j < E.i).length;
    const prompt = q.kind === "m2h" ? `<div class="qlabel">Quel est le hanzi ?</div><div class="meaning big">${esc(w[2])}</div>`
      : `<div class="qlabel">Que veut dire ce mot ?</div>${hanziHTML(w[0], w[1], false)}`;
    const label = j => q.kind === "m2h" ? hz(words[j][0]) : esc(words[j][2]);
    view.innerHTML = `<div class="game exam">
      <div class="ghead">
        <span class="gmode"><span class="glyph">考</span>Examen HSK ${E.level}</span>
        <span>${done + 1 > n ? n : done + 1} / ${n}</span>
        <b id="ex-time" class="m-time">${mmss(E.limit - E.used)}</b>
      </div>
      <div class="timer"><i style="width:${done / n * 100}%"></i></div>
      ${E.paused ? `<div class="card"><div class="done"><div class="big">停</div><div>Examen en pause. Le temps est arrêté.</div>
          <div class="note">Il te reste ${mmss(E.limit - E.used)} pour ${n - done} question${n - done > 1 ? "s" : ""}.</div>
          <button class="btn primary" id="ex-resume">Reprendre</button>
          <button class="del" id="ex-out">Revenir aux défis (l'examen reste en pause)</button></div></div>`
      : `<div class="card gq">${prompt}</div>
      <div class="opts ${q.kind === "m2h" ? "han" : ""}">${q.opts.map((j, k) => `<button class="opt" data-k="${k}"><span>${label(j)}</span><kbd>${k + 1}</kbd></button>`).join("")}
        <button class="opt skip" id="opt-skip"><span>Je ne sais pas</span><kbd>0</kbd></button></div>`}
      <div class="row" style="justify-content:space-between;align-items:center">
        <span class="note">${skipped ? `${skipped} question${skipped > 1 ? "s" : ""} passée${skipped > 1 ? "s" : ""}, elle${skipped > 1 ? "s" : ""} reviendr${skipped > 1 ? "ont" : "a"} à la fin` : "Pas de correction pendant l'examen : la note arrive à la fin."}</span>
        <span class="row" style="flex:0 0 auto;gap:6px">
          ${E.paused ? "" : `<button class="sbtn" id="ex-later">Passer</button><button class="sbtn" id="ex-pause">Pause</button>`}
        </span>
      </div>
      <div class="row" style="justify-content:flex-end"><button class="del" id="ex-end">Terminer l'examen maintenant</button></div>
    </div>`;
    view.querySelectorAll(".opt[data-k]").forEach(b => b.addEventListener("click", () => answer(+b.dataset.k)));
    $d("opt-skip")?.addEventListener("click", () => answer(-2));
    $d("ex-later")?.addEventListener("click", later);
    $d("ex-pause")?.addEventListener("click", () => { E.paused = true; store(); render(); });
    $d("ex-resume")?.addEventListener("click", () => { E.paused = false; store(); render(); });
    $d("ex-out")?.addEventListener("click", () => { store(); E = null; words = null; shown = false; stopTick(); window.renderDefis(); });
    const end = $d("ex-end");
    end.addEventListener("click", () => {
      if (!end.dataset.armed) { end.dataset.armed = 1; end.classList.add("armed"); end.textContent = `Confirmer : les ${n - done} questions restantes comptent comme fausses`; return; }
      finish();
    });
  }

  function renderEnd(view){
    const r = E.result, [m, zh, cls] = mention(r.note), best = S.exams?.[E.level]?.best;
    const wrong = E.qs.map((q, j) => ({ q, a: E.ans[j] })).filter(x => x.a !== x.q.ok);
    view.innerHTML = `<div class="game">
      <div class="card end">
        <div class="seal">考</div>
        <div class="qlabel">Examen HSK ${E.level} · ${r.timeout ? "temps écoulé" : "terminé"}</div>
        <div class="end-score">${String(r.note).replace(".", ",")}<small class="ex-on">/20</small></div>
        <div class="ex-mention ${cls}">${m} · ${zh}</div>
        <div class="end-stats">
          <div><b>${r.correct}</b> bonne${r.correct > 1 ? "s" : ""} réponse${r.correct > 1 ? "s" : ""} sur ${r.n}</div>
          <div><b>${Math.round(r.correct / r.n * 100)} %</b></div>
          <div><b>${mmss(r.used)}</b> utilisées</div>
        </div>
        <div class="note">${r.record ? "Ta meilleure note à ce niveau !" : `Ta meilleure note à ce niveau : ${String(best).replace(".", ",")}/20`} · seuil de réussite : 12/20 (60 %)</div>
        ${wrong.length ? `<details class="ex-wrong"><summary>Voir les ${wrong.length} mot${wrong.length > 1 ? "s" : ""} à retravailler</summary>
          ${wrong.map(({ q }) => { const w = words[q.w]; return `<div class="miss"><span class="fb-h">${hz(w[0])}</span><span>${pinyinHTML(w[1])}</span><span class="note">${esc(w[2])}</span></div>`; }).join("")}
          ${r.back ? `<div class="note">${r.back} de ces mots, déjà dans tes cartes, reviennent dès maintenant dans ta révision.</div>` : ""}</details>` : ""}
        <div class="row" style="justify-content:center"><button class="sbtn accent" id="ex-home">Retour aux défis</button></div>
      </div></div>`;
    $d("ex-home").addEventListener("click", () => { E = null; stopTick(); shown = false; store(); window.renderDefis(); });
  }

  /* ---------- Entrée dans l'onglet Défis ---------- */
  function renderEntry(){
    const box = $d("exam-entry"); if (!box) return;
    shown = false;
    const p = pending(), ex = S.exams || {};
    box.innerHTML = `<div class="daily-head"><div><h2>Examen HSK</h2>
        <div class="note">Tous les mots du niveau, dans les deux sens. Temps limité pour l'ensemble, note sur 20.</div></div>
        <span class="daily-glyph" aria-hidden="true">考</span></div>
      ${p ? `<div class="ex-pending"><div><b>Examen HSK ${p.level} en cours</b>
          <div class="note">${p.ans.filter(a => a !== null).length} / ${p.qs.length} questions · ${mmss(p.limit - p.used)} restantes</div></div>
          <button class="sbtn accent" id="ex-continue">Reprendre</button><button class="del" id="ex-drop">Abandonner</button></div>` : ""}
      <div class="ex-levels">${[1, 2, 3, 4].map(l => `<button class="ex-level" data-l="${l}" ${p ? "disabled" : ""}>
          <b>HSK ${l}</b><span>${COUNTS[l]} questions · ${minutes(COUNTS[l])} min</span>
          <small>${ex[l] ? `Meilleure note : ${String(ex[l].best).replace(".", ",")}/20` : "Pas encore passé"}</small></button>`).join("")}</div>`;
    box.querySelectorAll("[data-l]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true; b.querySelector("span").textContent = "Préparation…";
      try { await create(+b.dataset.l); render(); } catch (e) { b.disabled = false; b.querySelector("span").textContent = "Impossible de charger la liste, réessaie."; }
    }));
    $d("ex-continue")?.addEventListener("click", async () => { E = p; E.paused = false; await loadWords(E.level); render(); });
    const drop = $d("ex-drop");
    drop?.addEventListener("click", () => {
      if (!drop.dataset.armed) { drop.dataset.armed = 1; drop.textContent = "Confirmer l'abandon"; drop.classList.add("armed"); return; }
      try { localStorage.removeItem(KEY); } catch (e) {} renderEntry();
    });
  }

  /* ---------- Clavier ---------- */
  document.addEventListener("keydown", e => {
    if (!E || E.done || E.paused || tab !== "defis" || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) { e.preventDefault(); answer(n - 1); }
    else if (n === 0) { e.preventDefault(); answer(-2); }
  });
  // l'onglet quitte l'examen : on garde la progression, le chrono s'arrête tout seul
  window.addEventListener("pagehide", store);

  window.zikaExam = { active: () => !!E, render, renderEntry, leave: () => { store(); shown = false; } };
})();
