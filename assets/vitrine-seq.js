/* Breslev Gang — vitrine signature : le cercle des 6 vitrines (images Blender) piloté par le défilement.
   - PC : section épinglée en plein écran, image en « cover », dessin sur canvas à la fréquence de l'écran
     (requestAnimationFrame), position interpolée (inertie douce), fondu entre deux images voisines.
     Rythme : chaque vitrine reste de face pendant `arret` vh, la transition dure `transition` vh.
     Points 1/6 cliquables, lien « Passer ». Décodage anticipé (createImageBitmap quand il existe).
     Chargement : d'abord les 6 vues de face, puis les intermédiaires du plus proche au plus loin.
   - Téléphone (écran étroit ou tactile) : carrousel horizontal, une vitrine par écran, défilement vertical libre.
   - Mouvement réduit : pas de glissement, on saute d'une vitrine à l'autre.
   - Sans JavaScript : la grille de photos reste.
   Nom, prix, lien et ajout au panier viennent des blocs Shopify (data-*), jamais codés en dur. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class Vitrine {
    constructor(root) {
      this.root = root;
      this.stage = $('[data-vitrine-stage]', root);
      this.grid = $('[data-vitrine-grid]', root);
      this.head = $('.vitrine__head', root);
      this.sceneBox = $('[data-vitrine-scene]', root);
      this.front = $('[data-vitrine-front]', root);
      this.points = $('[data-vitrine-points]', root);
      this.passer = $('[data-vitrine-passer]', root);
      this.live = $('[data-vitrine-live]', root);
      this.frames = Number(root.dataset.frames) || 144;
      this.pattern = root.dataset.pattern || '';
      this.patternSmall = root.dataset.patternSmall || '';
      this.ordre = (root.dataset.ordre || '6,4,5,3,2,1').split(',').map(Number);
      this.pieces = this.ordre.length;
      this.perPiece = this.frames / this.pieces;
      this.arret = Number(root.dataset.arret) || 60;
      this.transition = Number(root.dataset.transition) || 100;
      this.items = $$('[data-vitrine-item]', root).map((el) => ({
        el,
        vitrine: Number(el.dataset.vitrine) || 0,
        variantId: el.dataset.variantId || '',
        name: el.dataset.name || '',
        variant: el.dataset.variant || '',
        price: el.dataset.price || '',
        priceCents: el.dataset.priceCents || '',
        available: el.dataset.available !== 'false',
        image: el.dataset.image || '',
        url: el.dataset.url || '#'
      }));
      if (!this.pattern || this.items.length < 2) return;
      this.stops = [];
      for (let p = 0; p < this.pieces; p += 1) this.stops.push(Math.round(p * this.perPiece) % this.frames);
      const narrow = window.matchMedia('(max-width: 749px)').matches;
      if (narrow) this.buildCarousel(); else this.buildSequence();
    }

    itemFor(piece) {
      const num = this.ordre[piece];
      return this.items.find((it) => it.vitrine === num) || this.items[piece] || this.items[0];
    }

    /* ---------- choix de la série d'images ---------- */
    basePattern() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth * dpr;
      return (this.patternSmall && w < 1500) ? this.patternSmall : this.pattern;
    }
    src(k) { return this.base.replace(/000(?=\.(webp|jpg|jpeg|avif)$)/, String(k).padStart(3, '0')); }

    /* ---------- PC : séquence plein écran ---------- */
    buildSequence() {
      this.base = this.basePattern();
      this.images = new Array(this.frames).fill(null);
      this.loaded = new Set();
      this.root.classList.add('is-3d', 'is-seq');
      this.sceneBox.hidden = false; this.front.hidden = false;
      if (this.points) this.points.hidden = false;
      if (this.passer) this.passer.hidden = false;
      // hauteur : 100svh + arrêts + transitions
      this.root.style.height = `calc(100svh + ${this.pieces * this.arret + (this.pieces - 1) * this.transition}svh)`;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'vitrine__canvas vitrine__canvas--seq';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.sceneBox.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.buildPoints();
      this.measure();
      window.addEventListener('resize', () => this.measure(), { passive: true });
      this.target = 0; this.pos = 0; this.lastPaint = -1; this.current = -1; this.holding = false;
      window.addEventListener('scroll', () => this.onScroll(), { passive: true });
      this.loadProgressive();
      this.onScroll();
      const tick = () => { this.animate(); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }

    buildPoints() {
      if (!this.points) return;
      this.points.innerHTML = '';
      this.pointEls = [];
      for (let p = 0; p < this.pieces; p += 1) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'vitrine__point';
        const it = this.itemFor(p);
        b.setAttribute('aria-label', `${p + 1}/${this.pieces} ${it ? it.name : ''}`.trim());
        b.addEventListener('click', () => this.goTo(p));
        li.appendChild(b); this.points.appendChild(li); this.pointEls.push(b);
      }
    }

    measure() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.stage.getBoundingClientRect();
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.top = this.root.getBoundingClientRect().top + window.scrollY;
      this.travel = Math.max(1, this.root.offsetHeight - window.innerHeight);
      this.lastPaint = -1;
    }

    // position de défilement (0..1) -> image fractionnaire, avec arrêts et transitions
    frameAt(p) {
      const unit = this.pieces * this.arret + (this.pieces - 1) * this.transition;   // en vh
      const y = p * unit;
      let acc = 0;
      for (let i = 0; i < this.pieces; i += 1) {
        if (y <= acc + this.arret) { return { f: i * this.perPiece, piece: i, holding: true }; }
        acc += this.arret;
        if (i === this.pieces - 1) break;
        if (y <= acc + this.transition) {
          const t = ease((y - acc) / this.transition);
          return { f: (i + t) * this.perPiece, piece: t < 0.5 ? i : i + 1, holding: false };
        }
        acc += this.transition;
      }
      return { f: (this.pieces - 1) * this.perPiece, piece: this.pieces - 1, holding: true };
    }

    goTo(piece) {
      const unit = this.pieces * this.arret + (this.pieces - 1) * this.transition;
      const y = piece * (this.arret + this.transition) + this.arret / 2;
      window.scrollTo({ top: this.top + (y / unit) * this.travel, behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    onScroll() {
      const p = clamp((window.scrollY - this.top) / this.travel, 0, 1);
      const { f, piece, holding } = this.frameAt(p);
      this.target = reducedMotion ? Math.round(f / this.perPiece) * this.perPiece : clamp(f, 0, this.frames - 1);
      const active = window.scrollY > this.top - window.innerHeight * 0.2;
      this.root.classList.toggle('is-active', active);
      if (this.grid) this.grid.classList.toggle('is-leaving', active);
      if (this.head) this.head.style.opacity = active ? '0' : '';
      if (holding !== this.holding) { this.holding = holding; this.root.classList.toggle('is-holding', holding); }
      if (piece !== this.current) { this.current = piece; this.showPiece(piece); }
    }

    animate() {
      const now = performance.now();
      const dt = this.lastTick ? Math.min(0.05, (now - this.lastTick) / 1000) : 1 / 60;
      this.lastTick = now;
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 6.5);   // ≈ lerp 0,10 à 60 Hz, identique à 120 Hz
      this.pos += (this.target - this.pos) * k;
      if (Math.abs(this.target - this.pos) < 0.002) this.pos = this.target;
      if (Math.abs(this.pos - this.lastPaint) > 0.001) { this.lastPaint = this.pos; this.draw(); }
    }

    async load(k) {
      if (this.images[k]) return this.images[k];
      try {
        const url = this.src(k);
        let im = null;
        if (window.createImageBitmap) {
          const r = await fetch(url, { cache: 'force-cache' });
          if (!r.ok) throw new Error(String(r.status));
          im = await createImageBitmap(await r.blob());
        } else {
          im = await new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
          if (im.decode) await im.decode().catch(() => {});
        }
        this.images[k] = im; this.loaded.add(k); this.lastPaint = -1;
        return im;
      } catch (e) {
        return null;
      }
    }

    async loadProgressive() {
      await this.load(this.stops[0]);
      for (const k of this.stops.slice(1)) await this.load(k);
      if (reducedMotion) return;
      // intermédiaires : par vagues, du plus proche de chaque arrêt vers le milieu des transitions
      const order = [];
      const half = Math.ceil(this.perPiece / 2);
      for (let d = 1; d <= half; d += 1) {
        for (const s of this.stops) {
          const a = (s + d) % this.frames; const b = (s - d + this.frames) % this.frames;
          if (!order.includes(a)) order.push(a);
          if (!order.includes(b)) order.push(b);
        }
      }
      const rest = order.filter((k) => !this.images[k]);
      for (let i = 0; i < rest.length; i += 3) await Promise.all(rest.slice(i, i + 3).map((k) => this.load(k)));
    }

    nearest(k) {
      if (this.images[k]) return k;
      let best = -1; let dist = Infinity;
      for (const j of this.loaded) {
        const d = Math.min(Math.abs(j - k), this.frames - Math.abs(j - k));
        if (d < dist) { dist = d; best = j; }
      }
      return best;
    }

    draw() {
      const c = this.canvas; const ctx = this.ctx;
      const pos = this.pos || 0;
      const a = clamp(Math.floor(pos), 0, this.frames - 1);
      const b = clamp(a + 1, 0, this.frames - 1);
      const t = pos - a;
      const ia = this.images[this.nearest(a)]; const ib = this.images[this.nearest(b)];
      ctx.globalAlpha = 1;
      ctx.fillStyle = getComputedStyle(this.stage).backgroundColor || '#F6F4F0';
      ctx.fillRect(0, 0, c.width, c.height);
      const put = (im, alpha) => {
        if (!im || alpha <= 0.002) return;
        const iw = im.width || im.naturalWidth; const ih = im.height || im.naturalHeight;
        const s = Math.max(c.width / iw, c.height / ih);   // cover : aucune bande vide
        const w = iw * s; const h = ih * s;
        ctx.globalAlpha = alpha;
        ctx.drawImage(im, (c.width - w) / 2, (c.height - h) / 2, w, h);
      };
      put(ia, 1);
      if (ib && ib !== ia && t > 0) put(ib, t);
      ctx.globalAlpha = 1;
    }

    showPiece(piece) {
      const item = this.itemFor(piece);
      if (!item) return;
      $('[data-front-name]', this.front).textContent = item.name;
      $('[data-front-variant]', this.front).textContent = item.variant;
      $('[data-front-price]', this.front).textContent = item.price;
      $('[data-front-link]', this.front).setAttribute('href', item.url);
      const add = $('[data-front-add]', this.front);
      if (add) {
        add.hidden = !item.variantId || !item.available;
        add.dataset.variantId = item.variantId; add.dataset.name = item.name; add.dataset.variant = item.variant;
        add.dataset.price = item.priceCents; add.dataset.image = item.image; add.dataset.url = item.url;
      }
      if (this.pointEls) this.pointEls.forEach((b, i) => b.classList.toggle('is-active', i === piece));
      if (this.live) this.live.textContent = `${piece + 1}/${this.pieces} ${item.name} ${item.variant} ${item.price}`.trim();
    }

    /* ---------- Téléphone : carrousel ---------- */
    buildCarousel() {
      this.base = this.patternSmall || this.pattern;
      this.root.classList.add('is-carousel');
      const wrap = document.createElement('div');
      wrap.className = 'vitrine__carousel';
      wrap.setAttribute('role', 'list');
      const dots = document.createElement('ol'); dots.className = 'vitrine__dots'; dots.setAttribute('aria-hidden', 'true');
      const slides = [];
      for (let p = 0; p < this.pieces; p += 1) {
        const it = this.itemFor(p);
        const fig = document.createElement('figure');
        fig.className = 'vitrine__slide'; fig.setAttribute('role', 'listitem');
        const media = document.createElement('div'); media.className = 'vitrine__slide-media';
        const img = document.createElement('img');
        img.src = this.src(this.stops[p]); img.alt = it ? it.name : ''; img.loading = p === 0 ? 'eager' : 'lazy'; img.decoding = 'async';
        media.appendChild(img);
        const cap = document.createElement('figcaption');
        cap.innerHTML = `<p class="vitrine__slide-title"></p><p class="vitrine__meta"><span class="vitrine__front-name"></span> <span class="vitrine__front-price"></span></p><p class="vitrine__actions"><a class="link-btn vitrine__open" href="#"></a></p>`;
        $('.vitrine__slide-title', cap).textContent = it.name;
        $('.vitrine__front-name', cap).textContent = it.variant;
        $('.vitrine__front-price', cap).textContent = it.price;
        const link = $('a', cap); link.href = it.url; link.textContent = ($('[data-front-link]', this.root) || {}).textContent || 'Voir la pièce';
        if (it.variantId && it.available) {
          const add = document.createElement('button');
          add.type = 'button'; add.className = 'link-btn vitrine__add'; add.setAttribute('data-add-to-cart', '');
          add.dataset.variantId = it.variantId; add.dataset.name = it.name; add.dataset.variant = it.variant;
          add.dataset.price = it.priceCents; add.dataset.image = it.image; add.dataset.url = it.url;
          add.textContent = ($('[data-front-add]', this.root) || {}).textContent || 'Ajouter au panier';
          $('.vitrine__actions', cap).appendChild(add);
        }
        fig.appendChild(media); fig.appendChild(cap); wrap.appendChild(fig); slides.push(fig);
        const d = document.createElement('li'); if (p === 0) d.classList.add('is-active'); dots.appendChild(d);
      }
      this.grid.insertAdjacentElement('afterend', wrap);
      wrap.insertAdjacentElement('afterend', dots);
      wrap.addEventListener('scroll', () => {
        const i = Math.round(wrap.scrollLeft / wrap.clientWidth);
        $$('li', dots).forEach((d, k) => d.classList.toggle('is-active', k === i));
      }, { passive: true });
    }
  }

  const init = () => { $$('[data-vitrine-seq]').forEach((root) => { if (!root.__vitrine) root.__vitrine = new Vitrine(root); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('shopify:section:load', init);
})();
