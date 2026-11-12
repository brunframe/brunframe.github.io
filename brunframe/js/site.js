/* BRUNFRAME — site immersif. Aucune dépendance. */
(function () {
  'use strict';

  var d = document, w = window, root = d.documentElement;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var c01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var mqReduce = w.matchMedia ? w.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var LIVE = root.classList.contains('live');

  var nf = new Intl.NumberFormat('fr-FR');
  function nombre(n, esp) { return nf.format(n).replace(/\s/g, esp); }
  function euros(n) { return nombre(n, ' ') + ' €'; }

  /* ------------------------------------------------------------------
     Calculateur + message WhatsApp + bouton Copier (tous les modes)
  ------------------------------------------------------------------ */
  var WA = 'https://wa.me/33630835978?text=';
  var MESSAGE = "Bonjour Andy, j'ai vu BRUNFRAME. J'aimerais la maquette gratuite de ma page d'accueil.";
  var calc = { prix: 25, n: 1, utilise: false, affiche: 1300, raf: 0, minuteur: 0 };
  var inPrix = $('#prix-presta'), inN = $('#clients'), annonce = $('#calc-live');

  function texteWhatsApp() {
    var total = calc.prix * calc.n * 52;
    return MESSAGE + (calc.utilise ? " D'après mon calcul, un client perdu me coûte environ " + nombre(total, ' ') + ' € par an.' : '');
  }
  function majWhatsApp() {
    var t = texteWhatsApp(), href = WA + encodeURIComponent(t);
    $$('.js-wa').forEach(function (a) { a.href = href; });
    var p = $('[data-wa-preview]');
    if (p) p.textContent = t;
  }
  function ecrire(cle, valeur) {
    $$('[data-calc="' + cle + '"]').forEach(function (e) { if (e.textContent !== valeur) e.textContent = valeur; });
  }
  function remplir(el) {
    el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100).toFixed(2) + '%');
  }
  function majCalcul(anime) {
    var total = calc.prix * calc.n * 52, nb = Math.ceil(500 / calc.prix);
    ecrire('price', calc.prix + ' €');
    ecrire('n', String(calc.n));
    ecrire('nb', String(nb));
    inPrix.setAttribute('aria-valuetext', calc.prix + ' euros');
    inN.setAttribute('aria-valuetext', calc.n + (calc.n > 1 ? ' clients' : ' client') + ' par semaine');
    remplir(inPrix); remplir(inN);
    w.cancelAnimationFrame(calc.raf);
    if (!anime || mqReduce.matches) {
      calc.affiche = total;
      ecrire('total', euros(total));
    } else {
      var depart = calc.affiche, t0 = w.performance.now();
      var pas = function (t) {
        var k = c01((t - t0) / 380), e = 1 - Math.pow(1 - k, 3);
        calc.affiche = depart + (total - depart) * e;
        ecrire('total', euros(Math.round(calc.affiche)));
        if (k < 1) calc.raf = w.requestAnimationFrame(pas);
      };
      calc.raf = w.requestAnimationFrame(pas);
    }
    if (anime) {
      w.clearTimeout(calc.minuteur);
      calc.minuteur = w.setTimeout(function () {
        annonce.textContent = nombre(total, ' ') + ' € par an. Un site à 500 €, c’est ' + nb + ' prestations.';
      }, 500);
    }
    majWhatsApp();
  }
  if (inPrix && inN) {
    var surSaisie = function () {
      calc.prix = clamp(parseInt(inPrix.value, 10) || 25, 10, 200);
      calc.n = clamp(parseInt(inN.value, 10) || 1, 1, 10);
      calc.utilise = true;
      majCalcul(true);
    };
    inPrix.addEventListener('input', surSaisie);
    inN.addEventListener('input', surSaisie);
    calc.prix = clamp(parseInt(inPrix.value, 10) || 25, 10, 200);
    calc.n = clamp(parseInt(inN.value, 10) || 1, 1, 10);
    calc.utilise = calc.prix !== 25 || calc.n !== 1;   // valeurs restaurées par le navigateur
    calc.affiche = calc.prix * calc.n * 52;
    majCalcul(false);
  }

  var copier = $('#copier');
  if (copier) {
    copier.addEventListener('click', function () {
      var v = copier.getAttribute('data-copy'), voix = $('#copier-live');
      var ok = function () {
        copier.textContent = 'Copié';
        if (voix) voix.textContent = 'Numéro copié.';
        w.setTimeout(function () { copier.textContent = 'Copier'; if (voix) voix.textContent = ''; }, 2200);
      };
      var secours = function () {
        try {
          var r = d.createRange(), s = w.getSelection();
          r.selectNodeContents($('#numero'));
          s.removeAllRanges(); s.addRange(r);
          if (d.execCommand('copy')) ok();
        } catch (e) { /* le numéro reste sélectionné : copie manuelle */ }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, secours);
      else secours();
    });
  }

  /* ------------------------------------------------------------------
     Repères communs : scènes (pour la couleur de l'en-tête)
  ------------------------------------------------------------------ */
  var scenes = $$('.scene').map(function (el) { return { el: el, theme: el.getAttribute('data-theme') || 'dark', top: 0 }; });
  function mesurerScenes() {
    var y = w.scrollY;
    scenes.forEach(function (s) { s.top = s.el.getBoundingClientRect().top + y; });
  }
  function themeA(yAbs) {
    for (var i = scenes.length - 1; i >= 0; i--) if (yAbs >= scenes[i].top - .5) return scenes[i].theme;
    return 'dark';
  }
  function attr(nom, val) {
    if (val === null) { if (root.hasAttribute(nom)) root.removeAttribute(nom); }
    else if (root.getAttribute(nom) !== val) root.setAttribute(nom, val);
  }

  if (!LIVE) {
    /* Mode sans animation : seulement la couleur de l'en-tête. */
    var enAttente = false;
    var tete = function () { enAttente = false; attr('data-head', themeA(w.scrollY + 30)); };
    var demander = function () { if (!enAttente) { enAttente = true; w.requestAnimationFrame(tete); } };
    mesurerScenes(); tete();
    w.addEventListener('scroll', demander, { passive: true });
    w.addEventListener('resize', function () { mesurerScenes(); demander(); });
    w.addEventListener('load', function () { mesurerScenes(); demander(); });
  }
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', function () { w.location.reload(); });
  if (!LIVE) return;

  /* ------------------------------------------------------------------
     Mode animé
  ------------------------------------------------------------------ */
  var phone = $('#phone'), rig = $('#rig'), layers = $('#layers'), stage = $('.stage'), journey = $('.journey'), glare = $('.phone__glare');
  var verrou = $('#verrou');
  /* Téléphone en 3D (WebGL). Il est créé juste après le premier affichage, pour ne pas le retarder.
     En attendant, et sur un appareil sans carte graphique utilisable, les faces en image font le travail. */
  var tel3d = null, finesse = 0, haut3d = w.BFTelephone ? w.BFTelephone.cotes.H + 14 : 76.59;
  function demarrer3d() {
    S.pret3d = true;                   // le téléphone peut apparaître : 3D ou faces en image, le choix est fait
    if (tel3d || !w.BFTelephone || !$('#tel3d') || !em) return;
    var t3 = w.BFTelephone.creer($('#tel3d'));
    if (!t3) return;
    /* Finesse du dessin : celle de l'écran (jusqu'à 3), réduite si une image coûte plus de 9 ms sur cet appareil. */
    var f = Math.min(w.devicePixelRatio || 1, 3);
    t3.taille(44 * em, haut3d * em, f);
    var ms = t3.cout();
    if (ms > 9) { f = Math.max(1.25, f * Math.sqrt(7 / ms)); t3.taille(44 * em, haut3d * em, f); ms = t3.cout(); }
    if (ms > 30) return;
    if (S.a) t3.dessiner(+S.a[0], +S.a[1], +S.a[2]);
    finesse = f; tel3d = t3;
    rig.classList.add('is-3d');
  }

  /* Écrans : on déplace l'écran de chaque scène dans le téléphone. */
  /* Un seul écran est présent dans le téléphone à la fois : les autres attendent dans un tiroir masqué. */
  var rangement = d.createElement('div');
  rangement.hidden = true;
  d.body.appendChild(rangement);
  var uis = {};
  $$('.shot .ui[data-ui]').forEach(function (u) {
    uis[u.getAttribute('data-ui')] = u;
    rangement.appendChild(u);
  });

  /* Recherche : clavier, suggestions, saisie. */
  var REQUETE = 'entreprise strasbourg';
  var SUGGESTIONS = [
    'esthéticienne strasbourg', 'encadreur krutenau', 'entretien vélo neudorf',
    'entreprise', 'entreprise strasbourg', 'entreprise autour de moi', 'entreprise ouverte maintenant',
    'entreprise strasbourg centre', 'entreprise strasbourg neudorf', 'entreprise strasbourg krutenau', 'entreprise strasbourg ouverte le samedi'
  ];
  /* Recherches récentes affichées avant la première lettre : inventées, comme le reste. */
  var RECENTES = ['coiffeur krutenau', 'fleuriste neudorf', 'restaurant robertsau', 'boulangerie schiltigheim', 'cordonnier cronenbourg'];
  var sr = uis.search, srQ = $('.sr-q', sr), srSugg = $('.sr-sugg', sr), srKbd = $('.sr-kbd', sr);
  var pinsEl = $$('.pin', sr), fichesEl = $$('.fiche', sr), touches = {}, etatSaisie = { n: -1, pins: -1, fiches: -1 };
  var srRes = $('.sr-res', sr), srRoll = $('.sr-roll', sr), srListe = $('.sr-list', sr), rouleMax = 0, rouleFiche = 0, rouleVal = '';
  function rouler(v) {
    v = (-clamp(v, 0, rouleMax)).toFixed(2);
    if (v === rouleVal) return;
    rouleVal = v;
    srRoll.style.setProperty('--sy', v);
  }
  (function clavier() {
    var rangs = ['azertyuiop', 'qsdfghjklm', "^wxcvbn'<", '#_>'], html = '';
    rangs.forEach(function (rang) {
      html += '<div class="kb-row">';
      rang.split('').forEach(function (c) {
        if (c === '^') html += '<i class="kb-k kb-k--w kb-k--maj"></i>';
        else if (c === '<') html += '<i class="kb-k kb-k--w kb-k--ret"></i>';
        else if (c === '#') html += '<i class="kb-k kb-k--w"><span>123</span></i>';
        else if (c === '_') html += '<i class="kb-k kb-k--sp" data-k=" "></i>';
        else if (c === '>') html += '<i class="kb-k kb-k--go" data-k="go"><b></b></i>';
        else html += '<i class="kb-k" data-k="' + c + '" data-c="' + c + '"><span>' + c + '</span></i>';
      });
      html += '</div>';
    });
    srKbd.innerHTML = html;
    $$('[data-k]', srKbd).forEach(function (k) { touches[k.getAttribute('data-k')] = k; });
  })();
  function appuyer(c) {
    var k = touches[c];
    if (!k) return;
    k.classList.add('is-down');
    w.setTimeout(function () { k.classList.remove('is-down'); }, 170);
  }
  function saisir(n) {
    if (n === etatSaisie.n) return;
    var avant = etatSaisie.n, tape = REQUETE.slice(0, n);
    etatSaisie.n = n;
    srQ.textContent = tape;
    if (n > avant && n > 0 && avant >= 0) appuyer(REQUETE.charAt(n - 1));
    sr.classList.toggle('a-du-texte', n > 0);
    if (!n) {
      srSugg.innerHTML = RECENTES.map(function (s) { return '<li class="is-recent"><i></i><span>' + s + '</span><u></u></li>'; }).join('');
      return;
    }
    srSugg.innerHTML = SUGGESTIONS.filter(function (s) { return s.indexOf(tape) === 0; }).slice(0, 5).map(function (s) {
      return '<li><i></i><span>' + tape + '<b>' + s.slice(n) + '</b></span><u></u></li>';
    }).join('');
  }
  function poser(liste, n, cle) {
    if (etatSaisie[cle] === n) return;
    etatSaisie[cle] = n;
    liste.forEach(function (el, i) { el.classList.toggle('is-out', i >= n); });
  }

  /* Annotations de la scène 2. */
  var annos = $$('#anno .an'), nAnno = -1;
  function annoter(n) {
    if (n === nAnno) return;
    nAnno = n;
    annos.forEach(function (a, i) { a.classList.toggle('is-on', i < n); });
  }

  /* Déroulé de la scène 7. */
  var tl = $('#tl'), tlItems = $$('.tl__i', tl).map(function (el) { return { el: el, top: 0 }; });
  var tlEtat = { idx: -1, k: '' }, tlTop = 0, tlBas = 1;
  var MAQ = ['Votre message', 'Maquette gratuite', 'Sur votre téléphone', '50 % pour lancer', 'En ligne'];
  var maqLabel = $('[data-mq-label]', uis.maq);

  /* Texte révélé mot par mot. */
  var beats = $$('.beat').map(function (el) {
    return { el: el, inner: $('.beat__in', el), id: el.getAttribute('data-beat'), flow: el.classList.contains('beat--flow'), top: 0, h: 0, ih: 0, n: 0, rv: -1 };
  });
  beats.forEach(function (b) {
    var mots = [];
    $$('.rv', b.el).forEach(function (el) {
      (function parcourir(noeud) {
        Array.prototype.slice.call(noeud.childNodes).forEach(function (c) {
          if (c.nodeType === 3) {
            var frag = d.createDocumentFragment();
            c.textContent.split(/([ \n\t]+)/).forEach(function (t) {
              if (!t) return;
              if (/^[ \n\t]+$/.test(t)) { frag.appendChild(d.createTextNode(' ')); return; }
              var s = d.createElement('span');
              s.className = 'w'; s.textContent = t;
              mots.push(s); frag.appendChild(s);
            });
            noeud.replaceChild(frag, c);
          } else if (c.nodeType === 1) parcourir(c);
        });
      })(el);
    });
    mots.forEach(function (s, i) { s.style.setProperty('--i', i); });
    b.n = mots.length;
    b.inner.style.setProperty('--n', mots.length);
  });
  var rangImages = 0;
  beats.forEach(function (b, i) { if (b.id === '4.1') rangImages = i; });
  function reveler(b, v) {
    v = Math.round(c01(v) * 24) / 24;
    if (v === b.rv) return;
    b.rv = v;
    b.inner.style.setProperty('--rv', v);
  }

  /* Mesures. */
  var svh = 0, vw = 0, bureau = false, pin = 0, stageH = 0, finParcours = 0, sale = true, s0 = 1, em = 8;
  var sonde = d.createElement('div');
  sonde.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none';
  d.body.appendChild(sonde);
  function mesurer() {
    var y = w.scrollY;
    svh = sonde.offsetHeight || w.innerHeight;
    vw = root.clientWidth;
    bureau = vw >= 900;
    stageH = stage.offsetHeight;
    pin = parseFloat(w.getComputedStyle(beats[1].inner).top) || (bureau ? svh * .27 : stageH + 20);
    beats.forEach(function (b) {
      b.top = b.el.getBoundingClientRect().top + y;
      b.h = b.el.offsetHeight;
      b.ih = b.inner.offsetHeight;
    });
    tlItems.forEach(function (t) { t.top = t.el.getBoundingClientRect().top + y; });
    var r = tl.getBoundingClientRect();
    tlTop = r.top + y + 16; tlBas = r.bottom + y - 16;
    finParcours = journey.getBoundingClientRect().bottom + y;
    /* Téléphone : taille entière (s0) pour l'ouverture, vue rapprochée ensuite (mobile). */
    em = rig.offsetWidth / 30;
    if (tel3d) tel3d.taille(44 * em, haut3d * em, finesse);
    s0 = bureau ? 1 : Math.min(1, (stageH - 80) / rig.offsetHeight);
    /* Liste de résultats : combien elle peut défiler dans la partie visible de l'écran. */
    var visible = (bureau ? rig.offsetHeight : stageH - 56) / em - 1.2 - 10.3;
    rouleMax = Math.max(0, srRoll.offsetHeight / em - visible + 1);
    rouleFiche = Math.min(rouleMax, (srListe.offsetTop - 6) / em);
    mesurerScenes();
    sale = true;
  }

  /* État du téléphone. */
  var S = { rot: 180, rotC: 180, tilt: 8, tiltC: 8, roll: -5, rollC: -5, z: 0, zC: 0, coup: 0, sens: 1, px: 0, py: 0, pxC: 0, pyC: 0, ui: '', cur: -1, lit: null, bouge: false, y: -1, ecrit: {}, pret: false };
  function variable(nom, val) {
    if (S.ecrit[nom] === val) return;
    S.ecrit[nom] = val;
    phone.style.setProperty(nom, val);
  }
  function montrer(ui, step) {
    var el = uis[ui], k;
    if (ui !== S.ui) {
      if (S.ui && uis[S.ui]) rangement.appendChild(uis[S.ui]);
      if (uis[ui]) layers.appendChild(uis[ui]);
      for (k in uis) uis[k].classList.toggle('is-on', k === ui);
      if (S.ui && S.bouge) { S.sens = -S.sens; S.coup = S.sens * 3.2; }
      S.ui = ui;
      attr('data-ui', ui);
    }
    if (el && el.__step !== step) {
      if (el.__step !== undefined && S.bouge && !S.coup) { S.sens = -S.sens; S.coup = S.sens * 1.4; }
      el.__step = step;
      if (step === null) el.removeAttribute('data-step'); else el.setAttribute('data-step', step);
    }
    phone.classList.toggle('ilot-ouvert', ui === 'lock' && step === '2');
  }

  /* Ce que fait chaque passage de texte (p : avancée une fois le texte arrêté, e : entrée). */
  /* Déverrouillage : l'écran verrouillé glisse vers le haut, la recherche avance derrière lui. */
  var swV = -1;
  function glisser(sw) {
    sw = Math.round(sw * 400) / 400;
    if (sw === swV) return;
    swV = sw;
    var k = sw * sw * (3 - 2 * sw);
    if (verrou) {
      verrou.classList.toggle('is-parti', sw >= 1);
      verrou.style.transform = 'translate3d(0,' + (-k * 103).toFixed(2) + '%,0)';
    }
    layers.style.transform = sw < 1 ? 'scale(' + (0.93 + 0.07 * k).toFixed(4) + ')' : '';
  }
  var gestes = {
    /* Ouverture : téléphone verrouillé, puis glissement qui ouvre la recherche (sw de 0 à 1). */
    '0': function (p, e, b, y) {
      saisir(0); rouler(0);
      glisser(c01((y / svh - 1.0) / .3));
      return { ui: 'search', step: 'home', z: 0 };
    },
    /* Rythme repris de l'enregistrement : toucher de la barre, courte pause sur les recherches
       récentes, saisie lettre par lettre, validation, bref chargement, résultats. */
    '1.1': function (p, e, b) {
      var L = REQUETE.length, step, n, k = -1;
      if (p < .04) { step = 'home'; n = 0; }
      else if (p < .54) { step = 'type'; n = p < .12 ? 0 : Math.min(L, Math.floor((p - .12) / .42 * (L + 1))); }
      else if (p < .58) { step = 'load'; n = L; }
      else { step = 'results'; n = L; k = (p - .58) / .3; }
      saisir(n);
      if (step === 'load' && sr.__step === 'type') appuyer('go');
      poser(pinsEl, k < 0 ? 0 : Math.min(5, Math.floor(k / .12) + 1), 'pins');
      poser(fichesEl, k < .2 ? 0 : Math.min(3, Math.floor((k - .2) / .2) + 1), 'fiches');
      rouler(k > .4 ? (k - .4) / 1 * rouleMax * .35 : 0);
      var debut = 2 / (b.n + 3);
      return { ui: 'search', step: step, z: step === 'results' ? 1 : .86, rv: debut * c01(e / .6) + (p >= .58 ? (1 - debut) * c01((p - .58) / .16) : 0) };
    },
    '1.2': function (p) { saisir(REQUETE.length); poser(pinsEl, 5, 'pins'); poser(fichesEl, 3, 'fiches'); rouler(rouleMax * (.35 + .65 * c01(p / .7))); return { ui: 'search', step: 'results', z: 1 }; },
    '1.3': function () { saisir(REQUETE.length); poser(pinsEl, 5, 'pins'); poser(fichesEl, 3, 'fiches'); rouler(rouleFiche); return { ui: 'search', step: 'pick', z: 1 }; },
    '2.1': function (p) { return { ui: 'fiche', step: null, z: .8, anno: p < .05 ? 0 : p < .22 ? 1 : p < .4 ? 2 : p < .58 ? 3 : 4 }; },
    '2.2': function () { return { ui: 'fiche', step: 'focus', z: .8, anno: 4 }; },
    '3.1': function (p) { return { ui: 'lock', step: p < .36 ? '0' : '1', z: .86 }; },
    '3.2': function () { return { ui: 'lock', step: '2', z: .86 }; },
    '4.1': function (p) { return { ui: 'msg', step: p < .3 ? '0' : '1', z: 1 }; },
    '4.2': function () { return { ui: 'msg', step: '2', z: 1 }; },
    '5': function () { return { ui: 'recap', step: null, z: 1 }; },
    '6.1': function () { return { ui: 'works', step: '0', z: .86 }; },
    '6.2': function () { return { ui: 'works', step: '1', z: .86 }; },
    '6.3': function () { return { ui: 'works', step: '2', z: .86 }; },
    '7': function (p, e, b, y) {
      var ligne = y + pin + (svh - pin) * (bureau ? .34 : .4), idx = 0, i;
      for (i = 0; i < tlItems.length; i++) if (tlItems[i].top <= ligne) idx = i;
      if (idx !== tlEtat.idx) {
        tlEtat.idx = idx;
        tlItems.forEach(function (t, j) { t.el.classList.toggle('is-on', j === idx); t.el.classList.toggle('is-done', j < idx); });
        if (maqLabel) maqLabel.textContent = MAQ[idx];
      }
      var k = c01((ligne - tlTop) / (tlBas - tlTop)).toFixed(3);
      if (k !== tlEtat.k) { tlEtat.k = k; tl.style.setProperty('--tl', k); }
      return { ui: 'maq', step: String(idx + 1), z: .9 };
    }
  };

  function mettreAJour(y, t) {
    var i, b, e, p, cur = 0;
    for (i = 1; i < beats.length; i++) {
      if ((y + svh - beats[i].top) / (svh - pin) >= .35) cur = i; else break;
    }
    if (cur !== 0) glisser(1);
    /* Les images des réalisations se chargent deux scènes avant d'être montrées. */
    if (!S.images && cur >= rangImages) {
      S.images = true;
      $$('.wk-img, .cmp__img').forEach(function (im) { im.loading = 'eager'; });
    }
    if (cur !== S.cur) {
      beats.forEach(function (bb, j) { bb.el.classList.toggle('is-on', j === cur); bb.el.classList.toggle('is-past', j < cur); });
      for (i = 0; i < cur; i++) reveler(beats[i], 1);
      S.cur = cur;
    }

    /* Rotation d'ouverture (scène 0) : 180° → 0° sur 120 svh, ralentie en fin de course. */
    var r = c01(y / (0.8 * svh)), k = 1 - Math.pow(1 - r, 3);
    S.rot = 180 * (1 - k); S.tilt = 8 * (1 - k); S.roll = -5 * (1 - k);
    var allume = k >= .9;
    if (allume !== S.lit) { S.lit = allume; phone.classList.toggle('is-lit', allume); }
    beats[0].el.classList.toggle('is-front', k >= .985);
    attr('data-top', y < 24 ? '1' : null);

    /* Texte : passage courant et suivant. */
    var res = null;
    for (i = cur; i <= cur + 1 && i < beats.length; i++) {
      b = beats[i];
      e = c01((y + svh - b.top) / (svh - pin));
      p = i === 0 ? c01(y / Math.max(1, b.h - b.ih - 44)) : c01((y + pin - b.top) / Math.max(1, b.h - b.ih - 24));
      var g = i === cur && gestes[b.id] ? gestes[b.id](p, e, b, y) : null;
      if (i === cur) res = g;
      reveler(b, g && g.rv !== undefined ? g.rv : (e - .2) / .62);
    }
    if (res) {
      montrer(res.ui, res.step === undefined ? null : res.step);
      annoter(res.anno || 0);
      S.z = res.z || 0;
    }

    /* Couleurs : scène collée (mobile) et en-tête. */
    var themeScene = themeA(y + (bureau ? svh * .5 : stageH));
    attr('data-stage', themeScene);
    attr('data-head', bureau ? themeA(y + 36) : (finParcours - y > 30 ? themeScene : themeA(y + 30)));
  }

  /* Une image du téléphone. Appelée par requestAnimationFrame ET par chaque événement de défilement :
     certains navigateurs intégrés (aperçus, cadres dans une application) brident requestAnimationFrame
     à 30 images/s, alors que le défilement arrive à 60. Les lissages sont en temps réel (ms), pas par image,
     pour que le téléphone suive le doigt de la même façon à 30, 60 ou 120 images/s. */
  var horloge = { t: 0, raf: 0, rafMoy: 16.7, relais: 0, actif: true };
  function avancer() {
    var t = w.performance.now(), dt = horloge.t ? t - horloge.t : 16.7;
    if (horloge.t && dt < (horloge.relais ? 12 : 6)) return;   // déjà calculé pour cette image
    horloge.t = t;
    if (dt > 100) dt = 100;
    var y = Math.max(0, w.scrollY);
    if (y !== S.y || sale) {
      if (S.y >= 0 && y !== S.y) S.bouge = true;
      S.y = y; sale = false;
      mettreAJour(y, t);
    }
    /* Inertie courte + balancement au repos tout en haut + regard du pointeur (ordinateur). */
    var kr = 1 - Math.exp(-dt / 55), kz = 1 - Math.exp(-dt / 130), kp = 1 - Math.exp(-dt / 230);
    var repos = y < 2 ? Math.sin(t / 1900) * 6 : 0;
    S.rotC += (S.rot + repos - S.rotC) * kr;
    S.tiltC += (S.tilt - S.tiltC) * kr;
    S.rollC += (S.roll - S.rollC) * kr;
    S.pxC += (S.px - S.pxC) * kp;
    S.pyC += (S.py - S.pyC) * kp;
    var zCible = bureau ? 1 : Math.max(s0, S.z);
    if (!S.pret) S.zC = zCible;
    S.zC += (zCible - S.zC) * kz;
    if (Math.abs(zCible - S.zC) < .0006) S.zC = zCible;
    var zTxt = S.zC.toFixed(4);
    if (S.ecrit.s !== zTxt) { S.ecrit.s = zTxt; rig.style.setProperty('--s', zTxt); rig.style.transform = 'scale(' + zTxt + ')'; }
    if (!S.pret && S.pret3d) { S.pret = true; stage.classList.add('is-pret'); }
    S.coup *= Math.exp(-dt / 160);
    if (Math.abs(S.coup) < .02) S.coup = 0;
    var rot = S.rotC + S.coup + S.pxC * 9, tilt = S.tiltC - S.pyC * 6;
    var a1 = tilt.toFixed(2), a2 = S.rollC.toFixed(2), a3 = rot.toFixed(2);
    var tr = 'rotateX(' + a1 + 'deg) rotateZ(' + a2 + 'deg) rotateY(' + a3 + 'deg)';
    var change = tr !== S.tr;
    if (change) {
      S.tr = tr; S.a = [a1, a2, a3]; phone.style.transform = tr;
      if (tel3d) tel3d.dessiner(+a1, +a2, +a3);
    }
    horloge.actif = change || y < 2 || zTxt !== String(zCible.toFixed(4));
    /* Reflet du verre : plus marqué quand le téléphone est de biais. */
    var ca = Math.cos(rot * Math.PI / 180);
    var g = clamp((S.lit ? .1 : .45) + (1 - Math.max(0, ca)) * .55, 0, 1).toFixed(2);
    if (g !== S.g) { S.g = g; glare.style.opacity = g; }
  }
  function image() {
    var t = w.performance.now();
    if (horloge.raf) horloge.rafMoy += (Math.min(t - horloge.raf, 100) - horloge.rafMoy) * .08;
    horloge.raf = t;
    avancer();
    /* requestAnimationFrame bridé (≈ 30 images/s) : une minuterie prend le relais entre deux images, tant que le téléphone bouge. */
    if (horloge.rafMoy > 24 && !horloge.relais) horloge.relais = w.setInterval(function () { if (horloge.actif) avancer(); }, 16);
    else if (horloge.rafMoy < 20 && horloge.relais) { w.clearInterval(horloge.relais); horloge.relais = 0; }
    w.requestAnimationFrame(image);
  }
  w.addEventListener('scroll', avancer, { passive: true });

  w.addEventListener('pointermove', function (ev) {
    if (ev.pointerType !== 'mouse' || !bureau) return;
    S.px = clamp(ev.clientX / vw - .75, -.6, .3);
    S.py = clamp(ev.clientY / svh - .5, -.5, .5);
  }, { passive: true });

  /* Le téléphone réagit au toucher : un léger basculement du côté touché. */
  rig.addEventListener('pointerdown', function (ev) {
    var r = rig.getBoundingClientRect();
    S.coup = (ev.clientX < r.left + r.width / 2 ? 1 : -1) * 4;
  }, { passive: true });

  var minuteur = 0;
  function remesurer() { w.clearTimeout(minuteur); minuteur = w.setTimeout(mesurer, 120); }
  w.addEventListener('resize', remesurer);
  w.addEventListener('orientationchange', remesurer);
  w.addEventListener('load', mesurer);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(mesurer);
  if (w.ResizeObserver) new w.ResizeObserver(remesurer).observe(journey);

  mesurer();
  w.requestAnimationFrame(image);
  w.requestAnimationFrame(function () { w.requestAnimationFrame(demarrer3d); });
})();
