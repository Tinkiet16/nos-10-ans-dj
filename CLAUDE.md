# CLAUDE.md — Nos 10 ans (Audrey & Ludo)

Application web de mariage : jukebox Spotify collaboratif + livre d'or photo social,
pour les 10 ans de mariage d'Audrey & Ludo. Invités sur téléphone (4G), sans compte.

## Architecture

- **server.js** : Express (Node ≥ 18, fetch natif). Un seul fichier, ~700 lignes, commenté en français.
- **public/commun.js** : utilitaires partagés par les deux pages — `$`, `esc`, `toast` (avec
  action facultative), `api` (délai de 5 s, ne masque jamais un échec réseau), `creerSondage`
  (reprise avec espacement 2×/4×/8×, plafond 30 s), `Reseau`, `rendreListe`, `flip`, icônes SVG.
- **public/index.html** : page invités (PWA installable). CSS et logique métier en ligne,
  utilitaires dans `commun.js`. Aucune dépendance front.
- **public/admin.html** : pupitre des mariés (protégé par code admin via en-tête `X-Admin-Code`,
  saisi dans un encart de la page — jamais `prompt()`, bloqué en contexte PWA).
- **public/qrcode.min.js** : copie locale de `qrcodejs` (MIT). Ne jamais rebasculer sur un CDN :
  un réseau de salle qui le filtre supprimerait le QR code le soir même.
- **Hébergement** : Render.com plan Free (dépôt GitHub `Tinkiet16/nos-10-ans-dj`, auto-deploy sur commit).
  URL prod : https://nos-10-ans-dj.onrender.com
- **Aucune base de données.** Persistance :
  - Spotify = musique (rien n'est stocké côté appli)
  - Cloudinary = photos + 3 fichiers JSON "raw" (réactions `nos10ans-social.json`,
    invités `nos10ans-invites.json`) sauvegardés par upload signé, rechargés au démarrage
  - Mémoire serveur = liste d'attente des votes (volontairement éphémère, le temps d'une soirée)

## Configuration (variables d'environnement sur Render, ou config.json en local)

`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` (nettoyé des
espaces/retours ligne au démarrage), `ADMIN_CODE`, `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PORT`.

## Mécanique musicale (le cœur du système)

1. Les invités proposent des titres (recherche Spotify) → liste d'attente en mémoire.
2. Votes ♥ (pour) / 💔 (contre) par invité (`X-Invite-Id`, généré côté client, stocké en localStorage).
   Classement au score net. Transparence : proposeur et votants affichés par prénom
   (registre `invites` alimenté par `/api/bonjour`).
   Deux règles serveur que l'interface DOIT continuer d'énoncer : re-taper le même bouton
   annule son vote (`server.js:334`), et proposer un titre vote automatiquement pour soi
   (`server.js:321`) — d'où le compteur à 1 dès l'ajout.
3. `chefDOrchestre()` (setInterval 5 s) : ~15 s avant la fin du titre en cours, envoie le
   mieux noté à `/me/player/queue` de Spotify, puis le retire de la liste.
   PRÉREQUIS UTILISATEUR : Spotify Premium, fondu enchaîné à 0, un appareil actif.
4. Pause des demandes pilotable depuis l'admin (`demandesOuvertes`).

## ⚠️ Contraintes Spotify connues (NE PAS re-déboguer, c'est structurel)

L'app Spotify est en **mode développement** (créée en 2026) : Spotify renvoie **403 Forbidden** sur :
- lecture du CONTENU des playlists (`/playlists/{id}/tracks`) → contournement en place :
  le dépliant "Voir toute la playlist" bascule sur `/me/player/queue` (~20 prochains titres)
- création de playlists → fonctionnalité RETIRÉE volontairement (décision produit)
- compteurs `tracks.total` souvent absents → l'admin affiche "Playlist Spotify" sans compteur
Fonctionnent normalement : lecture en cours, file d'attente, ajout à la file, recherche, /me/playlists (liste).

## Conventions

- Tout en **français** (UI, commentaires, logs). Logs préfixés emoji : 🔐 token, 🎶 envoi,
  👥 invités, 📀 diagnostic playlist, 🗑️ suppression photo.
- Design : thème nuit (#15161c), or champagne (#e6c47e), rose (#b57682), Great Vibes pour le titre,
  icônes SVG inline (jamais d'emoji comme icône d'interface), cibles tactiles ≥ 44 px,
  zones de sécurité iPhone gérées (padding env(safe-area-inset-*) + bandeau masque body::after).
- Navigation invités : 2 onglets max (Musique / Livre d'or), sous-vues en pastilles. Ne pas ajouter d'onglet.
  Les onglets passent par le hash (`#musique`, `#livredor`) ; les couches (visionneuse, tutoriel)
  passent par `Couches.ouvrir()` et se ferment via `popstate`. Ne jamais fermer une couche
  directement : toujours `Couches.demanderFermeture()`, sinon la pile et l'historique divergent.
- Toute écriture Cloudinary passe par une signature SHA-1 calculée serveur (jamais de secret côté client).
- **Toute liste rafraîchie par sondage passe par `rendreListe`, jamais par `innerHTML =`.**
  Un `innerHTML` détruit le DOM et donc la saisie en cours, le focus et l'intention de tap.
  Les états « liste vide » et les squelettes vivent HORS du conteneur réconcilié.
- **Tout tap sur un contrôle de vote ou de retrait fige l'ordre de la liste 4 s**
  (`DUREE_GEL_MS`). Les compteurs continuent d'être mis à jour en place ; seul le
  réordonnancement attend. Sans ce gel, la carte visée se dérobe sous le doigt.
- Les actions destructives passent par une annulation différée de 6 s (toast « Annuler »),
  pas par un `confirm()` : sur un téléphone, on valide par réflexe.

## Tester en local

```
cp config.example.json config.json   # remplir les clés
npm install && npm start             # http://localhost:3000 (invités) et /admin.html
```

## Décisions déjà tranchées (ne pas les rejouer)

- **Pas de service worker, pas de mode hors-ligne.** Écarté volontairement : tout le contenu
  vient de Spotify et de Cloudinary, donc une coquille ouvrable sans réseau n'affiche rien
  d'utile — alors qu'un service worker mal invalidé servirait une version périmée le soir J,
  sur des téléphones auxquels on n'a pas accès. Les états réseau visibles couvrent le
  besoin réel.
- **Le fondu enchaîné n'est pas lisible par l'API Spotify.** Le pupitre affiche une case à
  cocher manuelle, jamais un voyant automatique. Ne pas « améliorer » cela en vert rassurant.
- **Pas d'infrastructure de test.** La vérification est manuelle et scriptée par écrit :
  voir `docs/superpowers/specs/2026-08-17-passe-ux-design.md` §9, scénarios V1 à V13.

## À savoir avant de modifier

- Le serveur Render Free s'endort après 15 min : premier accès lent (page "Service waking up").
  Parade jour J : ouvrir l'admin à H-1 (+ éventuellement ping UptimeRobot sur /api/compteur).
- Fichiers d'aide utilisateur : MODE-OPERATOIRE.md (déploiement complet pas à pas),
  GUIDE.md (local), GUIDE-EN-LIGNE.md (Render). Les tenir à jour si le comportement change.
- Tutoriels embarqués dans index.html : carrousel d'installation (iOS/Android détecté) et
  carrousel des fonctionnalités (première entrée, flag localStorage `tutoVu`).
