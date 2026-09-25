// Benchmark A/B: CPU (Rust SIMD) vs GPU (WebGPU)
// Mide percentiles p50, p99, p999 de 'gap' y 'work', y guarda métricas en pruebas/out/ab_gpu_<timestamp>.json.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

function calcPercentiles(arr) {
  if (!arr.length) return { p50: 0, p99: 0, p999: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const p50 = sorted[Math.floor(n * 0.50)];
  const p99 = sorted[Math.min(Math.floor(n * 0.99), n - 1)];
  const p999 = sorted[Math.min(Math.floor(n * 0.999), n - 1)];
  const min = sorted[0];
  const max = sorted[n - 1];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / n;
  return { p50, p99, p999, min, max, avg };
}

(async () => {
  console.log('=== BENCHMARK A/B: RUST (CPU) vs WEBGPU (GPU) ===');

  const browser = await chromium.launch({
    headless: process.env.HEADED === 'true' ? false : true,
    args: ['--enable-unsafe-webgpu', '--use-angle=default']
  });

  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
  });

  const htmlPath = 'file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html');
  await page.goto(htmlPath);
  await page.waitForTimeout(2000);

  const N_WARMUP = 30;
  const N_BENCH = process.env.FRAMES ? parseInt(process.env.FRAMES, 10) : 300;

  // 1. Benchmark Backend Rust
  console.log(`\nEjecutando benchmark Backend RUST (${N_BENCH} fotogramas)...`);
  const rustMetrics = await page.evaluate(async ({ nWarmup, nBench }) => {
    const D = window.__doom;
    await D.setBackend('rust');

    // Warmup
    for (let i = 0; i < nWarmup; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }

    const workTimes = [];
    const gapTimes = [];
    let lastT = performance.now();

    for (let i = 0; i < nBench; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const lastIdx = (D.PERF.head - 1 + D.PERF.N) & (D.PERF.N - 1);
      gapTimes.push(D.PERF.gap[lastIdx] || 0);
      workTimes.push(D.PERF.work[lastIdx] || 0);
    }

    return {
      workTimes,
      gapTimes,
      gpuInfo: D.CAPS.gpuInfo,
    };
  }, { nWarmup: N_WARMUP, nBench: N_BENCH });

  // 2. Benchmark Backend WebGPU
  console.log(`Ejecutando benchmark Backend WEBGPU (${N_BENCH} fotogramas)...`);
  const gpuMetrics = await page.evaluate(async ({ nWarmup, nBench }) => {
    const D = window.__doom;
    await D.setBackend('webgpu');

    // Warmup
    for (let i = 0; i < nWarmup; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }

    const workTimes = [];
    const gapTimes = [];
    const passTimes = { raycast: [], light: [], rt: [], bloom: [], compose: [] };
    let lastT = performance.now();

    for (let i = 0; i < nBench; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const lastIdx = (D.PERF.head - 1 + D.PERF.N) & (D.PERF.N - 1);
      gapTimes.push(D.PERF.gap[lastIdx] || 0);
      workTimes.push(D.PERF.work[lastIdx] || 0);

      if (window.GPUB && window.GPUB.perf) {
        passTimes.raycast.push(window.GPUB.perf.raycast || 0);
        passTimes.light.push(window.GPUB.perf.light || 0);
        passTimes.rt.push(window.GPUB.perf.rt || 0);
        passTimes.bloom.push(window.GPUB.perf.bloom || 0);
        passTimes.compose.push(window.GPUB.perf.compose || 0);
      }
    }

    return {
      workTimes,
      gapTimes,
      passTimes,
      gpuInfo: D.CAPS.gpuInfo,
    };
  }, { nWarmup: N_WARMUP, nBench: N_BENCH });

  await browser.close();

  // Calcular estadísticas
  const rustWork = calcPercentiles(rustMetrics.workTimes);
  const rustGap = calcPercentiles(rustMetrics.gapTimes);
  const gpuWork = calcPercentiles(gpuMetrics.workTimes);
  const gpuGap = calcPercentiles(gpuMetrics.gapTimes);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(OUT_DIR, `ab_gpu_${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    frames: N_BENCH,
    gpuInfo: gpuMetrics.gpuInfo,
    rust: {
      work: rustWork,
      gap: rustGap,
    },
    webgpu: {
      work: gpuWork,
      gap: gpuGap,
      passes: {
        raycast: calcPercentiles(gpuMetrics.passTimes.raycast),
        light: calcPercentiles(gpuMetrics.passTimes.light),
        rt: calcPercentiles(gpuMetrics.passTimes.rt),
        bloom: calcPercentiles(gpuMetrics.passTimes.bloom),
        compose: calcPercentiles(gpuMetrics.passTimes.compose),
      },
    },
  };

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n================ RESULTADOS BENCHMARK A/B ================');
  console.log(`Dispositivo: ${report.gpuInfo}`);
  console.log(`Fotogramas analizados: ${N_BENCH}\n`);

  console.log('--- TIEMPO DE TRABAJO (WORK / DISPATCH) [ms] ---');
  console.table({
    'Rust (CPU)': {
      'p50 (mediana)': rustWork.p50.toFixed(2) + ' ms',
      'p99': rustWork.p99.toFixed(2) + ' ms',
      'p99.9': rustWork.p999.toFixed(2) + ' ms',
      'Media': rustWork.avg.toFixed(2) + ' ms',
    },
    'WebGPU (GPU)': {
      'p50 (mediana)': gpuWork.p50.toFixed(2) + ' ms',
      'p99': gpuWork.p99.toFixed(2) + ' ms',
      'p99.9': gpuWork.p999.toFixed(2) + ' ms',
      'Media': gpuWork.avg.toFixed(2) + ' ms',
    },
  });

  console.log('\n--- INTERVALO ENTRE FOTOGRAMAS (GAP / FRAME INTERVAL) [ms] ---');
  console.table({
    'Rust (CPU)': {
      'p50 (mediana)': rustGap.p50.toFixed(2) + ' ms',
      'p99': rustGap.p99.toFixed(2) + ' ms',
      'p99.9': rustGap.p999.toFixed(2) + ' ms',
      'Media': rustGap.avg.toFixed(2) + ' ms',
    },
    'WebGPU (GPU)': {
      'p50 (mediana)': gpuGap.p50.toFixed(2) + ' ms',
      'p99': gpuGap.p99.toFixed(2) + ' ms',
      'p99.9': gpuGap.p999.toFixed(2) + ' ms',
      'Media': gpuGap.avg.toFixed(2) + ' ms',
    },
  });

  if (report.webgpu.passes.raycast.avg > 0 || report.webgpu.passes.light.avg > 0) {
    console.log('\n--- WEBGPU DESGLOSE POR PASES (TIMESTAMPS GPU) [ms] ---');
    console.table({
      'Raycast': { 'p50': report.webgpu.passes.raycast.p50.toFixed(3) + ' ms', 'Media': report.webgpu.passes.raycast.avg.toFixed(3) + ' ms' },
      'Light': { 'p50': report.webgpu.passes.light.p50.toFixed(3) + ' ms', 'Media': report.webgpu.passes.light.avg.toFixed(3) + ' ms' },
      'RT Shadow': { 'p50': report.webgpu.passes.rt.p50.toFixed(3) + ' ms', 'Media': report.webgpu.passes.rt.avg.toFixed(3) + ' ms' },
      'Bloom': { 'p50': report.webgpu.passes.bloom.p50.toFixed(3) + ' ms', 'Media': report.webgpu.passes.bloom.avg.toFixed(3) + ' ms' },
      'Compose': { 'p50': report.webgpu.passes.compose.p50.toFixed(3) + ' ms', 'Media': report.webgpu.passes.compose.avg.toFixed(3) + ' ms' },
    });
  }

  console.log(`\nInforme guardado con éxito en:\n${outFile}`);
  console.log('=== BENCHMARK A/B COMPLETADO CON ÉXITO ===');
})();
