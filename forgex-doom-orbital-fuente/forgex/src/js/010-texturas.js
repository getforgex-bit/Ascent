  // ================= TEXTURAS (128 px con relieve) =================
  // 1 casco metálico · 2 roca infernal · 3 impulsor · 4 techo con lámparas · 5 losetas · 6 muro técnico · 7 ácido
  // Cada textura tiene color y mapa de alturas; el relieve se "hornea" con una luz desde arriba a la izquierda.
  function genTex(k) {
    const S = T / 64, N = T * T, col = new Float32Array(N * 3), hgt = new Float32Array(N), emi = new Uint8Array(N);
    const ring32 = (X, Y, cx, cy, r) => Math.hypot(X % 32 - cx, Y % 32 - cy) < r;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const X = x / S, Y = y / S, xs = X | 0, ys = Y | 0, mx = xs % 32, my = ys % 32, i = y * T + x, n = Math.random() * 14 - 7;
      const stain = Math.sin(x * .045 + Math.sin(y * .03) * 2) * Math.cos(y * .05 - x * .02) * 10;
      let c, h = 1;
      if (k === 1) {
        const seam = mx < 1 || my < 1, bevL = mx < 2 || my < 2, bevD = mx > 29 || my > 29;
        const rivet = ring32(X, Y, 5.5, 5.5, 1.7) || ring32(X, Y, 26.5, 5.5, 1.7) || ring32(X, Y, 5.5, 26.5, 1.7) || ring32(X, Y, 26.5, 26.5, 1.7);
        const vent = my > 12 && my < 19 && mx > 7 && mx < 24 && (mx % 3 === 0), stripe = ys > 40 && ys < 46 && ((xs + ys) >> 2) % 2 === 0, grime = Math.sin(X * .7 + Y * .3) * 5 + stain;
        c = seam ? [16, 18, 26] : bevL ? [140, 150, 175] : bevD ? [34, 36, 48] : rivet ? [215, 205, 150] : vent ? [14, 16, 24] : stripe ? [210, 146, 40] : [90 + n + grime, 98 + n + grime, 122 + n + grime];
        h = seam ? 0 : (bevL || bevD) ? .55 : rivet ? 1.9 : vent ? .1 : 1 + n / 90;
      } else if (k === 2) {
        const off = ((ys >> 4) & 1) * 16, m = ys % 16 === 0 || (xs + off) % 32 === 0;
        const vein = Math.abs(Math.sin(X * .19 + Math.sin(Y * .11) * 3) * 40 - (Y - 32)) < 1.3, bumpy = Math.sin(X * 1.3) * Math.cos(Y * 1.1) * 10;
        const e = Math.min(Y % 16, 16 - Y % 16, (X + off) % 32, 32 - (X + off) % 32);
        c = m ? [30, 14, 16] : vein ? [255, 120, 40] : [116 + n + bumpy + stain, 40 + n + bumpy * .5 + stain * .4, 36 + n];
        h = m ? 0 : vein ? .3 : Math.min(1, e / 1.6) * (1 + bumpy / 40 + n / 60);
        if (vein) emi[i] = 1;
      } else if (k === 3) {
        const cx = X % 32 - 16, ar = Math.abs(cx) < 12 - (my / 2.2) && my > 4 && my < 26, e = X % 64 < 3 || Y % 64 < 3, ring = Math.abs(Math.hypot(X - 32, Y - 32) - 26) < 1.5;
        c = e ? [20, 60, 70] : ar ? [190, 255, 250] : ring ? [120, 255, 240] : [26 + n, 108 + n, 128 + n];
        h = ar ? 1.3 : ring ? 1.2 : e ? .2 : 1;
        if (ar || ring) emi[i] = 1;
      } else if (k === 4) {
        const lamp = Y > 27 && Y < 37 && X % 32 > 3 && X % 32 < 29, frame = (Y > 25.5 && Y < 27.5 || Y > 36.5 && Y < 38.5) && X % 32 > 2 && X % 32 < 30, seam = mx === 0 || my === 0;
        c = lamp ? [230, 220, 190] : frame ? [18, 18, 24] : seam ? [20, 20, 26] : [46 + n + stain * .5, 46 + n + stain * .5, 54 + n];
        h = lamp ? 1.2 : frame ? .3 : seam ? 0 : 1;
        if (lamp) emi[i] = 1;
      } else if (k === 5) {
        const tx = X % 16, ty = Y % 16, grout = tx < 1 || ty < 1, v = ((xs >> 4) * 7 + (ys >> 4) * 13) % 5 * 6;
        const crack = ((xs >> 4) + (ys >> 4)) % 7 === 0 && Math.abs(tx - ty - 2) < .5;
        c = grout ? [26, 22, 18] : crack ? [40, 34, 28] : [88 + v + n + stain * .6, 74 + v + n + stain * .5, 56 + v + n];
        h = grout ? 0 : crack ? .4 : Math.min(1, (tx - 1) / 1.4, (ty - 1) / 1.4, (16 - tx) / 1.4, (16 - ty) / 1.4) * (1 + v / 80);
      } else if (k === 6) {
        const panel = X % 16 < 1, line = Y % 21 < 1, band = Y > 22 && Y < 32;
        const light = band && X % 8 > 1.5 && X % 8 < 5.5 && Y > 24 && Y < 30, lc = ((xs >> 3) + (ys >> 3)) % 3;
        c = panel ? [40, 34, 30] : line ? [50, 44, 38] : light ? (lc === 0 ? [80, 255, 90] : lc === 1 ? [255, 60, 50] : [255, 200, 60]) : band ? [20, 20, 24] : [106 + n + stain, 94 + n + stain, 82 + n + stain * .8];
        h = panel ? .15 : line ? .3 : light ? 1.3 : band ? .45 : 1;
        if (light) emi[i] = 1;
      } else {
        const sw = Math.sin(X * .3 + Math.sin(Y * .2) * 2) * Math.cos(Y * .25 - X * .1);
        c = [60 + sw * 40 + n, 200 + sw * 50 + n, 40 + sw * 30]; h = .5 + sw * .5; emi[i] = 1;
      }
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; hgt[i] = h;
    }
    const Hh = (x, y) => hgt[((y + T) % T) * T + ((x + T) % T)], base = new Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % T, y = (i / T) | 0;
      let shade = 1;
      if (!emi[i]) { const e = Hh(x - 1, y - 1) - Hh(x + 1, y + 1) + .5 * (Hh(x - 2, y - 2) - Hh(x + 2, y + 2)); shade = (1 + clamp(e, -1, 1) * .55) * (.74 + .26 * Math.min(1.3, hgt[i])); }
      base[i] = [col[i * 3] * shade, col[i * 3 + 1] * shade, col[i * 3 + 2] * shade];
    }
    const lv = [];
    for (let l = 0; l < NL; l++) { const a = new Uint32Array(N);
      for (let i = 0; i < N; i++) { const f = fogMix(base[i], l); a[i] = rgb(f[0], f[1], f[2]); } lv.push(a); }
    const gl = new Uint32Array(N); for (let i = 0; i < N; i++) if (emi[i]) gl[i] = rgb(base[i][0] * .7, base[i][1] * .7, base[i][2] * .7);
    return { lv, em: emi, gl };
  }
  const TEX = {}; for (let k = 1; k <= 7; k++) TEX[k] = genTex(k);
  const RIMC = { 1: [95, 242, 230], 2: [255, 110, 40], 3: [180, 255, 250], 4: [95, 242, 230], 5: [95, 242, 230], 6: [95, 242, 230], 7: [125, 255, 74] };
  const RIM = {}, RIMG = {};
  for (const k in RIMC) {
    RIM[k] = Array.from({ length: NL }, (_, l) => { const f = fogMix(RIMC[k].map(v => v * 1.2 - l * 2), l * .5); return rgb(f[0], f[1], f[2]); });
    RIMG[k] = Array.from({ length: NL }, (_, l) => { const s = Math.max(0, 1 - l / NL); return rgb(RIMC[k][0] * s, RIMC[k][1] * s, RIMC[k][2] * s); });
  }
  const PADG = rgb(20, 90, 95);
  const lvlOf = d => Math.min(NL - 1, d / 2.4 | 0);

