/* Breslev Gang — vitrine des colliers (sections/vitrine-colliers.liquid, assets/vitrine-colliers.css).
   Une seule scène : le mur (cinq bandes de la même image) se déplace d'un bloc, par transform, depuis la place exacte
   de la niche choisie jusqu'à son cadrage de détail, puis y revient. La fiche est en HTML.
   États : galerie → ouverture → détail → retour → galerie. Une seule transition possède la scène à la fois ; un
   retour pendant l'ouverture repart de la position visible (la transition CSS est simplement redirigée).
   Au repos : aucune boucle, aucun minuteur. Le survol est en CSS ; le script ne suit le pointeur que pour le reflet.
   Élément personnalisé : chaque section s'initialise seule et se nettoie quand l'éditeur de thème la recharge. */
(() => {
  'use strict';
  if (window.customElements.get('vitrine-colliers')) return;

  const HAUT = 92;            // lignes de pierre ajoutées au-dessus de l'image du mur
  const IMAGE_H = 1033;       // hauteur d'une bande (92 + 941)
  // zone que la caméra cadre, en pixels de l'image du mur : largeur autour de l'axe du spot, haut et bas
  const CADRE = {
    large: { l: 320, y0: 205, y1: 802 },     // écran large : le buste entier, de la pierre au-dessus jusqu'à la tablette
    haut: { l: 300, y0: 300, y1: 770 }       // écran en hauteur : du cou à la tablette, le collier en grand
  };
  const GRANDIR = 1.12;       // la niche choisie grandit toujours d'au moins 12 % : jamais de recul de la caméra
  const DUREE = { aller: 760, retour: 560, bref: 120 };
  const COURBE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const FOCUSABLES = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  class VitrineColliers extends HTMLElement {
    connectedCallback() {
      if (this.pret) return;
      this.pret = true;
      const q = (s) => this.querySelector(s);
      this.scene = q('[data-vitrine-scene]');
      this.mur = q('[data-vitrine-mur]');
      this.gabarit = q('[data-vitrine-gabarit]');
      this.niches = Array.from(this.querySelectorAll('[data-vitrine-niche]'));
      this.cibles = this.niches.map((n) => n.querySelector('[data-vitrine-cible]'));
      this.detail = q('[data-vitrine-detail]');
      this.panneau = q('[data-vitrine-panneau]');
      this.fiches = Array.from(this.querySelectorAll('[data-vitrine-fiche]'));
      this.boutonRetour = q('[data-vitrine-retour]');
      this.loupe = q('[data-vitrine-loupe]');
      this.piste = q('[data-vitrine-loupe-piste]');
      this.compte = q('[data-vitrine-loupe-compte]');
      this.enveloppe = this.closest('.shopify-section');
      this.entete = document.querySelector('[data-header]');
      if (!this.mur || !this.gabarit || !this.detail || !this.niches.length) return;
      this.etat = 'galerie';
      this.actif = -1;
      this.jeton = 0;
      this.arret = new AbortController();
      const o = { signal: this.arret.signal };
      const passif = { signal: this.arret.signal, passive: true };

      this.cibles.forEach((cible, i) => {
        cible.addEventListener('click', () => this.ouvrir(i), o);
        cible.addEventListener('pointermove', (e) => this.reflet(i, e), passif);
        // la photo de détail se prépare dès que le visiteur s'intéresse à la niche
        cible.addEventListener('pointerenter', () => this.precharger(i), passif);
        cible.addEventListener('focus', () => this.precharger(i), passif);
      });
      if (this.boutonRetour) this.boutonRetour.addEventListener('click', () => this.fermer(), o);
      this.querySelectorAll('[data-vitrine-loupe-ouvrir]').forEach((b) => b.addEventListener('click', () => this.ouvrirLoupe(b), o));
      const fermerLoupe = this.querySelector('[data-vitrine-loupe-fermer]');
      if (fermerLoupe) fermerLoupe.addEventListener('click', () => this.fermerLoupe(), o);
      if (this.piste) {
        this.piste.addEventListener('scroll', () => this.compter(), passif);
        this.piste.addEventListener('click', (e) => this.agrandir(e), o);
      }
      // au niveau du document : Échap referme même si le focus a quitté la fiche (clic dans le vide)
      document.addEventListener('keydown', (e) => this.clavier(e), o);
      window.addEventListener('resize', () => this.recadrer(), passif);
      window.addEventListener('orientationchange', () => this.recadrer(), passif);
      // l'en-tête du site prend les couleurs de la pierre tant qu'il est posé sur la vitrine
      window.addEventListener('scroll', () => this.surveillerEntete(), passif);
      window.addEventListener('pageshow', (e) => { if (e.persisted) this.poser(true); }, o);
      this.surveillerEntete(true);
      this.classList.add('est-prete');
    }

    disconnectedCallback() {
      if (!this.pret) return;
      this.pret = false;
      if (this.arret) this.arret.abort();
      window.clearTimeout(this.minuterie);
      window.clearTimeout(this.garde);
      this.poser(true);
      if (this.entete) this.entete.classList.remove('is-sur-vitrine', 'is-vitrine-ouverte');
    }

    get mouvementReduit() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    /* écran en hauteur (fiche sous le bijou) ou large (fiche à gauche) : la même règle que la feuille de style */
    get enHauteur() { return window.matchMedia('(orientation: portrait), (max-width: 699px) and (min-height: 521px)').matches; }

    /* ---------- Géométrie ---------- */
    /* place du mur dans la page, à l'écran (le gabarit ne bouge jamais) */
    maison() { return this.gabarit.getBoundingClientRect(); }

    /* zone suivie par la caméra pour la niche i, dans le repère du mur (pixels de mise en page, sans transform) */
    zone(i) {
      const niche = this.niches[i];
      const image = niche.querySelector('.vitrine__image');
      const u = image.offsetHeight / IMAGE_H;                       // un pixel de l'image, à l'écran
      const axe = parseFloat(niche.dataset.axe) || parseFloat(niche.dataset.largeur) / 2;
      const c = this.enHauteur ? CADRE.haut : CADRE.large;
      const gauche = niche.offsetLeft + image.offsetLeft;
      const haut = niche.offsetTop + image.offsetTop;
      return { x: gauche + (axe - c.l / 2) * u, y: haut + (HAUT + c.y0) * u, l: c.l * u, h: (c.y1 - c.y0) * u };
    }

    /* où la zone doit arriver à l'écran */
    arrivee() {
      const L = window.innerWidth;
      const H = window.innerHeight;
      if (this.enHauteur) {
        // le bijou occupe la moitié haute de l'écran, sous l'en-tête du site ; la fiche commence juste dessous
        const tete = this.entete ? this.entete.offsetHeight : 0;
        // place demandée par la fiche de cette pièce (titre, description, prix, boutons) et par le retour : le bijou
        // prend le reste, sans dépasser la moitié de l'écran ; une fiche plus longue encore défile au-dessus du retour
        const fiche = this.fiches[this.actif];
        const besoin = (fiche ? fiche.scrollHeight : 240) + (this.boutonRetour ? this.boutonRetour.offsetHeight : 48) + 2;
        const zone = Math.round(Math.max(tete + (H < 600 ? 120 : 150), Math.min(H * 0.52, H - besoin)));
        this.style.setProperty('--vit-zone', zone + 'px');
        return { cx: L / 2, y: tete, h: zone - tete };
      }
      this.style.removeProperty('--vit-zone');
      const panneau = this.panneau ? this.panneau.getBoundingClientRect().width : L * 0.27;
      // le buste près du centre, le quart gauche à la fiche ; sur un écran étroit, il se décale pour laisser la place
      const cx = Math.max(L * 0.57, panneau + (L - panneau) * 0.44);
      // écran bas (téléphone couché) : le bijou commence sous l'en-tête du site
      const tete = H < 521 && this.entete ? this.entete.offsetHeight : 0;
      return { cx, y: tete, h: H - tete };
    }

    /* transform qui amène la niche i à son cadrage de détail */
    cible(i) {
      const z = this.zone(i);
      const a = this.arrivee();
      let s = a.h / z.h;
      if (s < GRANDIR) {
        // petit écran : la niche est déjà grande dans la galerie. On cadre plus serré (le bas du cadre, tablette et
        // pendentif, ne bouge pas ; le haut descend) pour qu'elle grandisse quand même.
        s = GRANDIR;
        const h = a.h / s;
        z.y += z.h - h;
        z.h = h;
      }
      return { x: a.cx - (z.x + z.l / 2) * s, y: a.y - z.y * s, s };
    }

    placer(x, y, s, duree) {
      this.mur.style.transition = duree ? `transform ${duree}ms ${COURBE}` : 'none';
      this.mur.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${s.toFixed(5)})`;
    }

    /* ---------- Ouverture ---------- */
    ouvrir(i) {
      if (this.etat !== 'galerie' || !this.niches[i]) return;       // un double toucher n'ouvre jamais deux fiches
      this.etat = 'ouverture';
      this.actif = i;
      const jeton = ++this.jeton;
      const reduit = this.mouvementReduit;
      const m = this.maison();
      this.precharger(i);

      // le mur quitte la page sans bouger d'un pixel : même taille, même place, en position fixe
      this.mur.style.width = m.width + 'px';
      this.mur.style.height = m.height + 'px';
      this.placer(m.left, m.top, 1, 0);
      this.classList.add('est-ouverte');
      if (this.enveloppe) this.enveloppe.classList.add('vitrine-ouverte');
      this.niches.forEach((n, k) => n.classList.toggle('est-choisie', k === i));
      this.fiches.forEach((f, k) => { f.hidden = k !== i; f.classList.remove('est-visible'); });
      this.detail.hidden = false;
      const titre = this.fiches[i] && this.fiches[i].querySelector('[data-vitrine-titre]');
      if (titre) this.detail.setAttribute('aria-labelledby', titre.id);
      this.cibles.forEach((c) => { c.setAttribute('aria-expanded', c === this.cibles[i] ? 'true' : 'false'); c.tabIndex = -1; });
      if (window.BG && window.BG.scrollLock) window.BG.scrollLock.acquire('vitrine');

      if (this.entete) this.entete.classList.add('is-sur-vitrine', 'is-vitrine-ouverte');
      void this.mur.offsetWidth;                                     // la position de départ est prise en compte
      const c = this.cible(i);
      this.classList.add('est-en-detail');
      this.placer(c.x, c.y, c.s, reduit ? 0 : DUREE.aller);
      if (titre) titre.focus({ preventScroll: true });

      // le titre puis les informations arrivent quand l'œil s'est posé sur le bijou
      window.clearTimeout(this.minuterie);
      this.minuterie = window.setTimeout(() => {
        if (jeton !== this.jeton || this.actif !== i) return;
        if (this.fiches[i]) this.fiches[i].classList.add('est-visible');
      }, reduit ? 0 : DUREE.aller - 190);
      this.attendre(reduit ? DUREE.bref : DUREE.aller, jeton, () => { if (this.etat === 'ouverture') this.etat = 'detail'; });
    }

    /* ---------- Retour ---------- */
    fermer() {
      if (this.etat !== 'ouverture' && this.etat !== 'detail') return;
      if (this.loupe && !this.loupe.hidden) this.fermerLoupe(true);
      this.etat = 'retour';
      const jeton = ++this.jeton;
      const reduit = this.mouvementReduit;
      window.clearTimeout(this.minuterie);
      this.fiches.forEach((f) => f.classList.remove('est-visible'));
      const m = this.maison();
      this.classList.remove('est-en-detail');
      // depuis la position visible à cet instant, jusqu'à la place exacte de départ
      this.placer(m.left, m.top, 1, reduit ? 0 : DUREE.retour);
      this.attendre(reduit ? DUREE.bref : DUREE.retour, jeton, () => this.poser(false));
    }

    /* fin du retour : le mur reprend sa place dans la page, le focus revient sur la niche */
    poser(silencieux) {
      const i = this.actif;
      window.clearTimeout(this.minuterie);
      window.clearTimeout(this.garde);
      if (this.loupe && !this.loupe.hidden) { this.loupe.hidden = true; this.loupe.classList.remove('est-visible'); }
      this.classList.remove('est-ouverte', 'est-en-detail');
      if (this.enveloppe) this.enveloppe.classList.remove('vitrine-ouverte', 'vitrine-loupe');
      ['width', 'height', 'transition', 'transform'].forEach((p) => this.mur.style.removeProperty(p));
      this.niches.forEach((n) => n.classList.remove('est-choisie'));
      this.fiches.forEach((f) => { f.hidden = true; f.classList.remove('est-visible'); });
      this.detail.hidden = true;
      this.cibles.forEach((c) => { c.setAttribute('aria-expanded', 'false'); c.removeAttribute('tabindex'); });
      if (window.BG && window.BG.scrollLock) window.BG.scrollLock.release('vitrine');
      const etait = this.etat;
      this.etat = 'galerie';
      this.actif = -1;
      if (!silencieux && etait !== 'galerie' && this.cibles[i]) this.cibles[i].focus({ preventScroll: true });
      if (this.entete) this.entete.classList.remove('is-vitrine-ouverte');
      if (this.pret) this.surveillerEntete(true);
    }

    /* fin d'une transition du mur : l'évènement, avec un minuteur de garde s'il ne vient pas */
    attendre(duree, jeton, suite) {
      window.clearTimeout(this.garde);
      let fait = false;
      const fin = (e) => {
        if (e && (e.target !== this.mur || e.propertyName !== 'transform')) return;
        if (fait) return;
        fait = true;
        this.mur.removeEventListener('transitionend', fin);
        window.clearTimeout(this.garde);
        if (jeton === this.jeton) suite();
      };
      this.mur.addEventListener('transitionend', fin);
      this.garde = window.setTimeout(() => fin(null), duree + 90);
    }

    /* rotation ou redimensionnement : la sélection est gardée, le cadrage recalculé */
    recadrer() {
      if (this.etat === 'galerie') return;
      window.cancelAnimationFrame(this.imageRecadrage);
      this.imageRecadrage = window.requestAnimationFrame(() => {
        if (this.etat === 'retour') { this.jeton += 1; this.poser(false); return; }
        if (this.etat !== 'ouverture' && this.etat !== 'detail') return;
        const m = this.maison();
        this.mur.style.width = m.width + 'px';
        this.mur.style.height = m.height + 'px';
        const c = this.cible(this.actif);
        this.placer(c.x, c.y, c.s, 0);
        if (this.etat === 'ouverture') {
          this.jeton += 1;
          this.etat = 'detail';
          if (this.fiches[this.actif]) this.fiches[this.actif].classList.add('est-visible');
        }
      });
    }

    /* ---------- Clavier : Échap referme, Tab reste dans le dialogue ---------- */
    clavier(e) {
      if (this.etat === 'galerie') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.loupe && !this.loupe.hidden) {
          this.fermerLoupe();
          // theme.js relâche tous les verrous de défilement à chaque Échap : la fiche est encore ouverte, on le reprend
          window.setTimeout(() => { if (this.etat !== 'galerie' && window.BG && window.BG.scrollLock) window.BG.scrollLock.acquire('vitrine'); }, 90);
        } else this.fermer();
        return;
      }
      if (e.key !== 'Tab') return;
      const zone = this.loupe && !this.loupe.hidden ? this.loupe : this.panneau;
      const liste = Array.from(zone.querySelectorAll(FOCUSABLES)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!liste.length) { e.preventDefault(); return; }
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      const ici = document.activeElement;
      if (!zone.contains(ici)) { e.preventDefault(); premier.focus(); return; }
      if (e.shiftKey && (ici === premier || !liste.includes(ici))) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && ici === dernier) { e.preventDefault(); premier.focus(); }
    }

    /* ---------- Gros plan : les photos d'origine ---------- */
    photos(i) {
      const f = this.fiches[i];
      return f && f.dataset.photos ? f.dataset.photos.split('|').filter(Boolean) : [];
    }

    precharger(i) {
      if (!this.charge) this.charge = new Set();
      if (this.charge.has(i)) return;
      this.charge.add(i);
      // la niche vue de près : on passe à la bande agrandie, mais seulement une fois qu'elle est chargée et décodée
      // (changer l'adresse d'un coup laisserait la niche noire le temps d'une image)
      const bande = this.niches[i] && this.niches[i].querySelector('.vitrine__image img');
      const grande = bande && bande.dataset.grande;
      if (grande && !(bande.currentSrc || '').includes(grande.split('?')[0].split('/').pop())) {
        const reserve = new Image();
        const poser = () => {
          if (!this.pret || !bande.isConnected) return;
          bande.decoding = 'sync';
          bande.removeAttribute('srcset');
          bande.removeAttribute('sizes');
          bande.src = grande;
        };
        reserve.src = grande;
        if (reserve.decode) reserve.decode().then(poser).catch(() => {});
        else reserve.onload = poser;
      }
      const premiere = this.photos(i)[0];
      if (!premiere) return;
      const image = new Image();
      image.decoding = 'async';
      image.src = premiere;
    }

    ouvrirLoupe(bouton) {
      if (!this.loupe || (this.etat !== 'detail' && this.etat !== 'ouverture')) return;
      const adresses = this.photos(this.actif);
      if (!adresses.length) return;
      const titre = this.fiches[this.actif].querySelector('[data-vitrine-titre]');
      const nom = titre ? titre.textContent.trim() : '';
      this.piste.textContent = '';
      adresses.forEach((adresse, k) => {
        const vue = document.createElement('figure');
        vue.className = 'vitrine__loupe-vue';
        const image = document.createElement('img');
        image.alt = nom ? `${nom} (${k + 1})` : '';
        image.decoding = 'async';
        image.src = adresse;
        vue.appendChild(image);
        this.piste.appendChild(vue);
      });
      this.retourLoupe = bouton || null;
      if (this.enveloppe) this.enveloppe.classList.add('vitrine-loupe');
      this.loupe.hidden = false;
      this.piste.scrollLeft = 0;
      void this.loupe.offsetWidth;
      this.loupe.classList.add('est-visible');
      this.compter();
      const fermer = this.loupe.querySelector('[data-vitrine-loupe-fermer]');
      if (fermer) fermer.focus({ preventScroll: true });
    }

    fermerLoupe(sansFocus) {
      if (!this.loupe || this.loupe.hidden) return;
      this.loupe.classList.remove('est-visible');
      this.loupe.hidden = true;
      this.piste.textContent = '';
      if (this.enveloppe) this.enveloppe.classList.remove('vitrine-loupe');
      if (!sansFocus && this.retourLoupe) this.retourLoupe.focus({ preventScroll: true });
    }

    compter() {
      if (!this.compte || !this.piste) return;
      const n = this.piste.children.length;
      const defile = this.piste.scrollWidth > this.piste.clientWidth + 4;
      if (n < 2 || !defile) { this.compte.hidden = true; return; }
      const k = Math.min(n, Math.round(Math.abs(this.piste.scrollLeft) / Math.max(1, this.piste.clientWidth)) + 1);
      this.compte.hidden = false;
      this.compte.textContent = `${k} / ${n}`;
    }

    /* un clic ou un toucher sur la photo l'agrandit deux fois, autour du point visé ; un second revient */
    agrandir(e) {
      const vue = e.target.closest ? e.target.closest('.vitrine__loupe-vue') : null;
      if (!vue) return;
      const image = vue.querySelector('img');
      if (!image) return;
      if (vue.classList.contains('est-agrandie')) { vue.classList.remove('est-agrandie'); vue.scrollTo(0, 0); return; }
      const r = image.getBoundingClientRect();
      const fx = r.width ? (e.clientX - r.left) / r.width : 0.5;
      const fy = r.height ? (e.clientY - r.top) / r.height : 0.5;
      vue.classList.add('est-agrandie');
      const cadre = vue.getBoundingClientRect();
      vue.scrollTo(image.offsetWidth * fx - cadre.width / 2, image.offsetHeight * fy - cadre.height / 2);
    }

    /* ---------- Reflet : la lumière suit le pointeur sur la niche survolée (souris seulement) ---------- */
    reflet(i, e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (this.etat !== 'galerie') return;
      this.pointeur = { i, x: e.clientX, y: e.clientY };
      if (this.imageReflet) return;
      this.imageReflet = window.requestAnimationFrame(() => {
        this.imageReflet = 0;
        const p = this.pointeur;
        const niche = this.niches[p.i];
        if (!niche) return;
        const r = niche.getBoundingClientRect();
        niche.style.setProperty('--px', (p.x - r.left).toFixed(1) + 'px');
        niche.style.setProperty('--py', (p.y - r.top).toFixed(1) + 'px');
      });
    }

    /* ---------- En-tête du site : clair sur la pierre tant qu'il est posé sur la vitrine ---------- */
    surveillerEntete(toutDeSuite) {
      if (!this.entete) return;
      const mesurer = () => {
        this.imageEntete = 0;
        // fiche ouverte : l'en-tête reste clair sur le noir, où que soit la page (rotation comprise)
        if (this.etat !== 'galerie') { this.entete.classList.add('is-sur-vitrine'); return; }
        const h = this.entete.offsetHeight || 60;
        const r = this.scene.getBoundingClientRect();
        this.entete.classList.toggle('is-sur-vitrine', r.top <= h + 1 && r.bottom > h);
      };
      if (toutDeSuite) { mesurer(); return; }
      if (this.imageEntete) return;
      this.imageEntete = window.requestAnimationFrame(mesurer);
    }
  }

  window.customElements.define('vitrine-colliers', VitrineColliers);
})();
