  // ================= DAÑO Y MUERTE =================
  function hurtPlayer(n, kx = 0, ky = 0, kz = 0) {
    st.hp -= n; st.dmg = .35; SFX.hurt(); st.kx += kx; st.ky += ky; st.vz += kz; if (kz) st.ground = false;
    directorNote('hurt');
    if (st.hp <= 0) die();
  }
  function die() {
    if (st.dead) return;
    st.hp = 0; st.dead = true; fireHeld = false;
    if (st.top > best) { best = st.top; try { localStorage.setItem('forgex-doom-orbital-best', String(best)); } catch (_) {} }
  }
  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg; e.hurt = .15;
    const cz = e.type === 'imp' ? e.z + .6 : e.z;
    burst(e.x, e.y, cz, 8, [rgb(200, 10, 10), rgb(255, 60, 30), rgb(120, 0, 0)], 1.6);
    if (e.type === 'skull' && e.state !== 'dash') { e.state = 'stun'; e.t = .5; }
    if (e.type === 'chaser') e.back = Math.max(e.back || 0, .25); // el golpe lo frena: darse la vuelta y disparar compensa
    directorNote('hit');
    if (e.hp > 0) return;
    e.dead = true; e.deadT = 0; SFX.die(volAt(e.x, e.y, e.z));
    burst(e.x, e.y, cz, 34, [rgb(200, 10, 10), rgb(255, 120, 30), rgb(255, 220, 90)], 3);
    if (e.type === 'imp' && Math.random() < .4) addItem('ammo', e.x, e.y, e.z + .4, { ammo: 'celdas', count: randi(1, 3), vz: 2 });
    if (e.type === 'caco' && Math.random() < .6) addItem('ammo', e.x, e.y, e.z, { ammo: pick(['celdas', 'cartuchos', 'nucleos']), count: randi(1, 4) });
    if (e.type === 'chaser' && Math.random() < (e.variant === 'small' ? .3 : .5)) addItem('ammo', e.x, e.y, e.z, { ammo: 'celdas', count: e.variant === 'small' ? 1 : randi(1, 3), vz: 1 });
    directorNote('kill');
  }

