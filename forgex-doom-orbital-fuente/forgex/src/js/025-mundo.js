  // ================= MUNDO: celdas con pilas de bloques =================
  let cells, ships, gen, cellIdx, lights = [];
  const NONE = [];
  const cellAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? null : cells[(y | 0) * MW + (x | 0)] || null;

  // Chunks y catálogo para streaming diferido (Plan D)
  const CHUNK_W = 32, CHUNK_H = 32, CHUNK_Z = 8;
  const CHUNKS_X = 17, CHUNKS_Y = 17, CHUNKS_Z = 8;
  const N_CHUNKS = 2312;
  const chunkCatalog = new Array(N_CHUNKS);
  for (let i = 0; i < N_CHUNKS; i++) chunkCatalog[i] = [];
  let streamingActive = false;
  let streamingRadius = 8;
  const activeChunks = new Set();

  function chunkOf(x, y, z) {
    const cx = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor(x / CHUNK_W)));
    const cy = Math.min(CHUNKS_Y - 1, Math.max(0, Math.floor(y / CHUNK_H)));
    const cz = Math.min(CHUNKS_Z - 1, Math.max(0, Math.floor(z / CHUNK_Z)));
    return cz * (CHUNKS_X * CHUNKS_Y) + cy * CHUNKS_X + cx;
  }

  // Consumir w_dirty extendido a 6 valores (D3.3)
  function checkWorldDirty() {
    if (!wasm || !wasm.w_dirty) return null;
    const dirty = new Uint32Array(wasm.memory.buffer, wasm.w_dirty(), 6);
    if (dirty[0] < dirty[1]) { /* celdas/bloques cambiados */ }
    if (dirty[4] < dirty[5]) { /* chunks cambiados */ }
    return dirty;
  }

  function applyStreaming(radius = 8, px = (typeof st !== 'undefined' ? st.px : C), py = (typeof st !== 'undefined' ? st.py : C), pz = (typeof st !== 'undefined' ? st.pz : 0)) {
    if (!wasm) return;
    streamingActive = true;
    streamingRadius = radius;
    activeChunks.clear();

    const pcx = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor(px / CHUNK_W)));
    const pcy = Math.min(CHUNKS_Y - 1, Math.max(0, Math.floor(py / CHUNK_H)));
    const pcz = Math.min(CHUNKS_Z - 1, Math.max(0, Math.floor(pz / CHUNK_Z)));

    wasm.w_reset();

    for (let chId = 0; chId < N_CHUNKS; chId++) {
      const cz = Math.floor(chId / (CHUNKS_X * CHUNKS_Y));
      const rem = chId % (CHUNKS_X * CHUNKS_Y);
      const cy = Math.floor(rem / CHUNKS_X);
      const cx = rem % CHUNKS_X;

      const blocks = chunkCatalog[chId];
      const hasBlocks = blocks && blocks.length > 0;
      const dist = Math.hypot(cx - pcx, cy - pcy, (cz - pcz) * 0.25);
      const inside = dist <= radius;

      if (hasBlocks) {
        if (inside) {
          activeChunks.add(chId);
          for (let i = 0; i < blocks.length; i++) {
            const a = blocks[i];
            wasm.w_add(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11]);
          }
          if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 1); // Cpu
        } else {
          if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 3); // Evicted
        }
      } else {
        if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 0); // Empty
      }
    }
  }

  function updateStreamingPlayer(px, py, pz) {
    if (!streamingActive || !wasm) return;
    const pcx = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor(px / CHUNK_W)));
    const pcy = Math.min(CHUNKS_Y - 1, Math.max(0, Math.floor(py / CHUNK_H)));
    const pcz = Math.min(CHUNKS_Z - 1, Math.max(0, Math.floor(pz / CHUNK_Z)));

    let changed = false;
    for (let chId = 0; chId < N_CHUNKS; chId++) {
      const cz = Math.floor(chId / (CHUNKS_X * CHUNKS_Y));
      const rem = chId % (CHUNKS_X * CHUNKS_Y);
      const cy = Math.floor(rem / CHUNKS_X);
      const cx = rem % CHUNKS_X;
      const blocks = chunkCatalog[chId];
      if (!blocks || !blocks.length) continue;

      const dist = Math.hypot(cx - pcx, cy - pcy, (cz - pcz) * 0.25);
      const inside = dist <= streamingRadius;
      const isAct = activeChunks.has(chId);

      if (inside && !isAct) {
        activeChunks.add(chId);
        changed = true;
      } else if (!inside && isAct) {
        activeChunks.delete(chId);
        changed = true;
      }
    }
    if (changed) {
      wasm.w_reset();
      for (const chId of activeChunks) {
        const blocks = chunkCatalog[chId];
        if (!blocks) continue;
        for (let i = 0; i < blocks.length; i++) {
          const a = blocks[i];
          wasm.w_add(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11]);
        }
        if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 1);
      }
      for (let chId = 0; chId < N_CHUNKS; chId++) {
        if (!activeChunks.has(chId)) {
          const has = chunkCatalog[chId] && chunkCatalog[chId].length > 0;
          if (wasm.set_chunk_state) wasm.set_chunk_state(chId, has ? 3 : 0);
        }
      }
    }
  }

  // Cambios del mundo: se aplican a la instancia Rust del hilo principal y, si hay hilos de render,
  // se anotan en un diario (WJ) que viaja con el siguiente fotograma para que cada réplica haga lo mismo.
  // Códigos: 1 = añadir bloque (12 valores), 2 = ácido (3), 3 = podar (1), 4 = reiniciar (0).
  const WJ = { on: false, ops: [] };
  function worldOp(op, a) {
    if (wasm) {
      if (op === 1) wasm.w_add(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11]);
      else if (op === 2) wasm.w_set_acid(a[0], a[1], a[2]);
      else if (op === 3) wasm.w_prune(a[0]);
      else {
        wasm.w_reset();
        for (let i = 0; i < N_CHUNKS; i++) chunkCatalog[i] = [];
        activeChunks.clear();
      }
    }
    if (WJ.on) { WJ.ops.push(op); for (let i = 0; i < a.length; i++) WJ.ops.push(a[i]); }
  }
  const blockFlags = b => (b.rim ? 1 : 0) | (b.kind === 'ship' ? 2 : 0) | (b.pad ? 4 : 0) | (b.acid ? 8 : 0) | (b.route ? 16 : 0);
  function addBlock(x, y, zb, zt, tex, o = {}) {
    const k = y * MW + x; let c = cells[k]; if (!c) { c = cells[k] = []; cellIdx.add(k); }
    if (o.replace) for (let i = c.length - 1; i >= 0; i--) if (c[i].zb < zt && c[i].zt > zb) c.splice(i, 1);
    const b = { zb, zt, tex, kind: o.kind || 'ship', pad: o.pad || 0, rim: !!o.rim, route: !!o.route, ao: o.ao || 0, acid: tex === 7, gx: o.gx ?? x, gy: o.gy ?? y, gw: o.gw ?? 1, gh: o.gh ?? 1 };
    c.push(b);
    const chId = chunkOf(x, y, zb);
    const opArgs = [x, y, zb, zt, tex, blockFlags(b), b.gx, b.gy, b.gw, b.gh, b.ao, o.replace ? 1 : 0];
    if (!chunkCatalog[chId]) chunkCatalog[chId] = [];
    chunkCatalog[chId].push(opArgs);
    if (!streamingActive || activeChunks.has(chId)) {
      worldOp(1, opArgs);
      if (wasm && wasm.set_chunk_state) wasm.set_chunk_state(chId, 1);
    }
  }
  function plat(x, y, w, h, zt, th, tex, pad = 0, route = false) {
    if (pad) lights.push({ x: x + w / 2, y: y + h / 2, z: zt + .7, r: .3, g: 1, b: .95, rad: 3.4, int: 1, flick: false, ph: 0 });
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      addBlock(i, j, zt - th, zt, tex, { kind: 'plat', rim: true, gx: x, gy: y, gw: w, gh: h, pad, route, replace: true });
  }
  const key = (i, j) => i + ',' + j;
  function buildShip(x, y, w, h, zf, o) {
    const win = new Set(o.win), door = new Set(o.door), acid = new Set(o.acid), solid = new Set(o.solid);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = key(i, j), edge = i === x || j === y || i === x + w - 1 || j === y + h - 1;
      addBlock(i, j, zf - .5, zf, acid.has(k) ? 7 : 5);
      addBlock(i, j, zf + CH, zf + CH + .5, 4);
      if (edge) {
        if (door.has(k)) addBlock(i, j, zf + 1.75, zf + CH, o.wall);
        else if (win.has(k)) { addBlock(i, j, zf, zf + .6, o.wall); addBlock(i, j, zf + 1.5, zf + CH, o.wall); }
        else addBlock(i, j, zf, zf + CH, o.wall);
      } else if (solid.has(k)) addBlock(i, j, zf, zf + CH, o.wall);
    }
    for (const [i, j, hh] of o.props) addBlock(i, j, zf, zf + hh, 1);
  }
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const rectGap = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));
  function clearArea(x, y, w, h, z0, z1) {
    if (x < 1 || y < 1 || x + w > MW - 1 || y + h > MH - 1) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) for (const b of cells[j * MW + i] || NONE) if (b.zb < z1 && b.zt > z0) return false;
    return true;
  }
