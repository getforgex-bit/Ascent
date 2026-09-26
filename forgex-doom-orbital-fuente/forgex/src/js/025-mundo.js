  // ================= MUNDO: celdas con pilas de bloques =================
  let cells, ships, gen, cellIdx, lights = [];
  const NONE = [];
  const cellAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? null : cells[(y | 0) * MW + (x | 0)] || null;

  // ---------------- CHUNKS ----------------
  // El mundo se reparte en chunks de CHUNK_XY × CHUNK_XY celdas en horizontal y CHUNK_Z de alto en vertical. En vertical
  // no hay límite (la torre crece sin fin y hay suelos por debajo de 0): la capa es floor(z / CHUNK_Z). Cada bloque
  // pertenece al chunk de su base (zb). Ningún bloque llega a CHUNK_Z de alto (el más alto mide 3,8), así que un bloque
  // solo puede asomar a la capa de encima: por eso la ventana cargada incluye una capa más por debajo.
  //
  // JS guarda siempre el mundo entero en `cells` (la física y el render JS lo usan). Lo que se carga y expulsa por chunks
  // es la copia del mundo en Rust (render Rust, sus hilos y WebGPU): con el streaming activo, solo los chunks de la ventana
  // alrededor del jugador; sin él, todos. Rust contiene exactamente los bloques de los chunks cargados.
  const CHUNK_XY = 32, CHUNK_Z = 8, CHUNKS_X = Math.ceil(MW / CHUNK_XY), CHUNKS_Y = Math.ceil(MH / CHUNK_XY);
  const CHUNK_MARGIN = 8, CHUNK_HYST = 8; // ventana = distancia de dibujo + margen (sombras RT); histéresis al expulsar
  const CHUNKS = { map: new Map(), stream: !!CFG.memory.chunkStreaming, win: null, key: '', loads: 0, evictions: 0 };
  const chunkKey = (cx, cy, cz) => (cz * CHUNKS_Y + cy) * CHUNKS_X + cx; // única también con cz negativo
  // Capa vertical de una altura tal como la guarda Rust (f32): así un bloque cae en el mismo chunk en los dos lados.
  const chunkLayer = z => Math.floor(Math.fround(z) / CHUNK_Z);
  // Ventana de chunks alrededor de (x, y, z): [cx0, cx1, cy0, cy1, cz0, cz1], inclusivos.
  function chunkWindow(x, y, z, extra) {
    const r = MAXD + CHUNK_MARGIN + extra;
    return [Math.floor((x - r) / CHUNK_XY), Math.floor((x + r) / CHUNK_XY), Math.floor((y - r) / CHUNK_XY), Math.floor((y + r) / CHUNK_XY),
      chunkLayer(z - r) - 1, chunkLayer(z + r)];
  }
  const inWindow = (w, ch) => ch.cx >= w[0] && ch.cx <= w[1] && ch.cy >= w[2] && ch.cy <= w[3] && ch.cz >= w[4] && ch.cz <= w[5];
  const blockArgs = (b, replace) => [b.x, b.y, b.zb, b.zt, b.tex, blockFlags(b), b.gx, b.gy, b.gw, b.gh, b.ao, replace];
  function chunkOfBlock(b) {
    const cx = Math.floor(b.x / CHUNK_XY), cy = Math.floor(b.y / CHUNK_XY), cz = chunkLayer(b.zb), key = chunkKey(cx, cy, cz);
    let ch = CHUNKS.map.get(key);
    if (!ch) {
      ch = { key, cx, cy, cz, blocks: [], loaded: true };
      ch.loaded = !CHUNKS.stream || (CHUNKS.win !== null && inWindow(CHUNKS.win, ch));
      CHUNKS.map.set(key, ch);
    }
    return ch;
  }
  function chunkAdd(b) { const ch = chunkOfBlock(b); b.ch = ch; b.ci = ch.blocks.length; ch.blocks.push(b); }
  function chunkRemove(b) {
    const ch = b.ch, last = ch.blocks.pop();
    if (last !== b) { ch.blocks[b.ci] = last; last.ci = b.ci; }
    if (!ch.blocks.length) CHUNKS.map.delete(ch.key);
  }
  function chunkLoad(ch) { ch.loaded = true; CHUNKS.loads++; for (const b of ch.blocks) worldOp(1, blockArgs(b, 0)); }
  function chunkEvict(ch) {
    ch.loaded = false; CHUNKS.evictions++;
    const x = ch.cx * CHUNK_XY, y = ch.cy * CHUNK_XY, z = ch.cz * CHUNK_Z;
    worldOp(5, [x, y, x + CHUNK_XY, y + CHUNK_XY, z, z + CHUNK_Z]);
  }
  // Carga los chunks que entran en la ventana y expulsa los que salen de la ventana ampliada (histéresis: ir y volver
  // por el borde de un chunk no lo carga y expulsa cada vez). Sin streaming, todo queda cargado.
  function streamChunks(x, y, z) {
    if (!CHUNKS.stream) { CHUNKS.win = null; CHUNKS.key = ''; for (const ch of CHUNKS.map.values()) if (!ch.loaded) chunkLoad(ch); return; }
    const load = chunkWindow(x, y, z, 0), keep = chunkWindow(x, y, z, CHUNK_HYST), key = load.join() + '|' + keep.join();
    if (key === CHUNKS.key) return; // mismas ventanas: los chunks nuevos ya nacen cargados o no según CHUNKS.win
    CHUNKS.win = load; CHUNKS.key = key;
    for (const ch of CHUNKS.map.values()) {
      if (!ch.loaded && inWindow(load, ch)) chunkLoad(ch);
      else if (ch.loaded && !inWindow(keep, ch)) chunkEvict(ch);
    }
  }
  function setChunkStreaming(on) { CHUNKS.stream = !!on; CHUNKS.key = ''; if (typeof st !== 'undefined') streamChunks(st.px, st.py, st.pz); }
  // Para copiar el mundo a una instancia nueva (hilo principal o réplica de un hilo de render)
  function forLoadedBlocks(fn) { for (const ch of CHUNKS.map.values()) if (ch.loaded) for (const b of ch.blocks) fn(b); }
  // Estadísticas del panel: chunks con bloques, cargados, expulsados, bloques cargados y chunks a la vista
  // (cargados, a menos de la distancia de dibujo y dentro del campo de visión con margen).
  function chunkStats() {
    let loaded = 0, blocks = 0, visible = 0;
    const fx = Math.cos(st.pa), fy = Math.sin(st.pa), cosHalf = Math.cos(FOV / 2 + .35);
    for (const ch of CHUNKS.map.values()) {
      if (!ch.loaded) continue;
      loaded++; blocks += ch.blocks.length;
      const x0 = ch.cx * CHUNK_XY, y0 = ch.cy * CHUNK_XY, z0 = ch.cz * CHUNK_Z;
      const nx = clamp(st.px, x0, x0 + CHUNK_XY), ny = clamp(st.py, y0, y0 + CHUNK_XY), nz = clamp(st.pz, z0, z0 + CHUNK_Z);
      if (Math.hypot(nx - st.px, ny - st.py, nz - st.pz) > MAXD) continue;
      if (nx === st.px && ny === st.py) { visible++; continue; } // el jugador está encima o debajo de este chunk
      for (const [qx, qy] of [[x0, y0], [x0 + CHUNK_XY, y0], [x0, y0 + CHUNK_XY], [x0 + CHUNK_XY, y0 + CHUNK_XY], [nx, ny]]) {
        const dx = qx - st.px, dy = qy - st.py, L = Math.hypot(dx, dy) || 1;
        if ((dx * fx + dy * fy) / L >= cosHalf) { visible++; break; }
      }
    }
    return { total: CHUNKS.map.size, loaded, evicted: CHUNKS.map.size - loaded, blocks, visible, layer: chunkLayer(st.pz), loads: CHUNKS.loads, evictions: CHUNKS.evictions };
  }

  // Cambios del mundo: se aplican a la instancia Rust del hilo principal y, si hay hilos de render,
  // se anotan en un diario (WJ) que viaja con el siguiente fotograma para que cada réplica haga lo mismo.
  // Códigos: 1 = añadir bloque (12 valores), 2 = ácido (3), 3 = podar (1), 4 = reiniciar (0), 5 = expulsar chunk (6).
  const WJ = { on: false, ops: [] };
  function worldOp(op, a) {
    if (wasm) {
      if (op === 1) wasm.w_add(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11]);
      else if (op === 2) wasm.w_set_acid(a[0], a[1], a[2]);
      else if (op === 3) wasm.w_prune(a[0]);
      else if (op === 5) wasm.w_remove_box(a[0], a[1], a[2], a[3], a[4], a[5]);
      else wasm.w_reset();
    }
    if (WJ.on) { WJ.ops.push(op); for (let i = 0; i < a.length; i++) WJ.ops.push(a[i]); }
  }
  const blockFlags = b => (b.rim ? 1 : 0) | (b.kind === 'ship' ? 2 : 0) | (b.pad ? 4 : 0) | (b.acid ? 8 : 0) | (b.route ? 16 : 0);
  function addBlock(x, y, zb, zt, tex, o = {}) {
    const k = y * MW + x; let c = cells[k]; if (!c) { c = cells[k] = []; cellIdx.add(k); }
    const b = { x, y, zb, zt, tex, kind: o.kind || 'ship', pad: o.pad || 0, rim: !!o.rim, route: !!o.route, ao: o.ao || 0, acid: tex === 7,
      gx: o.gx ?? x, gy: o.gy ?? y, gw: o.gw ?? 1, gh: o.gh ?? 1, ch: null, ci: 0 };
    chunkAdd(b);
    let replaced = false;
    if (o.replace) for (let i = c.length - 1; i >= 0; i--) {
      const r = c[i]; if (!(r.zb < zt && r.zt > zb)) continue;
      c.splice(i, 1);
      if (r.ch.loaded) {
        replaced = true;
        // Rust tiene el bloque sustituido pero no recibirá el nuevo (su chunk no está cargado): se quita aparte
        if (!b.ch.loaded) worldOp(5, [x, y, x + 1, y + 1, Math.fround(r.zb), Math.fround(r.zb) + 1e-3]);
      }
      chunkRemove(r);
    }
    c.push(b);
    // con replace, Rust quita los mismos bloques que acaba de quitar JS (misma prueba de solape en la misma celda)
    if (b.ch.loaded) worldOp(1, blockArgs(b, replaced ? 1 : 0));
  }
  // Poda: quita del mundo todo lo que queda por debajo de minZ (zt < minZ). Solo pueden tener bloques así los chunks
  // cuya capa empieza por debajo de minZ, así que no hace falta recorrer todas las celdas.
  function pruneWorld(minZ) {
    worldOp(3, [minZ]);
    for (const ch of [...CHUNKS.map.values()]) {
      if (ch.cz * CHUNK_Z >= minZ) continue;
      for (let i = ch.blocks.length - 1; i >= 0; i--) {
        const b = ch.blocks[i]; if (b.zt >= minZ) continue;
        const k = b.y * MW + b.x, c = cells[k], j = c.indexOf(b);
        if (j >= 0) c.splice(j, 1);
        if (!c.length) { cells[k] = undefined; cellIdx.delete(k); }
        chunkRemove(b);
      }
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
