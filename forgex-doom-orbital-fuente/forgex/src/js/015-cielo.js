  // ================= CIELO =================
  // Mapa equirectangular de todo el cielo: columna = acimut (360°), fila = elevación (del cénit al nadir).
  // Todo se dibuja por dirección 3D, así nada se deforma al mirar hacia arriba.
  const SKW = 1536, SKH = 768, sky = new Uint32Array(SKW * SKH);
  (() => {
    const sk = new Float32Array(SKW * SKH * 3);
    const cosA = new Float32Array(SKW), sinA = new Float32Array(SKW), cosE = new Float32Array(SKH), sinE = new Float32Array(SKH);
    for (let x = 0; x < SKW; x++) { const a = (x + .5) / SKW * TAU; cosA[x] = Math.cos(a); sinA[x] = Math.sin(a); }
    for (let y = 0; y < SKH; y++) { const e = (.5 - (y + .5) / SKH) * Math.PI; cosE[y] = Math.cos(e); sinE[y] = Math.sin(e); }
    const dirOf = (az, el) => [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const toXY = (az, el) => [((az / TAU) % 1 + 1) % 1 * SKW, (.5 - el / Math.PI) * SKH];
    const D2R = Math.PI / 180;
    // nebulosas: manchas de color con radio angular, repartidas por todo el cielo
    const blobs = Array.from({ length: 16 }, () => { const az = rnd(0, TAU), el = Math.asin(rnd(-.35, .98)), r = rnd(.28, .7);
      return { c: dirOf(az, el), r2: r * r, col: [[110, 30, 150], [25, 70, 170], [170, 40, 80], [30, 120, 140]][Math.random() * 4 | 0] }; });
    // banda galáctica: un gran círculo inclinado
    const bn = (() => { const v = [.32, -.45, .83], l = Math.hypot(...v); return v.map(q => q / l); })();
    for (let y = 0; y < SKH; y++) for (let x = 0; x < SKW; x++) {
      const vx = cosE[y] * cosA[x], vy = cosE[y] * sinA[x], vz = sinE[y], i = (y * SKW + x) * 3;
      const up = Math.max(0, vz); // más oscuro y frío hacia el cénit, más cálido cerca del horizonte
      let r = 12 - 8 * up, g = 7 - 4 * up, b = 30 - 14 * up;
      if (vz < 0) { const k = 1 + vz * .55; r *= k; g *= k; b *= k; }
      for (const o of blobs) {
        const dx = vx - o.c[0], dy = vy - o.c[1], dz = vz - o.c[2], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > o.r2 * 6) continue;
        const nz = .72 + .28 * Math.sin(vx * 23 + vz * 11) * Math.cos(vy * 17 - vz * 9);
        const k = Math.exp(-d2 / o.r2) * .3 * nz;
        r += o.col[0] * k; g += o.col[1] * k; b += o.col[2] * k;
      }
      const bd = vx * bn[0] + vy * bn[1] + vz * bn[2], band = Math.exp(-(bd * bd) / .03);
      if (band > .01) { const dust = .55 + .45 * Math.sin(vx * 31 + vy * 19) * Math.sin(vz * 27 - vx * 13);
        r += 42 * band * dust; g += 34 * band * dust; b += 62 * band * dust; }
      sk[i] = r; sk[i + 1] = g; sk[i + 2] = b;
    }
    const plot = (x, y, r, g, b, a) => { x = ((x | 0) % SKW + SKW) % SKW; y |= 0; if (y < 0 || y >= SKH) return; const i = (y * SKW + x) * 3;
      sk[i] = sk[i] * (1 - a) + r * a; sk[i + 1] = sk[i + 1] * (1 - a) + g * a; sk[i + 2] = sk[i + 2] * (1 - a) + b * a; };
    // estrellas repartidas de forma uniforme sobre la esfera; se ensanchan en X cerca del cénit para verse redondas
    for (let s = 0; s < 5200; s++) {
      const az = rnd(0, TAU), el = Math.asin(rnd(-1, 1)), [x, y] = toXY(az, el), v = Math.random() ** 3 * 200 + 55, tt = Math.random();
      const c = tt < .15 ? [v, v * .8, v * .6] : tt < .35 ? [v * .7, v * .85, v] : [v, v, v];
      const sx = Math.min(40, 1 / Math.max(.03, Math.cos(el)));
      for (let k = 0; k < Math.ceil(sx); k++) plot(x + k, y, ...c, 1);
      if (v > 200) { plot(x - 1, y, ...c, .45); plot(x + Math.ceil(sx), y, ...c, .45); plot(x, y - 1, ...c, .45); plot(x, y + 1, ...c, .45); }
    }
    // pinta un disco de radio angular R alrededor de la dirección (az0, el0): f(u, w, v) con u, w en unidades de R
    const disc = (az0, el0, R, reach, f) => {
      const c = dirOf(az0, el0), e1 = [-Math.sin(az0), Math.cos(az0), 0], e2 = [-Math.sin(el0) * Math.cos(az0), -Math.sin(el0) * Math.sin(az0), Math.cos(el0)];
      const sR = Math.sin(R), cosMax = Math.cos(R * reach);
      const y0 = Math.max(0, Math.floor((.5 - (el0 + R * reach) / Math.PI) * SKH)), y1 = Math.min(SKH - 1, Math.ceil((.5 - (el0 - R * reach) / Math.PI) * SKH));
      for (let y = y0; y <= y1; y++) {
        const span = Math.min(SKW / 2, (R * reach / Math.max(.05, cosE[y])) / TAU * SKW + 2), xc = toXY(az0, 0)[0];
        for (let xx = Math.floor(xc - span); xx <= Math.ceil(xc + span); xx++) {
          const x = ((xx % SKW) + SKW) % SKW, vx = cosE[y] * cosA[x], vy = cosE[y] * sinA[x], vz = sinE[y];
          if (vx * c[0] + vy * c[1] + vz * c[2] < cosMax) continue;
          f(x, y, (vx * e1[0] + vy * e1[1] + vz * e1[2]) / sR, (vx * e2[0] + vy * e2[1] + vz * e2[2]) / sR);
        }
      }
    };
    // planeta con anillos (el mismo de antes, ahora en coordenadas de la esfera)
    const PR = 96, ring = front => (x, y, u, w) => {
      const rx = u * PR, ry = -w * PR - rx * .12, e = Math.hypot(rx / 180, ry / 34);
      if (e < .66 || e > 1 || front !== (ry > 0)) return; if (!front && Math.hypot(u, w) < 1) return;
      const band = .55 + .45 * Math.sin(e * 60), sh = front ? 1 : .8; plot(x, y, 220 * band * sh, 190 * band * sh, 150 * band * sh, .75);
    };
    const pAz = 89 * D2R, pEl = 18 * D2R, pR = 13 * D2R;
    disc(pAz, pEl, pR, 1.95, ring(false));
    disc(pAz, pEl, pR, 1.12, (x, y, u, w) => {
      const dx = u * PR, dy = -w * PR, d2 = dx * dx + dy * dy, R = PR;
      if (d2 > R * R) { const k = Math.max(0, 1 - (Math.sqrt(d2) - R) / 10); if (k > 0) plot(x, y, 255, 170, 120, .12 * k); return; }
      const nz = Math.sqrt(R * R - d2) / R, lit = Math.max(.06, (-dx * .55 - dy * .35) / R * .7 + nz * .55);
      const band = .5 + .5 * Math.sin(dy * .16 + Math.sin(dx * .04 + dy * .02) * 2.4), storm = Math.hypot(dx + 30, dy - 25) < 14 ? .35 : 0;
      const c = [245 * band + 170 * (1 - band), 160 * band + 70 * (1 - band) - storm * 60, 90 * band + 50 * (1 - band)], rim = Math.pow(1 - nz, 3) * 120;
      plot(x, y, c[0] * lit + rim * .6, c[1] * lit + rim * .5, c[2] * lit + rim, 1);
    });
    disc(pAz, pEl, pR, 1.95, ring(true));
    // luna
    disc(269 * D2R, 23 * D2R, 3.2 * D2R, 1, (x, y, u, w) => {
      const X = u * 22, Y = -w * 22, d = Math.hypot(X, Y); if (d > 22) return;
      const nz = Math.sqrt(484 - d * d) / 22, lit = Math.max(.08, (-X * .5 - Y * .3) / 22 + nz * .6), cr = Math.sin(X * .9) * Math.cos(Y * .8) > .6 ? .75 : 1;
      plot(x, y, 200 * lit * cr, 200 * lit * cr, 215 * lit * cr, 1);
    });
    // galaxia espiral cerca del cénit: lo que ves al mirar hacia arriba
    disc(200 * D2R, 76 * D2R, 17 * D2R, 1, (x, y, u, w) => {
      const r = Math.hypot(u, w); if (r > 1) return;
      const th = Math.atan2(w, u), arms = .5 + .5 * Math.cos(2 * th - 6.5 * Math.log(r + .04)), core = Math.exp(-r * r / .012);
      const k = Math.exp(-r / .33) * (.25 + .75 * arms) * (1 - r) + core;
      const i = (y * SKW + x) * 3; sk[i] += 170 * k + 60 * core; sk[i + 1] += 150 * k + 55 * core; sk[i + 2] += 230 * k + 40 * core;
    });
    for (let i = 0; i < SKW * SKH; i++) sky[i] = rgb(sk[i * 3], sk[i * 3 + 1], sk[i * 3 + 2]);
  })();
  // fila del cielo para una elevación (radianes) y columna para un acimut
  const skyRow = el => Math.max(0, Math.min(SKH - 1, (.5 - el / Math.PI) * SKH | 0));
  const skyCol = az => ((((az / TAU) * SKW) % SKW) + SKW) % SKW | 0;

