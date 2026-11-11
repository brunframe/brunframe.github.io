/* Breslev Gang — le mouvement du site (11 novembre 2026), sans bibliothèque. Styles : assets/motion.css.
   La classe html.anim est posée dans <head> (layout/theme.liquid) sauf si l'appareil demande moins d'animations.
   Ici : titres découpés mot à mot, photos dévoilées au défilement, effets liés au défilement (héros, pièces
   maîtresses, filet de progression) et photo partagée entre la carte et la fiche. */
(() => {
  'use strict';

  const html = document.documentElement;
  if (!html.classList.contains('anim') || !('IntersectionObserver' in window)) return;
  html.classList.add('anim-js');
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Titres : chaque mot monte derrière son cache ---------- */
  function mots(el) {
    if (el.classList.contains('mots')) return;
    const marche = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textes = [];
    while (marche.nextNode()) textes.push(marche.currentNode);
    let i = 0;
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
        mot.style.setProperty('--i', i);
        i += 1;
        cache.appendChild(mot);
        f.appendChild(cache);
      });
      n.parentNode.replaceChild(f, n);
    });
    el.classList.add('mots');
  }

  const vu = new IntersectionObserver((entrees) => {
    entrees.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('vu');
      vu.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  function preparer(racine = document) {
    $$('h1.display, h2.display, .catalogue__subtitle, .maitresse__nom', racine).forEach((el) => {
      if (el.classList.contains('mots') || el.closest('.hero, [data-header], .card, dialog, [data-no-anim]')) return;
      mots(el);
      vu.observe(el);
    });
    $$('[data-maitresse]', racine).forEach((el) => vu.observe(el));
    const bas = window.innerHeight;
    $$('main figure, main .media', racine).forEach((el) => {
      if (el.classList.contains('voile') || el.closest('.card, .hero, .maitresse, [data-product-media], dialog, [data-no-anim]')) return;
      if (el.getBoundingClientRect().top < bas) return;       // ce qui est visible à l'ouverture n'est jamais caché
      el.classList.add('voile');
      vu.observe(el);
    });
  }

  /* ---------- Effets liés au défilement (une mesure par image, transform et opacity seulement) ---------- */
  const hero = document.querySelector('[data-hero]');
  const panneaux = $$('[data-maitresse]');
  const filet = document.createElement('div');
  filet.className = 'progression';
  filet.setAttribute('aria-hidden', 'true');
  document.body.appendChild(filet);
  let attente = false;
  function mesurer() {
    attente = false;
    const y = window.scrollY;
    const h = window.innerHeight;
    const max = html.scrollHeight - h;
    filet.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max).toFixed(4) : 0) + ')';
    if (hero) hero.style.setProperty('--hero-p', Math.min(1, Math.max(0, y / (hero.offsetHeight || h))).toFixed(3));
    panneaux.forEach((el, k) => {
      const suivant = panneaux[k + 1];
      const c = suivant ? Math.min(1, Math.max(0, 1 - (suivant.getBoundingClientRect().top - el.getBoundingClientRect().top) / el.offsetHeight)) : 0;
      el.style.setProperty('--couvert', c.toFixed(3));
    });
  }
  window.addEventListener('scroll', () => { if (!attente) { attente = true; requestAnimationFrame(mesurer); } }, { passive: true });
  window.addEventListener('resize', mesurer);

  /* ---------- De la carte à la fiche : la photo cliquée devient la photo de la fiche ---------- */
  const effacer = () => $$('[data-vt]').forEach((x) => { x.style.viewTransitionName = ''; x.removeAttribute('data-vt'); });
  document.addEventListener('click', (e) => {
    const lien = e.target.closest ? e.target.closest('a.card__link, a.maitresse__lien') : null;
    const img = lien && lien.querySelector('img');
    if (!img) return;
    effacer();
    img.style.viewTransitionName = 'piece';
    img.setAttribute('data-vt', '');
  }, true);
  window.addEventListener('pageshow', (e) => { if (e.persisted) effacer(); });

  function pret() {
    preparer();
    mesurer();
    // filet de sécurité : rien ne reste caché si l'observateur n'a pas répondu
    setTimeout(() => $$('.mots:not(.vu), .voile:not(.vu)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('vu');
    }), 3500);
  }
  window.BG = Object.assign(window.BG || {}, { mouvement: preparer });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pret);
  else pret();
})();
