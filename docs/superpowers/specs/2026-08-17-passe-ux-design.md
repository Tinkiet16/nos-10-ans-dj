# Passe UX — Nos 10 ans (Audrey & Ludo)

Date : 2026-08-17
État : validé en session, prêt pour le plan d'implémentation
Point zéro git : `50f96d5`

## 1. Contexte et intention

L'application fonctionne. Cette passe ne cherche pas à ajouter des fonctionnalités
mais à la rendre **fiable dans ses conditions réelles d'usage** : des invités sur
téléphone, en 4G, dans une salle bondée, un seul soir, sans possibilité de
correctif à chaud.

L'audit a identifié cinq défauts qui peuvent dégrader la soirée elle-même, une
couche de qualité perçue et d'accessibilité, et quelques angles morts côté
pupitre des mariés.

**Le constat structurant :** trois des cinq défauts critiques ont une racine
unique — le rendu est un `innerHTML = …` complet déclenché par `setInterval`.
Chaque rafraîchissement détruit le DOM et donc tout l'état vivant : la saisie en
cours, le focus, l'animation, l'intention de tap. La spec traite cette cause
plutôt que ses symptômes.

## 2. Objectifs

1. Aucun mis-tap causé par un réordonnancement de liste.
2. Aucune perte de saisie utilisateur causée par un rafraîchissement.
3. Aucune action utilisateur qui échoue silencieusement.
4. Un envoi de photos réaliste en 4G, et honnête sur ses échecs.
5. Conformité aux règles tactiles et d'accessibilité critiques (cibles ≥ 44 px,
   navigation au retour système, modale échappable, parcours clavier).
6. Un pupitre des mariés qui diagnostique le mode d'échec n°1 au lieu de le subir.

## 3. Non-objectifs

- Aucune nouvelle fonctionnalité invité (pas de nouvel onglet — contrainte
  `CLAUDE.md`, pas de création de playlist — décision produit antérieure).
- Aucune refonte visuelle : mêmes couleurs, mêmes polices, mêmes formes, mêmes
  tailles dessinées de boutons. Les ajustements de lisibilité qui *sont* dans le
  périmètre (micro-labels remontés à 11–12 px, contraste de `.suite`, barre
  collante de l'accueil) sont énumérés exhaustivement en §5.6 : rien d'autre ne
  bouge à l'écran.
- Aucune tentative de contourner les limites Spotify documentées (403 sur le
  contenu des playlists) : elles restent traitées comme structurelles.
- Aucune infrastructure de test automatisé (voir §9).
- Aucune base de données : la persistance reste Spotify + Cloudinary + mémoire.
- **Aucun service worker, aucun mode hors-ligne.** Écarté explicitement : le
  contenu de l'application vient entièrement de Spotify et de Cloudinary, donc
  une coquille ouvrable sans réseau n'affiche rien d'utile. En face, un service
  worker mal invalidé pouvait servir une version périmée le soir même, sur des
  téléphones auxquels on n'a pas accès. Le rapport bénéfice/risque ne le
  justifie pas. Les **états réseau visibles** (§4.6) restent au périmètre : ce
  sont eux qui traitent le problème réel, celui du réseau instable.

## 4. Architecture

### 4.1 Noyau de rendu réconcilié

Un module `rendreListe(conteneur, items, cle, construire, mettreAJour)`, environ
60 lignes, sans dépendance (contrainte du projet : aucune dépendance front).

- Indexe les nœuds existants par `data-cle`.
- Crée les nouveaux, met à jour les existants **en place**, retire les absents.
- Réordonne par `insertBefore` selon l'ordre cible.

Deux appelants : la file d'attente (clé = `uri`) et le fil du livre d'or
(clé = `photo.id`). Ces clés sont stables et déjà fournies par le serveur
(`publicQueue`, `server.js:198`).

Conséquence directe : le `<input>` d'un commentaire survit au rafraîchissement,
le focus est conservé, et une carte qui remonte est *le même nœud*, donc animable.

### 4.2 Verrou d'interaction

La réconciliation seule ne suffit pas : si une carte bouge pendant que le doigt
descend, le tap atterrit à côté. On ajoute donc :

- **Gel du réordonnancement** : tout tap sur un bouton de vote fige l'ordre
  pendant 4 s. Les compteurs continuent d'être mis à jour **sur place** pendant
  le gel. À l'expiration, l'ordre cible est rejoué en animation FLIP.
- Un titre nouvellement arrivé pendant le gel attend la fin du gel au lieu de
  s'insérer en tête.
- Le sondage ne redessine que si une **signature** du contenu a changé, et
  **jamais** pendant qu'un champ du conteneur a le focus. La signature est la
  concaténation, dans l'ordre reçu, de `uri|pour|contre|monVote` pour chaque
  titre : elle capture donc à la fois l'ordre, les compteurs et mon propre vote,
  et rien d'autre.

Compromis assumé et validé : l'ordre affiché peut avoir jusqu'à 4 s de retard sur
la vérité serveur, en échange de zéro mis-tap.

### 4.3 Animation FLIP

Mesure avant / application du nouvel ordre / mesure après / `transform` inverse /
relâchement. Contraintes :

- `transform` et `opacity` exclusivement, jamais de propriété déclenchant un
  reflow.
- `prefers-reduced-motion` → bascule sèche, sans mouvement.
- Interruptible : l'état final est toujours posé explicitement ; la correction ne
  dépend jamais d'un événement `animationend`.

### 4.4 Optimisme et réconciliation

Au tap : l'état visuel s'applique immédiatement (cœur rempli, compteur ±1). La
requête part. La réponse contient la file autoritaire complète et fait foi.

En cas d'échec : retour à l'état antérieur mémorisé, plus un toast actionnable
« Réessayer ».

`api()` reçoit un timeout de 8 s (`AbortSignal.timeout`). Tous les handlers
passent par un wrapper qui capture l'exception, restaure l'état optimiste et
signale — ce qui supprime les taps morts actuels (le handler de vote,
`index.html:707`, n'a aujourd'hui aucun `try/catch`).

### 4.5 Vérités serveur enfin exprimées par l'interface

Le serveur implémente deux règles que l'interface ne dit nulle part :

- Le vote est un **toggle** : re-taper le même bouton annule son vote
  (`server.js:334`). → `aria-pressed` sur les boutons, et un micro-texte au
  premier vote de la session : « re-touchez pour annuler ».
- Proposer un titre **vote automatiquement pour soi** (`server.js:321`). → le
  compteur à 1 et le cœur pré-rempli sont expliqués par le libellé.

### 4.6 Résilience réseau

Pas de service worker (§3). Le traitement est entièrement dans la page, là où il
n'y a aujourd'hui que des `catch(e){}` silencieux :

**Reprise automatique.** Les sondages ne s'arrêtent jamais sur une erreur ; ils
espacent leurs tentatives (5 s, 10 s, 20 s, plafonné à 30 s) et reviennent à leur
cadence normale dès la première réponse valide. Aujourd'hui une erreur est
avalée, l'écran se fige sur ses dernières données et rien n'indique qu'elles
datent.

**États visibles :**

- Bandeau `role="status"` sous le header : « Connexion perdue — les votes
  repartiront tout seuls », qui disparaît de lui-même au retour du réseau.
- Premier chargement dépassant 3 s : « On réveille la soirée… », spécifique au
  réveil du plan Render Free.
- Squelettes aux dimensions réelles (donc CLS nul) pour la file et le fil, au
  lieu du texte « Chargement… ».

## 5. Tactile, navigation, accessibilité

### 5.1 Cibles tactiles

Les tailles dessinées ne changent pas ; la zone de tap est étendue via un
`::before` en `inset:-3px` :

- `.btn-plus` : visuel 40 px, zone ≥ 44 px.
- `.btn-vote` : visuel 42 px de large, zone ≥ 44 px.
- Écart entre ♥ et 💔 porté de 6 à 8 px.

### 5.2 Historique et retour système

Un empileur de couches : changement d'onglet, ouverture de la visionneuse et
ouverture d'un tutoriel poussent chacun un état d'historique. `popstate` ferme la
couche du dessus.

Résultat : le bouton retour Android et le swipe-back iOS cessent de quitter
l'application. Bénéfice secondaire : `#musique` et `#livredor` deviennent des
liens profonds.

### 5.3 Visionneuse

Composant le plus faible de l'existant. Il reçoit :

- `role="dialog"` et `aria-modal="true"` ;
- focus déplacé à l'ouverture, rendu au déclencheur à la fermeture, piégé
  pendant l'ouverture ;
- fermeture par Échap ;
- scroll de l'arrière-plan verrouillé ;
- navigation précédent / suivant par **swipe et par boutons** — le swipe seul
  violerait le critère `dragging-alternative` de WCAG 2.2 ;
- compteur de position « 3 / 27 ».

### 5.4 Clavier

Les vignettes de la grille deviennent de vrais `<button>`. Aujourd'hui elles
portent `role="button" tabindex="0"` sans aucun handler clavier : elles sont
annoncées comme actionnables et ne font rien.

### 5.5 Iconographie

`＋`, `✕`, `▾` et `💬` deviennent des SVG inline, conformément à la convention du
projet (`CLAUDE.md` : « jamais d'emoji comme icône d'interface »). Les émojis de
ton dans les textes (🥂, ♥, 💔 dans les formulations) sont conservés : c'est de
la voix éditoriale, pas de l'iconographie.

### 5.6 Corrections ponctuelles

| Élément | Correction | Motif |
|---|---|---|
| Champ commentaire | 14 px → 16 px | supprime le zoom automatique iOS au focus |
| `.suite` | `opacity:.65` → couleur explicite tenant 4.5:1 | contraste AA |
| `.votants`, `.coin`, `.badge-suivante` | 10–11,5 px → 11–12 px | lisibilité |
| Onglet actif | ajout de `aria-current` | orientation lecteur d'écran |
| `.vinyle-acc`, FLIP, toast | soumis à `prefers-reduced-motion` | seul `.vinyle` l'était |
| Tutoriel | bouton « Précédent », puces cliquables | `multi-step-progress` |
| Recherche | squelette de chargement + « Aucun résultat pour *…* » | états vides |
| Accueil | prénom + CTA en barre collante en bas | sous la ligne de flottaison sur iPhone SE |
| Barre de progression | interpolation locale chaque seconde, remise à zéro au changement de titre | avance aujourd'hui par bonds de 5 s |
| Pochette du vinyle | réinjectée seulement si l'URL a changé | supprime le clignotement en 4G |

## 6. Livre d'or et envoi de photos

### 6.1 Redimensionnement client

Avant envoi : canvas, 1600 px sur le plus grand côté, JPEG qualité 0.82,
orientation EXIF préservée via `createImageBitmap(blob, {imageOrientation:'from-image'})`.

Ordre de grandeur : une photo iPhone passe d'environ 4 Mo à environ 350 Ko. C'est
le gain le plus important de la passe pour l'usage réel en 4G.

### 6.2 Progression et honnêteté des échecs

- Progression par vignette via `XMLHttpRequest.upload.onprogress`.
- État individuel par fichier : en cours / ✓ / échec avec bouton ↻.
- Concurrence limitée à 2 envois simultanés (au lieu du séquentiel strict).
- Si certaines photos échouent, elles **restent dans le bac** avec le message
  « 2 photos n'ont pas pu partir — Réessayer ».

Aujourd'hui, 3 réussites sur 5 affichent « 3 photos ajoutées » et les 2 échecs
disparaissent sans un mot : ce comportement est supprimé.

### 6.3 Insertion optimiste

La photo apparaît dans le fil immédiatement depuis son aperçu local, marquée
« envoi… », puis cède la place à la version serveur au chargement suivant. Cela
remplace le `setTimeout(chargerGalerie, 1500)` actuel, qui fait croire à un échec
quand Cloudinary répond un peu lentement.

## 7. Pupitre des mariés

### 7.1 QR code sans dépendance externe

`qrcode.min.js` est copié dans `public/` au lieu d'être chargé depuis cdnjs. Si
le réseau de la salle filtre ce CDN, il n'y a aujourd'hui plus de QR code le soir
même.

La bibliothèque `qrcodejs` est sous licence MIT : la copie locale conserve son
en-tête de licence, sans autre obligation.

### 7.2 Bandeau de diagnostic

Nouvel endpoint `GET /api/admin/player`, lisant `/me/player`, protégé par
`X-Admin-Code` comme les autres routes admin. Il expose le nom de l'appareil et
l'état de lecture.

Affichage : « Appareil : *MacBook de Ludo* · lecture en cours ✓ », ou bien
« Aucun appareil actif — ouvrez Spotify et lancez un titre ».

**Limite à énoncer dans l'interface :** l'API Spotify n'expose pas le réglage de
fondu enchaîné. Il apparaît donc comme une case à cocher manuelle, jamais comme
un voyant vert automatique — un faux positif ici coûterait la synchronisation de
toute la soirée.

### 7.3 Annulation de suppression

Retrait immédiat de la grille, puis toast « Annuler » pendant 6 s avant l'appel
réel de suppression. Sur un téléphone tenu à bout de bras, un `confirm()` ne
protège de rien et la suppression Cloudinary est définitive.

### 7.4 Saisie du code admin

`prompt('Code admin :')` — bloqué dans certains contextes PWA et rappelé
récursivement — est remplacé par un champ en ligne dans la page.

## 8. Mutualisation

Les deux pages dupliquent déjà `$`, `esc` et `toast`, et dupliqueraient le
réconciliateur, le wrapper `api` et la gestion des états réseau.

Décision : un fichier `public/commun.js` (environ 120 lignes) regroupe ces
utilitaires, importé par les deux pages.

Cette décision **modifie une convention du projet** : `CLAUDE.md` décrit
aujourd'hui `index.html` comme « tout-en-un ». Elle est prise en connaissance de
cause. Dupliquer le réconciliateur, le FLIP et le wrapper réseau dans deux
fichiers garantirait une dérive entre les deux copies, et c'est précisément dans
`admin.html` — où le même réordonnancement menace un bouton **destructif**
(« ✕ retirer un titre ») — qu'un écart passerait inaperçu jusqu'au soir J.

Coût réel : une requête HTTP d'environ 4 Ko, mise en cache par le navigateur dès
la première visite, sur une page qui charge déjà des polices depuis un tiers. Le
démarrage à froid de Render domine très largement ce coût. `CLAUDE.md` sera mis
à jour en conséquence.

## 9. Vérification

Le projet n'a aucune infrastructure de test, et en monter une pour une
application de mariage à usage unique serait disproportionné. **Décision
explicite : la vérification est manuelle et scriptée par écrit.** Chaque lot du
plan d'implémentation portera son scénario de vérification, exécuté avant de
déclarer le lot terminé.

Scénarios de référence :

| # | Scénario | Critère de réussite |
|---|---|---|
| V1 | Deux navigateurs, votes croisés sur la même chanson | l'ordre ne bouge pas sous le doigt pendant 4 s ; les compteurs, si |
| V2 | Saisir un commentaire, attendre 20 s sans valider | le texte et le focus sont intacts |
| V3 | Couper le réseau, taper un ♥ | retour à l'état antérieur + toast « Réessayer » |
| V4 | Envoyer 8 photos en 4G bridée, couper le réseau à mi-parcours | les échouées restent dans le bac, message explicite |
| V5 | Couper le réseau 1 min, le rétablir, sans toucher à l'écran | le bandeau apparaît puis disparaît seul, les données repartent sans rechargement manuel |
| V6 | Viewport 375 px, écran d'accueil | prénom et CTA atteignables sans scroll |
| V7 | `prefers-reduced-motion` activé | aucun mouvement : vinyles, FLIP, toast |
| V8 | Visionneuse au clavier | Tab piégé, Échap ferme, focus rendu au déclencheur |
| V9 | Visionneuse sous VoiceOver | dialogue annoncé, position « 3 / 27 » lue |
| V10 | iOS, focus sur le champ commentaire | aucun zoom automatique |
| V11 | Retour Android depuis le livre d'or et depuis la visionneuse | ferme la couche, ne quitte pas l'application |
| V12 | Admin sans appareil Spotify actif | le bandeau le dit explicitement |
| V13 | Admin, supprimer une photo puis « Annuler » | la photo est toujours présente après rechargement |

## 10. Risques

| Risque | Gravité | Traitement |
|---|---|---|
| Régression sur un fichier de 968 lignes | élevée | dépôt git initialisé, point zéro `50f96d5`, un commit réversible par lot |
| Dérive entre `commun.js` et ses appelants | moyenne | un seul exemplaire du code partagé, précisément pour éviter la dérive (§8) ; les deux pages sont revérifiées à chaque lot qui touche `commun.js` |
| Le gel de 4 s perçu comme une latence | moyenne | les compteurs bougent pendant le gel, donc l'interface reste vivante ; durée ajustable en une constante |
| Redimensionnement canvas dégradant une photo | faible | 1600 px / q. 0.82 reste au-dessus du besoin d'un livre d'or ; l'original n'est de toute façon jamais conservé aujourd'hui |
| `createImageBitmap` avec `imageOrientation` non supporté sur un vieux Safari | faible | repli sur l'envoi direct sans redimensionnement, plutôt qu'un échec |
| Charge Cloudinary / Spotify inchangée | nulle | aucun nouvel appel périodique n'est introduit ; le sondage garde ses fréquences actuelles |

## 11. Fichiers touchés

| Fichier | Nature |
|---|---|
| `public/index.html` | refonte du rendu, états réseau, accessibilité, envoi de photos |
| `public/admin.html` | diagnostic, annulation, code admin, QR local |
| `public/commun.js` | **nouveau** — utilitaires partagés |
| `public/qrcode.min.js` | **nouveau** — copie locale de la bibliothèque |
| `server.js` | ajout de `GET /api/admin/player` uniquement |
| `CLAUDE.md` | mise à jour de la convention « tout-en-un » (§8) |
| `MODE-OPERATOIRE.md` | mise à jour si le comportement décrit change |
