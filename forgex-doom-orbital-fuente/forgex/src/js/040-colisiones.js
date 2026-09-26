  // ================= COLISIONES =================
  function blocked(x, y, z) { const c = cellAt(x, y); if (!c) return false; for (const b of c) if (b.zt > z + .35 && b.zb < z + .95) return true; return false; }
  function floorAt(x, y, z) { const c = cellAt(x, y); if (!c) return false; let f = false;
    for (const b of c) { if (Math.abs(b.zt - z) < .02) f = true; else if (b.zt > z + .35 && b.zb < z + .95) return false; } return f; }
  function solidAt(x, y, z) { const c = cellAt(x, y); if (c) for (const b of c) if (z > b.zb && z < b.zt) return true; return false; }
  // ¿Se puede estar de pie en la celda (i, j) sobre un suelo a altura z? Sin ácido, sin impulsor y con espacio encima.
  function standable(i, j, z) {
    if (i < 0 || j < 0 || i >= MW || j >= MH) return false;
    let floor = false;
    for (const b of cells[j * MW + i] || NONE) {
      if (Math.abs(b.zt - z) < .02) { if (b.acid || b.pad) return false; floor = true; }
      else if (b.zt > z + .02 && b.zb < z + 1) return false;
    }
    return floor;
  }
  // Punto de reaparición sobre la superficie en la que está (x, y, z): la zona más alejada de cualquier borde y, entre
  // las que empatan, su centro. Se explora hasta SAFE_R celdas alrededor; en superficies más grandes, el límite de la
  // búsqueda cuenta como borde y el punto queda a unas SAFE_R/2 celdas hacia dentro. Devuelve [x, y, z].
  const SAFE_R = 16, SAFE_N = 2 * SAFE_R + 1;
  const SAFE_IN = new Uint8Array(SAFE_N * SAFE_N), SAFE_D = new Int16Array(SAFE_N * SAFE_N), SAFE_Q = new Int32Array(2 * SAFE_N * SAFE_N); // superficie + cola de distancias
  function safeSpot(x, y, z) {
    let x0 = Math.floor(x), y0 = Math.floor(y);
    if (!standable(x0, y0, z)) { // el borde exacto puede haber cambiado (ácido, poda): celda válida más cercana
      let best = null;
      for (let r = 1; r <= 2 && !best; r++) for (let j = y0 - r; j <= y0 + r; j++) for (let i = x0 - r; i <= x0 + r; i++)
        if (!best && standable(i, j, z)) best = [i, j];
      if (!best) return [x, y, z];
      [x0, y0] = best;
    }
    const id = (i, j) => (j - y0 + SAFE_R) * SAFE_N + (i - x0 + SAFE_R);
    const inWin = (i, j) => Math.abs(i - x0) <= SAFE_R && Math.abs(j - y0) <= SAFE_R;
    SAFE_IN.fill(0); SAFE_D.fill(-1);
    // 1) la superficie: celdas conectadas (4 vecinos) en las que se puede estar de pie a la misma altura
    let qh = 0, qt = 0; SAFE_Q[qt++] = id(x0, y0); SAFE_IN[id(x0, y0)] = 1;
    while (qh < qt) {
      const k = SAFE_Q[qh++], i = k % SAFE_N + x0 - SAFE_R, j = (k / SAFE_N | 0) + y0 - SAFE_R;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (!inWin(ni, nj)) continue;
        const nk = id(ni, nj); if (SAFE_IN[nk] || !standable(ni, nj, z)) continue;
        SAFE_IN[nk] = 1; SAFE_Q[qt++] = nk;
      }
    }
    const n = qt;
    // 2) distancia al borde (8 vecinos): 1 en las celdas que tocan algo que no es superficie, y creciendo hacia dentro
    const inside = (i, j) => inWin(i, j) && SAFE_IN[id(i, j)] === 1;
    qh = 0; qt = 0;
    for (let q = 0; q < n; q++) {
      const k = SAFE_Q[q], i = k % SAFE_N + x0 - SAFE_R, j = (k / SAFE_N | 0) + y0 - SAFE_R;
      let edge = false;
      for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && !inside(i + di, j + dj)) { edge = true; break; }
      if (edge) { SAFE_D[k] = 1; SAFE_Q[n + qt++] = k; }
    }
    let maxD = 1;
    while (qh < qt) {
      const k = SAFE_Q[n + qh++], i = k % SAFE_N + x0 - SAFE_R, j = (k / SAFE_N | 0) + y0 - SAFE_R, d = SAFE_D[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj || !inside(i + di, j + dj)) continue;
        const nk = id(i + di, j + dj); if (SAFE_D[nk] !== -1) continue;
        SAFE_D[nk] = d + 1; if (d + 1 > maxD) maxD = d + 1; SAFE_Q[n + qt++] = nk;
      }
    }
    // 3) centro de las celdas más interiores; si cae fuera de ellas (formas en L), la más interior más cercana a él
    let sx = 0, sy = 0, m = 0;
    for (let q = 0; q < n; q++) { const k = SAFE_Q[q]; if (SAFE_D[k] === maxD) { sx += k % SAFE_N + .5; sy += (k / SAFE_N | 0) + .5; m++; } }
    sx /= m; sy /= m;
    const ck = (sy | 0) * SAFE_N + (sx | 0);
    if (SAFE_D[ck] !== maxD) {
      let bd = 1e9;
      for (let q = 0; q < n; q++) { const k = SAFE_Q[q]; if (SAFE_D[k] !== maxD) continue;
        const d = Math.hypot(k % SAFE_N + .5 - sx, (k / SAFE_N | 0) + .5 - sy); if (d < bd) { bd = d; sx = k % SAFE_N + .5; sy = (k / SAFE_N | 0) + .5; } }
    }
    return [sx + x0 - SAFE_R, sy + y0 - SAFE_R, z];
  }
  function clearPath(x0, y0, z0, x1, y1, z1) {
    const n = Math.max(8, Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 6 | 0);
    for (let k = 1; k < n; k++) { const t = k / n; if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }

