/* Breslev Gang — catalogue : recherche, tri, filtres et « Voir plus » sur la collection (initDecouverte).
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
    // 7 novembre : le survol n'est qu'un aperçu de la photo ; le lien et l'ajout gardent la pastille choisie (clic, clavier)
    if (!persist) return;
    if (link && swatch.dataset.url) link.href = swatch.dataset.url;
    if (add) {
      if (swatch.dataset.variantId) add.dataset.variantId = swatch.dataset.variantId;
      if (swatch.dataset.variant) add.dataset.variant = swatch.dataset.variant;
      if (swatch.dataset.price) add.dataset.price = swatch.dataset.price;
      if (src) add.dataset.image = sized(src, 600);
      if (swatch.dataset.url) add.dataset.url = swatch.dataset.url;
      add.disabled = swatch.dataset.available === 'false';
    }
    card.dataset.chosen = swatch.dataset.variantId || swatch.dataset.url || '';
    $$('[data-card-swatch]', card).forEach((b) => b.classList.toggle('is-active', b === swatch));
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

  /* ---------- Découverte du catalogue (8 novembre) ----------
     Section main-collection : toutes les pièces de la vue sont dans la page ; chaque carte porte data-prix (centimes),
     data-dispo, data-texte, data-couleurs, data-tailles, data-matiere, data-longueur (product-card, donnees: true).
     Recherche insensible aux accents, tri par prix, filtres, « Voir plus » : sans requête, l'état vit dans l'adresse
     (?q=, tri=, prix=, couleur=, dispo=, taille=, matiere=, longueur=, n=). Catégorie et univers restent des adresses
     Shopify (/collections/all/cat-colliers+univers-flamme) ; leurs liens emportent la recherche et les filtres. */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, ' ').trim();
  // Familles de couleurs : regroupent les noms d'options de la marque (« Full black », « Noir pierre lave » : Noir).
  // « Silver » et « Argent » sont une couleur : la famille s'appelle « Couleur argent », jamais une matière.
  const FAMILLES = [
    ['noir', /\b(black|noir|noire)\b/], ['blanc', /\b(white|blanc|blanche|cream|creme|milk|nacre)\b/],
    ['gris', /\b(grey|gray|gris|smoke)\b/], ['dore', /\b(gold|or|dore|doree|champagne)\b/],
    ['argente', /\b(silver|argent|argente|argentee)\b/], ['rose', /\b(pink|rose|barbie)\b/],
    ['violet', /\b(purple|violet|violette|amethyste)\b/], ['bleu', /\b(blue|bleu|bleue|navy|ocean|denim)\b/],
    ['vert', /\b(green|vert|verte)\b/], ['rouge', /\b(red|rouge|bordeaux|burgundy|wine)\b/],
    ['camel', /\b(camel|marron|beige|mocha|brown)\b/], ['multicolore', /\b(multicolor|multicolore|multi|colore)\b/]
  ];
  const TAILLES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl'];

  function initDecouverte(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    const grid = $('[data-catalogue-grid]', root);
    if (!grid) return;
    let conf = {};
    try { conf = JSON.parse(($('[data-catalogue-config]', root) || {}).textContent || '{}'); } catch (e) { conf = {}; }
    const t = Object.assign({ familles: {} }, conf.t || {});
    const pas = Math.max(1, Number(root.dataset.pas) || 24);
    const liste = (v) => (v ? v.split('|').map((x) => x.trim()).filter(Boolean) : []);
    const items = $$('[data-card]', grid).map((el, ordre) => {
      const couleurs = liste(el.dataset.couleurs);
      const familles = FAMILLES.filter(([, re]) => couleurs.some((c) => re.test(norm(c)))).map(([k]) => k);
      const nom = $('.card__name', el);
      return {
        el, ordre, prix: Number(el.dataset.prix) || 0, dispo: el.dataset.dispo !== '0', couleurs, familles,
        tailles: liste(el.dataset.tailles), matiere: liste(el.dataset.matiere), longueur: liste(el.dataset.longueur),
        texte: norm(`${el.dataset.texte || (nom ? nom.textContent : '')} ${familles.map((f) => t.familles[f] || '').join(' ')}`)
      };
    });
    // Adresse de la pagination Shopify (?page=2, sans JavaScript) : tout est déjà sur la première page.
    const depart = new URLSearchParams(window.location.search);
    if (!items.length && Number(depart.get('page')) > 1) {
      const u = new URL(window.location.href);
      u.searchParams.delete('page');
      window.location.replace(u.toString());
      return;
    }
    items.forEach((it) => it.el.removeAttribute('data-surplus'));

    // Tranches de prix : montants du réglage (euros), convertis dans la devise du client.
    const taux = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) || 1;
    const centimes = (euros) => Math.round(euros * taux) * 100;
    const montant = (euros) => (window.BG && window.BG.formatMoney ? window.BG.formatMoney(centimes(euros)) : String(euros));
    const seuils = String(conf.seuils || '').split(',').map((x) => Number(x.trim())).filter((x) => x > 0).sort((a, b) => a - b);
    const tranches = [0, ...seuils].map((lo, i) => {
      const hi = i < seuils.length ? seuils[i] : Infinity;
      const label = !lo ? (t.prix_moins || '[a]').replace('[a]', montant(hi))
        : hi === Infinity ? (t.prix_plus || '[a]').replace('[a]', montant(lo))
          : (t.prix_entre || '[a] [b]').replace('[a]', montant(lo)).replace('[b]', montant(hi));
      return { id: `${lo}-${hi === Infinity ? 'plus' : hi}`, label, lo: centimes(lo), hi: hi === Infinity ? Infinity : centimes(hi) };
    });
    const valeursDe = (cle, ordre) => {
      const vus = new Map();
      items.forEach((it) => it[cle].forEach((v) => { const k = norm(v); if (k && !vus.has(k)) vus.set(k, v); }));
      const out = [...vus.entries()].map(([id, label]) => ({ id: id.replace(/ /g, '-'), label }));
      return out.sort(ordre || ((a, b) => a.label.localeCompare(b.label, 'fr')));
    };
    const rang = (v) => { const i = TAILLES.indexOf(v.id); return i < 0 ? 99 : i; };
    const egal = (v) => (x) => norm(x).replace(/ /g, '-') === v;
    const avecCouleur = items.filter((it) => it.couleurs.length).length;
    const facettes = [
      // tranches fermées en haut : « de 80 € à 100 € » contient 100 €, « jusqu'à 80 € » contient 80 €
      { cle: 'prix', titre: t.prix, valeurs: tranches, test: (it, v) => tranches.some((x) => x.id === v && (x.lo ? it.prix > x.lo : it.prix >= 0) && it.prix <= x.hi) },
      // Couleur : seulement là où au moins la moitié des pièces ont une option Couleur ; ailleurs, le filtre
      // écarterait des pièces d'une seule couleur, dont la couleur n'est pas une donnée.
      { cle: 'couleur', titre: t.couleur, valeurs: avecCouleur * 2 >= items.length ? FAMILLES.map(([k]) => ({ id: k, label: t.familles[k] || k })) : [], test: (it, v) => it.familles.includes(v) },
      { cle: 'dispo', titre: t.dispo, bascule: true, valeurs: [{ id: '1', label: t.dispo_oui }], test: (it) => it.dispo },
      { cle: 'taille', titre: t.taille, valeurs: valeursDe('tailles', (a, b) => rang(a) - rang(b) || a.label.localeCompare(b.label, 'fr')), test: (it, v) => it.tailles.some(egal(v)) },
      { cle: 'matiere', titre: t.matiere, valeurs: valeursDe('matiere'), test: (it, v) => it.matiere.some(egal(v)) },
      { cle: 'longueur', titre: t.longueur, valeurs: valeursDe('longueur'), test: (it, v) => it.longueur.some(egal(v)) }
    ].map((f) => Object.assign(f, { valeurs: f.valeurs.filter((v) => items.some((it) => f.test(it, v.id))) }))
      .filter((f) => (f.bascule ? items.some((it) => !f.test(it, '1')) : f.valeurs.length > 1));

    const etat = { q: '', tri: '', n: pas };
    const TRIS = ['prix-croissant', 'prix-decroissant'];
    const lire = () => {
      const p = new URLSearchParams(window.location.search);
      etat.q = (p.get('q') || '').trim().slice(0, 80);
      etat.tri = TRIS.includes(p.get('tri')) ? p.get('tri') : '';
      facettes.forEach((f) => {
        const ok = f.valeurs.map((v) => v.id);
        etat[f.cle] = [...new Set((p.get(f.cle) || '').split(',').map((x) => x.trim()).filter((x) => ok.includes(x)))];
      });
      etat.n = Math.max(pas, Math.min(5000, Number(p.get('n')) || pas));
    };
    const parametres = (avecN) => {
      const p = new URLSearchParams();
      if (etat.q) p.set('q', etat.q);
      if (etat.tri) p.set('tri', etat.tri);
      facettes.forEach((f) => { if (etat[f.cle].length) p.set(f.cle, etat[f.cle].join(',')); });
      if (avecN && etat.n > pas) p.set('n', etat.n);
      return p;
    };
    const CLES = ['q', 'tri', 'n', 'prix', 'couleur', 'dispo', 'taille', 'matiere', 'longueur'];
    const ecrire = (pousser) => {
      const url = new URL(window.location.href);
      CLES.forEach((k) => url.searchParams.delete(k));
      parametres(true).forEach((v, k) => url.searchParams.set(k, v));
      if (url.toString() === window.location.href) return;
      try { window.history[pousser ? 'pushState' : 'replaceState'](window.history.state, '', url.toString()); } catch (e) { /* adresse inchangée */ }
    };

    // ---- interface : tri et filtres dans le panneau, pastilles, compte, résultat vide, « Voir plus »
    const boite = $('[data-facettes]', root);
    const groupe = (cle, titre, valeurs, compte) => {
      const row = document.createElement('div');
      row.className = 'filters__row filters__row--facette';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', titre || cle);
      const leg = document.createElement('p');
      leg.className = 'filters__legende';
      leg.setAttribute('aria-hidden', 'true');
      leg.textContent = titre || cle;
      row.appendChild(leg);
      valeurs.forEach((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'filter';
        b.dataset.facette = cle;
        b.dataset.valeur = v.id;
        b.setAttribute('aria-pressed', 'false');
        const s = document.createElement('span');
        s.textContent = v.label;
        b.appendChild(s);
        if (compte) {
          const nb = document.createElement('span');
          nb.className = 'filter__nb';
          b.appendChild(nb);
        }
        row.appendChild(b);
      });
      boite.appendChild(row);
    };
    if (boite) {
      boite.textContent = '';
      groupe('tri', t.tri, [{ id: '', label: t.tri_defaut }, { id: TRIS[0], label: t.tri_croissant }, { id: TRIS[1], label: t.tri_decroissant }], false);
      facettes.forEach((f) => groupe(f.cle, f.titre, f.valeurs, true));
    }
    const champ = $('[data-recherche]', root);
    const effacer = $('[data-recherche-effacer]', root);
    const nb = $('[data-nb]', root);
    const actifs = $('[data-actifs]', root);
    const pastilles = $('[data-pastilles]', root);
    const point = $('[data-filter-dot]', root);
    const voirRes = $('[data-voir-resultats]', root);
    const vide = $('[data-vide]', root);
    const videTitre = $('[data-vide-titre]', root);
    const plus = $('[data-catalogue-more]', root);
    const motsDe = (q) => norm(q).split(' ').filter(Boolean);
    const passe = (it, sauf, mots) => (!mots.length || mots.every((w) => it.texte.includes(w)))
      && facettes.every((f) => f.cle === sauf || !etat[f.cle].length || etat[f.cle].some((v) => f.test(it, v)));
    // en français, 0 et 1 prennent le singulier (« 0 pièce »), comme le pluriel de Shopify
    const singulier = (n) => n === 1 || (n === 0 && /^fr/i.test(document.documentElement.lang || ''));
    const compte = (n, un, autre) => ((singulier(n) ? un : autre) || '[n]').replace('[n]', n);
    const pastille = (cle, valeur, label) => {
      const li = document.createElement('li');
      li.dataset.client = '';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pastille-filtre';
      b.dataset.retirer = cle;
      b.dataset.valeur = valeur;
      b.setAttribute('aria-label', (t.retirer || '[x]').replace('[x]', label));
      b.textContent = label;
      const x = document.createElement('span');
      x.className = 'pastille-filtre__x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      b.appendChild(x);
      li.appendChild(b);
      pastilles.appendChild(li);
    };

    const appliquer = () => {
      const mots = motsDe(etat.q);
      const ok = items.filter((it) => passe(it, null, mots));
      ok.sort((a, b) => (etat.tri === TRIS[0] ? a.prix - b.prix : etat.tri === TRIS[1] ? b.prix - a.prix : 0) || a.ordre - b.ordre);
      const retenus = new Set(ok);
      const suite = ok.concat(items.filter((it) => !retenus.has(it)));
      if (suite.some((it, i) => grid.children[i] !== it.el)) suite.forEach((it) => grid.appendChild(it.el));
      ok.forEach((it, i) => { it.el.hidden = i >= etat.n; });
      items.forEach((it) => { if (!retenus.has(it)) it.el.hidden = true; });

      if (nb) nb.textContent = compte(ok.length, t.un, t.plus);
      if (voirRes) voirRes.textContent = compte(ok.length, t.voir_un, t.voir_plus);
      if (plus) plus.hidden = ok.length <= etat.n;
      if (vide) vide.hidden = ok.length > 0;
      if (videTitre) videTitre.textContent = ok.length ? '' : (etat.q ? (t.vide_recherche || '[q]').replace('[q]', etat.q) : t.vide || '');
      if (champ && document.activeElement !== champ && champ.value !== etat.q) champ.value = etat.q;
      if (effacer) effacer.hidden = !(champ && champ.value);

      // boutons : état pressé et nombre de pièces qu'ils donneraient (les autres filtres appliqués)
      $$('[data-facette]', root).forEach((b) => {
        const cle = b.dataset.facette;
        const v = b.dataset.valeur;
        const f = facettes.find((x) => x.cle === cle);
        const on = cle === 'tri' ? etat.tri === v : etat[cle].includes(v);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (!f) return;
        const n = items.filter((it) => passe(it, cle, mots) && f.test(it, v)).length;
        const s = $('.filter__nb', b);
        if (s) s.textContent = n;
        b.disabled = !n && !on;
      });

      // pastilles des filtres actifs (catégorie et univers : liens rendus par Shopify, déjà en place)
      if (pastilles) {
        $$('[data-client]', pastilles).forEach((li) => li.remove());
        if (etat.q) pastille('q', '', (t.recherche || '[q]').replace('[q]', etat.q));
        facettes.forEach((f) => etat[f.cle].forEach((v) => {
          const val = f.valeurs.find((x) => x.id === v);
          if (val) pastille(f.cle, v, val.label);
        }));
      }
      const client = !!etat.q || facettes.some((f) => etat[f.cle].length);
      const serveur = pastilles ? $$('li:not([data-client])', pastilles).length > 0 : false;
      if (actifs) actifs.hidden = !client && !serveur && !etat.tri;
      $$('[data-tout-effacer]', root).forEach((b) => { if (actifs && actifs.contains(b)) b.hidden = !client && !etat.tri; });
      if (point) point.hidden = !serveur && !facettes.some((f) => etat[f.cle].length) && !etat.tri;
      return ok;
    };

    const remonter = () => {
      const repere = $('.catalogue__recherche', root) || grid;
      const haut = repere.getBoundingClientRect().top;
      const entete = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
      if (haut >= entete) return;
      const y = Math.max(0, window.scrollY + haut - entete - 8);
      if (window.BG && window.BG.lenis && window.BG.lenis.scrollTo) window.BG.lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    const changer = (pousser) => { etat.n = pas; appliquer(); ecrire(pousser); };
    const toutEffacer = () => {
      etat.q = '';
      etat.tri = '';
      facettes.forEach((f) => { etat[f.cle] = []; });
      if (champ) champ.value = '';
      changer(true);
    };

    root.addEventListener('click', (event) => {
      // panneau mobile refermé par « Voir les N pièces » : on revient au début des résultats
      if (event.target.closest('[data-voir-resultats]')) { remonter(); return; }
      const fac = event.target.closest('[data-facette]');
      if (fac) {
        const cle = fac.dataset.facette;
        const v = fac.dataset.valeur;
        if (cle === 'tri') etat.tri = v;
        else {
          const a = etat[cle];
          const i = a.indexOf(v);
          if (i >= 0) a.splice(i, 1); else a.push(v);
        }
        changer(true);
        if (!fac.closest('.is-open')) remonter();
        return;
      }
      const ret = event.target.closest('[data-retirer]');
      if (ret) {
        const cle = ret.dataset.retirer;
        const rangs = $$('[data-retirer]', root);
        const k = rangs.indexOf(ret);
        if (cle === 'q') { etat.q = ''; if (champ) champ.value = ''; } else etat[cle] = (etat[cle] || []).filter((x) => x !== ret.dataset.valeur);
        changer(true);
        const reste = $$('.pastille-filtre', pastilles);
        const cible = reste[Math.min(k, reste.length - 1)] || champ;
        if (cible) cible.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-tout-effacer]')) {
        toutEffacer();
        if (champ) champ.focus({ preventScroll: true });
        remonter();
        return;
      }
      if (event.target.closest('[data-voir-plus-local]')) {
        const avant = etat.n;
        etat.n += pas;
        const ok = appliquer();
        ecrire(false);
        if (window.BG && window.BG.reveal) window.BG.reveal(grid);
        const premier = ok[avant] && $('a', ok[avant].el);
        if (premier) premier.focus({ preventScroll: true });
        return;
      }
      // catégorie, univers, pastille d'étiquette : la recherche et les filtres suivent le lien
      const lien = event.target.closest('a.filter, a[data-garde-etat]');
      if (lien && root.contains(lien)) {
        const p = parametres(false);
        if ([...p.keys()].length) {
          const u = new URL(lien.href, window.location.href);
          CLES.forEach((k) => u.searchParams.delete(k));
          p.forEach((v, k) => u.searchParams.set(k, v));
          lien.href = u.toString();
        }
      }
    });

    let minuteur = 0;
    if (champ) {
      champ.addEventListener('input', () => {
        if (effacer) effacer.hidden = !champ.value;
        clearTimeout(minuteur);
        minuteur = setTimeout(() => { etat.q = champ.value.trim().slice(0, 80); changer(false); }, 120);
      });
      const form = champ.form;
      if (form) form.addEventListener('submit', (event) => {
        event.preventDefault();
        clearTimeout(minuteur);
        etat.q = champ.value.trim().slice(0, 80);
        changer(false);
        champ.blur();
      });
    }
    if (effacer) effacer.addEventListener('click', () => { clearTimeout(minuteur); etat.q = ''; champ.value = ''; changer(true); champ.focus(); });
    window.addEventListener('popstate', () => { clearTimeout(minuteur); lire(); if (champ) champ.value = etat.q; appliquer(); });

    lire();
    if (champ) champ.value = etat.q;
    appliquer();
    ecrire(false);
    root.dataset.decouverte = 'pret';
  }

  const init = () => {
    initCards();
    $$('[data-decouverte]').forEach(initDecouverte);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
