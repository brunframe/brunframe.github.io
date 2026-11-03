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
  $$('[data-lien="collection"]').forEach((a) => { a.href = lienCollection; });
  $$('[data-lien="accueil"]').forEach((a) => { a.href = `${C.SITE_URL}${C.ACCUEIL}`; });

  // ---------------------------------------------------------------- format et définition
  const portraitMQ = matchMedia('(max-aspect-ratio: 9/10)');
  // format voulu par l'écran ; s'il n'est pas encore calculé, on montre l'autre en entier (bandes sur les côtés)
  const fmtVoulu = () => (portraitMQ.matches ? '9x16' : '16x9');
  const fmt = () => { const f = fmtVoulu(); return SALLE[f] || !SALLE[f === '9x16' ? '16x9' : '9x16'] ? f : (f === '9x16' ? '16x9' : '9x16'); };
  // navigateur sans H.264 (rare) : fondus enchaînés entre les arrêts, sans vidéo
  const VIDEO_OK = !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640033"');
  function niveau(f) {
    const dpr = window.devicePixelRatio || 1;
    if (f === '16x9') return Math.max(innerWidth * dpr, innerHeight * dpr * 16 / 9) >= 2200 ? '2160' : '1080';
    return Math.max(innerHeight * dpr, innerWidth * dpr * 16 / 9) >= 2200 ? '2560' : '1920';
  }
  const NV = PRODUITS.length;                                         // vitrines, une pièce chacune
  // segment i : de l'arrêt i à l'arrêt i + 1 (i : l'entrée ; v2… : d'une vitrine à la suivante ; f : vers le logo)
  const SEGMENTS = ['i'].concat(PRODUITS.slice(1).map((p, k) => `v${k + 2}`), ['f']);
  const FIN = SEGMENTS.length;                                        // dernier arrêt : le mur au logo
  const DERNIER = NV;                                                 // dernière vitrine
  const deux = (n) => String(n).padStart(2, '0');
  const arretSrc = (f, i) => `assets/salle/${f}/arret-${i}.webp`;
  const videoSrc = (f, n, i) => `assets/salle/${f}/${n}/${SEGMENTS[i]}.mp4`;

  // ---------------------------------------------------------------- version statique (mouvement réduit)
  const liste = $('.diaporama-liste');
  PRODUITS.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<figure><picture><source media="(max-aspect-ratio: 9/10)" srcset="${arretSrc('9x16', p.n)}">
      <img src="${arretSrc('16x9', p.n)}" alt="${p.alt}" width="1920" height="1080" loading="lazy" decoding="async"></picture>
      <figcaption><span class="d-num">${deux(p.n)} / ${deux(NV)}</span><span class="d-nom">${p.nom}</span><span class="d-ref">Réf. ${p.ref}</span>
      <span class="d-prix">${prixTexte(p.prix)}</span><a class="bouton" href="${lienProduit(p)}">Découvrir la pièce</a></figcaption></figure>`;
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
  let F_ = fmt(), N_ = niveau(F_);
  let at = 0;                 // arrêt courant (entier)
  let pos = 0;                // position continue (pour les textes et les fondus)
  let lecture = null;         // { i, v } : vidéo de marche en cours
  let enAttente = 0;          // pas demandés pendant une marche (+1 / -1)
  let fondu = null;           // { de, vers, t0, dur } : fondu enchaîné entre deux arrêts
  let actif = 0;              // index de l'image d'arrêt visible
  let ficheIdx = -1;
  const videos = [];          // une balise <video> par segment (format courant)

  function creeVideos() {
    marches.innerHTML = '';
    videos.length = 0;
    SEGMENTS.forEach((n, i) => {
      const v = document.createElement('video');
      v.muted = true; v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.setAttribute('disablepictureinpicture', ''); v.setAttribute('disableremoteplayback', '');
      v.preload = 'none';
      v.dataset.seg = n;
      v.addEventListener('ended', () => finDeMarche(i));
      marches.appendChild(v);
      videos.push(v);
    });
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
  function prepare(i) {
    const v = videos[i];
    if (!VIDEO_OK || !v || v.dataset.charge) return;
    v.dataset.charge = '1';
    v.poster = arretSrc(F_, i);
    telecharge(videoSrc(F_, N_, i)).then((u) => {
      if (!u || videos[i] !== v || v.dataset.src) return;
      v.dataset.src = 'memoire';
      v.preload = 'auto';
      v.src = u;
      v.load();
    });
  }
  function source(i) {                      // la vidéo n'est pas encore en mémoire : lecture directe depuis le réseau
    const v = videos[i];
    if (v.dataset.src) return;
    v.dataset.src = 'reseau';
    v.preload = 'auto';
    v.src = videoSrc(F_, N_, i);
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
  function marcher(i) {                     // de l'arrêt i à l'arrêt i + 1 (vidéo)
    const v = videos[i];
    prepare(i);
    source(i);
    lecture = { i, v };
    if (v.currentTime) v.currentTime = 0;
    const p = v.play();                      // appelé dans le geste de l'utilisateur (iPhone, mode économie d'énergie)
    v.classList.add('is-on');                // l'affiche de la vidéo est l'image de l'arrêt : rien ne bouge avant la première image
    if (v.readyState < 3) {
      chargement.classList.add('is-on');
      v.addEventListener('playing', () => chargement.classList.remove('is-on'), { once: true });
    }
    if (p && p.catch) p.catch(() => { if (lecture && lecture.v === v) { lecture = null; chargement.classList.remove('is-on'); sautVers(i + 1); } });
    prepare(i + 1);
    precharge(i + 2);
    wake();
  }
  function finDeMarche(i) {
    if (!lecture || lecture.i !== i) return;
    const v = lecture.v;
    at = i + 1;
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
    prepare(at);                            // la marche suivante se charge pendant qu'on regarde la vitrine
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
    if (lecture) { enAttente = clamp(n - (lecture.i + 1), -1, 1); return; }
    if (n === at + 1 && at < FIN && VIDEO_OK) marcher(at);
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
    F.prix.textContent = prixTexte(p.prix);
    F.lien.href = lienProduit(p);
    F.lien.setAttribute('aria-label', `Découvrir la pièce : ${p.nom}`);
  }
  function majPos(now) {
    if (lecture && lecture.v.ended) finDeMarche(lecture.i);   // au cas où l'événement « ended » se perd
    if (lecture && lecture.v.duration) pos = lecture.i + clamp(lecture.v.currentTime / lecture.v.duration, 0, 1);
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

  // ---------------------------------------------------------------- mise en page
  function layout() {
    vw = cadre.clientWidth; vh = cadre.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
    const f = fmt(), n = niveau(f);
    root.classList.toggle('format-secours', f !== fmtVoulu());
    if (f !== F_ || n !== N_ || !videos.length) {
      F_ = f; N_ = n;
      if (lecture) { lecture.v.pause(); lecture = null; }
      oublie();
      creeVideos();
      stills.forEach((s) => { s.removeAttribute('src'); s.classList.remove('is-on', 'dessus', 'fondu'); });
      if (at <= DERNIER) montreArret(at, false);
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
    const cible = (lecture ? lecture.i + 1 : at) + dir;
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
    get niveau() { return N_; },
    get enCours() { return !!lecture || !!fondu; },
    get prend() { return pris(); },
    get chargees() { return videos.filter((v) => v.readyState >= 3).length; },
  };
})();
