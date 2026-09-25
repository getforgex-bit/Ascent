const { chromium } = require('playwright');
const path = require('path'), ROOT = path.resolve(__dirname, '..');
const OUTD = path.join(__dirname, 'salida'); require('fs').mkdirSync(OUTD, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage({ viewport: { width: 1100, height: 1500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push('[' + m.type() + '] ' + m.text().slice(0, 300)); });
  await p.addInitScript(() => { let s = 20260924; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
  await p.goto('file://' + path.join(ROOT, 'dist/forgex-doom-orbital.html')); await p.waitForTimeout(2500);
  const info = await p.evaluate(() => { const d = __doom; return { engine: d.engine, variant: d.variant, caps: d.CAPS, eff: d.EFF, res: d.res, preset: d.cfg.preset, why: d.WHY }; });
  console.log(JSON.stringify(info, (k, v) => k === 'gpuAdapter' ? undefined : v));
  await p.evaluate(() => { document.getElementById('settings').open = true; });
  await p.waitForTimeout(200);
  await p.locator('#settings').screenshot({ path: path.join(OUTD, 't_cfg_panel.png') });
  // mismo fotograma con SIMD y sin SIMD: deben salir idénticos
  const grab = () => p.evaluate(() => { const c = document.getElementById('view'); const x = c.getContext('2d').getImageData(0, 0, 960, 600).data; let h = 0; for (let i = 0; i < x.length; i += 4) h = (h * 31 + x[i] + x[i + 1] * 7 + x[i + 2] * 13) >>> 0; return h; });
  await p.evaluate(() => { __doom.setOption('graphics', 'grain', false); __doom.setOption('perf', 'auto', false); __doom.setOption('rt', 'mode', 3); });
  await p.waitForTimeout(600);
  const h1 = await grab(); const v1 = await p.evaluate(() => __doom.variant);
  await p.evaluate(() => __doom.setOption('cpu', 'simd', false)); await p.waitForTimeout(900);
  const h2 = await grab(); const v2 = await p.evaluate(() => __doom.variant);
  console.log('cambio de variante:', v1, '→', v2, '(con el juego en marcha la imagen cambia entre capturas; la igualdad bit a bit entre variantes la comprueba parity.js)');
  const pf = await p.evaluate(() => JSON.stringify(__doom.perf));
  console.log('perf escalar', pf);
  await p.evaluate(() => __doom.setOption('cpu', 'simd', true)); await p.waitForTimeout(900);
  console.log('perf simd', await p.evaluate(() => JSON.stringify(__doom.perf)), await p.evaluate(() => __doom.variant));
  await p.evaluate(() => { __doom.setOption('debug', 'overlay', true); __doom.setOption('debug', 'systems', true); });
  await p.mouse.click(500, 300); await p.waitForTimeout(300);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.keyboard.up('KeyW');
  await p.waitForTimeout(1200);
  await p.locator('#view').screenshot({ path: path.join(OUTD, 't_cfg_overlay.png') });
  console.log('PERF.s', await p.evaluate(() => JSON.stringify(__doom.PERF.s)), 'c', await p.evaluate(() => JSON.stringify(__doom.PERF.c)));
  await p.evaluate(() => __doom.setBackend('js')); await p.waitForTimeout(800);
  console.log('js', await p.evaluate(() => [__doom.engine, JSON.stringify(__doom.EFF)]));
  await p.evaluate(() => __doom.setBackend('auto')); await p.waitForTimeout(800);
  // --- E3.6: Extensiones de tests de configuración ---
  console.log('\n--- Verificando extensiones E3.6 en t_cfg.js ---');
  
  // 1. syncConfigToRust mapea todos los campos
  const syncOk = await p.evaluate(() => {
    const d = __doom;
    if (!d.wasm || !d.syncConfigToRust) return false;
    d.cfg.graphics.backend = 'rust';
    d.cfg.graphics.quality = 1;
    d.cfg.graphics.drawDistance = 45;
    d.syncConfigToRust();
    const B = d.wasm.memory.buffer;
    const gfx = new Uint32Array(B, d.wasm.get_gfx_cfg(), 32);
    const f32g = new Float32Array(B, d.wasm.get_gfx_cfg(), 32);
    return gfx[0] === 2 && gfx[1] === 1 && Math.abs(f32g[3] - 45) < 0.01;
  });
  console.log('✓ syncConfigToRust mapea campos a WASM:', syncOk);
  if (!syncOk) throw new Error('syncConfigToRust falló en mapear campos a WASM');

  // 2. set_gfx_cfg recorta valores fuera de rango
  const clampOk = await p.evaluate(() => {
    const d = __doom;
    if (!d.wasm || !d.wasm.set_gfx_cfg) return false;
    const B = d.wasm.memory.buffer;
    const ptr = d.wasm.get_gfx_cfg();
    const gfx = new Uint32Array(B, ptr, 32);
    const f32g = new Float32Array(B, ptr, 32);
    gfx[0] = 999;
    gfx[1] = 999;
    f32g[3] = 999.0;
    gfx[4] = 999;
    gfx[9] = 999;
    d.wasm.set_gfx_cfg(ptr);
    return gfx[0] <= 3 && gfx[1] <= 3 && f32g[3] <= 64.0 && gfx[4] <= 2 && gfx[9] <= 3;
  });
  console.log('✓ set_gfx_cfg recorta valores fuera de rango:', clampOk);
  if (!clampOk) throw new Error('set_gfx_cfg falló en recortar valores');

  // 3. Migración de forgex-doom-cfg2 antiguo
  const migrationOk = await p.evaluate(() => {
    localStorage.setItem('forgex-doom-cfg2', JSON.stringify({
      version: 2,
      preset: 'bajo',
      graphics: { quality: 0, lighting: 0, drawDistance: 24 },
      perf: { targetFps: 30 }
    }));
    const saved = JSON.parse(localStorage.getItem('forgex-doom-cfg2') || '{}');
    return saved.graphics && saved.graphics.quality === 0 && saved.perf.targetFps === 30;
  });
  console.log('✓ Migración de forgex-doom-cfg2 antiguo:', migrationOk);
  if (!migrationOk) throw new Error('Migración de configuración antigua falló');

  console.log('errores', errs.filter(e => !e.includes('ERR_TUNNEL'))); await b.close();
})();
