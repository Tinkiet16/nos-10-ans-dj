/* ============================================================================
   Utilitaires partagés entre la page invités et le pupitre des mariés.
   Aucune logique métier ici : DOM, réseau, rendu de listes.
   ========================================================================= */

const $ = id => document.getElementById(id);

function esc(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---- Toast, avec action facultative (« Réessayer », « Annuler ») ----------
   Sans action : disparaît en 2,6 s. Avec action : 6 s, le temps de la lire
   et de la toucher. */
let toastMinuteur;
function toast(message, options){
  const boite = $('toast');
  const action = options && options.action;
  boite.innerHTML = '<span class="toast-texte"></span>'
    + (action ? '<button class="toast-action" type="button"></button>' : '');
  boite.querySelector('.toast-texte').textContent = message;
  if(action){
    const bouton = boite.querySelector('.toast-action');
    bouton.textContent = action;
    bouton.onclick = () => { masquerToast(); options.surAction(); };
  }
  boite.classList.add('visible');
  clearTimeout(toastMinuteur);
  toastMinuteur = setTimeout(masquerToast, action ? 6000 : 2600);
}
function masquerToast(){ $('toast').classList.remove('visible'); }

/* ---- Couche réseau --------------------------------------------------------
   api() ne lève JAMAIS pour un statut HTTP : l'appelant lit .ok et .statut.
   Elle ne lève que si la requête n'a pas abouti (réseau coupé, délai dépassé),
   ce qui permet à creerSondage de distinguer « le serveur a répondu non » de
   « le serveur n'a pas répondu ». */
let fournisseurEnTetes = () => ({});
function configurerApi(fn){ fournisseurEnTetes = fn; }

/* 5 s et non 8 : un vote est un geste bref, et laisser un invité croire
   8 secondes que son ♥ est passé coûte plus cher qu'un « Réessayer »
   proposé tôt. Les envois de photos ont leur propre délai (120 s). */
const DELAI_MS = 5000;

async function api(url, options){
  options = options || {};
  // AbortController plutôt qu'AbortSignal.timeout : compatible Safari < 16,
  // qu'on croisera forcément parmi les téléphones des invités.
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try{
    const r = await fetch(url, {
      ...options,
      signal: controleur.signal,
      headers: {
        ...fournisseurEnTetes(),
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {}),
      },
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, statut: r.status, data };
  } finally {
    clearTimeout(minuteur);
  }
}

/* ---- Sondage avec reprise automatique -------------------------------------
   Cadence normale = periodeMs. Après un échec : 2×, 4×, 8×… plafonné à 30 s.
   Retour à la cadence normale dès la première réponse valide. Un sondage ne
   s'arrête donc jamais sur une erreur : il ralentit, puis repart seul. */
const Reseau = {
  _enEchec: new Set(),
  _surChangement: null,
  enPanne(){ return this._enEchec.size > 0; },
  surChangement(fn){ this._surChangement = fn; },
  _signaler(nom, ok){
    const avant = this.enPanne();
    if(ok) this._enEchec.delete(nom); else this._enEchec.add(nom);
    if(this._surChangement && avant !== this.enPanne()) this._surChangement(this.enPanne());
  },
};

/* ---- Icônes partagées -----------------------------------------------------
   Jamais d'emoji comme icône d'interface : rendu variable d'un téléphone à
   l'autre, et impossible à colorer par les jetons de style. Les emojis dans
   les phrases (🥂, ♥, 💔) relèvent du ton et restent. */
const SVG_ = (corps, taille) =>
  '<svg viewBox="0 0 24 24" width="'+(taille||18)+'" height="'+(taille||18)+'" fill="none" '+
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '+
  'aria-hidden="true">'+corps+'</svg>';

const SVG_PLUS  = SVG_('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 20);
const SVG_CROIX = SVG_('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>');
const SVG_COCHE = SVG_('<polyline points="20 6 9 17 4 12"/>');

/* ---- Rendu de liste réconcilié par clé ------------------------------------
   Met à jour les nœuds EN PLACE au lieu de tout recréer : la saisie en cours,
   le focus et les animations survivent au rafraîchissement.
   Les nœuds sans data-cle (squelettes, message « liste vide ») sont ignorés :
   gérer ces états hors du conteneur, ou les retirer avant d'appeler. */
function rendreListe(conteneur, items, cle, construire, mettreAJour){
  const existants = new Map();
  for(const noeud of Array.from(conteneur.children)){
    if(noeud.dataset && noeud.dataset.cle) existants.set(noeud.dataset.cle, noeud);
  }
  const voulus = [];
  for(const item of items){
    const k = String(cle(item));
    let noeud = existants.get(k);
    if(noeud){ mettreAJour(noeud, item); existants.delete(k); }
    else { noeud = construire(item); noeud.dataset.cle = k; }
    voulus.push(noeud);
  }
  for(const orphelin of existants.values()) orphelin.remove();
  voulus.forEach((noeud, i) => {
    if(conteneur.children[i] !== noeud){
      conteneur.insertBefore(noeud, conteneur.children[i] || null);
    }
  });
}

/* ---- FLIP : anime un réordonnancement sans animer la mise en page ---------
   transform/opacity uniquement. Interruptible : l'animation précédente est
   annulée, et l'état final est celui du DOM — jamais posé par une animation
   dont on attendrait la fin. */
function flip(conteneur, muter, duree){
  duree = duree || 320;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){ muter(); return; }
  const avant = new Map();
  for(const n of conteneur.children) avant.set(n, n.getBoundingClientRect().top);
  muter();
  for(const n of conteneur.children){
    const depart = avant.get(n);
    if(depart === undefined) continue;            // nœud nouveau : pas de FLIP
    const ecart = depart - n.getBoundingClientRect().top;
    if(!ecart) continue;
    if(n._animFlip) n._animFlip.cancel();
    n._animFlip = n.animate(
      [{transform:'translateY(' + ecart + 'px)'}, {transform:'translateY(0)'}],
      {duration: duree, easing:'cubic-bezier(.2,.8,.2,1)'}
    );
  }
}

function creerSondage(nom, action, periodeMs){
  let echecs = 0, minuteur = null, arrete = false;
  async function tour(){
    try{ await action(); echecs = 0; Reseau._signaler(nom, true); }
    catch(e){ echecs++; Reseau._signaler(nom, false); }
    if(arrete) return;
    const attente = echecs
      ? Math.min(30000, periodeMs * Math.pow(2, echecs))
      : periodeMs;
    minuteur = setTimeout(tour, attente);
  }
  tour();
  return { arreter(){ arrete = true; clearTimeout(minuteur); } };
}
