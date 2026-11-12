/* BRUNFRAME — téléphone en 3D (WebGL, sans dépendance).
   Boîtier titane noir, bloc photo à trois objectifs, sans logo.
   Repère : celui de CSS (x à droite, y vers le bas, z vers l'œil). Unité : l'em du téléphone (largeur = 30 em).
   La projection reproduit `perspective: 150em`, pour que l'écran HTML se pose exactement sur la face avant. */
(function (w) {
  'use strict';

  /* ---------- Cotes (em), mesurées sur les photos de référence ---------- */
  var W = 30, H = 62.59, T = 3.65, R = 5.4;         // 71,9 × 150,0 × 8,75 mm (30 em = 71,9 mm)
  var AR = { d: 0.8, z: 1.2 };                     // arrondi de l'arête côté dos (retrait, profondeur)
  var AV = { d: 0.45, z: 0.9 };                    // arrondi de l'arête côté écran
  var PL = { cy: -H / 2 + 8.97, hw: 14.1, hh: 8.17, r: [3.8, 2.9, 2.9, 3.8], h: 0.58, e: [1.1, 0.95, 0.65] };   // bloc photo : centre, demi-tailles, rayons (haut, bas), hauteur, épaulement
  var HR = 0.74, RL = 3.3, RG = 2.62;              // objectifs : hauteur de bague, rayon extérieur, rayon du verre
  var LENS = [[15 - 5.64, -H / 2 + 5.58], [15 - 5.64, -H / 2 + 12.93], [15 - 12.57, -H / 2 + 9.26]];
  var PUPILLE = [0.22, 0.22, 0.42];                // ouverture visible de chaque objectif (part du rayon du verre)
  var FLASH = [15 - 24.7, -H / 2 + 5.25, 1.3];
  var LIDAR = [15 - 24.7, -H / 2 + 13.07, 1.27];
  var MICRO = [15 - 24.74, -H / 2 + 9.28, 0.2];
  var PAN = { cy: 8.63, hw: 13.45, hh: 21.125, r: [3.2, 3.85] };        // panneau de verre du dos (18,9 em du haut, 2 em du bas)
  var ECR = { hw: 13.89, hh: 30.205, r: 4.28 };                // écran : 66,59 × 144,78 mm (affiché en HTML par-dessus)
  var ILOT = { cy: -H / 2 + 1.09 + 0.9 + 1.15, hw: 3.0, hh: 1.15 };   // îlot du 18 Pro : 6,1 × 2,4 em, à 0,72 em sous le haut de l'écran
  var BOUTONS = [                                              // côté (−1 gauche vu de face), centre y, longueur, saillie, matière
    [-1, -H / 2 + 13.1, 2.7, 0.16, 7], [-1, -H / 2 + 18.6, 4.33, 0.16, 7], [-1, -H / 2 + 24.05, 4.33, 0.16, 7],
    [1, -H / 2 + 21.75, 7.4, 0.16, 7], [1, -H / 2 + 40.3, 7.5, 0.035, 8]
  ];

  /* ---------- Lumières de studio : direction vers la lumière, demi-tailles (tangente), intensité ---------- */
  var LUMIERES = [
    { c: [-0.62, -0.60, 0.50], hs: [0.55, 0.42], i: 2.7 },     // grande boîte, devant, en haut à gauche (hors de l'axe)
    { c: [0.93, -0.10, -0.35], hs: [0.10, 1.5], i: 1.9 },      // bande verticale, derrière à droite
    { c: [-0.96, 0.02, -0.28], hs: [0.08, 1.3], i: 1.5 },      // bande verticale, derrière à gauche
    { c: [0.0, -0.95, -0.30], hs: [1.3, 0.30], i: 2.7 },       // bande horizontale, au-dessus
    { c: [0.62, -0.20, 0.76], hs: [0.10, 0.85], i: 2.4 },      // bande de face à droite : glisse sur le verre en fin de rotation
    { c: [0.0, 0.0, 1.0], hs: [3.0, 3.0], i: 0.05 }            // ambiance de face, uniforme
  ];

  /* ---------- Géométrie ---------- */
  function contour(lw, lh, r, n) {                 // rectangle arrondi centré ; r : un rayon, ou quatre (+x−y, +x+y, −x+y, −x−y)
    var pts = [], hw = lw / 2, hh = lh / 2, i, a, q = typeof r === 'number' ? [r, r, r, r] : r;
    [[hw - q[0], -hh + q[0], -90, q[0]], [hw - q[1], hh - q[1], 0, q[1]], [-hw + q[2], hh - q[2], 90, q[2]], [-hw + q[3], -hh + q[3], 180, q[3]]].forEach(function (c) {
      for (i = 0; i <= n; i++) {
        a = (c[2] + 90 * i / n) * Math.PI / 180;
        pts.push({ x: c[0] + c[3] * Math.cos(a), y: c[1] + c[3] * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) });
      }
    });
    return pts;
  }
  function cercle(r, n) {
    var pts = [], i, a;
    for (i = 0; i < n; i++) { a = i / n * Math.PI * 2; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }); }
    return pts;
  }
  function arc(profil, n, f) { var i; for (i = 0; i <= n; i++) profil.push(f(i / n * Math.PI / 2)); }
  function ajouter(M, rep, x, y, h, nx, ny, nh, mat) {
    M.pos.push(rep.o[0] + rep.u[0] * x + rep.v[0] * y + rep.h[0] * h, rep.o[1] + rep.u[1] * x + rep.v[1] * y + rep.h[1] * h, rep.o[2] + rep.u[2] * x + rep.v[2] * y + rep.h[2] * h);
    M.nor.push(rep.u[0] * nx + rep.v[0] * ny + rep.h[0] * nh, rep.u[1] * nx + rep.v[1] * ny + rep.h[1] * nh, rep.u[2] * nx + rep.v[2] * ny + rep.h[2] * nh);
    M.mat.push(mat);
    return M.n++;
  }
  /* Balaie un profil {d: retrait, h: hauteur, no/nh: normale} le long d'un contour. */
  function balayer(M, c, profil, rep, mat) {
    var base = M.n, np = profil.length, nc = c.length, i, j, p, q, a, b;
    for (i = 0; i < nc; i++) for (j = 0; j < np; j++) {
      p = c[i]; q = profil[j];
      ajouter(M, rep, p.x - p.nx * q.d, p.y - p.ny * q.d, q.h, p.nx * q.no, p.ny * q.no, q.nh, mat);
    }
    for (i = 0; i < nc; i++) for (j = 0; j < np - 1; j++) {
      a = base + i * np + j; b = base + ((i + 1) % nc) * np + j;
      M.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  function couvercle(M, c, d, h, rep, signe, mat) {
    var base = ajouter(M, rep, 0, 0, h, 0, 0, signe, mat), nc = c.length, i;
    for (i = 0; i < nc; i++) ajouter(M, rep, c[i].x - c[i].nx * d, c[i].y - c[i].ny * d, h, 0, 0, signe, mat);
    for (i = 0; i < nc; i++) M.idx.push(base, base + 1 + i, base + 1 + (i + 1) % nc);
  }
  function modele() {
    var M = { pos: [], nor: [], mat: [], idx: [], n: 0 }, p, l;
    var REP = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], h: [0, 0, 1] };

    /* Boîtier : arête du dos, flanc, arête de l'écran. */
    var cc = contour(W, H, R, 22); p = [];
    arc(p, 9, function (a) { var s = Math.sin(a), c = Math.cos(a), n = Math.sqrt(AR.z * AR.z * s * s + AR.d * AR.d * c * c); return { d: AR.d * (1 - s), h: -T / 2 + AR.z * (1 - c), no: AR.z * s / n, nh: -AR.d * c / n }; });
    for (l = 9; l >= 0; l--) (function (a) { var s = Math.sin(a), c = Math.cos(a), n = Math.sqrt(AV.z * AV.z * s * s + AV.d * AV.d * c * c); p.push({ d: AV.d * (1 - s), h: T / 2 - AV.z * (1 - c), no: AV.z * s / n, nh: AV.d * c / n }); })(l / 9 * Math.PI / 2);
    balayer(M, cc, p, REP, 1);
    couvercle(M, cc, AR.d, -T / 2, REP, -1, 2);
    couvercle(M, cc, AV.d, T / 2, REP, 1, 3);

    /* Bloc photo : épaulement en S (pente satinée), plus large en haut qu'en bas ; dessus plat. */
    var rp = { o: [0, PL.cy, -T / 2], u: [1, 0, 0], v: [0, 1, 0], h: [0, 0, -1] };
    var cp = contour(PL.hw * 2, PL.hh * 2, PL.r, 14), np = 11, base = M.n, i, j, t, ep, dh, nn, pt, a, b;
    function epaule(q) { return PL.e[1] * q.nx * q.nx + (q.ny < 0 ? PL.e[0] : PL.e[2]) * q.ny * q.ny; }
    for (i = 0; i < cp.length; i++) {
      pt = cp[i]; ep = epaule(pt);
      for (j = 0; j < np; j++) {
        t = j / (np - 1);
        dh = PL.h * 6 * t * (1 - t);
        nn = Math.sqrt(dh * dh + ep * ep);
        ajouter(M, rp, pt.x - pt.nx * ep * t, pt.y - pt.ny * ep * t, PL.h * t * t * (3 - 2 * t), pt.nx * dh / nn, pt.ny * dh / nn, ep / nn, 4);
      }
    }
    for (i = 0; i < cp.length; i++) for (j = 0; j < np - 1; j++) {
      a = base + i * np + j; b = base + ((i + 1) % cp.length) * np + j;
      M.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    base = ajouter(M, rp, 0, 0, PL.h, 0, 0, 1, 4);
    for (i = 0; i < cp.length; i++) { pt = cp[i]; ep = epaule(pt); ajouter(M, rp, pt.x - pt.nx * ep, pt.y - pt.ny * ep, PL.h, 0, 0, 1, 4); }
    for (i = 0; i < cp.length; i++) M.idx.push(base, base + 1 + i, base + 1 + (i + 1) % cp.length);

    /* Objectifs : bague qui part du dos, chanfrein, verre légèrement en retrait. */
    LENS.forEach(function (c) {
      var rl = { o: [c[0], c[1], -T / 2], u: [1, 0, 0], v: [0, 1, 0], h: [0, 0, -1] }, top = PL.h + HR, q = [];
      q.push({ d: 0, h: 0, no: 1, nh: 0 }, { d: 0, h: top - 0.16, no: 1, nh: 0 });
      arc(q, 4, function (a) { return { d: 0.16 * (1 - Math.cos(a)), h: top - 0.16 + 0.16 * Math.sin(a), no: Math.cos(a), nh: Math.sin(a) }; });
      q.push({ d: 0.16, h: top, no: 0, nh: 1 }, { d: 0.5, h: top, no: 0, nh: 1 });
      q.push({ d: 0.5, h: top, no: -0.6, nh: 0.8 }, { d: RL - RG, h: top - 0.11, no: -0.6, nh: 0.8 });
      balayer(M, cercle(RL, 56), q, rl, 5);
      couvercle(M, cercle(RL, 56), RL - RG, top - 0.11, rl, 1, 6);
    });

    /* Boutons : petites gélules qui sortent du flanc. */
    BOUTONS.forEach(function (b) {
      var rb = { o: [b[0] * W / 2, b[1], 0], u: [0, 1, 0], v: [0, 0, 1], h: [b[0], 0, 0] }, cb = contour(b[2], 1.0, 0.5, 6), q = [], f = Math.min(0.06, b[3] * 0.6);
      q.push({ d: 0, h: -0.2, no: 1, nh: 0 }, { d: 0, h: b[3] - f, no: 1, nh: 0 });
      arc(q, 3, function (a) { return { d: f * (1 - Math.cos(a)), h: b[3] - f + f * Math.sin(a), no: Math.cos(a), nh: Math.sin(a) }; });
      balayer(M, cb, q, rb, b[4]);
      couvercle(M, cb, f, b[3], rb, 1, b[4]);
    });
    return M;
  }

  /* ---------- Shaders ---------- */
  function f(n) { return (Math.round(n * 1e5) / 1e5).toFixed(5); }
  function v2(a) { return 'vec2(' + f(a[0]) + ',' + f(a[1]) + ')'; }
  function v3(a) { return 'vec3(' + f(a[0]) + ',' + f(a[1]) + ',' + f(a[2]) + ')'; }
  function norme(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
  function croix(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  var VS = [
    'attribute vec3 aP; attribute vec3 aN; attribute float aM;',
    'uniform mat3 uR; uniform vec3 uK; uniform vec2 uZ;',
    'varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vM;',
    'void main(){',
    '  vec3 q = uR * aP;',
    '  vP = aP; vN = uR * aN; vW = q; vM = aM;',
    '  float ww = 1.0 - q.z * uK.z;',
    '  gl_Position = vec4(q.x * uK.x, -q.y * uK.y, uZ.x * ww + uZ.y, ww);',
    '}'
  ].join('\n');

  function fragment() {
    var env = '', irr = '', cle = norme(LUMIERES[0].c);
    LUMIERES.forEach(function (L) {
      var c = norme(L.c), u = norme(croix([0, 1, 0], c)), v = croix(c, u), teinte = [L.i, L.i, L.i * 1.015];
      env += '  c += ' + v3(teinte) + ' * boite(r, ' + v3(c) + ', ' + v3(u) + ', ' + v3(v) + ', ' + v2(L.hs) + ', s);\n';
      irr += '  e += ' + f(L.i * 4 * L.hs[0] * L.hs[1] / Math.PI) + ' * max(dot(n, ' + v3(c) + '), 0.0);\n';
    });
    var occObj = '';
    LENS.forEach(function (c, i) {
      occObj += '      dl = length(p - ' + v2(c) + ') - ' + f(RL) + '; occ *= mix(0.42, 1.0, smoothstep(0.0, 0.65, dl));\n' +
                '      if (uLo.z < -0.08) occ *= mix(0.5, 1.0, smoothstep(-0.05, 0.5, length(p - dsp - ' + v2(c) + ') - ' + f(RL) + '));\n';
    });
    return [
      'precision highp float;',
      'varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vM;',
      'uniform mat3 uR; uniform vec3 uEye; uniform vec3 uEyeO; uniform vec3 uLo;',
      'uniform float uPx; uniform float uTrou; uniform float uExp;',
      'const float RG = ' + f(RG) + ';',
      'float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }',
      'float sdRR(vec2 p, vec2 hs, float r){ vec2 q = abs(p) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
      'vec2 gRR(vec2 p, vec2 hs, float r){ vec2 q = abs(p) - hs + r; vec2 g = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0)); return g * vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0); }',
      'float boite(vec3 r, vec3 c, vec3 u, vec3 v, vec2 hs, float s){',
      '  float k = dot(r, c);',
      '  if (k <= 0.0) return 0.0;',
      '  vec2 e = clamp((hs - abs(vec2(dot(r, u), dot(r, v)) / k)) / (2.0 * s) + 0.5, 0.0, 1.0);',
      '  e = e * e * (3.0 - 2.0 * e);',
      '  return e.x * e.y;',
      '}',
      'vec3 env(vec3 r, float ro){',
      '  float s = 0.025 + ro * ro * 1.5;',
      '  vec3 c = mix(vec3(0.022, 0.022, 0.024), vec3(0.003), smoothstep(-0.7, 0.6, r.y));',
      env,
      '  return c;',
      '}',
      'vec3 irr(vec3 n){',
      '  vec3 e = vec3(0.012);',
      irr,
      '  return e;',
      '}',
      'vec3 fres(vec3 f0, float nv, float ro){ return f0 + (max(vec3(1.0 - ro), f0) - f0) * pow(1.0 - nv, 5.0); }',
      'vec3 grain(vec3 n, vec2 p, float amp){',
      '  float k = clamp(0.085 / (uPx * 2.0), 0.0, 1.0);',
      '  vec2 id = floor(p / 0.085);',
      '  vec2 h = vec2(hash(id), hash(id + 17.0)) - 0.5;',
      '  return normalize(n + (uR * vec3(h, 0.0)) * amp * k);',
      '}',
      /* Objectif : diaphragmes vus en profondeur (parallaxe), reflets du verre et des lentilles internes. */
      'vec3 lentille(vec2 c, vec3 N, vec3 V, float nv, float pup){',
      '  vec2 q = (vP.xy - c) / RG;',
      '  vec3 Vo = normalize(uEyeO - vP);',
      '  vec2 par = Vo.xy / max(-Vo.z, 0.2);',
      '  float aa = uPx / RG * 1.5;',
      '  float r0 = length(q);',
      '  vec2 q1 = q - par * (0.22 / RG); float r1 = length(q1);',
      '  vec2 q2 = q - par * (0.70 / RG); float r2 = length(q2);',
      '  vec2 q3 = q - par * (1.35 / RG); float r3 = length(q3);',
      '  vec2 q4 = q - par * (2.10 / RG); float r4 = length(q4);',
      '  float m1 = 1.0 - smoothstep(0.84 - aa, 0.84 + aa, r1);',
      '  float m2 = m1 * (1.0 - smoothstep(0.60 - aa, 0.60 + aa, r2));',
      '  float m3 = m2 * (1.0 - smoothstep(pup - aa, pup + aa, r3));',
      '  float m4 = m3 * (1.0 - smoothstep(pup * 0.4 - aa, pup * 0.4 + aa, r4));',
      '  vec3 col = vec3(0.0030, 0.0030, 0.0034);',
      '  col = mix(col, vec3(0.0060, 0.0060, 0.0068), m1);',
      '  col = mix(col, vec3(0.0030, 0.0032, 0.0048), m2);',
      '  col = mix(col, vec3(0.0046, 0.0052, 0.0095) * (1.0 - 0.55 * smoothstep(0.0, pup, r3)), m3);',
      '  col = mix(col, vec3(0.0005), m4);',
      '  col += vec3(0.0050) * (1.0 - smoothstep(0.0, 0.02 + aa, abs(r1 - 0.84)));',
      '  col += vec3(0.0035, 0.0040, 0.0060) * m1 * (1.0 - smoothstep(0.0, 0.02 + aa, abs(r2 - 0.60)));',
      '  col += vec3(0.0030, 0.0034, 0.0055) * m2 * (1.0 - smoothstep(0.0, 0.02 + aa, abs(r3 - pup)));',
      '  vec3 rad = uR * vec3(r0 > 1e-4 ? q / r0 : vec2(0.0), 0.0);',
      '  vec3 N1 = normalize(N + rad * r0 * 0.05);',
      '  col += env(reflect(-V, N1), 0.03) * fres(vec3(0.018), nv, 0.03) * vec3(0.80, 0.86, 1.0);',
      '  vec3 N2 = normalize(N - (uR * vec3(r3 > 1e-4 ? q3 / r3 : vec2(0.0), 0.0)) * r3 * 3.0);',
      '  col += env(reflect(-V, N2), 0.32) * vec3(0.012, 0.015, 0.032) * m3;',
      '  vec3 N3 = normalize(N + (uR * vec3(r2 > 1e-4 ? q2 / r2 : vec2(0.0), 0.0)) * r2 * 1.2);',
      '  col += env(reflect(-V, N3), 0.34) * vec3(0.010, 0.007, 0.020) * m2 * (1.0 - m3);',
      '  return col;',
      '}',
      'void main(){',
      '  vec2 p = vP.xy;',
      '  if (uTrou > 0.5 && sdRR(p, ' + v2([ECR.hw, ECR.hh]) + ', ' + f(ECR.r) + ') < 0.0) discard;',
      '  vec3 N = normalize(vN);',
      '  vec3 V = normalize(uEye - vW);',
      '  float m = floor(vM + 0.5);',
      '  vec3 alb = vec3(0.0); vec3 F0 = vec3(0.04); float ro = 0.3; float occ = 1.0; vec3 plus = vec3(0.0);',
      '  vec3 col; bool fait = false; float dl;',
      '  vec3 TITANE = vec3(0.050, 0.050, 0.054); vec3 ALU = vec3(0.046, 0.046, 0.050); vec3 ALUD = vec3(0.016, 0.016, 0.018);',
      '  if (m < 1.5) {',                                   /* cadre */
      '    alb = vec3(0.016); F0 = TITANE; ro = 0.50;',
      '    ro += (hash(vec2(floor(vP.z * 26.0), 7.0)) - 0.5) * 0.07 * clamp(0.038 / (uPx * 1.5), 0.0, 1.0);',
      '    float ant = 1.0 - smoothstep(0.05, 0.09 + uPx, min(abs(vP.y + ' + f(H / 2 - 6.0) + '), abs(vP.y - ' + f(H / 2 - 6.0) + ')));',
      '    F0 = mix(F0, vec3(0.10), ant * 0.7); ro = mix(ro, 0.5, ant);',
      '    if (vP.y > ' + f(H / 2 - 0.04) + ') {',
      '      vec2 q = vec2(vP.x, vP.z);',
      '      float port = sdRR(q, vec2(1.73, 0.54), 0.54);',
      '      float trous = 1e9;',
      '      for (int i = 0; i < 5; i++) trous = min(trous, length(q - vec2(3.5 + float(i) * 1.05, 0.0)) - 0.3);',
      '      for (int j = 0; j < 3; j++) trous = min(trous, length(q + vec2(3.5 + float(j) * 1.05, 0.0)) - 0.3);',
      '      float creux = 1.0 - smoothstep(-uPx, uPx, min(port, trous));',
      '      float lisere = (1.0 - smoothstep(0.02, 0.07 + uPx, abs(port))) * (1.0 - creux);',
      '      alb = mix(alb, vec3(0.0), creux); F0 = mix(F0, vec3(0.008), creux); ro = mix(ro, 0.6, creux);',
      '      F0 = mix(F0, vec3(0.22), lisere * 0.6);',
      '    }',
      '  } else if (m < 2.5) {',                            /* dos : alu anodisé autour, panneau de verre dépoli */
      '    vec2 pq = p - vec2(0.0, ' + f(PAN.cy) + ');',
      '    float dp = sdRR(pq, ' + v2([PAN.hw, PAN.hh]) + ', pq.y > 0.0 ? ' + f(PAN.r[1]) + ' : ' + f(PAN.r[0]) + ');',
      '    float g = smoothstep(-uPx, uPx, dp);',
      '    float rampe = mix(1.12, 0.82, clamp(pq.y / ' + f(2 * PAN.hh) + ' + 0.5, 0.0, 1.0));',
      '    alb = mix(vec3(0.017, 0.017, 0.019) * rampe, ALUD, g);',
      '    F0 = mix(vec3(0.04) * rampe, ALU, g);',
      '    ro = mix(0.38, 0.55, g);',
      '    N = grain(N, p, mix(0.012, 0.03, g));',
      '    occ *= 1.0 - 0.25 * (1.0 - smoothstep(0.02, 0.07 + uPx, abs(dp)));',
      '    vec2 pc = p - vec2(0.0, ' + f(PL.cy) + ');',
      '    occ *= mix(0.5, 1.0, smoothstep(0.0, 0.9, sdRR(pc, ' + v2([PL.hw, PL.hh]) + ', ' + f(3.3) + ')));',
      '    if (uLo.z < -0.08) occ *= mix(0.55, 1.0, smoothstep(-0.05, 0.45, sdRR(pc - uLo.xy * (' + f(PL.h) + ' / uLo.z), ' + v2([PL.hw, PL.hh]) + ', ' + f(3.3) + ')));',
      '  } else if (m < 3.5) {',                            /* verre de la face avant */
      '    alb = vec3(0.0022); F0 = vec3(0.045); ro = 0.03;',
      '    vec2 hv = ' + v2([W / 2 - AV.d, H / 2 - AV.d]) + ';',
      '    float bord = smoothstep(-0.22, 0.0, sdRR(p, hv, ' + f(R - AV.d) + '));',
      '    N = normalize(N + (uR * vec3(gRR(p, hv, ' + f(R - AV.d) + '), 0.0)) * bord * 0.55);',
      '    float dI = sdRR(p - vec2(0.0, ' + f(ILOT.cy) + '), ' + v2([ILOT.hw, ILOT.hh]) + ', ' + f(ILOT.hh) + ');',
      '    alb = mix(alb, vec3(0.0006), 1.0 - smoothstep(-uPx, uPx, dI));',
      '    float cam = length(p - vec2(1.85, ' + f(ILOT.cy) + '));',
      '    plus += vec3(0.009, 0.011, 0.020) * (1.0 - smoothstep(0.42, 0.47 + uPx, cam)) * (0.5 + 0.5 * smoothstep(0.12, 0.40, cam));',
      '  } else if (m < 4.5) {',                            /* bloc photo */
      '    alb = ALUD; F0 = ALU; ro = 0.55;',
      '    if (vP.z < ' + f(-T / 2 - PL.h + 0.012) + ') {',
      '      float rf = length(p - ' + v2(FLASH) + ') / ' + f(FLASH[2]) + ';',
      '      float inF = 1.0 - smoothstep(1.0 - uPx, 1.0 + uPx, rf);',
      '      float rl = length(p - ' + v2(LIDAR) + ') / ' + f(LIDAR[2]) + ';',
      '      float inL = 1.0 - smoothstep(1.0 - uPx, 1.0 + uPx, rl);',
      '      N = grain(N, p, 0.03 * (1.0 - max(inF, inL)));',
      '      vec2 dsp = uLo.z < -0.08 ? uLo.xy * (' + f(HR) + ' / uLo.z) : vec2(0.0);',
      occObj,
      '      vec3 dif = mix(vec3(0.50, 0.49, 0.46), vec3(0.24, 0.235, 0.22), smoothstep(0.12, 0.80, rf)) * (0.93 + 0.07 * cos(rf * 38.0));',
      '      dif = mix(dif, vec3(0.99, 0.92, 0.60), (1.0 - smoothstep(0.10, 0.22, rf)) * 0.65);',
      '      dif = mix(dif, vec3(0.025), smoothstep(0.82, 0.88, rf));',
      '      alb = mix(alb, dif, inF); F0 = mix(F0, vec3(0.05), inF); ro = mix(ro, 0.16, inF);',
      '      alb = mix(alb, vec3(0.003), inL); F0 = mix(F0, mix(vec3(0.005), vec3(0.07), smoothstep(0.90, 0.96, rl)), inL); ro = mix(ro, 0.10, inL);',
      '      float rm = length(p - ' + v2(MICRO) + ') / ' + f(MICRO[2]) + ';',
      '      float inM = 1.0 - smoothstep(1.0 - uPx * 4.0, 1.0 + uPx * 4.0, rm);',
      '      occ *= 1.0 - 0.9 * inM;',
      '    }',
      '  } else if (m < 5.5) {',                            /* bague d\'objectif */
      '    alb = vec3(0.006); F0 = vec3(0.11, 0.11, 0.118); ro = 0.22;',
      '    occ *= mix(0.55, 1.0, smoothstep(0.0, 0.4, ' + f(-T / 2 - PL.h) + ' - vP.z));',
      '  } else if (m < 6.5) {',                            /* verre d\'objectif */
      '    vec2 c = ' + v2(LENS[0]) + '; float best = 1e9; float pup = ' + f(PUPILLE[0]) + ';',
      '    for (int i = 0; i < 3; i++) {',
      '      vec2 ci = ' + v2(LENS[0]) + '; float pi = ' + f(PUPILLE[0]) + ';',
      '      if (i == 1) { ci = ' + v2(LENS[1]) + '; pi = ' + f(PUPILLE[1]) + '; } else if (i == 2) { ci = ' + v2(LENS[2]) + '; pi = ' + f(PUPILLE[2]) + '; }',
      '      float dd = length(p - ci); if (dd < best) { best = dd; c = ci; pup = pi; }',
      '    }',
      '    col = lentille(c, N, V, max(dot(N, V), 0.0), pup); fait = true;',
      '  } else if (m < 7.5) {',                            /* boutons */
      '    alb = vec3(0.012); F0 = TITANE * 1.08; ro = 0.34;',
      '  } else {',                                         /* commande de l\'appareil photo : saphir */
      '    alb = vec3(0.003); F0 = vec3(0.06); ro = 0.05;',
      '  }',
      '  if (!fait) {',
      '    float nv = max(dot(N, V), 0.0);',
      '    col = (alb * irr(N) + env(reflect(-V, N), ro) * fres(F0, nv, ro)) * occ + plus;',
      '  }',
      '  col *= uExp;',
      '  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);',
      '  col = pow(col, vec3(1.0 / 2.2));',
      '  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
  }

  /* ---------- Rendu ---------- */
  function creer(canvas, o) {
    o = o || {};
    var marge = o.marge === undefined ? 7 : o.marge, dist = o.distance || 150;
    var hw = W / 2 + marge, hh = H / 2 + marge;
    /* failIfMajorPerformanceCaveat : pas de rendu logiciel lent ; sans carte graphique, le site garde les faces en image. */
    var attrs = { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !o.logiciel };
    var gl = null, prog = null, loc = {}, nIdx = 0, pret = false, px = 0.05;
    var dernier = { rx: 0, rz: 0, ry: 180 }, cle = norme(LUMIERES[0].c);
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    if (!o.logiciel) {                 // rendu logiciel annoncé par le navigateur : trop lent, on garde les faces en image
      var info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) return null;
    }

    function compiler(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (w.console) w.console.error('telephone3d : ' + gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function initialiser() {
      var vs = compiler(gl.VERTEX_SHADER, VS), fs = compiler(gl.FRAGMENT_SHADER, fragment());
      if (!vs || !fs) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'aP'); gl.bindAttribLocation(prog, 1, 'aN'); gl.bindAttribLocation(prog, 2, 'aM');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { if (w.console) w.console.error('telephone3d : ' + gl.getProgramInfoLog(prog)); return false; }
      gl.useProgram(prog);
      ['uR', 'uK', 'uZ', 'uEye', 'uEyeO', 'uLo', 'uPx', 'uTrou', 'uExp'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
      var M = modele();
      function tampon(cible, donnees) { var b = gl.createBuffer(); gl.bindBuffer(cible, b); gl.bufferData(cible, donnees, gl.STATIC_DRAW); return b; }
      tampon(gl.ARRAY_BUFFER, new Float32Array(M.pos)); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      tampon(gl.ARRAY_BUFFER, new Float32Array(M.nor)); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      tampon(gl.ARRAY_BUFFER, new Float32Array(M.mat)); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
      tampon(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(M.idx));
      nIdx = M.idx.length;
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      /* Profondeur : z_ndc = A + B / w, de −1 (près) à +1 (loin) sur ±42 em. */
      var wn = 1 - 42 / dist, wf = 1 + 42 / dist, B = -2 / (1 / wn - 1 / wf), A = 1 - B / wf;
      gl.uniform3f(loc.uK, 1 / hw, 1 / hh, 1 / dist);
      gl.uniform2f(loc.uZ, A, B);
      gl.uniform3f(loc.uEye, 0, 0, dist);
      gl.uniform1f(loc.uTrou, o.trou ? 1 : 0);
      gl.uniform1f(loc.uExp, o.exposition || 1);
      pret = true;
      return true;
    }
    function dessiner(rx, rz, ry) {
      if (!pret) return;
      dernier.rx = rx; dernier.rz = rz; dernier.ry = ry;
      var a = rx * Math.PI / 180, b = rz * Math.PI / 180, c = ry * Math.PI / 180;
      var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
      /* R = Rx(a) · Rz(b) · Ry(c), mêmes matrices que rotateX/rotateZ/rotateY de CSS. */
      var z00 = cb * cc, z01 = -sb, z02 = cb * sc, z10 = sb * cc, z11 = cb, z12 = sb * sc, z20 = -sc, z22 = cc;
      var r00 = z00, r01 = z01, r02 = z02;
      var r10 = ca * z10 - sa * z20, r11 = ca * z11, r12 = ca * z12 - sa * z22;
      var r20 = sa * z10 + ca * z20, r21 = sa * z11, r22 = sa * z12 + ca * z22;
      gl.uniformMatrix3fv(loc.uR, false, [r00, r10, r20, r01, r11, r21, r02, r12, r22]);
      gl.uniform3f(loc.uEyeO, r20 * dist, r21 * dist, r22 * dist);
      gl.uniform3f(loc.uLo, r00 * cle[0] + r10 * cle[1] + r20 * cle[2], r01 * cle[0] + r11 * cle[1] + r21 * cle[2], r02 * cle[0] + r12 * cle[1] + r22 * cle[2]);
      gl.uniform1f(loc.uPx, px);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
    }
    function taille(lw, lh, dpr) {
      var cw = Math.max(2, Math.round(lw * dpr)), ch = Math.max(2, Math.round(lh * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
      px = 2 * hw / cw;
      dessiner(dernier.rx, dernier.rz, dernier.ry);
    }
    /* Durée réelle d'une image, rendu terminé (ms) : sert à choisir la finesse du dessin selon l'appareil. */
    function cout() {
      if (!pret) return 0;
      var un = new Uint8Array(4), sauve = [dernier.rx, dernier.rz, dernier.ry], t0, i;
      dessiner(8, -5, 152); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, un);
      t0 = w.performance.now();
      for (i = 0; i < 3; i++) { dessiner(8, -5, 150 - i * 25); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, un); }
      var ms = (w.performance.now() - t0) / 3;
      dessiner(sauve[0], sauve[1], sauve[2]);
      return ms;
    }
    if (!initialiser()) return null;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); pret = false; }, false);
    canvas.addEventListener('webglcontextrestored', function () { if (initialiser()) { gl.viewport(0, 0, canvas.width, canvas.height); dessiner(dernier.rx, dernier.rz, dernier.ry); } }, false);
    return { dessiner: dessiner, taille: taille, cout: cout, marge: marge };
  }

  w.BFTelephone = { creer: creer, cotes: { W: W, H: H, T: T, ecran: ECR } };
})(window);
