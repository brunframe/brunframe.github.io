/* La boutique immersive Breslev Gang : on entre dans la salle recréée et, d'une seule traite, on passe devant les deux
 * premières vitrines jusqu'à la première pièce ; puis on marche de vitrine en vitrine autour du cercle, et la visite
 * finit face au grand logo Breslev Gang, au fond de la salle (le film de la marque est déjà en haut de l'accueil).
 *
 * Arrêts : 0 entrée · 1 à 6 les six vitrines (une par pièce de data/products.json) · 7 la table des bracelets · 8 le mur au logo.
 * Depuis le 5 novembre, les images et les marches sont faites en 2,5D (_build/v2/) : buste neutre, colliers tirés de leurs photos.
 * À chaque arrêt, une image fixe ; entre deux arrêts (en avançant), une vidéo de marche calculée en 4K à 60 images/s,
 * lue par le décodeur matériel du navigateur (fluide, aucune image à décoder par le script). Le dernier plan d'une vidéo
 * est identique à l'image de l'arrêt suivant : le relais est invisible. En reculant, fondu enchaîné entre les arrêts.
 * Aucune 3D, aucune bibliothèque.
 */
(() => {
  'use strict';
  const D = window.DONNEES;
  const C = Object.assign({ SITE_URL: '', EXT: '', COLLECTION: '/collections/all', ACCUEIL: '/' }, D.config || {});
  // 6 novembre : sur la vraie boutique, cette page est hébergée ailleurs (GitHub Pages) et affichée dans le site Shopify ;
  // ses liens doivent mener aux fiches du site qui l'affiche, pas à celles de la démo. La section donne l'adresse du site
  // (?site=…) ; à défaut, celle de la page qui l'affiche. Même site (la démo) : rien ne change.
  (() => {
    if (window.parent === window) return;
    try { if (window.parent.location.href) return; } catch (e) { /* autre site : on continue */ }
    let o = '';
    try {
      const u = new URL(new URLSearchParams(location.search).get('site') || '');
      if (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') o = u.origin;
    } catch (e) { /* adresse absente ou invalide */ }
    if (!o) { try { o = new URL(document.referrer).origin; } catch (e) { o = ''; } }
    if (o && o !== 'null' && o !== location.origin) Object.assign(C, { SITE_URL: o, EXT: '', COLLECTION: '/collections/all', ACCUEIL: '/' });
  })();
  const PRODUITS = D.products.produits;
  const SALLE = D.salle || {};
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t, a, b) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- liens et données
  const prixTexte = (n) => `${n} €`;
  const lienProduit = (p) => `${C.SITE_URL}/products/${p.fiche}${C.EXT}${p.couleur ? '?couleur=' + encodeURIComponent(p.couleur) : ''}`;
  const lienCollection = `${C.SITE_URL}${C.COLLECTION}`;
  // une catégorie (la table des bracelets) : /collections/all/<étiquette> sur Shopify, categorie-<étiquette>.html en démo
  const lienCategorie = (cat) => (C.EXT ? `${C.SITE_URL}/categorie-${cat}${C.EXT}` : `${C.SITE_URL}/collections/all/${cat}`);
  const lienArret = (p) => (p.collection ? lienCategorie(p.collection) : lienProduit(p));
  const prixArret = (p) => p.prix_texte || prixTexte(p.prix);
  const echappe = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  $$('[data-lien="collection"]').forEach((a) => { a.href = lienCollection; });
  $$('[data-lien="accueil"]').forEach((a) => { a.href = `${C.SITE_URL}${C.ACCUEIL}`; });

  // ---------------------------------------------------------------- format et définition
  const portraitMQ = matchMedia('(max-aspect-ratio: 9/10)');
  // format voulu par l'écran ; s'il n'est pas encore calculé, on montre l'autre en entier (bandes sur les côtés)
  const fmtVoulu = () => (portraitMQ.matches ? '9x16' : '16x9');
  const fmt = () => { const f = fmtVoulu(); return SALLE[f] || !SALLE[f === '9x16' ? '16x9' : '9x16'] ? f : (f === '9x16' ? '16x9' : '9x16'); };
  // H.265 si le navigateur le lit (plus léger), sinon H.264 ; sans vidéo (rare) : fondus enchaînés entre les arrêts
  const essai = document.createElement('video');
  const HEVC = !!essai.canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"');
  const CODEC = HEVC ? 'hevc' : 'h264';
  // 8 novembre (audit) : « économie de données » : images fixes seulement, aucune vidéo téléchargée (fondus entre les
  // arrêts). VIDEO_OK peut aussi tomber en route : codec annoncé mais illisible, réseau coupé (voir panne()).
  const ECONOMIE = !!(navigator.connection && navigator.connection.saveData);
  let VIDEO_OK = !ECONOMIE && (HEVC || !!essai.canPlayType('video/mp4; codecs="avc1.640033"'));
  if (!VIDEO_OK) root.classList.add('sans-video');
  // boutique allumée (site en Blanc) ou éteinte (site en Noir) : le bouton Blanc/Noir du site éteint vraiment la boutique
  // une seule salle, allumée (5 novembre : six colliers, buste neutre ; l'ancienne salle éteinte montrait les anciens colliers)
  const lireVersion = () => 'allume';
  let VERSION = lireVersion();
  const NV = PRODUITS.length;                                         // vitrines, une pièce chacune
  // segment i : de l'arrêt i à l'arrêt i + 1 (i : l'entrée ; v2… : d'une vitrine à la suivante ; f : vers le logo)
  const SEGMENTS = ['i'].concat(PRODUITS.slice(1).map((p, k) => `v${k + 2}`), ['f']);
  const FIN = SEGMENTS.length;                                        // dernier arrêt : le mur au logo
  const DERNIER = NV;                                                 // dernière vitrine
  const deux = (n) => String(n).padStart(2, '0');
  // définition (5 novembre) : chaque écran reçoit des images et des vidéos au moins aussi grandes que ses pixels réels
  // (téléphone 900 × 1600 ou 1440 × 2560 ; ordinateur et télé 1920 × 1080, 2560 × 1440 ou 3840 × 2160) ;
  // connexion lente ou « économie de données » : la plus légère. Les gros plans et la levée des bracelets restent communs.
  const reseau = navigator.connection || {};
  const LENT = !!reseau.saveData || /(^|-)2g|3g/.test(reseau.effectiveType || '');
  let F_ = fmt();             // format affiché (9x16 ou 16x9) ; DEF : sa définition ('', '-hd', '-uhd')
  let DEF = '';
  const DEFS = SALLE.definitions || {};           // définitions livrées par format (data/salle.json) ; absentes : toutes
  function definition(f) {
    if (LENT) return '';
    const p = window.devicePixelRatio || 1;
    const w = (f === '9x16' ? Math.max(vw, vh * 9 / 16) : Math.max(vw, vh * 16 / 9)) * p;   // largeur affichée (cover)
    let d = f === '9x16' ? (w > 1000 ? '-hd' : '') : (w > 2700 ? '-uhd' : w > 1980 ? '-hd' : '');
    const ok = DEFS[f] || ['', '-hd', '-uhd'];
    const ordre = ['', '-hd', '-uhd'];
    while (d && ok.indexOf(d) < 0) d = ordre[ordre.indexOf(d) - 1];      // définition absente : la plus proche en dessous
    return d;
  }
  const dossier = (f) => `${f}${f === F_ ? DEF : ''}`;
  const arretSrc = (f, i) => `assets/film/${VERSION}/${dossier(f)}/arrets/arret-${i}.webp`;
  // segment i joué à l'endroit (de l'arrêt i à i + 1) ou à l'envers (de i + 1 à i : on revient sans fondu)
  // 6 novembre : marches à 60 images/s partout, à 120 sur les écrans rapides (rafraîchissement mesuré au démarrage,
  // data/salle.json « hz120 » : formats où les fichiers existent) ; iPhone en économie d'énergie (30 Hz) : 60
  let HZ120 = false;
  const videoSrc = (f, i, inv) => `assets/film/${VERSION}/${dossier(f)}/${CODEC}${HZ120 && (SALLE.hz120 || []).indexOf(f) >= 0 ? '-120' : ''}/${SEGMENTS[i]}${inv ? '-inverse' : ''}.mp4`;

  // ---------------------------------------------------------------- version statique (mouvement réduit)
  const liste = $('.diaporama-liste');
  PRODUITS.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<figure><picture><source media="(max-aspect-ratio: 9/10)" srcset="${arretSrc('9x16', p.n)}">
      <img src="${arretSrc('16x9', p.n)}" alt="${p.alt}" width="1920" height="1080" loading="lazy" decoding="async"></picture>
      <figcaption><span class="d-num">${deux(p.n)} / ${deux(NV)}</span><span class="d-nom">${p.nom}</span><span class="d-ref">${p.liste ? '' : 'Réf. '}${p.ref}</span>
      <span class="d-prix">${prixArret(p)}</span><a class="bouton" href="${lienArret(p)}">${p.bouton || 'Découvrir la pièce'}</a></figcaption></figure>`;
    liste.appendChild(li);
  });
  // ---------------------------------------------------------------- « Passer l'animation » (8 novembre, audit)
  // Dans l'accueil (le site répond à la boutique), le site va au catalogue ; sans réponse du site (ancienne version du
  // thème, page affichée ailleurs), le lien ouvre le catalogue dans la fenêtre principale (<base target="_top">), jamais
  // dans le cadre. Posé avant la version statique : il sert aussi en mouvement réduit.
  const embarque = window.parent !== window;
  let parentRepond = false;
  if (embarque) {
    root.classList.add('embarque');
    addEventListener('message', (e) => { if (e.source === window.parent && e.data && e.data.boutique === 'cadre') parentRepond = true; });
    $$('.passer, .evitement').forEach((a) => a.addEventListener('click', (e) => {
      if (!parentRepond) return;
      e.preventDefault();
      // « bord » pour les thèmes d'avant le 8 novembre (le site défile jusqu'à la section suivante) ; « passer » : le catalogue
      try { window.parent.postMessage({ boutique: 'bord', dir: 1, passer: true }, '*'); } catch (err) { /* sans effet */ }
    }));
  }
  const rmQuery = matchMedia('(prefers-reduced-motion: reduce)');
  rmQuery.addEventListener && rmQuery.addEventListener('change', () => root.classList.toggle('rm', rmQuery.matches));
  if (root.classList.contains('rm')) return;

  // ---------------------------------------------------------------- éléments
  const cadre = $('#cadre');
  const stage = $('#stage');
  const stills = [$('.arret--a'), $('.arret--b')];
  const marches = $('.marches');
  const fiche = $('#fiche');
  const ouverture = $('.ouverture');
  const arrivee = $('.arrivee');
  const fin = $('#fin');
  const chargement = $('.chargement');
  const respireEl = $('.respire');
  const survol = $('.survol');
  const sctx = survol.getContext('2d');
  const gros = $('#gros');
  const grosImg = $('.gros__img', gros);
  const G = {};
  $$('[data-g]', gros).forEach((el) => { G[el.dataset.g] = el; });
  const intro = $('#intro');
  const cvs = $('.eclats');
  const ctx = cvs.getContext('2d');
  const F = {};
  $$('[data-f]', fiche).forEach((el) => { F[el.dataset.f] = el; });
  if (F.total) F.total.textContent = deux(NV);

  const points = $('.points');
  const LIBELLES = ['L’entrée'].concat(PRODUITS.map((p) => `Vitrine ${p.n} : ${p.nom}`), ['Le logo Breslev Gang']);
  LIBELLES.forEach((txt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'point' + (i === 0 || i === FIN ? ' salle' : '');
    b.setAttribute('aria-label', `Aller à : ${txt}`);
    b.addEventListener('click', () => { if (!pris()) aligner(0); entreeFaite = true; goTo(i); });
    points.appendChild(b);
  });
  const dots = $$('.point', points);

  // ---------------------------------------------------------------- état
  const BAS_PENDENTIFS = 0.76;   // portrait : bas du plus long pendentif (fraction de l'image 9:16, cadrage du 5 novembre)
  let ANCRE_Y = 1;
  let at = 0;                 // arrêt courant (entier)
  let pos = 0;                // position continue (pour les textes et les fondus)
  let lecture = null;         // { i, v, inv } : vidéo de marche en cours (inv : à l'envers)
  let enAttente = 0;          // pas demandés pendant une marche (+1 / -1)
  let fondu = null;           // { de, vers, t0, dur } : fondu enchaîné entre deux arrêts
  let actif = 0;              // index de l'image d'arrêt visible
  let ficheIdx = -1;
  const pistes = {};          // une balise <video> par segment et par sens, créée à la demande
  let entreeFaite = false;    // la marche d'entrée est partie (seule ou par un geste) : plus d'entrée automatique
  let entreeMinuteur = 0;
  let autoEnCours = false;    // marche lancée par la page (pas par un geste) : si la lecture est refusée, on attend le geste
  let introEtat = 0;          // film de la marque avant la boutique (page seule) : 0 aucun, 1 en cours, 2 fini
  const introOuverte = () => introEtat === 1;

  function piste(i, inv) {
    const k = inv ? `${i}r` : String(i);
    if (!pistes[k]) {
      const v = document.createElement('video');
      v.muted = true; v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.setAttribute('disablepictureinpicture', ''); v.setAttribute('disableremoteplayback', '');
      v.preload = 'none';
      v.dataset.seg = SEGMENTS[i] + (inv ? '-inverse' : '');
      v.addEventListener('ended', () => finDeMarche(i, inv));
      v.addEventListener('error', () => panne(v));
      v.addEventListener('playing', () => { dejaLu = true; });
      marches.appendChild(v);
      pistes[k] = v;
    }
    return pistes[k];
  }
  function creeVideos() {
    marches.innerHTML = '';
    Object.keys(pistes).forEach((k) => { delete pistes[k]; });
  }
  // 8 novembre (audit) : une marche illisible (codec annoncé mais absent, fichier abîmé, réseau coupé) ne reste jamais à
  // l'écran : l'image fixe de l'arrêt (son affiche) demeure et l'on passe à l'arrêt visé en fondu. Fichier reçu en entier
  // mais illisible alors qu'aucune marche n'a encore été lue : plus aucune vidéo pour la visite (fondus seulement, plus
  // aucun téléchargement) ; sinon (réseau, décodeur saturé) : à la troisième panne. « Passer l'animation » reste à
  // l'écran dans tous les cas.
  let pannes = 0, dejaLu = false;
  const echecs = {};                        // marches dont le téléchargement a échoué : on ne les attend plus
  const jouable = (i, inv) => VIDEO_OK && !echecs[videoSrc(F_, i, inv)];
  function sansVideo() {
    if (!VIDEO_OK) return;
    VIDEO_OK = false;
    root.classList.add('sans-video');
    fileTout += 1;                          // la file de préchargement s'arrête
    const enCours = lecture;
    lecture = null;
    Object.values(pistes).forEach((x) => { x.pause(); x.removeAttribute('src'); x.load(); });
    oublie();
    creeVideos();
    if (enCours) sautVers(enCours.inv ? enCours.i : enCours.i + 1);
  }
  function panne(v, cale) {
    const k = Object.keys(pistes).find((x) => pistes[x] === v);
    const code = v.error ? v.error.code : 0;
    if (k === undefined || code === 1) return;          // vidéo déjà oubliée, ou chargement interrompu par la page
    const enCours = lecture && lecture.v === v ? lecture : null;
    if (enCours) { lecture = null; v.classList.remove('is-on'); chargement.classList.remove('is-on'); }
    if (!cale && !dejaLu && (v.dataset.src === 'memoire' || code === 3)) sansVideo();
    else if (++pannes >= 3) sansVideo();
    else { v.pause(); v.removeAttribute('src'); v.remove(); delete pistes[k]; }
    if (enCours) sautVers(enCours.inv ? enCours.i : enCours.i + 1);
  }
  // Chaque vidéo de marche est téléchargée à l'avance en entier (en mémoire) pendant qu'on regarde la vitrine :
  // la marche démarre alors instantanément, même sur iPhone (qui ne précharge pas les vidéos de lui-même).
  let memoire = {};
  let codecVerifie = Promise.resolve();     // réponse de mediaCapabilities (démarrage) : aucune marche téléchargée avant
  function telecharge(url) {
    if (!memoire[url]) {
      memoire[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
        .then((b) => URL.createObjectURL(b)).catch(() => {
          if (memoire[url]) { echecs[url] = true; if (++pannes >= 3) sansVideo(); }
          return null;
        });
    }
    return memoire[url];
  }
  function oublie() {
    Object.values(memoire).forEach((p) => p.then((u) => { if (u) URL.revokeObjectURL(u); }));
    memoire = {};
  }
  // amorce : la vidéo est lue une fraction de seconde puis remise au début, cachée ; le décodeur est prêt, la marche
  // démarre dans l'image qui suit le geste (iPhone ne décode rien tant qu'on n'a pas demandé la lecture)
  function amorce(v) {
    if (v.dataset.amorce || (lecture && lecture.v === v)) return;
    v.dataset.amorce = '1';
    const p = v.play();
    const stop = () => { if (lecture && lecture.v === v) return; v.pause(); try { v.currentTime = 0; } catch (e) { /* sans effet */ } };
    if (p && p.then) p.then(stop, () => { delete v.dataset.amorce; }); else stop();
  }
  function prepare(i, inv) {
    if (!VIDEO_OK || i < 0 || i >= SEGMENTS.length) return Promise.resolve();
    const v = piste(i, inv);
    if (v.dataset.charge) return v.pret || Promise.resolve();
    v.dataset.charge = '1';
    v.poster = arretSrc(F_, inv ? i + 1 : i);
    const url = videoSrc(F_, i, inv);
    v.pret = codecVerifie.then(() => (VIDEO_OK ? telecharge(url) : null)).then((u) => {
      if (!u || pistes[inv ? `${i}r` : String(i)] !== v || v.dataset.src) return;
      v.dataset.src = 'memoire';
      v.preload = 'auto';
      v.src = u;
      v.load();
      amorce(v);
    });
    return v.pret;
  }
  // toutes les marches, une à une (la plus probable d'abord) : un pas rapide ne tombe jamais sur une vidéo absente
  let fileTout = 0, toutEnAttente = false;
  function prepareTout() {
    // sous l'accueil, la boutique encore hors de l'écran ne télécharge que sa première marche ; connexion lente :
    // seulement la marche suivante et le retour (le reste arrive pas à pas)
    prechargeArrets();
    if (LENT) return;
    if (embarque && !aligne && !entreeFaite) { toutEnAttente = true; return; }
    toutEnAttente = false;
    const jeton = ++fileTout;
    const ordre = [];
    for (let k = at; k < SEGMENTS.length; k += 1) ordre.push([k, false]);
    for (let k = at - 1; k >= 0; k -= 1) ordre.push([k, true]);
    for (let k = 0; k < at; k += 1) ordre.push([k, false]);
    for (let k = at; k < SEGMENTS.length; k += 1) ordre.push([k, true]);
    const suite = (n) => { if (n >= ordre.length || jeton !== fileTout) return; prepare(ordre[n][0], ordre[n][1]).then(() => suite(n + 1), () => suite(n + 1)); };
    prechargeArrets().then(() => suite(0));               // les images fixes d'abord (la marche suivante part déjà de son côté)
  }
  function source(i, inv) {                 // la vidéo n'est pas encore en mémoire : lecture directe depuis le réseau
    const v = piste(i, inv);
    if (v.dataset.src) return;
    v.dataset.src = 'reseau';
    v.preload = 'auto';
    v.src = videoSrc(F_, i, inv);
  }
  function precharge(i) {
    if (i < 0 || i > FIN) return;
    const im = new Image();
    im.decoding = 'async';
    im.src = arretSrc(F_, i);
  }
  // les neuf images fixes (≈ 0,8 Mo) avant les vidéos, les plus proches d'abord : sur réseau lent, un fondu de secours a
  // toujours son image d'arrivée, au lieu d'attendre derrière le téléchargement des marches
  const arretsCharges = {};
  function prechargeArrets() {
    if (!arretsCharges[F_]) {
      const ordre = Array.from({ length: FIN + 1 }, (_, i) => i).sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
      arretsCharges[F_] = Promise.all(ordre.map((i) => new Promise((ok) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = im.onerror = () => ok();
        im.src = arretSrc(F_, i);
      })));
    }
    return arretsCharges[F_];
  }

  // image d'arrêt : fondu (true) ou relais instantané (false)
  function montreArret(i, fonduOn, quandPose) {
    const suiv = stills[1 - actif];
    const prec = stills[actif];
    const src = arretSrc(F_, i);
    return new Promise((res) => {
      const pose = () => {
        if (quandPose) quandPose();

        suiv.classList.toggle('fondu', !!fonduOn);
        suiv.classList.add('dessus');
        prec.classList.remove('dessus');
        requestAnimationFrame(() => {
          suiv.classList.add('is-on');
          const fini = () => { prec.classList.remove('is-on'); prec.classList.remove('fondu'); res(); };
          if (fonduOn) setTimeout(fini, 780); else fini();
        });
        actif = 1 - actif;
      };
      if (suiv.getAttribute('src') === src && suiv.complete) { pose(); return; }
      suiv.src = src;
      (suiv.decode ? suiv.decode() : Promise.resolve()).then(pose, pose);
    });
  }

  // ---------------------------------------------------------------- navigation
  function marcher(i, inv) {                // segment i : de l'arrêt i à i + 1, ou à l'envers de i + 1 à i
    const v = piste(i, inv);
    prepare(i, inv);
    source(i, inv);
    lecture = { i, v, inv: !!inv, t0: performance.now() };
    const but = inv ? i : i + 1;
    const entree = i === 0 && !inv;          // la marche d'entrée : on la voit toujours, quitte à l'attendre
    const geste = !autoEnCours;
    entreeFaite = entreeFaite || entree;
    poseTable();
    if (v.currentTime) v.currentTime = 0;
    v.playbackRate = Math.min(1.9, 1 + 0.45 * Math.abs(enAttente));   // plus vive si d'autres pas attendent
    const p = v.play();                      // appelé dans le geste de l'utilisateur (iPhone, mode économie d'énergie)
    Object.values(pistes).forEach((x) => { if (x !== v) x.classList.remove('devant'); });
    v.classList.add('is-on', 'devant');      // l'affiche de la vidéo est l'image de l'arrêt : rien ne bouge avant la première image
    // entre deux vitrines, jamais d'attente visible : une marche qui ne démarre pas tout de suite laisse place à un fondu
    const attente = entree ? 0 : setTimeout(() => { if (lecture && lecture.v === v && v.currentTime === 0) chargement.classList.add('is-on'); }, 220);
    const secours = entree ? 0 : setTimeout(() => {
      chargement.classList.remove('is-on');
      if (lecture && lecture.v === v && v.currentTime === 0 && v.readyState < 3) { v.pause(); v.classList.remove('is-on'); lecture = null; sautVers(but); }
    }, v.dataset.src === 'memoire' ? 2500 : 1600);
    let filet = 0;
    if (entree && v.readyState < 3) {        // l'entrée se charge encore : un trait discret, puis la marche dès qu'elle est là
      chargement.classList.add('is-on');
      filet = setTimeout(() => {             // réseau coupé : au bout de 12 s, fondu vers la première vitrine
        chargement.classList.remove('is-on');
        if (lecture && lecture.v === v && v.currentTime === 0) { v.pause(); v.classList.remove('is-on'); lecture = null; sautVers(but); }
      }, 12000);
    }
    v.addEventListener('playing', () => { clearTimeout(attente); clearTimeout(secours); clearTimeout(filet); chargement.classList.remove('is-on'); }, { once: true });
    if (p && p.catch) p.catch(() => {
      clearTimeout(attente); clearTimeout(secours); clearTimeout(filet);
      chargement.classList.remove('is-on');
      if (!(lecture && lecture.v === v)) return;
      v.classList.remove('is-on'); lecture = null;           // vidéo en échec : elle ne reste pas affichée (son affiche est l'arrêt de départ)
      if (entree && !geste) { entreeFaite = false; return; } // lecture refusée sans geste (iPhone en économie d'énergie) : on attend le geste
      sautVers(but);
    });
    prepare(i, !inv);                        // la même marche dans l'autre sens : demi-tour possible à tout moment
    if (inv) { prepare(i - 1, true); precharge(i - 1); } else { prepare(i + 1, false); precharge(i + 2); }
    wake();
  }
  function finDeMarche(i, inv) {
    if (!lecture || lecture.i !== i || lecture.inv !== !!inv) return;
    const v = lecture.v;
    at = inv ? i : i + 1;
    lecture = null;
    pos = at;
    // l'image fixe de l'arrêt se place sous la vidéo arrêtée sur sa dernière image (identique), puis la vidéo s'efface en douceur
    montreArret(at, false).then(() => { if (lecture && lecture.v === v) return; v.classList.remove('is-on'); });
    arrive();
  }
  function sautVers(n) {                    // fondu enchaîné (en reculant, ou pour un saut de plusieurs arrêts)
    n = clamp(n, 0, FIN);
    if (n === at) return;
    if (lecture) { lecture.v.pause(); lecture.v.classList.remove('is-on'); lecture = null; }
    const de = at;
    at = n;
    // le fondu (et la fiche qui le suit) ne part qu'avec l'image d'arrivée : sur réseau lent, elle peut tarder ; en
    // attendant, l'image de départ reste et un trait de chargement discret apparaît
    const f = { de, vers: n, t0: performance.now(), dur: 750, pret: false };
    fondu = f;
    const lent = setTimeout(() => { if (fondu === f && !f.pret) chargement.classList.add('is-on'); }, 220);
    montreArret(n, true, () => {
      clearTimeout(lent);
      if (fondu !== f) return;
      f.pret = true; f.t0 = performance.now();
      chargement.classList.remove('is-on');
    });
    arrive();
    wake();
  }
  function arrive() {
    try { sessionStorage.setItem('bg-arret', JSON.stringify({ at, t: Date.now() })); } catch (e) { /* sans effet */ }
    if (at === ARRET_TABLE) chargeTable();
    prepare(at, false);                     // la marche suivante (et le retour) d'abord, puis toutes les autres
    prepare(at - 1, true);
    prepareTout();
    precharge(at + 1);
    // pas demandés pendant la marche : on repart aussitôt, un pas à la fois (le relais est la même image)
    if (enAttente) {
      const d = Math.sign(enAttente);
      enAttente -= d;
      if (at + d < 0 || at + d > FIN) enAttente = 0;
      else goTo(at + d);
    }
  }
  // vitesse de la marche : un peu plus vive quand on a déjà demandé les vitrines suivantes (on fait défiler)
  function cadence() {
    if (!lecture) return;
    const r = Math.min(1.9, 1 + 0.45 * Math.abs(enAttente));
    if (Math.abs(lecture.v.playbackRate - r) > 0.01) lecture.v.playbackRate = r;
  }
  // demi-tour pendant une marche : la même marche à l'envers, depuis l'image où l'on est (aucune attente, aucun fondu)
  function demiTour() {
    const cur = lecture;
    const autre = piste(cur.i, !cur.inv);
    const t = cur.v.duration ? cur.v.duration - cur.v.currentTime : NaN;
    if (!VIDEO_OK || !autre.dataset.src || autre.readyState < 1 || !(t >= 0)) { enAttente = cur.inv ? 1 : -1; return false; }
    enAttente = 0;
    autre.playbackRate = 1;
    const part = () => {
      if (lecture !== suite) return;
      cur.v.pause();
      autre.classList.add('is-on', 'devant');
      cur.v.classList.remove('devant');
      const p = autre.play();
      if (p && p.catch) p.catch(() => { if (lecture === suite) { lecture = null; sautVers(suite.inv ? suite.i : suite.i + 1); } });
      setTimeout(() => { if (!(lecture && lecture.v === cur.v)) cur.v.classList.remove('is-on'); }, 140);
    };
    const suite = { i: cur.i, v: autre, inv: !cur.inv };
    lecture = suite;
    cur.v.playbackRate = 1;
    try { autre.currentTime = Math.max(0, Math.min(t, (autre.duration || t) - 0.04)); } catch (e) { /* sans effet */ }
    if (autre.seeking) autre.addEventListener('seeked', part, { once: true }); else part();
    wake();
    return true;
  }
  function goTo(n, immediat) {
    n = clamp(Math.round(n), 0, FIN);
    if (immediat) {
      if (lecture) { lecture.v.pause(); lecture.v.classList.remove('is-on'); lecture = null; }
      at = n; pos = n; fondu = null;
      montreArret(n, false);
      arrive(); wake();
      return;
    }
    if (lecture) { enAttente = clamp(n - (lecture.inv ? lecture.i : lecture.i + 1), -1, 1); return; }
    if (n === at + 1 && at < FIN && jouable(at, false)) marcher(at, false);
    else if (n === at - 1 && at > 0 && jouable(at - 1, true)) marcher(at - 1, true);
    else sautVers(n);
  }
  function step(d) {
    if (lecture) {
      const sens = lecture.inv ? -1 : 1;
      // 8 novembre (audit) : une marche qui ne démarre pas (réseau lent ou coupé) ne retient pas le visiteur qui insiste :
      // au-delà de 1,5 s, son geste passe par un fondu (même sens) ou annule la marche (l'autre sens)
      const l = lecture;
      if (l.t0 && l.v.currentTime === 0 && l.v.readyState < 3 && performance.now() - l.t0 > 1500) {
        l.v.pause(); l.v.classList.remove('is-on'); lecture = null; enAttente = 0;
        chargement.classList.remove('is-on');
        if (d === sens) sautVers(l.inv ? l.i : l.i + 1);
        return;
      }
      if (d === sens || enAttente) {          // même sens : le pas attend son tour (jusqu'à trois), la marche accélère
        enAttente = clamp(enAttente + d, -3, 3);
        cadence();
      } else demiTour();                      // l'autre sens : demi-tour tout de suite
      return;
    }
    goTo(at + d);
  }

  // ---------------------------------------------------------------- rendu des textes et des effets (à la fréquence de l'écran)
  function setFiche(idx) {
    const p = PRODUITS[idx];
    if (!p) return;
    ficheIdx = idx;
    F.num.textContent = deux(p.n);
    F.nom.textContent = p.nom;
    F.ref.textContent = p.ref;
    F.refl.firstChild.textContent = p.liste ? '' : 'Réf. ';
    F.refl.hidden = !p.ref || p.ref === p.nom;             // la référence qui redit le nom ne s'affiche pas
    F.prix.textContent = prixArret(p);
    F.lien.href = lienArret(p);
    F.lien.textContent = p.bouton || 'Découvrir la pièce';
    F.lien.setAttribute('aria-label', p.liste ? p.bouton : `Découvrir la pièce : ${p.nom}`);
    // la table : chaque bracelet, son prix et sa fiche
    // repliée sur téléphone pour laisser voir la table, ouverte sur ordinateur
    F.details.hidden = !p.liste;
    F.astuce.hidden = !p.liste || !TABLE;
    F.astuce.textContent = p.liste ? (souris.matches ? p.astuce_souris : p.astuce_toucher) || '' : '';
    F.details.open = !!p.liste && !portraitMQ.matches;
    F.resume.textContent = p.liste_titre || '';
    F.liste.innerHTML = p.liste ? p.liste.map((b) => `<li><a href="${lienProduit(b)}"><span>${echappe(b.nom)}</span>`
      + `<span>${b.epuise ? 'Épuisé' : prixTexte(b.prix)}</span></a></li>`).join('') : '';
  }
  function majPos(now) {
    if (lecture && lecture.v.ended) finDeMarche(lecture.i, lecture.inv);   // au cas où l'événement « ended » se perd
    // 8 novembre (audit) : une marche qui cale en route (réseau coupé) ne reste pas figée : au bout de 3 s, fondu
    if (lecture && lecture.v.currentTime > 0 && !lecture.v.paused && lecture.v.readyState < 3) {
      if (!lecture.cale) lecture.cale = now;
      else if (now - lecture.cale > 3000) panne(lecture.v, true);
    } else if (lecture) lecture.cale = 0;
    if (lecture && lecture.v.duration) {
      const k = clamp(lecture.v.currentTime / lecture.v.duration, 0, 1);
      pos = lecture.inv ? lecture.i + 1 - k : lecture.i + k;
    }
    else if (fondu) {
      if (fondu.pret === false) pos = fondu.de;               // l'image d'arrivée se charge encore : on reste sur place
      else {
        const k = clamp((now - fondu.t0) / fondu.dur, 0, 1);
        pos = fondu.de + (fondu.vers - fondu.de) * k;
        if (k >= 1) { fondu = null; pos = at; }
      }
    } else if (!lecture) pos = at;
    if (!lecture && !fondu && chargement.classList.contains('is-on')) chargement.classList.remove('is-on');
  }
  const ecrit = new Map();                  // dernière valeur écrite par élément et par propriété
  function style(el, prop, val) {
    let m = ecrit.get(el);
    if (!m) { m = {}; ecrit.set(el, m); }
    if (m[prop] === val) return;
    m[prop] = val;
    el.style[prop] = val;
  }
  function render() {
    const p = pos;
    const ouv = 1 - smooth(p, 0, 0.12);
    style(ouverture, 'opacity', ouv.toFixed(3));
    style(ouverture, 'visibility', ouv < 0.01 ? 'hidden' : 'visible');
    // « Sept vitrines. Choisissez la vôtre. » : pendant l'entrée, quand on passe devant les deux premières vitrines
    const arr = lecture && lecture.i === 0 ? smooth(p, 0.18, 0.34) * (1 - smooth(p, 0.62, 0.8)) : 0;
    style(arrivee, 'opacity', arr.toFixed(3));
    style(arrivee, 'visibility', arr < 0.01 ? 'hidden' : 'visible');
    // la fin (« Votre pièce vous attend ») monte pendant la dernière marche, vers le logo
    const fo = smooth(p, FIN - 0.45, FIN);
    style(fin, 'opacity', fo.toFixed(3));
    fin.classList.toggle('visible', fo > 0.6);
    style(fin, 'visibility', fo < 0.01 ? 'hidden' : 'visible');
    const hs = clamp(Math.round(p), 1, DERNIER);
    const dist = p < 1 ? 1 - p : p > DERNIER ? p - DERNIER : Math.abs(p - hs);
    const fo2 = 1 - smooth(dist, 0.04, 0.16);
    if (fo2 > 0.01 && hs - 1 !== ficheIdx) setFiche(hs - 1);
    style(fiche, 'opacity', fo2.toFixed(3));
    style(fiche, 'transform', portraitMQ.matches ? `translateY(${((1 - fo2) * 18).toFixed(2)}px)` : `translateY(calc(-50% + ${((1 - fo2) * 14).toFixed(2)}px))`);
    fiche.classList.toggle('visible', fo2 > 0.6);
    if ((fo2 < 0.25) !== fiche.hasAttribute('inert')) { if (fo2 < 0.25) fiche.setAttribute('inert', ''); else fiche.removeAttribute('inert'); }
    style(fiche, 'visibility', fo2 < 0.01 ? 'hidden' : 'visible');
    const cur = Math.round(p);
    if (cur !== render.cur) { render.cur = cur; dots.forEach((d, n) => { if (n === cur) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); }); }
  }

  // ---------------------------------------------------------------- éclats sur le pendentif (canvas 2D), aux arrêts devant une vitrine
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 128;
  (function drawSprite() {
    const g = sprite.getContext('2d');
    const c = 64;
    const rg = g.createRadialGradient(c, c, 0, c, c, 34);
    rg.addColorStop(0, 'rgba(255,250,236,.95)'); rg.addColorStop(0.35, 'rgba(255,236,190,.42)'); rg.addColorStop(1, 'rgba(255,226,160,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(c, c, 34, 0, 6.2832); g.fill();
    const ray = (len, wid, a, ang) => {
      g.save(); g.translate(c, c); g.rotate(ang);
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,250,236,0)'); lg.addColorStop(0.5, `rgba(255,252,242,${a})`); lg.addColorStop(1, 'rgba(255,250,236,0)');
      g.fillStyle = lg; g.fillRect(-len, -wid / 2, len * 2, wid); g.restore();
    };
    ray(62, 2.6, 0.95, 0); ray(62, 2.6, 0.95, Math.PI / 2); ray(30, 1.6, 0.55, Math.PI / 4); ray(30, 1.6, 0.55, -Math.PI / 4);
  })();
  let sparks = [], spawnAcc = 0, dpr = 1, vw = 0, vh = 0;
  function versEcran(fx, fy) {               // fraction de l'image (16:9 ou 9:16) -> pixels de la fenêtre (object-fit: cover ou contain)
    const ar = F_ === '16x9' ? 16 / 9 : 9 / 16;
    const h = F_ === fmtVoulu() ? Math.max(vh, vw / ar) : Math.min(vh, vw / ar), w = h * ar;
    const ancre = F_ === fmtVoulu() ? ANCRE_Y : 0.5;           // même calage que les images (object-position)
    return [(vw - w) / 2 + fx * w, (vh - h) * ancre + fy * h];
  }
  function sparkle(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    const surPiece = !lecture && !fondu && at >= 1 && at <= DERNIER;
    if (!surPiece) { sparks = []; return false; }
    const rep = (SALLE[F_] || {})[String(at)];
    if (!rep) return false;
    const [cx, cy] = versEcran(rep[0], rep[1]);
    const unite = Math.min(vw, vh);
    spawnAcc += 2.2 * dt;
    while (spawnAcc >= 1 && sparks.length < 10) {
      spawnAcc -= 1;
      const ang = Math.random() * 6.2832, r = Math.random() * unite * 0.045;
      sparks.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 1.4, age: 0, life: 0.9 + Math.random() * 0.9,
        size: unite * (0.014 + Math.random() * 0.018), rot: (Math.random() - 0.5) * 0.5 });
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let n = sparks.length - 1; n >= 0; n--) {
      const s = sparks[n];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(n, 1); continue; }
      const k = s.age / s.life, env = Math.sin(Math.PI * k) ** 1.6;
      const r = s.size * (0.55 + 0.45 * env);
      ctx.globalAlpha = clamp(env * 0.85, 0, 1);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot + k * 0.5);
      ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    return true;
  }

  // ---------------------------------------------------------------- la table des bracelets
  // Sur ordinateur, le bracelet survolé se lève sous sa cloche (images calculées dans la scène, posées sur l'image d'arrêt) ;
  // un clic, ou un doigt sur téléphone, ouvre son gros plan : le bracelet levé, de près, avec son nom, son prix et sa fiche.
  const TABLE = SALLE.table || null;      // { n, '16x9' et '9x16' : zones des cloches, dessin : rectangles des images de levée } (fractions)
  const ARRET_TABLE = PRODUITS.findIndex((p) => p.liste) + 1;  // l'arrêt de la table (8)
  const BRACELETS = ARRET_TABLE > 0 ? PRODUITS[ARRET_TABLE - 1].liste : [];
  const souris = matchMedia('(hover: hover) and (pointer: fine)');
  const leves = BRACELETS.map(() => ({ t: 0, cible: 0 }));
  let sprites = {}, spritesCle = '', survole = -1, tableSale = false, grosK = -1;
  const surTable = () => !!TABLE && at === ARRET_TABLE && !lecture && !fondu;
  const grosOuvert = () => grosK >= 0;
  const grosSrc = (k) => `assets/film/${VERSION}/${F_}/gros/b${k}.webp`;
  function chargeTable() {
    if (!TABLE) return;
    const cle = VERSION + F_;
    if (spritesCle === cle) return;
    spritesCle = cle;
    sprites = {};
    BRACELETS.forEach((b, k) => {
      if (F_ === '16x9' && souris.matches) {                 // levée au survol : ordinateur seulement
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => { sprites[k] = im; };
        im.src = `assets/film/${VERSION}/16x9/survol/b${k}.webp`;
      }
      const g = new Image();                                 // gros plans : chargés d'avance pendant qu'on regarde la table
      g.decoding = 'async';
      g.src = grosSrc(k);
    });
  }
  function zoneEcran(k) {                                    // zone du bracelet k en pixels du cadre (avant la « respiration »)
    const z = TABLE && TABLE[F_] && TABLE[F_][k];
    if (!z) return null;
    const [ax, ay] = versEcran(z[0], z[1]);
    const [bx, by] = versEcran(z[2], z[3]);
    return [ax, ay, bx - ax, by - ay];
  }
  function dessinEcran(k) {                                  // rectangle des images de levée (16:9), en pixels du cadre
    const z = TABLE && TABLE.dessin && TABLE.dessin[k];
    if (!z || F_ !== '16x9') return null;
    const [ax, ay] = versEcran(z[0], z[1]);
    const [bx, by] = versEcran(z[2], z[3]);
    return [ax, ay, bx - ax, by - ay];
  }
  function braceletSous(x, y) {                              // x, y : coordonnées de la fenêtre
    if (!surTable() || grosOuvert()) return -1;
    const r = respireEl.getBoundingClientRect();
    const e = r.width / vw || 1;
    const lx = (x - r.left) / e, ly = (y - r.top) / e;
    // les zones se chevauchent (cloches en couronne) : on teste d'abord les cloches de devant (bas de zone le plus bas)
    const ordre = BRACELETS.map((b, k) => k).filter((k) => zoneEcran(k)).sort((a, b) => { const za = zoneEcran(a), zb = zoneEcran(b); return (zb[1] + zb[3]) - (za[1] + za[3]); });
    for (const k of ordre) {
      const z = zoneEcran(k);
      const m = 0.14;                                        // la zone calculée comprend la cloche et une marge
      if (lx > z[0] + z[2] * m && lx < z[0] + z[2] * (1 - m) && ly > z[1] + z[3] * m && ly < z[1] + z[3] * (1 - m)) return k;
    }
    return -1;
  }
  function majSurvol(k) {
    survole = k;
    leves.forEach((l, n) => { l.cible = n === k ? 1 : 0; });
    stage.classList.toggle('sur-bracelet', k >= 0);
    tableSale = true;
    wake();
  }
  function poseTable() {                                     // on quitte la table : les bracelets se recouchent sans attendre
    leves.forEach((l) => { l.t = 0; l.cible = 0; });
    survole = -1;
    stage.classList.remove('sur-bracelet');
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, survol.width, survol.height);
  }
  function dessineTable(dt) {
    if (!tableSale && !leves.some((l) => l.t > 0)) return false;
    tableSale = false;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, vw, vh);
    let anime = false;
    leves.forEach((l, k) => {
      l.t = clamp(l.t + (l.cible ? dt / 0.55 : -dt / 0.4), 0, 1);
      if (l.t > 0 && l.t < 1) anime = true;
      const im = sprites[k];
      const z = dessinEcran(k);
      if (!im || !z || l.t <= 0 || !surTable()) return;
      const n = TABLE.n;
      const i = Math.round(l.t * (n - 1));
      const fw = im.naturalWidth / n;
      // 7 novembre : chaque image de la bande dessinée 1 px en retrait de ses bords (aucun trait noir, rien de l'image voisine)
      const ex = z[2] / fw, ey = z[3] / im.naturalHeight;
      sctx.drawImage(im, i * fw + 1, 1, fw - 2, im.naturalHeight - 2, z[0] + ex, z[1] + ey, z[2] - 2 * ex, z[3] - 2 * ey);
    });
    if (!anime && leves.every((l) => l.t === 0)) { sctx.clearRect(0, 0, vw, vh); return false; }
    return anime;
  }
  function remplitGros(k) {
    const b = BRACELETS[k];
    G.nom.textContent = b.nom;
    G.prix.textContent = b.epuise ? 'Épuisé' : prixTexte(b.prix);
    G.lien.href = lienProduit(b);
    G.lien.setAttribute('aria-label', `Découvrir la pièce : ${b.nom}`);
    grosImg.alt = b.nom;
    grosImg.src = grosSrc(k);
  }
  function ouvrirGros(k) {
    if (!BRACELETS[k] || grosOuvert()) return;
    grosK = k;
    remplitGros(k);
    const z = zoneEcran(k);                                  // le gros plan sort du bracelet touché
    grosImg.style.transformOrigin = z ? `${Math.round(z[0] + z[2] / 2)}px ${Math.round(z[1] + z[3] / 2)}px` : '50% 50%';
    majSurvol(-1);
    gros.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => gros.classList.add('ouvert')));
    try { G.fermer.focus({ preventScroll: true }); } catch (e) { /* sans effet */ }
  }
  function fermerGros() {
    if (!grosOuvert()) return;
    const k = grosK;
    grosK = -1;
    const z = zoneEcran(k);
    if (z) grosImg.style.transformOrigin = `${Math.round(z[0] + z[2] / 2)}px ${Math.round(z[1] + z[3] / 2)}px`;
    gros.classList.remove('ouvert');
    setTimeout(() => { if (!grosOuvert()) gros.hidden = true; }, 560);
  }
  function grosVoisin(d) {
    if (!grosOuvert()) return;
    let k = grosK;
    k = (k + d + BRACELETS.length) % BRACELETS.length;
    grosK = k;
    gros.classList.add('change');
    setTimeout(() => { remplitGros(k); (grosImg.decode ? grosImg.decode() : Promise.resolve()).then(() => gros.classList.remove('change'), () => gros.classList.remove('change')); }, 220);
  }
  if (TABLE) {
    stage.addEventListener('mousemove', (e) => {
      if (!souris.matches) return;
      const k = braceletSous(e.clientX, e.clientY);
      if (k !== survole) majSurvol(k);
    });
    stage.addEventListener('mouseleave', () => { if (survole !== -1) majSurvol(-1); });
    // la liste de la fiche lève aussi le bracelet qu'on y pointe
    F.liste.addEventListener('mouseover', (e) => {
      const li = e.target.closest && e.target.closest('li');
      if (li && souris.matches && surTable()) majSurvol([...F.liste.children].indexOf(li));
    });
    F.liste.addEventListener('mouseleave', () => { if (souris.matches) majSurvol(-1); });
    // un bracelet de la liste ouvre son gros plan (sur téléphone, la table n'en montre que quelques-uns en entier) ;
    // la fiche reste à un geste : « Découvrir la pièce » dans le gros plan
    F.liste.addEventListener('click', (e) => {
      const li = e.target.closest && e.target.closest('li');
      if (!li || !surTable()) return;
      e.preventDefault();
      ouvrirGros([...F.liste.children].indexOf(li));
    });
    stage.addEventListener('click', (e) => {
      if (grosOuvert() || (e.target.closest && e.target.closest('a,button,summary,details,.fiche'))) return;
      const k = braceletSous(e.clientX, e.clientY);
      if (k >= 0) ouvrirGros(k);
    });
    G.fermer.addEventListener('click', fermerGros);
    $$('[data-gnav]', gros).forEach((b) => b.addEventListener('click', () => grosVoisin(b.dataset.gnav === 'next' ? 1 : -1)));
    gros.addEventListener('click', (e) => { if (e.target === gros || e.target === grosImg) fermerGros(); });
  }

  // ---------------------------------------------------------------- entrée : la marche part seule quand la boutique remplit l'écran
  function entreeAuto(delai) {
    if (entreeFaite || !VIDEO_OK) return;
    clearTimeout(entreeMinuteur);
    entreeMinuteur = setTimeout(() => {
      if (entreeFaite || at !== 0 || lecture || fondu || !pris() || document.hidden || introOuverte() || grosOuvert() || !jouable(0, false)) return;
      autoEnCours = true;
      goTo(1);
      autoEnCours = false;
    }, delai);
  }

  // ---------------------------------------------------------------- page seule : le film de la marque, puis la boutique
  function lanceIntro() {
    const v = $('.intro__video', intro);
    const petit = portraitMQ.matches || Math.min(screen.width || 0, screen.height || 0) < 700;
    v.poster = 'assets/intro/affiche.webp';
    v.src = `assets/intro/accueil-${petit ? 720 : 1080}.mp4`;
    intro.hidden = false;
    introEtat = 1;
    v.addEventListener('ended', finIntro, { once: true });
    v.addEventListener('error', finIntro, { once: true });
    const p = v.play();
    if (p && p.catch) p.catch(() => {});                       // sans lecture automatique : l'affiche et le bouton « Entrer »
    $('.intro__entrer', intro).addEventListener('click', finIntro);
  }
  function finIntro() {
    if (introEtat !== 1) return;
    introEtat = 2;
    try { sessionStorage.setItem('bg-intro', '1'); } catch (e) { /* sans effet */ }
    intro.classList.add('fini');
    setTimeout(() => {
      intro.hidden = true;
      const v = $('.intro__video', intro);
      v.pause(); v.removeAttribute('src'); v.load();
    }, 950);
    entreeAuto(650);
  }

  // ---------------------------------------------------------------- boucle (seulement quand quelque chose bouge)
  let running = false, lastT = 0;
  function wake() { if (!running && !document.hidden) { running = true; lastT = performance.now(); requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    majPos(now);
    render();
    const sp = sparkle(dt);
    const tb = dessineTable(dt);
    if (lecture || fondu || sp || tb) requestAnimationFrame(tick); else running = false;
  }

  // ---------------------------------------------------------------- lumière : allumée ou éteinte comme le site
  function changeVersion(mode) {
    // le mode vient du message du site (boutique hébergée ailleurs : pas de stockage commun), sinon du stockage partagé
    // depuis le 5 novembre, une seule salle (allumée) : le mode Noir du site ne change plus la boutique
    const v = lireVersion(mode);
    if (v === VERSION) return;
    VERSION = v;
    if (lecture) { lecture.v.pause(); lecture.v.classList.remove('is-on'); lecture = null; }
    fondu = null;
    oublie();
    creeVideos();
    fermerGros();
    poseTable();
    spritesCle = '';
    montreArret(at, true);                    // fondu vers le même arrêt, dans l'autre lumière
    arrive();
    wake();
  }
  addEventListener('storage', (e) => { if (e.key === 'bg-mode') changeVersion(); });
  addEventListener('message', (e) => { if (e.data && e.data.boutique === 'mode') changeVersion(e.data.mode); });

  // ---------------------------------------------------------------- mise en page
  let pret = false;
  // téléphone et tablette en portrait : la fiche (nom, prix) est posée en bas de l'image. On coupe le moins possible du
  // haut (le cou, le départ de la chaîne), tant que le bas des pendentifs (BAS_PENDENTIFS de la hauteur de l'image) reste
  // au-dessus de la fiche. iPad : l'image descend et montre le cou ; petit téléphone : elle reste calée en bas.
  // Recalculé quand la fiche change de taille (police chargée, nom sur deux lignes).
  function calage(f) {
    if (f === '9x16') {
      const ih = Math.max(vh, vw * 16 / 9), libre = 1 - vh / ih;      // part de l'image qui ne tient pas à l'écran
      // hauteur occupée par le texte de la fiche (son voile dégradé au-dessus peut passer sur le pendentif), plus 12 px
      const num = fiche && fiche.querySelector('.fiche-num');
      const texteH = fiche && num && fiche.offsetHeight ? fiche.offsetHeight - num.offsetTop + 12 : 0.24 * vh;
      const coupe = Math.max(0, Math.min(libre, BAS_PENDENTIFS - (vh - texteH) / ih));
      ANCRE_Y = libre > 0.001 ? coupe / libre : 1;
    } else ANCRE_Y = 0.5;
    document.documentElement.style.setProperty('--ancre-y', `${(ANCRE_Y * 100).toFixed(2)}%`);
  }
  if (window.ResizeObserver && fiche) new ResizeObserver(() => { if (vw) calage(F_); }).observe(fiche);

  function layout() {
    vw = cadre.clientWidth; vh = cadre.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
    survol.width = Math.round(vw * dpr); survol.height = Math.round(vh * dpr);
    tableSale = true;
    const f = fmt();
    root.classList.toggle('format-secours', f !== fmtVoulu());
    calage(f);
    // définition : on ne redescend jamais en cours de visite (une rotation de l'écran ne recharge pas tout)
    const d = definition(f);
    const plus = (x) => ['', '-hd', '-uhd'].indexOf(x);
    const changeDef = f !== F_ ? d : (plus(d) > plus(DEF) ? d : DEF);
    if (f !== F_ || !pret || changeDef !== DEF) {
      DEF = changeDef;
      F_ = f;
      pret = true;
      if (lecture) { lecture.v.pause(); lecture = null; }
      oublie();
      creeVideos();
      stills.forEach((s) => { s.removeAttribute('src'); s.classList.remove('is-on', 'dessus', 'fondu'); });
      fermerGros();
      poseTable();
      spritesCle = '';
      montreArret(at, false);
      arrive();
    }
    render();
    wake();
  }

  // ---------------------------------------------------------------- gestes
  // sur l'accueil, « Passer l'animation » mène le site au catalogue (plus haut, avant la version statique) : on n'est
  // jamais obligé de faire tout le tour pour voir la suite
  // Sur l'accueil, la boutique ne prend la molette et le doigt que lorsqu'elle remplit l'écran : le site le lui dit
  // (message « cadre »). À moitié visible, un geste la fait d'abord venir en entier (message « aligner ») au lieu
  // d'avancer ; dans l'autre sens, il la quitte. Un site qui ne répond pas (ancienne version) : la boutique garde la main.
  let aligne = !embarque;
  const pris = () => aligne || !parentRepond;
  function aligner(dir) {
    try { window.parent.postMessage({ boutique: 'aligner', dir }, '*'); } catch (e) { /* sans effet */ }
  }
  if (embarque) {
    addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data || e.data.boutique !== 'cadre') return;
      parentRepond = true;
      // en-tête du site posé sur le haut de la boutique (ordinateur) : les boutons du haut descendent d'autant
      if (typeof e.data.haut === 'number') root.style.setProperty('--haut-site', `${Math.max(0, Math.min(160, e.data.haut))}px`);
      aligne = !!e.data.aligne;
      root.classList.toggle('plein', aligne);                  // plein écran : l'en-tête du site s'efface (portrait)
      stage.style.touchAction = pris() ? 'none' : 'pan-y';   // à moitié visible, le doigt fait défiler le site
      if (aligne) entreeAuto(550); else clearTimeout(entreeMinuteur);   // la boutique remplit l'écran : on entre
      if (aligne && toutEnAttente) prepareTout();                    // et toutes les marches se chargent
    });
    try { window.parent.postMessage({ boutique: 'pret' }, '*'); } catch (e) { /* sans effet */ }
  }
  let bordTemps = 0;
  function bord(dir) {
    if (!embarque || Date.now() - bordTemps < 900) return;
    bordTemps = Date.now();
    try { window.parent.postMessage({ boutique: 'bord', dir }, '*'); } catch (e) { /* sans effet */ }
  }
  function avance(dir) {
    if (introOuverte()) { finIntro(); return; }              // un geste pendant le film de la marque : on entre
    if (grosOuvert()) { if (dir > 0) grosVoisin(1); else grosVoisin(-1); return; }
    entreeFaite = true;
    clearTimeout(entreeMinuteur);
    // la vitrine visée compte les pas déjà demandés (on peut faire défiler plusieurs vitrines d'affilée)
    const cible = (lecture ? (lecture.inv ? lecture.i : lecture.i + 1) : at) + enAttente + dir;
    if (cible < 0 || cible > FIN) { bord(dir); return; }
    step(dir);
  }
  // molette et pavé tactile : un geste = un pas ; un long défilement continu en demande encore un ou deux
  let wheelGesture = false, wheelTimer = 0, wheelAcc = 0, wheelPas = 0, wheelLong = 0;
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelGesture = false; wheelAcc = 0; wheelPas = 0; wheelLong = 0; }, 180);
    if (wheelGesture) {
      if (!pris() || Math.sign(dy) !== wheelPas) return;
      wheelLong += Math.abs(dy);
      if (wheelLong >= 650 * (Math.abs(enAttente) + 1) && Math.abs(enAttente) < 2) { wheelLong = 0; avance(wheelPas); }
      return;
    }
    wheelAcc += dy;
    if (Math.abs(wheelAcc) >= 24) {
      wheelGesture = true;
      wheelPas = wheelAcc > 0 ? 1 : -1;
      if (pris()) avance(wheelPas); else aligner(wheelPas);
      wheelAcc = 0;
    }
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = e.target.closest && e.target.closest('a,button,input,select,textarea');
    if (grosOuvert() && e.key === 'Escape') { e.preventDefault(); fermerGros(); return; }
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': case 'PageDown': e.preventDefault(); avance(1); break;
      case 'ArrowUp': case 'ArrowLeft': case 'PageUp': e.preventDefault(); avance(-1); break;
      case ' ': if (!onControl) { e.preventDefault(); avance(e.shiftKey ? -1 : 1); } break;
      case 'Home': e.preventDefault(); goTo(0); break;
      case 'End': e.preventDefault(); goTo(FIN); break;
      default: break;
    }
  });
  stage.style.touchAction = pris() ? 'none' : 'pan-y';
  let t0 = null;
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || (e.target.closest && e.target.closest('a,button'))) { t0 = null; return; }
    const t = e.touches[0];
    // la boutique ne tient pas encore le doigt : le site défile sous lui ; on mesure alors le geste sur l'écran
    t0 = pris() ? { y: t.clientY, x: t.clientX, pris: true } : { y: t.screenY, x: t.screenX, pris: false };
  }, { passive: true });
  // 6 novembre : la marche part dès que le doigt a glissé de 26 px (pendant le geste), sans attendre qu'il se lève
  stage.addEventListener('touchmove', (e) => {
    if (!t0) return;
    if (t0.pris) e.preventDefault();
    if (!t0.pris || t0.fait || grosOuvert()) return;
    const t = e.touches[0];
    const dy = t.clientY - t0.y, dx = t.clientX - t0.x;
    const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (Math.abs(d) < 26) return;
    t0.fait = true;
    avance(d < 0 ? 1 : -1);                 // glisser vers le haut (ou vers la gauche) : on avance
  }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    if (!t0) return;
    if (t0.fait) { t0 = null; return; }     // le pas est déjà parti pendant le glissé
    const t = e.changedTouches[0];
    const tenu = t0.pris;
    const dy = (tenu ? t.clientY : t.screenY) - t0.y, dx = (tenu ? t.clientX : t.screenX) - t0.x;
    t0 = null;
    const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (Math.abs(d) < 36) return;
    if (grosOuvert()) {                     // gros plan : glisser de côté change de bracelet, vers le bas le referme
      if (Math.abs(dx) > Math.abs(dy)) grosVoisin(dx < 0 ? 1 : -1); else if (dy > 0) fermerGros();
      return;
    }
    const dir = d < 0 ? 1 : -1;             // glisser vers le haut (ou vers la gauche) : on avance
    if (tenu) avance(dir); else aligner(dir);
  }, { passive: true });
  // un bouton touché quand la boutique n'est qu'à moitié visible : elle vient en entier et le bouton agit
  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => { if (!pris()) aligner(0); avance(b.dataset.nav === 'next' ? 1 : -1); }));
  addEventListener('resize', layout);
  portraitMQ.addEventListener && portraitMQ.addEventListener('change', layout);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && lecture) lecture.v.pause();
    else if (!document.hidden && lecture) { lecture.v.play().catch(() => {}); wake(); }
  });

  // ---------------------------------------------------------------- démarrage
  const depart = parseInt(new URLSearchParams(location.search).get('arret'), 10);
  if (depart >= 0 && depart <= FIN) { at = depart; pos = depart; entreeFaite = true; }
  else {
    // retour depuis une fiche (bouton Précédent) : la boutique reprend à la vitrine que l'on regardait
    let retour = false;
    try { retour = (performance.getEntriesByType('navigation')[0] || {}).type === 'back_forward'; } catch (e) { /* sans effet */ }
    if (retour) {
      try {
        const m = JSON.parse(sessionStorage.getItem('bg-arret') || 'null');
        if (m && m.at > 0 && m.at <= FIN && Date.now() - m.t < 2 * 3600 * 1000) { at = m.at; pos = m.at; entreeFaite = true; }
      } catch (e) { /* sans effet */ }
    }
  }
  // rafraîchissement de l'écran : 12 images mesurées (≈ 0,1 à 0,2 s) ; ≥ 100 Hz → marches à 120 images/s
  (function mesure() {
    const t = [];
    const pas = (now) => {
      t.push(now);
      if (t.length < 13) { requestAnimationFrame(pas); return; }
      const d = t.slice(1).map((x, n) => x - t[n]).sort((a, b) => a - b);
      const hz = 1000 / d[Math.floor(d.length / 2)];
      if (hz >= 100 && !LENT && (SALLE.hz120 || []).length) {
        HZ120 = true;
        oublie(); creeVideos();               // rien n'a encore joué : les marches se rechargent en 120 images/s
        prepare(at, false); prepare(at - 1, true); prepareTout();
      }
      root.dataset.hz = String(Math.round(hz));
    };
    requestAnimationFrame(pas);
  })();
  // codec annoncé par canPlayType mais refusé par le décodeur : mediaCapabilities est aussi consulté, avant tout
  // téléchargement de marche (8 novembre, audit)
  if (VIDEO_OK && navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
    const [w, h] = portraitMQ.matches ? [1080, 1920] : [1920, 1080];
    codecVerifie = navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: `video/mp4; codecs="${HEVC ? 'hvc1.1.6.L120.90' : 'avc1.640033'}"`, width: w, height: h, bitrate: 8e6, framerate: 60 } })
      .then((r) => { if (r && r.supported === false) sansVideo(); }, () => { /* sans effet */ });
  }
  layout();
  // page ouverte seule (sans l'accueil au-dessus) : le film de la marque d'abord, puis la marche d'entrée
  let introVue = false;
  try { introVue = sessionStorage.getItem('bg-intro') === '1'; } catch (e) { /* sans effet */ }
  // sans vidéo lisible (codec absent, économie de données), pas de film de la marque : la boutique, directement
  if (!embarque && at === 0 && !introVue && intro && VIDEO_OK) lanceIntro();
  else if (!embarque && at === 0) entreeAuto(900);

  window.__boutique = {
    goTo, step,
    setPos(p) { goTo(Math.round(p), true); },
    get pos() { return pos; },
    get arret() { return at; },
    get fiche() { return ficheIdx; },
    get format() { return F_; },
    get niveau() { return CODEC; },
    get version() { return VERSION; },
    get definition() { return F_ + DEF; },
    get hz120() { return HZ120; },
    get ancre() { return ANCRE_Y; },
    get enCours() { return !!lecture || !!fondu; },
    get prend() { return pris(); },
    get chargees() { return Object.values(pistes).filter((v) => v.readyState >= 3).length; },
    get gros() { return grosK; },
    get survole() { return survole; },
    get intro() { return introEtat; },
    ouvrirGros, fermerGros, finIntro,
  };
})();
