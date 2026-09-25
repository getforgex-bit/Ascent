  // ================= ENTIDADES =================
  function spawn(type, x, y, z) {
    st.enemies.push({ type, x, y, z, hx: x, hy: y, hz: z, hp: type === 'imp' ? 3 : type === 'skull' ? 2 : 8, cd: rnd(1.5, 3.5), wind: 0, hurt: 0,
      dead: false, ph: rnd(0, 6), state: 'idle', t: 0, dx: 0, dy: 0, dz: 0, hit: false, moving: false, lost: 0 });
  }
  function addItem(kind, x, y, z, extra = {}) { st.items.push(Object.assign({ kind, x, y, z, vx: 0, vy: 0, vz: 0, ground: false }, extra, { kind })); }
  // Partículas: pool fijo en estructura de arrays (SoA). No crea objetos por partícula ni basura por fotograma;
  // al morir una partícula, la última ocupa su hueco. Si el pool se llena, las nuevas se descartan.
  const PARTS = { cap: 3072, n: 0, x: new Float32Array(3072), y: new Float32Array(3072), z: new Float32Array(3072),
    vx: new Float32Array(3072), vy: new Float32Array(3072), vz: new Float32Array(3072), life: new Float32Array(3072), c: new Uint32Array(3072), seq: 0 };
  // Densidad de partículas (opción gráfica): se descartan de forma determinista para no alterar la secuencia
  // de números aleatorios del juego (el mundo se genera con la misma secuencia que antes).
  const PART_KEEP = [3, 6, 10]; // de cada 10 se conservan…
  function addPart(x, y, z, vx, vy, vz, life, c) {
    const P = PARTS; P.seq = (P.seq + 1) % 10;
    if (P.seq >= PART_KEEP[EFF.parts] || P.n >= P.cap) return;
    const i = P.n++; P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.c[i] = c;
  }
  function updateParts(dt) {
    const P = PARTS, g = 4 * dt;
    for (let i = 0; i < P.n; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) { const j = --P.n; if (i < j) { P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.z[i] = P.z[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.vz[i] = P.vz[j]; P.life[i] = P.life[j]; P.c[i] = P.c[j]; i--; } continue; }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt; P.vz[i] -= g;
    }
  }
  function burst(x, y, z, n, cols, sp) {
    if (n >= 12 && st.flashes.length < 14) { const c0 = cols[0]; st.flashes.push({ x, y, z, r: (c0 & 255) / 255, g: ((c0 >> 8) & 255) / 255, b: ((c0 >> 16) & 255) / 255, rad: 2.4 + n / 18, int: 1.5, life: .3, max: .3 }); }
    for (let i = 0; i < n; i++) { const vx = rnd(-sp, sp), vy = rnd(-sp, sp), vz = rnd(-sp * .3, sp * 1.2), life = rnd(.3, .8); addPart(x, y, z, vx, vy, vz, life, cols[Math.random() * cols.length | 0]); }
  }
  const msg = (text, col = '#e6e2f5') => { st.msgs.push({ text, col, t: 4 }); if (st.msgs.length > 4) st.msgs.shift(); };

