/* Réglages du site. La clé "publishable" est faite pour être publique : l'accès aux données
   est protégé côté Supabase (seuls les deux comptes membres peuvent lire ou écrire). */
window.CONFIG = {
  annee: 2027,
  supabaseUrl: "https://rmbzavarnfznxrkzdkol.supabase.co",
  // Nom(s) de la fonction Supabase qui lit la page d'une course (Supabase a nommé la première « dynamic-action »)
  fonctionsLecture: ["dynamic-action", "lire-course"],
  supabaseKey: "sb_publishable_r5eSB1HoldqNse7c-rN6bg_N1v62GbT",
  coureurs: {
    aurele: { nom: "Aurèle", initiale: "A", couleur: "#e4572e" },
    candice: { nom: "Candice", initiale: "C", couleur: "#2e86ab" }
  }
};
