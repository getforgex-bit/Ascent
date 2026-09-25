// Banco de pruebas determinista: misma semilla de Math.random => mismo mundo y misma escena.
// Uso: node ab.js <archivo.html> [calidades] [modosRT] [motor]
const { chromium } = require('playwright');
const path = require('path'), ROOT = path.resolve(__dirname, '..');
const OUTD = path.join(__dirname, 'salida'); require('fs').mkdirSync(OUTD, { recursive: true });
const FILE = process.argv[2], QS = (process.argv[3] || '2').split(',').map(Number), RTS = (process.argv[4] || '0,1,2,3').split(',').map(Number), ENG = process.argv[5] || 'rust';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((SEED) => { let s = SEED; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; try { localStorage.clear(); } catch (_) {} }, +(process.env.SEED || 20260924));
  await p.goto('file://' + FILE); await p.waitForTimeout(1500);
  await p.keyboard.press('KeyC'); await p.waitForTimeout(200);
  const spot = await p.evaluate(() => { const d = window.__doom; d.st.skullT = 999; if (typeof d.cfg.perf === 'object') d.cfg.perf.auto = false; else d.cfg.auto = false;
    const L = d.lights; let best = null, bn = -1;
    for (const s of d.ships) { const n = L.filter(l => l.x > s.x0 && l.x < s.x0 + s.w && l.y > s.y0 && l.y < s.y0 + s.h).length; if (n > bn) { bn = n; best = s; } }
    const s = best, cand = [];
    for (let y = s.y0 + 1; y < s.y0 + s.h - 1; y++) for (let x = s.x0 + 1; x < s.x0 + s.w - 1; x++) { const c = d.cells[y * d.MW + x] || [];
      if (c.find(b => Math.abs(b.zt - s.zf) < .01 && b.tex !== 7) && !c.find(b => b.zb >= s.zf - .01 && b.zb < s.zf + 1.5 && b.zt > s.zf + .5)) cand.push([x + .5, y + .5, L.filter(l => Math.hypot(l.x - x, l.y - y) < 6).length]); }
    cand.sort((a, b) => b[2] - a[2]); const c = cand[0]; return [c[0], c[1], s.zf, c[2], s.name]; });
  console.log('escena', JSON.stringify(spot), 'motor', ENG);
  await p.evaluate(e => { const d = window.__doom; if (d.setBackend) d.setBackend(e); else if (d.setEngine) d.setEngine(e); }, ENG);
  // congelar enemigos y el tiempo de parpadeo no es posible sin tocar el juego: se miden 4 direcciones fijas
  const measure = () => p.evaluate(() => new Promise(r => { const d = window.__doom; const acc = { world: 0, light: 0, comp: 0, total: 0, rays: 0 }; let n = 0; let l = performance.now(), t0 = l;
    (function f(t) { const P = d.perf; for (const k in acc) acc[k] += P[k] || 0; n++; if (t - t0 < 1500) requestAnimationFrame(f); else { for (const k in acc) acc[k] = acc[k] / n; r(acc); } })(l); }));
  const Q = ['BAJA', 'MEDIA', 'ALTA', 'ULTRA'], f = v => v.toFixed(1);
  for (const q of QS) for (const rt of RTS) {
    await p.evaluate(([q, rt]) => { const d = window.__doom; d.setQuality(q); if (typeof d.cfg.rt === 'object') d.cfg.rt.mode = rt; else d.cfg.rt = rt; }, [q, rt]);
    const res = [];
    for (const ang of [0, 1.57, 3.14, 4.71]) {
      await p.evaluate(([s, a]) => { const d = window.__doom; d.tp(s[0], s[1], s[2], a); d.st.health = 100; d.st.look = 0; }, [spot, ang]); await p.waitForTimeout(350);
      res.push(await measure());
    }
    const avg = k => res.reduce((a, m) => a + m[k], 0) / res.length, worst = res.reduce((a, m) => m.total > a.total ? m : a);
    console.log(`${Q[q].padEnd(5)} RT${rt}  total medio ${f(avg('total'))} ms (${Math.round(1000 / avg('total'))} fps) · peor ${f(worst.total)} ms (${Math.round(1000 / worst.total)} fps) | mundo ${f(avg('world'))} · luz ${f(avg('light'))} · comp ${f(avg('comp'))} · rayos ${Math.round(avg('rays'))}`);
  }
  console.log('errores', errs); await b.close();
})();
