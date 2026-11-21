# Calendrier des courses 2027

Site statique (HTML + JS, aucune installation) : calendrier des courses, fiche par course,
téléchargement du GPX, carte + profil altimétrique interactif.

## Ajouter une course

1. Déposer la trace dans `gpx/` (ex. `gpx/ut4m-2027.gpx`).
2. Ajouter un bloc dans `data/courses.json`, dans la liste `courses` :

```json
{
  "id": "ut4m-2027",
  "nom": "UT4M 40 Xtrem",
  "coureurs": ["aurele"],
  "statut": "inscrit",
  "date": "2027-07-17",
  "heure_depart": "06:00",
  "lieu": "Grenoble",
  "pays": "France",
  "sport": "Trail",
  "distance_km": 40,
  "denivele_pos": 2800,
  "gpx": "gpx/ut4m-2027.gpx",
  "liens": [{ "titre": "Site officiel", "url": "https://..." }],
  "acces": "...",
  "logement": [{ "nom": "Gîte ...", "url": "https://...", "adresse": "...", "arrivee": "2027-07-16", "depart": "2027-07-18", "reference": "..." }],
  "transports": [
    { "type": "vol", "titre": "Aller Lyon → Porto", "date": "2027-07-15", "heure": "09:40", "reference": "ABC123", "url": "https://..." },
    { "type": "voiture", "titre": "Location voiture", "date": "2027-07-15", "fin": "2027-07-18", "reference": "..." }
  ],
  "retrait_dossard": "...",
  "ravitos": [{ "km": 12, "nom": "Col de ...", "type": "complet" }],
  "barrieres": [{ "km": 25, "lieu": "...", "heure": "13:00" }],
  "materiel": ["Réserve d'eau 1 L", "Couverture de survie"],
  "notes": "..."
}
```

`type` de transport : `vol`, `voiture`, `train`, `bus` ou `ferry`. `statut` : `inscrit` ou `envisagé`.

Seuls `id`, `nom`, `coureurs` et `date` sont obligatoires. Sans `distance_km` / `denivele_pos`,
le site les calcule depuis le GPX. Sans `gpx`, la fiche s'affiche sans carte.

Le plus simple : envoyer à Claude le GPX + la page de la course, il remplit la fiche.

## Coureurs

En haut de `data/courses.json`, `coureurs` liste les personnes (identifiant, nom, initiale, couleur) :
`aurele` (A) et `candice` (C). Une course à deux : `"coureurs": ["aurele", "candice"]`.

## Tester en local

`python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000
(ouvrir `index.html` directement ne marche pas : le navigateur bloque la lecture des fichiers).
