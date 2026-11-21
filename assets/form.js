/* Formulaire d'ajout / modification d'une course. */
(function () {
  "use strict";
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function slug(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "course"; }

  const SPORTS = ["Trail", "Course sur route", "Triathlon", "XTri", "Swimrun", "Cyclisme", "VTT", "Ski de rando", "Natation"];

  // Listes de lignes répétables : [clé, titre, colonnes [clé, libellé, type, options]]
  const LISTES = [
    ["liens", "Liens", [["titre", "Titre", "text"], ["url", "Adresse (https://…)", "url"]]],
    ["ravitos", "Ravitaillements", [["km", "Km", "number"], ["nom", "Nom", "text"], ["type", "Type (liquide, complet…)", "text"]]],
    ["barrieres", "Barrières horaires", [["km", "Km", "number"], ["lieu", "Lieu", "text"], ["heure", "Heure", "time"]]],
    ["logement", "Logement", [["nom", "Nom", "text"], ["url", "Lien de réservation", "url"], ["adresse", "Adresse", "text"], ["arrivee", "Arrivée", "date"], ["depart", "Départ", "date"], ["reference", "Référence", "text"]]],
    ["transports", "Transports", [["type", "Type", "select", ["vol", "voiture", "train", "bus", "ferry"]], ["titre", "Trajet (ex. Lyon → Porto)", "text"], ["date", "Date", "date"], ["heure", "Heure", "time"], ["fin", "Jusqu'au (location)", "date"], ["reference", "Référence", "text"], ["url", "Lien", "url"]]]
  ];

  const AJOUT = { liens: "un lien", ravitos: "un ravitaillement", barrieres: "une barrière horaire", logement: "un logement", transports: "un trajet" };

  function champ(nom, col, val) {
    const [k, lib, type, opts] = col;
    const v = val?.[k] ?? "";
    const input = type === "select"
      ? `<select data-k="${k}">${opts.map(o => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`
      : `<input data-k="${k}" type="${type}" ${type === "number" ? 'step="any" inputmode="decimal"' : ""} value="${esc(v)}">`;
    return `<label class="f-mini"><span>${lib}</span>${input}</label>`;
  }
  function ligne(nom, cols, val) {
    return `<div class="f-row" data-liste="${nom}">${cols.map(c => champ(nom, c, val)).join("")}<button type="button" class="f-del" aria-label="Retirer cette ligne">×</button></div>`;
  }

  const BOOKMARKLET = `javascript:(()=>{const c={url:location.href,texte:document.body.innerText.slice(0,150000),liens:[...document.links].map(a=>(a.innerText||'').trim().slice(0,80)+' -> '+a.href).concat([...document.querySelectorAll('iframe')].map(f=>'(carte intégrée) -> '+f.src)).slice(0,500)};const o='https://ap-physio.github.io';const w=window.open(o+'/Calendrier-sportif/#/ajouter','_blank');let n=0,ok=false;addEventListener('message',e=>{if(e.origin===o&&e.data&&e.data.type==='calendrier-import-ok')ok=true});const t=setInterval(()=>{if(ok||++n>60)return clearInterval(t);try{w.postMessage({type:'calendrier-import',course:c},o)}catch(e){}},500)})()`;

  function render(app, c, DATA, onSaved, dateInitiale) {
    const nouveau = !c;
    c = c || { coureurs: window.DB?.moi ? [window.DB.moi.coureur] : [], statut: "envisagé", date: dateInitiale };
    const coureurs = Object.entries(DATA.coureurs);
    let html = `<a class="back" href="#/">← Toutes les courses</a>
      <h1>${nouveau ? "Ajouter une course" : "Modifier : " + esc(c.nom)}</h1>
      <form id="fcourse" class="form" novalidate>
        <fieldset class="auto"><legend>Remplir depuis le site de la course</legend>
          <label class="f-full"><span>Lien de la page de la course</span><input id="a-url" type="url" inputmode="url" placeholder="https://…"></label>
          <label><span>Épreuve (si plusieurs, ex. « 35 km »)</span><input id="a-epreuve"></label>
          <div class="auto-go"><button class="btn" type="button" id="a-go">Remplir automatiquement</button></div>
          <details class="f-full auto-plus" id="a-plus">
            <summary>Le site refuse ? Colle le texte de la page ou ajoute un PDF / une capture</summary>
            <label class="f-full"><span>Texte de la page (sélectionne tout sur le site, copie, colle ici)</span><textarea id="a-texte" rows="5"></textarea></label>
            <label class="f-full"><span>Ou un fichier : PDF du règlement, capture d'écran…</span><input id="a-fichier" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"></label>
            <div class="f-full bm-box">
              <p><b>Le plus simple sur Mac :</b> glisse ce bouton dans ta barre de favoris (une seule fois).</p>
              <p><a class="btn ghost bookmarklet" href="${BOOKMARKLET}" onclick="event.preventDefault()">📥 Envoyer au calendrier</a></p>
              <p class="muted">Ensuite, sur la page de n'importe quelle course, clique sur ce favori : le calendrier s'ouvre et se remplit avec ce que tu vois à l'écran, même si le site bloque les robots.</p>
            </div>
          </details>
          <p class="f-full auto-msg" id="a-msg" role="status" hidden></p>
        </fieldset>
        <fieldset><legend>L'essentiel</legend>
          <label class="f-full"><span>Nom de la course *</span><input id="f-nom" required value="${esc(c.nom)}"></label>
          <label><span>Date *</span><input id="f-date" type="date" required value="${esc(c.date)}"></label>
          <label><span>Heure de départ</span><input id="f-heure" type="time" value="${esc(c.heure_depart)}"></label>
          <div class="f-full"><span class="f-lab">Qui court ? *</span><div class="f-checks">
            ${coureurs.map(([id, r]) => `<label class="f-check"><input type="checkbox" name="coureurs" value="${esc(id)}" ${(c.coureurs || []).includes(id) ? "checked" : ""}><span class="tag runner" style="background:${esc(r.couleur)}">${esc(r.initiale)}</span>${esc(r.nom)}</label>`).join("")}
          </div></div>
          <label><span>Sport</span><input id="f-sport" list="sports" value="${esc(c.sport || c.format)}"><datalist id="sports">${SPORTS.map(s => `<option value="${s}">`).join("")}</datalist></label>
          <label><span>Statut</span><select id="f-statut">${["envisagé", "inscrit"].map(s => `<option ${s === c.statut ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label><span>Lieu</span><input id="f-lieu" value="${esc(c.lieu)}"></label>
          <label><span>Pays</span><input id="f-pays" value="${esc(c.pays)}"></label>
          <label><span>Distance (km)</span><input id="f-dist" type="number" step="any" inputmode="decimal" value="${esc(c.distance_km)}" placeholder="calculée depuis le GPX"></label>
          <label><span>Dénivelé + (m)</span><input id="f-dp" type="number" step="any" inputmode="numeric" value="${esc(c.denivele_pos)}" placeholder="calculé depuis le GPX"></label>
          <label class="f-full"><span>Trace GPX ${c.gpx ? "(un GPX est déjà enregistré : en choisir un autre le remplace)" : ""}</span><input id="f-gpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml"></label>
          <p class="f-full gpx-note" id="f-gpx-note" hidden></p>
        </fieldset>
        <fieldset><legend>Infos pratiques</legend>
          <label class="f-full"><span>Accès</span><textarea id="f-acces" rows="2">${esc(c.acces)}</textarea></label>
          <label class="f-full"><span>Retrait des dossards</span><input id="f-dossard" value="${esc(c.retrait_dossard)}"></label>
          <label class="f-full"><span>Matériel obligatoire (un par ligne)</span><textarea id="f-mat" rows="4">${esc((c.materiel || []).join("\n"))}</textarea></label>
          <label class="f-full"><span>Notes</span><textarea id="f-notes" rows="3">${esc(c.notes)}</textarea></label>
        </fieldset>`;
    for (const [nom, titre, cols] of LISTES) {
      html += `<fieldset class="f-liste" data-nom="${nom}"><legend>${titre}</legend>
        <div class="f-rows">${(c[nom] || []).map(v => ligne(nom, cols, v)).join("")}</div>
        <button type="button" class="btn ghost f-add" data-nom="${nom}">+ Ajouter ${AJOUT[nom]}</button>
      </fieldset>`;
    }
    html += `<p class="f-err" id="f-err" role="alert" hidden></p>
        <div class="actions f-actions">
          <button class="btn" type="submit" id="f-save">${nouveau ? "Ajouter la course" : "Enregistrer"}</button>
          <a class="btn ghost" href="${nouveau ? "#/" : "#/course/" + encodeURIComponent(c.id)}">Annuler</a>
        </div>
      </form>`;
    app.innerHTML = html;
    window.scrollTo(0, 0);

    const form = app.querySelector("#fcourse");
    app.querySelector("#a-go").onclick = () => remplirAuto(form);
    // Page envoyée par le bouton « Envoyer au calendrier » : on remplit tout de suite
    const imp = nouveau && window.__importCourse;
    if (imp) {
      window.__importCourse = null;
      form.querySelector("#a-url").value = imp.url;
      form.querySelector("#a-texte").value = imp.texte;
      form._liens = imp.liens;
      remplirAuto(form);
    }
    // Les dates des trajets / logement s'ouvrent sur la date de la course plutôt que sur aujourd'hui
    // Distance et D+ calculés depuis le GPX dès qu'un fichier est choisi (prioritaires sur la page)
    form.querySelector("#f-gpx").addEventListener("change", e => { const f = e.target.files[0]; if (f) f.text().then(t => depuisGpx(form, t)); });

    const caleSurCourse = e => {
      const el = e.target;
      if (!el.matches || !el.matches('.f-row input[type="date"]') || el.value) return;
      const ref = form.querySelector("#f-date").value;
      if (ref) el.value = ref;
    };
    form.addEventListener("pointerdown", caleSurCourse, true);
    form.addEventListener("focusin", caleSurCourse);
    form.addEventListener("click", e => {
      const add = e.target.closest(".f-add");
      if (add) {
        const def = LISTES.find(l => l[0] === add.dataset.nom);
        const box = form.querySelector(`.f-liste[data-nom="${def[0]}"] .f-rows`);
        box.insertAdjacentHTML("beforeend", ligne(def[0], def[2], null));
        box.lastElementChild.querySelector("input,select").focus();
      }
      const del = e.target.closest(".f-del");
      if (del) del.closest(".f-row").remove();
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const err = form.querySelector("#f-err");
      const val = id => form.querySelector(id).value.trim();
      const num = id => { const v = val(id).replace(",", "."); return v === "" ? undefined : Number(v); };
      const qui = [...form.querySelectorAll('input[name="coureurs"]:checked')].map(i => i.value);
      const manque = [];
      if (!val("#f-nom")) manque.push("le nom");
      if (!val("#f-date")) manque.push("la date");
      if (!qui.length) manque.push("qui court");
      if (manque.length) { err.textContent = "Il manque " + manque.join(", ") + "."; err.hidden = false; return; }

      const d = {
        nom: val("#f-nom"), date: val("#f-date"), heure_depart: val("#f-heure") || undefined,
        coureurs: qui, sport: val("#f-sport") || undefined, statut: val("#f-statut"),
        lieu: val("#f-lieu") || undefined, pays: val("#f-pays") || undefined,
        distance_km: num("#f-dist"), denivele_pos: num("#f-dp"),
        gpx: c.gpx || undefined,
        documents: c.documents || undefined,
        acces: val("#f-acces") || undefined, retrait_dossard: val("#f-dossard") || undefined,
        materiel: val("#f-mat").split("\n").map(s => s.trim()).filter(Boolean),
        notes: val("#f-notes") || undefined
      };
      for (const [nom, , cols] of LISTES) {
        d[nom] = [...form.querySelectorAll(`.f-row[data-liste="${nom}"]`)].map(r => {
          const o = {};
          cols.forEach(([k, , type]) => {
            const v = r.querySelector(`[data-k="${k}"]`).value.trim();
            if (v !== "") o[k] = type === "number" ? Number(v.replace(",", ".")) : v;
          });
          return o;
        }).filter(o => Object.keys(o).some(k => k !== "type"));
      }
      Object.keys(d).forEach(k => { if (d[k] === undefined || (Array.isArray(d[k]) && !d[k].length)) delete d[k]; });

      const fichier = form.querySelector("#f-gpx").files[0] || null;
      const id = nouveau ? `${slug(d.nom)}-${d.date.slice(0, 4)}` : c.id;
      const bouton = form.querySelector("#f-save");
      bouton.disabled = true; bouton.textContent = "Enregistrement…"; err.hidden = true;
      try {
        await window.DB.enregistrer(id, d, fichier, nouveau);
        onSaved(id);
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        bouton.disabled = false; bouton.textContent = nouveau ? "Ajouter la course" : "Enregistrer";
      }
    });
  }

  // « 7h », « 7h30 », « 07:30:00 », « 7.30 » → « 07:30 » (format du champ heure)
  function heureNorm(v) {
    const m = String(v || "").match(/(\d{1,2})\s*(?:h|:|\.)?\s*(\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i);
    if (!m) return "";
    let h = +m[1];
    if (m[3] && /p/i.test(m[3]) && h < 12) h += 12;
    if (m[3] && /a/i.test(m[3]) && h === 12) h = 0;
    if (h > 23) return "";
    return String(h).padStart(2, "0") + ":" + (m[2] || "00");
  }

  function depuisGpx(form, texte) {
    const note = form.querySelector("#f-gpx-note");
    try {
      const t = window.GPX.parse(texte);
      if (t.length < 2) throw new Error("trace vide");
      const s = window.GPX.stats(t);
      form.querySelector("#f-dist").value = Math.round(s.dist * 10) / 10;
      if (s.hasEle) form.querySelector("#f-dp").value = Math.round(s.dplus);
      note.textContent = `Calculé depuis le GPX : ${String(Math.round(s.dist * 10) / 10).replace(".", ",")} km${s.hasEle ? ` et ${Math.round(s.dplus)} m D+` : " (pas d'altitude dans ce GPX)"}.`;
      note.hidden = false;
    } catch (e) {
      note.textContent = "Ce fichier GPX n'a pas pu être lu."; note.hidden = false;
    }
  }

  async function remplirAuto(form) {
    const msg = form.querySelector("#a-msg"), go = form.querySelector("#a-go");
    const url = form.querySelector("#a-url").value.trim();
    const texte = form.querySelector("#a-texte").value.trim();
    const f = form.querySelector("#a-fichier").files[0];
    const erreur = t => { msg.textContent = t; msg.className = "f-full auto-msg ko"; msg.hidden = false; };
    if (url && !/^https?:\/\//.test(url)) return erreur("L'adresse doit commencer par https://");
    if (!url && !texte && !f) return erreur("Colle d'abord l'adresse complète de la page (https://…), ou le texte de la page, ou ajoute un fichier.");
    if (f && f.size > 8_000_000) return erreur("Fichier trop gros (8 Mo maximum).");
    go.disabled = true; go.textContent = "Lecture de la page… (20 à 90 s)";
    msg.hidden = true;
    try {
      let fichier = null;
      if (f) {
        const data = await new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.onerror = ko; fr.readAsDataURL(f); });
        fichier = { type: f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : ""), data };
      }
      const r = await window.DB.lireCourse(url, form.querySelector("#a-epreuve").value.trim(), { texte, fichier, liens: form._liens || [] });
      const c = r.course || {}, remplis = [];
      const met = (id, v, nom) => {
        const el = form.querySelector(id);
        if (v == null || v === "" || el.value.trim()) return;
        if (el.type === "time") v = heureNorm(v);
        el.value = v;
        if (el.value) remplis.push(nom); // une valeur refusée par le champ n'est pas annoncée comme remplie
      };
      met("#f-nom", c.nom, "nom"); met("#f-date", c.date, "date"); met("#f-heure", c.heure_depart, "heure");
      met("#f-sport", c.sport, "sport"); met("#f-lieu", c.lieu, "lieu"); met("#f-pays", c.pays, "pays");
      met("#f-dist", c.distance_km, "distance"); met("#f-dp", c.denivele_pos, "D+");
      met("#f-acces", c.acces, "accès"); met("#f-dossard", c.retrait_dossard, "dossards");
      met("#f-mat", (c.materiel || []).join("\n"), "matériel"); met("#f-notes", c.notes, "notes");
      const liens = (url ? [{ titre: "Site de la course", url }] : []).concat((c.liens || []).filter(l => l.url !== url));
      const listes = { liens, ravitos: c.ravitos || [], barrieres: (c.barrieres || []).map(b => Object.assign({}, b, { heure: heureNorm(b.heure) })) };
      for (const [nom, vals] of Object.entries(listes)) {
        const box = form.querySelector(`.f-liste[data-nom="${nom}"] .f-rows`);
        if (!vals.length || box.children.length) continue;
        const def = LISTES.find(l => l[0] === nom);
        box.innerHTML = vals.slice(0, 30).map(v => ligne(nom, def[2], v)).join("");
        remplis.push(nom === "liens" ? "liens" : nom === "ravitos" ? "ravitos" : "barrières");
      }
      if (r.gpx) {
        const input = form.querySelector("#f-gpx");
        if (!input.files.length) {
          try {
            const dt = new DataTransfer();
            dt.items.add(new File([r.gpx], r.gpx_nom || "trace.gpx", { type: "application/gpx+xml" }));
            input.files = dt.files; remplis.push("GPX");
            depuisGpx(form, r.gpx);
          } catch (e) {}
        }
      }
      let t = remplis.length ? `Rempli : ${remplis.join(", ")}. Vérifie avant d'enregistrer.` : "Rien de nouveau trouvé sur cette page (les champs déjà remplis ne sont pas modifiés).";
      if (r.source) t += ` (Lu via : ${r.source}.)`;
      if (c.epreuve_choisie && (c.autres_epreuves || []).length) t += ` Épreuve retenue : ${c.epreuve_choisie}. Autres épreuves : ${c.autres_epreuves.join(", ")}. Pour une autre, indique-la dans « Épreuve » et relance après avoir vidé les champs.`;
      if (r.avertissement) t += " " + r.avertissement;
      if (r.tronque) t += " (Page très longue : seule la première partie a été lue.)";
      msg.textContent = t; msg.className = "f-full auto-msg ok";
    } catch (e) {
      msg.textContent = e.message; msg.className = "f-full auto-msg ko";
      if (/refuse|Impossible de lire/.test(e.message)) form.querySelector("#a-plus").open = true;
    }
    msg.hidden = false; go.disabled = false; go.textContent = "Remplir automatiquement";
  }

  window.Formulaire = { render };
})();
