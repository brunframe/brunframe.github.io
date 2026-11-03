/* Breslev Gang — catalogue : filtres par catégorie puis par univers, sans recharger la page.
   Cartes (toutes les grilles) : survoler ou toucher une pastille change la photo, le lien et le bouton
   « Ajouter » (data-variant-id, data-price, data-image, data-url, data-variant). */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const WIDTHS = [240, 360, 480, 640, 900];
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // Les adresses Shopify acceptent ?width= : on remplace la largeur demandée.
  const sized = (src, width) => {
    try {
      const url = new URL(src, window.location.href);
      url.searchParams.set('width', width);
      url.searchParams.delete('height');
      url.searchParams.delete('crop');
      return url.toString();
    } catch (e) {
      return src;
    }
  };

  /* ---------- Cartes : pastilles ---------- */
  function showSwatch(card, swatch, persist) {
    const img = $('[data-card-img]', card);
    const link = $('[data-card-link]', card);
    const add = $('[data-card-add]', card);
    const src = swatch.dataset.image || swatch.dataset.src;
    if (img && src && img.dataset.shown !== src) {
      img.dataset.shown = src;
      img.srcset = WIDTHS.map((w) => `${sized(src, w)} ${w}w`).join(', ');
      img.src = sized(src, 640);
    }
    if (link && swatch.dataset.url) link.href = swatch.dataset.url;
    if (add) {
      if (swatch.dataset.variantId) add.dataset.variantId = swatch.dataset.variantId;
      if (swatch.dataset.variant) add.dataset.variant = swatch.dataset.variant;
      if (swatch.dataset.price) add.dataset.price = swatch.dataset.price;
      if (src) add.dataset.image = sized(src, 600);
      if (swatch.dataset.url) add.dataset.url = swatch.dataset.url;
      add.disabled = swatch.dataset.available === 'false';
    }
    if (persist) {
      card.dataset.chosen = swatch.dataset.variantId || swatch.dataset.url || '';
      $$('[data-card-swatch]', card).forEach((b) => b.classList.toggle('is-active', b === swatch));
    }
  }

  function chosenSwatch(card) {
    const all = $$('[data-card-swatch]', card);
    return all.find((b) => b.classList.contains('is-active')) || all[0] || null;
  }

  function initCards() {
    if (document.documentElement.dataset.cardsReady) return;
    document.documentElement.dataset.cardsReady = 'true';

    document.addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-card-swatch]');
      if (!swatch) return;
      const card = swatch.closest('[data-card]');
      if (card) showSwatch(card, swatch, true);
    });

    if (!canHover) return;
    // Survol : la photo ne change que si la souris s'arrête un instant sur une pastille. Balayer le catalogue à la
    // souris ne lance donc plus une rafale de téléchargements de photos (c'est ce qui rendait la page lente).
    let attente = 0;
    document.addEventListener('mouseover', (event) => {
      const swatch = event.target.closest('[data-card-swatch]');
      if (!swatch) return;
      const card = swatch.closest('[data-card]');
      if (!card) return;
      clearTimeout(attente);
      attente = setTimeout(() => { if (swatch.matches(':hover')) showSwatch(card, swatch, false); }, 90);
    });
    // La souris quitte la carte : on revient à la couleur choisie.
    document.addEventListener('mouseout', (event) => {
      const card = event.target.closest('[data-card]');
      if (!card) return;
      if (event.relatedTarget && card.contains(event.relatedTarget)) return;
      clearTimeout(attente);
      const chosen = chosenSwatch(card);
      if (chosen) showSwatch(card, chosen, false);
    });
  }

  /* ---------- Filtres du catalogue ---------- */
  function initCatalogue(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';

    const cards = $$('[data-card]', root);
    const catButtons = $$('[data-filter="cat"]', root);
    const subRow = $('[data-filter-sub]', root);
    const uniButtons = $$('[data-filter="univers"]', root);
    const filters = $('.filters', root);
    const count = $('[data-catalogue-count]', root);
    const params = new URLSearchParams(window.location.search);
    const state = { cat: params.get('cat') || '', univers: params.get('univers') || '' };

    const press = (buttons, value) => buttons.forEach((b) => {
      const on = b.dataset.value === value;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    const apply = (fromUser) => {
      if (!catButtons.some((b) => b.dataset.value === state.cat)) state.cat = '';

      // Univers : seulement pour une catégorie qui en a (les colliers).
      let hasUniverses = false;
      uniButtons.forEach((b) => {
        if (!b.dataset.value) return;
        const show = !!state.cat && (b.dataset.cats || '').split(' ').indexOf(state.cat) !== -1;
        b.hidden = !show;
        if (show) hasUniverses = true;
      });
      if (!hasUniverses || !uniButtons.some((b) => b.dataset.value === state.univers && !b.hidden)) state.univers = '';
      if (subRow) subRow.hidden = !hasUniverses;

      let visible = 0;
      cards.forEach((card) => {
        const show = (!state.cat || card.dataset.cat === state.cat)
          && (!state.univers || card.dataset.univers === state.univers);
        card.classList.toggle('is-filtered-out', !show);
        if (show) visible += 1;
      });

      press(catButtons, state.cat);
      press(uniButtons, state.univers);
      if (count) {
        const template = visible === 1 ? count.dataset.one : count.dataset.other;
        if (template) count.textContent = template.replace('[n]', visible);
      }

      if (fromUser) {
        const url = new URL(window.location.href);
        ['cat', 'univers'].forEach((key) => {
          if (state[key]) url.searchParams.set(key, state[key]);
          else url.searchParams.delete(key);
        });
        window.history.replaceState(window.history.state, '', url.toString());
        if (filters && filters.getBoundingClientRect().top < 0) {
          const top = window.scrollY + root.getBoundingClientRect().top + (root.querySelector('.section__head') ? root.querySelector('.section__head').offsetHeight : 0);
          window.scrollTo({ top, behavior: 'auto' });
        }
        if (window.BG) window.BG.reveal(root);
        root.dispatchEvent(new CustomEvent('catalogue:filter', { bubbles: true, detail: Object.assign({}, state) }));
      }
    };

    root.addEventListener('click', (event) => {
      const filter = event.target.closest('[data-filter]');
      if (!filter) return;
      if (filter.dataset.filter === 'cat') { state.cat = filter.dataset.value; state.univers = ''; }
      else state.univers = filter.dataset.value;
      apply(true);
    });

    if (state.cat || state.univers) apply(false);
  }

  const init = () => {
    initCards();
    $$('[data-catalogue]').forEach(initCatalogue);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
