/* Breslev Gang — fiche produit.
   Couleur sans rechargement (photo en fondu, miniatures, prix, disponibilité, adresse ?variant=),
   bouton retour du navigateur, aperçu au survol d'une pastille (ordinateur), galerie glissable au doigt,
   taille obligatoire pour le textile, nuancier, guide des tailles, recommandations.
   Accepte ?variant=<id> (Shopify) et ?couleur=<nom> (anciennes fiches, voir data/redirections.csv).
   Le bouton d'ajout porte data-add-to-cart, data-variant-id, data-name, data-variant, data-price (centimes),
   data-image, data-url et, pour le textile sans taille choisie, data-requires-size : le panier s'en sert. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const WIDTHS = [390, 600, 800, 1000, 1300, 1600];
  const FADE = 250;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Même logique que les identifiants des anciennes fiches : minuscules, sans accents ni ponctuation.
  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

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
  const srcsetOf = (img, widths = WIDTHS) => widths.filter((w) => w <= img.w).map((w) => `${sized(img.src, w)} ${w}w`).join(', ');
  const escapeAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  const roll = (el, text) => {
    if (!el) return;
    if (window.BG && window.BG.roll) window.BG.roll(el, text);
    else el.textContent = text;
  };

  class ProductPage {
    constructor(root) {
      this.root = root;
      const json = $('[data-product-json]', root);
      if (!json) return;
      this.data = JSON.parse(json.textContent);
      this.select = $('[data-variant-select]', root);
      this.pickers = $$('[data-picker]', root);
      this.media = $('[data-product-media]', root);
      this.track = $('[data-track]', root);
      this.thumbs = $('[data-thumbs]', root);
      this.price = $('[data-product-price]', root);
      this.button = $('[data-atc]', root);
      this.form = $('[data-product-form]', root);
      this.availability = $('[data-availability]', root);
      this.nuancier = $('[data-nuancier]', root);
      this.guide = $('[data-guide]', root);
      this.sizePicker = $('[data-size-picker]', root);
      this.sizeHint = $('[data-size-hint]', root);
      this.variantPositions = this.data.variants.map((v) => v.imagePos).filter(Boolean).sort((a, b) => a - b);
      this.shownPos = null;
      this.loadToken = 0;
      this.alt = this.data.title || '';

      const currentId = Number(this.select && this.select.value);
      this.current = this.data.variants.find((v) => v.id === currentId) || this.data.variants[0];
      this.state = this.current.options.slice();
      if (this.data.sizeIndex >= 0 && !this.data.sizeChosen) this.state[this.data.sizeIndex] = null;
      const mainImg = $('[data-main-img]', root);
      this.shownPos = this.current.imagePos || (this.data.images[0] && this.data.images[0].pos) || 0;
      if (mainImg) mainImg.dataset.pos = String(this.shownPos);

      this.bind();
      this.readUrl();
      this.updateAvailability();
      this.updateButton(this.current);
      this.updateThumbs(0);
    }

    /* ---------- Liaisons ---------- */
    bind() {
      this.root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-picker] [data-value], [data-nuancier] [data-value]');
        if (button) {
          const picker = button.closest('[data-picker]');
          const index = picker ? Number(picker.dataset.optionIndex) : this.data.colorIndex;
          this.choose(index, button.dataset.value);
          if (this.nuancier && this.nuancier.contains(button)) this.closeNuancier();
          return;
        }
        const thumb = event.target.closest('[data-thumb]');
        if (thumb) this.goTo(Number(thumb.dataset.thumb));
      });

      // Ordinateur : survoler une pastille montre sa photo, la souris partie on revient à la couleur choisie.
      if (canHover && this.data.colorIndex >= 0) {
        const colorPicker = this.pickers.find((p) => Number(p.dataset.optionIndex) === this.data.colorIndex);
        if (colorPicker) {
          colorPicker.addEventListener('mouseover', (event) => {
            const swatch = event.target.closest('.swatches [data-value]');
            if (!swatch || swatch === this.hovered) return;
            this.hovered = swatch;
            this.preview(swatch.dataset.value);
          });
          colorPicker.addEventListener('mouseleave', () => this.endPreview());
          colorPicker.addEventListener('mouseout', (event) => {
            const swatch = event.target.closest('.swatches [data-value]');
            if (swatch && !(event.relatedTarget && event.relatedTarget.closest('.swatches [data-value]'))) this.endPreview();
          });
        }
      }

      const opener = $('[data-nuancier-open]', this.root);
      if (opener && this.nuancier) {
        opener.addEventListener('click', () => this.openNuancier());
        $('[data-nuancier-close]', this.nuancier).addEventListener('click', () => this.closeNuancier());
        const search = $('[data-nuancier-search]', this.nuancier);
        search.addEventListener('input', () => this.filterNuancier(search.value));
      }

      const guideOpen = $('[data-guide-open]', this.root);
      if (guideOpen && this.guide) {
        guideOpen.addEventListener('click', () => this.openDialog(this.guide));
        $('[data-guide-close]', this.guide).addEventListener('click', () => this.closeDialog(this.guide, guideOpen));
      }

      if (this.track) {
        let ticking = false;
        this.track.addEventListener('scroll', () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            const width = this.track.clientWidth || 1;
            this.updateThumbs(Math.round(this.track.scrollLeft / width));
          });
        }, { passive: true });
      }

      // Textile : pas d'ajout sans taille. Capturé avant le panier (theme.js écoute en phase de bouillonnement).
      document.addEventListener('submit', (event) => {
        if (!this.form || event.target !== this.form) return;
        if (!this.button || !this.button.hasAttribute('data-requires-size')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.showSizeHint();
      }, true);

      window.addEventListener('popstate', () => this.readUrl(true));
    }

    /* ---------- Adresse ---------- */
    readUrl(fromHistory = false) {
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get('variant'));
      const couleur = params.get('couleur');
      let match = null;
      if (id) match = this.data.variants.find((v) => v.id === id);
      if (!match && couleur && this.data.colorIndex >= 0) {
        const ci = this.data.colorIndex;
        const target = normalize(couleur);
        match = this.data.variants.find((v) => normalize(v.options[ci]) === target);
        // anciennes adresses où l'apostrophe est devenue un tiret (« camel-00-s » pour « Camel 00’s »)
        const serre = (s) => s.replace(/-/g, '');
        if (!match) match = this.data.variants.find((v) => serre(normalize(v.options[ci])) === serre(target));
        // « …-2 » : la deuxième des couleurs qui s'écrivent pareil (« Fire & Petek » et « Fire Petek »)
        const rang = !match && target.match(/^(.+)-(\d+)$/);
        if (rang) {
          const memes = this.data.variants.filter((v) => normalize(v.options[ci]) === rang[1]);
          const valeur = [...new Set(memes.map((v) => v.options[ci]))][Number(rang[2]) - 1];
          if (valeur) match = memes.find((v) => v.options[ci] === valeur);
        }
      }
      if (match) {
        if (fromHistory || match.id !== this.current.id || this.state.some((s) => s === null)) {
          this.apply(match, { history: couleur ? 'replace' : 'none', sizeKnown: true });
        }
      } else if (fromHistory) {
        // Retour à l'adresse sans variante : première variante, taille à choisir pour le textile.
        const first = this.data.variants.find((v) => v.available) || this.data.variants[0];
        this.apply(first, { history: 'none', sizeKnown: false });
      } else if (couleur) {
        this.writeUrl(this.current, 'replace');
      }
    }

    writeUrl(variant, mode) {
      if (mode === 'none') return;
      const url = new URL(window.location.href);
      url.searchParams.delete('couleur');
      url.searchParams.set('variant', variant.id);
      if (url.href === window.location.href) return;
      const state = { variant: variant.id };
      if (mode === 'push') window.history.pushState(state, '', url.toString());
      else window.history.replaceState(state, '', url.toString());
    }

    /* ---------- Choix ---------- */
    variantFor(state) {
      const fits = (v) => v.options.every((opt, i) => state[i] === null || state[i] === undefined || opt === state[i]);
      const matching = this.data.variants.filter(fits);
      return matching.find((v) => v.available) || matching[0] || null;
    }

    choose(index, value) {
      const wanted = this.state.slice();
      wanted[index] = value;
      let variant = this.variantFor(wanted);
      if (!variant) {
        // Combinaison inexistante : on garde la valeur cliquée et on relâche les autres choix.
        const loose = wanted.map((v, i) => (i === index ? v : null));
        variant = this.variantFor(loose);
        if (!variant) return;
      }
      const sizeKnown = this.data.sizeIndex < 0 || index === this.data.sizeIndex || this.state[this.data.sizeIndex] !== null;
      this.apply(variant, { history: 'push', sizeKnown, keep: wanted });
    }

    apply(variant, opts = {}) {
      const previous = this.current;
      this.current = variant;
      this.state = variant.options.slice();
      if (this.data.sizeIndex >= 0 && !opts.sizeKnown) this.state[this.data.sizeIndex] = null;
      if (opts.keep) {
        // Les choix explicites priment (ex. motif choisi mais couleur indisponible).
        opts.keep.forEach((v, i) => { if (v !== null && v !== undefined && variant.options[i] === v) this.state[i] = v; });
      }
      this.hovered = null;

      this.pickers.forEach((picker) => {
        const index = Number(picker.dataset.optionIndex);
        const value = this.state[index];
        if (index === this.data.colorIndex) this.ensureSwatch(picker, value);
        $$('[data-value]', picker).forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === value ? 'true' : 'false'));
        const label = $('[data-picker-value]', picker);
        if (label) {
          if (index === this.data.colorIndex) roll(label, this.colorLabel(value));
          else label.textContent = value || '';
        }
      });
      if (this.nuancier) {
        const value = this.state[this.data.colorIndex];
        $$('[data-value]', this.nuancier).forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === value ? 'true' : 'false'));
      }
      if (this.sizeHint && this.state[this.data.sizeIndex] !== null) this.sizeHint.hidden = true;

      if (this.price) {
        if (variant.compare) {
          this.price.innerHTML = `<span class="price"><s class="price__compare">${variant.compare}</s><span class="price__value">${variant.price}</span></span>`;
        } else {
          const value = $('.price__value', this.price);
          if (value && !$('.price__compare', this.price)) roll(value, variant.price);
          else this.price.innerHTML = `<span class="price"><span class="price__value">${variant.price}</span></span>`;
        }
      }

      this.updateButton(variant);
      if (this.availability) this.availability.hidden = !!variant.available;
      if (this.select) this.select.value = String(variant.id);

      const pos = variant.imagePos || (this.data.images[0] && this.data.images[0].pos) || 0;
      if (pos !== this.shownPos) this.showImages(variant);
      this.updateAvailability();
      this.writeUrl(variant, opts.history || 'push');
      this.root.dispatchEvent(new CustomEvent('variant:change', { bubbles: true, detail: { variant, previous } }));
    }

    updateButton(variant) {
      if (!this.button) return;
      const sizeMissing = this.data.sizeIndex >= 0 && this.state[this.data.sizeIndex] === null;
      const image = this.image(variant.imagePos) || this.data.images[0];
      this.button.disabled = !variant.available;
      this.button.textContent = variant.available ? this.button.dataset.labelAdd : this.button.dataset.labelSoldout;
      this.button.dataset.variantId = String(variant.id);
      this.button.dataset.variant = variant.options
        .map((o, i) => (i === this.data.colorIndex ? this.colorLabel(o) : o))
        .filter((o) => o && o !== 'Default Title').join(' / ');
      this.button.dataset.price = String(variant.priceCents);
      this.button.dataset.image = image ? sized(image.src, 600) : '';
      this.button.dataset.url = variant.url || '';
      if (sizeMissing) this.button.setAttribute('data-requires-size', '');
      else this.button.removeAttribute('data-requires-size');
    }

    showSizeHint() {
      if (this.sizeHint) this.sizeHint.hidden = false;
      if (this.sizePicker) {
        this.sizePicker.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        const first = $('[data-value]:not(.is-unavailable)', this.sizePicker) || $('[data-value]', this.sizePicker);
        if (first) first.focus({ preventScroll: true });
      }
    }

    // Couleur choisie dans le nuancier mais absente des pastilles visibles : on la fait entrer
    // à la place de la dernière pastille, pour que le choix reste visible sur la fiche.
    ensureSwatch(picker, value) {
      if (!this.nuancier || !value) return;
      const row = $('.swatches', picker);
      if (!row || $$('[data-value]', picker).some((b) => b.dataset.value === value)) return;
      const source = $$('[data-value]', this.nuancier).find((b) => b.dataset.value === value);
      if (!source) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch swatch--lg';
      button.dataset.value = value;
      button.setAttribute('aria-label', value);
      button.title = value;
      const inner = $('.swatch', source);
      if (inner) button.innerHTML = inner.innerHTML;
      const last = $$('.swatch[data-value]', row).pop();
      if (last) last.replaceWith(button);
      else row.appendChild(button);
    }

    /* ---------- Aperçu au survol ---------- */
    preview(value) {
      const wanted = this.state.map((v, i) => (i === this.data.colorIndex ? value : v));
      const variant = this.variantFor(wanted) || this.data.variants.find((v) => v.options[this.data.colorIndex] === value);
      if (!variant) return;
      this.previewing = true;
      const label = $('[data-picker-value]', this.pickers.find((p) => Number(p.dataset.optionIndex) === this.data.colorIndex));
      if (label) label.textContent = this.colorLabel(value);
      this.swapMain(this.image(variant.imagePos) || this.data.images[0], true);
    }

    // nom affiché d'une couleur : celui de la marque, sans le numéro ajouté par Shopify (snippets/color-label)
    colorLabel(value) {
      const scope = [this.root, this.nuancier].filter(Boolean);
      for (const el of scope) {
        const b = Array.from(el.querySelectorAll('[data-label]')).find((x) => x.dataset.value === value);
        if (b) return b.dataset.label;
      }
      return value || '';
    }

    endPreview() {
      this.hovered = null;
      if (!this.previewing) return;
      this.previewing = false;
      const label = $('[data-picker-value]', this.pickers.find((p) => Number(p.dataset.optionIndex) === this.data.colorIndex));
      if (label) label.textContent = this.colorLabel(this.state[this.data.colorIndex]);
      this.swapMain(this.image(this.shownPos) || this.data.images[0], true);
    }

    /* ---------- Photos ---------- */
    image(pos) { return this.data.images.find((img) => img.pos === pos); }

    shotsFor(variant) {
      const start = variant.imagePos || 0;
      const next = this.variantPositions.find((p) => p > start) || Infinity;
      return this.data.images.filter((img) => img.pos > start && img.pos < next);
    }

    // Fondu de 250 ms sur la première photo : la nouvelle arrive par-dessus l'ancienne, jamais de blanc.
    swapMain(image, isPreview) {
      const slide = this.track && $('[data-slide]', this.track);
      if (!slide || !image) return;
      const currentImg = $('img:not(.is-leaving)', slide);
      if (currentImg && Number(currentImg.dataset.pos) === image.pos) return;
      const token = ++this.loadToken;
      const next = document.createElement('img');
      next.alt = this.alt;
      next.sizes = '(min-width: 990px) 50vw, 100vw';
      next.srcset = srcsetOf(image);
      next.src = sized(image.src, Math.min(1600, image.w));
      next.dataset.pos = String(image.pos);
      next.className = 'is-entering';
      next.setAttribute('data-main-img', '');
      if (isPreview) next.dataset.preview = 'true';
      const place = () => {
        if (token !== this.loadToken) return;
        const old = $$('img', slide).filter((i) => i !== next);
        slide.appendChild(next);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          next.classList.remove('is-entering');
          old.forEach((img) => img.classList.add('is-leaving'));
          setTimeout(() => old.forEach((img) => img.remove()), reducedMotion ? 0 : FADE + 50);
        }));
      };
      let done = false;
      const once = () => { if (!done) { done = true; place(); } };
      if (next.decode) next.decode().then(once, once); else next.onload = once;
      setTimeout(once, 900);
    }

    showImages(variant) {
      const image = this.image(variant.imagePos) || this.data.images[0];
      if (!image) return;
      this.shownPos = image.pos;
      this.previewing = false;
      this.swapMain(image, false);
      if (!this.track) return;
      const shots = this.shotsFor(variant);
      const others = $$('[data-slide]', this.track).slice(1);
      others.forEach((s) => s.remove());
      const frag = document.createDocumentFragment();
      shots.forEach((img) => {
        const fig = document.createElement('figure');
        fig.className = 'product__slide media media--product';
        fig.setAttribute('data-slide', '');
        // le cadre prend la proportion de la photo (dimensions données par Shopify) : rien ne bouge au chargement
        if (img.w && img.h) fig.style.setProperty('--ratio', String(img.w / img.h));
        fig.innerHTML = `<img src="${sized(img.src, 1000)}" srcset="${srcsetOf(img)}" sizes="(min-width: 990px) 50vw, 100vw" alt="${escapeAttr(this.alt)}" loading="lazy" width="${img.w}" height="${img.h}">`;
        frag.appendChild(fig);
      });
      this.track.appendChild(frag);
      if (this.track.scrollLeft) this.track.scrollTo({ left: 0, behavior: 'auto' });
      if (this.thumbs) {
        const all = [image].concat(shots);
        this.thumbs.dataset.count = String(all.length);
        this.thumbs.innerHTML = all.map((img, i) => `<button type="button" class="product__thumb" data-thumb="${i}" aria-current="${i === 0 ? 'true' : 'false'}" aria-label="${escapeAttr(this.photoLabel(i + 1))}"><img src="${sized(img.src, 120)}" alt="" width="60" height="60" loading="lazy"></button>`).join('');
      }
    }

    photoLabel(n) {
      const first = this.thumbs && $('[data-thumb]', this.thumbs);
      const tpl = first ? first.getAttribute('aria-label') : '';
      return tpl ? tpl.replace(/\d+/, n) : String(n);
    }

    goTo(index) {
      if (!this.track) return;
      const slide = $$('[data-slide]', this.track)[index];
      if (!slide) return;
      if (this.track.scrollWidth > this.track.clientWidth + 1) {
        this.track.scrollTo({ left: slide.offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
      } else {
        slide.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
      this.updateThumbs(index);
    }

    updateThumbs(index) {
      if (!this.thumbs) return;
      $$('[data-thumb]', this.thumbs).forEach((b, i) => b.setAttribute('aria-current', i === index ? 'true' : 'false'));
    }

    /* ---------- Disponibilité ---------- */
    // Pastille barrée : aucune variante disponible avec cette valeur et les autres choix actuels.
    updateAvailability() {
      this.pickers.forEach((picker) => {
        const index = Number(picker.dataset.optionIndex);
        $$('[data-value]', picker).forEach((button) => {
          const value = button.dataset.value;
          const ok = this.data.variants.some((v) => v.available && v.options[index] === value
            && v.options.every((opt, i) => i === index || this.state[i] === null || opt === this.state[i]));
          button.classList.toggle('is-unavailable', !ok);
        });
      });
    }

    /* ---------- Boîtes de dialogue ---------- */
    openDialog(dialog) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      document.documentElement.style.overflow = 'hidden';
    }

    closeDialog(dialog, opener) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      document.documentElement.style.overflow = '';
      if (opener) opener.focus({ preventScroll: true });
    }

    openNuancier() { this.openDialog(this.nuancier); }

    closeNuancier() { this.closeDialog(this.nuancier, $('[data-nuancier-open]', this.root)); }

    filterNuancier(query) {
      const q = normalize(query);
      let visible = 0;
      $$('[data-nuancier-item]', this.nuancier).forEach((item) => {
        const show = !q || normalize(item.dataset.name).indexOf(q) !== -1;
        item.hidden = !show;
        if (show) visible += 1;
      });
      const empty = $('[data-nuancier-empty]', this.nuancier);
      if (empty) empty.hidden = visible > 0;
    }
  }

  /* 3 pièces à porter avec : complémentaires, sinon liées. */
  async function loadRecommendations(section) {
    const base = section.dataset.url;
    if (!base) return;
    for (const intent of ['complementary', 'related']) {
      try {
        const response = await fetch(`${base}&intent=${intent}`);
        if (!response.ok) continue;
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const fresh = $('[data-reco]', doc);
        if (fresh && $('[data-reco-list] li', fresh)) {
          section.innerHTML = fresh.innerHTML;
          if (window.BG) window.BG.reveal(section);
          return;
        }
      } catch (e) { /* source suivante */ }
    }
  }

  function init() {
    $$('[data-product]').forEach((root) => {
      if (!root.productPage) root.productPage = new ProductPage(root);
    });
    $$('[data-reco]').forEach((section) => {
      if (section.dataset.loaded) return;
      section.dataset.loaded = 'true';
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting) return;
          io.disconnect();
          loadRecommendations(section);
        }, { rootMargin: '600px 0px' });
        io.observe(section);
      } else {
        loadRecommendations(section);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
