/* Breslev Gang — menu de l'en-tête (volet) et filet sous l'en-tête au défilement.
   Le site est toujours blanc (7 novembre : plus de mode Noir). */
(() => {
  'use strict';

  const html = document.documentElement;
  // un ancien choix « Noir » mémorisé sur l'appareil ne sert plus : on l'efface
  try { window.localStorage.removeItem('bg-mode'); } catch (e) { /* stockage indisponible */ }

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
      // Retour depuis le cache : jamais de verrou de défilement résiduel. (Le volet sert à toutes les largeurs.)
      window.addEventListener('pageshow', () => { if (!this.isOpen()) this.unlock(); });
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

  const start = () => { Menu.init(); initScrolled(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

})();
