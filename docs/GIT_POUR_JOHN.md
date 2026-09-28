# Git pour John : la page à garder sous la main

## Le modèle, en trois phrases

1. **`main`, c'est ce qui est en ligne.** Chaque envoi sur `main` relance les tests sur GitHub puis met le site à jour (https://johnathank78.github.io/Weighty/).
2. **Une branche par tâche.** On ne travaille jamais directement sur `main` : on crée une branche (une copie de travail nommée), on y fait la tâche, on enregistre.
3. **On fusionne quand les tests sont verts.** Fusionner, c'est recopier le travail d'une branche dans `main`. On le fait seulement quand `npm run check` passe.

La branche **`bench/journal-battery`** est à part : c'est l'archive des mesures scientifiques. On peut la consulter, on ne la fusionne **jamais** dans `main`.

## Les 8 commandes utiles

| Je veux… | Commande | Exemple |
|---|---|---|
| Voir où j'en suis | `git status` | Affiche la branche courante et les fichiers modifiés. À lancer avant tout le reste. |
| Revenir sur `main` | `git switch main` | Avant de commencer une nouvelle tâche. |
| Récupérer les changements de GitHub | `git pull` | Sur `main`, avant de commencer une tâche. |
| Commencer une tâche | `git switch -c tache/<nom>` | `git switch -c tache/ecran-reglages` |
| Enregistrer mon travail | `git add <fichiers>` puis `git commit -m "<message>"` | `git add src/screens/Settings.tsx` puis `git commit -m "Réglages : nouveau bouton export"` |
| Envoyer ma branche sur GitHub | `git push -u origin <branche>` | `git push -u origin tache/ecran-reglages` (ensuite, `git push` suffit) |
| Vérifier que tout est vert | `npm run check` | Types, lint et tests (environ 40 secondes). Puis `npm run build`. |
| Fusionner une tâche terminée | `git switch main`, `git pull`, `git merge tache/<nom>`, `npm run check`, `git push` | Le `git push` final met le site à jour. |

Astuce : pour `git add`, nomme les fichiers un par un. Lance `git status` avant et après pour voir ce qui part.

## Ce qu'il ne faut jamais faire

- **Fusionner `bench/journal-battery` dans `main`.** Elle contient des centaines de mégaoctets de résultats bruts et du code de mesure.
- **Enregistrer des bruts ou des zips** (`*.csv.gz`, `*.zip`, le dossier `tests/experiments-journal/results/`). Le `.gitignore` les bloque sur `main` : ne force pas avec `git add -f`.
- **`git push --force`** (ou `-f`). Cela écrase ce qui est sur GitHub.
- **`git add .`** sans avoir lu `git status` juste avant. Ton dossier `prompt/` et tes zips sont ignorés, mais vérifie quand même.
- **Mettre des choses privées dans le dépôt.** Le dépôt est **public** : tout ce qui est envoyé sur GitHub est visible par tous.

## En cas de doute

Ne lance rien. Copie le résultat de `git status` et demande. Rien n'est perdu tant qu'on n'a rien lancé.

Si quelque chose a mal tourné, la sauvegarde complète du 28/09/2026 est dans
`C:\Users\John\Desktop\win_res\app\wheighty-sauvegarde-2026-09-28.bundle` (tout l'historique) et
`C:\Users\John\Desktop\win_res\app\wheighty-sauvegarde-2026-09-28-fichiers\` (les fichiers hors git).
