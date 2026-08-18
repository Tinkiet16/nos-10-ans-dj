# 🥂 Audrey & Ludo — Mode opératoire de déploiement complet

De zéro jusqu'à l'appli en ligne, prête pour la soirée. Comptez **45 minutes à 1 heure**, depuis un ordinateur. Suivez les étapes **dans l'ordre** — chacune prépare la suivante.

## Vue d'ensemble

```
Invités (4G) ──► Appli sur Render (gratuit) ──► API Spotify ──► Votre ordi qui joue la musique
                        │                                        (partage de connexion du téléphone)
                        └──► Cloudinary : photos, likes, petits mots (gratuit)
```

Rien à payer. Un seul prérequis payant que vous avez déjà : **Spotify Premium**.

---

## ÉTAPE 1 — Créer les 4 comptes gratuits (10 min)

Ouvrez 4 onglets et créez les comptes (si vous ne les avez pas déjà) :

| Service | Adresse | Conseil |
|---|---|---|
| GitHub | github.com | Inscription classique |
| Render | render.com | Choisissez "Sign up with GitHub" (plus simple pour la suite) |
| Cloudinary | cloudinary.com | Plan gratuit, aucune carte demandée |
| Spotify Developers | developer.spotify.com | Connectez-vous avec votre compte Spotify **habituel** |

---

## ÉTAPE 2 — L'application Spotify (5 min)

⚠️ **Connectez-vous sur developer.spotify.com avec le compte Spotify Premium qui jouera la musique le soir J** (pas celui d'un enfant 😉). En mode développement, seul ce compte pourra autoriser l'appli.

1. Sur developer.spotify.com/dashboard → **Create app** :
   - App name : `Audrey et Ludo 10 ans`
   - Description : `Musique du mariage`
   - Redirect URI : `http://127.0.0.1:3000/callback` (⚠️ pas "localhost" — Spotify le refuse désormais. Cette adresse est provisoire, la vraie sera ajoutée à l'étape 6)
   - Cochez **Web API**, acceptez, validez.
2. Ouvrez l'app → **Settings** → notez précieusement :
   - ✏️ **Client ID** : `____________________`
   - ✏️ **Client Secret** (cliquez "View client secret") : `____________________`

## ÉTAPE 3 — Les clés Cloudinary (2 min)

1. Sur cloudinary.com, une fois connecté, allez sur le **Dashboard** (ou Settings → API Keys).
2. Notez :
   - ✏️ **Cloud name** : `____________________`
   - ✏️ **API Key** : `____________________`
   - ✏️ **API Secret** : `____________________`

## ÉTAPE 4 — Le code sur GitHub (10 min)

1. Dézippez `nos-10-ans-dj.zip` sur votre ordinateur.
2. Sur github.com → **New repository** :
   - Nom : `nos-10-ans-dj`
   - Visibilité : **Public** (nécessaire pour le plan gratuit Render ; le code ne contient aucun secret, ils iront dans Render à l'étape 5)
   - Créez le dépôt.
3. Cliquez sur **"uploading an existing file"** et glissez-déposez **tout le contenu du dossier `dix-ans-dj`** SAUF :
   - ❌ le dossier `node_modules` (s'il existe)
   - ❌ `config.json` et `tokens.json` (s'ils existent — jamais de secrets sur GitHub)
4. **Commit changes**. Vérifiez que `server.js`, `package.json`, le dossier `public` et les guides sont bien visibles.

## ÉTAPE 5 — Déploiement sur Render (10 min)

1. Sur render.com → **New → Web Service** → sélectionnez le dépôt `nos-10-ans-dj`.
2. Réglages :
   - Region : **Frankfurt (EU Central)**
   - Build command : `npm install`
   - Start command : `npm start`
   - Instance type : **Free**
3. Section **Environment Variables** — ajoutez ces 6 variables (copiez vos notes des étapes 2 et 3) :

| Nom (exact) | Valeur |
|---|---|
| `SPOTIFY_CLIENT_ID` | votre Client ID |
| `SPOTIFY_CLIENT_SECRET` | votre Client Secret |
| `CLOUDINARY_CLOUD_NAME` | votre Cloud name |
| `CLOUDINARY_API_KEY` | votre API Key |
| `CLOUDINARY_API_SECRET` | votre API Secret |
| `ADMIN_CODE` | un code secret de votre choix (ex : prénom du chien + année) |

4. **Deploy Web Service**. Attendez que le statut passe à "Live" (2-3 min).
5. ✏️ Notez votre adresse : `https://________________________.onrender.com`

## ÉTAPE 6 — Relier Spotify à cette adresse (2 min)

1. Retournez sur developer.spotify.com/dashboard → votre app → **Settings** → **Edit**.
2. Dans **Redirect URIs**, ajoutez (avec VOTRE adresse exacte) :
   `https://votre-adresse.onrender.com/callback`
3. **Save**.

## ÉTAPE 7 — Connexion Spotify + verrouillage (5 min)

1. Ouvrez `https://votre-adresse.onrender.com/admin.html`
2. Saisissez votre **code admin** quand il est demandé.
3. Cliquez **Connecter mon Spotify** → autorisez. Vous revenez sur la page admin : "✓ Spotify connecté".
4. **Verrouillage (important)** — le serveur gratuit redémarre parfois, il faut rendre la connexion permanente :
   - Dans le même navigateur, ouvrez : `https://votre-adresse.onrender.com/api/admin/refresh-token`
   - Copiez la longue valeur de `refresh_token` (sans les guillemets).
   - Dans Render → votre service → **Environment** → ajoutez : `SPOTIFY_REFRESH_TOKEN` = cette valeur → **Save** (le service redéploie tout seul).
5. Rechargez la page admin : toujours "✓ Spotify connecté" → c'est verrouillé à vie. ✅

## ÉTAPE 8 — Test complet immédiat (10 min)

Sur votre ordinateur : ouvrez Spotify, jouez n'importe quel titre.

Depuis **deux téléphones** (le vôtre + celui d'Audrey, en 4G) :
- [ ] Scanner le QR code affiché sur la page admin → la page d'accueil "Bienvenue aux 10 ans d'Audrey & Ludo" s'affiche, prénom, entrée
- [ ] La carte d'installation iPhone/Android s'affiche → installer l'appli sur l'écran d'accueil
- [ ] Le vinyle affiche le titre en cours de lecture
- [ ] Page admin : le bandeau en haut affiche **✓ Appareil : … — lecture en cours**
- [ ] Chercher une chanson, l'ajouter → elle apparaît dans la liste des deux téléphones,
      avec déjà un ♥ (celui de la personne qui l'a proposée)
- [ ] Voter ♥ depuis l'autre téléphone → le compteur monte partout ; **re-taper annule le vote**
- [ ] Pendant que l'un vote, l'autre regarde : la liste ne doit pas se réordonner sous le doigt
- [ ] Attendre la fin du morceau → la chanson votée passe automatiquement 🎉
- [ ] Livre d'or : envoyer 2 photos avec un petit mot → liker et commenter depuis l'autre téléphone
- [ ] Commencer à écrire un petit mot, attendre 20 s sans valider → le texte ne doit pas disparaître
- [ ] Couper la 4G d'un téléphone → un bandeau « Connexion perdue » apparaît ; la rétablir →
      il disparaît tout seul, sans recharger la page
- [ ] Page admin : mettre en pause → le bandeau apparaît chez les invités, les ajouts sont refusés → rouvrir
- [ ] Page admin : retirer un titre avec ✕, lancer une autre playlist avec ▶
- [ ] Page admin : supprimer une photo puis toucher **Annuler** → elle doit revenir

Si tout coche : **vous êtes prêts.** Sinon, voir Dépannage plus bas.

---

## LE JOUR J — Déroulé

**La veille**
- Imprimer le QR code (un par table + un panneau à l'entrée). Astuce : capture d'écran du QR de la page admin.
- Dans Spotify sur l'ordi : télécharger vos playlists en mode hors connexion + **désactiver le fondu enchaîné** (Paramètres → Lecture → Fondu enchaîné : 0 s) + désactiver la mise en veille de l'ordi.

**H-1 (arrivée dans la salle)**
1. Téléphone de Ludo : activer le partage de connexion. Connecter l'ordinateur dessus. Brancher les deux sur secteur.
2. Ouvrir Spotify sur l'ordi, lancer la playlist d'accueil.
3. Sur votre téléphone : ouvrir la page admin (réveille le serveur). Le bandeau en haut vous
   dit tout : **✓ Appareil : … — lecture en cours**. S'il affiche « Aucun appareil actif »,
   lancez un titre à la main dans Spotify sur l'ordi. Cochez aussi la case du fondu enchaîné
   une fois le réglage fait — l'appli ne peut pas le vérifier à votre place.
4. **Mettre les demandes en pause** (apéro/dîner sous votre contrôle).
5. Ajouter vous-mêmes 3-4 titres en liste d'attente pour qu'elle ne soit pas vide.

**Pendant la soirée**
- Apéro/dîner : demandes en pause, vos playlists tournent, le livre d'or vit déjà (photos !)
- Faire annoncer l'appli au micro au moment du dessert
- Dancefloor : **rouvrir les demandes** → les invités prennent la main
- Un titre gênant ? ✕ sur la page admin. Un discours surprise ? Pause.

**Après la fête**
- Toutes les photos + petits mots : Media Library Cloudinary, tag `nos10ans-livredor`, téléchargement groupé

---

## Dépannage express

| Symptôme | Solution |
|---|---|
| Page invités très lente au premier chargement | Normal après 15 min d'inactivité (serveur gratuit qui se réveille). L'appli affiche « On réveille la soirée… ». Ouvrez la page admin 20 min avant les invités. |
| "Aucun appareil actif" | Le bandeau du pupitre le dit explicitement. Jouez un titre à la main dans Spotify sur l'ordi : il repasse au vert en quelques secondes. |
| Les titres votés ne s'insèrent pas | Vérifiez : demandes ouvertes ? fondu enchaîné à 0 ? une musique joue bien ? |
| Un invité voit « Connexion perdue » | Son réseau a lâché. Rien à faire : l'appli se reconnecte seule et le bandeau disparaît. |
| Un invité ne voit rien du tout | Vérifiez qu'il est en 4G/5G (pas un wifi captif d'hôtel) et que l'adresse est la bonne. |
| Photos qui ne partent pas | Les photos en échec **restent dans le bac**, marquées en rouge, avec un bouton « Réessayer ». Rien n'est perdu, il suffit de retoucher le bouton une fois le réseau revenu. |
| Un invité a voté par erreur | Il retouche le même bouton : cela annule son vote. |
| Photo supprimée par erreur sur le pupitre | Touchez **Annuler** dans les 6 secondes. Passé ce délai, c'est définitif. |
| Page admin demande le code | Un encart de saisie s'affiche dans la page. Vérifiez la variable `ADMIN_CODE` dans Render et retapez-le exactement. |

Bonne fête, Audrey & Ludo ! 🥂💍
