/* Breslev Gang — panier : un seul code pour la boutique Shopify et pour la démo statique.

   DÉTECTION (au chargement, une seule fois)
     window.Shopify existe ET fetch('/cart.js') répond du JSON  → mode « shopify »
       API Ajax : /cart/add.js, /cart/change.js, /cart.js ; identifiants de variantes issus du Liquid.
     sinon                                                       → mode « demo »
       panier en localStorage (clé bg-cart-demo, lectures et écritures dans try/catch), lignes
       construites avec les données posées sur les boutons (voir ci-dessous).

   LE BOUTON STANDARD (fiche, vitrine, grille) — cart.js écoute les clics en délégation sur tout le document :
     <button type="button" data-add-to-cart
       data-variant-id="{{ variant.id }}"                  obligatoire (Liquid, jamais codé en dur)
       data-name="{{ product.title | escape }}"            nom du modèle
       data-variant="{{ variant.title | escape }}"         couleur / taille (vide pour la variante par défaut)
       data-price="{{ variant.price }}"                    prix unitaire EN CENTIMES (ex. 11000 pour 110 €)
       data-image="{{ variant.featured_image | default: product.featured_image | image_url: width: 480 }}"
       data-url="{{ variant.url }}"
       data-product-id="{{ product.id }}"                  facultatif (suggestions)
       data-product-type="{{ product.type | escape }}"     facultatif (suggestions)
       data-quantity="1"                                   facultatif
       data-option-missing="Taille"                        facultatif : option obligatoire non choisie →
                                                           aucun ajout, message sous le bouton (texte des locales)
     >
     Le message s'affiche dans [data-add-error] du plus proche [data-add-group] ou <form>, sinon dans
     [data-form-error], sinon dans un <p class="cart-add__error"> créé après le bouton.
     Un bouton de type submit dans un <form> est traité à la soumission du formulaire (touche Entrée comprise).
     Le formulaire produit historique (form[data-product-form] avec <select name="id">) reste accepté.

   API PUBLIQUE
     window.BGCart = {
       add({ variantId, quantity, name, variant, price, image, url, productId, productType })  → Promise<state>
       change(keyOuVariantId, quantity)                                                           → Promise<state>
       remove(keyOuVariantId)                                                                    → Promise<state>
       get()        → état courant (synchrone)        refresh() → Promise<state>
       open() / close() / toggle()
       count        → nombre d'articles (lecture seule)
       mode         → 'shopify' | 'demo' | null tant que la détection n'est pas finie
       ready        → Promise résolue à la fin de la détection
     }
     Événement document « bg:cart:updated », detail = état du panier :
       { mode, items: [{ key, variantId, productId, productType, quantity, name, variant,
                        price, linePrice, originalLinePrice, image, url }],
         count, total, subtotal, currency, discounts: [{ title, amount }] }
     L'en-tête ([data-cart-count]) et les barres de livraison ([data-ship]) se mettent à jour sur cet événement. */
(() => {
  'use strict';

  const config = window.themeConfig || { routes: {}, strings: {} };
  const routes = config.routes || {};
  const STORAGE_KEY = 'bg-cart-demo';
  // adresse de ce fichier : le fichier des suggestions de la démo est à côté (assets/)
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Textes (locales, via le bloc JSON de cart-drawer.liquid) ---------- */
  let strings = {};
  try {
    const block = $('[data-cart-strings]');
    if (block) strings = JSON.parse(block.textContent);
  } catch (e) { strings = {}; }
  const text = (key, vars) => {
    let out = strings[key] || '';
    Object.keys(vars || {}).forEach((name) => { out = out.replace(`[${name}]`, vars[name]); });
    return out;
  };

  /* ---------- Montants ---------- */
  function money(cents, currency) {
    const value = (Number(cents) || 0) / 100;
    try {
      return new Intl.NumberFormat(config.locale || document.documentElement.lang || 'fr', {
        style: 'currency',
        currency: currency || config.currency || 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (e) {
      return `${value.toFixed(2)} ${currency || ''}`.trim();
    }
  }
  // « 1 234,50 € » → 123450. Secours quand data-price n'est pas déjà en centimes.
  function parseCents(raw) {
    if (raw === undefined || raw === null || raw === '') return 0;
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) return Number(s);
    const cleaned = s.replace(/[^\d.,]/g, '');
    const lastSep = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
    if (lastSep === -1) return Number(cleaned) * 100 || 0;
    const int = cleaned.slice(0, lastSep).replace(/[^\d]/g, '');
    const dec = (cleaned.slice(lastSep + 1).replace(/[^\d]/g, '') + '00').slice(0, 2);
    return Number(int) * 100 + Number(dec);
  }
  // pas d'emoji à l'écran (règle de la marque) : noms de produit et de couleur venus de Shopify
  const sansEmoji = (t) => String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '').replace(/ {2,}/g, ' ').trim();
  const escapeHtml = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Les adresses Shopify acceptent ?width= : vignette légère dans le tiroir.
  function sized(src, width) {
    if (!src) return '';
    try {
      const url = new URL(src, window.location.href);
      if (!/cdn\.shopify\.com/.test(url.hostname)) return src;
      url.searchParams.set('width', width);
      url.searchParams.delete('height');
      return url.toString();
    } catch (e) { return src; }
  }

  // 8 novembre : adresse rangée dans le panier en chemin absolu. Une adresse relative prise sur l'accueil
  // (« products/x.html ») ne mène nulle part depuis une fiche (« products/products/x.html »).
  function absPath(src) {
    if (!src) return '';
    try {
      const url = new URL(src, window.location.href);
      return url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href;
    } catch (e) { return src; }
  }

  /* ---------- Verrou de défilement (partagé avec theme.js) ---------- */
  const lock = () => (window.BG && window.BG.scrollLock ? window.BG.scrollLock.acquire('cart') : (document.documentElement.style.overflow = 'hidden'));
  const unlock = () => {
    if (window.BG && window.BG.scrollLock) window.BG.scrollLock.release('cart');
    else { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; }
  };

  /* ---------- État ---------- */
  let mode = null;
  let state = { mode: null, items: [], count: 0, total: 0, subtotal: 0, currency: config.currency || 'EUR', discounts: [] };
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  function emit() {
    state.mode = mode;
    document.dispatchEvent(new CustomEvent('bg:cart:updated', { detail: state }));
  }

  /* ---------- Mode Shopify ---------- */
  function fromShopify(cart) {
    const items = (cart.items || []).map((it) => ({
      key: it.key,
      variantId: it.variant_id || it.id,
      productId: it.product_id,
      productType: it.product_type || '',
      quantity: it.quantity,
      name: sansEmoji(it.product_title || it.title),
      variant: it.product_has_only_default_variant ? '' : sansEmoji(it.variant_title || ''),
      price: it.final_price !== undefined ? it.final_price : it.price,
      linePrice: it.final_line_price !== undefined ? it.final_line_price : it.line_price,
      originalLinePrice: it.original_line_price !== undefined ? it.original_line_price : it.line_price,
      image: it.image || (it.featured_image && it.featured_image.url) || '',
      url: it.url || ''
    }));
    return {
      mode: 'shopify',
      items,
      count: cart.item_count || 0,
      total: cart.total_price || 0,
      subtotal: cart.items_subtotal_price !== undefined ? cart.items_subtotal_price : cart.total_price || 0,
      currency: cart.currency || config.currency || 'EUR',
      discounts: (cart.cart_level_discount_applications || []).map((d) => ({ title: d.title, amount: d.total_allocated_amount }))
    };
  }

  // 8 novembre : coupure réseau ou erreur serveur → « La mise à jour a échoué. Réessayez. » ;
  // refus de Shopify (422 : épuisé, plus de stock) → le message de Shopify, dans la langue de la boutique.
  async function shopifyRequest(url, body) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) { throw new Error(text('retry') || text('error')); }
    let data = {};
    try { data = await response.json(); } catch (e) { data = {}; }
    if (!response.ok || data.status) {
      const refus = response.status === 422 && typeof data.description === 'string' ? data.description : '';
      throw new Error(refus || text(response.status === 422 ? 'error' : 'retry') || text('error'));
    }
    return data;
  }

  async function shopifyFetch() {
    let response;
    try { response = await fetch('/cart.js', { headers: { Accept: 'application/json' } }); } catch (e) { throw new Error(text('retry')); }
    if (!response.ok) throw new Error(text('retry'));
    return fromShopify(await response.json());
  }

  /* ---------- Mode démo (localStorage) ---------- */
  let demoMemory = null;
  function demoLoad() {
    if (demoMemory) return demoMemory.map((it) => Object.assign({}, it));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && Array.isArray(parsed.items) ? parsed.items : [];
    } catch (e) { return []; }
  }
  function demoSave(items) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
      demoMemory = null;
    } catch (e) { demoMemory = items.map((it) => Object.assign({}, it)); }
  }
  function fromDemo(items) {
    const lines = items.map((it) => Object.assign({}, it, {
      key: String(it.variantId),
      linePrice: it.price * it.quantity,
      originalLinePrice: it.price * it.quantity
    }));
    const total = lines.reduce((sum, l) => sum + l.linePrice, 0);
    return {
      mode: 'demo',
      items: lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      total,
      subtotal: total,
      currency: config.currency || 'EUR',
      discounts: []
    };
  }

  /* ---------- Rendu : tiroir et page panier partagent les mêmes gabarits ---------- */
  const roots = () => $$('[data-cart-root]');

  function lineHtml(item, index) {
    const name = escapeHtml(item.name);
    const url = escapeHtml(item.url || '#');
    const img = item.image
      ? `<img src="${escapeHtml(sized(item.image, 240))}" alt="" width="120" height="120" loading="lazy">`
      : '';
    const compare = item.originalLinePrice > item.linePrice
      ? `<s class="price__compare">${money(item.originalLinePrice, state.currency)}</s>`
      : '';
    return `<li class="line" data-line="${index + 1}" data-qty="${item.quantity}" data-key="${escapeHtml(item.key)}" data-variant-id="${escapeHtml(item.variantId)}" data-product-id="${escapeHtml(item.productId || '')}" data-product-type="${escapeHtml(item.productType || '')}" data-anim="cart-line">
      <a class="line__media" href="${url}" tabindex="-1" aria-hidden="true">${img}</a>
      <div class="line__info">
        <a class="line__name" href="${url}">${name}</a>
        ${item.variant ? `<p class="line__variant">${escapeHtml(item.variant)}</p>` : ''}
        <p class="line__price">${compare}${money(item.linePrice, state.currency)}</p>
        <div class="line__qty">
          <button type="button" class="qty-btn" data-line-qty="${item.quantity - 1}" aria-label="${escapeHtml(text('decrease', { produit: item.name }))}">−</button>
          <span class="qty-value" aria-label="${escapeHtml(text('quantity'))}">${item.quantity}</span>
          <button type="button" class="qty-btn" data-line-qty="${item.quantity + 1}" aria-label="${escapeHtml(text('increase', { produit: item.name }))}">+</button>
          <button type="button" class="line__remove" data-line-qty="0">${escapeHtml(text('remove'))}</button>
        </div>
      </div>
    </li>`;
  }

  function emptyHtml(root) {
    const d = root.dataset;
    const link = d.labelCatalogue
      ? `<a class="link-btn" href="${escapeHtml(d.urlCatalogue || '#')}" data-cart-close>${escapeHtml(d.labelCatalogue)}</a>`
      : '';
    return `<div class="drawer__empty"><p>${escapeHtml(d.emptyText || '')}</p>${link}</div>`;
  }

  function footHtml(root) {
    const d = root.dataset;
    const discounts = state.discounts.map((x) => `<div class="drawer__total drawer__total--discount"><span>${escapeHtml(x.title)}</span><span>−${money(x.amount, state.currency)}</span></div>`).join('');
    const checkout = mode === 'demo'
      ? `<button type="button" class="btn btn--primary btn--block" disabled data-checkout-demo>${escapeHtml(text('checkoutDemo'))}</button>`
      : `<form action="${escapeHtml(routes.cart || '/cart')}" method="post" class="drawer__checkout"><button type="submit" name="checkout" class="btn btn--primary btn--block">${escapeHtml(d.labelCheckout || '')}</button></form>`;
    const view = d.labelViewCart && d.urlViewCart
      ? `<p class="drawer__view"><a class="link-btn" href="${escapeHtml(d.urlViewCart)}">${escapeHtml(d.labelViewCart)}</a></p>`
      : '';
    const cont = d.labelContinue
      ? `<p class="cart-page__continue"><a class="link-btn" href="${escapeHtml(d.urlContinue || '#')}">${escapeHtml(d.labelContinue)}</a></p>`
      : '';
    return `${discounts}
      <div class="drawer__total"><span>${escapeHtml(text('subtotal'))}</span><span data-cart-total>${money(state.total, state.currency)}</span></div>
      <p class="drawer__note">${escapeHtml(text('taxes'))}</p>
      ${checkout}${view}${cont}`;
  }

  // Page panier : le formulaire sans JavaScript cède la place aux conteneurs du tiroir.
  function ensureView(root) {
    if ($('[data-cart-lines]', root)) return;
    const old = $('[data-cart-view]', root);
    if (!old) return;
    const view = document.createElement('div');
    view.className = 'cart-page__form';
    view.setAttribute('data-cart-view', '');
    view.innerHTML = '<div data-cart-lines></div><div class="cart-page__foot" data-cart-foot></div>';
    old.replaceWith(view);
  }

  function render(options = {}) {
    roots().forEach((root) => {
      ensureView(root);
      const lines = $('[data-cart-lines]', root);
      const foot = $('[data-cart-foot]', root);
      const body = $('[data-cart-body]', root);
      if (body) body.dataset.count = state.count;
      if (lines) {
        lines.innerHTML = state.items.length
          ? `<ul class="lines" role="list">${state.items.map(lineHtml).join('')}</ul>`
          : emptyHtml(root);
        lines.removeAttribute('aria-busy');
        if (options.highlight) {
          const added = $(`[data-line][data-variant-id="${options.highlight}"]`, lines);
          if (added) added.classList.add('is-new');
        }
      }
      if (foot) {
        foot.innerHTML = state.items.length ? footHtml(root) : '';
        foot.classList.remove('is-busy');
      }
      const error = $('[data-cart-error]', root);
      if (error && !options.keepError) error.hidden = true;
      $$('[data-ship]', root).forEach((bar) => {
        bar.dataset.total = state.total;
        bar.hidden = state.count === 0;
        updateShipping(bar);
      });
    });
    if (window.BG && window.BG.reveal) roots().forEach((root) => window.BG.reveal(root));
    // « Retirer » sur la dernière ligne : le bouton disparaît, le focus revient au tiroir.
    if (Drawer.isOpen() && !Drawer.el.contains(document.activeElement)) {
      const close = $('[data-cart-close].link-btn', Drawer.el);
      if (close) close.focus({ preventScroll: true });
    }
  }

  function setBusy(on) {
    roots().forEach((root) => {
      const lines = $('[data-cart-lines]', root);
      const foot = $('[data-cart-foot]', root);
      if (lines) { if (on) lines.setAttribute('aria-busy', 'true'); else lines.removeAttribute('aria-busy'); }
      if (foot) foot.classList.toggle('is-busy', on);
    });
  }

  function showCartError(message) {
    roots().forEach((root) => {
      const error = $('[data-cart-error]', root);
      if (error) { error.textContent = message; error.hidden = false; }
    });
  }

  /* ---------- Barre de livraison offerte ---------- */
  function updateShipping(el) {
    if (!el) return;
    const total = Number(el.dataset.total) || 0;
    const threshold = Number(el.dataset.threshold) || 0;
    if (!threshold) { el.hidden = true; return; }
    const rate = parseFloat((window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) || '1') || 1;
    const thresholdCents = Math.round(threshold * 100 * rate);
    const remaining = Math.max(0, thresholdCents - total);
    const ratio = Math.min(1, total / thresholdCents);
    const label = $('[data-ship-text]', el);
    const fill = $('[data-ship-fill]', el);
    if (label) {
      label.textContent = remaining > 0
        ? (el.dataset.msgRemaining || '').replace('[montant]', compactMoney(remaining, el.dataset.currency))
        : (el.dataset.msgDone || '');
    }
    if (fill) {
      const previous = Number(el.dataset.ratio) || 0;
      fill.style.transition = 'none';
      fill.style.transform = `scaleX(${previous})`;
      fill.getBoundingClientRect();
      fill.style.transition = '';
      fill.style.transform = `scaleX(${ratio})`;
    }
    el.dataset.ratio = ratio;
  }
  // « 12 € » plutôt que « 12,00 € » dans la phrase de la barre.
  function compactMoney(cents, currency) {
    const formatter = window.BG && window.BG.formatMoney;
    return formatter ? formatter(cents, currency) : money(cents, currency);
  }

  /* ---------- Compteur de l'en-tête ---------- */
  function updateCount(detail) {
    $$('[data-cart-count]').forEach((el) => {
      el.textContent = detail.count;
      if (strings.count) el.setAttribute('aria-label', text('count', { nombre: detail.count }));
    });
  }

  /* ---------- Tiroir ---------- */
  const Drawer = {
    el: null,
    lastFocus: null,
    openedAt: 0,
    isOpen() { return !!this.el && this.el.classList.contains('is-open'); },
    open() {
      if (!this.el) { if (routes.cart) window.location.href = routes.cart; return; }
      if (this.isOpen()) return;
      this.lastFocus = document.activeElement;
      this.el.removeAttribute('inert');
      this.el.setAttribute('aria-hidden', 'false');
      this.el.classList.add('is-open');
      this.openedAt = Date.now();
      lock();
      if (stale) API.refresh().catch(() => {});
      const close = $('[data-cart-close].link-btn', this.el);
      if (close) close.focus({ preventScroll: true });
      if (state.items.length && !Suggest.shownFor) Suggest.load(state.items[0]);
    },
    close() {
      if (!this.el || !this.isOpen()) return;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      this.el.setAttribute('inert', '');
      unlock();
      if (this.lastFocus && this.lastFocus.focus && document.contains(this.lastFocus)) this.lastFocus.focus({ preventScroll: true });
    },
    trapFocus(event) {
      const focusables = $$('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])', this.el)
        .filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  /* ---------- Suggestions : recommandations Shopify (mode Shopify) ou fichier de la démo (mode démo) ---------- */
  // Le tiroir et la page panier ont chacun leur boîte [data-cart-suggestions] ; 4 pièces, jamais une pièce déjà au panier.
  const Suggest = {
    token: 0,
    shownFor: null,
    demo: null,
    donnees: null,
    boxes() { return $$('[data-cart-suggestions]'); },
    // Produits du panier ; en démo, une carte n'envoie que la variante : le fichier de la démo donne le produit.
    inCart(data) {
      const ids = new Set();
      state.items.forEach((i) => {
        if (i.productId) ids.add(String(i.productId));
        const p = data && data.parVariante.get(Number(i.variantId));
        if (p) ids.add(String(p.id));
      });
      return ids;
    },
    filter() {
      const ids = this.inCart(this.donnees);
      this.boxes().forEach((box) => {
        $$('[data-suggest-item]', box).forEach((el) => { if (ids.has(el.dataset.productId)) el.remove(); });
        if (!state.items.length || !$('[data-suggest-item]', box)) box.hidden = true;
      });
    },
    async load(item) {
      const boxes = this.boxes();
      if (!boxes.length || !item) return;
      this.shownFor = item.variantId;
      const token = (this.token += 1);
      let picked = [];
      try { picked = mode === 'shopify' ? await this.fromShopify(item) : await this.fromDemo(item); } catch (e) { picked = []; }
      if (token !== this.token) return;
      boxes.forEach((box) => this.fill(box, picked));
    },
    async fromShopify(item) {
      if (!item.productId || !routes.recommendations) return [];
      const base = `${routes.recommendations}?product_id=${item.productId}&limit=10&section_id=cart-suggestions`;
      const urls = [`${base}&intent=complementary`, `${base}&intent=related`];
      if (item.productType && routes.search) {
        urls.push(`${routes.search}?q=${encodeURIComponent(`product_type:"${item.productType}"`)}&type=product&section_id=cart-suggestions`);
      }
      const seen = this.inCart(null);
      const picked = [];
      for (const url of urls) {
        if (picked.length >= 4) break;
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          $$('[data-suggest-item]', doc).forEach((el) => {
            if (picked.length >= 4 || seen.has(el.dataset.productId)) return;
            seen.add(el.dataset.productId);
            picked.push(el);
          });
        } catch (e) { /* source suivante */ }
      }
      return picked;
    },
    // Démo : assets/suggestions-demo.json (écrit par l'export statique), une liste de pièces à proposer par pièce,
    // d'abord pour la pièce ajoutée, puis pour les autres pièces du panier, puis les meilleures ventes.
    async fromDemo(item) {
      if (!this.demo) {
        const url = new URL('suggestions-demo.json', SCRIPT_SRC || window.location.href);
        this.demo = fetch(url).then((r) => (r.ok ? r.json() : null)).then((data) => {
          if (!data || !Array.isArray(data.produits)) return null;
          data.parVariante = new Map();
          data.produits.forEach((p) => p.vs.forEach((v) => data.parVariante.set(v, p)));
          data.base = url;
          return data;
        }).catch(() => null);
      }
      const data = (this.donnees = await this.demo);
      if (!data) return [];
      const seen = this.inCart(data);
      const order = [];
      [item, ...state.items.filter((i) => i.variantId !== item.variantId)].forEach((i) => {
        const p = data.parVariante.get(Number(i.variantId));
        if (p) order.push(...p.r);
      });
      order.push(...(data.phares || []));
      const picked = [];
      order.forEach((k) => {
        const p = data.produits[k];
        if (!p || p.ep || picked.length >= 4 || seen.has(String(p.id))) return;
        seen.add(String(p.id));
        picked.push(this.demoItem(p, data.base));
      });
      return picked;
    },
    demoItem(p, base) {
      // 7 novembre : la suggestion ouvre la variante proposée ; une pièce à taille se choisit sur la fiche
      const url = escapeHtml(new URL(`../products/${p.h}.html${p.tl ? '' : `?variant=${p.v}`}`, base).href);
      const img = p.i ? `<img src="${escapeHtml(sized(p.i, 360))}" alt="" width="360" height="360" loading="lazy">` : '';
      const el = document.createElement('div');
      el.className = 'suggest';
      el.setAttribute('data-suggest-item', '');
      el.dataset.productId = p.id;
      el.innerHTML = `<a class="suggest__media media media--square" href="${url}" tabindex="-1" aria-hidden="true">${img}</a>
        <a class="suggest__name" href="${url}">${escapeHtml(p.t)}${p.vt && !p.tl ? ` — ${escapeHtml(p.vt)}` : ''}</a>
        <p class="suggest__price">${money(p.p, state.currency)}</p>
        ${p.tl ? `<a class="link-btn suggest__add" href="${url}" data-suggest-choose></a>` : `<button type="button" class="link-btn suggest__add" data-suggest-variant="${p.v}" data-title="${escapeHtml(p.t)}" data-name="${escapeHtml(p.t)}" data-variant="${escapeHtml(p.vt)}" data-price="${p.p}" data-image="${escapeHtml(p.i)}" data-url="${url}" data-product-id="${p.id}"></button>`}`;
      return el;
    },
    fill(box, picked) {
      box.innerHTML = '';
      if (!picked.length || !state.items.length) { box.hidden = true; return; }
      const titre = box.dataset.suggestTitle || (Drawer.el && Drawer.el.dataset.suggestTitle) || '';
      const label = box.dataset.suggestAdd || (Drawer.el && Drawer.el.dataset.suggestAdd) || '';
      const choisir = box.dataset.suggestChoose || (Drawer.el && Drawer.el.dataset.suggestChoose) || label;
      if (titre) {
        const title = document.createElement('h3');
        title.className = 'drawer__suggest-title';
        title.textContent = titre;
        box.appendChild(title);
      }
      const list = document.createElement('div');
      list.className = 'suggest-list';
      picked.forEach((el) => {
        const node = document.importNode(el, true);
        const lien = $('[data-suggest-choose]', node);
        if (lien) lien.textContent = choisir;
        const button = $('[data-suggest-variant]', node);
        if (button) {
          button.textContent = label;
          button.setAttribute('aria-label', `${label} ${button.dataset.title || ''}`.trim());
        }
        list.appendChild(node);
      });
      box.appendChild(list);
      box.hidden = false;
      if (window.BG && window.BG.reveal) window.BG.reveal(box);
    }
  };

  /* ---------- Lecture d'un bouton ---------- */
  function lineFromButton(button, form) {
    const d = button ? button.dataset : {};
    const select = form ? form.querySelector('[name="id"]') : null;
    const line = {
      variantId: Number(d.variantId || (select && select.value)) || 0,
      quantity: Math.max(1, Number(d.quantity) || 1),
      name: d.name || '',
      variant: d.variant || '',
      price: parseCents(d.price),
      image: absPath(d.image || ''),
      url: absPath(d.url || ''),
      productId: Number(d.productId) || 0,
      productType: d.productType || '',
      optionMissing: d.optionMissing || ''
    };
    // Fiche produit historique : complète ce qui manque avec le JSON de la fiche.
    if (form && (!line.name || !line.price || !line.image)) {
      const root = form.closest('[data-product]') || document;
      try {
        const json = $('[data-product-json]', root);
        const data = json ? JSON.parse(json.textContent) : null;
        const variant = data && data.variants.find((v) => v.id === line.variantId);
        if (variant) {
          if (!line.price) line.price = parseCents(variant.price);
          if (!line.variant && variant.title && variant.title !== 'Default Title') line.variant = variant.title;
          const image = data.images.find((img) => img.pos === variant.imagePos) || data.images[0];
          if (!line.image && image) line.image = image.src;
          if (!line.productId) line.productId = data.id;
        }
      } catch (e) { /* JSON absent */ }
      if (!line.name) {
        const title = $('h1', root);
        line.name = title ? title.textContent.trim() : document.title;
      }
      if (!line.url) {
        const url = new URL(window.location.href);
        url.search = `?variant=${line.variantId}`;
        url.hash = '';
        line.url = url.pathname + url.search;
      }
    }
    return line;
  }

  function errorTarget(button, form) {
    const group = button.closest('[data-add-group]') || form;
    let target = group ? $('[data-add-error], [data-form-error]', group) : null;
    if (!target) {
      target = button.nextElementSibling && button.nextElementSibling.matches('[data-add-error]') ? button.nextElementSibling : null;
    }
    if (!target) {
      target = document.createElement('p');
      target.className = 'cart-add__error';
      target.setAttribute('data-add-error', '');
      target.setAttribute('role', 'alert');
      button.insertAdjacentElement('afterend', target);
    }
    return target;
  }

  async function addFromButton(button, form) {
    // 7 novembre : garde-fou commun (cartes, suggestions, raccourcis, fiche) : jamais d'ajout sans la taille choisie.
    // Hors fiche : on ouvre la fiche ; sur la fiche : on montre le choix de la taille, le panier ne change pas.
    if (button.hasAttribute('data-requires-size')) {
      const picker = (form && form.querySelector('[data-size-picker]')) || document.querySelector('[data-size-picker]');
      if (form && form.matches('[data-product-form]') && picker) {
        const hint = document.querySelector('[data-size-hint]');
        if (hint) hint.hidden = false;
        picker.scrollIntoView({ block: 'center' });
        const first = picker.querySelector('[data-value]:not(.is-unavailable)');
        if (first) first.focus({ preventScroll: true });
      } else if (button.dataset.url) {
        window.location.href = button.dataset.url.split('?')[0];
      }
      return;
    }
    const line = lineFromButton(button, form);
    const target = errorTarget(button, form);
    target.hidden = true;
    if (line.optionMissing || !line.variantId) {
      target.textContent = text('optionRequired', { option: (line.optionMissing || '').toLowerCase() });
      target.hidden = false;
      return;
    }
    button.setAttribute('aria-busy', 'true');
    try {
      await API.add(line);
    } catch (err) {
      target.textContent = err.message || text('error');
      target.hidden = false;
    } finally {
      button.removeAttribute('aria-busy');
    }
  }

  /* ---------- API ---------- */
  // 8 novembre : les changements passent un par un, dans l'ordre des appuis (jamais deux requêtes croisées
  // dont la plus ancienne répondrait en dernier). queued compte les changements en cours ou en attente.
  let chain = Promise.resolve();
  let queued = 0;
  function serial(task) {
    queued += 1;
    const run = chain.then(() => task().finally(() => { queued -= 1; }));
    chain = run.catch(() => {});
    return run;
  }
  // Shopify injoignable au chargement : le panier rendu par Liquid reste affiché, relu au premier usage.
  let stale = false;
  const readState = async () => (mode === 'shopify' ? shopifyFetch() : fromDemo(demoLoad()));
  // Après un échec : l'écran suit de nouveau le vrai panier (lignes, total, compteur), les boutons
  // redeviennent actifs, le message reste affiché jusqu'au prochain changement réussi.
  async function recover(message) {
    try { state = await readState(); stale = false; } catch (e) { /* hors ligne : on garde l'état connu */ }
    if (!stale) { render({ keepError: true }); emit(); }
    if (message) showCartError(message);
  }

  const API = {
    get ready() { return ready; },
    get mode() { return mode; },
    get count() { return state.count; },
    get() { return state; },

    async refresh() {
      await ready;
      state = await readState();
      stale = false;
      render();
      emit();
      return state;
    },

    async add(line) {
      await ready;
      const variantId = Number(line && line.variantId);
      const quantity = Math.max(1, Number(line && line.quantity) || 1);
      if (!variantId) throw new Error(text('error'));
      return serial(() => API.addNow(line, variantId, quantity));
    },
    async addNow(line, variantId, quantity) {
      setBusy(true);
      try {
        if (mode === 'shopify') {
          await shopifyRequest(`${routes.cartAdd || '/cart/add'}.js`, { items: [{ id: variantId, quantity }] });
          state = await shopifyFetch();
          stale = false;
        } else {
          const items = demoLoad();
          const found = items.find((it) => it.variantId === variantId);
          if (found) found.quantity += quantity;
          else {
            items.unshift({
              variantId,
              quantity,
              name: line.name || '',
              variant: line.variant || '',
              price: parseCents(line.price),
              image: absPath(line.image || ''),
              url: absPath(line.url || ''),
              productId: Number(line.productId) || 0,
              productType: line.productType || ''
            });
          }
          demoSave(items);
          state = fromDemo(items);
        }
      } catch (err) {
        setBusy(false);
        await recover();
        throw err;
      }
      setBusy(false);
      render({ highlight: variantId });
      emit();
      const status = $('[data-cart-status]');
      if (status) { status.textContent = ''; status.textContent = text('added'); }
      Drawer.open();
      const added = state.items.find((it) => it.variantId === variantId);
      if (added) Suggest.load(added);
      document.dispatchEvent(new CustomEvent('cart:added', { detail: { item: added } }));
      return state;
    },

    async change(keyOrId, quantity) {
      await ready;
      quantity = Math.max(0, Number(quantity) || 0);
      return serial(() => API.changeNow(keyOrId, quantity));
    },
    async changeNow(keyOrId, quantity) {
      setBusy(true);
      try {
        if (mode === 'shopify') {
          const cart = await shopifyRequest(`${routes.cartChange || '/cart/change'}.js`, { id: String(keyOrId), quantity });
          state = cart && cart.items ? fromShopify(cart) : await shopifyFetch();
          stale = false;
        } else {
          const items = demoLoad();
          const index = items.findIndex((it) => String(it.variantId) === String(keyOrId));
          if (index !== -1) {
            if (quantity === 0) items.splice(index, 1);
            else items[index].quantity = quantity;
          }
          demoSave(items);
          state = fromDemo(items);
        }
      } catch (err) {
        setBusy(false);
        await recover(err.message || text('error'));
        throw err;
      }
      // d'autres appuis attendent : seule la dernière réponse s'affiche (pas de quantité qui recule puis avance)
      if (queued > 1) return state;
      setBusy(false);
      render();
      emit();
      Suggest.filter();
      // Shopify ramène la quantité au stock disponible : on le dit au lieu d'ignorer l'appui.
      const line = quantity > 0 && state.items.find((it) => String(it.key) === String(keyOrId) || String(it.variantId) === String(keyOrId));
      if (line && line.quantity < quantity) showCartError(text('max'));
      return state;
    },

    remove(keyOrId) { return this.change(keyOrId, 0); },
    open() { Drawer.open(); },
    close() { Drawer.close(); },
    toggle() { if (Drawer.isOpen()) Drawer.close(); else Drawer.open(); }
  };

  /* ---------- Détection du mode, une seule fois ---------- */
  // 8 novembre : sur Shopify, une panne passagère de /cart.js ne fait plus basculer en démo (autre panier,
  // paiement désactivé) : deux nouveaux essais, puis mode Shopify avec le panier rendu par Liquid.
  async function detect() {
    if (window.Shopify) {
      let panne = false;
      for (let essai = 0; essai < 3 && !mode; essai += 1) {
        if (essai) await new Promise((resolve) => { setTimeout(resolve, 700 * essai); });
        try {
          const response = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
          panne = response.status >= 500;
          if (panne) continue;
          const type = response.headers.get('content-type') || '';
          const cart = response.ok && type.indexOf('json') !== -1 ? await response.json() : null;
          if (cart && Array.isArray(cart.items)) {
            mode = 'shopify';
            state = fromShopify(cart);
          }
          break;
        } catch (e) { panne = true; }
      }
      if (!mode && panne) { mode = 'shopify'; stale = true; }
    }
    if (!mode) {
      mode = 'demo';
      state = fromDemo(demoLoad());
    }
    document.documentElement.setAttribute('data-cart-mode', mode);
    if (!stale) { render(); emit(); }
    resolveReady(state);
    // page panier : les suggestions sont là dès l'arrivée
    if (!stale && state.items.length && $('[data-cart-page] [data-cart-suggestions]')) Suggest.load(state.items[0]);
  }

  /* ---------- Quantités : les appuis rapides s'additionnent ---------- */
  // 8 novembre : la ligne affiche tout de suite la quantité voulue, les requêtes partent une à une (serial),
  // la dernière réponse fait foi. « − » sur 1 retire la ligne ; un appui qui ne change rien n'envoie rien.
  const voulu = new Map();
  function changeLine(line, button) {
    const key = line.dataset.key || line.dataset.variantId;
    const value = $('.qty-value', line);
    const shown = Number(line.dataset.qty || (value && value.textContent)) || 0;
    const asked = Math.max(0, Number(button.dataset.lineQty) || 0);
    const base = voulu.has(key) ? voulu.get(key) : shown;
    const target = button.classList.contains('qty-btn') ? Math.max(0, base + (asked - shown)) : asked;
    if (target === base && voulu.has(key)) return;
    voulu.set(key, target);
    $$('[data-line]').forEach((l) => {
      if ((l.dataset.key || l.dataset.variantId) !== key) return;
      const v = $('.qty-value', l);
      if (v) v.textContent = target;
      if (target === 0) l.hidden = true;
    });
    API.change(key, target).catch(() => {}).then(() => { if (voulu.get(key) === target) voulu.delete(key); });
  }

  /* ---------- Écouteurs ---------- */
  function bind() {
    Drawer.el = $('[data-cart-drawer]');

    document.addEventListener('bg:cart:updated', (event) => updateCount(event.detail));

    document.addEventListener('click', (event) => {
      // 8 novembre : double appui sur « Ajouter » : le second appui tombait sur le tiroir qui venait de s'ouvrir
      // (le fond le refermait, « Retirer » pouvait être touché). Une demi-seconde après l'ouverture, le tiroir
      // ignore les appuis du doigt ou de la souris (pas ceux du clavier : event.detail vaut 0).
      if (event.detail && Drawer.isOpen() && Drawer.el.contains(event.target) && Date.now() - Drawer.openedAt < 500) {
        event.preventDefault();
        return;
      }
      const opener = event.target.closest('[data-cart-open]');
      if (opener) { event.preventDefault(); Drawer.open(); return; }

      const closer = event.target.closest('[data-cart-close]');
      if (closer && Drawer.isOpen()) {
        const link = closer.closest('a[href]');
        if (!link) event.preventDefault();
        Drawer.close();
        return;
      }

      const qty = event.target.closest('[data-line-qty]');
      if (qty && qty.closest('[data-cart-root]')) {
        const line = qty.closest('[data-line]');
        if (line) changeLine(line, qty);
        return;
      }

      const suggest = event.target.closest('[data-suggest-variant]');
      if (suggest) {
        event.preventDefault();
        suggest.disabled = true;
        API.add(Object.assign(lineFromButton(suggest, null), { variantId: Number(suggest.dataset.suggestVariant) }))
          .catch((err) => { suggest.disabled = false; showCartError(err.message || text('error')); });
        return;
      }

      const button = event.target.closest('[data-add-to-cart]');
      if (button) {
        // Un bouton submit est traité à la soumission du formulaire.
        if (button.form && button.type === 'submit') return;
        event.preventDefault();
        if (button.disabled || button.getAttribute('aria-busy') === 'true') return;
        addFromButton(button, button.closest('form'));
      }
    });

    document.addEventListener('submit', (event) => {
      const form = event.target.closest('form');
      if (!form) return;
      const button = form.querySelector('[data-add-to-cart]') || (form.matches('[data-product-form]') ? form.querySelector('[type="submit"]') : null);
      if (!button) return;
      event.preventDefault();
      if (button.disabled || button.getAttribute('aria-busy') === 'true') return;
      addFromButton(button, form);
    });

    document.addEventListener('keydown', (event) => {
      if (!Drawer.isOpen()) return;
      if (event.key === 'Escape') Drawer.close();
      if (event.key === 'Tab') Drawer.trapFocus(event);
    });

    // Retour depuis le cache de navigation : jamais de page figée.
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        Drawer.close();
        unlock();
        API.refresh().catch(() => {});
      }
    });

    // Un autre onglet a changé le panier démo.
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY && mode === 'demo') API.refresh().catch(() => {});
    });
  }

  window.BGCart = API;
  if (window.BG) window.BG.cart = API;

  const start = () => { bind(); detect(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
