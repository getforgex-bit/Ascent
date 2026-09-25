const { chromium } = require('playwright');
const path = require('path'), ROOT = path.resolve(__dirname, '..');
const OUTD = path.join(__dirname, 'salida'); require('fs').mkdirSync(OUTD, { recursive: true });
const FILE = process.argv[2] || path.join(ROOT, 'dist/forgex-doom-orbital.html');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push('[' + m.type() + '] ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => { let s = 20260924; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; try { localStorage.clear(); } catch (_) {} });
  await p.goto('file://' + FILE); await p.waitForTimeout(1800);
  const spot = await p.evaluate(() => { const d = window.__doom; d.st.skullT = 999; d.cfg.perf.auto = false;
    const L = d.lights; let best = null, bn = -1;
    for (const s of d.ships) { const n = L.filter(l => l.x > s.x0 && l.x < s.x0 + s.w && l.y > s.y0 && l.y < s.y0 + s.h).length; if (n > bn) { bn = n; best = s; } }
    const s = best, cand = [];
    for (let y = s.y0 + 1; y < s.y0 + s.h - 1; y++) for (let x = s.x0 + 1; x < s.x0 + s.w - 1; x++) { const c = d.cells[y * d.MW + x] || [];
      if (c.find(b => Math.abs(b.zt - s.zf) < .01 && b.tex !== 7) && !c.find(b => b.zb >= s.zf - .01 && b.zb < s.zf + 1.5 && b.zt > s.zf + .5)) cand.push([x + .5, y + .5, L.filter(l => Math.hypot(l.x - x, l.y - y) < 6).length]); }
    cand.sort((a, b) => b[2] - a[2]); const c = cand[0]; return [c[0], c[1], s.zf]; });
  const f = v => v.toFixed(1);
  for (const rt of [1, 3]) for (const nw of [0, 1, 2, 3]) {
    await p.evaluate(([rt, nw]) => { const d = window.__doom; d.setQuality(2); d.cfg.rt.mode = rt; d.setOption('threads', 'workers', nw); }, [rt, nw]);
    await p.waitForTimeout(900);
    const act = await p.evaluate(() => [window.__doom.engine, window.__doom.PERF && 0, document.querySelector('#s-body') ? 1 : 0]);
    const r = [];
    for (const ang of [0, 1.57, 3.14, 4.71]) {
      await p.evaluate(([s, a]) => { const d = window.__doom; d.tp(s[0], s[1], s[2], a); d.st.look = 0; }, [spot, ang]); await p.waitForTimeout(400);
      r.push(await p.evaluate(() => new Promise(res => { const d = window.__doom; let n = 0, tot = 0, thr = 0, t0 = performance.now(), frames = 0;
        (function g(t) { tot += d.perf.total; thr += d.perf.thread; n++; if (t - t0 < 1500) requestAnimationFrame(g); else { d.perfStats(); res({ tot: tot / n, thr: thr / n, fps: d.PERF.s.imgFps, active: d.PERF ? d.cfg.threads.workers : 0 }); } })(t0); })));
    }
    const avg = k => r.reduce((a, m) => a + m[k], 0) / r.length;
    const w = await p.evaluate(() => { const d = window.__doom; return [d.engine, JSON.stringify(d.EFF)]; });
    console.log(`RT${rt} hilos=${nw}: hilo principal ${f(avg('tot'))} ms · hilos ${f(avg('thr'))} ms · imágenes nuevas por segundo ${f(avg('fps'))}`);
    await p.locator('#view').screenshot({ path: path.join(OUTD, `wk_rt${rt}_${nw}.png`) });
  }
  console.log('activos al final:', await p.evaluate(() => window.__doom.cfg.threads.workers), 'errores', errs.filter(e => !e.includes('TUNNEL') && !e.includes('WebGPU Context') && !e.includes('willReadFrequently')));
  await b.close();
})();
