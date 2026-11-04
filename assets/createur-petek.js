/* Breslev Gang — Créateur de Petek (sections/main-createur-petek.liquid).
   Lit le JSON des fiches Petek posé par la section, puis : matière (une fiche) → coloris (une variante).
   La photo, le nom, le prix, la disponibilité et le bouton d'ajout changent sur place, sans rechargement.

   PHOTO SANS DÉLAI
     1. la grande photo déjà prête (préchargée au survol, au toucher ou au focus d'une pastille) : posée tout de suite ;
     2. sinon la petite photo (préchargée dès que sa pastille est visible, ou celle de la vignette de la matière)
        s'affiche aussitôt, puis la grande la remplace dès qu'elle est décodée (fondu de 220 ms, aucun si mouvement réduit) ;
     3. tant que rien n'est prêt, l'ancienne photo reste, avec un filet de chargement (après 150 ms) ;
        une photo introuvable laisse le cadre vide, jamais la photo d'une autre pièce ni l'icône d'image cassée.
     La photo demandée se charge en priorité haute, les préchargements en priorité basse.

   PANIER
     Le bouton porte data-add-to-cart, data-variant-id (vrai identifiant Shopify), data-name, data-variant, data-price
     (centimes), data-image, data-url, data-product-id, data-product-type : assets/cart.js le lit (lineFromButton)
     et appelle window.BGCart.add. Variante épuisée : bouton désactivé, libellé « Épuisé ».

   ADRESSE
     ?variant=<id> (remplacée à chaque choix, sans empiler l'historique) : le lien redonne le même Petek et le même coloris.
     ?modele=<handle> est aussi accepté. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LARGEURS = [400, 600, 800, 1000, 1300, 1600];
  const PETITE = 240;   // vignettes des matières et photo d'attente : la même adresse, donc déjà en cache
  const PANIER = 600;   // vignette du tiroir panier

  /* ---------- Adresse d'une photo : la seule fonction à brancher ----------
     adresseImage(src, largeur, carre) — carre : vignette carrée centrée (pastilles), comme image_url crop: 'center'.
     1. Photo du CDN Shopify : paramètres width (et height + crop pour une vignette carrée).
     2. Photos détourées du banc d'essai et de la démo (NUIT/shopify-images.csv, scripts/apercu/photos-detourees.mjs) :
        /photos/1600|800|pastille/<nom>.webp → le fichier de la bonne taille (pastille : cadrée sur le pendentif).
     3. Sur la boutique, une fois les photos détourées envoyées dans Shopify (Contenu > Fichiers) : poser avant ce script
        window.BGPhotosDetourees = { "<nom du fichier d'origine, sans extension>": "<adresse détourée sur le CDN>" } ;
        la photo détourée remplace alors l'originale partout sur cette page (scène, pastilles, vignettes, tiroir panier). */
  const nomFichier = (src) => String(src || '').split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  function adresseImage(src, largeur, carre) {
    if (!src) return '';
    const table = window.BGPhotosDetourees;
    const base = (table && table[nomFichier(src)]) || src;
    const locale = String(base).match(/^(.*\/photos\/)(?:1600|800|pastille)\/([\w.-]+\.webp)$/);
    const chemin = locale ? `${locale[1]}${carre && largeur <= 240 ? 'pastille' : largeur <= 800 ? '800' : '1600'}/${locale[2]}` : base;
    try {
      // toujours une adresse complète : la même photo a la même clé partout (cache, photos prêtes)
      const url = new URL(chemin, window.location.href);
      if (locale) return url.toString();
      if (/cdn\.shopify\.com$/.test(url.hostname) || url.pathname.indexOf('/cdn/shop/') === 0 || url.searchParams.has('width')) {
        url.searchParams.set('width', String(largeur));
        if (carre) { url.searchParams.set('height', String(largeur)); url.searchParams.set('crop', 'center'); }
        else { url.searchParams.delete('height'); url.searchParams.delete('crop'); }
      }
      return url.toString();
    } catch (e) {
      return base;
    }
  }

  // Pas d'emoji à l'écran (règle de la marque) : certains noms de couleur venus de Shopify en contiennent.
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  const propre = (t) => String(t || '').replace(EMOJI, '').replace(/ {2,}/g, ' ').trim();
  const nomCouleur = (v) => propre(v.couleur || (v.titre === 'Default Title' ? '' : v.titre));

  // photo introuvable : le cadre reste vide, jamais l'icône d'image cassée
  const surveiller = (img) => {
    if (!img) return;
    const casse = () => img.classList.add('is-cassee');
    if (img.complete && img.getAttribute('src') && !img.naturalWidth) casse();
    img.addEventListener('error', casse);
    img.addEventListener('load', () => img.classList.remove('is-cassee'));
  };

  const rouler = (el, texte) => {
    if (!el || el.textContent === texte) return;
    if (window.BG && window.BG.roll && !reduit) window.BG.roll(el, texte);
    else el.textContent = texte;
  };

  class Createur {
    constructor(root) {
      this.root = root;
      try {
        this.modeles = JSON.parse($('[data-cp-modeles-json]', root).textContent);
        this.txt = JSON.parse($('[data-cp-reglages]', root).textContent);
      } catch (e) {
        return;
      }
      if (!this.modeles.length) return;
      this.liens = $$('[data-cp-modele]', root);
      this.rail = $('[data-cp-modeles]', root);
      this.photo = $('[data-cp-photo]', root);
      this.img = $('[data-cp-img]', root);
      this.fond = $('[data-cp-fond]', root);
      this.nom = $('[data-cp-nom]', root);
      this.couleur = $('[data-cp-couleur]', root);
      this.prix = $('[data-cp-prix]', root);
      this.epuise = $('[data-cp-epuise]', root);
      this.fab = $('[data-cp-fab]', root);
      this.valeurModele = $('[data-cp-valeur-modele]', root);
      this.valeurColoris = $('[data-cp-valeur-coloris]', root);
      this.nombre = $('[data-cp-nombre]', root);
      this.etapeColoris = $('[data-cp-etape="coloris"]', root);
      this.pastilles = $('[data-cp-pastilles]', root);
      this.tout = $('[data-cp-tout]', root);
      this.bouton = $('[data-cp-ajout]', root);
      this.fiche = $('[data-cp-fiche]', root);

      this.pretes = new Set();        // adresses déjà chargées et décodées
      this.chargements = new Map();   // adresse → promesse de chargement
      this.jeton = 0;
      this.netActuel = this.img ? this.img.currentSrc || this.img.src : '';
      this.indexModele = -1;
      this.variante = null;

      if (this.img) {
        const marquer = () => { if (this.img.currentSrc) this.pretes.add(this.img.currentSrc); };
        if (this.img.complete) marquer(); else this.img.addEventListener('load', marquer, { once: true });
        surveiller(this.img);
        surveiller(this.fond);
      }
      // vignettes des matières : leur photo sert de photo d'attente quand on change de matière
      this.liens.forEach((lien) => {
        lien.setAttribute('role', 'button');
        lien.removeAttribute('aria-current');
        const vignette = $('img', lien);
        if (vignette) {
          const marquer = () => this.pretes.add(vignette.currentSrc || vignette.src);
          if (vignette.complete && vignette.naturalWidth) marquer(); else vignette.addEventListener('load', marquer, { once: true });
          surveiller(vignette);
        }
      });

      this.observateur = 'IntersectionObserver' in window
        ? new IntersectionObserver((entrees) => entrees.forEach((e) => {
            if (!e.isIntersecting) return;
            this.observateur.unobserve(e.target);
            const v = this.varianteParId(Number(e.target.dataset.cpVariante));
            const image = v && this.imageDe(v);
            if (image) this.precharger(adresseImage(image.src, PETITE));
          }), { rootMargin: '200px' })
        : null;

      this.lier();
      this.depart();
    }

    /* ---------- Données ---------- */
    get modele() { return this.modeles[this.indexModele]; }
    imageDe(v) { return v.img || (this.modele.variantes.find((x) => x.img) || {}).img || null; }
    varianteParId(id) { return this.modele ? this.modele.variantes.find((v) => v.id === id) : null; }
    varianteParDefaut(m) {
      return m.variantes.find((v) => v.id === m.defaut && v.dispo) || m.variantes.find((v) => v.dispo) || m.variantes[0];
    }
    lienFiche(index, varianteId) {
      const lien = this.liens[index];
      const base = lien ? lien.getAttribute('href') : '';
      if (!base) return '#';
      return varianteId ? `${base}${base.indexOf('?') === -1 ? '?' : '&'}variant=${varianteId}` : base;
    }

    /* ---------- Départ : adresse, sinon première matière ---------- */
    depart() {
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get('variant'));
      const handle = params.get('modele');
      let index = 0;
      let variante = null;
      if (id) {
        const i = this.modeles.findIndex((m) => m.variantes.some((v) => v.id === id));
        if (i !== -1) { index = i; variante = this.modeles[i].variantes.find((v) => v.id === id); }
      } else if (handle) {
        const i = this.modeles.findIndex((m) => m.handle === handle);
        if (i !== -1) index = i;
      }
      this.choisirModele(index, { variante, depart: true });
    }

    /* ---------- Liaisons ---------- */
    lier() {
      this.root.addEventListener('click', (event) => {
        const lien = event.target.closest('[data-cp-modele]');
        if (lien && this.root.contains(lien)) {
          event.preventDefault();
          this.choisirModele(Number(lien.dataset.cpModele));
          return;
        }
        const pastille = event.target.closest('[data-cp-variante]');
        if (pastille) {
          const v = this.varianteParId(Number(pastille.dataset.cpVariante));
          if (v) this.appliquer(v);
          return;
        }
        if (event.target.closest('[data-cp-tout]')) this.toutVoir();
      });
      // les matières sont des liens (sans JavaScript, ils mènent à la fiche) : la barre d'espace les active aussi
      this.root.addEventListener('keydown', (event) => {
        const lien = event.target.closest('[data-cp-modele]');
        if (lien && (event.key === ' ' || event.key === 'Spacebar')) { event.preventDefault(); lien.click(); }
      });
      // intention (survol, toucher, focus) : la grande photo se charge avant le choix
      const intention = (event) => {
        const pastille = event.target.closest && event.target.closest('[data-cp-variante]');
        if (pastille) {
          const v = this.varianteParId(Number(pastille.dataset.cpVariante));
          if (v) this.precharger(this.adresseNette(this.imageDe(v)));
          return;
        }
        const lien = event.target.closest && event.target.closest('[data-cp-modele]');
        if (lien) {
          const m = this.modeles[Number(lien.dataset.cpModele)];
          const v = m && this.varianteParDefaut(m);
          if (v && v.img) this.precharger(this.adresseNette(v.img));
        }
      };
      this.root.addEventListener('pointerover', intention, { passive: true });
      this.root.addEventListener('touchstart', intention, { passive: true });
      this.root.addEventListener('focusin', intention);
      window.addEventListener('pageshow', (event) => { if (event.persisted) this.majBouton(this.variante); });
    }

    /* ---------- Étape 1 : la matière ---------- */
    choisirModele(index, opts = {}) {
      const m = this.modeles[index];
      if (!m) return;
      const change = index !== this.indexModele;
      this.indexModele = index;
      this.liens.forEach((lien, i) => lien.setAttribute('aria-pressed', i === index ? 'true' : 'false'));
      if (change && !opts.depart) this.centrerVignette(this.liens[index]);
      else if (opts.depart && index > 0) this.centrerVignette(this.liens[index], true);
      rouler(this.valeurModele, propre(m.titre));
      const unique = m.variantes.length < 2;
      if (this.etapeColoris) this.etapeColoris.hidden = unique;
      if (change || opts.depart) this.dessinerPastilles(m, !opts.depart);
      const v = opts.variante || this.varianteParDefaut(m);
      this.appliquer(v, { depart: opts.depart });
    }

    // seule la bande des matières défile (jamais la page)
    centrerVignette(lien, immediat) {
      if (!lien || !this.rail || this.rail.scrollWidth <= this.rail.clientWidth + 1) return;
      const gauche = lien.offsetLeft - (this.rail.clientWidth - lien.offsetWidth) / 2;
      this.rail.scrollTo({ left: Math.max(0, gauche), behavior: immediat || reduit ? 'auto' : 'smooth' });
    }

    /* ---------- Étape 2 : le coloris ---------- */
    dessinerPastilles(m, anime) {
      if (!this.pastilles) return;
      if (this.observateur) this.observateur.disconnect();
      const max = Number(this.txt.pastillesMax) || 28;
      const frag = document.createDocumentFragment();
      m.variantes.forEach((v, i) => {
        const nom = nomCouleur(v);
        const teinte = m.teintes && v.couleur ? m.teintes[v.couleur] : '';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `swatch swatch--lg${teinte ? ' swatch--teinte' : ''}${v.dispo ? '' : ' is-unavailable'}${i >= max ? ' is-cachee' : ''}`;
        b.dataset.cpVariante = String(v.id);
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', v.dispo ? nom : `${nom} — ${this.txt.epuise || ''}`.replace(/ — $/, ''));
        b.title = nom;
        if (anime && !reduit) { b.classList.add('is-entree'); b.style.setProperty('--i', String(Math.min(i, 24))); }
        if (teinte) {
          const disque = document.createElement('span');
          disque.className = 'swatch__teinte';
          disque.style.background = teinte;
          b.appendChild(disque);
        } else {
          // même vignette que la pastille de la fiche produit (carrée, 160 px, centrée)
          const image = this.imageDe(v);
          if (image) {
            const img = document.createElement('img');
            img.alt = '';
            img.width = 80;
            img.height = 80;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = adresseImage(image.src, 160, true);
            surveiller(img);
            b.appendChild(img);
          }
        }
        frag.appendChild(b);
      });
      this.pastilles.replaceChildren(frag);
      // la photo d'attente de chaque coloris se charge quand sa pastille devient visible
      if (this.observateur) $$('[data-cp-variante]:not(.is-cachee)', this.pastilles).forEach((b) => this.observateur.observe(b));
      const total = m.variantes.length;
      if (this.nombre) this.nombre.textContent = this.txt.nombre && total > 1 ? this.txt.nombre.replace('[nombre]', total) : '';
      if (this.tout) {
        this.tout.hidden = total <= max;
        this.tout.textContent = (this.txt.voirTout || '').replace('[nombre]', total);
      }
    }

    toutVoir() {
      $$('.is-cachee', this.pastilles).forEach((b) => b.classList.remove('is-cachee'));
      if (this.tout) this.tout.hidden = true;
      if (this.observateur) $$('[data-cp-variante]', this.pastilles).forEach((b) => this.observateur.observe(b));
    }

    /* ---------- Une variante : tout change sur place ---------- */
    appliquer(v, opts = {}) {
      if (!v) return;
      const m = this.modele;
      this.variante = v;
      const nom = nomCouleur(v);
      $$('[data-cp-variante]', this.pastilles).forEach((b) => {
        const actif = Number(b.dataset.cpVariante) === v.id;
        b.setAttribute('aria-pressed', actif ? 'true' : 'false');
        if (actif && b.classList.contains('is-cachee')) this.toutVoir();
      });
      rouler(this.nom, propre(m.titre));
      rouler(this.couleur, nom);
      rouler(this.prix, v.prix);
      if (this.valeurColoris) rouler(this.valeurColoris, nom);
      if (this.epuise) this.epuise.hidden = !!v.dispo;
      if (this.fab) {
        this.fab.textContent = this.txt.fabrication ? propre(m.fab) : '';
        this.fab.hidden = !this.fab.textContent;
      }
      this.montrer(v, opts);
      this.majBouton(v);
      if (this.fiche) this.fiche.href = this.lienFiche(this.indexModele, v.id);
      if (!opts.depart || new URLSearchParams(window.location.search).has('variant')) this.ecrireAdresse(v);
      this.prechargerVoisines(v);
    }

    majBouton(v) {
      const b = this.bouton;
      if (!b || !v) return;
      const m = this.modele;
      const image = this.imageDe(v);
      b.dataset.variantId = String(v.id);
      b.dataset.name = propre(m.titre);
      b.dataset.variant = nomCouleur(v);
      b.dataset.price = String(v.centimes);
      b.dataset.image = image ? adresseImage(image.src, PANIER) : '';
      b.dataset.url = this.lienFiche(this.indexModele, v.id);
      b.dataset.productId = String(m.id);
      b.dataset.productType = m.type || '';
      b.disabled = !v.dispo;
      b.textContent = v.dispo ? this.txt.ajouter : this.txt.epuise;
      const erreur = $('[data-add-error]', this.root);
      if (erreur) erreur.hidden = true;
    }

    ecrireAdresse(v) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('modele');
        url.searchParams.set('variant', String(v.id));
        if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.toString());
      } catch (e) { /* adresse inchangée */ }
    }

    /* ---------- Photos ---------- */
    // largeur utile : la place de la photo à l'écran × densité de pixels, arrondie à une largeur du CDN
    adresseNette(image) {
      if (!image) return '';
      const boite = this.photo ? this.photo.getBoundingClientRect() : { width: 600, height: 800 };
      const ratio = image.w && image.h ? image.w / image.h : 0.72;
      const affichee = Math.min(boite.width || 600, (boite.height || 800) * ratio);
      const voulue = affichee * Math.min(window.devicePixelRatio || 1, 3);
      const plafond = image.w || 1600;
      const largeur = LARGEURS.find((l) => l >= voulue && l <= plafond) || Math.min(plafond, LARGEURS[LARGEURS.length - 1]);
      return adresseImage(image.src, largeur);
    }

    // prioritaire : la photo qu'on vient de choisir passe avant les préchargements (survol, voisines, pastilles)
    precharger(adresse, prioritaire) {
      if (!adresse) return Promise.resolve(false);
      if (this.pretes.has(adresse)) return Promise.resolve(true);
      if (this.chargements.has(adresse)) return this.chargements.get(adresse);
      const img = new Image();
      img.decoding = 'async';
      try { img.fetchPriority = prioritaire ? 'high' : 'low'; } catch (e) { /* navigateur sans priorité */ }
      const promesse = new Promise((resolve) => {
        const fin = (ok) => { if (ok) this.pretes.add(adresse); else this.chargements.delete(adresse); resolve(ok); };
        img.onload = () => {
          if (img.decode) img.decode().then(() => fin(true), () => fin(true));
          else fin(true);
        };
        img.onerror = () => fin(false);
      });
      img.src = adresse;
      this.chargements.set(adresse, promesse);
      return promesse;
    }

    prechargerVoisines(v) {
      const liste = this.modele.variantes;
      const i = liste.indexOf(v);
      const faire = () => [liste[i + 1], liste[i - 1]].forEach((x) => { if (x && x.img) this.precharger(this.adresseNette(x.img)); });
      if ('requestIdleCallback' in window) window.requestIdleCallback(faire, { timeout: 1500 });
      else setTimeout(faire, 400);
    }

    montrer(v, opts = {}) {
      const image = this.imageDe(v);
      if (!image || !this.img) return;
      const jeton = ++this.jeton;
      const alt = [propre(this.modele.titre), nomCouleur(v)].filter(Boolean).join(' — ');
      const ratio = image.w && image.h ? String(image.w / image.h) : '';
      this.img.alt = alt;
      // au départ, la photo posée par Liquid (avec son srcset) est déjà la bonne : on la garde
      if (opts.depart && nomFichier(this.img.currentSrc || this.img.getAttribute('src')) === nomFichier(adresseImage(image.src, PETITE))) return;
      const net = this.adresseNette(image);
      const petite = adresseImage(image.src, PETITE);
      if (net === this.netActuel) {
        this.photo.classList.remove('is-charge');
        this.img.classList.remove('is-attente');
        this.fond.hidden = true;
        return;
      }
      if (this.pretes.has(net)) { this.poser(net, false, ratio); return; }
      if (this.pretes.has(petite)) {
        // la petite photo, déjà chargée, tout de suite ; la grande arrive par-dessus
        if (ratio) this.photo.style.setProperty('--ratio', ratio);
        this.fond.src = petite;
        this.fond.hidden = false;
        this.img.classList.add('is-attente');
      } else {
        // rien de prêt : la dernière photo nette reste affichée, jamais un cadre vide
        this.img.classList.remove('is-attente');
        this.fond.hidden = true;
      }
      this.photo.classList.add('is-charge');
      this.precharger(net, true).then((ok) => {
        if (jeton !== this.jeton) return;
        if (ok) { this.poser(net, true, ratio); return; }
        // photo introuvable : cadre vide plutôt que la photo d'une autre pièce
        this.photo.classList.remove('is-charge');
        this.img.classList.remove('is-attente');
        this.img.classList.add('is-cassee');
        this.fond.hidden = true;
        this.netActuel = '';
      });
    }

    poser(net, fondu, ratio) {
      const img = this.img;
      if (ratio) this.photo.style.setProperty('--ratio', ratio);
      img.classList.remove('is-cassee');
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = net;
      this.netActuel = net;
      this.photo.classList.remove('is-charge');
      if (!fondu || reduit || !img.classList.contains('is-attente')) {
        img.classList.remove('is-attente');
        this.fond.hidden = true;
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.classList.remove('is-attente');
        const jeton = this.jeton;
        setTimeout(() => { if (jeton === this.jeton) this.fond.hidden = true; }, 260);
      }));
    }
  }

  function init() {
    $$('[data-cp]').forEach((root) => { if (!root.createur) root.createur = new Createur(root); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
