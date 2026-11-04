/* Breslev Gang — Trouve ta flamme (sections/main-trouve-ta-flamme.liquid).
   Trois questions, puis 3 à 6 vraies pièces du catalogue, choisies par les règles de assets/trouve-ta-flamme-regles.json
   (lisibles par la marque, voir « lisez_moi » dans ce fichier). Aucune donnée inventée : nom, prix, couleur, univers,
   catégorie et photo viennent de Shopify (JSON posé par la section).

   MOTEUR (window.TTFMoteur, fonctions pures, testables hors du navigateur)
     preparer(produits)                    → une « pièce » par variante, dans l'ordre du catalogue
     suite(regles, pieces, reponses)       → prochaine question et ses réponses possibles, ou null (résultat)
                                             (réponse proposée seulement si elle donne assez de pièces ;
                                              une seule réponse possible : choisie seule, question non posée)
     resultat(regles, pieces, reponses)    → { pieces, retires } : 3 à 6 pièces, critères retirés s'il le fallait

   ADRESSE : ?pour=…&sens=…&style=… (une entrée d'historique par réponse, le bouton retour du navigateur marche) :
   le lien partagé redonne le même résultat. Ajout au panier : bouton [data-add-to-cart] lu par assets/cart.js. */
(() => {
  'use strict';

  /* ================= Moteur ================= */
  // Comparaisons sans accents ni majuscules, en mots entiers (« or » ne trouve pas « orange »).
  const norm = (s) => ` ${String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const contient = (texte, mots) => {
    const t = norm(texte);
    return (mots || []).some((m) => { const n = norm(m).trim(); return n !== '' && t.indexOf(` ${n} `) !== -1; });
  };
  const egal = (liste, valeur) => (liste || []).some((x) => norm(x) === norm(valeur));

  function preparer(produits) {
    const pieces = [];
    (produits || []).forEach((p, rang) => {
      (p.v || []).forEach((v, k) => {
        // « t » (titre de la variante) n'est posé que s'il diffère de la couleur ; « i » que si la photo diffère de celle du produit
        pieces.push({ rang, k, produit: p, variante: v, titre: v.t !== undefined ? v.t : (v.c || ''), couleur: p.ci >= 0 ? (v.c || '') : '', image: v.i || p.i || '' });
      });
    });
    return pieces;
  }

  function verifie(piece, cond) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.length === 0 || cond.some((c) => verifie(piece, c));
    const p = piece.produit;
    const v = piece.variante;
    return Object.keys(cond).every((cle) => {
      const val = cond[cle];
      switch (cle) {
        case 'categories': return egal(val, p.c);
        case 'univers': return egal(val, p.u);
        case 'titre_contient': return contient(p.t, val);
        case 'couleur_contient': {
          let c = norm(piece.couleur);
          (cond.couleur_ignorer || []).forEach((e) => { c = c.split(norm(e)).join(' '); });
          return contient(c, val);
        }
        case 'sans_option': return !(p.o || []).some((o) => egal(val, o));
        case 'prix_min': return v.pc / 100 >= Number(val);
        case 'prix_max': return v.pc / 100 <= Number(val);
        case 'disponible': return !!v.d === !!val;
        case 'photo': return !!piece.image === !!val;
        default: return true;   // couleur_ignorer, clés inconnues : sans effet
      }
    });
  }
  const passe = (piece, reponse) => verifie(piece, reponse.garder) && !(reponse.exclure && verifie(piece, reponse.exclure));

  function trier(liste, ordre) {
    const l = liste.slice();
    const rang = (a, b) => a.rang - b.rang || a.k - b.k;
    if (ordre === 'prix_croissant') l.sort((a, b) => a.variante.pc - b.variante.pc || rang(a, b));
    else if (ordre === 'prix_decroissant') l.sort((a, b) => b.variante.pc - a.variante.pc || rang(a, b));
    else l.sort(rang);
    return l;
  }

  // « Grey 2 » et « Grey » d'un même modèle : la même couleur (Shopify numérote les homonymes), une seule est montrée
  const sansNumero = (c) => String(c || '').trim().replace(/^(.+\S)\s+[1-9]$/, '$1');
  const cleCouleur = (x) => (x.couleur ? `${x.produit.id}|${norm(sansNumero(x.couleur))}` : '');

  // dans l'ordre, au plus parModele variantes d'un même modèle (couleurs différentes), jusqu'à max pièces,
  // en gardant celles déjà prises
  function choisir(liste, parModele, max, deja) {
    const pris = (deja || []).slice();
    const compte = new Map();
    const couleurs = new Set();
    pris.forEach((x) => { compte.set(x.produit.id, (compte.get(x.produit.id) || 0) + 1); couleurs.add(cleCouleur(x)); });
    for (const x of liste) {
      if (pris.length >= max) break;
      if (pris.indexOf(x) !== -1) continue;
      const n = compte.get(x.produit.id) || 0;
      if (n >= parModele) continue;
      const cle = cleCouleur(x);
      if (cle && couleurs.has(cle)) continue;
      pris.push(x);
      compte.set(x.produit.id, n + 1);
      if (cle) couleurs.add(cle);
    }
    return pris;
  }

  const reglage = (regles) => ({
    min: (regles.nombre && regles.nombre.minimum) || 3,
    max: (regles.nombre && regles.nombre.maximum) || 6,
    un: regles.par_modele || 1,
    plus: regles.par_modele_si_trop_peu || regles.par_modele || 1
  });

  function actives(regles, reponses) {
    return (regles.questions || [])
      .map((q) => ({ q, r: (q.reponses || []).find((r) => r.id === reponses[q.id]) }))
      .filter((x) => x.r);
  }

  function filtrer(regles, pieces, reponses, sauf) {
    const liste = actives(regles, reponses).filter(({ q }) => !(sauf || []).includes(q.id));
    return trier(pieces.filter((p) => verifie(p, regles.toujours) && liste.every(({ r }) => passe(p, r))), regles.ordre);
  }

  // combien de pièces ces réponses peuvent donner, sans rien retirer
  function compter(regles, pieces, reponses) {
    const g = reglage(regles);
    return choisir(filtrer(regles, pieces, reponses), g.plus, g.max).length;
  }

  function suite(regles, pieces, reponses) {
    const r = Object.assign({}, reponses);
    const auto = [];
    const seuil = regles.reponse_visible_si_au_moins || reglage(regles).min;
    for (const q of regles.questions || []) {
      if (r[q.id] !== undefined) continue;
      const comptes = (q.reponses || []).map((rep) => ({ rep, n: compter(regles, pieces, Object.assign({}, r, { [q.id]: rep.id })) }));
      let visibles = comptes.filter((x) => x.n >= seuil).map((x) => x.rep);
      if (!visibles.length) visibles = comptes.filter((x) => x.n >= 1).map((x) => x.rep);
      if (!visibles.length) { r[q.id] = null; continue; }               // question sans objet
      if (visibles.length === 1) { r[q.id] = visibles[0].id; auto.push(q.id); continue; }
      return { question: q, visibles, reponses: r, auto };
    }
    return { question: null, visibles: [], reponses: r, auto };
  }

  function resultat(regles, pieces, reponses) {
    const g = reglage(regles);
    let liste = filtrer(regles, pieces, reponses);
    let sel = choisir(liste, g.un, g.max);
    if (sel.length < g.min) sel = choisir(liste, g.plus, g.max, sel);
    const retires = [];
    const repondues = actives(regles, reponses).map(({ q }) => q.id);
    for (const id of regles.assouplir || []) {
      if (sel.length >= g.min) break;
      if (!repondues.includes(id)) continue;
      retires.push(id);
      liste = filtrer(regles, pieces, reponses, retires);
      sel = choisir(liste, g.un, g.max, sel);
      if (sel.length < g.min) sel = choisir(liste, g.plus, g.max, sel);
    }
    return { pieces: sel, retires };
  }

  window.TTFMoteur = { norm, preparer, verifie, suite, resultat, compter };
  if (typeof document === 'undefined') return;

  /* ================= Page ================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactile = window.matchMedia('(pointer: coarse)').matches;
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  const propre = (t) => String(t || '').replace(EMOJI, '').replace(/ {2,}/g, ' ').trim();
  // « Grey 2 » → « Grey » : le chiffre que Shopify ajoute à deux couleurs homonymes (même règle que le snippet catalogue)
  const nomCouleur = (c) => sansNumero(propre(c));
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Adresse d'une photo : la seule fonction à brancher (même règle que assets/createur-petek.js).
     CDN Shopify : paramètres width (+ height et crop pour une vignette carrée). Photos détourées du banc et de la démo :
     /photos/1600|800|pastille/<nom>.webp. Sur la boutique : window.BGPhotosDetourees = { "<nom du fichier d'origine
     sans extension>": "<adresse détourée sur le CDN>" } remplace la photo d'origine. */
  const nomFichier = (src) => String(src || '').split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  function adresseImage(src, largeur, carre) {
    if (!src) return '';
    const table = window.BGPhotosDetourees;
    const base = (table && table[nomFichier(src)]) || src;
    const locale = String(base).match(/^(.*\/photos\/)(?:1600|800|pastille)\/([\w.-]+\.webp)$/);
    const chemin = locale ? `${locale[1]}${carre && largeur <= 240 ? 'pastille' : largeur <= 800 ? '800' : '1600'}/${locale[2]}` : base;
    try {
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
  // srcset sans doublon : les photos détourées n'existent qu'en deux tailles (640 et 1280 px de large)
  function srcsetDe(src, largeurs) {
    const vues = new Map();
    largeurs.forEach((w) => {
      const u = adresseImage(src, w);
      const reelle = /\/photos\/800\//.test(u) ? 640 : /\/photos\/1600\//.test(u) ? 1280 : w;
      if (!vues.has(u)) vues.set(u, reelle);
    });
    return Array.from(vues, ([u, w]) => `${esc(u)} ${w}w`).join(', ');
  }

  // photo introuvable : le cadre reste vide, jamais l'icône d'image cassée
  const surveiller = (img) => {
    const casse = () => img.classList.add('is-cassee');
    if (img.complete && img.getAttribute('src') && !img.naturalWidth) casse();
    img.addEventListener('error', casse);
  };

  class Parcours {
    constructor(root) {
      this.root = root;
      this.parcours = $('[data-ttf-parcours]', root);
      this.etape = $('[data-ttf-etape]', root);
      this.question = $('[data-ttf-question]', root);
      this.liste = $('[data-ttf-reponses]', root);
      this.resultatEl = $('[data-ttf-resultat]', root);
      this.titreResultat = $('[data-ttf-titre-resultat]', root);
      this.choix = $('[data-ttf-choix]', root);
      this.note = $('[data-ttf-note]', root);
      this.grille = $('[data-ttf-grille]', root);
      this.statut = $('[data-ttf-statut]', root);
      this.vide = $('[data-ttf-vide]', root);
      try {
        this.textes = JSON.parse($('[data-ttf-textes]', root).textContent);
        this.pieces = preparer(JSON.parse($('[data-ttf-pieces]', root).textContent));
      } catch (e) {
        this.echec();
        return;
      }
      this.etat = {};
      this.premier = true;
      this.lier();
      this.charger();
    }

    async charger() {
      try {
        const reponse = await fetch(this.root.dataset.url, { headers: { Accept: 'application/json' } });
        if (!reponse.ok) throw new Error(String(reponse.status));
        this.regles = this.avecLibelles(await reponse.json());
      } catch (e) {
        this.echec();
        return;
      }
      if (!this.pieces.some((p) => verifie(p, this.regles.toujours))) { this.echec(); return; }
      this.lireAdresse();
      this.afficher();
    }

    echec() {
      if (this.parcours) this.parcours.hidden = true;
      if (this.resultatEl) this.resultatEl.hidden = true;
      if (this.vide) this.vide.hidden = false;
    }

    // Les réponses « pour » et « style » prennent leur libellé dans l'éditeur de thème : vide = réponse masquée.
    // Les réponses « sens » affichent leur nom (nom de l'univers ou de la catégorie dans le catalogue).
    avecLibelles(regles) {
      const t = this.textes.questions || {};
      regles.questions = (regles.questions || []).map((q) => {
        const tq = t[q.id] || {};
        const reponses = (q.reponses || []).map((r) => Object.assign({}, r, { libelle: propre((tq.reponses || {})[r.id] || r.nom || '') }))
          .filter((r) => r.libelle);
        return Object.assign({}, q, { titre: tq.titre || '', reponses });
      }).filter((q) => q.reponses.length);
      return regles;
    }

    /* ---------- Adresse ---------- */
    lireAdresse() {
      const params = new URLSearchParams(window.location.search);
      let etat = {};
      for (;;) {
        const s = suite(this.regles, this.pieces, etat);
        etat = s.reponses;
        if (!s.question) break;
        const val = params.get(s.question.id);
        if (!val || !s.visibles.some((r) => r.id === val)) break;
        etat[s.question.id] = val;
      }
      this.etat = etat;
    }

    adresse(etat) {
      const url = new URL(window.location.href);
      (this.regles.questions || []).forEach((q) => url.searchParams.delete(q.id));
      (this.regles.questions || []).forEach((q) => { if (etat[q.id]) url.searchParams.set(q.id, etat[q.id]); });
      return url.toString();
    }

    aller(etat, mode) {
      this.etat = etat;
      const url = this.adresse(etat);
      if (mode === 'push') window.history.pushState({ ttf: true }, '', url);
      else if (url !== window.location.href) window.history.replaceState(window.history.state, '', url);
      this.afficher(true);
    }

    /* ---------- Liaisons ---------- */
    lier() {
      this.root.addEventListener('click', (event) => {
        const bouton = event.target.closest('[data-ttf-reponse]');
        if (bouton && this.courante) {
          this.repondre(bouton);
          return;
        }
        if (event.target.closest('[data-ttf-retour]')) { this.retour(); return; }
        if (event.target.closest('[data-ttf-recommencer]')) { this.aller({}, 'push'); return; }
        if (event.target.closest('[data-ttf-partager]')) this.partager();
      });
      window.addEventListener('popstate', () => {
        if (!this.regles) return;
        this.lireAdresse();
        this.afficher(true);
      });
    }

    repondre(bouton) {
      if (this.occupe) return;
      this.occupe = true;
      $$('[data-ttf-reponse]', this.liste).forEach((b) => b.setAttribute('aria-pressed', b === bouton ? 'true' : 'false'));
      bouton.classList.add('is-choisie');
      const etat = Object.assign({}, this.etat, { [this.courante.id]: bouton.dataset.ttfReponse });
      // le choix se voit un instant (filet sous la réponse), puis la question suivante arrive
      setTimeout(() => { this.occupe = false; this.aller(etat, 'push'); }, reduit ? 0 : 260);
    }

    // Retour : la question précédente vraiment posée (les réponses choisies seules sont sautées).
    retour() {
      if (window.history.state && window.history.state.ttf) { window.history.back(); return; }
      const posees = (this.regles.questions || []).map((q) => q.id).filter((id) => this.etat[id] && !(this.auto || []).includes(id));
      const derniere = posees[posees.length - 1];
      if (!derniere) return;
      const etat = {};
      for (const q of this.regles.questions) {
        if (q.id === derniere) break;
        if (this.etat[q.id] !== undefined) etat[q.id] = this.etat[q.id];
      }
      this.aller(etat, 'replace');
    }

    /* ---------- Affichage ---------- */
    afficher(anime) {
      const s = suite(this.regles, this.pieces, this.etat);
      this.etat = s.reponses;
      this.auto = s.auto;
      // une réponse choisie seule (une seule possible) entre aussi dans l'adresse, sans nouvelle entrée d'historique
      const url = this.adresse(this.etat);
      if (url !== window.location.href) window.history.replaceState(window.history.state, '', url);
      const premiere = this.premier;
      this.premier = false;
      const changer = () => {
        if (s.question) this.montrerQuestion(s);
        else this.montrerResultat();
        if (!premiere) this.focus(s.question ? this.question : this.titreResultat);
      };
      if (!anime || reduit || premiere) { changer(); return; }
      const actif = this.resultatEl.hidden ? this.parcours : this.resultatEl;
      actif.classList.add('is-sortie');
      clearTimeout(this.minuteur);
      this.minuteur = setTimeout(() => { actif.classList.remove('is-sortie'); changer(); }, 180);
    }

    focus(el) {
      if (!el) return;
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      const haut = el.closest('[data-ttf-parcours], [data-ttf-resultat]') || el;
      const r = haut.getBoundingClientRect();
      const entete = (document.querySelector('[data-header]') || { offsetHeight: 0 }).offsetHeight;
      if (r.top < entete || r.top > window.innerHeight * 0.6) {
        window.scrollTo({ top: window.scrollY + r.top - entete - 24, behavior: reduit ? 'auto' : 'smooth' });
      }
    }

    entrer(el) {
      if (reduit) return;
      el.classList.remove('is-entree');
      void el.offsetWidth;
      el.classList.add('is-entree');
    }

    montrerQuestion(s) {
      const q = s.question;
      this.courante = q;
      const qs = this.regles.questions;
      const n = qs.indexOf(q) + 1;
      const pad = (x) => String(x).padStart(2, '0');
      this.etape.textContent = (this.textes.etape || '').replace('[n]', pad(n)).replace('[total]', pad(qs.length));
      this.question.textContent = q.titre;
      // vignette de chaque réponse : une vraie pièce qu'elle donnerait (une pièce différente par réponse)
      const vues = new Set();
      this.liste.innerHTML = s.visibles.map((r, i) => {
        const res = resultat(this.regles, this.pieces, Object.assign({}, this.etat, { [q.id]: r.id })).pieces;
        const piece = res.find((x) => !vues.has(x.produit.id)) || res[0];
        if (piece) vues.add(piece.produit.id);
        const img = piece && piece.image
          ? `<span class="ttf__vignette"><img src="${esc(adresseImage(piece.image, 240, true))}" alt="" width="56" height="56" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async"></span>`
          : '';
        const presse = this.etat[q.id] === r.id;
        return `<li class="ttf__item" style="--i:${i}"><button type="button" class="ttf__reponse" data-ttf-reponse="${esc(r.id)}" aria-pressed="${presse ? 'true' : 'false'}"><span class="ttf__texte">${esc(r.libelle)}</span>${img}</button></li>`;
      }).join('');
      $$('img', this.liste).forEach(surveiller);
      this.parcours.hidden = false;
      this.resultatEl.hidden = true;
      $$('[data-ttf-retour]', this.parcours).forEach((b) => { b.hidden = !Object.keys(this.etat).some((id) => this.etat[id] && !(this.auto || []).includes(id)); });
      this.entrer(this.parcours);
    }

    lienFiche(handle, varianteId) {
      const exemple = this.root.dataset.urlFiche || '';
      const h = this.root.dataset.handleFiche || '';
      let base = `/products/${handle}`;
      const i = h ? exemple.lastIndexOf(h) : -1;
      if (i !== -1) base = exemple.slice(0, i) + handle + exemple.slice(i + h.length);
      return varianteId ? `${base}${base.indexOf('?') === -1 ? '?' : '&'}variant=${varianteId}` : base;
    }

    montrerResultat() {
      this.courante = null;
      const res = resultat(this.regles, this.pieces, this.etat);
      const qs = this.regles.questions;
      const libelle = (id) => {
        const q = qs.find((x) => x.id === id);
        const r = q && q.reponses.find((x) => x.id === this.etat[id]);
        return r ? r.libelle : '';
      };
      this.choix.innerHTML = qs.filter((q) => this.etat[q.id])
        .map((q) => `<span class="ttf__critere${res.retires.includes(q.id) ? ' is-retire' : ''}">${esc(libelle(q.id))}</span>`).join('');
      if (res.retires.length && this.textes.assoupli) {
        this.note.textContent = this.textes.assoupli.replace('[criteres]', res.retires.map(libelle).filter(Boolean).join(', '));
        this.note.hidden = false;
      } else this.note.hidden = true;

      this.grille.innerHTML = res.pieces.map((x, i) => this.carte(x, i)).join('');
      $$('img', this.grille).forEach(surveiller);
      this.parcours.hidden = true;
      this.resultatEl.hidden = !res.pieces.length;
      if (this.vide) this.vide.hidden = !!res.pieces.length;
      if (this.statut) this.statut.textContent = '';
      this.entrer(this.resultatEl);
    }

    carte(x, i) {
      const p = x.produit;
      const v = x.variante;
      const nom = propre(p.t);
      const couleur = p.ci >= 0 ? nomCouleur(x.couleur) : '';
      const ligne = [couleur, v.p, propre(p.u || p.c)].filter(Boolean).map(esc).join('<span class="ttf__sep" aria-hidden="true"> · </span>');
      const parDefaut = x.titre === 'Default Title';
      const url = this.lienFiche(p.h, p.v.length > 1 || !parDefaut ? v.id : 0);
      const src = adresseImage(x.image, 640);
      const srcset = srcsetDe(x.image, [360, 480, 640, 900]);
      const alt = [nom, couleur].filter(Boolean).join(' — ');
      const ajout = !p.tl && v.d && this.textes.ajouter
        ? `<button type="button" class="link-btn ttf__ajout" data-add-to-cart data-variant-id="${v.id}" data-name="${esc(nom)}" data-variant="${esc(parDefaut ? '' : propre(x.titre))}" data-price="${v.pc}" data-image="${esc(adresseImage(x.image, 600))}" data-url="${esc(url)}" data-product-id="${p.id}" data-product-type="${esc(p.ty || '')}" aria-label="${esc(`${this.textes.ajouter} : ${alt}`)}">${esc(this.textes.ajouter)}</button>`
        : '';
      return `<li class="card ttf__carte" style="--i:${i}">
        <a class="card__link" href="${esc(url)}">
          <div class="card__media media media--square"><img src="${esc(src)}" srcset="${srcset}" sizes="(min-width: 750px) 30vw, 50vw" alt="${esc(alt)}" width="640" height="640" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async"></div>
          <h3 class="card__name">${esc(nom)}</h3>
          <p class="card__price ttf__ligne">${ligne}</p>
        </a>
        ${ajout}
      </li>`;
    }

    async partager() {
      const url = window.location.href;
      const dire = (texte) => {
        if (!this.statut) return;
        this.statut.textContent = '';
        window.setTimeout(() => { this.statut.textContent = texte; }, 30);
      };
      if (tactile && navigator.share) {
        try { await navigator.share({ url, title: document.title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      let copie = false;
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); copie = true; }
      } catch (e) { copie = false; }
      if (!copie) {
        const zone = document.createElement('textarea');
        zone.value = url;
        zone.setAttribute('readonly', '');
        zone.style.position = 'fixed';
        zone.style.opacity = '0';
        document.body.appendChild(zone);
        zone.select();
        try { copie = document.execCommand('copy'); } catch (e) { copie = false; }
        zone.remove();
      }
      dire(copie ? this.textes.copie : url);
    }
  }

  function init() {
    $$('[data-ttf]').forEach((root) => { if (!root.parcoursTTF) root.parcoursTTF = new Parcours(root); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
