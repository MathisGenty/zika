/* =====================================================================
   Zìkǎ 字卡 — compte et synchronisation (Supabase)
   - Facultatif : sans config.js rempli, l'app fonctionne comme avant, sans compte.
   - Toutes les données d'un utilisateur tiennent dans une ligne de la table "progress".
   - Fusion carte par carte : la version la plus récente (champ "mod") gagne,
     et une suppression gagne sur une modification plus ancienne.
   ===================================================================== */
(function(){
  const cfg = window.ZIKA_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

  let user = null, busy = false, again = false, timer = null, lastSync = null, state = "idle", errMsg = "";
  let applying = false; // vrai pendant qu'on applique des données venues du serveur

  /* ---------- Fusion de deux états ---------- */
  function merge(L, R){
    const del = {...(R.deleted||{})};
    for (const [id,t] of Object.entries(L.deleted||{})) del[id] = Math.max(del[id]||0, t);

    const best = new Map();
    for (const c of [...(R.cards||[]), ...L.cards]) {
      const o = best.get(c.id);
      if (!o || (c.mod||0) > (o.mod||0)) best.set(c.id, c);
    }
    // ordre : celui de cet appareil, puis les cartes venues de l'autre
    const ids = [...L.cards.map(c=>c.id), ...(R.cards||[]).map(c=>c.id)];
    const seen = new Set(), cards = [];
    for (const id of ids) {
      if (seen.has(id)) continue; seen.add(id);
      const c = best.get(id);
      if (del[id] && del[id] >= (c.mod||0)) continue; // supprimée après sa dernière modif
      delete del[id];
      cards.push(c);
    }
    const lMod = L.settingsMod||0, rMod = R.settingsMod||0;
    const ln = L.newLog||{date:"",n:0}, rn = R.newLog||{date:"",n:0};
    const newLog = ln.date === rn.date ? {date:ln.date, n:Math.max(ln.n, rn.n)} : (ln.date > rn.date ? ln : rn);
    return { cards, deleted: del, settings: lMod >= rMod ? L.settings : R.settings,
             settingsMod: Math.max(lMod, rMod), newLog, owner: L.owner };
  }

  // JSON avec les clés triées : la base réordonne les clés, il faut comparer le contenu
  const stable = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

  /* ---------- Synchronisation ---------- */
  async function sync(){
    if (!user) return;
    if (busy) { again = true; return; }
    busy = true; setState("busy");
    try {
      const { data, error } = await sb.from("progress").select("data").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      const remote = data?.data || null;

      let merged;
      if (S.owner && S.owner !== user.id) {
        // ces données locales appartiennent à un autre compte : on ne les mélange pas
        merged = remote || fresh();
      } else {
        merged = remote ? merge(S, remote) : structuredClone(S);
      }
      merged.owner = user.id;

      if (stable(merged) !== stable(S)) applyLocal(merged);

      const { owner, ...toSend } = merged;
      if (!remote || stable(toSend) !== stable(remote)) {
        const { error: e2 } = await sb.from("progress").upsert({ user_id: user.id, data: toSend, updated_at: new Date().toISOString() });
        if (e2) throw e2;
      }
      lastSync = new Date(); setState("ok");
    } catch (e) {
      errMsg = navigator.onLine ? (e.message || "erreur inconnue") : "pas de connexion";
      setState(navigator.onLine ? "error" : "offline");
    }
    busy = false;
    if (again) { again = false; sync(); }
  }

  function applyLocal(next){
    applying = true;
    S = next; migrate(); save();
    applying = false;
    // rafraîchit l'écran sans casser une carte en cours de révision
    if (tab === "review" && !flipped) { queue = buildQueue(); pickDir(); }
    else if (tab === "review") { queue = queue.filter(id => S.cards.some(c => c.id === id)); }
    render();
  }

  // appelé par save() dans app.js à chaque modification locale
  window.onLocalChange = () => {
    if (applying || !user) return;
    clearTimeout(timer); timer = setTimeout(sync, 2000);
  };

  /* ---------- Indicateur dans l'en-tête ---------- */
  const badge = document.createElement("span");
  badge.className = "sync-badge"; badge.hidden = true;
  document.querySelector(".brand")?.append(badge);

  function setState(s){
    state = s;
    const t = { busy:"synchronisation…", ok:"synchronisé", offline:"hors ligne", error:"erreur de synchro", idle:"" }[s];
    badge.textContent = t; badge.dataset.state = s; badge.hidden = !user || !t;
    if (tab === "settings") renderAccount();
  }

  /* ---------- Panneau « Compte » dans Réglages ---------- */
  const esc2 = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function frErr(e){
    const m = (e?.message || "").toLowerCase();
    if (!navigator.onLine) return "Pas de connexion internet.";
    if (m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
    if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet e-mail : clique sur « Se connecter ».";
    if (m.includes("password")) return "Le mot de passe doit faire au moins 6 caractères.";
    if (m.includes("email")) return "Cette adresse e-mail n'est pas valide.";
    return "Erreur : " + (e?.message || "inconnue");
  }

  function renderAccount(){
    const box = document.getElementById("account");
    if (!box) return;
    if (!enabled) {
      box.innerHTML = `<h2>Compte et synchronisation</h2><div class="note">${window.ZIKA_CONFIG?.supabaseUrl
        ? "Le module de connexion n'a pas pu se charger. Vérifie ta connexion internet puis recharge la page."
        : "La synchronisation n'est pas encore configurée (fichier config.js)."}</div>`;
      return;
    }
    if (!user) {
      box.innerHTML = `<h2>Compte et synchronisation</h2>
        <div class="note">Connecte-toi pour retrouver tes cartes et ta progression sur tous tes appareils. Les cartes déjà présentes ici sont conservées et ajoutées à ton compte.</div>
        <form id="auth-form" class="row" style="align-items:end">
          <label>E-mail<input type="text" inputmode="email" autocomplete="email" id="au-mail" required></label>
          <label>Mot de passe<input type="password" autocomplete="current-password" id="au-pass" minlength="6" required></label>
        </form>
        <div class="row" style="justify-content:flex-end;align-items:center">
          <div class="msg" id="au-msg" style="flex:1 1 auto"></div>
          <button class="sbtn" id="au-up" type="button">Créer un compte</button>
          <button class="sbtn accent" id="au-in" type="button">Se connecter</button>
        </div>`;
      const go = async (mode) => {
        const email = document.getElementById("au-mail").value.trim(), password = document.getElementById("au-pass").value;
        const msg = document.getElementById("au-msg");
        if (!email || password.length < 6) { msg.textContent = "Entre ton e-mail et un mot de passe d'au moins 6 caractères."; return; }
        msg.textContent = mode === "up" ? "Création du compte…" : "Connexion…";
        const { data, error } = mode === "up"
          ? await sb.auth.signUp({ email, password })
          : await sb.auth.signInWithPassword({ email, password });
        if (error) { msg.textContent = frErr(error); return; }
        if (mode === "up" && !data.session) msg.textContent = "Compte créé. Confirme ton adresse avec l'e-mail reçu, puis connecte-toi.";
      };
      document.getElementById("au-in").addEventListener("click", () => go("in"));
      document.getElementById("au-up").addEventListener("click", () => go("up"));
      document.getElementById("auth-form").addEventListener("submit", e => { e.preventDefault(); go("in"); });
      return;
    }
    const when = lastSync ? lastSync.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : null;
    const line = { busy:"Synchronisation en cours…", ok:`Synchronisé à ${when}.`, offline:"Hors ligne : tes révisions seront envoyées au retour de la connexion.",
                   error:`La dernière synchronisation a échoué (${esc2(errMsg)}).`, idle:"" }[state];
    box.innerHTML = `<h2>Compte et synchronisation</h2>
      <div>Connecté avec <b>${esc2(user.email)}</b></div>
      <div class="note">${line}</div>
      <div class="row" style="justify-content:flex-end">
        <button class="sbtn" id="au-out">Se déconnecter</button>
        <button class="sbtn accent" id="au-sync">Synchroniser maintenant</button>
      </div>`;
    document.getElementById("au-sync").addEventListener("click", sync);
    document.getElementById("au-out").addEventListener("click", async () => {
      await sync(); await sb.auth.signOut();
    });
  }
  window.renderAccount = renderAccount;

  /* ---------- Démarrage ---------- */
  if (enabled) {
    sb.auth.onAuthStateChange((event, session) => {
      const was = user?.id;
      user = session?.user || null;
      if (!user) { setState("idle"); renderAccount(); return; }
      if (user.id !== was) { renderAccount(); setTimeout(sync, 0); }
    });
    document.addEventListener("visibilitychange", () => {
      if (!user) return;
      if (document.visibilityState === "visible") sync();
      else { clearTimeout(timer); sync(); } // envoie avant que l'app passe en arrière-plan
    });
    window.addEventListener("online", () => user && sync());
  }
})();
