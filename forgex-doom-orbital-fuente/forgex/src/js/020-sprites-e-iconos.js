  // ================= SPRITES E ÍCONOS =================
  const defEm = (r, g, b) => r > 220 && g > 190 && b < 140;
  function spriteFrom(draw, em = defEm) {
    const cv = mk(64, 64), g = cv.getContext('2d'); draw(g);
    const d = g.getImageData(0, 0, 64, 64).data, px = new Uint32Array(4096), e = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) if (d[i * 4 + 3] > 128) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      px[i] = rgb(r, gg, b); e[i] = em === true || (em && em(r, gg, b)) ? 1 : 0;
    }
    return { px, em: e, cv };
  }
  const radial = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 1, x, y, r); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  function imp(col, dark, step, wind, dead) {
    return spriteFrom(g => {
      if (dead) {
        g.fillStyle = '#5a0006'; g.beginPath(); g.ellipse(32, 58, 26, 5, 0, 0, 7); g.fill();
        g.fillStyle = dark; g.beginPath(); g.ellipse(30, 54, 16, 6, 0, 0, 7); g.fill();
        g.fillStyle = '#e6dcc8'; g.beginPath(); g.moveTo(42, 52); g.lineTo(50, 46); g.lineTo(45, 54); g.fill(); return;
      }
      const lx = step ? 3 : -3;
      g.fillStyle = dark; g.fillRect(19 + lx, 50, 9, 14); g.fillRect(36 - lx, 50, 9, 14);
      g.fillStyle = '#1a0a08'; g.fillRect(17 + lx, 61, 12, 3); g.fillRect(34 - lx, 61, 12, 3);
      g.strokeStyle = dark; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath();
      g.moveTo(20, 30); g.lineTo(8, 44 + (step ? -3 : 3));
      if (wind) { g.moveTo(44, 30); g.lineTo(54, 16); } else { g.moveTo(44, 30); g.lineTo(56, 44 + (step ? 3 : -3)); }
      g.stroke();
      g.fillStyle = radial(g, 26, 30, 26, [[0, col], [1, dark]]); g.beginPath(); g.ellipse(32, 38, 17, 19, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(32, 26); g.lineTo(32, 52); g.moveTo(24, 36); g.quadraticCurveTo(32, 40, 40, 36); g.stroke();
      g.fillStyle = radial(g, 28, 12, 13, [[0, col], [1, dark]]); g.beginPath(); g.arc(32, 16, 11, 0, 7); g.fill();
      g.fillStyle = '#efe4cf'; g.beginPath(); g.moveTo(24, 9); g.quadraticCurveTo(14, 4, 15, -2); g.lineTo(28, 6); g.fill();
      g.beginPath(); g.moveTo(40, 9); g.quadraticCurveTo(50, 4, 49, -2); g.lineTo(36, 6); g.fill();
      g.fillStyle = '#fff36a'; g.beginPath(); g.arc(28, 14, 2.6, 0, 7); g.arc(36, 14, 2.6, 0, 7); g.fill();
      g.fillStyle = '#2a0000'; g.fillRect(26, 20, 12, 4);
      if (wind) { g.fillStyle = radial(g, 55, 13, 10, [[0, '#fffbd0'], [.45, '#ffa020'], [1, 'rgba(200,40,0,0)']]); g.beginPath(); g.arc(55, 13, 10, 0, 7); g.fill(); }
    }, wind ? (r, g, b) => r > 220 && g > 120 && b < 150 : defEm);
  }
  function skull(tele, hurt) {
    return spriteFrom(g => {
      for (let k = 0; k < 6; k++) { const x = 12 + k * 8; g.fillStyle = k % 2 ? '#ff8a1a' : '#ffd040';
        g.beginPath(); g.moveTo(x - 7, 34); g.quadraticCurveTo(x, 2 + (k % 3) * 5, x + 7, 34); g.fill(); }
      const bone = hurt ? '#ffffff' : '#e8dcc0';
      g.fillStyle = bone; g.beginPath(); g.arc(32, 34, 17, 0, 7); g.fill(); g.fillRect(22, 44, 20, 12);
      g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(25, 33, 5, 6, 0, 0, 7); g.ellipse(39, 33, 5, 6, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(32, 38); g.lineTo(29, 44); g.lineTo(35, 44); g.fill();
      for (let k = 0; k < 5; k++) g.fillRect(24 + k * 4, 50, 1.5, 6);
      g.fillStyle = tele ? '#ff2a2a' : '#ffe060'; const er = tele ? 4 : 2;
      g.beginPath(); g.arc(25, 33, er, 0, 7); g.arc(39, 33, er, 0, 7); g.fill();
    }, (r, g, b) => r > 220 && b < 120 && (g > 100 || tele));
  }
  function caco(tele, hurt) {
    return spriteFrom(g => {
      g.fillStyle = hurt ? '#ffd0d0' : '#5a0e0a'; g.beginPath(); g.moveTo(14, 16); g.lineTo(8, 2); g.lineTo(22, 10); g.fill(); g.beginPath(); g.moveTo(50, 16); g.lineTo(56, 2); g.lineTo(42, 10); g.fill();
      g.fillStyle = radial(g, 24, 22, 32, hurt ? [[0, '#ffffff'], [1, '#ff9090']] : [[0, '#e8563e'], [.7, '#9a1c14'], [1, '#4a0806']]);
      g.beginPath(); g.arc(32, 32, 29, 0, 7); g.fill();
      g.fillStyle = '#f4f0e0'; g.beginPath(); g.arc(32, 22, 9, 0, 7); g.fill();
      g.fillStyle = '#40d060'; g.beginPath(); g.arc(32, 22, 5, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(32, 22, 2, 0, 7); g.fill();
      g.fillStyle = tele ? radial(g, 32, 45, 12, [[0, '#ffffff'], [.4, '#e0a0ff'], [1, '#7a2ac0']]) : '#1a0204';
      g.beginPath(); g.ellipse(32, 45, 14, tele ? 10 : 7, 0, 0, 7); g.fill();
      g.fillStyle = '#efe4cf'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(21 + k * 4, 39); g.lineTo(23 + k * 4, 43); g.lineTo(25 + k * 4, 39); g.fill(); }
    }, tele ? (r, g, b) => b > 200 && r > 150 : false);
  }
  const SPR = {
    imp: { alive: [imp('#d8402f', '#5e0f0c', 0), imp('#d8402f', '#5e0f0c', 1)], hurt: [imp('#ffffff', '#ff9a9a', 0), imp('#ffffff', '#ff9a9a', 1)],
      wind: [imp('#ffae3a', '#a8300a', 0, true), imp('#ffae3a', '#a8300a', 1, true)], dead: imp('#8c1e14', '#4a0a08', 0, false, true) },
    skull: { n: skull(false, false), tele: skull(true, false), hurt: skull(false, true) },
    caco: { n: caco(false, false), tele: caco(true, false), hurt: caco(false, true) },
    fire: spriteFrom(g => { g.fillStyle = radial(g, 32, 32, 31, [[0, '#ffffff'], [.25, '#fff0a0'], [.6, '#ff9020'], [1, '#c01800']]); g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); }, true),
    plasma: spriteFrom(g => { g.fillStyle = radial(g, 32, 32, 31, [[0, '#ffffff'], [.3, '#e0a0ff'], [1, '#6a1ab0']]); g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); }, true),
  };
  // ---------- sprites en alta definición (128 px) ----------
  // draw(g, em): g = color; em = máscara de brillo propio (ojos, fuego, plasma): esos píxeles no reciben
  // la luz del escenario y alimentan el resplandor. Después se añade un contorno oscuro de 1 px, una luz
  // de borde fría desde arriba a la derecha y una leve oclusión hacia los pies.
  const HD = 128;
  function spriteHD(draw, opt = {}) {
    const cv = mk(HD, HD), g = cv.getContext('2d'), ecv = mk(HD, HD), e = ecv.getContext('2d');
    draw(g, e);
    const d = g.getImageData(0, 0, HD, HD).data, m = e.getImageData(0, 0, HD, HD).data, N = HD * HD;
    const px = new Uint32Array(N), em = new Uint8Array(N), op = new Uint8Array(N);
    for (let i = 0; i < N; i++) op[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    const rim = opt.rim || [150, 185, 255], rimK = opt.rimK ?? .38, outl = opt.outline || [14, 5, 9], aoK = opt.ao ?? .2;
    for (let y = 0; y < HD; y++) for (let x = 0; x < HD; x++) {
      const i = y * HD + x;
      if (!op[i]) {
        if (!opt.noOutline && ((x > 0 && op[i - 1]) || (x < HD - 1 && op[i + 1]) || (y > 0 && op[i - HD]) || (y < HD - 1 && op[i + HD]))) px[i] = rgb(...outl);
        continue;
      }
      let r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      const glow = m[i * 4 + 3] > 60;
      if (!glow) {
        const xe = Math.min(HD - 1, x + 2), ye = Math.max(0, y - 2);
        if (!op[ye * HD + xe]) { r += (rim[0] - r) * rimK; gg += (rim[1] - gg) * rimK; b += (rim[2] - b) * rimK; }
        const ao = 1 - aoK * (y / HD) ** 2;
        r *= ao; gg *= ao; b *= ao;
      }
      px[i] = rgb(r, gg, b); em[i] = glow ? 1 : 0;
    }
    return { px, em, cv, n: HD };
  }
  // copia del sprite teñida hacia un color (destello de daño)
  function tintHD(s, col, k) {
    const px = new Uint32Array(s.px.length);
    for (let i = 0; i < px.length; i++) { const c = s.px[i]; if (!c) continue;
      const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      px[i] = rgb(r + (col[0] - r) * k, g + (col[1] - g) * k, b + (col[2] - b) * k); }
    return { px, em: s.em, cv: s.cv, n: s.n };
  }
  const lin = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const rad2 = (g, x, y, r0, r, stops) => { const gr = g.createRadialGradient(x, y, r0, x, y, r); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const both = (g, e, f) => { f(g); f(e); }; // dibuja lo mismo en color y en la máscara de brillo

  // ===== IMP: demonio con cuernos, espinas y bolas de fuego =====
  const IMPC = { skin: '#9e3c25', mid: '#6e2213', dark: '#360c07', light: '#dc7c52', bone: '#eee0c2', boneD: '#8c7656', eye: '#ffe45a' };
  function drawImp(g, e, P) {
    const C = P.pal || IMPC, ph = P.walk || 0, sw = Math.sin(ph), bob = Math.abs(sw) * 2.5 * (P.walk != null ? 1 : 0);
    g.save(); e.save();
    const tf = c => { c.translate(P.pivot ?? 64, 124 + (P.drop || 0)); c.rotate(P.lean || 0); c.scale(.94, .94); c.translate(-64, -124); };
    tf(g); tf(e);
    g.lineCap = g.lineJoin = 'round';
    const limb = (x0, y0, x1, y1, w0, w1, c0, c1) => { // segmento cónico sombreado
      const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
      g.fillStyle = lin(g, x0 + nx * w0, y0 + ny * w0, x0 - nx * w0, y0 - ny * w0, [[0, c0], [1, c1]]);
      g.beginPath(); g.moveTo(x0 + nx * w0, y0 + ny * w0); g.lineTo(x1 + nx * w1, y1 + ny * w1); g.lineTo(x1 - nx * w1, y1 - ny * w1); g.lineTo(x0 - nx * w0, y0 - ny * w0); g.closePath(); g.fill();
      g.beginPath(); g.arc(x1, y1, w1, 0, 7); g.fill(); g.beginPath(); g.arc(x0, y0, w0, 0, 7); g.fill();
    };
    const claws = (x, y, dir, n = 3) => { g.fillStyle = C.bone; for (let k = 0; k < n; k++) { const ox = x + (k - 1) * 4; g.beginPath(); g.moveTo(ox - 1.6, y); g.lineTo(ox + dir * 3.5, y + 4.5); g.lineTo(ox + 1.6, y); g.fill(); } };
    // --- piernas (la de atrás más oscura) ---
    const leg = (hx, fwd, lift, back) => {
      const hy = 76 - bob, kx = hx + fwd * .45 + 2, ky = 97 - lift * .6, fx = hx + fwd, fy = 119 - lift;
      limb(hx, hy, kx, ky, 8.5, 6.5, back ? C.mid : C.light, back ? C.dark : C.mid);
      limb(kx, ky, fx, fy, 6.5, 4.5, back ? C.mid : C.skin, C.dark);
      g.fillStyle = back ? C.dark : C.mid; g.beginPath(); g.ellipse(fx + 3, fy + 2.5, 8, 3.8, 0, 0, 7); g.fill();
      claws(fx + 6, fy + 2, 1);
    };
    const st = P.walk != null ? sw * 9 : 0, lf = P.walk != null ? Math.max(0, Math.cos(ph)) * 5 : 0, rf = P.walk != null ? Math.max(0, -Math.cos(ph)) * 5 : 0;
    leg(56, -st, lf, true); leg(72, st, rf, false);
    // --- cola ---
    g.strokeStyle = C.dark; g.lineWidth = 5; g.beginPath(); g.moveTo(58, 80 - bob); g.quadraticCurveTo(34, 92, 30 + sw * 4, 108); g.stroke();
    g.fillStyle = C.dark; g.beginPath(); g.moveTo(26 + sw * 4, 106); g.lineTo(33 + sw * 4, 104); g.lineTo(29 + sw * 4, 114); g.fill();
    // --- brazo de atrás ---
    const arm = (sx, sy, ex, ey, hx2, hy2, back) => {
      limb(sx, sy, ex, ey, 6.5, 5, back ? C.mid : C.light, back ? C.dark : C.mid);
      limb(ex, ey, hx2, hy2, 5, 4, back ? C.mid : C.skin, C.dark);
      g.fillStyle = back ? C.dark : C.mid; g.beginPath(); g.arc(hx2, hy2, 5, 0, 7); g.fill();
      claws(hx2, hy2 + 3, back ? -1 : 1);
    };
    const as = P.walk != null ? -sw * 6 : 0, atk = P.atk || 0;
    arm(46, 44 - bob, 36 - as * .3, 64 - bob, 33 - as, 80 - bob, true);
    // --- torso musculoso ---
    const ty = -bob;
    g.fillStyle = rad2(g, 54, 44 + ty, 4, 40, [[0, C.light], [.45, C.skin], [1, C.dark]]);
    g.beginPath(); g.moveTo(42, 38 + ty); g.quadraticCurveTo(64, 28 + ty, 86, 38 + ty); g.quadraticCurveTo(84, 62 + ty, 76, 80 + ty);
    g.quadraticCurveTo(64, 86 + ty, 52, 80 + ty); g.quadraticCurveTo(44, 62 + ty, 42, 38 + ty); g.fill();
    // pectorales y abdomen
    g.strokeStyle = 'rgba(40,6,2,.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(64, 40 + ty); g.lineTo(64, 78 + ty); g.stroke();
    g.beginPath(); g.moveTo(48, 50 + ty); g.quadraticCurveTo(56, 56 + ty, 64, 52 + ty); g.quadraticCurveTo(72, 56 + ty, 80, 50 + ty); g.stroke();
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(56, 61 + k * 6 + ty); g.lineTo(72, 61 + k * 6 + ty); g.stroke(); }
    g.fillStyle = 'rgba(255,190,140,.35)'; g.beginPath(); g.ellipse(55, 45 + ty, 7, 4, -.3, 0, 7); g.fill();
    // --- hombros con espinas ---
    for (const [x, y, dir] of [[44, 38, -1], [84, 38, 1]]) {
      g.fillStyle = rad2(g, x - dir * 2, y - 3 + ty, 1, 11, [[0, C.light], [1, C.mid]]); g.beginPath(); g.arc(x, y + ty, 9, 0, 7); g.fill();
      g.fillStyle = lin(g, x, y + ty, x + dir * 8, y - 14 + ty, [[0, C.boneD], [1, C.bone]]);
      for (const o of [-4, 3]) { g.beginPath(); g.moveTo(x + o - 2.5, y - 4 + ty); g.lineTo(x + o + dir * 5, y - 16 + ty); g.lineTo(x + o + 2.5, y - 5 + ty); g.fill(); }
    }
    // --- cabeza ---
    const hx = 64, hy = 24 + ty;
    g.fillStyle = rad2(g, hx - 5, hy - 6, 2, 17, [[0, C.light], [.55, C.skin], [1, C.dark]]);
    g.beginPath(); g.ellipse(hx, hy, 13, 15, 0, 0, 7); g.fill();
    // cuernos curvos
    for (const dir of [-1, 1]) {
      g.fillStyle = lin(g, hx + dir * 8, hy - 8, hx + dir * 22, hy - 26, [[0, C.boneD], [.6, C.bone], [1, '#fff8e6']]);
      g.beginPath(); g.moveTo(hx + dir * 5, hy - 9); g.quadraticCurveTo(hx + dir * 22, hy - 14, hx + dir * 20, hy - 30); g.quadraticCurveTo(hx + dir * 15, hy - 16, hx + dir * 10, hy - 5); g.fill();
    }
    // ceño, ojos, boca
    g.fillStyle = C.dark; g.beginPath(); g.moveTo(hx - 11, hy - 4); g.lineTo(hx, hy - 1); g.lineTo(hx + 11, hy - 4); g.lineTo(hx + 11, hy - 1); g.lineTo(hx, hy + 2); g.lineTo(hx - 11, hy - 1); g.fill();
    both(g, e, c => { c.fillStyle = P.eye || C.eye; c.beginPath(); c.ellipse(hx - 5.5, hy + 1.5, 3.2, 2, .25, 0, 7); c.ellipse(hx + 5.5, hy + 1.5, 3.2, 2, -.25, 0, 7); c.fill(); });
    g.fillStyle = '#fffbe0'; g.fillRect(hx - 6.5, hy + .8, 1.4, 1.2); g.fillRect(hx + 4.6, hy + .8, 1.4, 1.2);
    g.fillStyle = '#1c0302'; g.beginPath(); g.moveTo(hx - 7, hy + 8); g.quadraticCurveTo(hx, hy + (P.roar ? 16 : 12), hx + 7, hy + 8); g.quadraticCurveTo(hx, hy + 10, hx - 7, hy + 8); g.fill();
    g.fillStyle = C.bone; for (let k = 0; k < 5; k++) { const x = hx - 5 + k * 2.5; g.beginPath(); g.moveTo(x - .9, hy + 8.4); g.lineTo(x, hy + 11); g.lineTo(x + .9, hy + 8.4); g.fill(); }
    // --- brazo de delante (o lanzando) ---
    if (atk > 0) {
      const hx2 = 94 + atk * 4, hy2 = 18 - atk * 6 + ty;
      arm(84, 42 + ty, 96, 30 + ty, hx2, hy2, false);
      const R = 5 + atk * 9;
      both(g, e, c => { c.fillStyle = rad2(c, hx2, hy2 - R * .6, 1, R, [[0, '#fffde8'], [.35, '#ffd24a'], [.75, '#ff7a14'], [1, 'rgba(210,40,0,0)']]); c.beginPath(); c.arc(hx2, hy2 - R * .6, R, 0, 7); c.fill(); });
    } else arm(84, 44 - bob, 92 + as * .3, 64 - bob, 95 + as, 80 - bob, false);
    g.restore(); e.restore();
  }
  function impCorpse(g) {
    g.fillStyle = rad2(g, 64, 118, 2, 50, [[0, '#6a0008'], [.7, '#48000a'], [1, 'rgba(40,0,6,0)']]); g.beginPath(); g.ellipse(64, 118, 52, 9, 0, 0, 7); g.fill();
    g.fillStyle = lin(g, 30, 104, 30, 122, [[0, IMPC.skin], [1, IMPC.dark]]); g.beginPath(); g.ellipse(58, 113, 30, 9, -.05, 0, 7); g.fill();
    g.fillStyle = IMPC.mid; g.beginPath(); g.ellipse(94, 111, 11, 9, .2, 0, 7); g.fill();
    g.fillStyle = IMPC.bone; g.beginPath(); g.moveTo(99, 104); g.quadraticCurveTo(114, 96, 118, 84); g.quadraticCurveTo(110, 100, 102, 108); g.fill();
    g.beginPath(); g.moveTo(40, 106); g.lineTo(34, 96); g.lineTo(44, 105); g.fill();
    g.strokeStyle = IMPC.dark; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(34, 116); g.lineTo(16, 120); g.moveTo(72, 110); g.lineTo(84, 122); g.stroke();
  }
  const impFrames = (() => {
    const walk = [0, 1, 2, 3].map(k => spriteHD((g, e) => drawImp(g, e, { walk: k * Math.PI / 2 })));
    const wind = [.45, 1].map(a => spriteHD((g, e) => drawImp(g, e, { atk: a, roar: true })));
    const hurt = spriteHD((g, e) => drawImp(g, e, { lean: -.12, roar: true }));
    const death = [
      spriteHD((g, e) => drawImp(g, e, { lean: .2, pivot: 58, roar: true, eye: '#ff9a3a' })),
      spriteHD((g, e) => drawImp(g, e, { lean: .62, pivot: 42, drop: 2, eye: '#b04010' })),
      spriteHD((g, e) => drawImp(g, e, { lean: 1.2, pivot: 20, drop: 2, eye: '#601004' })),
      spriteHD(g => impCorpse(g)),
    ];
    return { walk, wind, hurt: tintHD(hurt, [255, 255, 255], .55), death };
  })();

  // ===== ALMA PERDIDA: calavera en llamas =====
  function drawSkull(g, e, P) {
    const f = P.frame || 0, jaw = P.jaw || 0, hot = P.tele ? 1 : 0;
    // llamas: capas de lenguas de fuego que cambian por cuadro
    for (let layer = 0; layer < 3; layer++) {
      const n = 7, w = 70 - layer * 16, base = 74 - layer * 2;
      for (let k = 0; k < n; k++) {
        const x = 64 - w / 2 + (k + .5) * w / n, hgt = 34 + 22 * Math.abs(Math.sin(k * 1.7 + f * 1.3 + layer)) + (hot ? 12 : 0) - layer * 6;
        both(g, e, c => { c.fillStyle = lin(c, x, base, x, base - hgt, layer === 2 ? [[0, '#fffbe0'], [1, 'rgba(255,240,160,0)']] : layer === 1 ? [[0, '#ffd23c'], [1, 'rgba(255,140,20,0)']] : [[0, '#ff7a14'], [1, 'rgba(200,30,0,0)']]);
          c.beginPath(); c.moveTo(x - w / n * .9, base); c.quadraticCurveTo(x - w / n * .4 + Math.sin(f + k) * 3, base - hgt * .6, x + Math.sin(f * 2 + k) * 4, base - hgt); c.quadraticCurveTo(x + w / n * .4, base - hgt * .5, x + w / n * .9, base); c.fill(); });
      }
    }
    // cráneo
    const cx = 64, cy = 70;
    g.fillStyle = rad2(g, cx - 9, cy - 12, 3, 32, [[0, '#fffaf0'], [.5, P.bone || '#e6d8b8'], [1, '#7a6a4e']]);
    g.beginPath(); g.ellipse(cx, cy, 25, 23, 0, 0, 7); g.fill();
    // pómulos y maxilar
    g.beginPath(); g.moveTo(cx - 20, cy + 6); g.quadraticCurveTo(cx - 18, cy + 22, cx - 10, cy + 25); g.lineTo(cx + 10, cy + 25); g.quadraticCurveTo(cx + 18, cy + 22, cx + 20, cy + 6); g.fill();
    // mandíbula (se abre al embestir)
    g.fillStyle = lin(g, cx, cy + 22, cx, cy + 36 + jaw, [[0, '#d8c8a4'], [1, '#6a5a40']]);
    g.beginPath(); g.moveTo(cx - 14, cy + 22 + jaw * .6); g.quadraticCurveTo(cx, cy + 38 + jaw, cx + 14, cy + 22 + jaw * .6); g.lineTo(cx + 11, cy + 27 + jaw * .8); g.lineTo(cx - 11, cy + 27 + jaw * .8); g.fill();
    g.fillStyle = '#fff6e0'; for (let k = 0; k < 7; k++) { const x = cx - 10.5 + k * 3.5; g.fillRect(x, cy + 21, 2.4, 4); g.fillRect(x, cy + 23 + jaw * .7, 2.4, 3.2); }
    // cuencas, nariz y grietas
    g.fillStyle = '#140a06';
    g.beginPath(); g.ellipse(cx - 9.5, cy + 1, 7.5, 8.5, .15, 0, 7); g.ellipse(cx + 9.5, cy + 1, 7.5, 8.5, -.15, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx, cy + 9); g.lineTo(cx - 3.5, cy + 16); g.lineTo(cx + 3.5, cy + 16); g.fill();
    g.strokeStyle = 'rgba(60,40,20,.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx + 6, cy - 21); g.lineTo(cx + 3, cy - 13); g.lineTo(cx + 8, cy - 8); g.stroke();
    if (P.crack) { g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 14, cy - 18); g.lineTo(cx - 4, cy - 6); g.lineTo(cx - 8, cy + 4); g.moveTo(cx + 12, cy - 16); g.lineTo(cx + 18, cy - 2); g.stroke(); }
    // pupilas encendidas
    const er = hot ? 4.5 : 2.6;
    both(g, e, c => { c.fillStyle = hot ? '#ff3a24' : '#ffe25a'; c.beginPath(); c.arc(cx - 9.5, cy + 2, er, 0, 7); c.arc(cx + 9.5, cy + 2, er, 0, 7); c.fill(); });
  }
  const skullFrames = (() => {
    const n = [0, 1, 2, 3].map(f => spriteHD((g, e) => drawSkull(g, e, { frame: f })));
    const tele = [0, 1].map(f => spriteHD((g, e) => drawSkull(g, e, { frame: f * 2, tele: true, jaw: 3 })));
    const dash = spriteHD((g, e) => drawSkull(g, e, { frame: 1, tele: true, jaw: 8 }));
    const hurt = tintHD(spriteHD((g, e) => drawSkull(g, e, { frame: 2, jaw: 2 })), [255, 255, 255], .55);
    const death = [spriteHD((g, e) => drawSkull(g, e, { frame: 3, crack: true, jaw: 10, bone: '#bca888' })),
      spriteHD((g, e) => { g.save(); e.save(); g.translate(64, 80); g.rotate(.5); g.translate(-64, -80); e.translate(64, 80); e.rotate(.5); e.translate(-64, -80);
        drawSkull(g, e, { frame: 1, crack: true, jaw: 12, bone: '#8a7a5e' }); g.restore(); e.restore(); })];
    return { n, tele, dash, hurt, death };
  })();

  // ===== CACODEMONIO: esfera flotante con un ojo y cuernos =====
  function drawCaco(g, e, P) {
    const cx = 64, cy = 68, R = 50, mo = P.mouth || 0;
    // cuernos
    for (const [x, s, h] of [[-30, -1, 30], [-14, -1, 22], [14, 1, 22], [30, 1, 30]]) {
      g.fillStyle = lin(g, cx + x, cy - 36, cx + x + s * 8, cy - 36 - h, [[0, '#7a6242'], [.5, '#e6d6b2'], [1, '#fffae8']]);
      g.beginPath(); g.moveTo(cx + x - 6, cy - 34 + Math.abs(x) * .2); g.quadraticCurveTo(cx + x + s * 3, cy - 44 - h * .4, cx + x + s * 9, cy - 34 - h); g.quadraticCurveTo(cx + x + s * 4, cy - 40, cx + x + 6, cy - 36 + Math.abs(x) * .2); g.fill();
    }
    // cuerpo con relieve
    g.fillStyle = rad2(g, cx - 18, cy - 20, 4, R + 8, P.pal || [[0, '#ff8a6a'], [.28, '#e0503a'], [.7, '#8e1a12'], [1, '#2e0403']]);
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    let sd = 7; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 26; k++) { const a = rr() * 6.283, d = Math.sqrt(rr()) * R * .9, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, r = 1.5 + rr() * 3.5;
      if (y > cy + 8 && Math.abs(x - cx) < 30) continue;
      g.fillStyle = 'rgba(60,4,2,.35)'; g.beginPath(); g.arc(x + .8, y + .8, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,170,130,.25)'; g.beginPath(); g.arc(x - .6, y - .6, r * .7, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,235,220,.55)'; g.beginPath(); g.ellipse(cx - 20, cy - 26, 12, 6, -.6, 0, 7); g.fill();
    // ojo
    const ey = cy - 12, blink = P.blink ? 1 : 0;
    g.fillStyle = '#3a0604'; g.beginPath(); g.ellipse(cx, ey, 17, 14, 0, 0, 7); g.fill();
    if (!blink) {
      g.fillStyle = rad2(g, cx - 3, ey - 4, 1, 14, [[0, '#ffffff'], [1, '#d8cfb8']]); g.beginPath(); g.ellipse(cx, ey, 14, 11.5, 0, 0, 7); g.fill();
      both(g, e, c => { c.fillStyle = rad2(c, cx, ey, 1, 8, [[0, '#d8ff8a'], [.6, P.iris || '#3ec85a'], [1, '#0e5a1c']]); c.beginPath(); c.arc(cx, ey, 8, 0, 7); c.fill(); });
      g.fillStyle = '#050505'; g.beginPath(); g.ellipse(cx, ey, 2.2, 6.5, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - 3.5, ey - 4, 1.8, 0, 7); g.fill();
    } else { g.strokeStyle = '#1a0202'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 13, ey); g.quadraticCurveTo(cx, ey + 5, cx + 13, ey); g.stroke(); }
    // boca con dientes (se abre al cargar el plasma)
    const my = cy + 22, mh = 8 + mo * 12;
    g.fillStyle = '#1a0103'; g.beginPath(); g.moveTo(cx - 30, my - 4); g.quadraticCurveTo(cx, my + mh + 8, cx + 30, my - 4); g.quadraticCurveTo(cx, my + 4, cx - 30, my - 4); g.fill();
    if (mo > 0) both(g, e, c => { c.fillStyle = rad2(c, cx, my + mh * .5, 1, 10 + mo * 12, [[0, '#ffffff'], [.35, '#e6a8ff'], [.8, '#8a2ad8'], [1, 'rgba(90,20,160,0)']]); c.beginPath(); c.ellipse(cx, my + mh * .45, 8 + mo * 12, 4 + mo * 7, 0, 0, 7); c.fill(); });
    g.fillStyle = '#f2e8d0';
    for (let k = 0; k < 9; k++) { const x = cx - 24 + k * 6, t = 1 - Math.abs(k - 4) / 5; g.beginPath(); g.moveTo(x - 2.2, my - 2 + (1 - t) * 3); g.lineTo(x, my + 4 + t * 3); g.lineTo(x + 2.2, my - 2 + (1 - t) * 3); g.fill(); }
    for (let k = 0; k < 7; k++) { const x = cx - 18 + k * 6, yb = my + mh + 2 - Math.abs(k - 3) * 1.5; g.beginPath(); g.moveTo(x - 2, yb); g.lineTo(x, yb - 4 - mo * 2); g.lineTo(x + 2, yb); g.fill(); }
    if (P.split) { g.strokeStyle = '#300002'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 6, cy - R); g.lineTo(cx + 4, cy - 20); g.lineTo(cx - 3, cy + 6); g.lineTo(cx + 6, cy + R); g.stroke();
      g.fillStyle = '#9a0008'; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(cx + Math.sin(k * 2.3) * 40, cy + 20 + k * 4, 3 + k % 3, 0, 7); g.fill(); } }
  }
  const cacoFrames = (() => {
    const n = [0, 1].map(k => spriteHD((g, e) => drawCaco(g, e, { mouth: k * .12 })));
    const blink = spriteHD((g, e) => drawCaco(g, e, { blink: true }));
    const tele = [.5, 1].map(m => spriteHD((g, e) => drawCaco(g, e, { mouth: m, iris: '#9aff5a' })));
    const hurt = tintHD(spriteHD((g, e) => drawCaco(g, e, { mouth: .3, blink: true })), [255, 255, 255], .55);
    const death = [spriteHD((g, e) => drawCaco(g, e, { mouth: 1, blink: true, split: true })),
      spriteHD((g, e) => drawCaco(g, e, { mouth: 1.2, blink: true, split: true, pal: [[0, '#b84a3a'], [.4, '#8a1a12'], [1, '#1e0202']] }))];
    return { n, blink, tele, hurt, death };
  })();

  // ===== ACECHADOR: sombra flotante con un ojo anular y jirones de humo (perseguidor) =====
  // La cría usa la misma forma con otra paleta (más viva, para que se lea como «rápida» de un vistazo).
  const CHASER_PAL = {
    normal: { core: ['#5a3a8a', '#2a1646', '#0a0412'], wisp: 'rgba(70,40,120,', eye: '#c8ff3a', iris: '#5aa010', maw: '#ff5a2a' },
    small: { core: ['#ff7ad8', '#8a1a8a', '#1a0420'], wisp: 'rgba(200,60,200,', eye: '#7afcff', iris: '#1a9ab8', maw: '#ffe25a' },
  };
  function drawChaser(g, e, P) {
    const C = CHASER_PAL[P.v], f = P.frame || 0, cx = 64, cy = 58, lunge = P.lunge ? 1 : 0;
    // jirones de humo que cuelgan y ondulan
    for (let k = 0; k < 7; k++) {
      const x = cx - 30 + k * 10, len = 34 + 14 * Math.abs(Math.sin(k * 1.9 + f * 1.4)), sway = Math.sin(f * 1.3 + k) * 6;
      g.fillStyle = lin(g, x, cy + 10, x + sway, cy + 10 + len, [[0, C.wisp + '.95)'], [1, C.wisp + '0)']]);
      g.beginPath(); g.moveTo(x - 6, cy + 8); g.quadraticCurveTo(x + sway * .5, cy + 10 + len * .6, x + sway, cy + 10 + len); g.quadraticCurveTo(x + sway * .5 + 3, cy + 10 + len * .5, x + 6, cy + 8); g.fill();
    }
    // cuerpo encorvado hacia delante
    g.fillStyle = rad2(g, cx - 10, cy - 14, 3, 40, [[0, C.core[0]], [.55, C.core[1]], [1, C.core[2]]]);
    g.beginPath(); g.ellipse(cx, cy, 34 + lunge * 3, 28 - lunge * 2, 0, 0, 7); g.fill();
    // púas del lomo
    g.fillStyle = C.core[2];
    for (let k = 0; k < 5; k++) { const x = cx - 20 + k * 10; g.beginPath(); g.moveTo(x - 5, cy - 22); g.lineTo(x + Math.sin(f + k) * 2, cy - 38 - (k % 2) * 6); g.lineTo(x + 5, cy - 22); g.fill(); }
    // ojo anular que brilla
    const ey = cy - 4, er = 12 + lunge * 2;
    both(g, e, c => { c.fillStyle = rad2(c, cx, ey, 2, er + 6, [[0, '#ffffff'], [.35, C.eye], [.8, C.iris], [1, 'rgba(0,0,0,0)']]); c.beginPath(); c.arc(cx, ey, er + 6, 0, 7); c.fill(); });
    g.fillStyle = '#050208'; g.beginPath(); g.ellipse(cx, ey, 3 + lunge * 2, 8, 0, 0, 7); g.fill();
    // boca: una raja con dientes que se abre al lanzarse
    const my = cy + 14, mh = 3 + lunge * 9;
    both(g, e, c => { c.fillStyle = lunge ? C.maw : 'rgba(0,0,0,0)'; c.beginPath(); c.ellipse(cx, my + mh * .4, 16, mh * .6, 0, 0, 7); c.fill(); });
    g.fillStyle = '#12060e'; g.beginPath(); g.moveTo(cx - 18, my); g.quadraticCurveTo(cx, my + mh + 4, cx + 18, my); g.quadraticCurveTo(cx, my + 3, cx - 18, my); g.fill();
    g.fillStyle = '#efe6f0'; for (let k = 0; k < 7; k++) { const x = cx - 13 + k * 4.3; g.beginPath(); g.moveTo(x - 1.6, my + 1); g.lineTo(x, my + 5 + lunge * 2); g.lineTo(x + 1.6, my + 1); g.fill(); }
    if (P.torn) { g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 24, cy - 14); g.lineTo(cx - 4, cy + 4); g.lineTo(cx - 12, cy + 18); g.moveTo(cx + 20, cy - 16); g.lineTo(cx + 8, cy + 8); g.stroke(); }
  }
  const chaserFrames = (() => {
    const out = {};
    for (const v of ['normal', 'small']) {
      const n = [0, 1, 2, 3].map(f => spriteHD((g, e) => drawChaser(g, e, { v, frame: f })));
      const lunge = spriteHD((g, e) => drawChaser(g, e, { v, frame: 1, lunge: true }));
      const hurt = tintHD(spriteHD((g, e) => drawChaser(g, e, { v, frame: 2 })), [255, 255, 255], .55);
      const death = [spriteHD((g, e) => drawChaser(g, e, { v, frame: 3, torn: true, lunge: true })),
        spriteHD((g, e) => { g.globalAlpha = e.globalAlpha = .55; drawChaser(g, e, { v, frame: 0, torn: true }); })];
      out[v] = { n, lunge, hurt, death };
    }
    return out;
  })();

  // ===== COFRE: caja blindada en 3/4 con tapa, cierre luminoso y bandas de peligro =====
  function drawChest(g, e, P) {
    const open = P.open, lockCol = P.lock || '#5ff2e6';
    // sombra en el suelo
    g.fillStyle = rad2(g, 64, 118, 4, 60, [[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]); g.beginPath(); g.ellipse(64, 118, 58, 8, 0, 0, 7); g.fill();
    // lado derecho (en perspectiva)
    g.fillStyle = lin(g, 104, 0, 120, 0, [[0, '#2a2e3c'], [1, '#161822']]);
    g.beginPath(); g.moveTo(104, 66); g.lineTo(120, 56); g.lineTo(120, 104); g.lineTo(104, 118); g.fill();
    // frente
    g.fillStyle = lin(g, 0, 66, 0, 118, [[0, '#6c7390'], [.5, '#4a5068'], [1, '#2c3042']]);
    g.fillRect(12, 66, 92, 52);
    // paneles, remaches y refuerzos de esquina
    g.strokeStyle = 'rgba(10,12,20,.8)'; g.lineWidth = 1.5; g.strokeRect(18, 72, 38, 26); g.strokeRect(60, 72, 38, 26);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(19, 73, 36, 4); g.fillRect(61, 73, 36, 4);
    g.fillStyle = '#8a90a8';
    for (const [x, y] of [[16, 70], [100, 70], [16, 114], [100, 114], [58, 70], [58, 114]]) { g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill(); }
    g.fillStyle = lin(g, 0, 66, 0, 118, [[0, '#a8aec4'], [1, '#50566e']]);
    for (const x of [10, 98]) { g.fillRect(x, 64, 8, 56); }
    // banda de peligro inferior
    g.save(); g.beginPath(); g.rect(18, 102, 80, 11); g.clip();
    g.fillStyle = '#141414'; g.fillRect(18, 102, 80, 11); g.fillStyle = '#e8a820';
    for (let k = -2; k < 12; k++) { g.beginPath(); g.moveTo(18 + k * 9, 113); g.lineTo(23 + k * 9, 113); g.lineTo(31 + k * 9, 102); g.lineTo(26 + k * 9, 102); g.fill(); }
    g.restore();
    // asas laterales
    g.strokeStyle = '#1c1f2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(108, 80); g.lineTo(116, 76); g.lineTo(116, 90); g.lineTo(108, 94); g.stroke();
    if (!open) {
      // tapa cerrada: cara superior en perspectiva
      g.fillStyle = lin(g, 0, 44, 0, 66, [[0, '#9aa2bc'], [1, '#5c637c']]);
      g.beginPath(); g.moveTo(8, 66); g.lineTo(26, 46); g.lineTo(122, 46); g.lineTo(106, 66); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(30, 48); g.lineTo(118, 48); g.lineTo(116, 51); g.lineTo(28, 51); g.fill();
      g.strokeStyle = 'rgba(20,22,32,.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(40, 64); g.lineTo(54, 48); g.moveTo(80, 64); g.lineTo(94, 48); g.stroke();
      // junta luminosa de la tapa
      both(g, e, c => { c.fillStyle = lockCol; c.fillRect(12, 65, 92, 2); });
    } else {
      // tapa abierta hacia atrás e interior
      g.fillStyle = lin(g, 0, 20, 0, 66, [[0, '#7a8298'], [1, '#3c4256']]);
      g.beginPath(); g.moveTo(14, 58); g.lineTo(22, 18); g.lineTo(112, 18); g.lineTo(106, 58); g.fill();
      g.strokeStyle = 'rgba(20,22,32,.6)'; g.lineWidth = 1.5; g.strokeRect(30, 26, 68, 22);
      g.fillStyle = '#07080c'; g.beginPath(); g.moveTo(12, 66); g.lineTo(22, 56); g.lineTo(110, 56); g.lineTo(104, 66); g.fill();
      if (P.glow) both(g, e, c => { c.fillStyle = rad2(c, 62, 62, 2, 40, [[0, 'rgba(255,230,150,.95)'], [.5, 'rgba(255,190,80,.5)'], [1, 'rgba(255,160,40,0)']]); c.beginPath(); c.ellipse(62, 60, 44, 10, 0, 0, 7); c.fill(); });
    }
    // placa de cierre con indicador
    g.fillStyle = lin(g, 0, 70, 0, 96, [[0, '#2a2e3c'], [1, '#141620']]); g.fillRect(48, 70, 22, 24);
    g.strokeStyle = '#8a90a8'; g.lineWidth = 1.2; g.strokeRect(48.5, 70.5, 21, 23);
    both(g, e, c => { c.fillStyle = lockCol; c.fillRect(52, 75, 14, 5); c.beginPath(); c.arc(59, 87, 3.2, 0, 7); c.fill(); });
  }
  const chestFrames = {
    closed: spriteHD((g, e) => drawChest(g, e, {}), { ao: .1, rimK: .3 }),
    looted: spriteHD((g, e) => drawChest(g, e, { open: true, lock: '#7dff4a', glow: true }), { ao: .1, rimK: .3 }),
    empty: spriteHD((g, e) => drawChest(g, e, { open: true, lock: '#ff4a3a' }), { ao: .1, rimK: .3 }),
  };
  const AMMO = { celdas: { name: 'celdas', hud: 'CELDAS', col: '#5ff2e6' }, cartuchos: { name: 'cartuchos', hud: 'CARTUCHOS', col: '#ff6a4a' }, nucleos: { name: 'núcleos', hud: 'NUCLEOS', col: '#c77dff' } };
  const WEAP = {
    plasma: { name: 'Rifle de plasma', hud: 'PLASMA', ammo: 'celdas', cd: .2 },
    escopeta: { name: 'Escopeta', hud: 'ESCOPETA', ammo: 'cartuchos', cd: .85 },
    riel: { name: 'Cañón de riel', hud: 'RIEL', ammo: 'nucleos', cd: 1.4 },
  };
  const UPG = {
    placas: { name: 'Placas dérmicas', desc: '+20 de vida máxima', apply: s => { s.maxHp += 20; } },
    condensador: { name: 'Condensador', desc: 'el escudo recarga 12 s antes', apply: s => { s.shieldRecharge = Math.max(30, s.shieldRecharge - 12); } },
    glandula: { name: 'Glándula de reserva', desc: '+25 de reserva máxima', apply: s => { s.reserveMax += 25; } },
    servos: { name: 'Servos de salto', desc: 'saltas 12% más alto', apply: s => { s.jumpMul *= 1.12; } },
    cajas: { name: 'Cajas reforzadas', desc: 'cada caja guarda 8 más', apply: s => { s.boxCap += 8; } },
  };
  const ICON = {};
  const cyanEm = (r, g, b) => g > 200 && b > 200 && r < 170, purpEm = (r, g, b) => b > 200 && r > 150 && g < 190, redEm = (r, g, b) => r > 220 && g < 120;
  ICON.crate = spriteFrom(g => {
    g.fillStyle = '#454a5c'; g.fillRect(6, 20, 52, 38); g.fillStyle = '#6b7188'; g.fillRect(4, 16, 56, 7);
    g.fillStyle = '#111'; g.fillRect(6, 38, 52, 9); g.fillStyle = '#e0a020';
    for (let k = -1; k < 7; k++) { g.beginPath(); g.moveTo(8 + k * 9, 38); g.lineTo(13 + k * 9, 38); g.lineTo(9 + k * 9, 47); g.lineTo(4 + k * 9, 47); g.fill(); }
    g.fillStyle = '#c8ccd8'; for (const [x, y] of [[9, 26], [55, 26], [9, 53], [55, 53]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    g.fillStyle = '#5ff2e6'; g.fillRect(28, 27, 8, 4);
  }, cyanEm);
  ICON.crateOpen = spriteFrom(g => {
    g.fillStyle = '#2e3140'; g.fillRect(6, 24, 52, 34); g.fillStyle = '#08080c'; g.fillRect(9, 24, 46, 8);
    g.fillStyle = '#4c5166'; g.save(); g.translate(6, 24); g.rotate(-.6); g.fillRect(0, -7, 56, 7); g.restore();
  }, false);
  const ammoLoose = {
    celdas: g => { for (let k = 0; k < 3; k++) { const x = 14 + k * 13; g.fillStyle = '#8a90a8'; g.fillRect(x, 24, 10, 4); g.fillRect(x, 50, 10, 4); g.fillStyle = '#5ff2e6'; g.fillRect(x + 1, 28, 8, 22); g.fillStyle = '#e8ffff'; g.fillRect(x + 3, 30, 2, 18); } },
    cartuchos: g => { for (let k = 0; k < 3; k++) { const x = 15 + k * 12; g.fillStyle = '#c8342a'; g.fillRect(x, 22, 9, 24); g.fillStyle = '#d9a441'; g.fillRect(x, 46, 9, 8); g.fillStyle = '#ff7a60'; g.fillRect(x + 2, 24, 2, 20); } },
    nucleos: g => { g.strokeStyle = '#6a6f88'; g.lineWidth = 3; g.strokeRect(18, 22, 28, 32); g.fillStyle = radial(g, 32, 38, 13, [[0, '#ffffff'], [.4, '#d59aff'], [1, '#6a1ab0']]); g.beginPath(); g.arc(32, 38, 12, 0, 7); g.fill(); },
  };
  const ammoEm = { celdas: cyanEm, cartuchos: redEm, nucleos: purpEm };
  for (const k in AMMO) {
    ICON[k] = spriteFrom(ammoLoose[k], ammoEm[k]);
    ICON['box_' + k] = spriteFrom(g => {
      g.fillStyle = '#34402a'; g.fillRect(6, 20, 52, 36); g.fillStyle = '#56663f'; g.fillRect(6, 20, 52, 6);
      g.fillStyle = '#1e2518'; g.fillRect(6, 54, 52, 2); g.fillStyle = AMMO[k].col; g.fillRect(12, 32, 40, 12);
      g.fillStyle = '#10140c'; g.fillRect(16, 35, 32, 6); g.fillStyle = AMMO[k].col; for (let q = 0; q < 4; q++) g.fillRect(18 + q * 8, 36, 4, 4);
    }, ammoEm[k]);
  }
  ICON.plasma = spriteFrom(g => {
    g.fillStyle = '#6a7090'; g.beginPath(); g.moveTo(4, 36); g.lineTo(46, 28); g.lineTo(60, 30); g.lineTo(60, 38); g.lineTo(44, 42); g.lineTo(20, 48); g.lineTo(14, 44); g.fill();
    g.fillStyle = '#2a2d40'; g.fillRect(20, 40, 8, 12); g.fillStyle = '#5ff2e6'; for (let k = 0; k < 3; k++) g.fillRect(30 + k * 7, 30, 3, 10);
  }, cyanEm);
  ICON.escopeta = spriteFrom(g => {
    g.fillStyle = '#6b4424'; g.beginPath(); g.moveTo(2, 38); g.lineTo(22, 32); g.lineTo(24, 42); g.lineTo(6, 48); g.fill();
    g.fillStyle = '#3a3c48'; g.fillRect(20, 30, 42, 5); g.fillRect(20, 36, 42, 4); g.fillStyle = '#8a5a30'; g.fillRect(34, 38, 16, 6);
  }, false);
  ICON.riel = spriteFrom(g => {
    g.fillStyle = '#23263a'; g.fillRect(4, 30, 58, 10); g.fillStyle = '#4a5070'; g.fillRect(4, 30, 58, 3);
    g.fillStyle = '#4aa8ff'; for (let k = 0; k < 5; k++) g.fillRect(18 + k * 8, 28, 3, 14); g.fillStyle = '#2a2d40'; g.fillRect(12, 40, 8, 12);
  }, (r, g, b) => b > 220 && r < 120);
  ICON.shield = spriteFrom(g => {
    g.strokeStyle = '#5ff2e6'; g.lineWidth = 5; g.fillStyle = 'rgba(95,242,230,.25)'; g.beginPath();
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU - Math.PI / 2; g.lineTo(32 + Math.cos(a) * 22, 34 + Math.sin(a) * 22); }
    g.closePath(); g.fill(); g.stroke();
  }, cyanEm);
  ICON.heal = spriteFrom(g => {
    g.fillStyle = '#9aa0b8'; g.fillRect(26, 12, 12, 8); g.strokeStyle = '#cfd4e6'; g.lineWidth = 2; g.strokeRect(22, 20, 20, 36);
    g.fillStyle = radial(g, 32, 40, 18, [[0, '#ff8090'], [1, '#c01024']]); g.fillRect(23, 28, 18, 27);
    g.fillStyle = '#fff'; g.fillRect(30, 34, 4, 14); g.fillRect(25, 39, 14, 4);
  }, redEm);
  ICON.beacon = spriteFrom(g => {
    g.fillStyle = '#23263a'; g.fillRect(29, 22, 6, 42); g.fillStyle = '#3a3f5a'; g.fillRect(22, 58, 20, 6);
    g.fillStyle = radial(g, 32, 16, 15, [[0, '#ffffff'], [.3, '#ff3a3a'], [1, 'rgba(120,0,0,0)']]); g.beginPath(); g.arc(32, 16, 15, 0, 7); g.fill();
  }, (r, g, b) => r > 200 && g < 150);
  ICON.upgrade = spriteFrom(g => {
    g.strokeStyle = '#ffcc40'; g.lineWidth = 2; g.beginPath(); g.ellipse(32, 36, 24, 8, 0, 0, 7); g.stroke();
    g.fillStyle = radial(g, 28, 30, 16, [[0, '#fff6c0'], [.5, '#ffb020'], [1, '#7a4a00']]); g.beginPath(); g.arc(32, 34, 14, 0, 7); g.fill();
  }, (r, g, b) => r > 220 && g > 150 && b < 170);

