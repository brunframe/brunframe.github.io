/* Breslev Gang — scripts communs : en-tête, vidéo, apparitions, cookies, verrou de défilement.
   Le panier vit dans assets/cart.js (window.BGCart). Les éléments à animer portent data-anim. */
(() => {
  'use strict';

  const config = window.themeConfig || { routes: {}, strings: {} };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Écran tactile : défilement natif, jamais de défilement lissé (Lenis ou équivalent).
  const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const smoothScroll = !touch && !reducedMotion;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Verrou de défilement partagé (tiroir, menu, nuancier) ----------
     Chaque ouvreur prend un verrou nommé ; la page ne reste figée que tant qu'il en reste un.
     Quand plus rien n'est ouvert, html et body ne gardent aucun overflow:hidden. */
  const locks = new Set();
  const applyLock = () => {
    const on = locks.size > 0;
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (!on) document.body.style.overflow = '';
  };
  const scrollLock = {
    acquire(name) { locks.add(name || 'anon'); applyLock(); },
    release(name) { locks.delete(name || 'anon'); applyLock(); },
    releaseAll() { locks.clear(); applyLock(); },
    get active() { return locks.size > 0; }
  };
  // Filets de sécurité : un <dialog> fermé par Échap, un retour depuis le cache de navigation,
  // ou un menu/tiroir fermé sans passer par le verrou ne laissent jamais la page figée.
  const nothingOpen = () => !$('.drawer.is-open, dialog[open], [data-menu][aria-expanded="true"], .is-menu-open');
  const settle = () => { if (nothingOpen()) scrollLock.releaseAll(); };
  document.addEventListener('close', (event) => { if (event.target && event.target.matches && event.target.matches('dialog')) setTimeout(settle, 0); }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setTimeout(settle, 50); });
  window.addEventListener('pageshow', (event) => { if (event.persisted) scrollLock.releaseAll(); });

  /* ---------- Défilement lissé : seulement si une bibliothèque est chargée, jamais au doigt ---------- */
  function initSmoothScroll() {
    if (!smoothScroll || typeof window.Lenis !== 'function' || window.BG.lenis) return;
    try { window.BG.lenis = new window.Lenis({ autoRaf: true }); } catch (e) { window.BG.lenis = null; }
  }

  /* ---------- Apparitions (fondu) ---------- */
  const revealObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add('reveal-in');
          el.classList.remove('reveal-pending');
          revealObserver.unobserve(el);
        });
      }, { rootMargin: '0px 0px -8% 0px' })
    : null;

  function reveal(root = document) {
    if (!revealObserver) return;
    const limit = window.innerHeight;
    $$('[data-reveal]:not(.reveal-in):not(.reveal-pending)', root).forEach((el) => {
      // Ce qui est déjà visible au chargement n'est jamais caché.
      if (el.getBoundingClientRect().top < limit) return;
      el.classList.add('reveal-pending');
      revealObserver.observe(el);
    });
  }

  /* ---------- En-tête au-dessus de la vidéo ----------
     La vidéo reste fixée derrière : le reste de la page glisse par-dessus comme un rideau blanc.
     L'en-tête repasse en blanc dès que ce rideau atteint son bord. */
  function initHeader() {
    const header = $('[data-header]');
    const hero = $('[data-hero]');
    if (!header) return;
    if (!hero || !header.classList.contains('header--home')) {
      header.classList.remove('is-over-hero');
      return;
    }
    let ticking = false;
    const update = () => {
      ticking = false;
      const over = window.scrollY < hero.offsetHeight - header.offsetHeight;
      header.classList.toggle('is-over-hero', over);
      hero.classList.toggle('is-covered', window.scrollY >= hero.offsetHeight);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- Roulement vertical d'un texte (prix, nom de couleur) ---------- */
  function roll(el, text) {
    if (!el) return;
    if (el.textContent === text) return;
    if (reducedMotion || !el.animate) { el.textContent = text; return; }
    const old = document.createElement('span');
    old.className = 'roll__out';
    old.textContent = el.textContent;
    el.classList.add('roll');
    el.textContent = text;
    el.appendChild(old);
    const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    old.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-110%)', opacity: 0 }], { duration: 480, easing: ease, fill: 'forwards' })
      .onfinish = () => old.remove();
    el.animate([{ transform: 'translateY(90%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 520, easing: ease });
  }

  /* ---------- Vidéo d'accueil : chargée après la page, jamais bloquante ---------- */
  function initHeroVideo() {
    const video = $('[data-hero-video]');
    if (!video) return;
    const toggle = $('[data-hero-toggle]');
    const saveData = navigator.connection && navigator.connection.saveData;
    if (saveData) return;

    let userPaused = reducedMotion;
    let loaded = false;

    const setToggle = () => {
      if (!toggle) return;
      // Pas de bouton tant que la vidéo n'a aucune image à montrer (chargement lent ou échec).
      if (video.readyState < 2 || video.error) { toggle.hidden = true; return; }
      toggle.hidden = false;
      const paused = video.paused;
      toggle.textContent = paused ? config.strings.play : config.strings.pause;
      toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
    };

    const load = () => {
      if (loaded) return;
      loaded = true;
      const small = window.matchMedia('(max-width: 900px)').matches;
      video.src = (small ? video.dataset.srcSmall : video.dataset.srcLarge) || video.dataset.srcLarge;
      video.preload = 'auto';
      video.addEventListener('playing', () => { video.classList.add('is-playing'); setToggle(); });
      video.addEventListener('pause', setToggle);
      video.addEventListener('loadeddata', () => { video.classList.add('is-playing'); setToggle(); }, { once: true });
      video.addEventListener('error', () => { if (toggle) toggle.hidden = true; }, true);
      // Le bouton n'apparaît que lorsque la vidéo a des images à montrer.
      if (!userPaused) video.play().catch(() => { if (video.readyState >= 2) setToggle(); });
      else video.addEventListener('loadeddata', setToggle, { once: true });
    };

    const start = () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 1500 }) : setTimeout(load, 300));
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    if (toggle) {
      toggle.addEventListener('click', () => {
        if (video.paused) { userPaused = false; video.play().catch(() => {}); }
        else { userPaused = true; video.pause(); }
        setToggle();
      });
    }

    // Pause dès que le rideau blanc la recouvre, pour économiser la batterie.
    const hero = video.closest('[data-hero]');
    let covered = false;
    const check = () => {
      if (!loaded || !hero) return;
      const now = window.scrollY >= hero.offsetHeight || document.hidden;
      if (now === covered) return;
      covered = now;
      if (covered) video.pause();
      else if (!userPaused) video.play().catch(() => {});
    };
    window.addEventListener('scroll', check, { passive: true });
    document.addEventListener('visibilitychange', check);
  }

  /* ---------- Montants ---------- */
  function formatMoney(cents, currency) {
    const value = cents / 100;
    try {
      return new Intl.NumberFormat(config.locale || document.documentElement.lang || 'fr', {
        style: 'currency',
        currency: currency || config.currency || 'EUR',
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (e) {
      return `${value.toFixed(2)} ${currency || ''}`.trim();
    }
  }

  /* ---------- Bandeau cookies (API Customer Privacy de Shopify) ---------- */
  function initCookies() {
    const banner = $('[data-cookie-banner]');
    if (!banner || !window.Shopify || typeof window.Shopify.loadFeatures !== 'function') return;
    window.Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], (error) => {
      if (error) return;
      const privacy = window.Shopify.customerPrivacy;
      if (!privacy || typeof privacy.shouldShowBanner !== 'function' || !privacy.shouldShowBanner()) return;
      banner.hidden = false;
      const answer = (value) => {
        privacy.setTrackingConsent(
          { analytics: value, marketing: value, preferences: value, sale_of_data: value },
          () => { banner.hidden = true; }
        );
      };
      const accept = $('[data-cookie-accept]', banner);
      const decline = $('[data-cookie-decline]', banner);
      if (accept) accept.addEventListener('click', () => answer(true));
      if (decline) decline.addEventListener('click', () => answer(false));
    });
  }

  /* ---------- Pays et devise ---------- */
  function initLocalization() {
    $$('[data-localization-select]').forEach((select) => {
      select.addEventListener('change', () => select.form.submit());
    });
  }

  /* ---------- Pas d'emoji à l'écran (règle de la marque) ----------
     Certains textes venus de Shopify en contiennent (descriptions, noms de couleur) : ils sont retirés des textes
     et des attributs (titres, libellés, données lues par le panier et le choix de couleur). */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/u;
  const EMOJI_G = new RegExp(EMOJI.source, 'gu');
  const nettoie = (t) => t.replace(EMOJI_G, '').replace(/ {2,}/g, ' ').replace(/ +([.,])/g, '$1');
  function sansEmoji(root = document.body) {
    if (!root) return;
    const marche = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (EMOJI.test(n.nodeValue) && !n.parentElement.closest('script, style') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const noeuds = [];
    while (marche.nextNode()) noeuds.push(marche.currentNode);
    noeuds.forEach((n) => { n.nodeValue = nettoie(n.nodeValue); });
    root.querySelectorAll('*').forEach((el) => {
      for (const at of el.attributes) {
        if (EMOJI.test(at.value) && at.name !== 'href' && at.name !== 'src' && at.name !== 'srcset') el.setAttribute(at.name, nettoie(at.value).trim());
      }
    });
  }

  window.BG = Object.assign(window.BG || {}, {
    reveal, roll, formatMoney, scrollLock, touch, reducedMotion, smoothScroll, sansEmoji,
    get cart() { return window.BGCart || null; }
  });

  /* ---------- Démo statique (pas de Shopify derrière) ----------
     Le formulaire de contact ne peut rien envoyer : « Envoi désactivé (démo) » au lieu d'une page d'erreur,
     comme le panier (« Paiement désactivé (démo) »). Le choix du pays et de la devise demande Shopify : masqué. */
  function initDemo() {
    if (window.Shopify) return;
    $$('[data-demo-envoi] form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        let statut = form.querySelector('[data-demo-statut]');
        if (!statut) {
          statut = document.createElement('p');
          statut.className = 'form__status';
          statut.setAttribute('role', 'status');
          statut.dataset.demoStatut = '';
          form.prepend(statut);
        }
        statut.textContent = form.closest('[data-demo-envoi]').dataset.demoEnvoi;
      });
    });
    $$('[data-localization]').forEach((form) => {
      const bloc = form.closest('.footer__col, .footer__setting') || form;
      bloc.style.display = 'none';
    });
  }

  const ready = () => {
    sansEmoji();
    initDemo();
    initHeader();
    initHeroVideo();
    initSmoothScroll();
    initCookies();
    initLocalization();
    reveal();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
