# Wheighty

**Ton besoin calorique, ajusté à ton corps.**

Wheighty est une PWA pour smartphone qui estime le besoin énergétique d'un adulte, propose un plan calories + pas, puis affine cette estimation à partir des pesées et des journées notées. Tout fonctionne localement : pas de compte, pas de serveur, pas de cloud.

- Estimation initiale : équations NASEM 2023 choisies par niveau d'activité, métabolisme au repos routé (calorimétrie indirecte valide, ten Haaf pour les profils sportifs, sinon Mifflin-St Jeor), incertitude affichée honnêtement (fourchette à 80 %).
- Démarrage à chaud facultatif : si tu suis déjà tes calories, ton historique récent affine la première estimation (sans jamais prendre l'apport moyen pour le maintien).
- Plan : modèle dynamique du poids de Hall 2011 (pas de règle des 7 700 kcal/kg), vitesse continue en % du poids par semaine bornée par les garde-fous du moteur, macros adaptées à l'objectif et à l'entraînement.
- Manger ↔ Marcher : chaque nombre de pas est résolu par le modèle pour garder la même trajectoire.
- Calibration personnelle : posterior bayésien sur grille, vraisemblance robuste, pondérée par l'adhérence déclarée, avec un plancher d'incertitude de modèle. Le chiffre qui converge est le **maintien apparent** : les calories qui stabilisent ton poids quand tu suis ton plan comme tu le fais d'habitude (ce n'est ni le métabolisme de repos ni une dépense mesurée). Une recalibration est proposée au plus une fois par semaine, et le calcul tourne dans un Web Worker.
- « Pourquoi ce résultat ? » : le chemin de calcul réel de ton plan (métabolisme de repos, activité, estimation théorique, historique, maintien retenu, vitesse demandée et appliquée, garde-fous). Le réglage « Détails scientifiques » y ajoute toutes les valeurs techniques du moteur.

Documentation scientifique : `instruct/`. Décisions d'implémentation et déviations : [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md). La maquette Claude Design d'origine a été retirée du dépôt (historique Git, commit `37fa35d`).

> **Version bêta** (modèle scientifique 1.3.0) : les estimations ne sont pas encore validées sur des données réelles.
>
> Wheighty s'adresse aux adultes de 19 à 65 ans en bonne santé. Ce n'est pas un dispositif médical. Hors cible : grossesse, allaitement, troubles du comportement alimentaire, suivi nutritionnel médical.

## Stack

- Vite 8, React 19, TypeScript strict
- Vitest (tests scientifiques, persistance, politiques statiques)
- vite-plugin-pwa (service worker Workbox, manifest)
- Aucune dépendance runtime réseau : polices Inter et Bricolage Grotesque (titres) et mascottes embarquées

## Installation

Node.js 20.19 ou plus récent.

```bash
npm install
```

## Développement

```bash
npm run dev
```

Ouvre `http://localhost:5173`. Sur desktop, l'app s'affiche dans une colonne mobile centrée. Le service worker n'est actif qu'en build de production.

## Tests et qualité

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

`npm run check` enchaîne les trois. La suite comprend :

- les tests unitaires des équations (Mifflin, ten Haaf, NASEM, TEF, pas, exercice, PAL, macros) ;
- la validation du modèle de Hall contre des trajectoires de référence (`tests/fixtures/hall-reference.json`) ;
- la simulation de récupération de la calibration (126 utilisateurs synthétiques, 28, 42, 84 et 120 jours) et un benchmark distinct avec model mismatch à 42 et 84 jours (dérive, apport caché, biais des pas, eau autocorrélée, épisodes hydriques) ;
- un parcours de convergence de 84 jours à travers le vrai moteur (onboarding, pesées, recalibrations acceptées) et un micro-benchmark du coût de la calibration ;
- le démarrage à chaud et l'onboarding (valeurs affichées contre valeurs stockées) ;
- l'explication du résultat (view-model contre valeurs du moteur, détails scientifiques activés ou non) et la progression vers la première recalibration (cohérente avec la vraie porte) ;
- une matrice de propriétés sur 10 000 profils aléatoires et 12 profils golden ;
- des contrôles statiques : aucun caractère U+2014 dans l'UI, aucun appel réseau, aucune URL distante, frontières UI/science.

Pour régénérer les fixtures de référence Hall (Python 3) :

```bash
python tools/hall-reference/bw_reference.py > tests/fixtures/hall-reference.json
```

Pour régénérer les images web de la mascotte (depuis les sources de `assets/`), puis les icônes PWA :

```bash
node tools/prepare-mascots.mjs
```

```bash
node tools/generate-icons.mjs
```

## Build et preview

```bash
npm run build
```

```bash
npm run preview
```

Le build est entièrement statique (`dist/`). Les chemins sont relatifs (`base: './'`) : le même build fonctionne à la racine d'un domaine ou sous un sous-chemin.

## Déploiement GitHub Pages

1. Pousser le dépôt sur GitHub, branche `main` (branche locale renommée `main`).
2. Dans *Settings > Pages*, choisir la source **GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` installe les dépendances, vérifie les types, lance le lint et les tests, construit, puis publie `dist/` sur `https://<user>.github.io/<repo>/`.

Aucune configuration de chemin n'est nécessaire. Pour forcer un base absolu, définir `WHEIGHTY_BASE=/mon-repo/` au moment du build. L'app n'a pas de routes profondes : pas besoin de `404.html`.

Après un premier chargement complet, l'app, le moteur de calcul, la police et les mascottes fonctionnent hors ligne. Une nouvelle version déployée est proposée dans l'app (« Mettre à jour »).

## Persistance locale

- Un seul objet versionné dans `localStorage`, sous la clé `wheighty:store` : profil (prénom et nom facultatifs compris), plan courant, pesées brutes, journées (cibles historiques, adhérence, pas), snapshots de calibration, historique calorique déclaré à l'onboarding, préférences, `schemaVersion`, `scientificModelVersion`.
- Chaque écriture sérialise l'objet complet après validation.
- Données illisibles au démarrage : le texte brut est d'abord copié sous `wheighty:recovery:<date>`, jamais effacé silencieusement. Les enregistrements valides sont récupérés.
- Migrations de schéma dans `src/persistence/migrations.ts`.
- **Mes données** : export JSON, import JSON validé (tout ou rien, avec proposition d'export préalable), suppression totale avec confirmation.

Aucune donnée personnelle ne quitte l'appareil : pas de télémétrie, pas d'analytics, aucun appel réseau applicatif.

## Architecture

```text
src/science      Moteur scientifique pur, typé, testé (aucune dépendance UI)
src/domain       Cas d'usage : onboarding, logs, slider, calibration, view-models
src/persistence  Stockage versionné, migrations, import/export
src/store        Provider React, calibration dans un Web Worker
src/screens      Écrans et bottom sheets
src/components   Contrôles accessibles, graphique SVG, mascotte
```

Les composants React n'effectuent aucun calcul scientifique : ils affichent des résultats typés produits par `src/domain`.

## Limites du produit

- Toutes les estimations restent des estimations : la fourchette affichée est une vraie sortie du modèle d'incertitude, pas une garantie.
- La calibration estime un maintien apparent : un écart non noté fait baisser le maintien affiché (le plan reste cohérent avec ce que tu fais réellement, mais le chiffre ne décrit plus ta physiologie).
- Aucune validation sur données humaines réelles : les benchmarks utilisent le même modèle de Hall que le moteur, et la bêta ne collecte aucune donnée.
- Plancher calorique : 1 200 kcal/j pour les femmes, 1 500 kcal/j pour les hommes, et jamais sous 0,7 × métabolisme de repos.
- Troubles du comportement alimentaire : exclusion déclarative seulement (pas de dépistage).
- Le modèle de Hall est validé contre une implémentation indépendante (`bw`, MIT), pas contre l'outil officiel du NIDDK.
- Pas de synchronisation entre appareils : l'export JSON sert de sauvegarde.
- Le rappel de pesée est affiché dans l'app, sans notification système.
- Pas d'intégration Apple Santé, Google Health Connect ou Garmin : les pas se saisissent à la main.
- Voir [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md) pour les hypothèses d'ingénierie et les points à valider scientifiquement.
