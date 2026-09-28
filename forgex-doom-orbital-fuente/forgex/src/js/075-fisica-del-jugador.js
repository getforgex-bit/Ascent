  // ================= FÍSICA DEL JUGADOR =================
  const REGEN_RESET = 15;
  function regenStep(n) { let a = .2, b = .3; if (n === 0) return .1; if (n === 1) return .2; for (let k = 2; k < n; k++) [a, b] = [b, +(a + b).toFixed(4)]; return b; }

  // Vuelta al punto seguro: al centro de la superficie donde estaba (lejos del borde, ver safeSpot), mirando un poco
  // hacia abajo para ver dónde se está de pie.
  const RESPAWN_LOOK = -.3;
  function respawnSafe() {
    const s = safeSpot(st.cp[0], st.cp[1], st.cp[2]);
    st.px = st.cp[0] = s[0]; st.py = st.cp[1] = s[1]; st.pz = st.cp[2] = s[2];
    st.vz = 0; st.kx = st.ky = 0; st.look = RESPAWN_LOOK;
  }

  function physics(dt) {
    // (la cámara se gira en applyLook, una vez por fotograma)
    const dx = Math.cos(st.pa), dy = Math.sin(st.pa);
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const mx = (dx * fwd - dy * str) * MOVE * dt + st.kx * dt, my = (dy * fwd + dx * str) * MOVE * dt + st.ky * dt;
    const kd = Math.exp((st.ground ? -7 : -1.1) * dt); st.kx *= kd; st.ky *= kd;
    if (mx) { if (!blocked(st.px + mx + (mx > 0 ? .2 : -.2), st.py, st.pz)) st.px += mx; else st.kx = 0; }
    if (my) { if (!blocked(st.px, st.py + my + (my > 0 ? .2 : -.2), st.pz)) st.py += my; else st.ky = 0; }
    { // pared invisible: radio límite de exploración
      const ex = st.px - C, ey = st.py - C, rr = Math.hypot(ex, ey);
      if (rr > R_EXPLORE) { st.px = C + ex / rr * R_EXPLORE; st.py = C + ey / rr * R_EXPLORE; st.kx = st.ky = 0;
        if (!st.wallT || time - st.wallT > 4) { st.wallT = time; msg('Una fuerza invisible te impide ir más lejos.', '#d59aff'); } } }
    const moving = fwd || str;
    if (moving && st.ground) st.bob += dt * 10;
    if (jumpReq && st.jumps < 2) { st.vz = JUMP * st.jumpMul; st.jumps++; st.ground = false; if (st.jumps === 2) burst(st.px, st.py, st.pz, 10, [rgb(95, 242, 230), rgb(200, 255, 255)], 1.5); }
    jumpReq = false;
    const vzOld = st.vz; st.vz -= GRAV * dt;
    let nz = st.pz + st.vz * dt;
    const c = cellAt(st.px, st.py); st.ground = false;
    if (c) {
      let land = null;
      if (st.vz <= 0) for (const b of c) if (st.pz >= b.zt - .35 && nz <= b.zt && (!land || b.zt > land.zt)) land = b;
      if (land) {
        nz = land.zt; st.vz = 0; st.ground = true; st.jumps = 0;
        if (vzOld < -6) st.land = Math.min(1, -vzOld / 20);
        if (land.pad) { st.vz = land.pad * st.jumpMul; st.ground = false; st.jumps = 1; SFX.pad(); burst(st.px, st.py, land.zt, 24, [rgb(95, 242, 230), rgb(180, 255, 250), rgb(255, 255, 255)], 2.5); }
        else if (land.acid) { st.hp -= 12 * dt; if (Math.random() < dt * 4) st.dmg = Math.max(st.dmg, .15); if (st.hp <= 0) die(); }
        else {
          if (land.zt > st.cp[2] + .2) { st.cpFlash = 1.2; SFX.checkpoint(); }
          st.cp[0] = st.px; st.cp[1] = st.py; st.cp[2] = land.zt;
        }
        if (land.route && land.zt > st.top) st.top = land.zt;
      } else if (st.vz > 0) for (const b of c) if (st.pz + .9 <= b.zb && nz + .9 > b.zb) { nz = b.zb - .9; st.vz = 0; }
    }
    st.pz = nz;
    // anti-atasco: si el cuerpo quedó dentro de un bloque, volver al último punto seguro sin castigo
    if (solidAt(st.px, st.py, st.pz + .5)) { st.stuck = (st.stuck || 0) + dt;
      if (st.stuck > .4) { respawnSafe(); st.stuck = 0; msg('Te atascaste: vuelves al último punto seguro.', '#ffb347'); } }
    else st.stuck = 0;
    // caída al vacío: daño, vuelta al punto seguro y curación bloqueada
    if (st.pz < st.cp[2] - 14) {
      respawnSafe(); st.healLock = FALL_LOCK; SFX.fall(); directorNote('fall');
      msg(`Caíste al vacío: −${FALL_DMG} de vida. Curación bloqueada ${FALL_LOCK} s.`, '#ff8a7a');
      hurtPlayer(FALL_DMG); st.dmg = .6;
    }
    // curación: solo quieto, en el suelo y sin disparar
    const still = !moving && st.ground && st.cd <= 0 && !fireHeld;
    st.still = still ? st.still + dt : 0;
    st.healLock = Math.max(0, st.healLock - dt);
    const canHeal = still && st.reserve >= 1 && st.hp < st.maxHp && st.healLock <= 0;
    st.healing = canHeal;
    const give = () => { const a = Math.min(1, st.maxHp - st.hp, st.reserve); if (a <= 0) return false; st.hp += a; st.reserve -= a; return true; };
    if (canHeal) {
      if (st.regenPend > 0) {
        st.regenDrip += dt;
        while (st.regenDrip >= .02 && st.regenPend > 0) { st.regenDrip -= .02; st.regenPend--; if (!give()) { st.regenPend = 0; break; } }
        if (st.regenPend === 0) { st.regenDrip = 0; tone(520, 700, .12, .035); }
      } else {
        st.regenT += dt;
        const need = regenStep(st.regenN);
        if (st.regenT >= need) {
          st.regenT -= need; st.regenN++;
          if (need < 2.1) { give(); tone(520, 700, .12, .035); }   // intervalos cortos: 1 punto
          else { st.regenPend = 6; st.regenDrip = 0; }               // desde 2.1 s: 6 puntos, uno cada 20 ms
        }
      }
    } else if (st.regenN || st.regenT || st.regenPend) {
      st.regenIdle += dt;
      if (st.regenIdle >= REGEN_RESET) { st.regenN = 0; st.regenT = 0; st.regenPend = 0; st.regenIdle = 0; }
    }
  }

