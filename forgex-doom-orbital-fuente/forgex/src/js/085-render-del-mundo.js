  // ================= RENDER DEL MUNDO =================
  // Cada píxel guarda color, profundidad, posición en el mundo, normal y luz ambiente.
  // Después, lightPass() lo ilumina con luces reales: salas, pasillos, proyectiles, fogonazos, linterna.
  const AMB_IN = .3, AMB_OUT = .95, DARK = rgb(10, 8, 18);
  let px, py, camZ, hor, filled, acidOff = 0;
  function put(i, col, d, x, y, z, n, a) { buf[i] = col; depth[i] = d; mask[i] = 1; filled++; PXb[i] = x; PYb[i] = y; PZb[i] = z; NRM[i] = n; AMB[i] = a; }
  function aoFloor(ao, wx, wy) {
    const fx = wx - Math.floor(wx), fy = wy - Math.floor(wy); let m = 1;
    if (ao & 1) m = Math.min(m, fx * 2.5); if (ao & 2) m = Math.min(m, (1 - fx) * 2.5);
    if (ao & 4) m = Math.min(m, fy * 2.5); if (ao & 8) m = Math.min(m, (1 - fy) * 2.5);
    return m < 1 ? .38 + .62 * m : 1;
  }
  function drawCell(x, c, near, far, side, rdx, rdy, own) {
    const nr = Math.max(near, 0.02);
    if (!own) {
      let wx = side === 0 ? py + nr * rdy : px + nr * rdx; wx -= Math.floor(wx);
      const hx = px + nr * rdx, hy = py + nr * rdy, tx = (wx * T) | 0, l0 = lvlOf(nr), nrm = side === 0 ? (rdx > 0 ? 3 : 2) : (rdy > 0 ? 5 : 4);
      for (const b of c) {
        const yTn = hor - (b.zt - camZ) * PROJ / nr, yBn = hor - (b.zb - camZ) * PROJ / nr;
        const ya = Math.max(0, Math.ceil(yTn)), yb = Math.min(RH, Math.ceil(yBn)); if (ya >= yb) continue;
        const Tx = TEX[b.tex], tex = Tx.lv[Math.min(NL - 1, l0 + 1 + side * 2)], hp = yBn - yTn, th = b.zt - b.zb;
        const ship = b.kind === 'ship', baseA = ship ? AMB_IN : AMB_OUT;
        for (let y = ya; y < yb; y++) {
          const i = y * RW + x; if (mask[i]) continue;
          const zz = (y - yTn) / hp * th, wz = b.zt - zz;
          if (b.rim && zz < .045) { put(i, RIM[b.tex][l0], nr, hx, hy, wz, nrm, baseA); gbuf[i] = RIMG[b.tex][l0]; }
          else if (b.rim && th - zz < .03) put(i, DARK, nr, hx, hy, wz, nrm, baseA);
          else {
            let a = baseA;
            if (ship) { const up = th - zz; if (up < .45) a *= .35 + .65 * up / .45; if (zz < .3) a *= .55 + .45 * zz / .3; } // sombra de contacto
            const k = (((-wz * T) | 0) & TM) * T + tx; put(i, tex[k], nr, hx, hy, wz, nrm, a); if (Tx.em[k]) gbuf[i] = Tx.gl[k];
          }
        }
      }
    }
    for (const b of c) {
      const Tx = TEX[b.tex], a0 = b.kind === 'ship' ? AMB_IN : AMB_OUT, ao = b.ao, aoff = b.acid ? acidOff : 0;
      if (camZ > b.zt) {
        const yTn = hor - (b.zt - camZ) * PROJ / nr, yTf = hor - (b.zt - camZ) * PROJ / far;
        const ya = Math.max(0, Math.ceil(yTf)), yb = own ? RH : Math.min(RH, Math.ceil(yTn));
        const hgt = (camZ - b.zt) * PROJ, x0 = b.gx, x1 = b.gx + b.gw, y0 = b.gy, y1 = b.gy + b.gh;
        for (let y = ya; y < yb; y++) {
          const i = y * RW + x; if (mask[i]) continue;
          const d = hgt / (y + .5 - hor), wx = px + rdx * d, wy = py + rdy * d, l = lvlOf(d);
          if (b.rim && (wx - x0 < .05 || x1 - wx < .05 || wy - y0 < .05 || y1 - wy < .05)) { put(i, RIM[b.tex][l], d, wx, wy, b.zt, 0, a0); gbuf[i] = RIMG[b.tex][l]; }
          else {
            const k = ((((wy * T) | 0) + (aoff >> 1)) & TM) * T + ((((wx * T) | 0) + aoff) & TM);
            put(i, Tx.lv[l][k], d, wx, wy, b.zt, 0, ao ? a0 * aoFloor(ao, wx, wy) : a0);
            if (Tx.em[k]) gbuf[i] = Tx.gl[k]; else if (b.pad) gbuf[i] = PADG;
          }
        }
      }
      if (camZ < b.zb) {
        const yBn = hor - (b.zb - camZ) * PROJ / nr, yBf = hor - (b.zb - camZ) * PROJ / far;
        const ya = own ? 0 : Math.max(0, Math.ceil(yBn)), yb = Math.min(RH, Math.ceil(yBf));
        const hgt = (b.zb - camZ) * PROJ, cxp = b.gx + b.gw / 2, cyp = b.gy + b.gh / 2, isPlat = b.kind === 'plat';
        for (let y = ya; y < yb; y++) {
          const i = y * RW + x; if (mask[i]) continue;
          const d = hgt / (hor - y - .5), wx = px + rdx * d, wy = py + rdy * d;
          if (isPlat) {
            const tr = Math.hypot(wx - cxp, wy - cyp);
            if (tr < .32) { const k = 1 - tr / .32; put(i, rgb(255, 150 + 90 * k, 60 + 150 * k), d, wx, wy, b.zb, 1, a0); gbuf[i] = rgb(255 * k, 120 * k, 30 * k); }
            else put(i, Tx.lv[Math.min(NL - 1, lvlOf(d) + 6)][(((wy * T) | 0) & TM) * T + (((wx * T) | 0) & TM)], d, wx, wy, b.zb, 1, a0);
          } else {
            const k = (((wy * T) | 0) & TM) * T + (((wx * T) | 0) & TM);
            put(i, Tx.lv[Math.min(NL - 1, lvlOf(d) + 1)][k], d, wx, wy, b.zb, 1, ao ? a0 * aoFloor(ao, wx, wy) : a0);
            if (Tx.em[k]) gbuf[i] = Tx.gl[k];
          }
        }
      }
    }
  }
  // Cámara del fotograma (la rellena renderWorld): F adelante, R derecha y U arriba de la pantalla;
  // cy = fila del centro de proyección (el horizonte desplazado en modo columnas, el centro en 3D)
  const CAM = { fx: 1, fy: 0, fz: 0, rx: 0, ry: 1, ux: 0, uy: 0, uz: 1, cy: 0 };
  // ---- atlas de sprites ----
  // Cada fotograma de sprite se copia una sola vez a un atlas común (texeles ABGR; 0 = transparente;
  // alfa 0xFE = brillo propio). El atlas se replica en la instancia Rust, en los hilos de render y en la GPU.
  const ATL = { data: new Uint32Array(1 << 21), used: 0 };
  function atlasOf(spr) {
    if (spr._ao !== undefined) return spr._ao;
    const n = spr.n || 64, N = n * n;
    if (ATL.used + N > ATL.data.length) return -1;
    const off = ATL.used, P = spr.px, E = spr.em, D = ATL.data; ATL.used += N;
    for (let i = 0; i < N; i++) { const c = P[i]; D[off + i] = !c ? 0 : E[i] ? (c & 0xffffff) | 0xfe000000 : c | 0xff000000; }
    spr._ao = off; atlasChanged(off, N);
    return off;
  }
  // copia un tramo del atlas a una instancia Rust
  function atlasTo(X, off, N) { new Uint32Array(X.memory.buffer, X.p_atlas() + off * 4, N).set(ATL.data.subarray(off, off + N)); }
  function atlasChanged(off, N) {
    if (wasm && wasm.p_atlas) atlasTo(wasm, off, N);
    if (typeof workersAtlas === 'function') workersAtlas(off, N);
    if (GPUB) GPUB.atlasDirty = true;
  }
  // ---- cola de sprites del fotograma ----
  // Los sprites visibles se proyectan en JS y se encolan como rectángulos de pantalla, de lejos a cerca:
  // [desplazamiento en el atlas, lado, x0, x1, y0, y1, profundidad, luz] × n. Después los rasteriza el motor activo
  // (Rust, los hilos, la GPU o JavaScript) con prueba de profundidad.
  const SPR_MAXQ = 512, SPRQ = new Float32Array(SPR_MAXQ * 8), SPRW = new Float32Array(SPR_MAXQ * 3);
  let sprN = 0;
  // Sprite siempre de cara a la cámara, centrado en su punto medio
  function drawSprite(spr, sx, sy, sz, w, h, amb) {
    const cz = sz + h / 2, vx = sx - px, vy = sy - py, vz = cz - camZ;
    const tY = vx * CAM.fx + vy * CAM.fy + vz * CAM.fz;
    if (tY < 0.12 || sprN >= SPR_MAXQ) return;
    const s = PROJ / tY, scrX = RW / 2 + (vx * CAM.rx + vy * CAM.ry) * s, scrY = CAM.cy - (vx * CAM.ux + vy * CAM.uy + vz * CAM.uz) * s;
    const a = (amb == null ? AMB_OUT : amb) * Math.max(.35, 1 - tY / 45);
    const x0 = scrX - w * s / 2, x1 = x0 + w * s, y0 = scrY - h * s / 2, y1 = y0 + h * s;
    if (x1 <= 0 || x0 >= RW || y1 <= 0 || y0 >= RH) return;
    const off = atlasOf(spr); if (off < 0) return;
    const o = sprN * 8, w3 = sprN * 3; sprN++;
    SPRQ[o] = off; SPRQ[o + 1] = spr.n || 64; SPRQ[o + 2] = x0; SPRQ[o + 3] = x1; SPRQ[o + 4] = y0; SPRQ[o + 5] = y1; SPRQ[o + 6] = tY; SPRQ[o + 7] = a;
    SPRW[w3] = sx; SPRW[w3 + 1] = sy; SPRW[w3 + 2] = cz;
  }
  // rasterizador JavaScript de la cola (motor JS); Rust hace lo mismo en sprite_pass
  function rasterSpritesJS() {
    const D = ATL.data, wpos = PXb !== null;
    for (let k = 0; k < sprN; k++) {
      const o = k * 8, off = SPRQ[o], n = SPRQ[o + 1], x0 = SPRQ[o + 2], x1 = SPRQ[o + 3], y0 = SPRQ[o + 4], y1 = SPRQ[o + 5], tY = SPRQ[o + 6], a = SPRQ[o + 7];
      const xa = Math.max(0, x0 | 0), xb = Math.min(RW, x1 | 0), ya = Math.max(0, y0 | 0), yb = Math.min(RH, y1 | 0);
      const sx = SPRW[k * 3], sy = SPRW[k * 3 + 1], cz = SPRW[k * 3 + 2];
      for (let x = xa; x < xb; x++) {
        const tx = Math.min(n - 1, ((x - x0) / (x1 - x0) * n) | 0);
        for (let y = ya; y < yb; y++) {
          const i = x * SX + y * SY; if (depth[i] <= tY) continue;
          const t = D[off + Math.min(n - 1, ((y - y0) / (y1 - y0) * n) | 0) * n + tx]; if (!t) continue;
          const c = t | 0xff000000;
          buf[i] = c; depth[i] = tY; if (wpos) { PXb[i] = sx; PYb[i] = sy; PZb[i] = cz; } NRM[i] = 6; AMB[i] = a; gbuf[i] = (t >>> 24) === 0xfe ? c : BLACK;
        }
      }
    }
  }
  function drawPoint(x3, y3, z3, col, size) {
    const vx = x3 - px, vy = y3 - py, vz = z3 - camZ, tY = vx * CAM.fx + vy * CAM.fy + vz * CAM.fz;
    if (tY < 0.15) return;
    const k = PROJ / tY, sx = RW / 2 + (vx * CAM.rx + vy * CAM.ry) * k | 0, sy = CAM.cy - (vx * CAM.ux + vy * CAM.uy + vz * CAM.uz) * k | 0, r = Math.max(1, Math.min(5, size * k | 0)), r2 = r * r + r;
    // chispa redonda (y con tamaño limitado: pegadas a la cámara ya no son cuadros enormes)
    for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (x < 0 || y < 0 || x >= RW || y >= RH || (x - sx) * (x - sx) + (y - sy) * (y - sy) > r2) continue; const i = x * SX + y * SY; if (depth[i] <= tY) continue;
      buf[i] = col; gbuf[i] = col;
    }
  }
  // luz ambiente en un punto: dentro de edificios es mucho más oscuro
  function ambAt(x, y, z) { const c = cellAt(x, y); if (c) for (const b of c) if (b.kind === 'ship' && b.zb > z + .9 && b.zb < z + 4.5) return AMB_IN + .1; return AMB_OUT; }
  function groundBelow(x, y, z) { const c = cellAt(x, y); let g = null; if (c) for (const b of c) if (b.zt <= z + .05 && (g === null || b.zt > g)) g = b.zt; return g; }
  function frameLights(dirx, diry) {
    const out = [];
    const add = (x, y, z, r, g, b, rad, int) => { const d = Math.hypot(x - px, y - py); if (d < 26 && int > .02) out.push({ x, y, z, r, g, b, rad, int, d }); };
    for (const L of lights) {
      if (Math.abs(L.x - px) > 24 || Math.abs(L.y - py) > 24 || Math.abs(L.z - camZ) > 6) continue;
      const fl = L.flick ? ((Math.sin(time * 9 + L.ph) > .82 || Math.random() < .05) ? .12 : 1) : 1;
      add(L.x, L.y, L.z, L.r, L.g, L.b, L.rad, L.int * fl);
    }
    for (const b of st.proj) if (b.kind === 'fire') add(b.x, b.y, b.z, 1, .55, .2, 3.6, 1.4); else add(b.x, b.y, b.z, .8, .45, 1, 3.2, 1.3);
    for (const e of st.enemies) {
      if (e.dead || Math.abs(e.x - px) > 22 || Math.abs(e.y - py) > 22) continue;
      if (e.type === 'imp' && e.wind > 0) add(e.x, e.y, e.z + 1.05, 1, .6, .2, 3, 1.3);           // aviso: bola de fuego en la mano
      else if (e.type === 'skull') add(e.x, e.y, e.z + .2, 1, .5, .15, 2.4, e.state === 'tele' || e.state === 'dash' ? 1.4 : .7);
      else if (e.type === 'caco' && e.wind > 0) add(e.x, e.y, e.z, .75, .4, 1, 3.4, 1.4);
    }
    for (const it of st.items) if (it.kind === 'beacon' && Math.abs(it.x - px) < 22 && Math.abs(it.y - py) < 22) add(it.x, it.y, it.z + 1.3, 1, .15, .1, 3.5, 1.1 + .3 * Math.sin(time * 4));
    for (const f of st.flashes) add(f.x, f.y, f.z, f.r, f.g, f.b, f.rad, f.int * f.life / f.max);
    if (st.flash > 0) { const w = st.weapon && st.weapon.w, col = w === 'escopeta' ? [1, .8, .5] : w === 'riel' ? [.6, .8, 1] : [.5, 1, 1];
      add(px + dirx * .8, py + diry * .8, camZ, col[0], col[1], col[2], 7.5, 2 * st.flash / .09); }
    if (st.shieldT > 0) add(px, py, camZ - .2, .4, 1, .95, 3.2, 1.1);
    out.sort((a, b) => a.d - b.d);
    if (out.length > EFF.lights) out.length = EFF.lights;
    return out;
  }
  function shadowList() {
    const out = [];
    for (const e of st.enemies) {
      if (e.dead || Math.abs(e.x - px) > 16 || Math.abs(e.y - py) > 16) continue;
      if (e.type === 'imp') out.push([e.x, e.y, e.z, .5, .6]);
      else { const gz = groundBelow(e.x, e.y, e.z - .3); if (gz !== null && e.z - gz < 5) out.push([e.x, e.y, gz, e.type === 'caco' ? .8 : .35, .55 * (1 - (e.z - gz) / 5.5)]); }
    }
    if (st.look < -.15) { const gz = groundBelow(px, py, st.pz + .05); if (gz !== null && st.pz - gz < 6) out.push([px, py, gz, .32, .55 * (1 - (st.pz - gz) / 7)]); }
    return out.slice(0, 64);
  }
  function lightPass(dirx, diry, plx, ply, invDet, shadows, lts) {
    const N = RW * RH, lamp = st.lamp;
    for (let i = 0; i < N; i++) {
      const a = AMB[i];
      if (a < 0 || gbuf[i] !== BLACKU) { LR[i] = -1; continue; }
      let r = a * .9, g = a * .95, b = a * 1.1;
      if (lamp) { const cf = CONE[i]; if (cf > 0) { const d = depth[i], f = cf * 1.1 / (1 + d * d * .025); r += f; g += f * .93; b += f * .8; } }
      LR[i] = r; LG[i] = g; LB[i] = b;
    }
    // sombras suaves bajo enemigos y bajo el jugador
    const shade = (sx, sy, sz, rad, k) => {
      const rx = sx - px, ry = sy - py, tY = invDet * (-ply * rx + plx * ry), tX = invDet * (diry * rx - dirx * ry);
      let xa = 0, xb = RW, ya = 0, yb = RH;
      if (tY > rad + .3) { const cx = RW / 2 * (1 + tX / tY), cy = hor - (sz - camZ) * PROJ / tY, s = (rad + .2) * PROJ / (tY - rad);
        xa = Math.max(0, cx - s | 0); xb = Math.min(RW, cx + s + 1 | 0); ya = Math.max(0, cy - s | 0); yb = Math.min(RH, cy + s + 1 | 0); }
      else if (tY < -rad) return;
      const r2 = rad * rad;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const i = y * RW + x; if (LR[i] < 0 || NRM[i] !== 0 || Math.abs(PZb[i] - sz) > .08) continue;
        const dx = PXb[i] - sx, dy = PYb[i] - sy, d2 = dx * dx + dy * dy; if (d2 >= r2) continue;
        const m = 1 - k * (1 - d2 / r2); LR[i] *= m; LG[i] *= m; LB[i] *= m;
      }
    };
    for (const [sx, sy, sz, rad, k] of shadows) shade(sx, sy, sz, rad, k);
    // luces puntuales con atenuación suave y sombreado según la orientación de la superficie
    for (const Lt of lts) {
      const rx = Lt.x - px, ry = Lt.y - py, tY = invDet * (-ply * rx + plx * ry), tX = invDet * (diry * rx - dirx * ry), rad = Lt.rad;
      let xa = 0, xb = RW, ya = 0, yb = RH;
      if (tY - rad > .3) { const cx = RW / 2 * (1 + tX / tY), cy = hor - (Lt.z - camZ) * PROJ / tY, s = rad * PROJ / (tY - rad);
        xa = Math.max(0, cx - s | 0); xb = Math.min(RW, cx + s + 1 | 0); ya = Math.max(0, cy - s | 0); yb = Math.min(RH, cy + s + 1 | 0); }
      else if (tY < -rad) continue;
      const r2 = rad * rad, LRr = Lt.r * Lt.int, LGg = Lt.g * Lt.int, LBb = Lt.b * Lt.int;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const i = y * RW + x; if (LR[i] < 0) continue;
        const dx = Lt.x - PXb[i], dy = Lt.y - PYb[i], dz = Lt.z - PZb[i], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;
        let f = 1 - d2 / r2; f *= f;
        const n = NRM[i];
        if (n !== 6) { const dot = (n === 0 ? dz : n === 1 ? -dz : n === 2 ? dx : n === 3 ? -dx : n === 4 ? dy : -dy) / Math.sqrt(d2 + 1e-4); if (dot <= 0) continue; f *= .3 + .7 * dot; }
        LR[i] += LRr * f; LG[i] += LGg * f; LB[i] += LBb * f;
      }
    }
    for (let i = 0; i < N; i++) {
      const lr = LR[i]; if (lr < 0) continue;
      const c = buf[i], r = Math.min(255, (c & 255) * Math.min(lr, 1.8)), g = Math.min(255, ((c >> 8) & 255) * Math.min(LG[i], 1.8)), b = Math.min(255, ((c >> 16) & 255) * Math.min(LB[i], 1.8));
      buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  }
  let mode3d = false;
  const SPR_LIST = [];
  // ¿puede verse algo de una esfera de radio r centrada en (x, y, z)? (se comprueba con la cámara del fotograma)
  function inView(x, y, z, r) {
    const vx = x - px, vy = y - py, vz = z - camZ, tY = vx * CAM.fx + vy * CAM.fy + vz * CAM.fz;
    if (tY < -r) return false;
    if (tY <= r + .12) return true; // pegado a la cámara: se dibuja siempre
    const s = PROJ / tY, sx = (vx * CAM.rx + vy * CAM.ry) * s, sy = CAM.cy - (vx * CAM.ux + vy * CAM.uy + vz * CAM.uz) * s, m = r * s;
    return sx > -RW / 2 - m && sx < RW / 2 + m && sy > -m && sy < RH + m;
  }
  // Datos del fotograma que no dependen del motor: cámara, cola de sprites, luces y sombras de contacto.
  const FR = { pa: 0, dirx: 1, diry: 0, plx: 0, ply: 0, invDet: 1, lts: [], shadows: [], nl: 0, ns: 0, LV: new Float32Array(16 * 8), SV: new Float32Array(64 * 5) };
  function prepareFrame() {
    px = st.px; py = st.py; camZ = st.pz + EYE + Math.sin(st.bob) * 0.03 - st.land * .15;
    acidOff = (time * 14) | 0;
    const pa = st.pa, dirx = Math.cos(pa), diry = Math.sin(pa), plx = -diry * PL, ply = dirx * PL;
    FR.pa = pa; FR.dirx = dirx; FR.diry = diry; FR.plx = plx; FR.ply = ply; FR.invDet = 1 / (plx * diry - dirx * ply);
    // Cerca del horizonte se usa el raycaster por columnas (exacto y rápido); con la vista muy inclinada,
    // los motores Rust y WebGPU cambian a la cámara 3D real por píxel, que permite mirar al cénit y al suelo bajo los pies.
    mode3d = BACKEND !== 'js' && (CFG.graphics.cam3d || Math.abs(st.look) > (mode3d ? LOOK_3D_OUT : LOOK_3D_IN));
    const look = mode3d ? st.look : clamp(st.look, -LOOK_SHEAR, LOOK_SHEAR);
    CAM.rx = -diry; CAM.ry = dirx;
    if (mode3d) {
      const cp = Math.cos(look), sp = Math.sin(look);
      CAM.fx = cp * dirx; CAM.fy = cp * diry; CAM.fz = sp; CAM.ux = -sp * dirx; CAM.uy = -sp * diry; CAM.uz = cp; CAM.cy = hor = RH / 2;
    } else {
      hor = RH / 2 + Math.tan(look) * PROJ;
      CAM.fx = dirx; CAM.fy = diry; CAM.fz = 0; CAM.ux = 0; CAM.uy = 0; CAM.uz = 1; CAM.cy = hor;
    }
    queueSprites();
    const shadows = FR.shadows = shadowList(), lts = FR.lts = frameLights(dirx, diry);
    FR.nl = lts.length; FR.ns = shadows.length; PERF.c.lights = lts.length; PERF.c.shadows = shadows.length;
    for (let k = 0; k < lts.length; k++) { const L = lts[k], o = k * 8, V = FR.LV; V[o] = L.x; V[o + 1] = L.y; V[o + 2] = L.z; V[o + 3] = L.r; V[o + 4] = L.g; V[o + 5] = L.b; V[o + 6] = L.rad; V[o + 7] = L.int; }
    for (let k = 0; k < shadows.length; k++) FR.SV.set(shadows[k], k * 5);
  }
  function renderWorld() {
    if (gfx && img && img.data.buffer.byteLength === 0) applyResolution(true);
    const t0 = performance.now();
    prepareFrame();
    const tPrep = performance.now() - t0;
    if (BACKEND === 'webgpu') gpuRender(tPrep);
    else if (WORKERS.active) workersRender(tPrep);
    else if (gfx) rustRender(tPrep);
    else jsRender(tPrep);
  }
  // Motor Rust en el hilo principal
  function rustRender(tPrep) {
    const tA = performance.now();
    if (mode3d) gfx.render3d(px, py, camZ, CAM.fx, CAM.fy, CAM.fz, CAM.rx, CAM.ry, CAM.ux, CAM.uy, CAM.uz, RW, RH, acidOff, MAXD, PL, 0, RW);
    else gfx.render(px, py, camZ, FR.dirx, FR.diry, FR.plx, FR.ply, FR.pa, hor, RW, RH, acidOff, MAXD, PL, 0, RW);
    const tB = performance.now();
    if (sprN) { SPRV.set(SPRQ.subarray(0, sprN * 8)); gfx.sprite_pass(sprN, 0, RW); }
    const n = Math.min(PARTS.n, PTV.max);
    if (n) { PTV.x.set(PARTS.x.subarray(0, n)); PTV.y.set(PARTS.y.subarray(0, n)); PTV.z.set(PARTS.z.subarray(0, n)); PTV.c.set(PARTS.c.subarray(0, n));
      gfx.particle_pass(n, CAM.fx, CAM.fy, CAM.fz, CAM.rx, CAM.ry, CAM.ux, CAM.uy, CAM.uz, CAM.cy, 0, RW); }
    const tC = performance.now();
    LIGHTSV.set(FR.LV.subarray(0, FR.nl * 8)); SHADV.set(FR.SV.subarray(0, FR.ns * 5));
    perf.rays = gfx.light_pass(RW, RH, FR.nl, FR.ns, st.lamp ? 1 : 0, EFF.rt, 0, RW, CFG.rt.maxDist);
    const tD = performance.now();
    perfAdd('world', tB - tA); perfAdd('sprites', tC - tB + tPrep); perfAdd('light', tD - tC);
  }
  // Motor JavaScript (respaldo universal)
  function jsRender(tPrep) {
    const { dirx, diry, plx, ply } = FR;
    const tA = performance.now();
    mask.fill(0); gbuf.fill(BLACK);
    for (let x = 0; x < RW; x++) {
      const cx = 2 * (x + .5) / RW - 1, rdx = dirx + plx * cx, rdy = diry + ply * cx;
      let mapx = Math.floor(px), mapy = Math.floor(py);
      const ddx = rdx ? Math.abs(1 / rdx) : 1e30, ddy = rdy ? Math.abs(1 / rdy) : 1e30;
      let stx, sty, sdx, sdy, side = 0, dCur = 0;
      if (rdx < 0) { stx = -1; sdx = (px - mapx) * ddx; } else { stx = 1; sdx = (mapx + 1 - px) * ddx; }
      if (rdy < 0) { sty = -1; sdy = (py - mapy) * ddy; } else { sty = 1; sdy = (mapy + 1 - py) * ddy; }
      filled = 0;
      for (let s = 0; s < 90; s++) {
        const dNext = Math.min(sdx, sdy), c = cellAt(mapx, mapy);
        if (c && c.length) { drawCell(x, c, dCur, dNext, side, rdx, rdy, s === 0); if (filled >= RH) break; }
        if (dNext > MAXD) break;
        dCur = dNext;
        if (sdx < sdy) { sdx += ddx; mapx += stx; side = 0; } else { sdy += ddy; mapy += sty; side = 1; }
      }
      if (filled < RH) {
        const sx = skyCol(Math.atan2(rdy, rdx)), rxy = Math.hypot(rdx, rdy);
        for (let y = 0; y < RH; y++) {
          const i = y * RW + x; if (mask[i]) continue;
          buf[i] = sky[skyRow(Math.atan2((hor - y - .5) / PROJ, rxy)) * SKW + sx]; depth[i] = 1e9; AMB[i] = -1;
        }
      }
    }
    const tB = performance.now();
    rasterSpritesJS();
    { const P = PARTS; for (let i = 0; i < P.n; i++) drawPoint(P.x[i], P.y[i], P.z[i], P.c[i], .025); }
    const tC = performance.now();
    lightPass(dirx, diry, plx, ply, FR.invDet, FR.shadows, FR.lts); perf.rays = 0;
    const tD = performance.now();
    perfAdd('world', tB - tA); perfAdd('sprites', tC - tB + tPrep); perfAdd('light', tD - tC);
  }
  // sprites: enemigos, objetos, proyectiles (de lejos a cerca) → cola del fotograma
  function queueSprites() {
    sprN = 0;
    const list = SPR_LIST; list.length = 0;
    const cull = CFG.perf.culling; let culled = 0;
    // descarte por frustum: lo que queda detrás de la cámara o fuera de los bordes de la pantalla no se ordena ni se dibuja
    const add = (x, y, z, o) => {
      const d = Math.hypot(x - px, y - py); if (d > MAXD) return;
      if (cull && !inView(x, y, z + .6, 1.3)) { culled++; return; }
      o.d = d; list.push(o);
    };
    for (const e of st.enemies) if (Math.abs(e.x - px) < MAXD && Math.abs(e.y - py) < MAXD) add(e.x, e.y, e.z, { e });
    for (const it of st.items) if (Math.abs(it.x - px) < MAXD && Math.abs(it.y - py) < MAXD) add(it.x, it.y, it.z, { it });
    for (const b of st.proj) add(b.x, b.y, b.z - .6, { b });
    list.sort((a, b) => b.d - a.d);
    PERF.c.spritesVis = list.length; PERF.c.spritesCulled = culled;
    for (const o of list) {
      if (o.e) {
        const e = o.e, a = ambAt(e.x, e.y, e.z);
        if (e.type === 'imp') {
          const F = impFrames;
          const spr = e.dead ? F.death[Math.min(3, (e.deadT || 0) / .11 | 0)] : e.hurt > 0 ? F.hurt : e.wind > 0 ? F.wind[e.wind > .35 ? 0 : 1]
            : F.walk[e.moving ? ((time * 8 + e.ph) | 0) & 3 : 0];
          drawSprite(spr, e.x, e.y, e.z, 1.05, 1.15, a);
        } else if (e.type === 'skull') {
          const F = skullFrames, sh = e.state === 'tele' ? rnd(-.04, .04) : 0;
          const spr = e.dead ? F.death[(e.deadT || 0) < .15 ? 0 : 1] : e.hurt > 0 ? F.hurt : e.state === 'dash' ? F.dash
            : e.state === 'tele' ? F.tele[(time * 12 | 0) & 1] : F.n[((time * 10 + e.ph * 3) | 0) & 3];
          drawSprite(spr, e.x + sh, e.y + sh, e.z - .32, .66, .66, a);
        } else if (e.type === 'chaser') {
          const F = chaserFrames[e.variant], s = CHASER[e.variant].size;
          const spr = e.dead ? F.death[(e.deadT || 0) < .2 ? 0 : 1] : e.hurt > 0 ? F.hurt : e.cd > .8 ? F.lunge : F.n[((time * 9 + e.ph * 3) | 0) & 3];
          drawSprite(spr, e.x, e.y, e.z - s * .5 + (e.dead ? 0 : Math.sin(time * 3 + e.ph) * .04), s, s, a);
        } else {
          const F = cacoFrames, blink = ((time + e.ph * 3) % 4.2) < .14;
          const spr = e.dead ? F.death[(e.deadT || 0) < .2 ? 0 : 1] : e.hurt > 0 ? F.hurt : e.wind > 0 ? F.tele[e.wind > .45 ? 0 : 1]
            : blink ? F.blink : F.n[((time * 2 + e.ph) | 0) & 1];
          drawSprite(spr, e.x, e.y, e.z - .78 + (e.dead ? 0 : Math.sin(time * 1.5 + e.ph) * .05), 1.6, 1.6, a);
        }
      } else if (o.it) {
        const it = o.it, ic = itemIcon(it), bobZ = (it.kind === 'heal' || it.kind === 'upgrade' || it.kind === 'weapon') ? .12 + Math.sin(time * 2.5 + it.x) * .05 : 0;
        const [w, h] = it.kind === 'crate' ? [.8, .8] : it.kind === 'weapon' ? [.9, .9] : it.kind === 'beacon' ? [.6, 1.5] : [.55, .55];
        drawSprite(ic, it.x, it.y, it.z + bobZ - (it.kind === 'weapon' ? .2 : 0), w, h, ambAt(it.x, it.y, it.z));
      } else drawSprite(o.b.kind === 'fire' ? SPR.fire : SPR.plasma, o.b.x, o.b.y, o.b.z - .2, .4, .4);
    }
    PERF.c.instances = sprN;
  }

