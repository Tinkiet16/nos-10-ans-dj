# 🎶 Nos 10 ans — Guide d'installation

Application qui transforme vos invités en DJ de la soirée :

- **Vous** lancez n'importe laquelle de vos playlists depuis la page admin, selon le moment de la soirée.
- **Les invités** ajoutent n'importe quel titre et **votent ♥** : la chanson la plus aimée est envoyée automatiquement à Spotify 15 secondes avant la fin du titre en cours. S'il n'y a pas de demande, votre playlist continue tranquillement.
- **Les invités créent leurs propres playlists**, enregistrées sur votre compte Spotify — un souvenir de la soirée qui vous restera !

## Ce qu'il vous faut

- Un compte **Spotify Premium** (obligatoire pour contrôler la lecture via l'API)
- **Node.js** installé sur votre ordinateur → https://nodejs.org (version LTS)
- Le jour J : votre ordinateur et les invités sur le **même réseau Wi-Fi**

## Étape 1 — Créer votre application Spotify (5 min, gratuit)

1. Allez sur https://developer.spotify.com/dashboard et connectez-vous avec votre compte Spotify.
2. Cliquez sur **Create app** :
   - App name : `Nos 10 ans`
   - Description : `Musique du mariage`
   - Redirect URI : `http://127.0.0.1:3000/callback` (Spotify refuse désormais "localhost")
   - Cochez **Web API**, acceptez les conditions, validez.
3. Ouvrez votre app → **Settings** : notez le **Client ID** et le **Client Secret**.

## Étape 2 — Configurer l'application

1. Copiez le fichier `config.example.json` et renommez la copie en `config.json`.
2. Ouvrez `config.json` et collez votre Client ID et votre Client Secret.

## Étape 2 bis — Le livre d'or photos (facultatif, 5 min, gratuit)

Pour que les invités partagent leurs photos de la soirée :

1. Créez un compte gratuit sur https://cloudinary.com (le plan gratuit suffit largement : des milliers de photos).
2. Dans le **Dashboard**, notez le **Cloud name**, l'**API Key** et l'**API Secret**.
3. Ajoutez-les dans `config.json` (ou en variables d'environnement `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` si l'app est en ligne).

Les photos partent directement du téléphone des invités vers Cloudinary : elles sont en sécurité même si le serveur redémarre. Après la fête, retrouvez-les toutes dans votre Media Library Cloudinary (recherchez le tag `nos10ans-livredor`) et téléchargez-les en un clic.

Sans ces clés, l'application fonctionne normalement — l'onglet Livre d'or affiche simplement "ouvrira bientôt".

## Étape 3 — Lancer l'application

Dans un terminal, placez-vous dans le dossier de l'application puis :

```
npm install
npm start
```

Le terminal affiche deux adresses :
- **Page admin** (pour vous) : http://localhost:3000/admin.html
- **Page invités** : http://VOTRE-IP-LOCALE:3000

## Étape 4 — Connecter votre Spotify (une seule fois)

1. Ouvrez la page admin et cliquez sur **Connecter mon Spotify**.
2. Autorisez l'application. C'est tout : la connexion est mémorisée (fichier `tokens.json`).
3. La page admin affiche alors un **QR code** à montrer aux invités (imprimez-le ou affichez-le sur une tablette).

⚠️ Important : le QR code généré sur `localhost` ne fonctionne que sur votre ordinateur. Pour les invités, utilisez l'adresse **http://VOTRE-IP-LOCALE:3000/admin.html** pour générer le QR (l'adresse IP est affichée au démarrage dans le terminal).

## Le jour J

1. Connectez l'ordinateur au Wi-Fi de la salle et lancez `npm start`.
2. Ouvrez Spotify sur l'ordinateur et jouez un titre (l'appareil devient "actif").
3. Depuis la page admin, lancez la playlist du moment (apéro, dîner, dancefloor…). Changez quand vous voulez.
4. Les invités scannent le QR code (même Wi-Fi que l'ordinateur).
5. Onglet **Ce soir** : ils ajoutent des titres et votent ♥ — la chanson la plus aimée passe juste après le titre en cours.
6. Onglet **Playlists** : ils créent leurs playlists souvenirs, que vous pouvez même lancer depuis la page admin !

## Astuces

- **Désactivez le fondu enchaîné** dans Spotify (Paramètres → Lecture → Fondu enchaîné à 0) pour que l'envoi automatique tombe juste.
- **Pas de Wi-Fi dans la salle ?** Demandez-moi la version hébergée en ligne (gratuite), accessible en 4G.
- **Doublons impossibles** : un titre déjà dans la liste ne peut pas être rajouté, on invite à voter à la place. Un invité = un vote par chanson.
- **Rien ne part vers Spotify ?** Vérifiez qu'une musique joue bien sur l'ordinateur et que le fondu enchaîné est désactivé.
- **Grand ménage** : le bouton "Vider la liste d'attente" sur la page admin remet les compteurs à zéro (pratique entre le dîner et le dancefloor).
- **Sécurité (optionnel)** : ajoutez `"admin_code": "votre-code-secret"` dans `config.json` pour protéger les commandes admin.
- Testez tout **avant** le jour J avec deux ou trois téléphones !
