  // ================= CONSTANTES =================
  const W = 960, H = 600, T = 128, TM = T - 1, NL = 16;
  const FOV = Math.PI / 3, PL = Math.tan(FOV / 2), TAU = Math.PI * 2;
  let MAXD = 40;
  const MOVE = 3.4, ROT = 2.4, MSENS = 0.0025, GRAV = 20, JUMP = 7.2, PAD = 17, EYE = 0.6, CH = 2.3;
  const LOOK_MAX = 1.54, LOOK_SHEAR = .93, LOOK_3D_IN = .52, LOOK_3D_OUT = .46, MW = 532, MH = 532, C = 266, R_MAX = 150, R_EXPLORE = 260, FOG = [14, 8, 28], SLOTS = 6, FALL_LOCK = 33, FALL_DMG = 20;

  const view = document.getElementById('view');
  let ctx = view.getContext('2d');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cl = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const rgb = (r, g, b) => (255 << 24) | (cl(b) << 16) | (cl(g) << 8) | cl(r);
  const BLACK = rgb(0, 0, 0), BLACKU = BLACK >>> 0; // los Uint32Array devuelven el valor sin signo
  const rnd = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.random() * a.length | 0];
  const wpick = pairs => { let r = Math.random() * pairs.reduce((a, p) => a + p[1], 0); for (const p of pairs) if ((r -= p[1]) <= 0) return p; return pairs[pairs.length - 1]; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const fogMix = (c, l) => { const t = Math.min(1, l / (NL - 1)), f = 1 - t * .55; return [c[0] * f * (1 - t) + FOG[0] * t, c[1] * f * (1 - t) + FOG[1] * t, c[2] * f * (1 - t) + FOG[2] * t]; };

