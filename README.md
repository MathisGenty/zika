# Zìkǎ 字卡

Mon app de flashcards pour apprendre le chinois : répétition espacée, tons en couleur, audio, import de listes.
Elle fonctionne dans le navigateur, s'installe sur l'écran d'accueil du téléphone et marche hors connexion.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La structure de la page |
| `style.css` | L'apparence : couleurs (en haut du fichier), polices, mise en page |
| `app.js` | Toute la logique : cartes, révision, import, réglages |
| `manifest.webmanifest` | Nom et icône quand on installe l'app sur un téléphone |
| `sw.js` | Le mode hors connexion |
| `icons/` | Les icônes |

## Mise en ligne avec GitHub Pages (une seule fois)

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Clique sur **New repository**. Nom : `zika`. Visibilité : **Public**, car Pages est gratuit pour les dépôts publics. Ne coche rien d'autre, puis clique sur **Create repository**.
3. Sur la page du dépôt vide, clique sur **uploading an existing file**. Glisse-dépose **tout le contenu** du dossier, c'est-à-dire les fichiers et le dossier `icons`, pas le dossier `zika` lui-même. Clique ensuite sur **Commit changes**.
4. Va dans **Settings → Pages**. Sous *Build and deployment*, choisis **Deploy from a branch**, puis la branche **main**, le dossier **/ (root)**, et clique sur **Save**.
5. Attends une à deux minutes. L'adresse s'affiche en haut de la page : `https://TON-PSEUDO.github.io/zika/`.

## L'installer sur un téléphone

- **iPhone** : ouvre le lien dans **Safari**, appuie sur Partager, puis **Sur l'écran d'accueil**.
- **Android** : ouvre le lien dans **Chrome**, appuie sur le menu ⋮, puis **Ajouter à l'écran d'accueil** (ou **Installer l'application**).

Pour partager l'app, envoie simplement le lien. Chaque personne a ses propres cartes et sa propre progression, enregistrées sur son appareil.

## Modifier l'app

- **Le plus simple** : sur github.com, ouvre un fichier, clique sur le crayon ✏️, modifie, puis **Commit changes**. Le site se met à jour tout seul en une minute environ.
- **En local** : télécharge les fichiers et ouvre `index.html` dans ton navigateur pour tester. Le mode hors connexion est désactivé dans ce cas, c'est normal. Pour un vrai confort, utilise [VS Code](https://code.visualstudio.com) avec l'extension *Live Server* (la page se recharge à chaque sauvegarde) et *GitHub Desktop* pour envoyer tes modifs.

Après une mise à jour, l'app installée prend la nouvelle version au prochain lancement avec connexion. Si besoin, ferme-la complètement puis rouvre-la.

Quelques idées de modifications faciles :
- Changer les couleurs : bloc `:root` en haut de `style.css`.
- Changer le paquet de départ : tableau `SEED` en haut de `app.js`.
- Changer les intervalles de révision : fonction `schedule()` dans `app.js`.

## Sauvegarde

La progression est stockée dans le navigateur (`localStorage`). Elle disparaît si tu effaces les données du site ou que tu changes d'appareil.
Pense à copier régulièrement le texte de **Réglages → Sauvegarde** et à le garder quelque part, par exemple dans une note. Pour transférer ta progression vers un autre appareil, colle ce texte sur le nouvel appareil et clique sur **Restaurer**.
