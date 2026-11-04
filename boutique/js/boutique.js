/* La boutique immersive Breslev Gang : on entre dans la salle recréée et, d'une seule traite, on passe devant les deux
 * premières vitrines jusqu'à la première pièce ; puis on marche de vitrine en vitrine autour du cercle, et la visite
 * finit face au grand logo Breslev Gang, au fond de la salle (le film de la marque est déjà en haut de l'accueil).
 *
 * Arrêts : 0 entrée · 1 à 7 les sept vitrines (une par pièce de data/products.json) · 8 le mur au logo.
 * À chaque arrêt, une image fixe ; entre deux arrêts (en avançant), une vidéo de marche calculée en 4K à 60 images/s,
 * lue par le décodeur matériel du navigateur (fluide, aucune image à décoder par le script). Le dernier plan d'une vidéo
 * est identique à l'image de l'arrêt suivant : le relais est invisible. En reculant, fondu enchaîné entre les arrêts.
 * Aucune 3D, aucune bibliothèque.
 */
(() => {
  'use strict';
  const D = window.DONNEES;
  const C = Object.assign({ SITE_URL: '', EXT: '', COLLECTION: '/collections/all', ACCUEIL: '/' }, D.config || {});
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
  const VIDEO_OK = HEVC || !!essai.canPlayType('video/mp4; codecs="avc1.640033"');
  // boutique allumée (site en Blanc) ou éteinte (site en Noir) : le bouton Blanc/Noir du site éteint vraiment la boutique
  const lireVersion = () => { try { return localStorage.getItem('bg-mode') === 'noir' ? 'eteint' : 'allume'; } catch (e) { return 'allume'; } };
  let VERSION = lireVersion();
  const NV = PRODUITS.length;                                         // vitrines, une pièce chacune
  // segment i : de l'arrêt i à l'arrêt i + 1 (i : l'entrée ; v2… : d'une vitrine à la suivante ; f : vers le logo)
  const SEGMENTS = ['i'].concat(PRODUITS.slice(1).map((p, k) => `v${k + 2}`), ['f']);
  const FIN = SEGMENTS.length;                                        // dernier arrêt : le mur au logo
  const DERNIER = NV;                                                 // dernière vitrine
  const deux = (n) => String(n).padStart(2, '0');
  const arretSrc = (f, i) => `assets/film/${VERSION}/${f}/arrets/arret-${i}.webp`;
  // segment i joué à l'endroit (de l'arrêt i à i + 1) ou à l'envers (de i + 1 à i : on revient sans fondu)
  const videoSrc = (f, i, inv) => `assets/film/${VERSION}/${f}/${CODEC}/${SEGMENTS[i]}${inv ? '-inverse' : ''}.mp4`;

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
    b.addEventListener('click', () => { if (!pris()) aligner(0); goTo(i); });
    points.appendChild(b);
  });
  const dots = $$('.point', points);

  // ---------------------------------------------------------------- état
  let F_ = fmt();
  let at = 0;                 // arrêt courant (entier)
  let pos = 0;                // position continue (pour les textes et les fondus)
  let lecture = null;         // { i, v, inv } : vidéo de marche en cours (inv : à l'envers)
  let enAttente = 0;          // pas demandés pendant une marche (+1 / -1)
  let fondu = null;           // { de, vers, t0, dur } : fondu enchaîné entre deux arrêts
  let actif = 0;              // index de l'image d'arrêt visible
  let ficheIdx = -1;
  const pistes = {};          // une balise <video> par segment et par sens, créée à la demande

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
      marches.appendChild(v);
      pistes[k] = v;
    }
    return pistes[k];
  }
  function creeVideos() {
    marches.innerHTML = '';
    Object.keys(pistes).forEach((k) => { delete pistes[k]; });
  }
  // Chaque vidéo de marche est téléchargée à l'avance en entier (en mémoire) pendant qu'on regarde la vitrine :
  // la marche démarre alors instantanément, même sur iPhone (qui ne précharge pas les vidéos de lui-même).
  let memoire = {};
  function telecharge(url) {
    if (!memoire[url]) {
      memoire[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
        .then((b) => URL.createObjectURL(b)).catch(() => null);
    }
    return memoire[url];
  }
  function oublie() {
    Object.values(memoire).forEach((p) => p.then((u) => { if (u) URL.revokeObjectURL(u); }));
    memoire = {};
  }
  function prepare(i, inv) {
    if (!VIDEO_OK || i < 0 || i >= SEGMENTS.length) return;
    const v = piste(i, inv);
    if (v.dataset.charge) return;
    v.dataset.charge = '1';
    v.poster = arretSrc(F_, inv ? i + 1 : i);
    telecharge(videoSrc(F_, i, inv)).then((u) => {
      if (!u || pistes[inv ? `${i}r` : String(i)] !== v || v.dataset.src) return;
      v.dataset.src = 'memoire';
      v.preload = 'auto';
      v.src = u;
      v.load();
    });
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

  // image d'arrêt : fondu (true) ou relais instantané (false)
  function montreArret(i, fonduOn) {
    const suiv = stills[1 - actif];
    const prec = stills[actif];
    const src = arretSrc(F_, i);
    return new Promise((res) => {
      const pose = () => {
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
    lecture = { i, v, inv: !!inv };
    const but = inv ? i : i + 1;
    if (v.currentTime) v.currentTime = 0;
    const p = v.play();                      // appelé dans le geste de l'utilisateur (iPhone, mode économie d'énergie)
    v.classList.add('is-on');                // l'affiche de la vidéo est l'image de l'arrêt : rien ne bouge avant la première image
    // jamais d'attente visible : une marche qui ne démarre pas tout de suite laisse place à un fondu vers l'arrêt visé
    const secours = setTimeout(() => {
      if (lecture && lecture.v === v && v.currentTime === 0 && v.readyState < 3) { v.pause(); v.classList.remove('is-on'); lecture = null; sautVers(but); }
    }, 450);
    v.addEventListener('playing', () => clearTimeout(secours), { once: true });
    if (p && p.catch) p.catch(() => { clearTimeout(secours); if (lecture && lecture.v === v) { v.classList.remove('is-on'); lecture = null; sautVers(but); } });   // vidéo en échec : elle ne reste pas affichée (son affiche est l'arrêt de départ)
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
    fondu = { de, vers: n, t0: performance.now(), dur: 750 };
    montreArret(n, true);
    arrive();
    wake();
  }
  function arrive() {
    prepare(at, false);                     // la marche suivante (et le retour) se chargent pendant qu'on regarde la vitrine
    prepare(at - 1, true);
    precharge(at + 1);
    if (enAttente) { const d = enAttente; enAttente = 0; setTimeout(() => step(d), 120); }
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
    if (n === at + 1 && at < FIN && VIDEO_OK) marcher(at, false);
    else if (n === at - 1 && at > 0 && VIDEO_OK) marcher(at - 1, true);
    else sautVers(n);
  }
  function step(d) {
    if (lecture) { enAttente = d; return; }
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
    F.prix.textContent = prixArret(p);
    F.lien.href = lienArret(p);
    F.lien.textContent = p.bouton || 'Découvrir la pièce';
    F.lien.setAttribute('aria-label', p.liste ? p.bouton : `Découvrir la pièce : ${p.nom}`);
    // la table : chaque bracelet, son prix et sa fiche
    // repliée sur téléphone pour laisser voir la table, ouverte sur ordinateur
    F.details.hidden = !p.liste;
    F.details.open = !!p.liste && !portraitMQ.matches;
    F.resume.textContent = p.liste_titre || '';
    F.liste.innerHTML = p.liste ? p.liste.map((b) => `<li><a href="${lienProduit(b)}"><span>${echappe(b.nom)}</span>`
      + `<span>${b.epuise ? 'Épuisé' : prixTexte(b.prix)}</span></a></li>`).join('') : '';
  }
  function majPos(now) {
    if (lecture && lecture.v.ended) finDeMarche(lecture.i, lecture.inv);   // au cas où l'événement « ended » se perd
    if (lecture && lecture.v.duration) {
      const k = clamp(lecture.v.currentTime / lecture.v.duration, 0, 1);
      pos = lecture.inv ? lecture.i + 1 - k : lecture.i + k;
    }
    else if (fondu) {
      const k = clamp((now - fondu.t0) / fondu.dur, 0, 1);
      pos = fondu.de + (fondu.vers - fondu.de) * k;
      if (k >= 1) { fondu = null; pos = at; }
    } else if (!lecture) pos = at;
  }
  function render() {
    const p = pos;
    const ouv = 1 - smooth(p, 0, 0.12);
    ouverture.style.opacity = ouv;
    ouverture.style.visibility = ouv < 0.01 ? 'hidden' : 'visible';
    // « Sept vitrines. Choisissez la vôtre. » : pendant l'entrée, quand on passe devant les deux premières vitrines
    const arr = lecture && lecture.i === 0 ? smooth(p, 0.18, 0.34) * (1 - smooth(p, 0.62, 0.8)) : 0;
    arrivee.style.opacity = arr;
    arrivee.style.visibility = arr < 0.01 ? 'hidden' : 'visible';
    // la fin (« Votre pièce vous attend ») monte pendant la dernière marche, vers le logo
    const fo = smooth(p, FIN - 0.45, FIN);
    fin.style.opacity = fo;
    fin.classList.toggle('visible', fo > 0.6);
    fin.style.visibility = fo < 0.01 ? 'hidden' : 'visible';
    const hs = clamp(Math.round(p), 1, DERNIER);
    const dist = p < 1 ? 1 - p : p > DERNIER ? p - DERNIER : Math.abs(p - hs);
    const fo2 = 1 - smooth(dist, 0.04, 0.16);
    if (fo2 > 0.01 && hs - 1 !== ficheIdx) setFiche(hs - 1);
    fiche.style.opacity = fo2;
    fiche.style.transform = portraitMQ.matches ? `translateY(${(1 - fo2) * 18}px)` : `translateY(calc(-50% + ${(1 - fo2) * 14}px))`;
    fiche.classList.toggle('visible', fo2 > 0.6);
    if (fo2 < 0.25) fiche.setAttribute('inert', ''); else fiche.removeAttribute('inert');
    fiche.style.visibility = fo2 < 0.01 ? 'hidden' : 'visible';
    const cur = Math.round(p);
    dots.forEach((d, n) => { if (n === cur) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
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
    return [(vw - w) / 2 + fx * w, (vh - h) / 2 + fy * h];
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

  // ---------------------------------------------------------------- boucle (seulement quand quelque chose bouge)
  let running = false, lastT = 0;
  function wake() { if (!running && !document.hidden) { running = true; lastT = performance.now(); requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    majPos(now);
    render();
    const sp = sparkle(dt);
    if (lecture || fondu || sp) requestAnimationFrame(tick); else running = false;
  }

  // ---------------------------------------------------------------- lumière : allumée ou éteinte comme le site
  function changeVersion(mode) {
    // le mode vient du message du site (boutique hébergée ailleurs : pas de stockage commun), sinon du stockage partagé
    const v = mode ? (mode === 'noir' ? 'eteint' : 'allume') : lireVersion();
    if (v === VERSION) return;
    VERSION = v;
    if (lecture) { lecture.v.pause(); lecture.v.classList.remove('is-on'); lecture = null; }
    fondu = null;
    oublie();
    creeVideos();
    montreArret(at, true);                    // fondu vers le même arrêt, dans l'autre lumière
    arrive();
    wake();
  }
  addEventListener('storage', (e) => { if (e.key === 'bg-mode') changeVersion(); });
  addEventListener('message', (e) => { if (e.data && e.data.boutique === 'mode') changeVersion(e.data.mode); });

  // ---------------------------------------------------------------- mise en page
  let pret = false;
  function layout() {
    vw = cadre.clientWidth; vh = cadre.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
    const f = fmt();
    root.classList.toggle('format-secours', f !== fmtVoulu());
    if (f !== F_ || !pret) {
      F_ = f;
      pret = true;
      if (lecture) { lecture.v.pause(); lecture = null; }
      oublie();
      creeVideos();
      stills.forEach((s) => { s.removeAttribute('src'); s.classList.remove('is-on', 'dessus', 'fondu'); });
      montreArret(at, false);
      arrive();
    }
    render();
    wake();
  }

  // ---------------------------------------------------------------- gestes
  const embarque = window.parent !== window;
  if (embarque) {
    root.classList.add('embarque');
    // sur l'accueil, « Passer l'animation » fait défiler le site jusqu'à la section suivante (catalogue, personnalités,
    // histoire) au lieu de quitter la page : on n'est jamais obligé de faire tout le tour pour voir la suite
    $$('.passer, .evitement').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      try { window.parent.postMessage({ boutique: 'bord', dir: 1 }, '*'); } catch (err) { /* sans effet */ }
    }));
  }
  // Sur l'accueil, la boutique ne prend la molette et le doigt que lorsqu'elle remplit l'écran : le site le lui dit
  // (message « cadre »). À moitié visible, un geste la fait d'abord venir en entier (message « aligner ») au lieu
  // d'avancer ; dans l'autre sens, il la quitte. Un site qui ne répond pas (ancienne version) : la boutique garde la main.
  let aligne = !embarque, parentRepond = false;
  const pris = () => aligne || !parentRepond;
  function aligner(dir) {
    try { window.parent.postMessage({ boutique: 'aligner', dir }, '*'); } catch (e) { /* sans effet */ }
  }
  if (embarque) {
    addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data || e.data.boutique !== 'cadre') return;
      parentRepond = true;
      aligne = !!e.data.aligne;
      stage.style.touchAction = pris() ? 'none' : 'pan-y';   // à moitié visible, le doigt fait défiler le site
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
    const cible = (lecture ? (lecture.inv ? lecture.i : lecture.i + 1) : at) + dir;
    if (cible < 0 || cible > FIN) { bord(dir); return; }
    step(dir);
  }
  let wheelGesture = false, wheelTimer = 0, wheelAcc = 0;
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelGesture = false; wheelAcc = 0; }, 180);
    if (wheelGesture) return;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) >= 24) {
      wheelGesture = true;
      if (pris()) avance(wheelAcc > 0 ? 1 : -1); else aligner(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0;
    }
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = e.target.closest && e.target.closest('a,button,input,select,textarea');
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
  stage.addEventListener('touchmove', (e) => { if (t0 && t0.pris) e.preventDefault(); }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    if (!t0) return;
    const t = e.changedTouches[0];
    const tenu = t0.pris;
    const dy = (tenu ? t.clientY : t.screenY) - t0.y, dx = (tenu ? t.clientX : t.screenX) - t0.x;
    t0 = null;
    const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (Math.abs(d) < 36) return;
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
  if (depart >= 0 && depart <= FIN) { at = depart; pos = depart; }
  layout();

  window.__boutique = {
    goTo, step,
    setPos(p) { goTo(Math.round(p), true); },
    get pos() { return pos; },
    get arret() { return at; },
    get fiche() { return ficheIdx; },
    get format() { return F_; },
    get niveau() { return CODEC; },
    get version() { return VERSION; },
    get enCours() { return !!lecture || !!fondu; },
    get prend() { return pris(); },
    get chargees() { return Object.values(pistes).filter((v) => v.readyState >= 3).length; },
  };
})();
