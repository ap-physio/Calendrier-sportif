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

  function render(app, c, DATA, onSaved, onCancel) {
    const nouveau = !c;
    c = c || { coureurs: window.DB?.moi ? [window.DB.moi.coureur] : [], statut: "envisagé" };
    const coureurs = Object.entries(DATA.coureurs);
    let html = `<a class="back" href="#/">← Toutes les courses</a>
      <h1>${nouveau ? "Ajouter une course" : "Modifier : " + esc(c.nom)}</h1>
      <form id="fcourse" class="form" novalidate>
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

  window.Formulaire = { render };
})();
