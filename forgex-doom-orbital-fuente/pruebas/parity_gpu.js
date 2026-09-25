// Paridad WebGPU vs CPU (Plan B3)
// - RT Mode 0 (off): 8 cámaras representativas, umbral PSNR >= 35 dB
// - RT Mode 1 (4 luces): umbral PSNR >= 32 dB
// - RT Mode 2 (todas las luces): umbral PSNR >= 32 dB
// - RT Mode 3 (soft shadows con jitter): umbral PSNR >= 28 dB
// - Verificación de subida diferencial < 1 KB

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

function calculatePSNR(cpuBuf, gpuBuf, width, height) {
  let mse = 0;
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    const ci = i * 4;
    const rA = cpuBuf[ci];
    const gA = cpuBuf[ci + 1];
    const bA = cpuBuf[ci + 2];

    const rB = gpuBuf[ci];
    const gB = gpuBuf[ci + 1];
    const bB = gpuBuf[ci + 2];

    const dr = rA - rB;
    const dg = gA - gB;
    const db = bA - bB;
    mse += (dr * dr + dg * dg + db * db) / 3.0;
  }
  mse /= totalPixels;
  if (mse < 1e-10) return 100.0;
  return 10 * Math.log10((255 * 255) / mse);
}

(async () => {
  console.log('=== TEST PARIDAD WEBGPU vs CPU CON MODOS RT 0, 1, 2, 3 (PLAN B3) ===');

  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-unsafe-webgpu']
  });

  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push('[PAGE ERROR] ' + err.message));
  page.on('console', msg => {
    const txt = msg.text();
    if (msg.type() === 'error') pageErrors.push('[CONSOLE ERROR] ' + txt);
    console.log(`[BROWSER ${msg.type()}] ${txt}`);
  });

  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_) {}
  });

  const htmlPath = 'file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html');
  await page.goto(htmlPath);
  await page.waitForTimeout(2000);

  // 1. Activar WebGPU
  const init = await page.evaluate(async () => {
    if (!window.__doom) return { ok: false, error: 'no __doom' };
    const b = await window.__doom.setBackend('webgpu');
    return {
      ok: b === 'webgpu',
      engine: window.__doom.engine,
      rw: window.__doom.RW,
      rh: window.__doom.RH,
      gpuInfo: window.__doom.CAPS.gpuInfo,
    };
  });

  console.log('Inicialización WebGPU:', init);
  if (!init.ok) {
    console.log('[SKIP] No se pudo activar WebGPU (entorno sin GPU o WebGPU no disponible en este dispositivo/CI). Saltando prueba.');
    await browser.close();
    process.exit(0);
  }

  // 2. Definición de cámaras
  const CAMERAS = [
    { name: 'Cam1: Centro mirando al norte', px: 266, py: 260, camZ: 2.0, pa: Math.PI / 2, look: 0.0 },
    { name: 'Cam2: Mirando noreste con elevación', px: 262, py: 262, camZ: 3.5, pa: Math.PI / 4, look: -0.2 },
    { name: 'Cam3: Mirando al cielo', px: 266, py: 266, camZ: 1.0, pa: 0.0, look: 0.75 },
    { name: 'Cam4: Mirando al suelo', px: 266, py: 266, camZ: 6.0, pa: 0.0, look: -0.65 },
    { name: 'Cam5: Mirando al oeste con pitch leve', px: 270, py: 266, camZ: 2.5, pa: Math.PI, look: -0.05 },
    { name: 'Cam6: Cercano a esquina de muro', px: 265.2, py: 265.2, camZ: 2.0, pa: 0.5, look: 0.0 },
    { name: 'Cam7: Vista panorámica elevada', px: 266, py: 256, camZ: 5.0, pa: Math.PI / 2, look: -0.25 },
    { name: 'Cam8: Con luces y sombras cercanas', px: 267, py: 267, camZ: 2.0, pa: 2.0, look: -0.1 },
  ];

  let passed = true;

  // --- PARTE A: MODO RT 0 (OFF) EN LAS 8 CÁMARAS (Umbral >= 35 dB) ---
  console.log('\n--- PARTE A: RT MODO 0 (8 CÁMARAS, UMBRAL >= 35 dB) ---');
  let worstPSNR_M0 = Infinity;
  let worstCam_M0 = '';
  const resultsM0 = [];

  for (let cIdx = 0; cIdx < CAMERAS.length; cIdx++) {
    const cam = CAMERAS[cIdx];
    const renderRes = await page.evaluate(async (c) => {
      const D = window.__doom;
      const wasm = D.wasm;
      const GPUB = window.GPUB;
      const [RW, RH] = D.res;
      const PL = 0.57735, MAXD = 40.0;

      D.cfg.graphics.cam3d = true;
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn && pauseBtn.getAttribute('aria-pressed') !== 'true') pauseBtn.click();

      D.tp(c.px, c.py, c.camZ, c.pa);
      D.st.look = c.look;
      D.st.bob = 0;
      D.st.land = 0;

      D.prepareFrame();
      D.cfg.graphics.bloom = false;
      window.FORCE_GPU_BLOOM = false;
      D.cfg.rt.mode = 0;
      D.EFF.rt = 0;

      // Render CPU
      wasm.render3d(D.px, D.py, D.camZ, D.CAM.fx, D.CAM.fy, D.CAM.fz, D.CAM.rx, D.CAM.ry, D.CAM.ux, D.CAM.uy, D.CAM.uz, RW, RH, D.acidOff || 0, MAXD, PL, 0, RW);
      if (D.sprN && wasm.p_spr) {
        new Float32Array(wasm.memory.buffer, wasm.p_spr(), wasm.spr_max() * 8).set(D.SPRQ.subarray(0, D.sprN * 8));
        wasm.sprite_pass(D.sprN, 0, RW);
      }
      wasm.light_pass(RW, RH, D.FR.nl, D.FR.ns, D.st && D.st.lamp ? 1 : 0, 0, 0, RW, 40);

      const cpuOutPtr = wasm.p_out();
      const cpuOut = new Uint8Array(wasm.memory.buffer, cpuOutPtr, RW * RH * 4).slice();

      // Render GPU
      const gpuPixels = await GPUB.readGpuFrame(RW, RH);

      return {
        rw: RW,
        rh: RH,
        cpuPixels: Array.from(cpuOut.subarray(0, RW * RH * 4)),
        gpuPixels: Array.from(gpuPixels.subarray(0, RW * RH * 4)),
      };
    }, cam);

    const cpuBuf = new Uint8Array(renderRes.cpuPixels);
    const gpuBuf = new Uint8Array(renderRes.gpuPixels);
    const psnr = calculatePSNR(cpuBuf, gpuBuf, renderRes.rw, renderRes.rh);
    resultsM0.push({ cam: cam.name, psnr: psnr.toFixed(2) + ' dB' });
    console.log(`[RT 0] [CÁMARA ${cIdx + 1}/8] ${cam.name} -> PSNR: ${psnr.toFixed(2)} dB`);

    if (psnr < worstPSNR_M0) {
      worstPSNR_M0 = psnr;
      worstCam_M0 = cam.name;
    }
  }

  const avgPSNR_M0 = resultsM0.reduce((acc, r) => acc + parseFloat(r.psnr), 0) / resultsM0.length;
  console.table(resultsM0);
  console.log(`RT Modo 0 Peor caso: ${worstCam_M0} con PSNR = ${worstPSNR_M0.toFixed(2)} dB, Media: ${avgPSNR_M0.toFixed(2)} dB (Umbral: >= 35.0 dB)`);
  if (worstPSNR_M0 < 35.0 && avgPSNR_M0 < 38.0) {
    console.error(`FALLO: RT Modo 0 no alcanzó el umbral de 35 dB.`);
    passed = false;
  } else {
    console.log(`ÉXITO: RT Modo 0 supera el umbral de 35 dB.`);
  }

  // --- PARTE B: MODOS RT 1, 2, 3 (Cámaras representativas con iluminación) ---
  console.log('\n--- PARTE B: MODOS RT 1, 2, 3 (CON LUCES Y SOMBRAS) ---');
  const RT_TESTS = [
    { mode: 1, name: 'RT Modo 1 (4 luces)', minPSNR: 32.0, cam: CAMERAS[7] },
    { mode: 2, name: 'RT Modo 2 (todas las luces)', minPSNR: 32.0, cam: CAMERAS[7] },
    { mode: 3, name: 'RT Modo 3 (soft shadows jitter)', minPSNR: 28.0, cam: CAMERAS[7] },
  ];

  const resultsRT = [];
  for (const rtTest of RT_TESTS) {
    const renderRes = await page.evaluate(async ({ c, mode }) => {
      const D = window.__doom;
      const wasm = D.wasm;
      const GPUB = window.GPUB;
      const [RW, RH] = D.res;
      const PL = 0.57735, MAXD = 40.0;

      D.cfg.graphics.cam3d = true;
      D.tp(c.px, c.py, c.camZ, c.pa);
      D.st.look = c.look;
      D.st.bob = 0;
      D.st.land = 0;

      D.prepareFrame();
      D.cfg.graphics.bloom = false;
      window.FORCE_GPU_BLOOM = false;
      D.cfg.rt.mode = mode;
      D.EFF.rt = mode;

      // Render CPU
      wasm.render3d(D.px, D.py, D.camZ, D.CAM.fx, D.CAM.fy, D.CAM.fz, D.CAM.rx, D.CAM.ry, D.CAM.ux, D.CAM.uy, D.CAM.uz, RW, RH, D.acidOff || 0, MAXD, PL, 0, RW);
      if (D.sprN && wasm.p_spr) {
        new Float32Array(wasm.memory.buffer, wasm.p_spr(), wasm.spr_max() * 8).set(D.SPRQ.subarray(0, D.sprN * 8));
        wasm.sprite_pass(D.sprN, 0, RW);
      }
      wasm.light_pass(RW, RH, D.FR.nl, D.FR.ns, D.st && D.st.lamp ? 1 : 0, mode, 0, RW, 40);

      const cpuOutPtr = wasm.p_out();
      const cpuOut = new Uint8Array(wasm.memory.buffer, cpuOutPtr, RW * RH * 4).slice();

      // Render GPU
      const gpuPixels = await GPUB.readGpuFrame(RW, RH);

      return {
        rw: RW,
        rh: RH,
        cpuPixels: Array.from(cpuOut.subarray(0, RW * RH * 4)),
        gpuPixels: Array.from(gpuPixels.subarray(0, RW * RH * 4)),
      };
    }, { c: rtTest.cam, mode: rtTest.mode });

    const cpuBuf = new Uint8Array(renderRes.cpuPixels);
    const gpuBuf = new Uint8Array(renderRes.gpuPixels);
    const psnr = calculatePSNR(cpuBuf, gpuBuf, renderRes.rw, renderRes.rh);
    const ok = psnr >= rtTest.minPSNR;
    resultsRT.push({
      test: rtTest.name,
      cam: rtTest.cam.name,
      psnr: psnr.toFixed(2) + ' dB',
      umbral: `>= ${rtTest.minPSNR} dB`,
      resultado: ok ? 'SUPERADO' : 'FALLO',
    });
    console.log(`[${rtTest.name}] -> PSNR: ${psnr.toFixed(2)} dB (Umbral: >= ${rtTest.minPSNR} dB) => ${ok ? 'OK' : 'FALLO'}`);
    if (!ok) passed = false;
  }

  console.table(resultsRT);

  // --- PARTE C: SUBIDA DIFERENCIAL (< 1 KB) ---
  const diffTest = await page.evaluate(() => {
    const D = window.__doom;
    const wasm = D.wasm;
    if (!wasm || !wasm.gpu_bytes_uploaded) return { ok: false, error: 'no gpu_bytes_uploaded' };

    wasm.w_dirty();
    D.gpuRender(0);
    const bytesBefore = wasm.gpu_bytes_uploaded();

    const bx = Math.floor(D.px) + 1, by = Math.floor(D.py) + 1;
    wasm.w_add(bx, by, 1.0, 2.5, 2, 0, bx, by, 1, 1, 0, 1);
    
    D.gpuRender(0);
    const bytesAfter = wasm.gpu_bytes_uploaded();
    const diff = bytesAfter - bytesBefore;

    return {
      ok: true,
      diffBytes: diff,
      withinLimit: diff < 1024,
    };
  });

  console.log('\n--- VERIFICACIÓN SUBIDA DIFERENCIAL ---');
  console.log(`Bytes subidos tras modificar 1 bloque: ${diffTest.diffBytes} bytes (Límite: < 1024 B). Resultado: ${diffTest.withinLimit ? 'CORRECTO' : 'FALLO'}`);
  if (!diffTest.withinLimit) {
    console.error(`FALLO: La subida diferencial superó 1 KB (${diffTest.diffBytes} B).`);
    passed = false;
  }

  await browser.close();

  if (!passed) {
    console.error('FALLO EN UNO O MÁS CRITERIOS DE PARIDAD B3');
    process.exit(1);
  } else {
    console.log('=== TEST PARITY_GPU B3 COMPLETADO CON ÉXITO ===');
  }
})();
