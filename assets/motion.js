/* Breslev Gang — le mouvement du site. Direction : qa/refonte-luxe/DIRECTION.md. Styles : assets/motion.css.
   Bibliothèques locales : gsap.min.js, ScrollTrigger.min.js, CustomEase.min.js, lenis.min.js (Lenis est créé par theme.js,
   à la souris seulement). html.anim est posé dans <head> sauf si l'appareil demande moins d'animations.
   Héros (zoom très lent, titre ligne par ligne), titres mot à mot, sections et photos qui apparaissent au défilement
   (ScrollTrigger), histoire épinglée une étape à la fois, pièces maîtresses, deuxième photo au survol des cartes,
   photo partagée entre la carte et la fiche. Si une bibliothèque manque, la page reste entière et fixe. */
(() => {
  'use strict';

  const html = document.documentElement;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (!html.classList.contains('anim') || !gsap || !ST) return;
  gsap.registerPlugin(ST);
  let courbe = 'power4.out';
  if (window.CustomEase) {
    gsap.registerPlugin(window.CustomEase);
    courbe = window.CustomEase.create('maison', '0.22, 1, 0.36, 1');
  }
  gsap.defaults({ ease: courbe, duration: 1 });
  ST.config({ ignoreMobileResize: true });
  html.classList.add('anim-js');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const souris = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const entete = () => parseFloat(getComputedStyle(html).getPropertyValue('--header-h')) || 60;

  /* ---------- Découpe d'un titre en mots (la phrase du héros est découpée en lignes par Liquid) ---------- */
  function mots(el) {
    const marche = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textes = [];
    const sortie = [];
    while (marche.nextNode()) textes.push(marche.currentNode);
    textes.forEach((n) => {
      if (!n.nodeValue.trim()) return;
      const f = document.createDocumentFragment();
      n.nodeValue.split(/(\s+)/).forEach((m) => {
        if (!m) return;
        if (/^\s+$/.test(m)) { f.appendChild(document.createTextNode(' ')); return; }
        const cache = document.createElement('span');
        const mot = document.createElement('span');
        cache.className = 'mot';
        mot.textContent = m;
        cache.appendChild(mot);
        f.appendChild(cache);
        sortie.push(mot);
      });
      n.parentNode.replaceChild(f, n);
    });
    el.classList.add('mots');
    return sortie;
  }

  /* ---------- Héros : l'entrée et le zoom lent sont en CSS (motion.css) ; ici, l'effacement au défilement ---------- */
  function heros() {
    const hero = $('[data-hero]');
    const dessus = hero && $('.hero__overlay', hero);
    if (dessus) gsap.to(dessus, { yPercent: -8, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ---------- Histoire : la scène reste épinglée, une étape à la fois ---------- */
  function histoire() {
    const section = $('.histoire');
    const piste = section && $('[data-histoire-piste]', section);
    const scene = piste && $('.histoire__steps', piste);
    const etapes = scene ? $$('.histoire__step', scene) : [];
    if (etapes.length < 2 || window.innerHeight < 600) return;
    section.classList.add('histoire--epingle');
    piste.style.setProperty('--etapes', etapes.length);
    // chaque étape doit tenir dans la scène ; sinon la lecture reste en continu
    if (etapes.some((li) => li.scrollHeight > scene.clientHeight + 4)) { section.classList.remove('histoire--epingle'); return; }
    let actif = -1;
    const activer = (k) => {
      if (k === actif) return;
      actif = k;
      etapes.forEach((li, i) => li.classList.toggle('est-actif', i === k));
    };
    activer(0);
    ST.create({
      trigger: piste,
      start: () => 'top top+=' + entete(),
      end: 'bottom bottom',
      onUpdate: (self) => {
        activer(Math.min(etapes.length - 1, Math.floor(self.progress * etapes.length)));
        scene.style.setProperty('--avance', self.progress.toFixed(3));
      },
    });
  }

  /* ---------- Titres mot à mot, sections et photos qui apparaissent au défilement ---------- */
  function apparitions(racine = document) {
    const bas = window.innerHeight;
    $$('h1.display, h2.display, .catalogue__subtitle, .histoire__title', racine).forEach((el) => {
      if (el.dataset.vu || el.closest('.hero, [data-header], .card, dialog, [data-no-anim], .histoire--epingle')) return;
      el.dataset.vu = '1';
      const m = mots(el);
      gsap.set(m, { yPercent: 118 });
      ST.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => gsap.to(m, { yPercent: 0, duration: 1.1, stagger: 0.06 }) });
    });
    $$('[data-reveal]:not(.card)', racine).forEach((el) => {
      if (el.dataset.vu || el.closest('.histoire--epingle, dialog')) return;
      el.dataset.vu = '1';
      if (el.getBoundingClientRect().top < bas) return;          // ce qui est visible à l'ouverture n'est jamais caché
      // opacity et non visibility : un lien pas encore apparu reste atteignable au clavier et par un lecteur d'écran
      gsap.set(el, { opacity: 0, y: 40 });
      ST.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 1.1 }) });
    });
    $$('main figure, main .media', racine).forEach((el) => {
      if (el.dataset.vu || el.closest('.card, .hero, .maitresse, [data-product-media], dialog, [data-no-anim], .histoire--epingle')) return;
      el.dataset.vu = '1';
      if (el.getBoundingClientRect().top < bas) return;
      const img = $('img, video', el);
      gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
      if (img) gsap.set(img, { scale: 1.16 });
      ST.create({
        trigger: el, start: 'top 92%', once: true,
        onEnter: () => {
          gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2 });
          if (img) gsap.to(img, { scale: 1, duration: 1.5 });
        },
      });
    });
  }

  /* ---------- Pièces maîtresses : la scène reste en place, l'écrin s'ouvre sur chaque pièce.
     La piste (haute) fait défiler une avance P : 0 = première pièce, 1 = deuxième… Deux volets s'écartent (--ouvert),
     le film de la pièce avance avec le doigt (suite d'images dessinée sur un canvas : aucune lecture vidéo), puis
     l'écrin se referme et s'ouvre sur la suivante. Une petite inertie lisse le geste. ---------- */
  function maitresses() {
    const section = $('[data-maitresses]');
    const piste = section && $('[data-maitresses-piste]', section);
    const scene = piste && $('[data-maitresses-scene]', piste);
    const pieces = scene ? $$('[data-maitresse]', scene) : [];
    const n = pieces.length;
    if (!n || !('IntersectionObserver' in window)) return;
    section.classList.add('maitresses--scene');
    piste.style.setProperty('--n', n);
    const econome = !!(navigator.connection && navigator.connection.saveData);
    const films = pieces.map((el) => {
      const toile = $('canvas[data-sequence]', el);
      const nb = toile ? parseInt(toile.dataset.images, 10) || 0 : 0;
      return toile && nb > 1 && !econome ? { toile, nb, modele: toile.dataset.sequence, images: null, vu: -1 } : null;
    });
    const adresse = (f, i) => f.modele.replace(/-\d+(\.\w+)(\?.*)?$/, (m, ext, fin) => '-' + String(i + 1).padStart(2, '0') + ext + (fin || ''));
    // d'abord quelques images réparties (le film existe tout de suite, en gros), puis toutes les autres
    const charger = (f) => {
      if (!f || f.images) return;
      f.images = new Array(f.nb).fill(null);
      const pris = new Set();
      [8, 4, 2, 1].forEach((pas) => {
        for (let i = 0; i < f.nb; i += pas) {
          if (pris.has(i)) continue;
          pris.add(i);
          const im = new Image();
          im.decoding = 'async';
          im.onload = () => { if (f.images) f.images[i] = im; };
          im.src = adresse(f, i);
        }
      });
    };
    const liberer = (f) => { if (f && f.images) { f.images = null; f.vu = -1; } };
    const dessiner = (f, x) => {
      if (!f || !f.images) return;
      const cible = Math.round(Math.min(1, Math.max(0, x)) * (f.nb - 1));
      let i = -1;
      for (let e = 0; e < f.nb && i < 0; e += 1) {
        if (f.images[cible - e]) i = cible - e;
        else if (f.images[cible + e]) i = cible + e;
      }
      if (i < 0 || i === f.vu) return;
      f.vu = i;
      if (!f.ctx) f.ctx = f.toile.getContext('2d');
      f.ctx.drawImage(f.images[i], 0, 0, f.toile.width, f.toile.height);
      f.toile.classList.add('est-pret');
    };
    const lisse = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
    const AVANCE = 0.14;                 // l'écrin de la pièce suivante commence à s'ouvrir un peu avant son tour
    let haut = 0;
    let pas = 1;
    let P = null;
    let actif = -1;
    let tourne = false;
    let V = 0;                           // ouverture montrée (suit le doigt, puis s'ouvre en entier au repos)
    let geste = 0;                       // heure du dernier défilement
    const mesurer = () => {
      haut = piste.getBoundingClientRect().top + window.scrollY;
      pas = Math.max(1, (piste.offsetHeight - scene.offsetHeight) / n);
    };
    const image = () => {
      const cible = (window.scrollY - haut) / pas;
      P = P === null || Math.abs(cible - P) > 1.5 ? cible : P + (cible - P) * 0.16;
      if (Math.abs(cible - P) < 0.0004) P = cible;
      const k = Math.min(n - 1, Math.max(0, Math.floor(P + AVANCE)));
      const u = P - k;
      const ouvre = k === 0 ? lisse((P + 0.80) / 0.62) : lisse((u + AVANCE) / 0.26);
      const ferme = k < n - 1 ? lisse((u - 0.70) / 0.16) : 0;
      // au repos (plus de défilement depuis un instant), l'écrin de la pièce à l'écran s'ouvre toujours en entier :
      // jamais d'écran noir à l'arrêt ; pendant le geste, les volets suivent le doigt
      const repos = performance.now() - geste > 170 && P > -0.45 && P < n - 0.35;
      const vise = repos ? 1 : ouvre * (1 - ferme);
      V += (vise - V) * (repos ? 0.075 : 0.5);
      if (Math.abs(vise - V) < 0.0005) V = vise;
      const ouvert = V;
      if (k !== actif) {
        actif = k;
        pieces.forEach((el, i) => el.classList.toggle('est-active', i === k));
        liberer(films[k - 2]);
        liberer(films[k + 2]);
      }
      // rien n'est téléchargé tant que le visiteur n'a pas commencé à descendre ; puis le film de la pièce qui
      // arrive, et celui de la suivante une fois la scène en place
      if (window.scrollY > 8 && P > -1.1) charger(films[k]);
      if (P > -0.25) charger(films[k + 1]);
      scene.style.setProperty('--ouvert', ouvert.toFixed(4));
      const el = pieces[k];
      el.style.setProperty('--zoom', (1.12 - 0.12 * ouvre + 0.03 * Math.max(0, u)).toFixed(4));
      el.style.setProperty('--monte', (26 * (1 - lisse((ouvert - 0.5) / 0.5))).toFixed(1) + 'px');
      dessiner(films[k], k === 0 ? (P + 0.80) / 1.66 : (u + AVANCE) / 1.0);
      if (tourne) requestAnimationFrame(image);
    };
    new IntersectionObserver((entrees) => {
      const proche = entrees.some((e) => e.isIntersecting);
      if (proche === tourne) return;
      tourne = proche;
      if (tourne) { mesurer(); requestAnimationFrame(image); }
    }, { rootMargin: '120% 0px' }).observe(section);
    window.addEventListener('scroll', () => { geste = performance.now(); }, { passive: true });
    window.addEventListener('resize', mesurer);
    window.addEventListener('load', mesurer);
    // au clavier : la pièce qui reçoit le focus vient à l'écran
    pieces.forEach((el, i) => el.addEventListener('focusin', () => {
      if (i === actif) return;
      mesurer();
      window.scrollTo(0, Math.round(haut + (i + 0.3) * pas));
    }));
    mesurer();
    image();
  }

  /* ---------- Téléphone : à l'accueil, les pièces et les catégories se font glisser de côté ; sur une fiche, les photos.
     Un filet or suit le geste. ---------- */
  function rails() {
    $$('.catalogue--accueil .catalogue__grid, .catalogue--accueil .categories, .product__track').forEach((liste) => {
      if (liste.dataset.rail || liste.children.length < 2) return;
      liste.dataset.rail = '1';
      const jauge = document.createElement('div');
      jauge.className = 'rail__jauge';
      jauge.setAttribute('aria-hidden', 'true');
      jauge.appendChild(document.createElement('span'));
      liste.insertAdjacentElement('afterend', jauge);
      const suivre = () => {
        const max = liste.scrollWidth - liste.clientWidth;
        const vu = liste.clientWidth / Math.max(1, liste.scrollWidth);
        jauge.style.setProperty('--avance', max > 4 ? (vu + (1 - vu) * Math.min(1, Math.abs(liste.scrollLeft) / max)).toFixed(3) : '1');
      };
      liste.addEventListener('scroll', suivre, { passive: true });
      window.addEventListener('resize', suivre);
      suivre();
    });
  }

  /* ---------- Cartes : au survol (souris seulement), fondu vers la deuxième photo, chargée à ce moment-là ---------- */
  function survol() {
    if (!souris) return;
    document.addEventListener('pointerover', (e) => {
      const carte = e.target.closest ? e.target.closest('.card') : null;
      const media = carte && $('.card__media[data-survol]', carte);
      if (!media || media.dataset.charge) return;
      media.dataset.charge = '1';
      const base = $('img', media);
      const img = new Image();
      img.className = 'card__img2';
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('load', () => {
        media.appendChild(img);
        requestAnimationFrame(() => img.classList.add('est-pret'));
      });
      img.src = media.dataset.survol;
      // une pastille change la photo principale : la deuxième photo ne lui correspond plus
      if (base) new MutationObserver(() => img.remove()).observe(base, { attributes: true, attributeFilter: ['src', 'srcset'] });
    });
  }

  /* ---------- De la carte à la fiche : la photo cliquée devient la photo de la fiche ---------- */
  const effacer = () => $$('[data-vt]').forEach((x) => { x.style.viewTransitionName = ''; x.removeAttribute('data-vt'); });
  document.addEventListener('click', (e) => {
    const lien = e.target.closest ? e.target.closest('a.card__link, a.maitresse__lien') : null;
    const img = lien && (lien.querySelector('canvas.est-pret') || lien.querySelector('img'));   // le film, s'il est à l'écran
    if (!img) return;
    effacer();
    img.style.viewTransitionName = 'piece';
    img.setAttribute('data-vt', '');
  }, true);
  window.addEventListener('pageshow', (e) => { if (e.persisted) effacer(); });

  function pret() {
    heros();
    histoire();
    apparitions();
    maitresses();
    rails();
    survol();
    const filet = document.createElement('div');
    filet.className = 'progression';
    filet.setAttribute('aria-hidden', 'true');
    document.body.appendChild(filet);
    gsap.to(filet, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true } });
    const lier = () => { if (window.BG && window.BG.lenis) window.BG.lenis.on('scroll', ST.update); };
    lier();
    document.addEventListener('bg:lenis', lier);          // Lenis arrive après coup, à la souris seulement
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ST.refresh());
    window.addEventListener('load', () => ST.refresh());
  }
  window.BG = Object.assign(window.BG || {}, { mouvement: (racine) => { apparitions(racine); ST.refresh(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pret);
  else pret();
})();
