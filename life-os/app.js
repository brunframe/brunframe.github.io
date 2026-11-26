/* LIFE OS — registre personnel. Code public, aucune donnée personnelle ici.
   - App installée depuis Safari : tout est enregistré sur l'iPhone (localStorage), aucun compte, aucune clé.
     Le plan arrive une seule fois, chiffré (plan.enc.json), ouvert par le code donné par Claude.
   - Dans claude.ai : la base privée de l'artefact (systeme/plan, jours/AAAA-MM, semaines/AAAA…). */
(function () {
  "use strict";

  /* ================= Outils ================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function ty(s) { return String(s).replace(/ ([:;?!»])/g, " $1").replace(/« /g, "« "); }
  function tx(s) { return ty(esc(s)); }
  function clone(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function mondayOf(s) { var d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
  /* La journée bascule à 05:00 : un bilan écrit à 01:30 compte pour la veille. */
  function today() { var d = new Date(); if (d.getHours() < 5) d.setDate(d.getDate() - 1); return iso(d); }
  var fJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  var fCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function longDate(s) { return fJour.format(parseISO(s)); }
  function shortDate(s) { return fCourt.format(parseISO(s)); }
  var D1 = ["L", "M", "M", "J", "V", "S", "D"];
  var ROM = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"];
  function tmin(s) { if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null; var p = s.split(":"); return (+p[0]) * 60 + (+p[1]); }
  function night(m) { return m < 720 ? m + 1440 : m; }
  function sleepMin(c, r) { var a = tmin(c), b = tmin(r); if (a == null || b == null) return null; var d = (b - a + 1440) % 1440; return d < 60 ? null : d; }
  function dur(m) { m = Math.round(m); return Math.floor(m / 60) + " h " + pad(m % 60); }
  function clock(m) { m = Math.round(m) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function num(v) { if (v == null || v === "") return null; var n = parseFloat(String(v).replace(",", ".").replace(/\s/g, "")); return isNaN(n) ? null : n; }
  function fr(n, d) { if (n == null) return "—"; var k = Math.pow(10, d || 0); return String(Math.round(n * k) / k).replace(".", ","); }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  var COCHE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.8"/></svg>';

  /* ================= Stockage ================= */
  var LS = {
    get: function (k) { try { var v = localStorage.getItem("los:" + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("los:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem("los:" + k); } catch (e) { /* rien */ } }
  };
  LS.del("cfg"); /* ancienne connexion GitHub : aucune clé n'est gardée sur l'appareil */
  var FKEY = "files";
  var files = LS.get(FKEY) || {};
  var saveTimer = null, saveOk = true;
  function saveNow() { clearTimeout(saveTimer); saveOk = LS.set(FKEY, files); }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 150); }
  function file(path) { if (!files[path]) files[path] = { sha: null, data: {}, dirty: {}, pulledAt: 0 }; return files[path]; }

  /* Deux modes, même structure de données :
     - "local" : l'app installée depuis Safari. Tout reste sur l'iPhone, rien à configurer.
     - "db"    : la version claude.ai, qui enregistre dans la base privée de l'artefact. */
  var B = { kind: null, db: null };
  function httpErr(status) { var e = new Error("http " + status); e.status = status; return e; }
  function dbId(path) { return path === "plan.json" ? "systeme/plan" : path.replace(/\.json$/, ""); }
  function remoteGet(path) { return B.db.doc(dbId(path)).get().then(function (s) { return s.exists ? { data: clone(s.data()), sha: "db" } : null; }); }
  function remotePut(path, data) { return B.db.doc(dbId(path)).set(clone(data)).then(function () { return { sha: "db" }; }, function (e) { throw httpErr(e && e.code === "invalid_argument" ? 403 : 503); }); }

  /* ================= Synchronisation (version claude.ai seulement) ================= */
  var SYNC = { state: "idle", error: null, timer: null, running: false, lastOk: null };
  function ready() { return !!B.kind; }
  function pull(path) {
    return remoteGet(path).then(function (res) {
      var f = file(path);
      f.pulledAt = Date.now();
      if (!res) return false;
      var merged = res.data || {};
      Object.keys(f.dirty).forEach(function (k) { if (f.data[k] !== undefined) merged[k] = f.data[k]; else delete merged[k]; });
      var changed = JSON.stringify(merged) !== JSON.stringify(f.data);
      f.data = merged; f.sha = res.sha; persist();
      return changed;
    });
  }
  function push(path) {
    var f = file(path);
    if (!Object.keys(f.dirty).length) return Promise.resolve();
    var sent = clone(f.dirty);
    return remotePut(path, f.data).then(function (res) {
      f.sha = res.sha;
      Object.keys(sent).forEach(function (k) { if (f.dirty[k] === sent[k]) delete f.dirty[k]; });
      persist();
    });
  }
  function dirtyPaths() { return Object.keys(files).filter(function (p) { return Object.keys(files[p].dirty).length > 0; }); }
  function paintSync() {
    var el = $("#etat"), t = $("#etat-t");
    if (!B.kind) { el.setAttribute("data-s", "wait"); t.textContent = "Ouverture"; return; }
    if (B.kind === "local") { el.setAttribute("data-s", saveOk ? "ok" : "bad"); t.textContent = saveOk ? "Enregistré" : "Mémoire pleine"; return; }
    if (SYNC.state === "bad") { el.setAttribute("data-s", "bad"); t.textContent = SYNC.error === "auth" ? "Accès refusé" : "Erreur"; return; }
    if (navigator.onLine === false) { el.setAttribute("data-s", "off"); t.textContent = "Hors ligne"; return; }
    if (SYNC.running || dirtyPaths().length) { el.setAttribute("data-s", "wait"); t.textContent = "Enregistrement"; return; }
    el.setAttribute("data-s", "ok");
    t.textContent = SYNC.lastOk ? "Enregistré " + pad(SYNC.lastOk.getHours()) + ":" + pad(SYNC.lastOk.getMinutes()) : "Synchronisé";
  }
  function scheduleSync(ms) { clearTimeout(SYNC.timer); SYNC.timer = setTimeout(runSync, ms == null ? 2000 : ms); paintSync(); }
  function neededPaths() {
    var t = today(), list = ["plan.json"];
    [t, addDays(t.slice(0, 8) + "01", -1), UI.day, UI.week, addDays(UI.week, 6), UI.reg, addDays(UI.reg, -7), addDays(UI.reg, 6)].forEach(function (d) {
      list.push("jours/" + d.slice(0, 7) + ".json"); list.push("semaines/" + mondayOf(d).slice(0, 4) + ".json");
    });
    list.push("listes/taches.json");
    var ym = t.slice(0, 7);
    [0, 1, 2].forEach(function (i) { list.push("sport/" + moisPrec(ym, i) + ".json"); });
    [ym, moisPrec(ym, 1), UI.mois || ym, moisPrec(UI.mois || ym, 1), UI.day.slice(0, 7)].forEach(function (m) { list.push("argent/" + m + ".json"); });
    return list.filter(function (p, i) { return list.indexOf(p) === i; });
  }
  function runSync(force) {
    if (B.kind === "local") {
      Object.keys(files).forEach(function (p) { files[p].dirty = {}; });
      saveNow(); SYNC.lastOk = new Date(); paintSync();
      return Promise.resolve();
    }
    if (B.kind !== "db" || SYNC.running) return Promise.resolve();
    if (navigator.onLine === false) { paintSync(); return Promise.resolve(); }
    SYNC.running = true; paintSync();
    var changed = false, chain = Promise.resolve();
    dirtyPaths().forEach(function (p) { chain = chain.then(function () { return push(p); }); });
    neededPaths().forEach(function (p) {
      chain = chain.then(function () {
        var f = files[p];
        if (!force && f && Date.now() - f.pulledAt < 45000) return;
        return pull(p).then(function (c) { if (c) changed = true; });
      });
    });
    return chain.then(function () {
      SYNC.running = false; SYNC.state = "ok"; SYNC.error = null; SYNC.lastOk = new Date(); paintSync();
      if (dirtyPaths().length) scheduleSync(1500);
      if (changed) refresh();
    }, function (e) {
      SYNC.running = false;
      if (e && e.status === 403) { SYNC.state = "bad"; SYNC.error = "auth"; }
      else { SYNC.state = "idle"; scheduleSync(15000); }
      paintSync();
      if (UI.view === "reglages") renderReglages();
    });
  }

  /* ================= Modèle ================= */
  function plan() { var f = files["plan.json"]; return f && f.data && f.data.semaines ? f.data : null; }
  function startDate() { var p = plan(); return p ? p.debut : "2026-11-23"; }
  function jOf(d) { return diffDays(startDate(), d) + 1; }
  function weekOf(d) { var p = plan(), j = jOf(d); if (!p || j < 1 || j > 90) return null; return p.semaines[Math.min(p.semaines.length - 1, Math.floor((j - 1) / 7))]; }
  function weekOrFirst(d) { var p = plan(); if (!p) return null; return weekOf(d) || (jOf(d) < 1 ? p.semaines[0] : null); }
  function phaseOf(d) { var p = plan(), j = jOf(d); if (!p || j < 1 || j > 90) return null; return p.phases[j <= 30 ? 0 : (j <= 60 ? 1 : 2)]; }
  function dayPath(d) { return "jours/" + d.slice(0, 7) + ".json"; }
  function weekPath(m) { return "semaines/" + m.slice(0, 4) + ".json"; }
  function day(d) { var f = files[dayPath(d)]; return (f && f.data[d]) || {}; }
  function review(m) { var f = files[weekPath(m)]; return (f && f.data[m]) || {}; }
  var rev = 0;
  function setDay(d, k, v) {
    var f = file(dayPath(d)), cur = Object.assign({}, f.data[d] || {});
    if (v === null || v === "" || v === undefined) delete cur[k]; else cur[k] = v;
    cur.maj = new Date().toISOString();
    f.data[d] = cur; f.dirty[d] = ++rev; persist(); scheduleSync();
  }
  function setReview(m, k, v) {
    var f = file(weekPath(m)), cur = Object.assign({}, f.data[m] || {});
    if (v === null || v === "") delete cur[k]; else cur[k] = v;
    cur.maj = new Date().toISOString();
    f.data[m] = cur; f.dirty[m] = ++rev; persist(); scheduleSync();
  }
  function noted(x) { return Object.keys(x).some(function (k) { return k !== "maj"; }); }

  /* Ce qui est suivi, et à partir de quelle semaine du plan : une à deux nouveautés par semaine. */
  var TENUE = [
    { k: "tel_loin", n: "Téléphone loin du lit", s: "La nuit dernière", from: 1 },
    { k: "salle", n: "Salle, avant le travail", s: "Lundi · jeudi · samedi", from: 2 },
    { k: "fastfood", n: "Fast-food", s: "À marquer seulement si tu en as pris", from: 2, neg: true },
    { k: "chambre", n: "Chambre remise en ordre", s: "Dix minutes, le soir", from: 6 },
    { k: "tel_matin", n: "Premières trente minutes sans téléphone", s: "Au réveil", from: 7 }
  ];
  var RELEVE = [
    { k: "ecran", n: "Temps d'écran", s: "Réglages › Temps d'écran", u: "h", step: 0.5, from: 1 },
    { k: "pas", n: "Pas", s: "App Santé, le soir", u: "pas", input: true, from: 1 },
    { k: "depenses", n: "Dépenses", s: "Tout compris", u: "€", input: true, from: 1 },
    { k: "business", n: "Business", s: "Temps réel", u: "min", step: 15, from: 1 },
    { k: "contacts", n: "Prospects contactés", s: "Message, appel, visite", u: "", step: 1, from: 4 },
    { k: "etudes", n: "Études", s: "Révisions, EVPM", u: "min", step: 15, from: 1 }
  ];
  function weekNo(d) { var w = weekOf(d); return w ? w.n : (jOf(d) < 1 ? 1 : 99); }
  function bedTarget(d) { var w = weekOrFirst(d); if (!w) return null; var t = night(tmin(w.c.coucher)); if (parseISO(d).getDay() === 3) t -= 60; return t; }
  function wakeTarget(d, w) { return parseISO(d).getDay() === 3 ? "06:30" : w.c.reveil; }
  function onTime(d, x) { var b = tmin(x.coucher), t = bedTarget(d); if (b == null || t == null) return null; return night(b) <= t + 15; }
  function tenueDuJour(d) {
    var x = day(d), n = weekNo(d), ok = 0, tot = 0;
    function add(v) { tot++; if (v) ok++; }
    add(onTime(d, x) === true);
    TENUE.forEach(function (h) { if (h.from > n || h.k === "salle") return; add(h.neg ? (noted(x) && x[h.k] !== true) : x[h.k] === true); });
    ["1", "2", "3"].forEach(function (i) { if (x["p" + i]) add(x["p" + i + "_ok"] === true); });
    return { ok: ok, tot: tot };
  }


  /* ================= État de l'interface ================= */
  var UI = { view: "aujourdhui", day: today(), week: mondayOf(today()), reg: mondayOf(today()), flow: null, navigated: false };

  /* ================= Les parcours : une question par écran ================= */
  function matinSteps(d) {
    var n = weekNo(d), s = [
      { id: "nuit", q: "Ta nuit", hint: "", kind: "nuit" },
      { id: "tel", q: "Ton téléphone a dormi loin du lit ?", hint: "Pas sur la table de nuit.", kind: "yesno", k: "tel_loin" }
    ];
    if (n >= 7) s.push({ id: "telmatin", q: "30 minutes sans téléphone au réveil ?", hint: "", kind: "yesno", k: "tel_matin" });
    s.push({ id: "prios", q: "Tes 3 priorités du jour", hint: "Trois choses concrètes.", kind: "prios" });
    return s;
  }
  function soirSteps(d) {
    var n = weekNo(d), x = day(d), s = [], coches = [];
    if (x.p1 || x.p2 || x.p3) s.push({ id: "prios_ok", q: "Tes priorités faites ?", hint: "Touche celles qui sont faites.", kind: "checks" });
    if (n >= 2) coches.push(["salle", "Séance de salle faite"], ["fastfood", "J'ai mangé un fast-food"]);
    if (n >= 6) coches.push(["chambre", "Chambre remise en ordre"]);
    if (coches.length) s.push({ id: "coches", q: "Coche ce qui est vrai aujourd'hui", hint: "Laisse vide si ce n'est pas le cas.", kind: "coches", items: coches });
    s.push({ id: "depenses", q: "Tes dépenses du jour", hint: "Tape le montant, choisis la catégorie, ajoute. Rien dépensé : Suivant.", kind: "depenses" });
    var ch = [["ecran", "Écran", "h"], ["pas", "Pas", ""], ["business", "Business", "min"]];
    if (n >= 4) ch.push(["contacts", "Prospects contactés", ""]);
    ch.push(["etudes", "Études", "min"]);
    s.push({ id: "chiffres", q: "Tes chiffres du jour", hint: "Écran : Réglages › Temps d'écran. Pas : app Santé.", kind: "chiffres", items: ch });
    return s;
  }
  function semaineSteps() {
    return [
      { id: "chiffres", q: "Ta semaine en chiffres", hint: "Calculé depuis ce que tu as noté.", kind: "resume" },
      { id: "epargne", q: "Combien as-tu mis de côté cette semaine ?", hint: "Le virement vers ton livret.", kind: "wnumber", k: "epargne", u: "€" },
      { id: "clients", q: "Combien de clients signés au total ?", hint: "Depuis le début.", kind: "wnumber", k: "clients", u: "" },
      { id: "atteints", q: "Qu'est-ce qui a marché cette semaine ?", hint: "", kind: "wtext", k: "atteints" },
      { id: "coince", q: "Qu'est-ce qui a coincé, et pourquoi ?", hint: "", kind: "wtext", k: "non_atteints" },
      { id: "suite", q: "Tes 3 priorités pour la semaine prochaine", hint: "", kind: "wprios" }
    ];
  }
  function startFlow(type) {
    var steps = type === "matin" ? matinSteps(UI.day) : (type === "soir" ? soirSteps(UI.day) : semaineSteps());
    UI.flow = { type: type, steps: steps, i: 0, done: false };
    renderFlow(); window.scrollTo(0, 0);
  }
  function endFlow() {
    var f = UI.flow;
    if (f.type === "soir") setDay(UI.day, "soir_fait", true);
    if (f.type === "matin") setDay(UI.day, "matin_fait", true);
    if (f.type === "semaine") setReview(UI.week, "fait", true);
    f.done = true; renderFlow(); runSync();
  }
  function nextStep() { var f = UI.flow; if (f.i < f.steps.length - 1) { f.i++; renderFlow(); } else endFlow(); }
  function prevStep() { var f = UI.flow; if (f.i > 0) { f.i--; renderFlow(); } else { UI.flow = null; show("aujourdhui"); } }

  function renderFlow() {
    var f = UI.flow, root = $("#v-flow");
    Object.keys(VIEWS).forEach(function (k) { $("#v-" + k).hidden = true; });
    root.hidden = false; $("#nav").hidden = true;
    if (f.done) { root.innerHTML = flowEnd(f.type); return; }
    var st = f.steps[f.i], x = day(UI.day), r = review(UI.week), total = f.steps.length;
    var ctl = "";
    switch (st.kind) {
      case "nuit":
        ctl = '<div class="liste"><label class="lbl" for="fi">Lumière éteinte hier soir' + (weekOrFirst(UI.day) ? " · objectif " + clock(bedTarget(UI.day)) : "") + '</label><input class="grand-heure" type="time" id="fi" data-d="coucher" value="' + esc(x.coucher || "") + '">' +
          '<label class="lbl" for="fi2">Réveil' + (weekOrFirst(UI.day) ? " · objectif " + wakeTarget(UI.day, weekOrFirst(UI.day)) : "") + '</label><input class="grand-heure" type="time" id="fi2" data-d="reveil" value="' + esc(x.reveil || "") + '"></div>'; break;
      case "coches":
        ctl = '<div class="liste">' + st.items.map(function (it) { return '<button type="button" class="opt large" data-tog="' + it[0] + '" aria-pressed="' + (x[it[0]] === true) + '"><span class="case"></span>' + tx(it[1]) + "</button>"; }).join("") + "</div>"; break;
      case "chiffres":
        ctl = '<div class="grille-n">' + st.items.map(function (it) { var v = x[it[0]]; return '<label class="cellule"><span>' + tx(it[1]) + '</span><span class="saisie-n"><input type="text" inputmode="decimal" data-d="' + it[0] + '" value="' + esc(v == null ? "" : String(v).replace(".", ",")) + '" placeholder="0" autocomplete="off">' + (it[2] ? "<em>" + esc(it[2]) + "</em>" : "") + "</span></label>"; }).join("") + "</div>"; break;
      case "depenses":
        ctl = ctlDepenses(); break;
      case "time":
        ctl = '<input class="grand-heure" type="time" id="fi" data-d="' + st.k + '" value="' + esc(x[st.k] || "") + '">'; break;
      case "yesno":
        ctl = '<div class="choix"><button type="button" class="opt" data-yes="' + st.k + '" aria-pressed="' + (x[st.k] === true) + '">Oui</button><button type="button" class="opt" data-no="' + st.k + '" aria-pressed="' + (x[st.k] === false) + '">Non</button></div>'; break;
      case "scale":
        ctl = '<div class="echelle">' + [1, 2, 3, 4, 5].map(function (v) { return '<button type="button" class="opt" data-sc="' + st.k + '" data-v="' + v + '" aria-pressed="' + (x[st.k] === v) + '">' + v + "</button>"; }).join("") + "</div>"; break;
      case "prios":
        ctl = '<div class="liste">' + ["1", "2", "3"].map(function (i) { return '<input class="champ-l" type="text" data-d="p' + i + '" value="' + esc(x["p" + i] || "") + '" placeholder="Priorité ' + i + '" autocomplete="off" enterkeyhint="next">'; }).join("") + "</div>"; break;
      case "checks":
        ctl = '<div class="liste">' + ["1", "2", "3"].filter(function (i) { return x["p" + i]; }).map(function (i) { return '<button type="button" class="opt large" data-tog="p' + i + '_ok" aria-pressed="' + (x["p" + i + "_ok"] === true) + '"><span class="case"></span>' + esc(x["p" + i]) + "</button>"; }).join("") + "</div>"; break;
      case "stepper":
        var v = num(x[st.k]) || 0;
        ctl = '<div class="compteur"><button type="button" class="rond" data-st="' + st.k + '" data-step="' + (-st.step) + '" aria-label="Moins">−</button><span class="val" id="val">' + fr(v, 1) + (st.u ? "<small> " + st.u + "</small>" : "") + '</span><button type="button" class="rond" data-st="' + st.k + '" data-step="' + st.step + '" aria-label="Plus">+</button></div>'; break;
      case "number":
        ctl = '<div class="nombre"><input class="grand-nombre" type="text" inputmode="decimal" id="fi" data-d="' + st.k + '" value="' + esc(x[st.k] == null ? "" : String(x[st.k]).replace(".", ",")) + '" placeholder="0" autocomplete="off"><span>' + esc(st.u) + "</span></div>"; break;
      case "text2":
        ctl = '<div class="liste"><label class="lbl" for="t1">Ce qui a coincé</label><textarea class="champ-l" id="t1" data-d="difficultes" rows="2">' + esc(x.difficultes || "") + '</textarea><label class="lbl" for="t2">Ce que tu changes demain</label><input class="champ-l" id="t2" type="text" data-d="amelioration" value="' + esc(x.amelioration || "") + '" autocomplete="off"></div>'; break;
      case "resume":
        ctl = resumeSemaine(UI.week); break;
      case "wnumber":
        ctl = '<div class="nombre"><input class="grand-nombre" type="text" inputmode="decimal" id="fi" data-w="' + st.k + '" value="' + esc(r[st.k] || "") + '" placeholder="0" autocomplete="off"><span>' + esc(st.u) + "</span></div>"; break;
      case "wtext":
        ctl = '<textarea class="champ-l" id="fi" data-w="' + st.k + '" rows="3">' + esc(r[st.k] || "") + "</textarea>"; break;
      case "wprios":
        ctl = '<div class="liste">' + ["s1", "s2", "s3"].map(function (k, i) { return '<input class="champ-l" type="text" data-w="' + k + '" value="' + esc(r[k] || "") + '" placeholder="Priorité ' + (i + 1) + '" autocomplete="off">'; }).join("") + "</div>"; break;
    }
    var last = f.i === total - 1;
    root.innerHTML =
      '<div class="flow-top"><button type="button" class="retour" data-back>← ' + (f.i ? "Retour" : "Quitter") + '</button><span class="compte">' + (f.i + 1) + " / " + total + '</span></div>' +
      '<div class="barre"><span style="width:' + ((f.i + 1) / total * 100) + '%"></span></div>' +
      '<div class="question entre"><h1>' + tx(st.q) + "</h1>" + (st.hint ? '<p class="aide">' + tx(st.hint) + "</p>" : "") + ctl + "</div>" +
      '<div class="flow-bas"><button type="button" class="principal" data-next>' + (last ? "Terminer" : "Suivant") + "</button></div>";
    var fi = $("#fi"); if (fi && (st.kind === "number" || st.kind === "wnumber")) setTimeout(function () { try { fi.focus(); } catch (e) { /* rien */ } }, 60);
    $$("#v-flow textarea").forEach(grow);
  }
  function flowEnd(type) {
    var d = UI.day, x = day(d), w = weekOrFirst(d), lines = [];
    if (type === "matin") {
      var sm = sleepMin(x.coucher, x.reveil);
      if (sm != null) lines.push(["Ta nuit", dur(sm), sm >= 420 ? "Objectif de 7 h atteint." : "En dessous de 7 h."]);
      if (x.coucher && w) lines.push(["Lumière éteinte", x.coucher, onTime(d, x) ? "À l'heure." : "Objectif : " + clock(bedTarget(d)) + "."]);
      return fin("Matin terminé.", lines, "Après le travail, reviens remplir l'après-midi.");
    }
    if (type === "soir") {
      var t = tenueDuJour(d);
      lines.push(["Tenu aujourd'hui", t.ok + " sur " + t.tot, ""]);
      var tonight = addDays(d, 1);
      return fin("Journée enregistrée.", lines, w ? "Ce soir : lumière éteinte à " + clock(bedTarget(tonight) || bedTarget(d)) + ", téléphone loin du lit." : "");
    }
    return fin("Semaine bouclée.", [], "Écris « bilan fait » à Claude : il lit tes chiffres et ajuste la semaine suivante.");
  }
  function fin(titre, lines, next) {
    return '<div class="fin entre"><div class="coche-grande">✓</div><h1>' + tx(titre) + "</h1>" +
      (lines.length ? '<dl class="recap">' + lines.map(function (l) { return "<div><dt>" + tx(l[0]) + "</dt><dd>" + esc(l[1]) + (l[2] ? "<small>" + tx(l[2]) + "</small>" : "") + "</dd></div>"; }).join("") + "</dl>" : "") +
      (next ? '<p class="aide">' + tx(next) + "</p>" : "") +
      '<button type="button" class="principal" data-home>Retour à aujourd\'hui</button></div>';
  }

  /* ================= Aujourd'hui : le parcours du jour ================= */
  function renderAujourdhui() {
    var d = UI.day, t = today(), x = day(d), w = weekOrFirst(d), j = jOf(d), isSun = parseISO(t).getDay() === 0;
    var matinOk = !!(x.coucher && x.reveil), soirOk = x.soir_fait === true, semOk = review(mondayOf(t)).fait === true;
    function etape(n, titre, sous, ok, act, dispo) {
      return '<button type="button" class="etape' + (ok ? " ok" : "") + '" data-flow="' + act + '"' + (dispo === false ? " disabled" : "") + '><span class="pastille">' + (ok ? "✓" : n) + '</span><span class="et"><b>' + tx(titre) + "</b><small>" + tx(ok ? "Fait. Touche pour modifier." : sous) + '</small></span><span class="fleche">→</span></button>';
    }
    var html = '<div class="entete"><p class="sur">' + esc(cap(longDate(d))) + (d === t ? "" : (d < t ? " · jour passé" : " · à venir")) + "</p>" +
      "<h1>" + (j < 1 ? "Départ lundi" : (j > 90 ? "Après le plan" : "Jour " + j + " <span>sur 90</span>")) + "</h1>" +
      '<div class="jours"><button type="button" class="petit-btn" data-day="-1">← Veille</button>' + (d === t ? "" : '<button type="button" class="petit-btn" data-day="0">Aujourd\'hui</button>') + '<button type="button" class="petit-btn" data-day="1">Lendemain →</button></div></div>';
    if (!plan()) html += B.kind === "local" ? '<a class="rappel" href="#reglages"><b>Débloque ton plan</b><span>Colle le code que Claude t\'a donné →</span></a>' : '<p class="note">Ton plan n\'est pas encore chargé.</p>';
    var next = !matinOk ? ["matin", "Remplir le matin"] : (!soirOk ? ["soir", "Remplir l'après-midi"] : (isSun && d === t && !semOk ? ["semaine", "Faire le bilan de la semaine"] : null));
    html += next ? '<button type="button" class="principal" data-flow="' + next[0] + '">' + esc(next[1]) + " →</button>" : '<p class="note">Journée complète. Rien d\'autre à remplir aujourd\'hui.</p>';
    if (rappelSauvegarde(d)) html += '<a class="rappel" href="#reglages"><b>Sauvegarde ta semaine</b><span>Dix secondes, dans Fichiers →</span></a>';
    html += '<section class="bloc"><h2>Deux passages par jour</h2><div class="etapes">' +
      etape(1, "Le matin", "1 minute : ta nuit et tes 3 priorités.", matinOk, "matin") +
      etape(2, "L'après-midi", "1 minute, après le travail : ce que tu as tenu et tes chiffres.", soirOk, "soir") +
      (isSun && d === t ? etape(3, "Le bilan de la semaine", "5 minutes, le dimanche soir.", semOk, "semaine") : "") +
      "</div></section>";
    var tj = tachesDuJour();
    if (d === t && tj.length) html += '<section class="bloc"><h2>À faire aujourd\'hui</h2><ul class="taches">' + tj.slice(0, 6).map(function (x) { return ligneTache(x, t); }).join("") + '</ul><a class="petit-btn" href="#taches">Toutes les tâches →</a></section>';
    if (x.p1 || x.p2 || x.p3) html += '<section class="bloc"><h2>Tes priorités</h2><ul class="prios">' + ["1", "2", "3"].filter(function (i) { return x["p" + i]; }).map(function (i) { return '<li class="' + (x["p" + i + "_ok"] === true ? "fait" : "") + '"><span class="case"></span>' + esc(x["p" + i]) + "</li>"; }).join("") + "</ul></section>";
    if (w) {
      html += '<section class="bloc"><h2>Cette semaine' + (j < 1 ? " (dès lundi)" : "") + "</h2><p class=\"titre-sem\">" + tx(w.titre) + '</p><ol class="regles">' + w.priorites.map(function (p) { return "<li>" + tx(p) + "</li>"; }).join("") + "</ol>" +
        '<div class="soir-cible"><span>Ce soir</span><b>Lumière éteinte à ' + clock(bedTarget(addDays(d, 1)) || bedTarget(d)) + "</b></div></section>";
    }
    $("#v-aujourdhui").innerHTML = html;
  }

  /* ================= Progrès ================= */
  function weekDays(m) { var o = []; for (var i = 0; i < 7; i++) o.push(addDays(m, i)); return o; }
  function agg(m) {
    var r = { noted: 0, sleep: [], beds: [], onTime: 0, bedN: 0, salle: 0, fast: 0, chambre: 0, tel: 0, ecran: [], pas: [], dep: 0, depN: 0, biz: 0, contacts: 0, etudes: 0, energie: [], pd: 0, pp: 0 };
    weekDays(m).forEach(function (d) {
      var dj = depensesDuJour(d); if (dj.length) { r.dep += dj.reduce(function (a, y) { return a + (num(y.montant) || 0); }, 0); r.depN++; }
      var x = day(d); if (!noted(x)) return;
      r.noted++;
      var s = sleepMin(x.coucher, x.reveil); if (s != null) r.sleep.push(s);
      var b = tmin(x.coucher); if (b != null) { r.beds.push(night(b)); r.bedN++; if (onTime(d, x)) r.onTime++; }
      if (x.salle === true) r.salle++;
      if (x.fastfood === true) r.fast++;
      if (x.chambre === true) r.chambre++;
      if (x.tel_loin === true) r.tel++;
      var e = num(x.ecran); if (e != null) r.ecran.push(e);
      var ps = num(x.pas); if (ps != null) r.pas.push(ps);
      var dp = num(x.depenses); if (dp != null) { r.dep += dp; r.depN++; }
      r.biz += num(x.business) || 0; r.contacts += num(x.contacts) || 0; r.etudes += num(x.etudes) || 0;
      if (x.energie) r.energie.push(x.energie);
      ["1", "2", "3"].forEach(function (i) { if (x["p" + i]) { r.pp++; if (x["p" + i + "_ok"] === true) r.pd++; } });
    });
    r.sleepAvg = avg(r.sleep); r.ecranAvg = avg(r.ecran); r.pasAvg = avg(r.pas);
    r.w = weekOf(m) || weekOf(addDays(m, 6));
    return r;
  }
  function resumeSemaine(m) {
    var a = agg(m), c = a.w ? a.w.c : null, fini = addDays(m, 6) < today();
    function cumul(v) { return fini ? v : null; }
    function ligne(nom, val, obj, ok) { return '<div class="ligne-p"><span class="n">' + tx(nom) + '</span><span class="v">' + esc(val) + "</span>" + (obj ? '<span class="o' + (ok === true ? " ok" : (ok === false ? " ko" : "")) + '">' + (ok === true ? "✓ " : (ok === false ? "✗ " : "")) + tx(obj) + "</span>" : "") + "</div>"; }
    return '<div class="lignes-p">' +
      ligne("Jours notés", a.noted + " / 7", "6 jours", cumul(a.noted >= 6)) +
      ligne("Sommeil moyen", a.sleepAvg != null ? dur(a.sleepAvg) : "—", "7 h", a.sleepAvg != null ? a.sleepAvg >= 420 : null) +
      ligne("Nuits à l'heure", a.bedN ? a.onTime + " / " + a.bedN : "—", c ? "coucher " + c.coucher : "", a.bedN ? a.onTime >= a.bedN - 1 : null) +
      (c && c.salle ? ligne("Séances de salle", String(a.salle), c.salle + " séances", cumul(a.salle >= c.salle)) : "") +
      ligne("Écran par jour", a.ecranAvg != null ? fr(a.ecranAvg, 1) + " h" : "—", c && c.ecran ? fr(c.ecran, 1) + " h max" : "", c && c.ecran && a.ecranAvg != null ? a.ecranAvg <= c.ecran : null) +
      ligne("Dépenses", a.depN ? fr(a.dep, 0) + " €" : "—", c && c.depenses ? c.depenses + " € max" : "", c && c.depenses && a.depN ? (a.dep > c.depenses ? false : cumul(true)) : null) +
      (c && c.fastfood != null ? ligne("Fast-food", String(a.fast), "1 max", a.noted ? (a.fast > 1 ? false : cumul(true)) : null) : "") +
      ligne("Pas par jour", a.pasAvg != null ? fr(a.pasAvg, 0) : "—", "", null) +
      ligne("Business", dur(a.biz), "", null) +
      (c && c.contacts ? ligne("Prospects contactés", String(a.contacts), c.contacts + " contacts", cumul(a.contacts >= c.contacts)) : "") +
      ligne("Études", dur(a.etudes), c && c.etudes ? dur(c.etudes) : "", c && c.etudes ? cumul(a.etudes >= c.etudes) : null) +
      "</div>";
  }
  function barres(m) {
    var days = weekDays(m), mx = 600, W = 340, H = 140, bw = 28, gap = (W - 7 * bw) / 6;
    function y(v) { return 10 + (H - 34) * (1 - v / mx); }
    var g = '<line x1="0" x2="' + W + '" y1="' + y(420) + '" y2="' + y(420) + '" stroke="#0A0A0A" stroke-dasharray="3 4" stroke-width="1"/><text x="' + W + '" y="' + (y(420) - 5) + '" text-anchor="end" class="ax">7 h</text>';
    days.forEach(function (d, i) {
      var x = day(d), s = sleepMin(x.coucher, x.reveil), bx = i * (bw + gap);
      if (s != null) g += '<rect x="' + bx + '" y="' + y(Math.min(s, mx)) + '" width="' + bw + '" height="' + (y(0) - y(Math.min(s, mx))) + '" rx="3" fill="' + (s >= 420 ? "#0A0A0A" : "#BDBDBD") + '"><title>' + esc(longDate(d)) + " : " + dur(s) + "</title></rect>";
      else g += '<rect x="' + bx + '" y="' + (y(0) - 2) + '" width="' + bw + '" height="2" fill="#E3E3E3"/>';
      g += '<text x="' + (bx + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">' + D1[i] + "</text>";
    });
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Sommeil de la semaine">' + g + "</svg>";
  }
  function renderProgres() {
    var m = UI.reg, w = weekOf(m) || weekOf(addDays(m, 6));
    $("#v-progres").innerHTML = '<div class="entete"><p class="sur">' + esc(shortDate(m)) + " – " + esc(shortDate(addDays(m, 6))) + "</p><h1>" + (w ? "Semaine " + w.n : "Semaine") + '</h1><div class="jours"><button type="button" class="petit-btn" data-reg="-7">← Précédente</button><button type="button" class="petit-btn" data-reg="7">Suivante →</button></div></div>' +
      '<section class="bloc"><h2>Sommeil</h2><p class="aide">Noir : 7 h ou plus. Gris : moins.</p><div class="graph">' + barres(m) + "</div></section>" +
      '<section class="bloc"><h2>Résultats de la semaine</h2>' + resumeSemaine(m) + "</section>" +
      '<a class="secondaire lien-btn" href="#plan">Voir mon plan sur 90 jours →</a>';
  }

  /* ================= Plan ================= */
  function renderPlan() {
    var p = plan();
    if (!p) { $("#v-plan").innerHTML = B.kind === "local" ? '<a class="rappel" href="#reglages"><b>Débloque ton plan</b><span>Colle le code que Claude t\'a donné →</span></a>' : '<p class="note">Ton plan n\'est pas encore chargé.</p>'; return; }
    var t = today(), cw = weekOf(t) || (jOf(t) < 1 ? p.semaines[0] : null), v = p.vision;
    function wd(w) { var s = addDays(p.debut, (w.n - 1) * 7); return shortDate(s) + " – " + shortDate(w.n === p.semaines.length ? addDays(p.debut, 89) : addDays(s, 6)); }
    var html = '<div class="entete"><p class="sur">Programme de 90 jours</p><h1>Ton plan</h1></div>';
    if (v) html += '<section class="bloc"><h2>Ta direction</h2><p class="vision">' + tx(v.lieu) + ".</p><p>" + tx(v.cinq_ans) + "</p></section>";
    html += '<section class="bloc"><h2>Tes objectifs à 90 jours</h2><dl class="objs">' + p.objectifs.map(function (o) { return "<div><dt>" + tx(o.nom) + "</dt><dd>" + tx(o.mesure) + "</dd></div>"; }).join("") + "</dl></section>";
    html += '<section class="bloc"><h2>Les 13 semaines</h2><div class="semaines">' + p.semaines.map(function (w) {
      var now = cw === w;
      return '<details class="sem' + (now ? " now" : "") + '"' + (now ? " open" : "") + '><summary><span class="sn">' + w.n + '</span><span class="st"><b>' + tx(w.titre) + "</b><small>" + esc(wd(w)) + (now ? " · en cours" : "") + '</small></span></summary><ol class="regles">' + w.priorites.map(function (x) { return "<li>" + tx(x) + "</li>"; }).join("") + '</ol><ul class="actions">' + w.actions.map(function (x) { return "<li>" + tx(x) + "</li>"; }).join("") + "</ul></details>";
    }).join("") + "</div></section>";
    html += '<section class="bloc"><h2>Ce qui est décidé</h2><ul class="actions">' + p.decisions.map(function (x) { return "<li>" + tx(x) + "</li>"; }).join("") + "</ul></section>";
    html += '<section class="bloc"><h2>Ton point de départ</h2><p class="aide">Ton audit du 22 novembre. Note sur 10.</p><div class="semaines">' + p.audit.map(function (dm) {
      return '<details class="sem"><summary><span class="sn">' + dm.note + '</span><span class="st"><b>' + tx(dm.nom) + "</b><small>" + esc(dm.urg) + '</small></span></summary><p class="aide">' + tx(dm.justif) + '</p><ol class="regles">' + dm.recos.map(function (x) { return "<li>" + tx(x) + "</li>"; }).join("") + "</ol></details>";
    }).join("") + "</div></section>";
    $("#v-plan").innerHTML = html;
  }

  /* ================= Bienvenue, code du plan, sauvegarde, résumé ================= */
  function toast(t) { var el = document.createElement("div"); el.className = "toast"; el.textContent = t; el.setAttribute("role", "status"); document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2100); }
  function normCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function b64bytes(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function estInstallee() { return window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches); }
  /* Le plan est publié chiffré (plan.enc.json, AES-GCM). Seul le code donné par Claude l'ouvre. */
  function dechiffre(code) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error("crypto"));
    return fetch("plan.enc.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("absent"); return r.json(); })
      .catch(function () { throw new Error("absent"); })
      .then(function (enc) {
        return crypto.subtle.importKey("raw", new TextEncoder().encode(normCode(code)), "PBKDF2", false, ["deriveKey"]).then(function (base) {
          return crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64bytes(enc.salt), iterations: enc.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        }).then(function (key) {
          return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64bytes(enc.iv) }, key, b64bytes(enc.data));
        }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
      });
  }
  function installePlan(bundle) {
    file("plan.json").data = bundle.plan;
    Object.keys(bundle.fichiers || {}).forEach(function (p) {
      var f = file(p), src = bundle.fichiers[p];
      Object.keys(src).forEach(function (k) { if (f.data[k] === undefined) f.data[k] = src[k]; });
    });
    saveNow();
  }
  function debloque() {
    var input = $("#code-in"), msg = $("#code-msg"), btn = $("[data-unlock]");
    if (!input || !btn) return;
    var code = normCode(input.value);
    if (code.length < 12) { msg.textContent = "Colle le code en entier : 12 caractères."; input.focus(); return; }
    msg.textContent = "Ouverture…"; btn.disabled = true;
    dechiffre(code).then(function (bundle) {
      installePlan(bundle); LS.del("plus-tard"); toast("Plan débloqué"); location.hash = "#aujourdhui"; route();
    }, function (e) {
      btn.disabled = false;
      var m = e && e.message;
      msg.textContent = m === "absent" ? "Impossible de joindre ton plan. Vérifie ta connexion et réessaie." : (m === "crypto" ? "Ouvre LIFE OS depuis l'icône de l'écran d'accueil, puis réessaie." : "Ce code ne marche pas. Vérifie-le et réessaie.");
    });
  }
  function champCode() {
    return '<input class="champ-l code" id="code-in" type="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" maxlength="24" placeholder="XXXX-XXXX-XXXX" aria-label="Code du plan">' +
      '<p class="aide" id="code-msg" role="status"></p><button type="button" class="principal" data-unlock>Débloquer mon plan</button>';
  }
  var INSTALLER = '<ol class="regles"><li>Touche <b>Partager</b> en bas de Safari.</li><li>Choisis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.</li><li>Ouvre LIFE OS depuis l\'icône.</li></ol>';
  function renderBienvenue() {
    var inst = estInstallee();
    $("#v-bienvenue").innerHTML =
      '<div class="accueil-b entre"><img class="logo-b" src="icons/icon-192.png" alt="" width="76" height="76"><h1>LIFE OS</h1><p class="aide">Tout reste sur ton iPhone. Aucun compte, aucune clé.</p></div>' +
      (inst ? "" : '<section class="carte"><p class="etape-n">1</p><h2>Installe l\'app</h2>' + INSTALLER + '<p class="aide">Tes données sont rangées dans l\'app installée, pas dans Safari : fais l\'étape 2 depuis l\'icône.</p></section>') +
      '<section class="carte">' + (inst ? "" : '<p class="etape-n">2</p>') + '<h2>Débloque ton plan</h2><p class="aide">Colle le code que Claude t\'a donné. Une seule fois.</p>' + champCode() + "</section>" +
      '<button type="button" class="lien-discret" data-later>Plus tard</button>';
  }
  function joursDepuis(s) { return s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : null; }
  function ilYa(s) { var d = joursDepuis(s); if (d == null) return "jamais"; return d <= 0 ? "aujourd'hui" : (d === 1 ? "hier" : "il y a " + d + " jours"); }
  function rappelSauvegarde(d) {
    if (B.kind !== "local" || !plan() || d !== today()) return false;
    var s = LS.get("sauvegarde");
    return s ? joursDepuis(s) >= 7 : jOf(d) >= 6;
  }
  function renderReglages() {
    var html = '<div class="entete"><p class="sur">Réglages</p><h1>Tes données</h1></div>';
    if (B.kind === "db") {
      html += '<section class="carte"><h2>Enregistrement</h2><p>Tes données sont dans ton espace privé claude.ai.</p><button type="button" class="principal" data-sync>Enregistrer maintenant</button></section>';
    } else {
      if (!estInstallee()) html += '<section class="carte"><h2>Tu es dans Safari</h2><p class="aide">Installe l\'app pour garder tes données au même endroit :</p>' + INSTALLER + "</section>";
      html += '<section class="carte"><h2>Ton plan</h2>' + (plan() ? "<p>Débloqué et enregistré sur cet iPhone.</p>" : '<p class="aide">Colle le code que Claude t\'a donné.</p>' + champCode()) + "</section>" +
        '<section class="carte"><h2>Sauvegarde</h2><p>Dernière sauvegarde : <b>' + ilYa(LS.get("sauvegarde")) + '</b></p><p class="aide">Tout reste sur cet iPhone. Si tu supprimes l\'app de l\'écran d\'accueil, ses données partent avec. Sauvegarde chaque dimanche dans Fichiers ou iCloud Drive : dix secondes.</p>' +
        '<button type="button" class="principal" data-export>Sauvegarder maintenant</button><button type="button" class="secondaire" data-import>Restaurer une sauvegarde</button></section>';
    }
    html += '<section class="carte"><h2>Faire le point avec Claude</h2><p class="aide">Tes 7 derniers jours en texte, à coller dans une conversation avec Claude.</p><button type="button" class="secondaire" data-resume>Partager mon résumé</button><p class="aide" id="resume-msg" role="status"></p></section>';
    $("#v-reglages").innerHTML = html;
  }
  function exporte() {
    var data = { app: "LIFE OS", version: 1, exporte: new Date().toISOString(), fichiers: {} };
    Object.keys(files).forEach(function (p) { data.fichiers[p] = files[p].data; });
    var nom = "life-os-" + today() + ".json", txt = JSON.stringify(data);
    function ok() { LS.set("sauvegarde", new Date().toISOString()); toast("Sauvegardé"); if (UI.view === "reglages") renderReglages(); }
    function telecharge() {
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" })); a.download = nom;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); ok();
    }
    try {
      var f = new File([txt], nom, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], title: "Sauvegarde LIFE OS" }).then(ok, function (e) { if (!e || e.name !== "AbortError") telecharge(); });
        return;
      }
    } catch (e) { /* on passe au téléchargement */ }
    telecharge();
  }
  var CHEMIN_OK = /^(plan|listes\/taches|(jours|sport|argent)\/\d{4}-\d{2}|semaines\/\d{4})\.json$/;
  function importe(fichier) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || d.app !== "LIFE OS" || !d.fichiers || typeof d.fichiers !== "object") throw new Error("format");
        var chemins = Object.keys(d.fichiers).filter(function (p) { return CHEMIN_OK.test(p) && d.fichiers[p] && typeof d.fichiers[p] === "object"; });
        if (!chemins.length) throw new Error("vide");
        chemins.forEach(function (p) { var f = file(p); f.data = d.fichiers[p]; f.dirty = {}; Object.keys(f.data).forEach(function (k) { f.dirty[k] = ++rev; }); });
        saveNow(); scheduleSync(0); toast("Sauvegarde restaurée"); location.hash = "#aujourdhui"; route();
      } catch (e) { toast("Ce fichier n'est pas une sauvegarde LIFE OS"); }
    };
    r.readAsText(fichier);
  }
  function resumeTexte() {
    var t = today(), m = mondayOf(t), a = agg(m), L = [], j = jOf(t);
    L.push("LIFE OS · résumé du " + longDate(t) + (plan() && j >= 1 && j <= 90 ? " (jour " + j + " sur 90)" : ""));
    L.push("");
    L.push("Semaine du " + shortDate(m) + " : " + a.noted + "/7 jours notés · sommeil moyen " + (a.sleepAvg != null ? dur(a.sleepAvg) : "—") + " · nuits à l'heure " + (a.bedN ? a.onTime + "/" + a.bedN : "—") +
      " · salle " + a.salle + " · écran " + (a.ecranAvg != null ? fr(a.ecranAvg, 1) + " h/j" : "—") + " · pas " + (a.pasAvg != null ? fr(a.pasAvg, 0) + "/j" : "—") +
      " · business " + dur(a.biz) + " · prospects " + a.contacts + " · études " + dur(a.etudes) + " · fast-food " + a.fast + " · dépenses " + fr(a.dep, 0) + " €");
    L.push(""); L.push("7 derniers jours :");
    for (var i = 6; i >= 0; i--) {
      var d = addDays(t, -i), x = day(d), p = [];
      if (x.coucher || x.reveil) p.push("nuit " + (x.coucher || "?") + " → " + (x.reveil || "?"));
      if (x.tel_loin === true || x.tel_loin === false) p.push("téléphone loin du lit : " + (x.tel_loin ? "oui" : "non"));
      if (x.salle === true) p.push("salle");
      if (x.fastfood === true) p.push("fast-food");
      if (num(x.ecran) != null) p.push("écran " + fr(num(x.ecran), 1) + " h");
      if (num(x.pas) != null) p.push(fr(num(x.pas), 0) + " pas");
      if (num(x.business) != null) p.push("business " + fr(num(x.business), 0) + " min");
      if (num(x.contacts) != null) p.push(fr(num(x.contacts), 0) + " prospects");
      if (num(x.etudes) != null) p.push("études " + fr(num(x.etudes), 0) + " min");
      var pr = ["1", "2", "3"].filter(function (k) { return x["p" + k]; });
      if (pr.length) p.push("priorités " + pr.filter(function (k) { return x["p" + k + "_ok"] === true; }).length + "/" + pr.length);
      var dj = depensesDuJour(d).reduce(function (s, y) { return s + (num(y.montant) || 0); }, 0);
      if (dj) p.push("dépenses " + euros(dj));
      if (x.difficultes) p.push("coincé : " + x.difficultes);
      L.push("- " + shortDate(d) + " : " + (p.length ? p.join(", ") : "rien noté"));
    }
    var ss = seances(1).filter(function (s) { return s.date >= addDays(t, -13); });
    if (ss.length) {
      L.push(""); L.push("Sport (14 jours) :");
      ss.forEach(function (s) { L.push("- " + shortDate(s.date) + " " + (s.type || "") + " : " + (s.exos || []).map(function (e) { return (e.nom || "?") + " " + resumeSeries(e.series || []); }).join(" ; ")); });
    }
    var ym = t.slice(0, 7), b = bilanMois(ym), cats = Object.keys(b.cats).sort(function (x, y) { return b.cats[y] - b.cats[x]; });
    L.push(""); L.push("Argent " + nomMois(ym) + " : entrées " + euros(b.entrees) + ", sorties " + euros(b.sorties) + ", mis de côté " + euros(b.epargne) + ", reste " + euros(b.reste) + (cats.length ? " · " + cats.slice(0, 5).map(function (c) { return c + " " + euros(b.cats[c]); }).join(", ") : ""));
    var tt = taches(), ouv = tt.filter(function (x) { return !x.fait; });
    L.push("Tâches : " + ouv.length + " à faire (" + ouv.filter(function (x) { return x.date && x.date < t; }).length + " en retard), " + tt.filter(function (x) { return x.fait && x.faitLe && x.faitLe.slice(0, 10) >= m; }).length + " faites cette semaine.");
    return L.join("\n");
  }
  function envoieResume(btn) {
    var txt = resumeTexte(), msg = $("#resume-msg");
    function dit(m) { if (msg) msg.textContent = m; }
    function montre() {
      if ($("#resume-txt")) return;
      var ta = document.createElement("textarea"); ta.id = "resume-txt"; ta.className = "champ-l"; ta.value = txt; ta.rows = 8; ta.readOnly = true;
      btn.insertAdjacentElement("afterend", ta); ta.focus(); ta.select(); dit("Sélectionne le texte, copie-le et colle-le dans ta conversation avec Claude.");
    }
    function copie() { try { navigator.clipboard.writeText(txt).then(function () { dit("Copié. Colle-le dans ta conversation avec Claude."); toast("Résumé copié"); }, montre); } catch (e) { montre(); } }
    if (navigator.share && B.kind === "local") { navigator.share({ text: txt }).then(function () { dit("Partagé."); }, function (e) { if (!e || e.name !== "AbortError") copie(); }); return; }
    copie();
  }

  /* Retour tactile : vibration légère sur iPhone (iOS 18 et plus) et Android, ignorée ailleurs. */
  function haptic() {
    try {
      if (navigator.vibrate) { navigator.vibrate(8); return; }
      var l = document.createElement("label"), i = document.createElement("input");
      l.setAttribute("aria-hidden", "true"); l.style.display = "none";
      i.type = "checkbox"; i.setAttribute("switch", ""); l.appendChild(i);
      document.head.appendChild(l); l.click(); document.head.removeChild(l);
    } catch (e) { /* rien */ }
  }
  var TOUCHE = "button, .nav a, a.principal, a.secondaire, a.petit-btn";
  var ONDE = ".principal, .secondaire, .opt, .puce, .etape, .petit-btn, .seance-l, .rond, .nav a, .etat";
  var CALME = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  document.addEventListener("touchstart", function () { /* active l'état :active sur iPhone */ }, { passive: true });
  document.addEventListener("pointerdown", function (e) {
    if (CALME.matches || !e.target.closest) return;
    var b = e.target.closest(ONDE); if (!b || b.disabled) return;
    var r = b.getBoundingClientRect();
    b.style.setProperty("--x", (e.clientX - r.left) + "px"); b.style.setProperty("--y", (e.clientY - r.top) + "px");
    b.classList.remove("onde"); void b.offsetWidth; b.classList.add("onde");
  }, { passive: true });
  document.addEventListener("animationend", function (e) { if (e.animationName === "onde" && e.target.classList) e.target.classList.remove("onde"); });
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(TOUCHE); if (b && !b.disabled) haptic(); }, true);

  /* ================= Données génériques (tâches, sport, argent) ================= */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function getData(path) { var f = files[path]; return f ? f.data : {}; }
  function setKey(path, k, v) { var f = file(path), cur = Object.assign({}, f.data); if (v == null) delete cur[k]; else cur[k] = v; f.data = cur; f.dirty[k] = ++rev; persist(); scheduleSync(); }
  function moisPath(prefix, d) { return prefix + "/" + d.slice(0, 7) + ".json"; }
  function moisPrec(ym, n) { var d = parseISO(ym + "-01"); d.setMonth(d.getMonth() - n); return iso(d).slice(0, 7); }
  var fMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  function nomMois(ym) { return cap(fMois.format(parseISO(ym + "-01"))); }
  function euros(n) { return (Math.round(n * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €"; }
  var ARMED = {};
  function arme(key) { if (ARMED[key] && Date.now() - ARMED[key] < 4000) { delete ARMED[key]; return true; } ARMED[key] = Date.now(); return false; }

  /* ================= Tâches ================= */
  var TPATH = "listes/taches.json";
  UI.tDate = "auj";
  function taches() { var d = getData(TPATH); return Object.keys(d).map(function (id) { return Object.assign({ id: id }, d[id]); }); }
  function ligneTache(x, t) {
    var retard = !x.fait && x.date && x.date < t, lbl = x.date ? (x.date === t ? "Aujourd'hui" : (x.date === addDays(t, 1) ? "Demain" : cap(fJour.format(parseISO(x.date))))) : "";
    return '<li class="tache' + (x.fait ? " fait" : "") + '"><button type="button" class="tcoche" data-t-ok="' + x.id + '" aria-pressed="' + !!x.fait + '" aria-label="Marquer comme faite"><span class="case"></span></button>' +
      '<span class="tt">' + esc(x.t) + (lbl ? '<small' + (retard ? ' class="retard"' : "") + ">" + (retard ? "En retard · " : "") + esc(lbl) + "</small>" : "") + "</span>" +
      '<button type="button" class="tsuppr" data-t-del="' + x.id + '" aria-label="Supprimer">' + (ARMED["t" + x.id] ? "Supprimer ?" : "×") + "</button></li>";
  }
  function renderTaches() {
    var t = today(), all = taches(), open = all.filter(function (x) { return !x.fait; });
    var groupes = [
      ["En retard", open.filter(function (x) { return x.date && x.date < t; })],
      ["Aujourd'hui", open.filter(function (x) { return x.date === t; })],
      ["À venir", open.filter(function (x) { return x.date && x.date > t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })],
      ["Sans date", open.filter(function (x) { return !x.date; })]
    ];
    var faites = all.filter(function (x) { return x.fait; }).sort(function (a, b) { return (b.faitLe || "") < (a.faitLe || "") ? -1 : 1; }).slice(0, 20);
    var html = '<div class="entete"><p class="sur">' + open.length + " à faire</p><h1>Tâches</h1></div>" +
      '<form class="ajout-t" id="form-t"><input class="champ-l" id="t-in" type="text" placeholder="Nouvelle tâche" autocomplete="off" enterkeyhint="done">' +
      '<div class="puces-choix">' + [["auj", "Aujourd'hui"], ["dem", "Demain"], ["sans", "Sans date"]].map(function (c) { return '<button type="button" class="puce" data-t-date="' + c[0] + '" aria-pressed="' + (UI.tDate === c[0]) + '">' + c[1] + "</button>"; }).join("") +
      '</div><button type="submit" class="principal">Ajouter</button></form>';
    groupes.forEach(function (g) { if (g[1].length) html += '<section class="bloc"><h2>' + g[0] + '</h2><ul class="taches">' + g[1].map(function (x) { return ligneTache(x, t); }).join("") + "</ul></section>"; });
    if (!open.length) html += '<p class="note">Rien à faire pour l\'instant. Ajoute ta première tâche ci-dessus.</p>';
    if (faites.length) html += '<details class="bloc pli-t"><summary><h2>Faites (' + faites.length + ")</h2></summary><ul class=\"taches\">" + faites.map(function (x) { return ligneTache(x, t); }).join("") + "</ul></details>";
    $("#v-taches").innerHTML = html;
  }
  function tachesDuJour() { var t = today(); return taches().filter(function (x) { return !x.fait && x.date && x.date <= t; }); }

  /* ================= Sport ================= */
  var SUGG = {
    Push: ["Développé couché", "Développé incliné haltères", "Développé militaire", "Dips", "Élévations latérales", "Extensions triceps poulie"],
    Pull: ["Tractions", "Rowing barre", "Tirage vertical", "Rowing haltère", "Curl biceps", "Face pull"],
    Legs: ["Squat", "Presse à cuisses", "Soulevé de terre roumain", "Leg curl", "Leg extension", "Mollets debout"],
    Autre: ["Cardio", "Gainage", "Abdos"]
  };
  function seances(mois) {
    var out = [];
    for (var i = 0; i < (mois || 3); i++) {
      var ym = moisPrec(today().slice(0, 7), i), p = "sport/" + ym + ".json", d = getData(p);
      Object.keys(d).forEach(function (id) { out.push(Object.assign({ id: id, path: p }, d[id])); });
    }
    return out.sort(function (a, b) { return a.date === b.date ? ((b.cree || "") < (a.cree || "") ? -1 : 1) : (a.date < b.date ? 1 : -1); });
  }
  function volume(s) { var v = 0, n = 0; (s.exos || []).forEach(function (e) { (e.series || []).forEach(function (x) { var r = num(x.reps) || 0, k = num(x.kg) || 0; if (r) { n++; v += r * k; } }); }); return { v: v, n: n }; }
  function derniereFois(nom, saufId) {
    if (!nom) return null;
    var key = nom.trim().toLowerCase(), list = seances(3);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === saufId) continue;
      var e = (list[i].exos || []).filter(function (x) { return (x.nom || "").trim().toLowerCase() === key; })[0];
      if (e && e.series && e.series.length) return { date: list[i].date, series: e.series };
    }
    return null;
  }
  function resumeSeries(series) {
    var ok = series.filter(function (x) { return num(x.reps); });
    if (!ok.length) return "";
    var maxKg = Math.max.apply(null, ok.map(function (x) { return num(x.kg) || 0; }));
    return ok.length + " série" + (ok.length > 1 ? "s" : "") + " · " + ok.map(function (x) { return num(x.reps); }).join("-") + " reps" + (maxKg ? " · " + fr(maxKg, 1) + " kg" : "");
  }
  function renderSport() {
    var list = seances(3), t = today(), m = mondayOf(t), w = weekOrFirst(t);
    var semaine = list.filter(function (s) { return s.date >= m && s.date <= addDays(m, 6); }).length;
    var html = '<div class="entete"><p class="sur">' + semaine + " séance" + (semaine > 1 ? "s" : "") + " cette semaine" + (w && w.c.salle ? " · objectif " + w.c.salle : "") + "</p><h1>Sport</h1></div>" +
      '<section class="bloc"><h2>Nouvelle séance</h2><div class="types">' + Object.keys(SUGG).map(function (ty) { return '<button type="button" class="opt" data-sp-new="' + ty + '">' + ty + "</button>"; }).join("") + "</div></section>";
    if (list.length) {
      html += '<section class="bloc"><h2>Tes séances</h2><div class="seances">' + list.slice(0, 30).map(function (s) {
        var v = volume(s);
        return '<button type="button" class="seance-l" data-sp-open="' + s.path + "|" + s.id + '"><span><b>' + esc(s.type || "Séance") + "</b><small>" + esc(cap(fJour.format(parseISO(s.date)))) + "</small></span><span class=\"sv\">" + (s.exos || []).length + " exos · " + v.n + " séries" + (v.v ? "<small>" + Math.round(v.v).toLocaleString("fr-FR") + " kg soulevés</small>" : "") + "</span></button>";
      }).join("") + "</div></section>";
      var best = {};
      list.forEach(function (s) { (s.exos || []).forEach(function (e) { var nm = (e.nom || "").trim(); if (!nm) return; (e.series || []).forEach(function (x) { var k = num(x.kg) || 0, r = num(x.reps) || 0; if (r && (!best[nm] || k > best[nm].kg)) best[nm] = { kg: k, reps: r, date: s.date }; }); }); });
      var noms = Object.keys(best).filter(function (n) { return best[n].kg > 0; });
      if (noms.length) html += '<section class="bloc"><h2>Tes records (3 derniers mois)</h2><div class="lignes-p">' + noms.map(function (n) { return '<div class="ligne-p"><span class="n">' + esc(n) + '</span><span class="v">' + fr(best[n].kg, 1) + ' kg</span><span class="o">' + best[n].reps + " reps · " + esc(shortDate(best[n].date)) + "</span></div>"; }).join("") + "</div></section>";
    } else html += '<p class="note">Aucune séance notée. Choisis Push, Pull ou Legs pour commencer.</p>';
    $("#v-sport").innerHTML = html;
  }
  function seanceCourante() { var s = UI.seance; if (!s) return null; var d = getData(s.path)[s.id]; return d ? clone(d) : null; }
  function sauveSeance(s) {
    var path = moisPath("sport", s.date);
    if (path !== UI.seance.path) { setKey(UI.seance.path, UI.seance.id, null); UI.seance.path = path; }
    setKey(path, UI.seance.id, s);
    if (volume(s).n > 0 && day(s.date).salle !== true) setDay(s.date, "salle", true);
  }
  function renderSeance() {
    var s = seanceCourante();
    if (!s) { location.hash = "#sport"; return; }
    var sugg = (SUGG[s.type] || SUGG.Autre).filter(function (n) { return !(s.exos || []).some(function (e) { return (e.nom || "").toLowerCase() === n.toLowerCase(); }); });
    var html = '<div class="flow-top"><a class="retour" href="#sport">← Sport</a><span class="compte">' + volume(s).n + " séries</span></div>" +
      '<div class="entete"><h1>' + esc(s.type || "Séance") + '</h1><input class="champ-date" type="date" data-sp-date value="' + esc(s.date) + '" aria-label="Date de la séance"></div>';
    (s.exos || []).forEach(function (e, i) {
      var prev = derniereFois(e.nom, UI.seance.id);
      html += '<section class="exo"><div class="exo-h"><input class="exo-nom" type="text" data-sp-nom="' + i + '" value="' + esc(e.nom || "") + '" placeholder="Nom de l\'exercice" list="exos-liste" autocomplete="off"><button type="button" class="tsuppr" data-sp-delexo="' + i + '" aria-label="Retirer l\'exercice">' + (ARMED["e" + i] ? "Retirer ?" : "×") + "</button></div>" +
        (prev ? '<p class="aide">Dernière fois (' + esc(shortDate(prev.date)) + ") : " + esc(resumeSeries(prev.series)) + "</p>" : "") +
        '<div class="series">' + (e.series || []).map(function (x, j) {
          return '<div class="serie"><span class="sn">' + (j + 1) + '</span><label><input type="text" inputmode="numeric" data-sp-s="' + i + "|" + j + '|reps" value="' + esc(x.reps == null ? "" : x.reps) + '" placeholder="0"><em>reps</em></label><span class="x">×</span><label><input type="text" inputmode="decimal" data-sp-s="' + i + "|" + j + '|kg" value="' + esc(x.kg == null ? "" : String(x.kg).replace(".", ",")) + '" placeholder="0"><em>kg</em></label><button type="button" class="tsuppr" data-sp-dels="' + i + "|" + j + '" aria-label="Retirer la série">×</button></div>';
        }).join("") + '</div><button type="button" class="secondaire petit" data-sp-addset="' + i + '">+ Série</button></section>';
    });
    html += '<section class="bloc"><h2>Ajouter un exercice</h2><div class="puces-choix">' + sugg.map(function (n) { return '<button type="button" class="puce" data-sp-addexo="' + esc(n) + '">' + esc(n) + "</button>"; }).join("") + '<button type="button" class="puce" data-sp-addexo="">Autre…</button></div></section>' +
      '<datalist id="exos-liste">' + [].concat(SUGG.Push, SUGG.Pull, SUGG.Legs, SUGG.Autre).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>" +
      '<section class="bloc"><h2>Note</h2><textarea class="champ-l" data-sp-note rows="2" placeholder="Sensations, douleur, énergie…">' + esc(s.note || "") + "</textarea></section>" +
      '<a class="principal lien-btn" href="#sport">Séance enregistrée ✓</a>' +
      '<button type="button" class="secondaire" data-sp-delseance>' + (ARMED.seance ? "Confirmer la suppression" : "Supprimer la séance") + "</button>";
    $("#v-seance").innerHTML = html;
    $$("#v-seance textarea").forEach(grow);
  }

  /* ================= Argent ================= */
  var CATS_OUT = ["Fast-food", "Courses", "Sorties", "Vêtements", "Abonnements", "Téléphone", "Transport", "Salle", "Tech", "Autre", "Épargne"];
  var CATS_IN = ["Salaire", "Client", "Vente", "Autre"];
  UI.mois = today().slice(0, 7);
  function mouvements(ym) { var p = "argent/" + ym + ".json", d = getData(p); return Object.keys(d).map(function (id) { return Object.assign({ id: id, path: p }, d[id]); }); }
  function bilanMois(ym) {
    var l = mouvements(ym), r = { entrees: 0, sorties: 0, epargne: 0, cats: {}, n: l.length };
    l.forEach(function (x) {
      var m = num(x.montant) || 0;
      if (x.sens === "in") r.entrees += m;
      else if (x.cat === "Épargne") r.epargne += m;
      else { r.sorties += m; r.cats[x.cat || "Autre"] = (r.cats[x.cat || "Autre"] || 0) + m; }
    });
    r.reste = r.entrees - r.sorties - r.epargne;
    return r;
  }
  function depensesDuJour(d) { return mouvements(d.slice(0, 7)).filter(function (x) { return x.date === d && x.sens !== "in" && x.cat !== "Épargne" && x.auto !== "fixes"; }); }
  function renderArgent() {
    var ym = UI.mois, b = bilanMois(ym), bp = bilanMois(moisPrec(ym, 1)), cur = ym === today().slice(0, 7), p = plan();
    var html = '<div class="entete"><p class="sur">Entrées et sorties</p><h1>' + esc(nomMois(ym)) + '</h1><div class="jours"><button type="button" class="petit-btn" data-ar-mois="-1">← Mois précédent</button>' + (cur ? "" : '<button type="button" class="petit-btn" data-ar-mois="1">Mois suivant →</button>') + "</div></div>" +
      '<div class="chiffres-ar"><div><span>Entrées</span><b>' + euros(b.entrees) + '</b></div><div><span>Sorties</span><b>' + euros(b.sorties) + '</b></div><div><span>Mis de côté</span><b>' + euros(b.epargne) + '</b></div><div class="fort"><span>Reste</span><b>' + euros(b.reste) + "</b></div></div>" +
      '<div class="deux-btn"><button type="button" class="principal" data-ar-add="out">+ Dépense</button><button type="button" class="secondaire" data-ar-add="in">+ Entrée</button></div>';
    if (p && (p.fixes || p.salaire)) {
      var deja = mouvements(ym).some(function (x) { return x.auto === "fixes"; }), dejaS = mouvements(ym).some(function (x) { return x.auto === "salaire"; });
      if (!deja || !dejaS) html += '<div class="deux-btn">' + (!dejaS && p.salaire ? '<button type="button" class="secondaire petit" data-ar-auto="salaire">Ajouter mon salaire (' + euros(p.salaire) + ")</button>" : "") + (!deja && p.fixes ? '<button type="button" class="secondaire petit" data-ar-auto="fixes">Ajouter mes fixes (' + euros(p.fixes.reduce(function (a, f) { return a + f[1]; }, 0)) + ")</button>" : "") + "</div>";
    }
    if (b.n) {
      var cats = Object.keys(b.cats).sort(function (a, c) { return b.cats[c] - b.cats[a]; }), mx = cats.length ? b.cats[cats[0]] : 1;
      var jours = cur ? parseISO(today()).getDate() : new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), nbj = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
      var an = [];
      var fixesMois = mouvements(ym).filter(function (x) { return x.sens !== "in" && x.auto === "fixes"; }).reduce(function (t, x) { return t + (num(x.montant) || 0); }, 0), vari = b.sorties - fixesMois;
      an.push(["Dépenses variables par jour", euros(vari / Math.max(1, jours))]);
      if (cur && jours < nbj) an.push(["Projection fin de mois (sorties)", euros(fixesMois + vari / jours * nbj)]);
      if (b.entrees) an.push(["Part du salaire épargnée", Math.round(b.epargne / b.entrees * 100) + " %"]);
      if (bp.n) an.push(["Sorties vs mois précédent", (b.sorties >= bp.sorties ? "+ " : "− ") + euros(Math.abs(b.sorties - bp.sorties))]);
      if (b.cats["Fast-food"] != null) an.push(["Fast-food (objectif 100 € max)", euros(b.cats["Fast-food"]) + (b.cats["Fast-food"] > 100 ? " · dépassé" : " · tenu")]);
      html += '<section class="bloc"><h2>Analyse</h2><div class="lignes-p">' + an.map(function (a) { return '<div class="ligne-p"><span class="n">' + tx(a[0]) + '</span><span class="v">' + esc(a[1]) + "</span></div>"; }).join("") + "</div></section>";
      if (cats.length) html += '<section class="bloc"><h2>Où part l\'argent</h2><div class="cats">' + cats.map(function (c) { return '<div class="cat"><span class="cn">' + esc(c) + '</span><span class="cb"><i style="width:' + Math.max(3, b.cats[c] / mx * 100) + '%"></i></span><span class="cv">' + euros(b.cats[c]) + "</span></div>"; }).join("") + "</div></section>";
      var parJour = {};
      mouvements(ym).forEach(function (x) { (parJour[x.date] = parJour[x.date] || []).push(x); });
      html += '<section class="bloc"><h2>Détail</h2>' + Object.keys(parJour).sort().reverse().map(function (d) {
        return '<div class="jour-ar"><p class="jd">' + esc(cap(fJour.format(parseISO(d)))) + '</p><ul class="taches">' + parJour[d].sort(function (a, c) { return (c.cree || "") < (a.cree || "") ? -1 : 1; }).map(function (x) {
          return '<li class="mvt"><span class="tt">' + esc(x.cat || "Autre") + (x.note ? "<small>" + esc(x.note) + "</small>" : "") + '</span><span class="mm' + (x.sens === "in" ? " in" : "") + '">' + (x.sens === "in" ? "+ " : "− ") + euros(num(x.montant) || 0) + '</span><button type="button" class="tsuppr" data-ar-del="' + x.path + "|" + x.id + '" aria-label="Supprimer">' + (ARMED["a" + x.id] ? "Suppr. ?" : "×") + "</button></li>";
        }).join("") + "</ul></div>";
      }).join("") + "</section>";
    } else html += '<p class="note">Rien de noté ce mois-ci. Commence par ton salaire et tes dépenses fixes.</p>';
    $("#v-argent").innerHTML = html;
  }
  UI.ajout = { sens: "out", cat: "Fast-food" };
  function renderAjout() {
    var a = UI.ajout, cats = a.sens === "in" ? CATS_IN : CATS_OUT;
    if (cats.indexOf(a.cat) < 0) a.cat = cats[0];
    $("#v-ajout").innerHTML = '<div class="flow-top"><a class="retour" href="#argent">← Argent</a><span class="compte"></span></div>' +
      '<div class="question"><h1>' + (a.sens === "in" ? "Nouvelle entrée" : "Nouvelle dépense") + '</h1><div class="nombre"><input class="grand-nombre" type="text" inputmode="decimal" id="ar-m" placeholder="0" autocomplete="off"><span>€</span></div>' +
      '<p class="lbl">Catégorie</p><div class="puces-choix">' + cats.map(function (c) { return '<button type="button" class="puce" data-ar-cat="' + esc(c) + '" aria-pressed="' + (a.cat === c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
      '<p class="lbl">Date</p><input class="champ-l" type="date" id="ar-d" value="' + esc(a.date || today()) + '">' +
      '<p class="lbl">Note (facultatif)</p><input class="champ-l" type="text" id="ar-n" placeholder="ex. McDo le midi" autocomplete="off"></div>' +
      '<div class="flow-bas"><button type="button" class="principal" data-ar-save>Enregistrer</button></div>';
    setTimeout(function () { var m = $("#ar-m"); if (m) try { m.focus(); } catch (e) { /* rien */ } }, 60);
  }
  function ajouteMvt(sens, montant, cat, date, note, auto) {
    var x = { date: date, sens: sens, montant: montant, cat: cat, cree: new Date().toISOString() };
    if (note) x.note = note; if (auto) x.auto = auto;
    setKey(moisPath("argent", date), uid(), x);
  }

  /* Écran du soir : les dépenses du jour, ajoutées en deux touches */
  UI.qcat = "Fast-food";
  function ctlDepenses() {
    var l = depensesDuJour(UI.day), tot = l.reduce(function (a, x) { return a + (num(x.montant) || 0); }, 0);
    return '<div class="nombre"><input class="grand-nombre" type="text" inputmode="decimal" id="qd-m" placeholder="0" autocomplete="off"><span>€</span></div>' +
      '<div class="puces-choix">' + CATS_OUT.filter(function (c) { return c !== "Épargne"; }).map(function (c) { return '<button type="button" class="puce" data-qd-cat="' + esc(c) + '" aria-pressed="' + (UI.qcat === c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
      '<button type="button" class="secondaire" data-qd-add>Ajouter cette dépense</button>' +
      '<div class="lignes-p">' + l.map(function (x) { return '<div class="ligne-p"><span class="n">' + esc(x.cat) + '</span><span class="v">' + euros(num(x.montant) || 0) + "</span></div>"; }).join("") +
      '<div class="ligne-p"><span class="n"><b>Total du jour</b></span><span class="v">' + euros(tot) + "</span></div></div>";
  }

  /* ================= Événements des modules ================= */
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "form-t") return;
    e.preventDefault();
    var v = ($("#t-in").value || "").trim(); if (!v) return;
    var t = today(), date = UI.tDate === "auj" ? t : (UI.tDate === "dem" ? addDays(t, 1) : null);
    var x = { t: v, fait: false, cree: new Date().toISOString() }; if (date) x.date = date;
    setKey(TPATH, uid(), x); renderTaches(); var inp = $("#t-in"); if (inp) inp.focus();
  });
  document.addEventListener("input", function (e) {
    var el = e.target, a;
    if ((a = el.getAttribute("data-sp-s"))) { var s = seanceCourante(), p = a.split("|"); s.exos[+p[0]].series[+p[1]][p[2]] = p[2] === "reps" ? (num(el.value) == null ? null : Math.round(num(el.value))) : num(el.value); sauveSeance(s); $(".compte", $("#v-seance")).textContent = volume(s).n + " séries"; return; }
    if ((a = el.getAttribute("data-sp-nom")) != null) { var s2 = seanceCourante(); s2.exos[+a].nom = el.value; sauveSeance(s2); return; }
    if (el.hasAttribute("data-sp-note")) { grow(el); var s3 = seanceCourante(); s3.note = el.value; sauveSeance(s3); return; }
  });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.hasAttribute("data-sp-date") && el.value) { var s = seanceCourante(); s.date = el.value; sauveSeance(s); }
    if (el.getAttribute("data-sp-nom") != null) renderSeance();
  });
  document.addEventListener("click", function (e) {
    var t = e.target, b;
    if ((b = t.closest("[data-t-date]"))) { UI.tDate = b.getAttribute("data-t-date"); $$("[data-t-date]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); }); return; }
    if ((b = t.closest("[data-t-ok]"))) { var id = b.getAttribute("data-t-ok"), x = getData(TPATH)[id]; if (!x) return; x = clone(x); x.fait = !x.fait; if (x.fait) x.faitLe = new Date().toISOString(); else delete x.faitLe; setKey(TPATH, id, x); UI.view === "taches" ? renderTaches() : renderAujourdhui(); return; }
    if ((b = t.closest("[data-t-del]"))) { var did = b.getAttribute("data-t-del"); if (arme("t" + did)) setKey(TPATH, did, null); UI.view === "taches" ? renderTaches() : renderAujourdhui(); return; }
    if ((b = t.closest("[data-sp-new]"))) { var ty = b.getAttribute("data-sp-new"), d = today(), sid = uid(); UI.seance = { path: moisPath("sport", d), id: sid }; setKey(UI.seance.path, sid, { date: d, type: ty, exos: [], cree: new Date().toISOString() }); location.hash = "#seance"; return; }
    if ((b = t.closest("[data-sp-open]"))) { var pp = b.getAttribute("data-sp-open").split("|"); UI.seance = { path: pp[0], id: pp[1] }; location.hash = "#seance"; return; }
    if ((b = t.closest("[data-sp-addexo]")) ) { var s = seanceCourante(); s.exos = s.exos || []; s.exos.push({ nom: b.getAttribute("data-sp-addexo"), series: [{ reps: null, kg: null }] }); sauveSeance(s); renderSeance(); var ins = $$("[data-sp-s]"); if (!b.getAttribute("data-sp-addexo")) { var noms = $$("[data-sp-nom]"); if (noms.length) noms[noms.length - 1].focus(); } else if (ins.length) ins[ins.length - 2].focus(); return; }
    if ((b = t.closest("[data-sp-addset]"))) { var s1 = seanceCourante(), i = +b.getAttribute("data-sp-addset"), sr = s1.exos[i].series, last = sr[sr.length - 1] || { reps: null, kg: null }; sr.push({ reps: last.reps, kg: last.kg }); sauveSeance(s1); renderSeance(); return; }
    if ((b = t.closest("[data-sp-dels]"))) { var q = b.getAttribute("data-sp-dels").split("|"), s2 = seanceCourante(); s2.exos[+q[0]].series.splice(+q[1], 1); sauveSeance(s2); renderSeance(); return; }
    if ((b = t.closest("[data-sp-delexo]"))) { var ei = +b.getAttribute("data-sp-delexo"); if (arme("e" + ei)) { var s3 = seanceCourante(); s3.exos.splice(ei, 1); sauveSeance(s3); } renderSeance(); return; }
    if (t.closest("[data-sp-delseance]")) { if (arme("seance")) { setKey(UI.seance.path, UI.seance.id, null); UI.seance = null; location.hash = "#sport"; } else renderSeance(); return; }
    if ((b = t.closest("[data-ar-mois]"))) { UI.mois = moisPrec(UI.mois, -(+b.getAttribute("data-ar-mois"))); renderArgent(); scheduleSync(0); return; }
    if ((b = t.closest("[data-ar-add]"))) { UI.ajout = { sens: b.getAttribute("data-ar-add"), cat: b.getAttribute("data-ar-add") === "in" ? "Salaire" : "Fast-food", date: UI.mois === today().slice(0, 7) ? today() : UI.mois + "-01" }; location.hash = "#ajout"; return; }
    if ((b = t.closest("[data-ar-cat]"))) { UI.ajout.cat = b.getAttribute("data-ar-cat"); $$("[data-ar-cat]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); }); return; }
    if (t.closest("[data-ar-save]")) {
      var m = num($("#ar-m").value); if (!m || m <= 0) { $("#ar-m").focus(); return; }
      var dd = $("#ar-d").value || today(); ajouteMvt(UI.ajout.sens, m, UI.ajout.cat, dd, ($("#ar-n").value || "").trim());
      UI.mois = dd.slice(0, 7); location.hash = "#argent"; return;
    }
    if ((b = t.closest("[data-ar-auto]"))) {
      var p = plan(), kind = b.getAttribute("data-ar-auto"), d0 = UI.mois === today().slice(0, 7) ? today() : UI.mois + "-01";
      if (kind === "salaire") ajouteMvt("in", p.salaire, "Salaire", d0, "", "salaire");
      else p.fixes.forEach(function (f) { ajouteMvt("out", f[1], f[2] || "Abonnements", d0, f[0], "fixes"); });
      renderArgent(); return;
    }
    if ((b = t.closest("[data-ar-del]"))) { var r = b.getAttribute("data-ar-del").split("|"); if (arme("a" + r[1])) setKey(r[0], r[1], null); renderArgent(); return; }
    if ((b = t.closest("[data-qd-cat]"))) { UI.qcat = b.getAttribute("data-qd-cat"); $$("[data-qd-cat]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); }); return; }
    if (t.closest("[data-qd-add]")) { var qm = num($("#qd-m").value); if (!qm || qm <= 0) { $("#qd-m").focus(); return; } ajouteMvt("out", qm, UI.qcat, UI.day, ""); renderFlow(); return; }
  });

  /* ================= Navigation ================= */
  var VIEWS = { aujourdhui: renderAujourdhui, taches: renderTaches, sport: renderSport, seance: renderSeance, argent: renderArgent, ajout: renderAjout, progres: renderProgres, plan: renderPlan, reglages: renderReglages, bienvenue: renderBienvenue };
  var ONGLET = { seance: "sport", ajout: "argent", plan: "progres" };
  function show(v) {
    UI.flow = null; $("#v-flow").hidden = true;
    if (!VIEWS[v]) v = "aujourdhui";
    if (B.kind === "local" && !plan() && !LS.get("plus-tard") && v !== "reglages") v = "bienvenue";
    if (v === "bienvenue" && (plan() || B.kind !== "local")) v = "aujourdhui";
    UI.view = v;
    Object.keys(VIEWS).forEach(function (k) { $("#v-" + k).hidden = k !== v; });
    $$("#nav a").forEach(function (a) { if (a.getAttribute("data-v") === (ONGLET[v] || v)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#nav").hidden = !ready() || v === "ajout" || v === "bienvenue";
    VIEWS[v](); paintSync();
  }
  function route() { var h = location.hash.replace("#", ""); show(h || "aujourdhui"); }
  function refresh() {
    if (UI.flow) return;
    var a = document.activeElement, root = $("#v-" + UI.view);
    if (a && root && root.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return;
    show(UI.view);
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });
  function grow(el) { el.style.height = "auto"; el.style.height = (el.scrollHeight + 2) + "px"; }

  /* ================= Événements ================= */
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.tagName === "TEXTAREA") grow(el);
    var k = el.getAttribute && el.getAttribute("data-d");
    if (k) { var v = el.value; if (/^(depenses|pas|ecran|business|contacts|etudes)$/.test(k)) { var n = num(v); v = n == null ? null : n; } setDay(UI.day, k, v); return; }
    var w = el.getAttribute && el.getAttribute("data-w");
    if (w) setReview(UI.week, w, el.value);
  });
  document.addEventListener("change", function (e) { var el = e.target, k = el.getAttribute && el.getAttribute("data-d"); if (el.id === "import-f" && el.files && el.files[0]) { importe(el.files[0]); return; } if (k === "coucher" || k === "reveil") setDay(UI.day, k, el.value); });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "code-in") { e.preventDefault(); debloque(); return; } if (e.key === "Enter" && UI.flow && e.target.tagName === "INPUT") { e.preventDefault(); var ins = $$("#v-flow input"), i = ins.indexOf(e.target); if (i >= 0 && i < ins.length - 1) ins[i + 1].focus(); else nextStep(); } });
  document.addEventListener("click", function (e) {
    var t = e.target, b;
    if ((b = t.closest("[data-flow]"))) { var ty = b.getAttribute("data-flow"); if (ty === "semaine") UI.week = mondayOf(today()); startFlow(ty); return; }
    if ((b = t.closest("[data-yes]")) || (b = t.closest("[data-no]"))) {
      var yes = b.hasAttribute("data-yes"), k = b.getAttribute(yes ? "data-yes" : "data-no");
      setDay(UI.day, k, yes); $$("#v-flow .opt").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      setTimeout(nextStep, 220); return;
    }
    if ((b = t.closest("[data-sc]"))) { var sk = b.getAttribute("data-sc"), sv = +b.getAttribute("data-v"); setDay(UI.day, sk, sv); $$("#v-flow .opt").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); }); setTimeout(nextStep, 220); return; }
    if ((b = t.closest("[data-tog]"))) { var tk = b.getAttribute("data-tog"), tv = day(UI.day)[tk] !== true; setDay(UI.day, tk, tv); b.setAttribute("aria-pressed", String(tv)); return; }
    if ((b = t.closest("[data-st]"))) {
      var ck = b.getAttribute("data-st"), step = +b.getAttribute("data-step"), st = UI.flow.steps[UI.flow.i], val = Math.max(0, Math.round(((num(day(UI.day)[ck]) || 0) + step) * 10) / 10);
      setDay(UI.day, ck, val); $("#val").innerHTML = fr(val, 1) + (st.u ? "<small> " + st.u + "</small>" : ""); return;
    }
    if (t.closest("[data-next]")) { nextStep(); window.scrollTo(0, 0); return; }
    if (t.closest("[data-back]")) { prevStep(); return; }
    if (t.closest("[data-home]")) { UI.flow = null; location.hash = "#aujourdhui"; show("aujourdhui"); window.scrollTo(0, 0); return; }
    if ((b = t.closest("[data-day]"))) { var n = +b.getAttribute("data-day"); UI.day = n === 0 ? today() : addDays(UI.day, n); UI.navigated = n !== 0; renderAujourdhui(); scheduleSync(0); return; }
    if ((b = t.closest("[data-reg]"))) { UI.reg = addDays(UI.reg, +b.getAttribute("data-reg")); renderProgres(); scheduleSync(0); return; }
    if (t.closest("#etat")) { if (B.kind) location.hash = "#reglages"; return; }
    if (t.closest("[data-unlock]")) { debloque(); return; }
    if (t.closest("[data-later]")) { LS.set("plus-tard", true); location.hash = "#aujourdhui"; route(); return; }
    if (t.closest("[data-export]")) { exporte(); return; }
    if (t.closest("[data-import]")) { var fi = $("#import-f"); if (fi) { fi.value = ""; fi.click(); } return; }
    if ((b = t.closest("[data-resume]"))) { envoieResume(b); return; }
    if (t.closest("[data-sync]")) { runSync(true).then(function () { toast("Enregistré"); if (UI.view === "reglages") renderReglages(); }); return; }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { saveNow(); runSync(); return; }
    var t = today(); if (UI.day !== t && !UI.navigated && !UI.flow) UI.day = t;
    runSync().then(refresh);
  });
  window.addEventListener("online", function () { runSync(true); });
  window.addEventListener("offline", paintSync);
  window.addEventListener("pagehide", saveNow);

  /* ================= Démarrage ================= */
  function start(kind, db) {
    B.kind = kind; B.db = db || null;
    if (kind === "db") { FKEY = "files-db"; files = LS.get(FKEY) || {}; }
    route();
    runSync(true);
  }
  route();
  var c = window.claude;
  if (c && typeof c.use === "function") {
    Promise.resolve().then(function () { return c.use("db"); }).catch(function () { return null; }).then(function (db) { start(db ? "db" : "local", db); });
  } else {
    start("local");
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* rien */ }); } catch (e) { /* rien */ }
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () { /* l'app marche sans */ });
  }
})();
