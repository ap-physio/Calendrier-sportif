/* Accès aux données : Supabase (comptes, courses, historique, GPX) avec copie locale pour le hors-ligne. */
(function () {
  "use strict";
  const C = window.CONFIG || {};
  const actif = !!(C.supabaseUrl && C.supabaseKey && window.supabase);
  const sb = actif ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

  function lget(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  const DB = {
    actif,
    moi: null,          // { email, coureur, nom }

    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuth(cb) { sb.auth.onAuthStateChange((evt, session) => cb(evt, session)); },

    async connexion(email, mdp) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: mdp });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : error.message);
    },
    async deconnexion() { await sb.auth.signOut(); try { localStorage.removeItem("cache:courses"); } catch (e) {} },
    async motDePasseOublie(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(error.message);
    },
    async nouveauMotDePasse(mdp) {
      const { error } = await sb.auth.updateUser({ password: mdp });
      if (error) throw new Error(error.message);
    },

    async charger() {
      try {
        const session = await DB.session();
        const email = session?.user?.email || "";
        const [m, c] = await Promise.all([
          sb.from("membres").select("email, coureur, nom"),
          sb.from("courses").select("*")
        ]);
        if (m.error) throw m.error;
        if (c.error) throw c.error;
        const membres = m.data || [];
        DB.moi = membres.find(x => x.email.toLowerCase() === email.toLowerCase()) || null;
        const noms = {};
        membres.forEach(x => { noms[x.coureur] = x.nom; });
        const donnees = {
          annee: C.annee,
          coureurs: C.coureurs,
          noms,
          annee_docs: (() => {
            const r = (c.data || []).find(r => r.id === "_annee-" + C.annee);
            return r ? Object.assign({}, r.data, { id: r.id, _existe: true }) : { id: "_annee-" + C.annee, documents: [] };
          })(),
          courses: (c.data || []).filter(r => !r.id.startsWith("_")).map(r => Object.assign({}, r.data, {
            id: r.id,
            _meta: { cree_par: r.cree_par, cree_le: r.cree_le, modifie_par: r.modifie_par, modifie_le: r.modifie_le }
          }))
        };
        lset("cache:courses", { moi: DB.moi, donnees });
        return donnees;
      } catch (e) {
        const cache = lget("cache:courses");
        if (cache) { DB.moi = cache.moi; cache.donnees.horsLigne = true; return cache.donnees; }
        throw e;
      }
    },

    async gpx(chemin) {
      const k = "cache:gpx:" + chemin;
      try {
        const { data, error } = await sb.storage.from("gpx").download(chemin);
        if (error) throw error;
        const txt = await data.text();
        try { localStorage.setItem(k, txt); } catch (e) {}
        return txt;
      } catch (e) {
        try { const t = localStorage.getItem(k); if (t) return t; } catch (e2) {}
        throw e;
      }
    },

    async enregistrer(id, data, fichierGpx, nouveau, fichiersSeg) {
      for (const seg of data.segments || []) {
        const f = fichiersSeg && fichiersSeg[seg.sport];
        if (!f) continue;
        const chemin = `${id}-${seg.sport}.gpx`;
        const { error } = await sb.storage.from("gpx").upload(chemin, f, { upsert: true, contentType: "application/gpx+xml" });
        if (error) throw new Error("Envoi du GPX " + seg.sport + " impossible : " + error.message);
        seg.gpx = chemin;
        try { localStorage.removeItem("cache:gpx:" + chemin); } catch (e) {}
      }
      if (fichierGpx) {
        const chemin = `${id}.gpx`;
        const { error } = await sb.storage.from("gpx").upload(chemin, fichierGpx, { upsert: true, contentType: "application/gpx+xml" });
        if (error) throw new Error("Envoi du GPX impossible : " + error.message);
        data.gpx = chemin;
        try { localStorage.removeItem("cache:gpx:" + chemin); } catch (e) {}
      }
      const req = nouveau ? sb.from("courses").insert({ id, data }) : sb.from("courses").update({ data }).eq("id", id);
      const { error } = await req;
      if (error) throw new Error(error.code === "23505" ? "Une course avec ce nom et cette date existe déjà." : error.message);
    },

    async supprimer(c) {
      const { error } = await sb.from("courses").delete().eq("id", c.id);
      if (error) throw new Error(error.message);
      if (c.gpx) await sb.storage.from("gpx").remove([c.gpx]);
      const docs = (c.documents || []).map(d => d.chemin);
      if (docs.length) await sb.storage.from("documents").remove(docs);
    },

    // Documents joints (assurance, billets…) : fichier dans le stockage privé + liste dans la fiche
    async ajouterDocument(c, fichier, extra) {
      const propre = fichier.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
      const chemin = `${c.id}/${Date.now()}-${propre}`;
      const up = await sb.storage.from("documents").upload(chemin, fichier, { contentType: fichier.type || "application/octet-stream" });
      if (up.error) throw new Error("Envoi impossible : " + up.error.message);
      const data = DB.donnees(c);
      data.documents = (data.documents || []).concat([Object.assign({ nom: fichier.name, chemin, type: fichier.type || "", taille: fichier.size, par: DB.moi?.coureur, le: new Date().toISOString() }, extra || {})]);
      const { error } = c.id.startsWith("_") && !c._existe
        ? await sb.from("courses").upsert({ id: c.id, data })
        : await sb.from("courses").update({ data }).eq("id", c.id);
      if (error) { await sb.storage.from("documents").remove([chemin]); throw new Error(error.message); }
    },
    async supprimerDocument(c, chemin) {
      const data = DB.donnees(c);
      data.documents = (data.documents || []).filter(d => d.chemin !== chemin);
      const { error } = await sb.from("courses").update({ data }).eq("id", c.id);
      if (error) throw new Error(error.message);
      await sb.storage.from("documents").remove([chemin]);
    },
    async lienDocument(chemin, nom) {
      const { data, error } = await sb.storage.from("documents").createSignedUrl(chemin, 300, { download: nom || true });
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    donnees(c) { const d = Object.assign({}, c); delete d.id; delete d._meta; delete d._existe; return d; },

    // Lecture automatique de la page d'une course (fonction Supabase « lire-course » + Claude)
    async lireCourse(url, epreuve, extra) {
      let data, error;
      for (const nom of (C.fonctionsLecture || ["lire-course"])) {
        ({ data, error } = await sb.functions.invoke(nom, { body: Object.assign({ url, epreuve }, extra || {}) }));
        if (!(error && error.context?.status === 404)) break; // fonction absente sous ce nom : essayer le suivant
      }
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j?.erreur) msg = j.erreur; } catch (e) {}
        if (/Failed to send|not found|404/i.test(msg)) msg = "La lecture automatique n'est pas encore installée dans Supabase.";
        throw new Error(msg);
      }
      return data;
    },

    async historique(id) {
      const { data, error } = await sb.from("historique").select("action, par, le").eq("course_id", id).order("le", { ascending: false }).limit(30);
      if (error) throw error;
      return data || [];
    }
  };
  window.DB = DB;
})();
