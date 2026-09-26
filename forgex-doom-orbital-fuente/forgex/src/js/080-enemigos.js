  // ================= ENEMIGOS =================
  function stepEnemy(e, dt) { // devuelve true si la criatura terminó de desaparecer
    const camZ = st.pz + EYE, chest = st.pz + .5;
    if (e.dead) { // animación de muerte; calaveras y cacodemonios caen y desaparecen
      e.deadT = (e.deadT || 0) + dt;
      if (e.type !== 'imp') { e.z -= (e.type === 'caco' ? 2.5 : 1.5) * e.deadT * dt; if (e.deadT > .55) return true; }
      return false;
    }
    e.hurt = Math.max(0, e.hurt - dt);
    const ex = st.px - e.x, ey = st.py - e.y, d = Math.hypot(ex, ey), d3 = Math.hypot(ex, ey, chest - e.z);
    if (d3 > 28) return false;
    const eyeZ = e.type === 'imp' ? e.z + .7 : e.z;
    const sees = d3 < 16 && clearPath(e.x, e.y, eyeZ, st.px, st.py, camZ);
    const v = volAt(e.x, e.y, e.z);
    if (e.type === 'imp') {
      e.moving = false;
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) { const tz = chest - eyeZ, L = Math.hypot(ex, ey, tz) || 1, sp = 7.5; SFX.toss(v);
          st.proj.push({ x: e.x, y: e.y, z: eyeZ, vx: ex / L * sp, vy: ey / L * sp, vz: tz / L * sp, life: 4, dmg: 12, kind: 'fire' }); }
      } else if (sees) {
        if (d > 2.2 && e.hurt <= 0) {
          const s = 1.3 * dt, nx = e.x + ex / d * s, ny = e.y + ey / d * s, leash = Math.hypot(nx - e.hx, ny - e.hy) < 6;
          if (leash && floorAt(nx + Math.sign(ex) * .3, e.y, e.z)) { e.x = nx; e.moving = true; }
          if (leash && floorAt(e.x, ny + Math.sign(ey) * .3, e.z)) { e.y = ny; e.moving = true; }
        }
        e.cd -= dt;
        if (e.cd <= 0) { e.wind = .65; e.cd = rnd(2.2, 3.6); SFX.impWind(v); }
      }
    } else if (e.type === 'skull') {
      e.t -= dt;
      const tx = st.px - e.x, ty = st.py - e.y, tz = chest + .2 - e.z, L = Math.hypot(tx, ty, tz) || 1;
      const move = (vx, vy, vz) => { const nx = e.x + vx * dt, ny = e.y + vy * dt, nz = e.z + vz * dt;
        if (solidAt(nx, ny, nz)) return false; e.x = nx; e.y = ny; e.z = nz; return true; };
      if (e.state === 'idle') { e.z += Math.sin(time * 2 + e.ph) * .2 * dt; if (sees && d3 < 14) { e.state = 'approach'; SFX.skullTele(v * .5); } }
      else if (e.state === 'approach') {
        e.lost = sees ? 0 : e.lost + dt; if (e.lost > 3) e.state = 'idle';
        if (L > 4.8) move(tx / L * 3.2, ty / L * 3.2, tz / L * 3.2); else if (sees) { e.state = 'tele'; e.t = .55; SFX.skullTele(v); }
      } else if (e.state === 'tele') {
        if (e.t <= 0) { e.state = 'dash'; e.t = .6; e.hit = false; e.dx = tx / L; e.dy = ty / L; e.dz = tz / L; SFX.skullDash(v); }
      } else if (e.state === 'dash') {
        if (!move(e.dx * 11, e.dy * 11, e.dz * 11)) { e.state = 'stun'; e.t = 1; }
        if (!e.hit && Math.hypot(st.px - e.x, st.py - e.y, chest - e.z) < .75) {
          e.hit = true;
          if (st.shieldT > 0) { SFX.block(); burst(e.x, e.y, e.z, 16, [rgb(95, 242, 230), rgb(255, 255, 255)], 2.5); e.state = 'stun'; e.t = 1.3; damageEnemy(e, 1); }
          else { hurtPlayer(15, e.dx * 7, e.dy * 7, 3.5); e.state = 'recover'; e.t = 1.2; }
        }
        if (e.t <= 0 && e.state === 'dash') { e.state = 'recover'; e.t = 1.2; }
      } else { // recover / stun
        if (e.state === 'recover') move(-tx / L * 1.5, -ty / L * 1.5, .6);
        if (e.t <= 0) e.state = sees ? 'approach' : 'idle';
      }
    } else { // caco
      const want = d > 7.5 ? 1 : d < 5.5 ? -1 : 0, s = .9 * dt;
      const nx = e.x + ex / (d || 1) * s * want, ny = e.y + ey / (d || 1) * s * want, nz = e.z + clamp(st.pz + 1.6 - e.z, -1, 1) * .8 * dt;
      if (sees && !solidAt(nx, ny, nz) && !solidAt(nx, ny, nz + .7) && !solidAt(nx, ny, nz - .7)) { e.x = nx; e.y = ny; e.z = nz; }
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) {
          const base = Math.atan2(ey, ex), tz = chest - e.z;
          for (const off of [-.22, 0, .22]) { const a = base + off, L = Math.hypot(d, tz) || 1, sp = 5;
            st.proj.push({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * d / L * sp, vy: Math.sin(a) * d / L * sp, vz: tz / L * sp, life: 5, dmg: 10, kind: 'plasma' }); }
        }
      } else if (sees) { e.cd -= dt; if (e.cd <= 0) { e.wind = .9; e.cd = rnd(3, 4.5); SFX.cacoTele(v); } }
    }
    return false;
  }
  // LOD de simulación: las criaturas cercanas o en pleno ataque se actualizan en cada paso de simulación;
  // las que están a media distancia y tranquilas acumulan su tiempo y se actualizan a la frecuencia de la
  // «IA lejana». Más allá de 28 m ya estaban congeladas (solo se enfrían sus golpes recibidos).
  function updateEnemies(dt) {
    const C_ = PERF.c, lod = CFG.perf.lod, farDt = 1 / CFG.perf.aiHz, chest = st.pz + .5;
    C_.aiFull = C_.aiLod = C_.aiFrozen = 0;
    let gone = false;
    for (const e of st.enemies) {
      let edt = dt;
      if (!e.dead) {
        const d3 = Math.hypot(st.px - e.x, st.py - e.y, chest - e.z);
        const busy = e.wind > 0 || e.hurt > 0 || (e.type === 'skull' && e.state !== 'idle');
        if (d3 > 28) C_.aiFrozen++;
        else if (lod && !busy && d3 > 12) { C_.aiLod++; e.lodAcc = (e.lodAcc || 0) + dt; if (e.lodAcc < farDt) continue; edt = e.lodAcc; e.lodAcc = 0; }
        else { C_.aiFull++; if (e.lodAcc) { edt += e.lodAcc; e.lodAcc = 0; } }
      }
      if (stepEnemy(e, edt)) gone = true;
    }
    if (gone) st.enemies = st.enemies.filter(e => !(e.dead && e.type !== 'imp' && e.deadT > .55));
    // calaveras que llegan desde el vacío
    st.skullT -= dt;
    if (st.skullT <= 0) {
      st.skullT = rnd(22, 40) * Math.max(.45, 1 - st.pz / 150);
      if (st.pz > 4 && st.enemies.filter(e => e.type === 'skull').length < 3) {
        const a = rnd(0, TAU), r = rnd(9, 12), x = clamp(st.px + Math.cos(a) * r, 1, MW - 2), y = clamp(st.py + Math.sin(a) * r, 1, MH - 2), z = st.pz + rnd(-1, 3);
        if (!solidAt(x, y, z)) { spawn('skull', x, y, z); SFX.distant(); }
      }
    }
  }
  function updateProjectiles(dt) {
    const chest = st.pz + .5;
    for (const b of st.proj) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      if (Math.random() < .6) { const vx = rnd(-.2, .2), vy = rnd(-.2, .2), vz = rnd(0, .4);
        addPart(b.x, b.y, b.z, vx, vy, vz, .35, b.kind === 'fire' ? (Math.random() < .5 ? rgb(255, 140, 30) : rgb(255, 60, 10)) : rgb(200, 120, 255)); }
      if (solidAt(b.x, b.y, b.z)) { b.life = 0; burst(b.x, b.y, b.z, 12, [rgb(255, 180, 60), rgb(255, 90, 20)], 2); continue; }
      if (Math.hypot(b.x - st.px, b.y - st.py, b.z - chest) < .6) {
        b.life = 0;
        if (st.shieldT > 0) { SFX.block(); burst(b.x, b.y, b.z, 16, [rgb(95, 242, 230), rgb(255, 255, 255)], 2.5); }
        else hurtPlayer(b.dmg, b.vx * .25, b.vy * .25, 0);
      }
    }
    { let out = 0; for (let i = 0; i < st.proj.length; i++) if (st.proj[i].life > 0) st.proj[out++] = st.proj[i]; st.proj.length = out; }
  }
  function updateItems(dt) {
    for (const it of st.items) {
      if (it.ground) continue;
      it.vz -= GRAV * dt;
      const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt, nz = it.z + it.vz * dt;
      if (!solidAt(nx, ny, it.z + .1)) { it.x = nx; it.y = ny; } else { it.vx = it.vy = 0; }
      const c = cellAt(it.x, it.y); let landed = false;
      if (c && it.vz <= 0) for (const b of c) if (b.zt <= it.z + .05 && b.zt >= nz) { it.z = b.zt; it.ground = true; it.vx = it.vy = it.vz = 0; landed = true; break; }
      if (!landed) it.z = nz;
    }
    let near = null, nd = 1.25;
    for (const it of st.items) { if ((it.kind === 'crate' && it.open) || it.kind === 'beacon') continue;
      const d = Math.hypot(it.x - st.px, it.y - st.py); if (d < nd && Math.abs(it.z - st.pz) < 1.2) { nd = d; near = it; } }
    st.near = near;
  }

