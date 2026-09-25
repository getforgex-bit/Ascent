  // ================= BOTÍN EN DOS CAPAS =================
  // Capa 1: ¿aparece algo en este punto? Depende de la distancia al eje y de la región.
  const BANDS = [[.25, .10, 'CERCANIAS'], [.42, .25, 'PERIFERIA'], [.58, 1 / 3, 'ZONA MEDIA'], [.72, .35, 'ZONA LEJANA'], [.86, .40, 'ZONA REMOTA'], [1, .50, 'LIMITE'], [99, .50, 'FARLANDS']];
  const BAND_COL = ['#9690b8', '#b6c0ff', '#ffd27a', '#ffb347', '#ff8a5a', '#ff4a4a', '#d59aff'];
  const axisT = (x, y) => Math.hypot(x - C, y - C) / R_MAX;
  const bandOf = (x, y) => { const t = axisT(x, y); return BANDS.findIndex(b => t < b[0]); };
  // Regiones (sector angular × franja de altura): cambian qué aparece; algunas son casi estériles (1%).
  const REGION_TYPES = [['normal', .45], ['armeria', .13], ['enfermeria', .12], ['reliquias', .10], ['pobre', .10], ['esteril', .10]];
  const ITEM_W = {
    normal: [['ammo', 38], ['box', 10], ['heal', 16], ['weapon', 9], ['upgrade', 9]],
    armeria: [['ammo', 50], ['box', 20], ['weapon', 18], ['heal', 6], ['upgrade', 6]],
    enfermeria: [['heal', 40], ['ammo', 30], ['box', 10], ['upgrade', 10], ['weapon', 10]],
    reliquias: [['upgrade', 30], ['weapon', 25], ['ammo', 25], ['heal', 10], ['box', 10]],
  };
  function regionAt(x, y, z) {
    const sec = Math.floor(((Math.atan2(y - C, x - C) + Math.PI) / TAU) * 8) % 8, k = Math.floor(z / 30) + ':' + sec;
    if (!gen.regions[k]) gen.regions[k] = wpick(REGION_TYPES)[0];
    return gen.regions[k];
  }
  function chanceAt(x, y, z) {
    const reg = regionAt(x, y, z);
    if (reg === 'esteril') return .01;
    const p = BANDS[bandOf(x, y)][1];
    return reg === 'pobre' ? p * .5 : p;
  }
  // Capa 2: solo si apareció algo, se decide qué es según los pesos de la región.
  function rollType(reg) {
    const kind = wpick(ITEM_W[reg] || ITEM_W.normal)[0];
    if (kind === 'ammo') { const a = wpick([['celdas', 5], ['cartuchos', 3], ['nucleos', 1.5]])[0];
      return { kind, ammo: a, count: a === 'nucleos' ? randi(1, 3) : a === 'cartuchos' ? randi(2, 5) : randi(3, 7) }; }
    if (kind === 'box') return { kind, ammo: pick(['celdas', 'cartuchos', 'nucleos']), count: randi(0, 6) };
    if (kind === 'weapon') return { kind, w: Math.random() < .65 ? 'escopeta' : 'riel' };
    if (kind === 'upgrade') return { kind, up: pick(Object.keys(UPG)) };
    return { kind: 'heal' };
  }
  function contentAt(x, y, z, bonus = 0, bias = null) {
    const reg = regionAt(x, y, z);
    let p = chanceAt(x, y, z); if (bonus && reg !== 'esteril') p = Math.min(.9, p + bonus);
    gen.rolls++;
    if (Math.random() >= p) return null;
    gen.hits++;
    return rollType(bias || reg);
  }
  // Coloca el resultado: a la vista o dentro de un contenedor; a veces deja contenedores vacíos como señuelo
  function placeContent(x, y, z, it, crateChance = .4, decoy = 0) {
    if (!it) { if (Math.random() < decoy) addItem('crate', x, y, z, { content: null, open: false }); return; }
    if (Math.random() < crateChance) addItem('crate', x, y, z, { content: it, open: false });
    else addItem(it.kind, x, y, z, it);
  }
  const rectDistC = r => Math.hypot(Math.max(r.x - C, 0, C - (r.x + r.w)), Math.max(r.y - C, 0, C - (r.y + r.h)));
  const round20 = v => Math.round(v * 20) / 20;
  const OPP = { W: 'E', E: 'W', N: 'S', S: 'N' }, OUT = { W: Math.PI, E: 0, N: -Math.PI / 2, S: Math.PI / 2 };
  const STYLES = [{ name: 'tech', wall: 6, floor: 5, alt: 1, ceil: 4 }, { name: 'metal', wall: 1, floor: 1, alt: 6, ceil: 4 }, { name: 'hell', wall: 2, floor: 5, alt: 2, ceil: 2 }];
  const DUNGEON_NAMES = ['COMPLEJO PHOBOS', 'LABERINTO DE CARNE', 'INSTALACIÓN DEIMOS', 'PLANTA DE RESIDUOS', 'CATACUMBAS ORBITALES', 'CENTRO DE CONTROL',
    'REFINERÍA TÓXICA', 'BASE MILITAR', 'LAS ENTRAÑAS', 'CÁMARA DE CONTENCIÓN', 'ANTENA MUERTA', 'FUNDICIÓN'];
  const HOUSE_NAMES = ['PUESTO DE AVANZADA', 'CABAÑA DE MANTENIMIENTO', 'REFUGIO', 'CASA DEL GUARDIÁN', 'OBSERVATORIO', 'ERMITA', 'ALMACÉN', 'BARRACONES', 'CASETA DE RADIO', 'CLÍNICA'];
  const ROOM_NAMES = { nucleo: 'Sala del núcleo', columnas: 'Salón de columnas', estrado: 'Estrado', infernal: 'Santuario', computo: 'Sala de cómputo',
    dormitorio: 'Dormitorio', almacen: 'Almacén', capilla: 'Capilla', laboratorio: 'Laboratorio', enfermeria: 'Enfermería', sala: 'Sala' };
  // Cada zona puede cambiar QUÉ aparece (segunda capa), nunca SI aparece (primera capa).
  const ZONE_BIAS = { almacen: 'armeria', enfermeria: 'enfermeria', capilla: 'reliquias', estrado: 'reliquias', computo: 'armeria' };
  const grid = (w, h, f) => Array.from({ length: h }, () => Array.from({ length: w }, f));
  const nearDoor = (L, i, j) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const c = L[j + b] && L[j + b][i + a]; if (c && c.t === 'D') return true; } return false; };

  // ---------- MASMORRA: laberinto de pasillos de 2 celdas, con bucles y salas temáticas ----------
  function decorateRoom(L, R, sty, points, spawns, tier) {
    const each = f => { for (let j = R.y; j < R.y + R.h; j++) for (let i = R.x; i < R.x + R.w; i++) f(L[j][i], i, j); };
    const inner = (i, j, m) => i >= R.x + m && i < R.x + R.w - m && j >= R.y + m && j < R.y + R.h - m;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, bias = ZONE_BIAS[R.type] || null;
    if (R.type === 'nucleo') { each((c, i, j) => { if (inner(i, j, 1)) c.acid = true; }); points.push([cx, cy, bias, .1]); }
    else if (R.type === 'columnas') { each((c, i, j) => { if (inner(i, j, 1) && (i - R.x) % 2 === 1 && (j - R.y) % 2 === 1) { c.t = 'W'; c.wt = sty.alt; } }); points.push([R.x + .5, R.y + .5, bias, 0]); }
    else if (R.type === 'estrado') { each((c, i, j) => { if (inner(i, j, 2)) c.fh = .6; else if (inner(i, j, 1)) c.fh = .3; }); points.push([cx, cy, bias, .1]); }
    else if (R.type === 'infernal') { each(c => { c.ft = 2; c.ch = 3.8; c.ct = 2; }); points.push([cx, cy, bias, 0]); }
    else each((c, i, j) => { c.ft = 1; if (R.w >= 5 && R.h >= 5 && (i === R.x + 1 || i === R.x + R.w - 2) && (j === R.y + 1 || j === R.y + R.h - 2)) { c.t = 'W'; c.wt = 6; } });
    points.push([R.x + randi(0, R.w - 1) + .5, R.y + randi(0, R.h - 1) + .5, bias, 0]);
    for (let k = randi(1, 2); k > 0; k--) spawns.push([R.x + randi(0, R.w - 1) + .5, R.y + randi(0, R.h - 1) + .5, 'imp']);
    if (tier >= 1 && Math.random() < .35) spawns.push([cx, cy, 'caco', 1.8]);
  }
  function mazeLayout(nx, ny, sty, tier, mega = false) {
    const Wd = nx * 3 + 1, Hd = ny * 3 + 1;
    const L = grid(Wd, Hd, () => ({ t: 'W', fh: 0, ch: 3.8, ft: sty.floor, wt: sty.wall, ct: sty.ceil, acid: false, prop: 0 }));
    // Megamasmorra: se divide en secciones (cuadrantes) con estilo propio
    const sections = [];
    if (mega) {
      const mx = Math.floor(nx / 2) * 3, my = Math.floor(ny / 2) * 3, names = ['SECCIÓN NORTE', 'SECCIÓN ESTE', 'SECCIÓN OESTE', 'SECCIÓN SUR'];
      [[0, 0, mx, my], [mx, 0, Wd - mx, my], [0, my, mx, Hd - my], [mx, my, Wd - mx, Hd - my]].forEach(([x, y, w, h], q) => {
        const st2 = pick(STYLES);
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) Object.assign(L[j][i], { ft: st2.floor, wt: st2.wall, ct: st2.ceil });
        sections.push({ x, y, w, h, label: names[q] + ' (' + { tech: 'técnica', metal: 'de hierro', hell: 'infernal' }[st2.name] + ')' });
      });
    }
    const open = (i, j, ch = 2.4) => { const c = L[j][i]; c.t = 'F'; c.ch = ch; };
    for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) open(i + 3 * a, j + 3 * b);
    const deg = new Map(), K = (a, b) => a + ',' + b;
    const link = (a, b, c, d) => {
      if (c !== a) { const x = 3 * Math.max(a, c); for (const y of [1 + 3 * b, 2 + 3 * b]) open(x, y); }
      else { const y = 3 * Math.max(b, d); for (const x of [1 + 3 * a, 2 + 3 * a]) open(x, y); }
      deg.set(K(a, b), (deg.get(K(a, b)) || 0) + 1); deg.set(K(c, d), (deg.get(K(c, d)) || 0) + 1);
    };
    const seen = new Set([K(0, 0)]), stack = [[0, 0]];
    while (stack.length) {
      const [a, b] = stack[stack.length - 1];
      const nb = [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]].filter(([c, d]) => c >= 0 && d >= 0 && c < nx && d < ny && !seen.has(K(c, d)));
      if (!nb.length) { stack.pop(); continue; }
      const [c, d] = pick(nb); link(a, b, c, d); seen.add(K(c, d)); stack.push([c, d]);
    }
    for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) { // bucles: "casi" laberinto
      if (a + 1 < nx && L[1 + 3 * b][3 * (a + 1)].t === 'W' && Math.random() < (mega ? .16 : .12)) link(a, b, a + 1, b);
      if (b + 1 < ny && L[3 * (b + 1)][1 + 3 * a].t === 'W' && Math.random() < (mega ? .16 : .12)) link(a, b, a, b + 1);
    }
    const inRoom = new Set(), rooms = [], points = [], spawns = [], nodes = [];
    for (let k = mega ? randi(3, 3 + Math.floor(nx * ny / 12)) : randi(1, 1 + Math.floor(nx * ny / 9)), tries = 0; k > 0 && tries < (mega ? 80 : 24); tries++) {
      const hub = mega && !rooms.length; // gran salón central
      const rw = hub ? 3 : randi(2, 3), rh = hub ? 3 : randi(2, 3), a0 = hub ? (nx - 3) >> 1 : randi(0, nx - rw), b0 = hub ? (ny - 3) >> 1 : randi(0, ny - rh);
      let clash = false; for (let b = b0; b < b0 + rh; b++) for (let a = a0; a < a0 + rw; a++) if (inRoom.has(K(a, b))) clash = true;
      if (clash) continue; k--;
      for (let b = b0; b < b0 + rh; b++) for (let a = a0; a < a0 + rw; a++) inRoom.add(K(a, b));
      const R = { x: 1 + 3 * a0, y: 1 + 3 * b0, w: 3 * rw - 1, h: 3 * rh - 1, type: pick(['nucleo', 'columnas', 'estrado', 'infernal', 'computo']) };
      for (let j = R.y; j < R.y + R.h; j++) for (let i = R.x; i < R.x + R.w; i++) open(i, j, 3.2);
      decorateRoom(L, R, sty, points, spawns, tier); rooms.push(R);
    }
    for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) if (!inRoom.has(K(a, b))) {
      nodes.push([2 + 3 * a, 2 + 3 * b]);
      if ((deg.get(K(a, b)) || 0) === 1) points.push([2 + 3 * a, 2 + 3 * b, null, .08]); // callejones sin salida
      else if (Math.random() < .12) spawns.push([2 + 3 * a, 2 + 3 * b, 'imp']);
    }
    return { L, Wd, Hd, rooms, points, spawns, sections, nodes };
  }

  // ---------- ESTRUCTURA: casa o edificio con zonas propias ----------
  function decorateZone(L, Z, sty, points, spawns, tier) {
    const cellsZ = []; for (let j = Z.y; j < Z.y + Z.h; j++) for (let i = Z.x; i < Z.x + Z.w; i++) cellsZ.push([i, j]);
    const freeC = cellsZ.filter(([i, j]) => !nearDoor(L, i, j));
    const takeC = () => freeC.length ? freeC.splice(Math.random() * freeC.length | 0, 1)[0] : null;
    const bias = ZONE_BIAS[Z.type] || null, big = Z.w >= 4 && Z.h >= 4, each = f => cellsZ.forEach(([i, j]) => f(L[j][i], i, j));
    if (Z.type === 'dormitorio' && big) for (let k = 0; k < 2; k++) { const c = takeC(); if (c) L[c[1]][c[0]].prop = .45; }
    if (Z.type === 'almacen' && big) for (let k = randi(2, 4); k > 0; k--) { const c = takeC(); if (c) L[c[1]][c[0]].prop = pick([.7, 1.1]); }
    if (Z.type === 'capilla') { each(c => { c.ft = 2; c.ch = 3.2; c.ct = 2; }); if (big) for (let i = Z.x + 1; i < Z.x + Z.w - 1; i++) L[Z.y + Z.h - 1][i].fh = .35; }
    if (Z.type === 'laboratorio') { each(c => { c.ft = 1; }); if (Z.w >= 5 && Z.h >= 5) Object.assign(L[Z.y + (Z.h >> 1)][Z.x + (Z.w >> 1)], { t: 'W', wt: 6 }); }
    for (let k = Z.type === 'almacen' ? 3 : randi(1, 2); k > 0; k--) { const c = takeC(); if (c) points.push([c[0] + .5, c[1] + .5, bias, 0]); }
    if (Math.random() < .4) { const c = takeC(); if (c) spawns.push([c[0] + .5, c[1] + .5, 'imp']); }
    if (Z.type === 'capilla' && tier >= 1 && Math.random() < .3) spawns.push([Z.x + Z.w / 2, Z.y + Z.h / 2, 'caco', 1.9]);
  }
  function houseLayout(Wd, Hd, sty, tier) {
    const L = grid(Wd, Hd, () => ({ t: 'F', fh: 0, ch: 2.6, ft: sty.floor, wt: sty.wall, ct: sty.ceil, acid: false, prop: 0 }));
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) if (i === 0 || j === 0 || i === Wd - 1 || j === Hd - 1) Object.assign(L[j][i], { t: 'W', ch: 3.2 });
    const zones = [{ x: 1, y: 1, w: Wd - 2, h: Hd - 2 }];
    for (let k = randi(0, 3); k > 0; k--) { // tabiques con vano de 2 celdas
      zones.sort((a, b) => b.w * b.h - a.w * a.h); const z = zones[0];
      const vert = z.w >= 7 && (z.w >= z.h || z.h < 7), hor = !vert && z.h >= 7;
      if (!vert && !hor) break;
      if (vert) { const sx = z.x + randi(3, z.w - 4), dy = randi(z.y, z.y + z.h - 2);
        for (let j = z.y; j < z.y + z.h; j++) Object.assign(L[j][sx], { t: j === dy || j === dy + 1 ? 'D' : 'W', ch: 3.2 });
        zones.splice(0, 1, { x: z.x, y: z.y, w: sx - z.x, h: z.h }, { x: sx + 1, y: z.y, w: z.x + z.w - sx - 1, h: z.h }); }
      else { const sy = z.y + randi(3, z.h - 4), dx = randi(z.x, z.x + z.w - 2);
        for (let i = z.x; i < z.x + z.w; i++) Object.assign(L[sy][i], { t: i === dx || i === dx + 1 ? 'D' : 'W', ch: 3.2 });
        zones.splice(0, 1, { x: z.x, y: z.y, w: z.w, h: sy - z.y }, { x: z.x, y: sy + 1, w: z.w, h: z.y + z.h - sy - 1 }); }
    }
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
      const edge = i === 0 || j === 0 || i === Wd - 1 || j === Hd - 1, corner = (i === 0 || i === Wd - 1) && (j === 0 || j === Hd - 1);
      if (edge && !corner && Math.random() < .22) L[j][i].t = 'N';
    }
    const points = [], spawns = [];
    for (const z of zones) { z.type = pick(['dormitorio', 'almacen', 'capilla', 'laboratorio', 'enfermeria', 'sala']); decorateZone(L, z, sty, points, spawns, tier); }
    return { L, Wd, Hd, rooms: zones, points, spawns };
  }

  // ---------- Colocación y compilación de edificios ----------
  function chooseDoor(lay, side, pref) {
    const { L, Wd, Hd } = lay, c = [];
    const ok = (i, j) => L[j][i].t === 'F' && L[j][i].fh === 0 && !L[j][i].prop && !L[j][i].acid;
    if (side === 'W' || side === 'E') { const x = side === 'W' ? 0 : Wd - 1, xi = side === 'W' ? 1 : Wd - 2;
      for (let y = 1; y < Hd - 2; y++) if (L[y][x].t === 'W' && L[y + 1][x].t === 'W' && ok(xi, y) && ok(xi, y + 1)) c.push([[x, y], [x, y + 1], y + 1]); }
    else { const y = side === 'N' ? 0 : Hd - 1, yi = side === 'N' ? 1 : Hd - 2;
      for (let x = 1; x < Wd - 2; x++) if (L[y][x].t === 'W' && L[y][x + 1].t === 'W' && ok(x, yi) && ok(x + 1, yi)) c.push([[x, y], [x + 1, y], x + 1]); }
    if (!c.length) return null;
    if (pref == null) return pick(c).slice(0, 2);
    c.sort((a, b) => Math.abs(a[2] - pref) - Math.abs(b[2] - pref));
    return c[0].slice(0, 2);
  }
  function finFor(door, side, x0, y0, Wd, Hd) {
    const [dx, dy] = door[0];
    if (side === 'W') return { x: x0 - 2, y: y0 + dy, w: 2, h: 2 };
    if (side === 'E') return { x: x0 + Wd, y: y0 + dy, w: 2, h: 2 };
    if (side === 'N') return { x: x0 + dx, y: y0 - 2, w: 2, h: 2 };
    return { x: x0 + dx, y: y0 + Hd, w: 2, h: 2 };
  }
  function siteFor(P, hd, Wd, Hd, far) {
    const pcx = P.x + P.w / 2, pcy = P.y + P.h / 2, ux = Math.cos(hd), uy = Math.sin(hd), zf = round20(P.zt + rnd(-.3, .5));
    const hf = Math.abs(ux) >= Math.abs(uy);
    for (const horiz of [hf, !hf]) for (const gap of far ? [4, 6, 8, 10, 12, 14] : [randi(3, 5)]) for (const off of far ? [0, -4, 4, -8, 8] : [rnd(-2, 2)]) {
      const sgn = Math.sign(horiz ? ux : uy) || 1;
      let x0, y0, side;
      if (horiz) { const wx = sgn > 0 ? P.x + P.w + gap : P.x - 1 - gap; x0 = sgn > 0 ? wx : wx - Wd + 1; y0 = Math.round(pcy - Hd / 2 + off); side = sgn > 0 ? 'W' : 'E'; }
      else { const wy = sgn > 0 ? P.y + P.h + gap : P.y - 1 - gap; y0 = sgn > 0 ? wy : wy - Hd + 1; x0 = Math.round(pcx - Wd / 2 + off); side = sgn > 0 ? 'N' : 'S'; }
      if (x0 < 4 || y0 < 4 || x0 + Wd > MW - 4 || y0 + Hd > MH - 4) continue;
      const box = { x: x0, y: y0, w: Wd, h: Hd };
      if (far) { // Farlands: todo el edificio fuera del radio de generación y dentro del radio de exploración
        const farC = Math.max(...[[x0, y0], [x0 + Wd, y0], [x0, y0 + Hd], [x0 + Wd, y0 + Hd]].map(([a, b]) => Math.hypot(a - C, b - C)));
        if (rectDistC(box) <= R_MAX + 1 || farC > R_EXPLORE - 4) continue;
      } else if (Math.hypot(x0 + Wd / 2 - C, y0 + Hd / 2 - C) > R_MAX + 4 || rectDistC(box) < 11) continue;
      if (!clearArea(x0 - 1, y0 - 1, Wd + 2, Hd + 2, zf - 1.3, zf + 4.8)) continue;
      return { x0, y0, zf, side, pref: horiz ? pcy - y0 : pcx - x0 };
    }
    return null;
  }
  function stonesBetween(P, fin) {
    const pcx = P.x + P.w / 2, pcy = P.y + P.h / 2;
    for (let n = 0; n <= 8; n++) {
      const list = [];
      for (let k = 1; k <= n; k++) { const t = k / (n + 1);
        list.push({ x: Math.round(pcx + (fin.x + 1 - pcx) * t - 1), y: Math.round(pcy + (fin.y + 1 - pcy) * t - 1), w: 2, h: 2, zt: round20(P.zt + (fin.zt - P.zt) * t) }); }
      list.push(fin);
      let prev = P, ok = true;
      for (const s of list) { if (overlap(prev, s) || rectGap(prev, s) > 1.8) { ok = false; break; } prev = s; }
      if (ok) return list.every(s => clearArea(s.x, s.y, 2, 2, s.zt - 1.6, s.zt + 2.6)) ? list : null;
    }
    return null;
  }
  function compileLayout(L, x0, y0, zf) {
    const wallAt = (a, b) => { const q = L[b] && L[b][a]; return !!q && (q.t === 'W' || q.t === 'N'); };
    for (let j = 0; j < L.length; j++) for (let i = 0; i < L[0].length; i++) {
      const c = L[j][i], X = x0 + i, Y = y0 + j, ft = zf + c.fh;
      const ao = c.t === 'W' ? 0 : (wallAt(i - 1, j) ? 1 : 0) | (wallAt(i + 1, j) ? 2 : 0) | (wallAt(i, j - 1) ? 4 : 0) | (wallAt(i, j + 1) ? 8 : 0);
      addBlock(X, Y, zf - .5, ft, c.acid ? 7 : c.ft, { ao });
      if (c.t === 'W') addBlock(X, Y, ft, zf + c.ch, c.wt);
      else if (c.t === 'D') addBlock(X, Y, zf + 1.75, zf + c.ch, c.wt);
      else if (c.t === 'N') { addBlock(X, Y, ft, zf + .6, c.wt); addBlock(X, Y, zf + 1.5, zf + c.ch, c.wt); }
      else if (c.prop) addBlock(X, Y, ft, ft + c.prop, 1);
      addBlock(X, Y, zf + c.ch, zf + c.ch + .5, c.ct, { ao });
    }
  }
  // Construye una masmorra ('maze') o una estructura ('house') más allá de la plataforma P
  function placeBuilding(P, hd, kind, tier, opts) {
    const sty = pick(STYLES), mega = kind === 'mega', maze = kind === 'maze' || mega;
    let nx = 0, ny = 0, Wd = 0, Hd = 0, site = null;
    for (let at = 0; at < (mega ? 4 : 3) && !site; at++) { // si no cabe, se intenta una versión más pequeña
      if (mega) { nx = randi([8, 6, 5, 5][at], [11, 8, 7, 6][at]); ny = randi([8, 6, 5, 5][at], [11, 8, 7, 6][at]); }
      else { nx = randi(at ? 3 : 4, at ? 4 : 7); ny = randi(at ? 3 : 4, at ? 4 : 7); }
      Wd = maze ? nx * 3 + 1 : randi(at ? 6 : 7, at ? 8 : 12); Hd = maze ? ny * 3 + 1 : randi(6, at ? 7 : 10);
      site = siteFor(P, hd, Wd, Hd, opts.far);
    }
    if (!site) return null;
    const { x0, y0, zf, side } = site;
    const lay = maze ? mazeLayout(nx, ny, sty, tier, mega) : houseLayout(Wd, Hd, sty, tier);
    const door = chooseDoor(lay, side, site.pref); if (!door) return null;
    const fin = Object.assign(finFor(door, side, x0, y0, Wd, Hd), { zt: zf });
    const stones = stonesBetween(P, fin); if (!stones) return null;
    for (const [i, j] of door) lay.L[j][i].t = 'D';
    let landing = null, outHd = hd;
    const perp = ['N', 'S', 'E', 'W'].filter(q => q !== side && q !== OPP[side]).sort(() => Math.random() - .5);
    if (opts.cont) for (const s of opts.contPerp ? perp : [OPP[side], ...perp]) {
      const d2 = chooseDoor(lay, s, null); if (!d2) continue;
      const Lr = Object.assign(finFor(d2, s, x0, y0, Wd, Hd), { zt: zf });
      if (!clearArea(Lr.x, Lr.y, 2, 2, zf - 1.6, zf + 2.6)) continue;
      for (const [i, j] of d2) lay.L[j][i].t = 'D';
      landing = Lr; outHd = OUT[s]; break;
    }
    const extras = [];
    for (let k = opts.extra || 0; k > 0; k--) { const s = pick(['N', 'S', 'E', 'W']), d3 = chooseDoor(lay, s, null); if (!d3) continue;
      for (const [i, j] of d3) lay.L[j][i].t = 'D'; extras.push([d3, s]); }
    if (!maze && Math.random() < .4) { const s = pick(['N', 'S', 'E', 'W'].filter(q => q !== side)), d4 = chooseDoor(lay, s, null); if (d4) for (const [i, j] of d4) lay.L[j][i].t = 'D'; }
    compileLayout(lay.L, x0, y0, zf);
    const stTex = sty.name === 'hell' ? 2 : 1;
    for (const s of stones) plat(s.x, s.y, 2, 2, s.zt, .4, stTex);
    if (landing) plat(landing.x, landing.y, 2, 2, zf, .4, stTex);
    const at = (li, lj) => { const r = lay.L[Math.floor(lj)]; return r && r[Math.floor(li)]; };
    { // iluminación de salas y pasillos: cada zona tiene su propia luz
      const LCOL = { nucleo: [.35, 1, .35], infernal: [1, .35, .12], capilla: [1, .4, .15], computo: [.4, .75, 1], laboratorio: [.45, .8, 1], estrado: [1, .8, .45], enfermeria: [.75, 1, .9] };
      const baseCol = sty.name === 'hell' ? [1, .45, .2] : sty.name === 'metal' ? [1, .82, .55] : [.7, .85, 1];
      for (const R of lay.rooms) { const col = LCOL[R.type] || baseCol;
        lights.push({ x: x0 + R.x + R.w / 2, y: y0 + R.y + R.h / 2, z: zf + 2.1, r: col[0], g: col[1], b: col[2], rad: Math.max(R.w, R.h) * .6 + 2.4, int: 1.15, flick: Math.random() < .2, ph: rnd(0, 9) }); }
      for (const [li, lj] of lay.nodes || []) if (Math.random() < .3)
        lights.push({ x: x0 + li, y: y0 + lj, z: zf + 1.9, r: baseCol[0], g: baseCol[1], b: baseCol[2], rad: 3.4, int: 1, flick: Math.random() < .35, ph: rnd(0, 9) });
    }
    for (const [li, lj, bias, bonus] of lay.points) { const c = at(li, lj); if (!c || c.t === 'W' || c.prop) continue;
      const wx = x0 + li, wy = y0 + lj, z = zf + c.fh; placeContent(wx, wy, z, contentAt(wx, wy, z, bonus, bias), .5, .3); }
    for (const [li, lj, type, zo] of lay.spawns) { const c = at(li, lj); if (!c || c.t === 'W' || c.prop) continue; spawn(type, x0 + li, y0 + lj, zf + (zo || c.fh)); }
    if (maze && tier >= 1 && Math.random() < .3) spawn('skull', x0 + Wd / 2, y0 + Hd / 2, zf + 1.4);
    const name = (opts.far ? 'FARLANDS · ' : '') + (mega ? 'MEGAMASMORRA · ' : maze ? 'MASMORRA · ' : 'ESTRUCTURA · ') + pick(maze ? DUNGEON_NAMES : HOUSE_NAMES);
    ships.push({ x0, y0, w: Wd, h: Hd, zf, hgt: 3.8, name });
    for (const R of lay.rooms) if (R.type) ships.push({ x0: x0 + R.x, y0: y0 + R.y, w: R.w, h: R.h, zf, hgt: 3.8, name: name + ' · ' + ROOM_NAMES[R.type] });
    for (const S of lay.sections || []) ships.splice(ships.length - lay.rooms.length, 0, { x0: x0 + S.x, y0: y0 + S.y, w: S.w, h: S.h, zf, hgt: 3.8, name: name + ' · ' + S.label });
    gen[mega ? 'megas' : maze ? 'dungeons' : 'houses']++;
    for (const [d3, s] of extras) { // masmorra que conecta estructuras por puentes cortos; si no, la puerta da al vacío
      const Lr = Object.assign(finFor(d3, s, x0, y0, Wd, Hd), { zt: zf });
      if (Math.random() < (mega ? .92 : .65) && (!opts.far || rectDistC(Lr) > R_MAX + 1) && clearArea(Lr.x, Lr.y, 2, 2, zf - 1.6, zf + 2.6)) {
        plat(Lr.x, Lr.y, 2, 2, zf, .4, stTex);
        if (placeBuilding(Lr, OUT[s], 'house', tier, { cont: false, extra: 0, far: opts.far })) gen.linked++;
      }
    }
    return { landing, hd: outHd, len: Math.max(Wd, Hd) + stones.length * 3 };
  }

