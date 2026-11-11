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
    $$('h1.display, h2.display, .catalogue__subtitle, .maitresse__nom, .histoire__title', racine).forEach((el) => {
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

  /* ---------- Pièces maîtresses : la photo recule pendant que la suivante la recouvre ; le film de la pièce se joue.
     Les écrans sont en position: sticky : on mesure à chaque image, sans position mise en cache. ---------- */
  const panneaux = $$('[data-maitresse]');
  function maitresses() {
    if (!panneaux.length) return;
    const voir = new IntersectionObserver((entrees) => entrees.forEach((e) => {
      if (!e.isIntersecting) return;
      voir.unobserve(e.target);
      gsap.to($$('.maitresse__num, .maitresse__prix, .maitresse__cta', e.target), { opacity: 1, y: 0, duration: 1, stagger: 0.08, delay: 0.3 });
    }), { threshold: 0.35 });
    panneaux.forEach((el) => {
      gsap.set($$('.maitresse__num, .maitresse__prix, .maitresse__cta', el), { opacity: 0, y: 14 });
      voir.observe(el);
    });
    /* Films des pièces (vidéo verticale, sans son) : l'adresse n'est posée que lorsque l'écran approche, le film se joue
       une fois quand sa pièce est à l'écran, se pose sur sa dernière image, et rejoue si l'on y revient.
       Économie de données : aucun film, l'image d'attente reste. Lecture refusée (économie d'énergie) : pareil. */
    const econome = !!(navigator.connection && navigator.connection.saveData);
    const films = panneaux.map((el) => (econome ? null : $('video[data-film]', el)));
    films.forEach((v) => {
      if (!v) return;
      v.muted = true;
      // une fois le film apparu (fondu d'une seconde), il couvre son image d'attente : elle s'efface, sinon elle
      // se verrait en double quand le film s'assombrit sous la pièce suivante
      v.addEventListener('playing', () => { v.classList.add('est-pret'); setTimeout(() => { v.dataset.couvre = '1'; }, 1100); }, { once: true });
    });
    const film = (v, actif, proche) => {
      if (proche && !v.getAttribute('src')) { v.preload = 'auto'; v.src = v.dataset.film; }
      if (actif) {
        if (!v.dataset.actif) { v.dataset.actif = '1'; if (v.ended) v.currentTime = 0; }
        if (v.paused && !v.ended && v.getAttribute('src')) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      } else {
        delete v.dataset.actif;
        if (!v.paused) v.pause();
      }
    };
    let attente = false;
    const mesurer = () => {
      attente = false;
      const vh = window.innerHeight;
      const parti = window.scrollY > 8;                  // rien n'est chargé tant que le visiteur n'a pas commencé à descendre
      panneaux.forEach((el, k) => {
        const img = $('.maitresse__img', el);
        const suivant = panneaux[k + 1];
        if (!img) return;
        const r = el.getBoundingClientRect();
        const c = suivant ? Math.min(1, Math.max(0, 1 - (suivant.getBoundingClientRect().top - r.top) / el.offsetHeight)) : 0;
        const v = films[k];
        img.style.transform = 'scale(' + (1.08 - c * 0.08).toFixed(4) + ')';
        img.style.opacity = v && v.dataset.couvre ? '0' : (1 - c * 0.5).toFixed(3);
        if (!v) return;
        v.style.transform = img.style.transform;
        v.style.setProperty('--recul', c.toFixed(3));
        // à l'écran : la pièce est montée d'au moins 40 % et la suivante ne la recouvre pas encore à 45 % (un seul film à la fois)
        const visible = r.top < vh * 0.6 && r.bottom > vh * 0.3 && c < 0.45;
        film(v, visible && !document.hidden, (parti || r.top < vh * 0.98) && r.top < vh * 1.6 && r.bottom > -vh * 0.5);
      });
    };
    window.addEventListener('scroll', () => { if (!attente) { attente = true; requestAnimationFrame(mesurer); } }, { passive: true });
    window.addEventListener('resize', mesurer);
    document.addEventListener('visibilitychange', mesurer);
    mesurer();
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
    const img = lien && (lien.querySelector('video[data-couvre]') || lien.querySelector('img'));   // le film, s'il est à l'écran
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
