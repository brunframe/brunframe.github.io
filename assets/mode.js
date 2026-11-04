/* Breslev Gang — mode Blanc / Noir et menu de l'en-tête.
   Le mode est posé avant le premier rendu par le script en ligne de layout/theme.liquid ;
   ici : le bouton, la mémoire du choix, le suivi de prefers-color-scheme, le menu mobile. */
(() => {
  'use strict';

  const html = document.documentElement;
  const config = (window.themeConfig && window.themeConfig.mode) || {};
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Mode ---------- */
  const Mode = {
    key: 'bg-mode',
    media: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null,

    current() { return html.getAttribute('data-theme') === 'noir' ? 'noir' : 'blanc'; },

    stored() {
      try { return window.localStorage.getItem(this.key); } catch (e) { return null; }
    },

    apply(mode, remember) {
      html.setAttribute('data-theme', mode);
      html.style.colorScheme = mode === 'noir' ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', mode === 'noir' ? '#111010' : '#F6F4F0');
      if (remember) { try { window.localStorage.setItem(this.key, mode); } catch (e) {} }
      this.paint();
      // la boutique immersive (iframe, parfois sur une autre adresse) s'allume ou s'éteint avec le site
      $$('[data-boutique-immersive] iframe').forEach((f) => { try { f.contentWindow.postMessage({ boutique: 'mode', mode }, '*'); } catch (e) {} });
      document.dispatchEvent(new CustomEvent('mode:change', { detail: { mode } }));
    },

    paint() {
      const mode = this.current();
      $$('[data-mode-toggle]').forEach((btn) => {
        btn.setAttribute('aria-pressed', mode === 'noir' ? 'true' : 'false');
        const label = mode === 'noir' ? config.toBlanc : config.toNoir;
        if (label) btn.setAttribute('aria-label', label);
        $$('[data-mode-opt]', btn).forEach((opt) => {
          opt.classList.toggle('is-active', opt.dataset.modeOpt === mode);
        });
      });
    },

    init() {
      if (config.enabled === false) { $$('[data-mode-toggle]').forEach((b) => { b.hidden = true; }); return; }
      this.paint();
      document.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-mode-toggle]');
        if (!btn) return;
        event.preventDefault();
        this.apply(this.current() === 'noir' ? 'blanc' : 'noir', true);
      });
      // Sans choix mémorisé, le site suit le réglage de l'appareil quand il change.
      if (this.media && this.media.addEventListener) {
        this.media.addEventListener('change', (e) => {
          if (this.stored()) return;
          this.apply(e.matches ? 'noir' : 'blanc', false);
        });
      }
    }
  };

  /* ---------- Menu mobile de l'en-tête ---------- */
  const Menu = {
    root: null,
    button: null,
    lastFocus: null,

    init() {
      this.root = document.querySelector('[data-menu]');
      this.button = document.querySelector('[data-menu-open]');
      if (!this.root || !this.button) return;
      this.button.addEventListener('click', () => (this.isOpen() ? this.close() : this.open()));
      this.root.addEventListener('click', (event) => {
        if (event.target.closest('[data-menu-close]')) { this.close(); return; }
        const link = event.target.closest('a[href]');
        if (link) this.close();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.isOpen()) this.close();
      });
      // Passage en grand écran, retour depuis le cache : jamais de verrou de défilement résiduel.
      const wide = window.matchMedia('(min-width: 750px)');
      const onWide = () => { if (wide.matches && this.isOpen()) this.close(); };
      if (wide.addEventListener) wide.addEventListener('change', onWide);
      window.addEventListener('pageshow', () => this.unlock());
    },

    isOpen() { return this.root.classList.contains('is-open'); },

    lock() { html.classList.add('menu-open'); },
    unlock() { html.classList.remove('menu-open'); },

    open() {
      this.lastFocus = document.activeElement;
      this.root.classList.add('is-open');
      this.root.removeAttribute('inert');
      this.root.setAttribute('aria-hidden', 'false');
      this.button.setAttribute('aria-expanded', 'true');
      this.lock();
      const first = this.root.querySelector('a[href], button');
      if (first) first.focus({ preventScroll: true });
    },

    close() {
      this.root.classList.remove('is-open');
      this.root.setAttribute('aria-hidden', 'true');
      this.root.setAttribute('inert', '');
      this.button.setAttribute('aria-expanded', 'false');
      this.unlock();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus({ preventScroll: true });
    }
  };

  /* ---------- Filet sous l'en-tête dès que la page défile ---------- */
  function initScrolled() {
    const header = document.querySelector('[data-header]');
    if (!header) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  const start = () => { Mode.init(); Menu.init(); initScrolled(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.themeMode = Mode;
})();
