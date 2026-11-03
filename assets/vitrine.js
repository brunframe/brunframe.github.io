/* Breslev Gang — vitrine : un salon privé épinglé au défilement.
   - La grille reste la base (sans JavaScript, mouvement réduit, ou réglage désactivé).
   - Avec WebGL et un appareil assez rapide : scène Three.js (assets/vitrine-3d.js, chargée à la demande).
   - Sinon : carrousel CSS 3D, même mise en scène.
   Le défilement est la seule source de vérité : un glissement horizontal du doigt fait défiler la page,
   donc tourner le cercle ; la fin du cercle arrive au catalogue sans coupure. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(window.location.search);
  const force = params.get('vitrine'); // webgl | css | grille : pour les tests

  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function supportsWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function probablySlow() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    return cores <= 2 || mem <= 2;
  }

  class Vitrine {
    constructor(root) {
      this.root = root;
      this.stage = $('[data-vitrine-stage]', root);
      this.grid = $('[data-vitrine-grid]', root);
      this.head = $('.vitrine__head', root);
      this.namesBox = $('[data-vitrine-names]', root);
      this.sceneBox = $('[data-vitrine-scene]', root);
      this.front = $('[data-vitrine-front]', root);
      this.live = $('[data-vitrine-live]', root);
      this.items = $$('[data-vitrine-item]', root).map((el, i) => ({
        el,
        index: i,
        name: el.dataset.name,
        variant: el.dataset.variant || '',
        price: el.dataset.price,
        url: el.dataset.url,
        image: el.dataset.image,
        aspect: parseFloat(el.dataset.aspect) || 1
      }));
      this.steps = Math.max(1, this.items.length - 1);
      this.stepAngle = TAU / this.items.length;
      this.snap = root.dataset.snap === 'true';
      this.feather = parseFloat(root.dataset.feather) || 0;
      this.theta = 0;
      this.target = 0;
      this.frontIndex = -1;
      this.pointer = { x: 0, y: 0 };
      this.visible = false;
      this.mode = 'grille';
      this.lastTime = 0;
      this.frames = [];
      this.build();
    }

    /* ---------- Mise en place ---------- */
    build() {
      // Les noms en Anton derrière les pièces, comme une architecture.
      this.names = this.items.map((item) => {
        const span = document.createElement('span');
        span.className = 'vitrine__name';
        span.textContent = item.name;
        this.namesBox.appendChild(span);
        return span;
      });
      this.frontName = $('[data-front-name]', this.front);
      this.frontVariant = $('[data-front-variant]', this.front);
      this.frontPrice = $('[data-front-price]', this.front);
      this.frontLink = $('[data-front-link]', this.front);

      this.root.classList.add('is-3d');
      this.front.hidden = false;
      this.setFront(0, true);

      this.onScroll = this.onScroll.bind(this);
      this.onResize = this.onResize.bind(this);
      this.loop = this.loop.bind(this);
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onResize);
      this.onResize();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.nameSpans = null; });
      this.bindGestures();

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
          this.visible = entry.isIntersecting;
          if (this.visible) this.start();
        }, { rootMargin: '20% 0px' }).observe(this.stage);
        // La scène se charge un écran à l'avance, après le chargement de la page.
        const preload = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting) return;
          preload.disconnect();
          this.chooseRenderer();
        }, { rootMargin: '120% 0px' });
        preload.observe(this.root);
      } else {
        this.visible = true;
        this.chooseRenderer();
        this.start();
      }
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.visible) this.start(); });
    }

    chooseRenderer() {
      const wantWebGL = force === 'webgl' || (force !== 'css' && supportsWebGL() && !probablySlow());
      const go = () => (wantWebGL ? this.loadWebGL() : this.useCSS());
      if (document.readyState === 'complete') go();
      else window.addEventListener('load', go, { once: true });
    }

    loadWebGL() {
      if (window.BGVitrine3D) { this.useWebGL(); return; }
      const script = document.createElement('script');
      script.src = this.root.dataset.script;
      script.async = true;
      script.onload = () => this.useWebGL();
      script.onerror = () => this.useCSS();
      document.head.appendChild(script);
    }

    useWebGL() {
      try {
        const canvas = document.createElement('canvas');
        canvas.className = 'vitrine__canvas';
        this.sceneBox.innerHTML = '';
        this.sceneBox.appendChild(canvas);
        this.sceneBox.hidden = false;
        const small = window.innerWidth < 900;
        this.three = window.BGVitrine3D.create(canvas, this.items, {
          feather: this.feather,
          textureWidth: small ? 1024 : 1400,
          pixelRatio: Math.min(window.devicePixelRatio || 1, small ? 2 : 1.5)
        });
        this.three.ready.then((ok) => {
          if (!ok) { this.useCSS(); return; }
          this.activate('webgl');
        });
      } catch (e) {
        this.useCSS();
      }
    }

    useCSS() {
      if (this.ring) return;
      const ring = document.createElement('div');
      ring.className = 'vitrine__ring';
      this.cssItems = this.items.map((item, i) => {
        const el = document.createElement('div');
        el.className = 'vitrine__piece';
        el.style.setProperty('--a', `${(i / this.items.length) * 360}deg`);
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.loading = i === 0 ? 'eager' : 'lazy';
        img.src = item.image.replace(/([?&])width=\d+/, '$1width=900');
        const stand = document.createElement('span');
        stand.className = 'vitrine__stand';
        el.appendChild(img);
        el.appendChild(stand);
        ring.appendChild(el);
        return el;
      });
      this.sceneBox.appendChild(ring);
      this.ring = ring;
      this.sceneBox.hidden = false;
      const first = this.cssItems[0].querySelector('img');
      // La scène WebGL, si elle tournait, reste visible jusqu'à ce que le carrousel ait sa première photo.
      const done = () => {
        if (this.three) { this.three.dispose(); this.three = null; }
        $$('.vitrine__canvas', this.sceneBox).forEach((c) => c.remove());
        this.activate('css');
      };
      if (first.complete) done(); else { first.addEventListener('load', done, { once: true }); first.addEventListener('error', done, { once: true }); }
    }

    /* Le passage grille → scène ne se fait qu'une fois la première photo prête :
       un bijou n'est jamais caché plus d'une seconde. */
    activate(mode) {
      this.mode = mode;
      this.activatedAt = performance.now();
      this.root.classList.remove('is-webgl', 'is-css');
      this.root.classList.add('is-active', `is-${mode}`);
      this.grid.classList.add('is-leaving');
      setTimeout(() => { this.grid.hidden = true; }, 450);
      this.onResize();
      this.start();
    }

    /* ---------- Défilement, geste, aimant ---------- */
    onResize() {
      this.stageH = this.stage.offsetHeight || window.innerHeight;
      this.stageW = this.stage.offsetWidth || window.innerWidth;
      this.nameSpans = null;
      this.travel = Math.max(1, this.root.offsetHeight - this.stageH);
      this.stepPx = this.travel / this.steps;
      if (this.three) this.three.resize();
      this.onScroll();
    }

    progress() {
      const top = this.root.getBoundingClientRect().top;
      return clamp(-top / this.travel, 0, 1);
    }

    onScroll() {
      const p = this.progress();
      this.target = p * this.steps * this.stepAngle;
      this.pinned = p > 0 && p < 1;
      const headFade = clamp(1 - p * this.steps * 2.2, 0, 1);
      if (this.head) this.head.style.opacity = headFade;
      this.scrolling = true;
      clearTimeout(this.snapTimer);
      if (this.snap && this.pinned && !reducedMotion && !this.dragging) {
        this.snapTimer = setTimeout(() => this.snapToNearest(), 220);
      }
      this.start();
    }

    snapToNearest() {
      const p = this.progress();
      if (p <= 0 || p >= 1) return;
      const k = Math.round(p * this.steps);
      const sectionTop = window.scrollY + this.root.getBoundingClientRect().top;
      const wanted = sectionTop + (k / this.steps) * this.travel;
      const delta = wanted - window.scrollY;
      if (Math.abs(delta) < 2 || Math.abs(delta) > this.stepPx * 0.5) return;
      window.scrollTo({ top: wanted, behavior: 'smooth' });
    }

    bindGestures() {
      const stage = this.stage;
      let start = null;
      let moved = 0;
      stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a, button')) return;
        start = { x: e.clientX, y: e.clientY, t: performance.now(), scroll: window.scrollY };
        moved = 0;
      });
      stage.addEventListener('pointermove', (e) => {
        if (!start || e.pointerType === 'mouse' && e.buttons === 0) {
          if (e.pointerType === 'mouse') this.pointer = { x: (e.clientX / this.stageW) * 2 - 1, y: (e.clientY / this.stageH) * 2 - 1 };
          return;
        }
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4 && this.mode !== 'grille') {
          // Un glissement horizontal = le cercle tourne = la page défile.
          this.dragging = true;
          const k = this.stepPx / (this.stageW * 0.7);
          window.scrollTo(0, start.scroll - dx * k);
        }
      });
      const end = (e) => {
        if (!start) return;
        const quick = performance.now() - start.t < 600 && moved < 8;
        if (quick && e.type === 'pointerup' && this.mode !== 'grille' && e.target.closest('[data-vitrine-scene], [data-vitrine-names]')) {
          const item = this.items[this.frontIndex];
          if (item) window.location.href = item.url;
        }
        start = null;
        if (this.dragging) { this.dragging = false; this.onScroll(); }
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      // Pavé tactile : un geste horizontal fait aussi tourner le cercle.
      stage.addEventListener('wheel', (e) => {
        if (this.mode === 'grille' || !this.pinned) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
          e.preventDefault();
          window.scrollBy(0, e.deltaX * (this.stepPx / 320));
        }
      }, { passive: false });
    }

    /* ---------- Boucle ---------- */
    start() {
      if (this.running || !this.visible || document.hidden) return;
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop);
    }

    loop(now) {
      if (!this.visible || document.hidden) { this.running = false; return; }
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      // Tout glisse, avec du poids : amortissement indépendant de la cadence.
      const k = 1 - Math.exp(-dt * 5.5);
      this.theta += (this.target - this.theta) * k;
      const still = Math.abs(this.target - this.theta) < 0.0005;
      if (still) this.theta = this.target;

      this.layoutNames();
      const front = Math.round(this.theta / this.stepAngle) % this.items.length;
      if (front !== this.frontIndex) this.setFront(front);

      if (this.mode === 'webgl' && this.three) {
        this.three.render(this.theta, this.pointer, dt);
        this.watchSpeed(dt);
      } else if (this.mode === 'css' && this.ring) {
        this.ring.style.setProperty('--theta', `${(this.theta * 180) / Math.PI}deg`);
        this.cssItems.forEach((el, i) => {
          const d = wrap((i / this.items.length) * TAU - this.theta);
          const f = clamp(1 - Math.abs(d) / this.stepAngle, 0, 1);
          el.style.setProperty('--front', f.toFixed(3));
        });
      }
      requestAnimationFrame(this.loop);
    }

    /* Téléphone trop lent pour la 3D : on passe au carrousel CSS, même mise en scène. */
    watchSpeed(dt) {
      if (force === 'webgl' || this.speedChecked) return;
      this.frames.push(dt);
      const elapsed = performance.now() - this.activatedAt;
      if (this.frames.length < 36 && elapsed < 2500) return;
      this.speedChecked = true;
      const sorted = this.frames.slice(6).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] || 1;
      if (median > 0.04 || this.frames.length < 24) this.useCSS(); // sous 25 images par seconde : carrousel CSS
    }

    /* Les noms forment un ruban continu derrière les pièces : à chaque pas du cercle, le ruban
       glisse d'un nom. Les lettres passent derrière le bijou de face, jamais les unes sur les autres. */
    measureNames() {
      const gap = this.stageW * 0.22;
      let x = 0;
      this.nameSpans = this.names.map((span) => {
        const w = span.offsetWidth || 1;
        const entry = { span, w, start: x, center: x + w / 2 };
        x += w + gap;
        return entry;
      });
      this.ribbon = x;
    }

    layoutNames() {
      if (!this.nameSpans) this.measureNames();
      const n = this.items.length;
      const s = this.theta / this.stepAngle;
      const k = Math.floor(s);
      const frac = s - k;
      const a = this.nameSpans[((k % n) + n) % n];
      const b = this.nameSpans[(((k + 1) % n) + n) % n];
      let bCenter = b.center;
      if ((k + 1) % n === 0 && n > 1) bCenter += this.ribbon;
      const c = a.center + (bCenter - a.center) * frac;
      const W = this.stageW;
      this.nameSpans.forEach((entry) => {
        let x = entry.center - c;
        if (x > this.ribbon / 2) x -= this.ribbon;
        if (x < -this.ribbon / 2) x += this.ribbon;
        const visible = Math.abs(x) < W / 2 + entry.w / 2;
        if (!visible) { entry.span.style.opacity = '0'; return; }
        const t = clamp(Math.abs(x) / (W * 0.95), 0, 1);
        entry.span.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), -50%) scale(${(1 - 0.1 * t).toFixed(3)})`;
        entry.span.style.opacity = (1 - 0.6 * t).toFixed(3);
      });
    }

    setFront(index, immediate) {
      const item = this.items[index];
      if (!item) return;
      this.frontIndex = index;
      this.frontLink.href = item.url;
      const roll = window.BG && window.BG.roll;
      if (immediate || !roll) {
        this.frontName.textContent = item.name;
        this.frontVariant.textContent = item.variant;
        this.frontPrice.textContent = item.price;
      } else {
        roll(this.frontName, item.name);
        roll(this.frontVariant, item.variant);
        roll(this.frontPrice, item.price);
      }
      if (this.live) this.live.textContent = `${item.name}${item.variant ? ' — ' + item.variant : ''} — ${item.price}`;
      this.names.forEach((n, i) => n.classList.toggle('is-front', i === index));
    }
  }

  function init() {
    $$('[data-vitrine-3d]').forEach((root) => {
      if (root.vitrine) return;
      if (reducedMotion && force !== 'webgl' && force !== 'css') return; // mouvement réduit : la grille, en fondu
      if (force === 'grille') return;
      root.vitrine = new Vitrine(root);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
