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
| `sync.js` | Le compte et la synchronisation entre appareils (Supabase) |
| `config.js` | L'adresse et la clé publique du projet Supabase |
| `defis.js` | Les défis : Éclair, Tons, Survie et le défi du jour |
| `social.js` | Les amis, la série de jours et le classement du défi du jour |
| `supabase-amis.sql` | Le script qui crée les tables des amis et des scores (déjà exécuté) |
| `sw.js` | Le mode hors connexion |
| `icons/` | Les icônes |
| `decks/` | La bibliothèque de paquets prêts à l'emploi (HSK 1 à 4) |

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

## Compte et sauvegarde

**Avec un compte** (Réglages → Compte et synchronisation) : les cartes et la progression sont envoyées sur Supabase après chaque révision, et récupérées à l'ouverture de l'app sur n'importe quel appareil. Si tu as révisé hors ligne sur deux appareils, la fusion se fait carte par carte : la révision la plus récente gagne. Chaque personne a son propre compte et ne voit que ses données.

**Sans compte**, tout reste dans le navigateur. Utilise **Réglages → Télécharger ma sauvegarde** de temps en temps pour garder un fichier de secours.

### Configuration Supabase (déjà faite une fois)

- La table `progress` et ses règles de sécurité ont été créées avec le premier script SQL. Les tables `profiles`, `friendships` et `daily_scores` viennent de `supabase-amis.sql`.
- Dans Authentication → Sign In / Providers → Email, l'option « Confirm email » est désactivée, car le service d'e-mail gratuit de Supabase n'envoie qu'aux membres de l'équipe.
- `config.js` contient l'URL du projet et la clé **anon / publishable**, qui est publique. Ne jamais y mettre la clé `service_role` / `secret`.
- Sur l'offre gratuite, un projet inactif pendant une semaine environ est mis en pause. On le réactive depuis le tableau de bord Supabase, sans perte de données.

## Bibliothèque de paquets

Les paquets proposés dans **Cartes → Bibliothèque** sont dans le dossier `decks/`.
Chaque paquet est un fichier JSON qui contient une liste `[hanzi, pinyin, sens]`, et `decks/index.json` liste les paquets proposés.
Pour en ajouter un, crée par exemple `decks/mon-paquet.json` et ajoute une entrée dans `index.json` :

```json
{ "file": "mon-paquet.json", "name": "Mon paquet", "count": 42, "description": "Ce qu'il contient" }
```

Les listes HSK 1 à 4 viennent de l'ancienne version du HSK (HSK 2.0, environ 1 200 mots au total), via le projet open source *complete-hsk-vocabulary* (données CC-CEDICT). Les sens en français ont été rédigés pour l'app.

## Défis et amis

- **Éclair**, **Tons** et **Survie** utilisent tes propres cartes. Les records sont synchronisés avec ton compte.
- Le **défi du jour** pose 10 questions tirées de la liste HSK choisie. Le tirage dépend de la date et du niveau, donc tout le monde a les mêmes questions. On a un seul essai par jour.
- **Amis** : chacun crée un profil (pseudo + avatar) dans l'onglet Défis, puis ajoute ses amis par leur pseudo exact. L'autre accepte la demande.
- Tes amis voient seulement ton pseudo, ton avatar, ta série de jours et tes scores au défi du jour, jamais tes cartes.
