  // ================= INTERFAZ =================
  const vig = mk(W, H), vg = vig.getContext('2d'), vgr = vg.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .95);
  vgr.addColorStop(0, 'rgba(0,0,0,0)'); vgr.addColorStop(1, 'rgba(2,0,8,.78)'); vg.fillStyle = vgr; vg.fillRect(0, 0, W, H);
  const SS = (w, s) => `${w} ${s}px Silkscreen, monospace`, PM = (w, s) => `${w} ${s}px "IBM Plex Mono", ui-monospace, monospace`;
  const lg = (x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  function glowText(s, x, y, c, blur = 10) { ctx.shadowColor = c; ctx.shadowBlur = blur; ctx.fillStyle = c; ctx.fillText(s, x, y); ctx.shadowBlur = 0; }
  function bar(x, y, w, h, f, col, bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(f, 0, 1), h); }

  function drawGun() {
    const w = st.weapon; if (!w) return null;
    const bob = Math.abs(Math.sin(st.bob) * 8), gx = W / 2 + Math.cos(st.bob * .5) * 6;
    const gy = H - 10 + bob + st.kick * 26 + st.land * 30 + (st.ground ? 0 : clamp(-st.vz * 2, -18, 18));
    let muzzle = gy - 180, mcol = 'rgba(120,255,240,.9)';
    if (w.w === 'plasma') {
      ctx.fillStyle = lg(gx - 70, 0, gx + 70, 0, [[0, '#1c1e2c'], [.45, '#6a7090'], [.55, '#8a90b0'], [1, '#1c1e2c']]);
      ctx.beginPath(); ctx.moveTo(gx - 72, H); ctx.lineTo(gx - 36, gy - 120); ctx.lineTo(gx + 36, gy - 120); ctx.lineTo(gx + 72, H); ctx.fill();
      ctx.fillStyle = lg(gx - 18, 0, gx + 18, 0, [[0, '#2a2d40'], [.5, '#9aa0c0'], [1, '#2a2d40']]); ctx.fillRect(gx - 18, gy - 170, 36, 64);
      ctx.fillStyle = '#0c0d16'; ctx.fillRect(gx - 8, gy - 172, 16, 10);
      const pulse = .6 + .4 * Math.sin(time * 6); ctx.shadowColor = '#5ff2e6'; ctx.shadowBlur = 18 * pulse; ctx.fillStyle = `rgba(95,242,230,${.7 + .3 * pulse})`;
      for (let k = 0; k < 3; k++) ctx.fillRect(gx - 20, gy - 150 + k * 14, 40, 4);
      ctx.shadowBlur = 0;
    } else if (w.w === 'escopeta') {
      ctx.fillStyle = lg(gx - 60, 0, gx + 60, 0, [[0, '#15161c'], [.5, '#4a4d5c'], [1, '#15161c']]);
      ctx.beginPath(); ctx.moveTo(gx - 62, H); ctx.lineTo(gx - 30, gy - 110); ctx.lineTo(gx + 30, gy - 110); ctx.lineTo(gx + 62, H); ctx.fill();
      ctx.fillStyle = '#23252e'; ctx.fillRect(gx - 22, gy - 200, 20, 100); ctx.fillRect(gx + 2, gy - 200, 20, 100);
      ctx.fillStyle = '#08080a'; ctx.beginPath(); ctx.arc(gx - 12, gy - 198, 7, 0, 7); ctx.arc(gx + 12, gy - 198, 7, 0, 7); ctx.fill();
      ctx.fillStyle = lg(0, gy - 120, 0, gy - 80, [[0, '#8a5a30'], [1, '#4a2c14']]); ctx.fillRect(gx - 30, gy - 122, 60, 36);
      muzzle = gy - 205; mcol = 'rgba(255,200,90,.95)';
    } else {
      ctx.fillStyle = lg(gx - 50, 0, gx + 50, 0, [[0, '#101220'], [.5, '#3a4060'], [1, '#101220']]);
      ctx.beginPath(); ctx.moveTo(gx - 56, H); ctx.lineTo(gx - 26, gy - 210); ctx.lineTo(gx + 26, gy - 210); ctx.lineTo(gx + 56, H); ctx.fill();
      const pulse = .6 + .4 * Math.sin(time * 4); ctx.shadowColor = '#4aa8ff'; ctx.shadowBlur = 16 * pulse; ctx.fillStyle = `rgba(74,168,255,${.6 + .4 * pulse})`;
      for (let k = 0; k < 6; k++) ctx.fillRect(gx - 30 + k * 1.5, gy - 190 + k * 22, 60 - k * 3, 5);
      ctx.shadowBlur = 0; muzzle = gy - 215; mcol = 'rgba(140,200,255,.95)';
    }
    ctx.fillStyle = lg(0, gy - 70, 0, H, [[0, '#5a4638'], [1, '#2a1f18']]);
    ctx.beginPath(); ctx.moveTo(gx - 46, H); ctx.lineTo(gx - 28, gy - 70); ctx.lineTo(gx + 28, gy - 70); ctx.lineTo(gx + 46, H); ctx.fill();
    return { gx, muzzle, mcol };
  }
  const gunC = mk(W, H), gunX = gunC.getContext('2d');
  function drawGunLit() {
    gunX.clearRect(0, 0, W, H);
    const main = ctx; ctx = gunX; const g = drawGun(); ctx = main;
    if (!g) return;
    let l = ambAt(st.px, st.py, st.pz) + (st.lamp ? .22 : 0) + st.flash * 8;
    for (const f of st.flashes) if (Math.hypot(f.x - st.px, f.y - st.py) < f.rad) l += .5 * f.life / f.max;
    const dark = clamp(1 - l, 0, .82);
    if (dark > .01) { gunX.globalCompositeOperation = 'source-atop'; gunX.fillStyle = `rgba(2,1,8,${dark})`; gunX.fillRect(0, 0, W, H); gunX.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(gunC, 0, 0);
    if (st.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const mf = ctx.createRadialGradient(g.gx, g.muzzle, 2, g.gx, g.muzzle, 70); mf.addColorStop(0, 'rgba(255,255,230,1)'); mf.addColorStop(.3, g.mcol); mf.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mf; ctx.beginPath(); ctx.arc(g.gx, g.muzzle, 70, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // grano de película
  const grainC = mk(128, 128); { const g = grainC.getContext('2d'), d = g.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) { const v = Math.random() * 255; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; } g.putImageData(d, 0, 0); }
  const grainP = ctx.createPattern(grainC, 'repeat');

  function drawHUD(dt) {
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    // --- vida, reserva, escudo ---
    ctx.fillStyle = 'rgba(8,5,18,.62)'; ctx.fillRect(10, 10, 262, 84);
    ctx.font = SS(700, 13); glowText('SALUD', 18, 24, '#ff8a8a', 6);
    bar(90, 17, 132, 13, st.hp / st.maxHp, st.hp < st.maxHp * .3 ? (time % .6 < .3 ? '#ff2a2a' : '#a01010') : '#ff4a4a', '#3a0d12');
    ctx.font = SS(700, 13); ctx.fillStyle = '#fff'; ctx.fillText(`${Math.ceil(st.hp)}`, 228, 24);
    ctx.font = SS(700, 13); glowText('RESERVA', 18, 46, st.healLock > 0 ? '#8a8a9a' : '#9dff7a', 6);
    bar(90, 41, 132, 9, st.reserve / st.reserveMax, st.healLock > 0 ? '#4a4a5a' : st.healing ? '#c8ff9a' : '#7dff4a', '#16240e');
    ctx.fillStyle = '#fff'; ctx.fillText(`${Math.ceil(st.reserve)}`, 228, 46);
    if (st.healLock > 0) { ctx.font = SS(400, 11); ctx.fillStyle = '#ff9a8a'; ctx.fillText(`CURACION BLOQUEADA ${Math.ceil(st.healLock)}s`, 18, 62); }
    else if (st.healing) { ctx.font = SS(400, 11); glowText(st.regenPend > 0 ? `CURANDO +${st.regenPend}` : `CURANDO +${regenStep(st.regenN) >= 2.1 ? 6 : 1} EN ${Math.max(0, regenStep(st.regenN) - st.regenT).toFixed(1)}s`, 18, 62, '#9dff7a', 8); }
    else if (st.regenN > 0) { ctx.font = SS(400, 11); ctx.fillStyle = '#b8c4a0'; ctx.fillText(`RITMO ${regenStep(st.regenN).toFixed(1)}s · REINICIO ${Math.ceil(REGEN_RESET - st.regenIdle)}s`, 18, 62); }
    const hasShield = st.inv.some(i => i.t === 'shield');
    ctx.font = SS(700, 13);
    if (!hasShield) { ctx.fillStyle = '#6a6488'; ctx.fillText('SIN ESCUDO', 18, 80); }
    else if (st.shieldT > 0) glowText('ESCUDO ACTIVO', 18, 80, '#ffffff', 14);
    else if (st.shieldCd > 0) { ctx.fillStyle = '#8a86a8'; ctx.fillText(`ESCUDO ${Math.ceil(st.shieldCd)}s`, 18, 80); bar(150, 76, 72, 6, 1 - st.shieldCd / st.shieldRecharge, '#2a8a90', '#122024'); }
    else glowText('ESCUDO LISTO', 18, 80, '#5ff2e6', 8 + 6 * Math.sin(time * 5));

    // --- altura ---
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,5,18,.62)'; ctx.fillRect(W - 222, 10, 212, 104);
    ctx.font = SS(700, 30); glowText(`${Math.round(st.pz * 10)} m`, W - 18, 32, '#5ff2e6', 12);
    ctx.font = SS(400, 12); ctx.fillStyle = '#c8c4e0'; ctx.fillText(`RECORD PARTIDA ${Math.round(st.top * 10)} m`, W - 18, 60);
    ctx.fillStyle = '#9690b8'; ctx.fillText(`MEJOR ${Math.round(Math.max(best, st.top) * 10)} m`, W - 18, 78);
    { const bi = bandOf(st.px, st.py), dAx = Math.hypot(st.px - C, st.py - C);
      ctx.font = SS(700, 12); ctx.fillStyle = BAND_COL[bi]; ctx.fillText(`EJE ${Math.round(dAx * 10)}/${(dAx > R_MAX ? R_EXPLORE : R_MAX) * 10} m  ${BANDS[bi][2]}`, W - 18, 98);
      if (time % 1 < .6) { ctx.font = SS(700, 13);
        if (dAx > R_EXPLORE - 12) glowText('LIMITE DE EXPLORACION', W - 18, 146, '#d59aff', 10);
        else if (dAx > R_MAX * .93 && dAx <= R_MAX) glowText('BORDE DEL MAPA', W - 18, 146, '#ff4a4a', 10); } }
    if (st.cpFlash > 0) { st.cpFlash -= dt; ctx.globalAlpha = Math.max(0, Math.min(1, st.cpFlash)); ctx.font = SS(700, 12); glowText('PUNTO SEGURO', W - 18, 126, '#9dff7a', 8); ctx.globalAlpha = 1; }

    // --- inventario ---
    ctx.textAlign = 'left';
    const sl = slotList(), sx0 = 14, sy0 = H - 74, S = 56, G = 6;
    ctx.font = SS(700, 12); ctx.fillStyle = '#c8c4e0'; ctx.fillText(`INVENTARIO ${used()}/${SLOTS}`, sx0, sy0 - 12);
    for (let i = 0; i < SLOTS; i++) { const x = sx0 + i * (S + G); ctx.fillStyle = 'rgba(8,5,18,.7)'; ctx.fillRect(x, sy0, S, S); ctx.strokeStyle = '#2d2750'; ctx.lineWidth = 2; ctx.strokeRect(x, sy0, S, S); }
    for (let i = 0; i < SLOTS; i++) {
      const it = sl[i]; if (!it || (i > 0 && sl[i - 1] === it)) continue;
      const span = sizeOf(it), x = sx0 + i * (S + G), wd = span * S + (span - 1) * G;
      if (it.t === 'weapon') {
        ctx.drawImage(ICON[it.w].cv, 0, 14, 64, 40, x + 6, sy0 + 4, wd - 12, 36);
        ctx.font = SS(700, 10); ctx.fillStyle = st.weapon === it ? '#5ff2e6' : '#c8c4e0'; ctx.fillText(WEAP[it.w].hud, x + 6, sy0 + S - 9);
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffdc50'; ctx.fillText(`${ammoOf(WEAP[it.w].ammo)}`, x + wd - 6, sy0 + S - 9); ctx.textAlign = 'left';
      } else if (it.t === 'shield') {
        ctx.globalAlpha = st.shieldCd > 0 ? .45 : 1; ctx.drawImage(ICON.shield.cv, x + 4, sy0 + 2, 48, 48); ctx.globalAlpha = 1;
      } else if (it.t === 'box') {
        ctx.drawImage(ICON['box_' + it.ammo].cv, x + 4, sy0, 48, 48);
        ctx.font = SS(700, 11); ctx.fillStyle = AMMO[it.ammo].col; ctx.fillText(`${it.count}`, x + 5, sy0 + S - 8);
        bar(x + 26, sy0 + S - 11, 24, 5, it.count / st.boxCap, AMMO[it.ammo].col, '#1a1a24');
      } else {
        ctx.drawImage(ICON[it.ammo].cv, x + 6, sy0 + 2, 44, 44);
        ctx.font = SS(700, 10); ctx.fillStyle = AMMO[it.ammo].col; ctx.fillText('1 SUELTA', x + 4, sy0 + S - 8);
      }
    }
    for (let i = 0; i < SLOTS; i++) { const x = sx0 + i * (S + G); ctx.font = SS(400, 10); ctx.fillStyle = '#6a6488'; ctx.fillText(`${i + 1}`, x + 4, sy0 + 9); }
    { const x = sx0 + st.sel * (S + G); ctx.strokeStyle = '#ffdc50'; ctx.lineWidth = 3; ctx.strokeRect(x - 1, sy0 - 1, S + 2, S + 2); }

    // --- arma en mano ---
    ctx.textAlign = 'right';
    if (st.weapon) { const Wd = WEAP[st.weapon.w], a = ammoOf(Wd.ammo);
      ctx.font = SS(700, 14); ctx.fillStyle = '#c8c4e0'; ctx.fillText(Wd.hud, W - 18, H - 58);
      ctx.font = SS(700, 30); glowText(`${a}`, W - 18, H - 30, a ? AMMO[Wd.ammo].col : '#ff5a5a', 10);
      ctx.font = SS(400, 11); ctx.fillStyle = '#9690b8'; ctx.fillText(AMMO[Wd.ammo].hud, W - 18, H - 10);
    } else { ctx.font = SS(700, 16); ctx.fillStyle = '#ff8a7a'; ctx.fillText('SIN ARMA', W - 18, H - 30); }

    // --- aviso de interacción ---
    ctx.textAlign = 'center';
    if (st.near && !st.dead) { const t = itemLabel(st.near);
      ctx.font = PM(600, 17); const tw = ctx.measureText(`[E] ${t}`).width;
      ctx.fillStyle = 'rgba(8,5,18,.75)'; ctx.fillRect(W / 2 - tw / 2 - 12, H * .62 - 16, tw + 24, 32);
      ctx.fillStyle = '#ffdc50'; ctx.fillText(`[E] ${t}`, W / 2, H * .62); }

    // --- mensajes ---
    let my = 118;
    for (const m of st.msgs) { if (started && !paused) m.t -= dt; if (m.t <= 0) continue; ctx.globalAlpha = Math.min(1, m.t); ctx.font = PM(600, 16);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(m.text).width; ctx.fillRect(W / 2 - tw / 2 - 8, my - 12, tw + 16, 24);
      ctx.fillStyle = m.col; ctx.fillText(m.text, W / 2, my); my += 28; }
    ctx.globalAlpha = 1; st.msgs = st.msgs.filter(m => m.t > 0);

    // --- nombre de la zona ---
    if (st.zoneT > 0) { st.zoneT -= dt; ctx.globalAlpha = Math.min(1, st.zoneT); ctx.font = PM(700, 22); glowText(st.zone, W / 2, H * .3, '#ffb347', 14); ctx.globalAlpha = 1; }
  }

