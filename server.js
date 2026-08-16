/* ============================================================
   Nos 10 ans — passerelle Spotify pour les invités
   Fonctionne en local (config.json) OU hébergée en ligne
   (variables d'environnement : Render, Railway…).
   ============================================================ */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---- Configuration : variables d'environnement OU config.json ----
let fileConfig = {};
try { fileConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch {}

const client_id = process.env.SPOTIFY_CLIENT_ID || fileConfig.client_id;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET || fileConfig.client_secret;
const admin_code = process.env.ADMIN_CODE || fileConfig.admin_code || "";
// Nettoyé des espaces/retours à la ligne qui se glissent souvent au copier-coller
const envRefreshToken = (process.env.SPOTIFY_REFRESH_TOKEN || "").replace(/\s+/g, "");
if (process.env.SPOTIFY_REFRESH_TOKEN) {
  console.log(`🔐 SPOTIFY_REFRESH_TOKEN détecté (${envRefreshToken.length} caractères après nettoyage).`);
}
const port = process.env.PORT || fileConfig.port || 3000;

// Livre d'or photos (facultatif) : compte gratuit sur cloudinary.com
const cloudinary = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || fileConfig.cloudinary_cloud_name || "",
  api_key: process.env.CLOUDINARY_API_KEY || fileConfig.cloudinary_api_key || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || fileConfig.cloudinary_api_secret || "",
};
const livredorActif = Boolean(cloudinary.cloud_name && cloudinary.api_key && cloudinary.api_secret);
const LIVREDOR_TAG = "nos10ans-livredor";

if (!client_id || !client_secret) {
  console.error("\n⚠️  Clés Spotify manquantes.");
  console.error("En local : copiez config.example.json vers config.json et remplissez-le.");
  console.error("En ligne : définissez les variables SPOTIFY_CLIENT_ID et SPOTIFY_CLIENT_SECRET.\n");
  process.exit(1);
}

const TOKENS_PATH = path.join(__dirname, "tokens.json");
const SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

const PREFIXE_INVITE = "💍 Nos 10 ans · ";
const MARGE_FIN_MS = 15_000; // envoi de la gagnante X ms avant la fin du titre

const app = express();
app.set("trust proxy", 1); // HTTPS derrière le proxy de l'hébergeur
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Liste d'attente des invités (en mémoire, le temps d'une soirée) ----
// [{ uri, title, artists, image, votes, voters:[inviteId], addedAt }]
let queue = [];
let demandesOuvertes = true; // l'hôte peut fermer pendant le dîner, les discours…

// ---- Jetons Spotify ------------------------------------------------
let accessToken = null;
let accessTokenExpiry = 0;
let memoryRefreshToken = null;

function getStoredRefreshToken() {
  if (memoryRefreshToken) return memoryRefreshToken;
  if (envRefreshToken) return envRefreshToken;
  try { return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8")).refresh_token; }
  catch { return null; }
}
function storeRefreshToken(token) {
  memoryRefreshToken = token;
  try { fs.writeFileSync(TOKENS_PATH, JSON.stringify({ refresh_token: token }, null, 2)); }
  catch { /* disque en lecture seule chez certains hébergeurs : la mémoire suffit */ }
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiry - 30_000) return accessToken;
  const refresh = getStoredRefreshToken();
  if (!refresh) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  accessToken = data.access_token;
  accessTokenExpiry = Date.now() + data.expires_in * 1000;
  if (data.refresh_token) storeRefreshToken(data.refresh_token);
  return accessToken;
}

async function spotify(endpoint, options = {}) {
  const token = await getAccessToken();
  if (!token) return { error: "not_connected", status: 401 };
  const res = await fetch("https://api.spotify.com/v1" + endpoint, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return { status: 204 };
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body };
}

// ---- Connexion de l'hôte --------------------------------------------
app.get("/login", (req, res) => {
  const redirect_uri = `${req.protocol}://${req.get("host")}/callback`;
  res.redirect("https://accounts.spotify.com/authorize?" + new URLSearchParams({
    response_type: "code", client_id, scope: SCOPES, redirect_uri,
  }));
});

app.get("/callback", async (req, res) => {
  const redirect_uri = `${req.protocol}://${req.get("host")}/callback`;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code: req.query.code, redirect_uri }),
  });
  const data = await r.json();
  if (data.refresh_token) {
    storeRefreshToken(data.refresh_token);
    accessToken = data.access_token;
    accessTokenExpiry = Date.now() + data.expires_in * 1000;
    res.redirect("/admin.html?connected=1");
  } else {
    res.status(500).send("Échec de la connexion Spotify : " + JSON.stringify(data));
  }
});

// ---- Aides ------------------------------------------------------------
function mapTrack(t) {
  return {
    uri: t.uri,
    title: t.name,
    artists: (t.artists || []).map(a => a.name).join(", "),
    image: t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || null,
  };
}
function inviteId(req) {
  return String(req.headers["x-invite-id"] || "anonyme").slice(0, 64);
}
function publicQueue(req) {
  const id = inviteId(req);
  return [...queue]
    .sort((a, b) => b.votes - a.votes || a.addedAt - b.addedAt)
    .map(t => ({
      uri: t.uri, title: t.title, artists: t.artists, image: t.image,
      votes: t.votes, jaiVote: t.voters.includes(id),
    }));
}
// "💍 Nos 10 ans · Les tubes (par Marc)" → { name:"Les tubes", author:"Marc" }
function parseNomInvite(fullName) {
  const brut = fullName.slice(PREFIXE_INVITE.length);
  const m = brut.match(/^(.*) \(par (.*)\)$/);
  return m ? { name: m[1], author: m[2] } : { name: brut, author: "" };
}
async function playlistsInvites() {
  const r = await spotify("/me/playlists?limit=50");
  return (r.body?.items || [])
    .filter(p => p.name.startsWith(PREFIXE_INVITE))
    .map(p => ({ spotifyId: p.id, uri: p.uri, ...parseNomInvite(p.name) }));
}

// ---- API invités : lecture en cours ------------------------------------
app.get("/api/now-playing", async (req, res) => {
  const r = await spotify("/me/player/currently-playing");
  if (r.status === 204 || !r.body?.item) return res.json({ playing: false });
  const item = r.body.item;
  res.json({
    playing: r.body.is_playing,
    title: item.name,
    artists: item.artists.map(a => a.name).join(", "),
    image: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || null,
    progress_ms: r.body.progress_ms,
    duration_ms: item.duration_ms,
  });
});

app.get("/api/status", async (req, res) => {
  res.json({ connected: Boolean(await getAccessToken()) });
});

// ---- API invités : recherche ---------------------------------------------
app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ tracks: [] });
  const r = await spotify("/search?" + new URLSearchParams({ q, type: "track", limit: "8" }));
  res.json({ tracks: (r.body?.tracks?.items || []).map(mapTrack) });
});

// ---- API invités : liste d'attente + votes --------------------------------
// Récupération robuste des pistes d'une playlist : certaines playlists
// (souvent collaboratives) répondent vide à la requête filtrée → on réessaie en complet.
async function pistesDePlaylist(id) {
  let r = await spotify(`/playlists/${id}/tracks?` + new URLSearchParams({
    fields: "items(track(name,uri,artists(name),album(images)))",
    limit: "100",
    market: "from_token",
    additional_types: "track",
  }));
  let items = r.body?.items || [];
  const essai1 = `essai filtré: statut ${r.status}, ${items.length} éléments`;
  if (!items.length) {
    r = await spotify(`/playlists/${id}/tracks?limit=100&market=from_token`);
    items = r.body?.items || [];
    console.log(`📀 Playlist ${id} — ${essai1} | essai complet: statut ${r.status}, ${items.length} éléments`
      + (r.status >= 400 && r.body ? ` | réponse: ${JSON.stringify(r.body).slice(0, 200)}` : ""));
  }
  return items.filter(i => i.track).map(i => mapTrack(i.track));
}

// La playlist en cours de lecture, complète (pour que les invités la parcourent)
let playlistEnCoursCache = { id: null, at: 0, data: null };

app.get("/api/playlist-en-cours", async (req, res) => {
  const r = await spotify("/me/player/currently-playing");
  const ctx = r.body?.context;
  if (!ctx || ctx.type !== "playlist") return res.json({ actif: false });
  const id = ctx.uri.split(":").pop();
  if (playlistEnCoursCache.id === id && Date.now() - playlistEnCoursCache.at < 60_000) {
    return res.json(playlistEnCoursCache.data);
  }
  const info = await spotify(`/playlists/${id}?fields=name`);
  let tracks = await pistesDePlaylist(id);
  let source = "playlist";
  if (!tracks.length) {
    // Spotify bride la lecture du contenu des playlists pour certaines apps
    // récentes : on se rabat sur la file du lecteur (~20 prochains titres),
    // qui fonctionne toujours.
    const q = await spotify("/me/player/queue");
    tracks = (q.body?.queue || []).map(mapTrack);
    source = "queue";
  }
  const data = { actif: true, name: (info.body?.name || "Playlist").trim(), tracks, source };
  // On ne met en cache que les réponses utiles (jamais une liste vide)
  if (data.tracks.length) playlistEnCoursCache = { id, at: Date.now(), data };
  res.json(data);
});

// La suite de la lecture Spotify (les prochains titres de la playlist en cours)
let suiteCache = { at: 0, data: [] };
async function suiteSpotify() {
  if (Date.now() - suiteCache.at < 10_000) return suiteCache.data;
  const r = await spotify("/me/player/queue");
  suiteCache = {
    at: Date.now(),
    data: (r.body?.queue || []).slice(0, 3).map(mapTrack),
  };
  return suiteCache.data;
}

app.get("/api/queue", async (req, res) => {
  const suite = await suiteSpotify().catch(() => []);
  res.json({ queue: publicQueue(req), ouvert: demandesOuvertes, suite });
});

app.post("/api/queue", async (req, res) => {
  if (!demandesOuvertes) {
    return res.status(423).json({ error: "Les demandes sont en pause — elles rouvriront bientôt !" });
  }
  const { uri } = req.body || {};
  if (!uri || !uri.startsWith("spotify:track:")) {
    return res.status(400).json({ error: "Titre invalide." });
  }
  if (queue.find(t => t.uri === uri)) {
    return res.status(409).json({ error: "Déjà dans la liste — votez ♥ pour la faire remonter !" });
  }
  if (queue.length >= 50) {
    return res.status(429).json({ error: "La liste est pleine, votez plutôt !" });
  }
  const id = uri.split(":")[2];
  const r = await spotify("/tracks/" + id);
  if (!r.body) return res.status(500).json({ error: "Titre introuvable." });
  queue.push({ ...mapTrack(r.body), votes: 1, voters: [inviteId(req)], addedAt: Date.now() });
  res.json({ ok: true, queue: publicQueue(req) });
});

app.post("/api/vote", (req, res) => {
  const { uri } = req.body || {};
  const id = inviteId(req);
  const t = queue.find(x => x.uri === uri);
  if (!t) return res.status(404).json({ error: "Ce titre n'est plus dans la liste." });
  if (t.voters.includes(id)) {
    t.voters = t.voters.filter(v => v !== id);
    t.votes = Math.max(0, t.votes - 1);
  } else {
    t.voters.push(id);
    t.votes++;
  }
  res.json({ ok: true, queue: publicQueue(req) });
});

// ---- API invités : playlists créées par les invités -------------------------
// (reconstruites depuis Spotify : rien à perdre si le serveur redémarre)
app.get("/api/gplaylists", async (req, res) => {
  const pls = await playlistsInvites();
  res.json({ playlists: pls.map(p => ({ id: p.spotifyId, name: p.name, author: p.author })) });
});

app.post("/api/gplaylists", async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 60);
  const author = String(req.body?.author || "").trim().slice(0, 40);
  if (!name || !author) return res.status(400).json({ error: "Donnez un nom à la playlist et votre prénom." });
  const existantes = await playlistsInvites();
  if (existantes.length >= 30) return res.status(429).json({ error: "Trop de playlists pour ce soir !" });

  const me = await spotify("/me");
  if (!me.body?.id) {
    console.log(`👥 Création playlist invitée — /me a échoué, statut ${me.status}`);
    return res.status(500).json({ error: "Spotify n'est pas connecté." });
  }
  const r = await spotify(`/users/${me.body.id}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name: `${PREFIXE_INVITE}${name} (par ${author})`,
      public: false,
      description: "Playlist créée par un invité pour les 10 ans d'Audrey & Ludo",
    }),
  });
  if (!r.body?.id) {
    console.log(`👥 Création playlist invitée — statut ${r.status}, réponse: ${JSON.stringify(r.body || {}).slice(0, 300)}`);
    const detail = r.body?.error?.message;
    return res.status(500).json({ error: "Spotify a refusé la création" + (detail ? " (" + detail + ")" : ".") });
  }
  console.log(`👥 Playlist invitée créée : ${name} (par ${author})`);
  res.json({ ok: true, id: r.body.id });
});

// Sécurité : on ne touche qu'aux playlists portant le préfixe invité
async function playlistInviteAutorisee(id) {
  const r = await spotify(`/playlists/${id}?fields=id,name`);
  return r.body && r.body.name && r.body.name.startsWith(PREFIXE_INVITE) ? r.body : null;
}

app.get("/api/gplaylists/:id/tracks", async (req, res) => {
  const p = await playlistInviteAutorisee(req.params.id);
  if (!p) return res.status(404).json({ error: "Playlist inconnue." });
  const infos = parseNomInvite(p.name);
  const tracks = await pistesDePlaylist(p.id);
  res.json({ name: infos.name, author: infos.author, tracks });
});

app.post("/api/gplaylists/:id/tracks", async (req, res) => {
  const p = await playlistInviteAutorisee(req.params.id);
  if (!p) return res.status(404).json({ error: "Playlist inconnue." });
  const { uri } = req.body || {};
  if (!uri || !uri.startsWith("spotify:track:")) return res.status(400).json({ error: "Titre invalide." });
  const r = await spotify(`/playlists/${p.id}/tracks`, {
    method: "POST",
    body: JSON.stringify({ uris: [uri] }),
  });
  if (r.status >= 400) return res.status(500).json({ error: "Spotify a refusé l'ajout." });
  res.json({ ok: true });
});

// ---- Livre d'or : photos des invités (Cloudinary) ---------------------------------
// Les photos partent DIRECTEMENT du téléphone vers Cloudinary (le serveur
// ne fait que signer la demande) : rapide, gratuit, et rien n'est perdu
// même si le serveur redémarre.

function nettoie(s, max) {
  // Le "context" Cloudinary n'accepte ni | ni = dans les valeurs
  return String(s || "").replace(/[|=]/g, " ").trim().slice(0, max);
}

app.get("/api/livredor/config", (req, res) => {
  res.json({ actif: livredorActif });
});

app.post("/api/livredor/sign", (req, res) => {
  if (!livredorActif) return res.status(503).json({ error: "Le livre d'or n'est pas configuré." });
  const author = nettoie(req.body?.author, 40) || "Un invité";
  const comment = nettoie(req.body?.comment, 200);
  const timestamp = Math.floor(Date.now() / 1000);
  const context = `author=${author}|comment=${comment}`;
  // Signature Cloudinary : paramètres triés par ordre alphabétique + api_secret
  const toSign = `context=${context}&tags=${LIVREDOR_TAG}&timestamp=${timestamp}${cloudinary.api_secret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");
  res.json({
    cloud_name: cloudinary.cloud_name,
    api_key: cloudinary.api_key,
    timestamp, signature, context, tags: LIVREDOR_TAG,
  });
});

// ---- Réactions du livre d'or (likes + petits mots) --------------------------------
// Sauvegardées dans un petit fichier JSON sur Cloudinary : rien n'est perdu
// si le serveur redémarre, et aucun service supplémentaire n'est nécessaire.
// { publicId: { likes:[inviteId], comments:[{author,text,at}] } }
let social = {};
const SOCIAL_ID = "nos10ans-social.json";

async function chargerSocial() {
  if (!livredorActif) return;
  try {
    const r = await fetch(
      `https://res.cloudinary.com/${cloudinary.cloud_name}/raw/upload/${SOCIAL_ID}?t=${Date.now()}`
    );
    if (r.ok) social = await r.json();
  } catch { /* premier démarrage : pas encore de fichier */ }
}
chargerSocial();

let socialSaveTimer = null;
function sauverSocial() {
  clearTimeout(socialSaveTimer);
  socialSaveTimer = setTimeout(async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = { invalidate: "true", overwrite: "true", public_id: SOCIAL_ID, timestamp };
      const toSign = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&") + cloudinary.api_secret;
      const signature = crypto.createHash("sha1").update(toSign).digest("hex");
      await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloud_name}/raw/upload`, {
        method: "POST",
        body: new URLSearchParams({
          file: "data:application/json;base64," + Buffer.from(JSON.stringify(social)).toString("base64"),
          api_key: cloudinary.api_key,
          timestamp: String(timestamp),
          signature,
          public_id: SOCIAL_ID,
          overwrite: "true",
          invalidate: "true",
        }),
      });
    } catch { /* on retentera à la prochaine réaction */ }
  }, 2000);
}

function socialDe(publicId) {
  if (!social[publicId]) social[publicId] = { likes: [], comments: [] };
  return social[publicId];
}

app.post("/api/livredor/like", (req, res) => {
  const id = String(req.body?.id || "");
  if (!id) return res.status(400).json({ error: "Photo inconnue." });
  const s = socialDe(id);
  const qui = inviteId(req);
  if (s.likes.includes(qui)) s.likes = s.likes.filter(x => x !== qui);
  else s.likes.push(qui);
  sauverSocial();
  res.json({ ok: true, likes: s.likes.length, jaiLike: s.likes.includes(qui) });
});

app.post("/api/livredor/comment", (req, res) => {
  const id = String(req.body?.id || "");
  const text = String(req.body?.text || "").trim().slice(0, 200);
  const author = String(req.body?.author || "Un invité").trim().slice(0, 40);
  if (!id || !text) return res.status(400).json({ error: "Petit mot vide." });
  const s = socialDe(id);
  if (s.comments.length >= 100) return res.status(429).json({ error: "Cette photo a déjà beaucoup de mots !" });
  s.comments.push({ author, text, at: Date.now() });
  sauverSocial();
  res.json({ ok: true, comments: s.comments });
});

// Liste de la galerie, mise en cache 10 s (tous les invités la consultent)
let galerieCache = { at: 0, data: null };

app.get("/api/livredor", async (req, res) => {
  if (!livredorActif) return res.json({ actif: false, photos: [] });
  const qui = inviteId(req);
  // Le cache ne porte que sur la liste Cloudinary ; les réactions sont toujours fraîches
  if (!galerieCache.data || Date.now() - galerieCache.at >= 10_000) {
    try {
      const r = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinary.cloud_name}/resources/image/tags/${LIVREDOR_TAG}?context=true&max_results=200`,
        { headers: { Authorization: "Basic " + Buffer.from(cloudinary.api_key + ":" + cloudinary.api_secret).toString("base64") } }
      );
      const body = await r.json();
      const photos = (body.resources || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(p => ({
          id: p.public_id,
          thumb: p.secure_url.replace("/upload/", "/upload/w_400,h_400,c_fill,q_auto,f_auto/"),
          grand: p.secure_url.replace("/upload/", "/upload/w_1200,q_auto,f_auto/"),
          author: p.context?.custom?.author || "Un invité",
          comment: p.context?.custom?.comment || "",
          date: p.created_at,
        }));
      galerieCache = { at: Date.now(), data: photos };
    } catch {
      return res.json({ actif: true, photos: [], error: "Galerie momentanément indisponible." });
    }
  }
  const photos = galerieCache.data.map(p => {
    const s = social[p.id] || { likes: [], comments: [] };
    return { ...p, likes: s.likes.length, jaiLike: s.likes.includes(qui), comments: s.comments };
  });
  res.json({ actif: true, photos });
});

// ---- API admin -----------------------------------------------------------------
function adminOk(req) {
  return !admin_code || req.headers["x-admin-code"] === admin_code;
}

let playlistsAdminCache = { at: 0, data: null };

app.get("/api/admin/playlists", async (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  if (playlistsAdminCache.data && Date.now() - playlistsAdminCache.at < 60_000) {
    return res.json({ playlists: playlistsAdminCache.data });
  }
  const r = await spotify("/me/playlists?limit=50");
  const playlists = (r.body?.items || []).map(p => ({
    id: p.id, uri: p.uri, name: p.name,
    total: p.tracks?.total ?? null, // parfois absent (playlists collaboratives)
    image: p.images?.[p.images.length - 1]?.url || null,
    invite: p.name.startsWith(PREFIXE_INVITE),
  }));
  // Compléter les totaux manquants (l'API ne les renvoie pas toujours)
  const manquants = playlists.filter(p => p.total === null || p.total === 0).slice(0, 30);
  await Promise.all(manquants.map(async p => {
    const d = await spotify(`/playlists/${p.id}?fields=tracks(total)`);
    if (typeof d.body?.tracks?.total === "number") p.total = d.body.tracks.total;
  }));
  playlistsAdminCache = { at: Date.now(), data: playlists };
  res.json({ playlists });
});

app.post("/api/admin/play", async (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  const { uri } = req.body || {};
  if (!uri || !uri.startsWith("spotify:playlist:")) return res.status(400).json({ error: "Playlist invalide." });
  const r = await spotify("/me/player/play", {
    method: "PUT",
    body: JSON.stringify({ context_uri: uri }),
  });
  if (r.status === 404) return res.status(404).json({ error: "Aucun appareil actif : ouvrez Spotify sur l'ordinateur et lancez un titre." });
  if (r.status >= 400) return res.status(500).json({ error: "Spotify a refusé." });
  res.json({ ok: true });
});

app.post("/api/admin/clear-queue", (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  queue = [];
  res.json({ ok: true });
});

// Pause / reprise des demandes des invités (dîner, discours, pièce montée…)
app.post("/api/admin/demandes", (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  demandesOuvertes = Boolean(req.body?.ouvert);
  res.json({ ok: true, ouvert: demandesOuvertes });
});

// Retirer UN titre de la liste d'attente (modération légère)
app.post("/api/admin/retirer", (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  const { uri } = req.body || {};
  const avant = queue.length;
  queue = queue.filter(t => t.uri !== uri);
  res.json({ ok: true, retire: avant !== queue.length });
});

// État de la soirée pour la page admin
app.get("/api/admin/etat", (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  res.json({
    ouvert: demandesOuvertes,
    queue: [...queue]
      .sort((a, b) => b.votes - a.votes || a.addedAt - b.addedAt)
      .map(t => ({ uri: t.uri, title: t.title, artists: t.artists, image: t.image, votes: t.votes })),
  });
});

// Pour l'hébergement en ligne : récupérer le refresh token à mettre
// en variable d'environnement SPOTIFY_REFRESH_TOKEN (protégé par le code admin)
app.get("/api/admin/refresh-token", (req, res) => {
  if (!adminOk(req)) return res.status(403).json({ error: "Code admin incorrect." });
  const token = getStoredRefreshToken();
  if (!token) return res.status(404).json({ error: "Pas encore connecté à Spotify." });
  res.json({ refresh_token: token });
});

// ---- Le chef d'orchestre ----------------------------------------------------------
let dernierEnvoiPour = null;

async function chefDOrchestre() {
  try {
    if (!demandesOuvertes || !queue.length) return;
    const r = await spotify("/me/player/currently-playing");
    if (r.status !== 200 || !r.body?.item || !r.body.is_playing) return;
    const { progress_ms } = r.body;
    const { duration_ms, id: trackId } = r.body.item;

    if (duration_ms - progress_ms <= MARGE_FIN_MS && dernierEnvoiPour !== trackId) {
      const [gagnante] = [...queue].sort((a, b) => b.votes - a.votes || a.addedAt - b.addedAt);
      const envoi = await spotify("/me/player/queue?uri=" + encodeURIComponent(gagnante.uri), { method: "POST" });
      if (envoi.status === 200 || envoi.status === 204) {
        dernierEnvoiPour = trackId;
        queue = queue.filter(t => t.uri !== gagnante.uri);
        console.log(`🎶 Envoyée à Spotify : ${gagnante.title} — ${gagnante.artists} (${gagnante.votes} ♥)`);
      }
    }
  } catch { /* on réessaie au prochain tour */ }
}
setInterval(chefDOrchestre, 5000);

// ---- Démarrage -----------------------------------------------------------------------
app.listen(port, () => {
  const os = require("os");
  const nets = os.networkInterfaces();
  let localIp = "localhost";
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) localIp = net.address;
    }
  }
  console.log("\n🎶  Nos 10 ans — application démarrée !");
  console.log(`   Page admin (vous)  : http://localhost:${port}/admin.html`);
  console.log(`   Page invités       : http://${localIp}:${port}`);
  console.log("   (en ligne, utilisez l'adresse fournie par votre hébergeur)\n");
});
