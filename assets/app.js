/* Calendrier des courses : liste + fiche avec carte et profil interactif. Aucune dépendance sauf Leaflet. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  let DATA = null;
  let filtre = localGet("filtre") || "tous";
  let mapInstance = null;
  let onResize = null;
  let debutMois = null;
  window.addEventListener("resize", () => onResize && onResize());

  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_COURT = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];

  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function fmtDate(s) { return parseDate(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  function joursAvant(s) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseDate(s) - t) / 86400000); }
  function fmtKm(x) { return (Math.round(x * 10) / 10).toLocaleString("fr-FR") + " km"; }
  function fmtM(x) { return Math.round(x).toLocaleString("fr-FR") + " m"; }

  const DB = window.DB && window.DB.actif ? window.DB : null;
  window.addEventListener("hashchange", () => DATA && route());

  if (!DB) {
    fetch("data/courses.json", { cache: "no-cache" })
      .then(r => r.json())
      .then(d => { DATA = d; route(); })
      .catch(e => { app.innerHTML = `<p>Impossible de charger les courses : ${esc(e.message)}</p>`; });
  } else {
    let recuperation = false;
    DB.onAuth(evt => {
      if (evt === "PASSWORD_RECOVERY") { recuperation = true; renderNouveauMdp(); }
      else if (evt === "SIGNED_OUT") { DATA = null; renderNav(); renderLogin(); }
    });
    DB.session().then(s => { if (!recuperation) (s ? demarrer() : renderLogin()); });
  }

  async function demarrer() {
    app.innerHTML = `<p class="muted">Chargement…</p>`;
    try {
      DATA = await DB.charger();
      renderNav();
      if (!DB.moi && !DATA.horsLigne) {
        app.innerHTML = `<div class="auth"><h1>Accès réservé</h1><p>Ce compte n'est pas autorisé à voir le calendrier.</p><button class="btn ghost" id="out" type="button">Se déconnecter</button></div>`;
        app.querySelector("#out").onclick = () => DB.deconnexion();
        return;
      }
      route();
    } catch (e) {
      app.innerHTML = `<p>Impossible de charger les courses : ${esc(e.message)}</p><p><button class="btn ghost" type="button" id="retry">Réessayer</button></p>`;
      app.querySelector("#retry").onclick = demarrer;
    }
  }

  function renderNav() {
    const nav = document.getElementById("nav");
    if (!nav) return;
    if (!DB || !DATA) { nav.innerHTML = ""; return; }
    const r = DB.moi ? DATA.coureurs[DB.moi.coureur] : null;
    nav.innerHTML = `<a class="navlink" href="#/documents">Documents</a><a class="btn small" href="#/ajouter">+ Ajouter</a>
      ${r ? `<span class="tag runner" title="Connecté : ${esc(r.nom)}" style="background:${esc(r.couleur)}">${esc(r.initiale)}</span>` : ""}
      <button class="linkbtn" type="button" id="logout">Déconnexion</button>`;
    nav.querySelector("#logout").onclick = () => DB.deconnexion();
  }

  function renderLogin(message) {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    app.innerHTML = `<form class="auth" id="login" novalidate>
      <h1>Connexion</h1>
      <p class="muted">Calendrier des courses d'Aurèle et Candice.</p>
      <label><span>E-mail</span><input id="l-mail" type="email" autocomplete="username" required value="${esc(localGet("dernierMail") || "")}"></label>
      <label><span>Mot de passe</span><input id="l-mdp" type="password" autocomplete="current-password" required></label>
      <p class="f-err" id="l-err" role="alert" ${message ? "" : "hidden"}>${esc(message || "")}</p>
      <div class="actions"><button class="btn" type="submit" id="l-go">Se connecter</button>
      <button class="linkbtn" type="button" id="l-oubli">Mot de passe oublié ?</button></div>
    </form>`;
    const f = app.querySelector("#login"), err = f.querySelector("#l-err");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const mail = f.querySelector("#l-mail").value, b = f.querySelector("#l-go");
      b.disabled = true; err.hidden = true;
      try { await DB.connexion(mail, f.querySelector("#l-mdp").value); localSet("dernierMail", mail.trim()); demarrer(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; b.disabled = false; }
    });
    f.querySelector("#l-oubli").onclick = async () => {
      const mail = f.querySelector("#l-mail").value.trim();
      if (!mail) { err.textContent = "Saisis d'abord ton e-mail."; err.hidden = false; return; }
      try { await DB.motDePasseOublie(mail); err.textContent = "E-mail envoyé : clique sur le lien reçu pour choisir un nouveau mot de passe."; }
      catch (ex) { err.textContent = ex.message; }
      err.hidden = false;
    };
  }

  function renderNouveauMdp() {
    app.innerHTML = `<form class="auth" id="newpw" novalidate>
      <h1>Nouveau mot de passe</h1>
      <label><span>Nouveau mot de passe (8 caractères minimum)</span><input id="n-mdp" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="f-err" id="n-err" role="alert" hidden></p>
      <div class="actions"><button class="btn" type="submit">Enregistrer</button></div>
    </form>`;
    const f = app.querySelector("#newpw"), err = f.querySelector("#n-err");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const v = f.querySelector("#n-mdp").value;
      if (v.length < 8) { err.textContent = "8 caractères minimum."; err.hidden = false; return; }
      try { await DB.nouveauMotDePasse(v); history.replaceState(null, "", location.pathname); demarrer(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  function route() {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    onResize = null;
    if (DB && location.hash === "#/documents") return renderDocsAnnee();
    const ma = location.hash.match(/^#\/ajouter(?:\/(\d{4}-\d{2}-\d{2}))?$/);
    if (DB && ma) return window.Formulaire.render(app, null, DATA, apresEnregistrement, ma[1]);
    const mm = location.hash.match(/^#\/modifier\/(.+)$/);
    if (DB && mm) {
      const c = DATA.courses.find(x => x.id === decodeURIComponent(mm[1]));
      if (c) return window.Formulaire.render(app, c, DATA, apresEnregistrement);
    }
    const m = location.hash.match(/^#\/course\/(.+)$/);
    if (m) {
      const c = DATA.courses.find(x => x.id === decodeURIComponent(m[1]));
      if (c) return renderCourse(c);
    }
    renderListe();
  }

  async function apresEnregistrement(id) {
    DATA = await DB.charger();
    const h = "#/course/" + encodeURIComponent(id);
    if (location.hash === h) route(); else location.hash = h;
  }

  /* ---------- Liste ---------- */
  function dots(ids) {
    return `<span class="runners">${(ids || []).map(id => {
      const r = DATA.coureurs[id] || { nom: id, couleur: "#888" };
      return `<span class="dot" title="${esc(r.nom)}" style="background:${esc(r.couleur)}"></span>`;
    }).join("")}</span>`;
  }

  function renderListe() {
    document.title = "Calendrier Courses";
    const courses = DATA.courses
      .filter(c => filtre === "tous" || (c.coureurs || []).includes(filtre))
      .sort((a, b) => a.date.localeCompare(b.date));

    const chips = [`<button class="chip" data-f="tous" aria-pressed="${filtre === "tous"}">Tout le monde</button>`]
      .concat(Object.entries(DATA.coureurs).map(([id, r]) =>
        `<button class="chip" data-f="${esc(id)}" aria-pressed="${filtre === id}"><span class="dot" style="background:${esc(r.couleur)}"></span>${esc(r.nom)}</button>`));

    let html = `<h1>Calendrier ${DATA.annee}</h1>
      <p class="muted">${courses.length} course${courses.length > 1 ? "s" : ""} au programme.</p>
      ${DATA.horsLigne ? `<div class="notice">Hors ligne : affichage de la dernière version enregistrée sur ce téléphone.</div>` : ""}
      <div class="filters">${chips.join("")}</div>
      <section class="cal" id="cal" aria-label="Calendrier"></section>
      <h2 class="list-title">Toutes les courses</h2>`;

    let mois = -1;
    for (const c of courses) {
      const d = parseDate(c.date);
      if (d.getMonth() !== mois) { mois = d.getMonth(); html += `<div class="month">${MOIS[mois]} ${d.getFullYear()}</div>`; }
      const j = joursAvant(c.date);
      const quand = j > 0 ? `J-${j}` : j === 0 ? "Aujourd'hui" : "Terminée";
      html += `<a class="race ${j < 0 ? "past" : ""}" href="#/course/${encodeURIComponent(c.id)}">
        <div class="datebox"><div class="d">${d.getDate()}</div><div class="m">${MOIS_COURT[d.getMonth()]}</div></div>
        <div>
          <div class="name">${esc(c.nom)}</div>
          <div class="meta">${tags(c)} ${esc([c.lieu, c.pays].filter(Boolean).join(", "))}</div>
        </div>
        <div class="right">
          <div><b>${c.distance_km ? fmtKm(c.distance_km) : ""}</b>${c.denivele_pos ? " · " + fmtM(c.denivele_pos) + " D+" : ""}</div>
          <div>${c.statut ? `<span class="badge ${esc(c.statut)}">${esc(c.statut)}</span> ` : ""}${quand}</div>
        </div>
      </a>`;
    }
    if (!courses.length) html += DB && !DATA.courses.length
      ? `<div class="box vide"><p>Aucune course pour l'instant.</p><a class="btn" href="#/ajouter">+ Ajouter la première course</a></div>`
      : `<p class="muted">Aucune course pour ce filtre.</p>`;
    app.innerHTML = html;
    app.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => { filtre = b.dataset.f; localSet("filtre", filtre); renderListe(); }));
    calendrier(courses);
    onResize = () => calendrier(courses);
  }

  /* ---------- Calendrier mois par mois ---------- */
  function tags(c) {
    const coureurs = (c.coureurs || []).map(id => {
      const r = DATA.coureurs[id] || { nom: id, couleur: "#888" };
      const ini = r.initiale || r.nom.charAt(0).toUpperCase();
      return `<span class="tag runner" title="${esc(r.nom)}" style="background:${esc(r.couleur)}">${esc(ini)}</span>`;
    }).join("");
    return `<span class="tags">${coureurs}${c.sport ? `<span class="tag sport">${esc(c.sport)}</span>` : ""}</span>`;
  }

  function calendrier(courses) {
    const cal = document.getElementById("cal");
    if (!cal) return;
    const w = cal.clientWidth;
    const nb = w >= 900 ? 3 : w >= 560 ? 2 : 1;
    if (!debutMois) {
      const prochaine = courses.find(c => joursAvant(c.date) >= 0) || courses[0];
      const d = prochaine ? parseDate(prochaine.date) : new Date(DATA.annee, 0, 1);
      debutMois = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const parJour = {};
    for (const c of courses) (parJour[c.date] = parJour[c.date] || []).push(c);
    const fin = new Date(debutMois.getFullYear(), debutMois.getMonth() + nb - 1, 1);
    const titre = nb === 1 ? `${MOIS[debutMois.getMonth()]} ${debutMois.getFullYear()}`
      : `${MOIS[debutMois.getMonth()]}${debutMois.getFullYear() !== fin.getFullYear() ? " " + debutMois.getFullYear() : ""} – ${MOIS[fin.getMonth()]} ${fin.getFullYear()}`;
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const auj = iso(new Date());

    let h = `<div class="cal-nav">
      <button class="navbtn" id="calPrev" type="button" aria-label="Mois précédent">‹</button>
      <div class="cal-title">${titre}</div>
      <button class="navbtn" id="calNext" type="button" aria-label="Mois suivant">›</button>
    </div><div class="months" style="grid-template-columns:repeat(${nb},1fr)">`;
    for (let k = 0; k < nb; k++) {
      const m0 = new Date(debutMois.getFullYear(), debutMois.getMonth() + k, 1);
      const nJours = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
      const decal = (m0.getDay() + 6) % 7; // lundi en premier
      h += `<div class="mgrid">${nb > 1 ? `<div class="mname">${MOIS[m0.getMonth()]} ${m0.getFullYear()}</div>` : ""}<div class="days">`;
      h += ["L", "M", "M", "J", "V", "S", "D"].map(x => `<div class="dow">${x}</div>`).join("");
      for (let i = 0; i < decal; i++) h += `<div></div>`;
      for (let j = 1; j <= nJours; j++) {
        const key = iso(new Date(m0.getFullYear(), m0.getMonth(), j));
        const cs = parJour[key];
        const cls = ["day", key === auj ? "today" : "", cs ? "has" : ""].join(" ");
        if (cs) {
          const pts = [];
          cs.forEach(c => (c.coureurs || []).forEach(id => pts.push((DATA.coureurs[id] || {}).couleur || "#888")));
          h += `<button type="button" class="${cls}" data-date="${key}" aria-label="${j} ${MOIS[m0.getMonth()]} : ${esc(cs.map(c => c.nom).join(", "))}"><span class="n">${j}</span><span class="pts">${pts.map(p => `<i style="background:${esc(p)}"></i>`).join("")}</span></button>`;
        } else if (DB) h += `<button type="button" class="${cls} empty" data-date="${key}" aria-label="${j} ${MOIS[m0.getMonth()]} : ajouter une course"><span class="n">${j}</span></button>`;
        else h += `<div class="${cls}"><span class="n">${j}</span></div>`;
      }
      h += `</div></div>`;
    }
    h += `</div><div class="legend">${Object.values(DATA.coureurs).map(r => `<span><i style="background:${esc(r.couleur)}"></i>${esc(r.nom)}</span>`).join("")}</div>`;
    cal.innerHTML = h;

    const decaler = n => { debutMois = new Date(debutMois.getFullYear(), debutMois.getMonth() + n, 1); calendrier(courses); };
    cal.querySelector("#calPrev").onclick = () => decaler(-1);
    cal.querySelector("#calNext").onclick = () => decaler(1);
    cal.querySelectorAll("button.day").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); ouvrirJour(cal, b, parJour[b.dataset.date] || [], b.dataset.date); }));
  }

  function fermerJour() {
    document.querySelectorAll(".daypop").forEach(p => p.remove());
    document.querySelectorAll(".day.open").forEach(d => d.classList.remove("open"));
  }
  document.addEventListener("click", e => { if (!e.target.closest(".daypop")) fermerJour(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fermerJour(); });

  function ouvrirJour(cal, cell, cs, date) {
    const deja = cell.classList.contains("open");
    fermerJour();
    if (deja) return;
    cell.classList.add("open");
    const d = parseDate(date);
    const pop = document.createElement("div");
    pop.className = "daypop";
    pop.setAttribute("role", "dialog");
    pop.innerHTML = `<div class="pop-date">${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>` +
      cs.map(c => `<div class="pop-race">
        <a class="pop-name" href="#/course/${encodeURIComponent(c.id)}">${esc(c.nom)}</a>
        <div class="pop-tags">${tags(c)}</div>
      </div>`).join("") +
      (DB ? `<a class="pop-add ${cs.length ? "" : "seul"}" href="#/ajouter/${date}">+ Ajouter une course${cs.length ? " ce jour" : ""}</a>` : "");
    cal.appendChild(pop);
    const rc = cal.getBoundingClientRect(), rb = cell.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = rb.left - rc.left + rb.width / 2 - pw / 2;
    left = Math.max(0, Math.min(rc.width - pw, left));
    let top = rb.top - rc.top + rb.height / 2 - ph / 2;
    top = Math.max(0, top);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.transformOrigin = `${rb.left - rc.left + rb.width / 2 - left}px ${rb.top - rc.top + rb.height / 2 - top}px`;
    requestAnimationFrame(() => pop.classList.add("in"));
  }

  /* ---------- Documents (par course, ou de l'année) ---------- */
  function monterDocs(zone, holder, annee, recharger) {
    const nomDe = id => DATA.noms?.[id] || DATA.coureurs[id]?.nom || id;
    const taille = n => n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko";
    const icone = t => /pdf/.test(t) ? "PDF" : /^image\//.test(t) ? "IMG" : "DOC";
    const docs = holder.documents || [];
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const item = (d, i) => {
      let exp = "";
      if (d.expire) {
        const j = Math.round((parseDate(d.expire) - auj) / 86400000);
        exp = j < 0 ? ` · <span class="exp ko">expiré le ${esc(fmtCourt(d.expire))}</span>` : ` · <span class="exp ${j < 45 ? "bientot" : ""}">valable jusqu'au ${esc(fmtCourt(d.expire))}</span>`;
      }
      return `<li>
        <span class="docicon">${icone(d.type)}</span>
        <div class="docinfo"><button class="linkbtn docopen" type="button" data-i="${i}">${esc(d.nom)}</button>
          <div class="muted">${taille(d.taille || 0)}${d.par ? " · ajouté par " + esc(nomDe(d.par)) : ""}${exp}</div></div>
        <button class="f-del docdel" type="button" data-i="${i}" aria-label="Retirer ${esc(d.nom)}">×</button>
        <div class="confirm docconf" data-i="${i}" hidden>Retirer ce document ?
          <button class="btn danger-plein docok" type="button" data-i="${i}">Oui, retirer</button>
          <button class="btn ghost docnon" type="button" data-i="${i}">Annuler</button></div>
      </li>`;
    };
    let liste = "";
    if (annee) {
      const groupes = Object.keys(DATA.coureurs).concat(["commun"]);
      liste = groupes.map(g => {
        const its = docs.map((d, i) => [d, i]).filter(([d]) => (d.pour || "commun") === g);
        const r = DATA.coureurs[g];
        return `<div class="docgroup"><h3>${r ? `<span class="tag runner" style="background:${esc(r.couleur)}">${esc(r.initiale)}</span> ${esc(r.nom)}` : "Commun"}</h3>
          ${its.length ? `<ul class="doclist">${its.map(([d, i]) => item(d, i)).join("")}</ul>` : `<p class="muted">Aucun document.</p>`}</div>`;
      }).join("");
    } else {
      liste = docs.length ? `<ul class="doclist">${docs.map(item).join("")}</ul>` : `<p class="muted">Billets, assurance annulation, réservations, règlement… (PDF, photos, tout type de fichier)</p>`;
    }
    const ajout = annee ? `<div class="docform">
        <label><span>Pour</span><select id="doc-pour">${Object.entries(DATA.coureurs).map(([id, r]) => `<option value="${esc(id)}" ${DB.moi?.coureur === id ? "selected" : ""}>${esc(r.nom)}</option>`).join("")}<option value="commun">Commun</option></select></label>
        <label><span>Valable jusqu'au (facultatif)</span><input type="date" id="doc-exp"></label>
      </div>` : "";
    zone.innerHTML = `${annee ? "" : "<h2>Documents</h2>"}${liste}${ajout}
      <label class="btn ghost docadd"><input type="file" id="doc-file" multiple hidden>+ Joindre un document</label>
      <p class="f-err" id="doc-err" role="alert" hidden></p>`;

    const derr = zone.querySelector("#doc-err");
    zone.querySelector("#doc-file").addEventListener("change", async e => {
      const fichiers = [...e.target.files];
      if (!fichiers.length) return;
      const lab = zone.querySelector(".docadd");
      lab.classList.add("busy"); lab.lastChild.textContent = "Envoi en cours…";
      const extra = annee ? { pour: zone.querySelector("#doc-pour").value, expire: zone.querySelector("#doc-exp").value || undefined } : undefined;
      try {
        let cur = holder;
        for (const f of fichiers) {
          if (f.size > 50 * 1048576) throw new Error(`« ${f.name} » dépasse 50 Mo.`);
          await DB.ajouterDocument(cur, f, extra);
          DATA = await DB.charger();
          cur = annee ? DATA.annee_docs : (DATA.courses.find(x => x.id === holder.id) || cur);
        }
        await recharger();
      } catch (ex) { derr.textContent = ex.message; derr.hidden = false; lab.classList.remove("busy"); lab.lastChild.textContent = "+ Joindre un document"; }
    });
    zone.querySelectorAll(".docopen").forEach(b => b.onclick = async () => {
      const d = docs[b.dataset.i];
      try { location.href = await DB.lienDocument(d.chemin, d.nom); }
      catch (ex) { derr.textContent = "Ouverture impossible : " + ex.message; derr.hidden = false; }
    });
    zone.querySelectorAll(".docdel").forEach(b => b.onclick = () => { zone.querySelector(`.docconf[data-i="${b.dataset.i}"]`).hidden = false; });
    zone.querySelectorAll(".docnon").forEach(b => b.onclick = () => { b.parentElement.hidden = true; });
    zone.querySelectorAll(".docok").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await DB.supprimerDocument(holder, docs[b.dataset.i].chemin); await recharger(); }
      catch (ex) { derr.textContent = ex.message; derr.hidden = false; }
    });
  }

  function renderDocsAnnee() {
    document.title = "Documents · Calendrier Courses";
    app.innerHTML = `<a class="back" href="#/">← Calendrier</a>
      <h1>Documents de l'année</h1>
      <p class="muted">Licences, certificats médicaux, assurances… valables pour toute la saison.</p>
      <div class="box docs" id="docs-zone"></div>`;
    window.scrollTo(0, 0);
    monterDocs(app.querySelector("#docs-zone"), DATA.annee_docs, true, async () => { DATA = await DB.charger(); renderDocsAnnee(); });
  }

  /* ---------- Fiche course ---------- */
  function renderCourse(c) {
    document.title = c.nom + " · Calendrier Courses";
    const j = joursAvant(c.date);
    const noms = (c.coureurs || []).map(id => (DATA.coureurs[id] || { nom: id }).nom).join(" et ");
    const liens = (c.liens || []).map(l => `<a class="btn ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titre)} ↗</a>`).join("");

    let html = `<a class="back" href="#/">← Toutes les courses</a>
      <h1>${esc(c.nom)}</h1>
      <div class="muted head-meta">${tags(c)} ${esc(noms)} · ${esc(fmtDate(c.date))}${c.heure_depart ? " · départ " + esc(c.heure_depart) : ""}</div>
      ${c.exemple ? `<div class="notice">${esc(c.exemple)}</div>` : ""}
      ${DB ? (DATA.annee_docs?.documents || []).filter(d => d.expire && d.expire < c.date && (c.coureurs || []).concat("commun").includes(d.pour || "commun"))
        .map(d => `<div class="notice">« ${esc(d.nom)} » expire le ${esc(fmtCourt(d.expire))}, avant cette course. <a href="#/documents">Voir les documents</a></div>`).join("") : ""}
      <div class="stats">
        <div class="stat"><div class="v" id="st-dist">${c.distance_km ? fmtKm(c.distance_km) : "–"}</div><div class="l">Distance</div></div>
        <div class="stat"><div class="v" id="st-dp">${c.denivele_pos ? fmtM(c.denivele_pos) : "–"}</div><div class="l">Dénivelé +</div></div>
        <div class="stat"><div class="v" id="st-alt">–</div><div class="l">Altitude max</div></div>
        <div class="stat"><div class="v">${j > 0 ? "J-" + j : j === 0 ? "Jour J" : "Terminée"}</div><div class="l">${esc(c.statut || "")}</div></div>
      </div>
      <div class="actions">
        ${c.gpx ? (DB ? `<button class="btn" type="button" id="dl-gpx">⬇ Télécharger le GPX</button>` : `<a class="btn" href="${esc(c.gpx)}" download>⬇ Télécharger le GPX</a>`) : ""}
        ${liens}
      </div>`;

    if (c.gpx) {
      html += `<div class="mapcard">
        <div id="map"></div>
        <div class="profile-wrap"><svg id="profile" aria-label="Profil altimétrique"></svg></div>
        <div class="readout" id="readout"><span>Survolez ou faites glisser le doigt sur le profil.</span></div>
      </div>`;
    }

    const blocs = [];
    const infos = [["Lieu", [c.lieu, c.pays].filter(Boolean).join(", ")], ["Sport", c.sport || c.format], ["Accès", c.acces], ["Retrait des dossards", c.retrait_dossard]]
      .filter(x => x[1]).map(([k, v]) => `<p><b>${k} :</b> ${esc(v)}</p>`).join("");
    if (infos) blocs.push(`<div class="box"><h2>Infos pratiques</h2>${infos}</div>`);
    if (c.ravitos?.length) blocs.push(`<div class="box"><h2>Ravitaillements</h2><table><tr><th>Km</th><th>Nom</th><th>Type</th></tr>${c.ravitos.map(r => `<tr><td>${esc(r.km)}</td><td>${esc(r.nom)}</td><td>${esc(r.type || "")}</td></tr>`).join("")}</table></div>`);
    if (c.barrieres?.length) blocs.push(`<div class="box"><h2>Barrières horaires</h2><table><tr><th>Km</th><th>Lieu</th><th>Heure</th></tr>${c.barrieres.map(r => `<tr><td>${esc(r.km)}</td><td>${esc(r.lieu)}</td><td>${esc(r.heure)}</td></tr>`).join("")}</table></div>`);
    if (c.materiel?.length) blocs.push(`<div class="box"><h2>Matériel obligatoire</h2><ul class="check">${c.materiel.map((m, i) => `<li><input type="checkbox" id="mat${i}" data-k="${esc(c.id)}:${i}"><label for="mat${i}">${esc(m)}</label></li>`).join("")}</ul></div>`);
    const logis = logistique(c);
    if (logis) blocs.push(logis);
    if (c.notes) blocs.push(`<div class="box"><h2>Notes</h2><p>${esc(c.notes)}</p></div>`);
    if (DB) {
      blocs.push(`<div class="box docs" id="docs-zone"></div>`);
    }
    if (blocs.length) html += `<div class="grid2">${blocs.join("")}</div>`;
    if (DB) {
      const nom = id => DATA.noms?.[id] || DATA.coureurs[id]?.nom || id || "?";
      const quand = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + " à " + new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const m = c._meta || {};
      html += `<div class="auteur">
        <div>${m.cree_par ? `Ajoutée par <b>${esc(nom(m.cree_par))}</b> le ${esc(quand(m.cree_le))}` : ""}
        ${m.modifie_le && m.modifie_le !== m.cree_le ? `<br>Modifiée par <b>${esc(nom(m.modifie_par))}</b> le ${esc(quand(m.modifie_le))}` : ""}</div>
        <details id="histo"><summary>Historique des modifications</summary><ul class="histo"><li class="muted">Chargement…</li></ul></details>
        <div class="actions">
          <a class="btn ghost" href="#/modifier/${encodeURIComponent(c.id)}">Modifier</a>
          <button class="btn ghost danger" type="button" id="suppr">Supprimer</button>
        </div>
        <div class="confirm" id="confirm" hidden>Supprimer définitivement « ${esc(c.nom)} » et son GPX ?
          <button class="btn danger-plein" type="button" id="suppr-ok">Oui, supprimer</button>
          <button class="btn ghost" type="button" id="suppr-non">Annuler</button>
        </div>
      </div>`;
    }

    app.innerHTML = html;
    window.scrollTo(0, 0);

    if (DB) {
      const nom = id => DATA.noms?.[id] || DATA.coureurs[id]?.nom || id || "?";
      const conf = app.querySelector("#confirm");
      app.querySelector("#suppr").onclick = () => { conf.hidden = false; };
      app.querySelector("#suppr-non").onclick = () => { conf.hidden = true; };
      app.querySelector("#suppr-ok").onclick = async e => {
        e.target.disabled = true;
        try { await DB.supprimer(c); DATA = await DB.charger(); location.hash = "#/"; }
        catch (ex) { conf.textContent = "Suppression impossible : " + ex.message; }
      };
      monterDocs(app.querySelector("#docs-zone"), c, false, async () => {
        DATA = await DB.charger(); const n = DATA.courses.find(x => x.id === c.id); if (n) renderCourse(n);
      });
      app.querySelector("#histo").addEventListener("toggle", async ev => {
        if (!ev.target.open || ev.target.dataset.ok) return;
        ev.target.dataset.ok = 1;
        const ul = ev.target.querySelector("ul");
        try {
          const h = await DB.historique(c.id);
          ul.innerHTML = h.map(x => `<li><b>${esc(nom(x.par))}</b> · ${esc(x.action)} · ${esc(new Date(x.le).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }))}</li>`).join("") || `<li class="muted">Aucune modification.</li>`;
        } catch (ex) { ul.innerHTML = `<li class="muted">Historique indisponible hors ligne.</li>`; }
      });
    }

    app.querySelectorAll("ul.check input").forEach(cb => {
      cb.checked = localGet("mat:" + cb.dataset.k) === "1";
      cb.addEventListener("change", () => localSet("mat:" + cb.dataset.k, cb.checked ? "1" : "0"));
    });

    if (c.gpx) {
      (DB ? DB.gpx(c.gpx) : fetch(c.gpx).then(r => r.text())).then(txt => {
        const dl = app.querySelector("#dl-gpx");
        if (dl) dl.onclick = () => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([txt], { type: "application/gpx+xml" }));
          a.download = c.id + ".gpx"; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        };
        if (!document.getElementById("profile") || !location.hash.includes(encodeURIComponent(c.id))) return; // page quittée entre-temps
        const trace = parseGpx(txt);
        if (!trace.length) throw new Error("trace vide");
        const s = stats(trace);
        // Le GPX fait foi pour la distance et le D+
        document.getElementById("st-dist").textContent = fmtKm(s.dist);
        if (s.hasEle) document.getElementById("st-dp").textContent = fmtM(s.dplus);
        document.getElementById("st-alt").textContent = s.hasEle ? fmtM(s.max) : "–";
        carteEtProfil(c, trace, s);
      }).catch(e => {
        document.getElementById("readout").textContent = "Impossible de lire le GPX : " + e.message;
      });
    }
  }

  /* ---------- Logistique : logement, vols, voiture, train ---------- */
  function fmtCourt(s) { return s ? parseDate(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : ""; }
  function logistique(c) {
    const loge = c.logement || [], tr = c.transports || [];
    if (!loge.length && !tr.length) return "";
    const ICON = { vol: "✈", voiture: "🚗", train: "🚆", bus: "🚌", ferry: "⛴" };
    let h = `<div class="box logis"><h2>Logistique</h2>`;
    for (const l of loge) {
      h += `<div class="logis-item"><div class="logis-k">Logement</div>
        <div><b>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.nom || "Logement")} ↗</a>` : esc(l.nom || "Logement")}</b></div>
        ${l.adresse ? `<div>${esc(l.adresse)}</div>` : ""}
        ${l.arrivee ? `<div class="muted">Du ${esc(fmtCourt(l.arrivee))} au ${esc(fmtCourt(l.depart))}</div>` : ""}
        ${l.reference ? `<div class="muted">Réservation : ${esc(l.reference)}</div>` : ""}
      </div>`;
    }
    if (tr.length) {
      h += `<div class="logis-k">Transports</div><ul class="trajets">` + tr.slice().sort((a, b) => (a.date + (a.heure || "24:00")).localeCompare(b.date + (b.heure || "24:00"))).map(t => `<li>
        <span class="ticon" aria-hidden="true">${ICON[t.type] || "•"}</span>
        <div><div><b>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.titre)} ↗</a>` : esc(t.titre)}</b></div>
        <div class="muted">${esc(fmtCourt(t.date))}${t.heure ? " à " + esc(t.heure) : ""}${t.fin ? " → " + esc(fmtCourt(t.fin)) : ""}${t.reference ? " · réf. " + esc(t.reference) : ""}</div></div>
      </li>`).join("") + `</ul>`;
    }
    return h + `</div>`;
  }

  /* ---------- GPX ---------- */
  window.GPX = { parse: t => parseGpx(t), stats: t => stats(t) };
  function parseGpx(txt) {
    const xml = new DOMParser().parseFromString(txt, "application/xml");
    let nodes = [...xml.getElementsByTagName("trkpt")];
    if (!nodes.length) nodes = [...xml.getElementsByTagName("rtept")];
    const pts = [];
    let d = 0;
    for (const n of nodes) {
      const lat = +n.getAttribute("lat"), lon = +n.getAttribute("lon");
      const e = n.getElementsByTagName("ele")[0];
      const ele = e ? +e.textContent : null;
      if (pts.length) d += haversine(pts[pts.length - 1], { lat, lon });
      pts.push({ lat, lon, ele, d });
    }
    return pts;
  }
  function haversine(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function stats(t) {
    const hasEle = t.some(p => p.ele != null);
    let dplus = 0, dmoins = 0, ref = null, min = Infinity, max = -Infinity;
    for (const p of t) {
      if (p.ele == null) continue;
      min = Math.min(min, p.ele); max = Math.max(max, p.ele);
      if (ref == null) { ref = p.ele; continue; }
      const diff = p.ele - ref;               // seuil de 3 m pour lisser le bruit GPS
      if (diff > 3) { dplus += diff; ref = p.ele; } else if (diff < -3) { dmoins -= diff; ref = p.ele; }
    }
    return { dist: t[t.length - 1].d, dplus, dmoins, min, max, hasEle };
  }
  function indexAtKm(t, km) {
    let lo = 0, hi = t.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t[m].d < km) lo = m + 1; else hi = m; }
    return lo;
  }

  /* ---------- Carte + profil ---------- */
  function carteEtProfil(c, t, s) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e4572e";
    const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)" });
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "© Esri" });
    const map = L.map("map", { layers: [topo], scrollWheelZoom: true });
    mapInstance = map;
    L.control.layers({ "Topo": topo, "Plan": osm, "Satellite": sat }, null, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    const latlngs = t.map(p => [p.lat, p.lon]);
    L.polyline(latlngs, { color: "#fff", weight: 8, opacity: .8 }).addTo(map);
    const line = L.polyline(latlngs, { color: accent, weight: 4.5 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [20, 20] });

    const pin = (txt, bg) => L.divIcon({ className: "", html: `<div class="pin" style="background:${bg}">${txt}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    const debut = t[0], fin = t[t.length - 1];
    const boucle = haversine(debut, fin) < 0.2;
    L.marker([debut.lat, debut.lon], { icon: pin(boucle ? "⇆" : "D", "#2f9e44"), title: boucle ? "Départ / arrivée" : "Départ" }).addTo(map);
    if (!boucle) L.marker([fin.lat, fin.lon], { icon: pin("A", "#1f2328"), title: "Arrivée" }).addTo(map);

    // Bornes kilométriques
    const pas = s.dist > 60 ? 10 : 5;
    for (let k = pas; k < s.dist; k += pas) {
      const p = t[indexAtKm(t, k)];
      L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<span class="km-label">${k}</span>`, iconSize: null }), interactive: false }).addTo(map);
    }
    // Ravitos
    (c.ravitos || []).forEach((r, i) => {
      const p = t[indexAtKm(t, +r.km)];
      L.marker([p.lat, p.lon], { icon: pin(String(i + 1), "#2e86ab") }).bindPopup(`<b>${esc(r.nom)}</b><br>km ${esc(r.km)} · ${esc(r.type || "")}`).addTo(map);
    });

    const curseur = L.marker([debut.lat, debut.lon], { icon: L.divIcon({ className: "", html: `<div class="cursor-dot"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, zIndexOffset: 10000 });

    let profil = dessinerProfil(c, t, s, accent);
    let to = null;
    onResize = () => { clearTimeout(to); to = setTimeout(() => { profil = dessinerProfil(c, t, s, accent); profil.onMove = montrer; profil.onLeave = cacher; }, 150); };
    function montrer(i, depuisCarte) {
      const p = t[i];
      curseur.setLatLng([p.lat, p.lon]);
      if (!map.hasLayer(curseur)) curseur.addTo(map);
      if (!depuisCarte && !map.getBounds().pad(-0.05).contains([p.lat, p.lon])) map.panTo([p.lat, p.lon], { animate: true });
      profil.curseur(i);
      // pente sur ±100 m
      const a = t[indexAtKm(t, Math.max(0, p.d - 0.1))], b = t[indexAtKm(t, Math.min(s.dist, p.d + 0.1))];
      const pente = (b.d - a.d) > 0 && a.ele != null && b.ele != null ? (b.ele - a.ele) / ((b.d - a.d) * 1000) * 100 : 0;
      let dp = 0, ref = t[0].ele;
      for (let k = 1; k <= i && ref != null; k++) { const df = t[k].ele - ref; if (df > 3) { dp += df; ref = t[k].ele; } else if (df < -3) ref = t[k].ele; }
      document.getElementById("readout").innerHTML =
        `<span>Km <b>${(p.d).toFixed(2).replace(".", ",")}</b></span>` +
        (p.ele != null ? `<span>Altitude <b>${fmtM(p.ele)}</b></span><span>Pente <b>${pente >= 0 ? "+" : ""}${Math.round(pente)} %</b></span><span>D+ cumulé <b>${fmtM(dp)}</b></span>` : "") +
        `<span>Reste <b>${fmtKm(s.dist - p.d)}</b></span>`;
    }
    function cacher() { curseur.remove(); profil.curseur(null); }
    profil.onMove = montrer;
    profil.onLeave = cacher;

    // Survol de la trace sur la carte -> curseur sur le profil
    line.on("mousemove", e => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < t.length; i++) {
        const dd = (t[i].lat - e.latlng.lat) ** 2 + (t[i].lon - e.latlng.lng) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      montrer(best, true);
    });
    line.on("mouseout", cacher);
    setTimeout(() => map.invalidateSize(), 50);
  }

  function dessinerProfil(c, t, s, accent) {
    const svg = document.getElementById("profile");
    const NS = "http://www.w3.org/2000/svg";
    const api = { onMove: null, onLeave: null, curseur: () => {} };
    const W = svg.clientWidth || 800, H = svg.clientHeight || 190;
    const m = { l: 44, r: 10, t: 12, b: 22 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!s.hasEle) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Pas d'altitude dans ce GPX</text>`; }
    const lo = Math.floor((s.min - 30) / 50) * 50, hi = Math.ceil((s.max + 30) / 50) * 50;
    const x = d => m.l + d / s.dist * (W - m.l - m.r);
    const y = e => m.t + (1 - (e - lo) / (hi - lo)) * (H - m.t - m.b);
    let out = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".45"/><stop offset="1" stop-color="${accent}" stop-opacity=".05"/></linearGradient></defs>`;
    if (s.hasEle) {
      // grille
      const stepE = niceStep((hi - lo) / 4);
      for (let e = Math.ceil(lo / stepE) * stepE; e <= hi; e += stepE)
        out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(e)}" y2="${y(e)}" stroke="currentColor" stroke-opacity=".08"/><text x="${m.l - 6}" y="${y(e) + 4}" text-anchor="end">${e}</text>`;
      const stepD = niceStep(s.dist / 8);
      for (let d = 0; d <= s.dist - stepD * 0.6; d += stepD) out += `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`;
      out += `<text x="${W - m.r}" y="${H - 6}" text-anchor="end">km</text>`;
      // ravitos
      (c.ravitos || []).forEach((r, i) => {
        out += `<line x1="${x(+r.km)}" x2="${x(+r.km)}" y1="${m.t}" y2="${H - m.b}" stroke="#2e86ab" stroke-dasharray="3 3" stroke-opacity=".7"/><text x="${x(+r.km) + 3}" y="${m.t + 10}" style="fill:#2e86ab">R${i + 1}</text>`;
      });
      // courbe (sous-échantillonnée)
      const pas = Math.max(1, Math.floor(t.length / (W * 1.5)));
      let path = "";
      for (let i = 0; i < t.length; i += pas) if (t[i].ele != null) path += (path ? "L" : "M") + x(t[i].d).toFixed(1) + "," + y(t[i].ele).toFixed(1);
      const last = t[t.length - 1];
      path += "L" + x(last.d).toFixed(1) + "," + y(last.ele ?? lo).toFixed(1);
      out += `<path d="${path}L${x(s.dist)},${H - m.b}L${m.l},${H - m.b}Z" fill="url(#g)"/><path d="${path}" fill="none" stroke="${accent}" stroke-width="2"/>`;
    }
    out += `<g id="pcur" style="display:none"><line id="pcl" y1="${m.t}" y2="${H - m.b}" stroke="currentColor" stroke-opacity=".6"/><circle id="pcc" r="5" fill="#fff" stroke="${accent}" stroke-width="3"/></g>`;
    out += `<rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent" id="phit"/>`;
    if (s.hasEle) svg.innerHTML = out; else svg.innerHTML += out;

    const g = svg.querySelector("#pcur"), cl = svg.querySelector("#pcl"), cc = svg.querySelector("#pcc");
    api.curseur = i => {
      if (i == null) { g.style.display = "none"; return; }
      const p = t[i];
      g.style.display = "";
      cl.setAttribute("x1", x(p.d)); cl.setAttribute("x2", x(p.d));
      cc.setAttribute("cx", x(p.d)); cc.setAttribute("cy", p.ele != null ? y(p.ele) : H - m.b);
    };
    const hit = svg.querySelector("#phit");
    function evt(e) {
      const r = svg.getBoundingClientRect();
      const cx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width);
      const d = Math.max(0, Math.min(s.dist, (cx - m.l) / (W - m.l - m.r) * s.dist));
      api.onMove && api.onMove(indexAtKm(t, d), false);
    }
    hit.addEventListener("pointermove", evt);
    hit.addEventListener("pointerdown", e => { hit.setPointerCapture(e.pointerId); evt(e); });
    hit.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") api.onLeave && api.onLeave(); });
    return api;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
})();
