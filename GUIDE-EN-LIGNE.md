# 🌐 Mise en ligne — pour une salle sans Wi-Fi

Une fois l'application hébergée en ligne, les invités y accèdent en **4G** depuis n'importe où. Seul votre ordinateur (qui joue la musique) a besoin d'internet : un **partage de connexion depuis votre téléphone** suffit largement (Spotify + l'app consomment très peu).

Nous utilisons **Render.com** (gratuit, sans carte bancaire).

## Étape 1 — Mettre le code sur GitHub (10 min)

1. Créez un compte gratuit sur https://github.com
2. Cliquez sur **New repository**, nommez-le `nos-10-ans-dj`, laissez en **Private** ❌ → mettez **Public** (nécessaire pour le plan gratuit Render, et le code ne contient aucun secret).
3. Cliquez sur **uploading an existing file** et glissez-déposez tous les fichiers du dossier `dix-ans-dj` **SAUF** : `config.json`, `tokens.json` et le dossier `node_modules` (vos secrets ne doivent jamais aller sur GitHub).
4. Validez avec **Commit changes**.

## Étape 2 — Déployer sur Render (10 min)

1. Créez un compte sur https://render.com (connectez-vous avec GitHub, c'est plus simple).
2. **New → Web Service** → choisissez votre dépôt `nos-10-ans-dj`.
3. Réglages :
   - Region : Frankfurt (le plus proche de la France)
   - Build command : `npm install`
   - Start command : `npm start`
   - Instance type : **Free**
4. Dans **Environment variables**, ajoutez :
   - `SPOTIFY_CLIENT_ID` = votre Client ID
   - `SPOTIFY_CLIENT_SECRET` = votre Client Secret
   - `ADMIN_CODE` = un code secret de votre choix (protège la page admin, car l'app sera publique !)
5. Cliquez sur **Deploy**. Render vous donne une adresse du type `https://nos-10-ans-dj.onrender.com`.

## Étape 3 — Autoriser cette adresse chez Spotify (2 min)

1. Retournez sur https://developer.spotify.com/dashboard → votre app → **Settings**.
2. Dans **Redirect URIs**, ajoutez : `https://nos-10-ans-dj.onrender.com/callback` (avec VOTRE adresse Render exacte) et sauvegardez.

## Étape 4 — Connecter Spotify et verrouiller la connexion (5 min)

1. Ouvrez `https://votre-adresse.onrender.com/admin.html` → **Connecter mon Spotify** (saisissez votre code admin si demandé).
2. ⚠️ Le plan gratuit de Render redémarre le serveur de temps en temps, ce qui effacerait la connexion. Pour la rendre **permanente** :
   - Ouvrez `https://votre-adresse.onrender.com/api/admin/refresh-token` — ajoutez d'abord le code admin : sur la page admin, il est mémorisé ; sinon utilisez un outil comme https://reqbin.com avec l'en-tête `X-Admin-Code`. Plus simple : ouvrez la page admin une fois (le code y est enregistré), puis collez l'adresse ci-dessus dans le même navigateur.
   - Copiez la valeur de `refresh_token`.
   - Dans Render → Environment variables, ajoutez `SPOTIFY_REFRESH_TOKEN` = cette valeur, puis redéployez.
3. C'est fini : la connexion survivra à tous les redémarrages.

## Le jour J

1. Partagez la connexion de votre téléphone vers l'ordinateur, ouvrez Spotify et jouez un titre.
2. 20 minutes avant l'arrivée des invités, ouvrez la page admin (ça "réveille" le serveur gratuit, qui s'endort après 15 min d'inactivité — ensuite, l'activité des invités le maintient éveillé toute la soirée).
3. Lancez votre première playlist depuis la page admin, affichez le QR code... et bonne fête ! 🥂

## À savoir

- **Premier chargement lent (30-60 s)** après une longue inactivité : normal sur le plan gratuit, le serveur se rendort et se réveille. Pendant la soirée, aucun souci.
- La **liste d'attente des votes** est en mémoire : si le serveur redémarre en pleine soirée (rare), elle se vide — les playlists des invités, elles, sont sur Spotify et ne risquent rien.
- Testez tout le circuit complet **plusieurs jours avant** !
