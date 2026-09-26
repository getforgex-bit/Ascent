// Sistema de chunks del juego (025-mundo.js) con el motor Rust, en Chromium:
//  1. Índice: cada bloque de `cells` está en el chunk que le toca (32×32 celdas, capas de 8 sin límite vertical).
//  2. Rust contiene exactamente los bloques de los chunks cargados (se recorre su memoria), también tras podar,
//     sustituir bloques, moverse lejos en horizontal y en vertical, y encender o apagar el streaming.
//  3. Lo cargado cubre la ventana: la imagen con streaming es idéntica bit a bit a la imagen con todo cargado.
//  4. Las réplicas de los hilos de render tienen los mismos bloques que el hilo principal.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('[SKIP] Playwright no está disponible en este entorno.'); process.exit(0); }
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

(async () => {
  console.log('=== TEST CHUNKS: índice, streaming y réplicas ===\n');
  let browser;
  try { browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }); }
  catch (err) { console.log('[SKIP] No se pudo arrancar Chromium en este entorno:', err.message); process.exit(0); }
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html'));
  await page.waitForFunction(() => window.__doom && window.__doom.wasm, null, { timeout: 30000 });
  await page.evaluate(async () => { await window.__doom.setBackend('rust'); });

  // Todas las comprobaciones de un caso se hacen en una sola llamada: entre medias no corre ningún paso de simulación.
  await page.evaluate(() => {
    const d = window.__doom;
    window.__check = label => {
      const fails = [], X = d.wasm, B = X.memory.buffer, K = d.CHUNKS;
      // 1) índice JS
      let inCells = 0;
      const cells = d.cells;
      for (let k = 0; k < cells.length; k++) { const c = cells[k]; if (!c) continue;
        for (const b of c) { inCells++;
          const ch = b.ch;
          if (!ch || ch.blocks[b.ci] !== b) { fails.push(`bloque fuera de su chunk en (${b.x},${b.y},${b.zb})`); continue; }
          if (b.x !== k % d.MW || b.y !== (k / d.MW | 0)) fails.push('coordenadas del bloque distintas de su celda');
          if (ch.cx !== Math.floor(b.x / d.CHUNK_XY) || ch.cy !== Math.floor(b.y / d.CHUNK_XY) || ch.cz !== d.chunkLayer(b.zb)) fails.push('chunk equivocado');
          if (K.map.get(ch.key) !== ch) fails.push('chunk no registrado');
        } }
      let inChunks = 0; for (const ch of K.map.values()) { inChunks += ch.blocks.length; if (!ch.blocks.length) fails.push('chunk vacío registrado'); }
      if (inChunks !== inCells) fails.push(`bloques en chunks ${inChunks} ≠ en celdas ${inCells}`);
      // 2) Rust = bloques de los chunks cargados (multiconjunto de x, y, zb, zt, tex, flags en f32)
      const key = (x, y, zb, zt, tex, fl) => `${x},${y},${zb},${zt},${tex},${fl}`;
      const want = new Map(); let nLoaded = 0;
      d.forLoadedBlocks(b => { nLoaded++; const k = key(b.x, b.y, Math.fround(b.zb), Math.fround(b.zt), b.tex, ((b.rim ? 1 : 0) | (b.kind === 'ship' ? 2 : 0) | (b.pad ? 4 : 0) | (b.acid ? 8 : 0) | (b.route ? 16 : 0)));
        want.set(k, (want.get(k) || 0) + 1); });
      const head = new Uint32Array(B, X.p_head(), d.MW * d.MW), F = new Float32Array(B, X.p_bl()), U = new Uint32Array(B, X.p_bl()), U8 = new Uint8Array(B, X.p_bl());
      let nRust = 0;
      for (let ci = 0; ci < head.length; ci++) for (let n = head[ci], guard = 0; n && guard < 1e5; guard++) {
        const o = (n - 1) * 8; nRust++;
        const k = key(ci % d.MW, ci / d.MW | 0, F[o], F[o + 1], U8[o * 4 + 28], U8[o * 4 + 29]);
        const c = want.get(k); if (!c) { if (fails.length < 12) fails.push(`Rust tiene un bloque que no está cargado en JS: ${k}`); } else want.set(k, c - 1);
        n = U[o + 6];
      }
      for (const [k, c] of want) if (c) { if (fails.length < 12) fails.push(`falta en Rust: ${k} ×${c}`); }
      if (X.w_live() !== nRust) fails.push(`w_live ${X.w_live()} ≠ bloques recorridos ${nRust}`);
      // 3) lo cargado cubre la ventana (y con histéresis no pasa de la ventana ampliada)
      if (K.stream) {
        const win = d.chunkWindow(d.st.px, d.st.py, d.st.pz, 0), keep = d.chunkWindow(d.st.px, d.st.py, d.st.pz, 8);
        const inW = (w, ch) => ch.cx >= w[0] && ch.cx <= w[1] && ch.cy >= w[2] && ch.cy <= w[3] && ch.cz >= w[4] && ch.cz <= w[5];
        for (const ch of K.map.values()) {
          if (inW(win, ch) && !ch.loaded) fails.push(`chunk (${ch.cx},${ch.cy},${ch.cz}) dentro de la ventana sin cargar`);
          if (!inW(keep, ch) && ch.loaded) fails.push(`chunk (${ch.cx},${ch.cy},${ch.cz}) fuera de la ventana y cargado`);
        }
      } else for (const ch of K.map.values()) if (!ch.loaded) fails.push('sin streaming hay un chunk sin cargar');
      const s = d.chunkStats();
      return { label, ok: !fails.length, fails: fails.slice(0, 8), chunks: s.total, loaded: s.loaded, blocks: inCells, rustBlocks: nRust, layers: [...new Set([...K.map.values()].map(c => c.cz))].sort((a, b) => a - b) };
    };
    // Render del hilo principal con el motor Rust para comparar imágenes
    window.__frame = () => { d.prepareFrame(); d.rustRender(0); const [w, h] = d.res; return new Uint8Array(d.wasm.memory.buffer, d.wasm.p_out(), w * h * 4).slice(); };
    window.__go = (x, y, z, a, look) => { d.tp(x, y, z, a); d.st.look = look || 0; d.streamChunks(d.st.px, d.st.py, d.st.pz); };
  });

  let allPassed = true;
  const report = r => {
    const extra = `chunks=${r.chunks} cargados=${r.loaded} bloques=${r.blocks} en Rust=${r.rustBlocks} capas=[${r.layers[0]}..${r.layers[r.layers.length - 1]}]`;
    if (r.ok) console.log(`✓ ${r.label} (${extra})`);
    else { allPassed = false; console.error(`✗ FAIL ${r.label}: ${r.fails.join(' | ')} (${extra})`); }
  };

  // La torre crece hasta z ≈ 160 (20 capas) sin podar: el jugador sigue abajo
  report(await page.evaluate(() => {
    const d = window.__doom; d.setChunkStreaming(true);
    let n = 0; while (d.gen.h < 160 && n++ < 3000) d.nextStep();
    window.__go(d.C + .5, d.C + .5, 0, 0);
    const r = window.__check('Torre de 160 m de alto, jugador en la base');
    if (r.layers[r.layers.length - 1] < 19) { r.ok = false; r.fails.push('la capa vertical más alta debería ser ≥ 19 (antes todo lo que pasaba de z = 56 caía en la capa 7)'); }
    return r;
  }));
  report(await page.evaluate(() => { const d = window.__doom; window.__go(d.C + .5, d.C + .5, 120, 0); return window.__check('Subida a z = 120: se cargan las capas de arriba y se expulsan las de abajo'); }));
  report(await page.evaluate(() => {
    const d = window.__doom; let far = null, fd = 0; // el chunk con bloques más alejado del eje
    for (const ch of d.CHUNKS.map.values()) { const dd = Math.hypot(ch.cx * 32 + 16 - d.C, ch.cy * 32 + 16 - d.C); if (dd > fd) { fd = dd; far = ch; } }
    window.__go(far.cx * 32 + 16.5, far.cy * 32 + 16.5, far.cz * 8 + 4, 0);
    const r = window.__check(`Desplazamiento horizontal a ${Math.round(fd)} celdas del eje`);
    if (!far.loaded) { r.ok = false; r.fails.push('el chunk de destino no se cargó'); }
    return r;
  }));
  report(await page.evaluate(() => { const d = window.__doom; window.__go(d.C + .5, d.C + .5, 20, 0); return window.__check('Vuelta al eje'); }));
  report(await page.evaluate(() => {
    const d = window.__doom, C = d.C;
    // Sustituir bloques cuyo chunk está cargado desde un chunk que no lo está (replace entre capas en el borde)
    const z = (d.CHUNKS.win[5] + 1) * 8;                   // primera capa por encima de la ventana cargada
    d.plat(C + 3, C + 3, 2, 2, z + 1, 2, 1);                 // [z − 1, z + 1]: base en la ventana, asoma a la capa de fuera
    const before = d.wasm.w_live();
    d.plat(C + 3, C + 3, 2, 2, z + 1.5, 1, 2);               // [z + .5, z + 1.5]: base fuera, solapa y sustituye al anterior
    const r = window.__check('Sustitución de bloques entre un chunk cargado y otro sin cargar');
    if (d.wasm.w_live() !== before - 4) { r.ok = false; r.fails.push(`Rust debía perder los 4 bloques sustituidos (${before} → ${d.wasm.w_live()})`); }
    return r;
  }));
  report(await page.evaluate(() => { const d = window.__doom; d.pruneWorld(40); const r = window.__check('Poda por debajo de z = 40');
    let low = 0; for (const c of d.cells) if (c) for (const b of c) if (b.zt < 40) low++;
    if (low) { r.ok = false; r.fails.push(`${low} bloques por debajo de la poda`); } return r; }));
  report(await page.evaluate(() => { const d = window.__doom; d.setChunkStreaming(false); return window.__check('Streaming apagado: todo cargado'); }));
  report(await page.evaluate(() => { const d = window.__doom; d.setChunkStreaming(true); return window.__check('Streaming encendido de nuevo'); }));

  // Imagen idéntica con y sin streaming (columnas y cámara 3D mirando arriba y abajo)
  console.log('\n--- Imagen con streaming = imagen con todo cargado ---');
  for (const [lbl, x, y, z, a, look] of [['columnas', 0, 0, 60, 0, 0], ['cámara 3D mirando arriba', 3, 2, 45, 1.2, 1.1], ['cámara 3D mirando abajo', -4, 1, 70, 2.5, -1.1], ['borde de la torre', 30, -20, 55, 3.4, .2]]) {
    const r = await page.evaluate(([x, y, z, a, look]) => {
      const d = window.__doom; d.setChunkStreaming(true); window.__go(d.C + x, d.C + y, z, a, look);
      const on = window.__frame(), loadedOn = d.chunkStats().loaded;
      d.setChunkStreaming(false); const off = window.__frame(), loadedOff = d.chunkStats().loaded;
      d.setChunkStreaming(true);
      let diff = 0; for (let i = 0; i < on.length; i++) if (on[i] !== off[i]) diff++;
      return { diff, loadedOn, loadedOff };
    }, [x, y, z, a, look]);
    if (r.diff === 0) console.log(`✓ ${lbl}: idéntica (chunks cargados ${r.loadedOn} con streaming, ${r.loadedOff} sin él)`);
    else { allPassed = false; console.error(`✗ FAIL ${lbl}: ${r.diff} bytes distintos`); }
  }

  // Réplicas de los hilos de render
  console.log('\n--- Réplicas de los hilos de render ---');
  const w = await page.evaluate(async () => {
    const d = window.__doom;
    if (!d.CAPS.workers) return { skip: 'el navegador no permite hilos' };
    d.setOption('threads', 'workers', 2);
    await new Promise(r => setTimeout(r, 1500));
    if (!d.WORKERS.active) return { skip: 'no se activaron los hilos: ' + d.WORKERS.why };
    const out = [];
    for (const [x, y, z] of [[d.C + .5, d.C + .5, 20], [d.C + 100.5, d.C + 60.5, 60], [d.C + .5, d.C + .5, 100]]) {
      window.__go(x, y, z, 0);
      const want = d.wasm.w_live(), since = d.WK.id;
      await new Promise(r => { const t0 = performance.now(); const iv = setInterval(() => { if (d.WK.shown > since + 2 || performance.now() - t0 > 8000) { clearInterval(iv); r(); } }, 20); });
      out.push({ want, got: d.WK.stats.blocks.slice(), live: d.wasm.w_live() });
    }
    d.setOption('threads', 'workers', 'auto');
    return { out };
  });
  if (w.skip) console.log(`[SKIP] réplicas: ${w.skip}`);
  else for (const [i, r] of w.out.entries()) {
    const ok = r.got.length && r.got.every(n => n === r.live);
    if (ok) console.log(`✓ posición ${i + 1}: ${r.got.length} réplicas con ${r.live} bloques, igual que el hilo principal`);
    else { allPassed = false; console.error(`✗ FAIL posición ${i + 1}: réplicas ${JSON.stringify(r.got)} vs hilo principal ${r.live}`); }
  }

  // Cifras: cuánto se deja de cargar en Rust con el streaming en una partida normal
  const m = await page.evaluate(() => { const d = window.__doom; window.__go(d.C + .5, d.C + .5, 120, 0); const s = d.chunkStats(); return { total: s.total, loaded: s.loaded, blocks: s.blocks, all: [...d.CHUNKS.map.values()].reduce((a, c) => a + c.blocks.length, 0) }; });
  console.log(`\nEn z = 120 en el eje: ${m.loaded}/${m.total} chunks y ${m.blocks}/${m.all} bloques cargados en Rust (${Math.round(100 - 100 * m.blocks / m.all)} % menos).`);

  if (errors.length) { allPassed = false; console.error('Errores de la página:', errors.slice(0, 5)); }
  await browser.close();
  if (!allPassed) { console.error('\nTEST CHUNKS FALLIDO.'); process.exit(1); }
  console.log('\n=== TEST CHUNKS: TODO CORRECTO ===');
  process.exit(0);
})();
